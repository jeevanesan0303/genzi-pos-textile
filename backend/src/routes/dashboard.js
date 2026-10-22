import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

import {
  readSchema,
  salesDefinition,
  productDefinition,
  purchaseDefinition,
  table,
  column,
  quote,
} from "./reports.js";

const router = Router();

router.use(requireAuth);

router.use((req, res, next) => {
  const role = String(req.user?.role || "")
    .trim()
    .toLowerCase();

  if (!["admin", "manager"].includes(role)) {
    return res.status(403).json({
      message: "Only Admin and Manager can access the business dashboard.",
    });
  }

  next();
});

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function sriLankaDay() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const part = (type) =>
    parts.find((item) => item.type === type)?.value || "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDays(day, amount) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function selectedRange(period = "month") {
  if (!["month", "week"].includes(period)) {
    fail("Choose This month or Last 7 days.");
  }

  const to = sriLankaDay();

  const from =
    period === "month"
      ? `${to.slice(0, 7)}-01`
      : addDays(to, -6);

  return { period, from, to };
}

function csvCell(value) {
  let text = String(value ?? "");

  if (
    typeof value === "string" &&
    (/^\s*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text))
  ) {
    text = "'" + text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function readableDate(value) {
  if (!value) return "";

  return new Date(value).toLocaleString("en-GB", {
    timeZone: "Asia/Colombo",
  });
}

async function withSnapshot(work) {
  const db = await pool.getConnection();

  try {
    await db.query("SET time_zone = '+00:00'");
    await db.query(
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"
    );
    await db.query("START TRANSACTION READ ONLY");

    const result = await work(db);

    await db.commit();
    return result;
  } catch (error) {
    await db.rollback().catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}

async function loadDashboard(db, period, user) {
  const selected = selectedRange(period);
  const schema = await readSchema(db);

  const sales = salesDefinition(
    schema,
    selected.from,
    selected.to
  );

  const allSales = salesDefinition(schema, "", "");

  const inventory = productDefinition(
    schema,
    "",
    "",
    true
  );

  const purchasesDefinition = purchaseDefinition(
    schema,
    "",
    ""
  );

  // Selected-period totals.
  const [salesTotals] = await db.execute(
    `
      SELECT
        COUNT(*) AS totalOrders,
        COALESCE(SUM(s.total), 0) AS totalSales
      FROM (${sales.sql}) s
    `,
    sales.params
  );

  // Current totals.
  const [customerTotals] = await db.execute(
    "SELECT COUNT(*) AS totalCustomers FROM customers"
  );

  const [stockTotals] = await db.execute(
    `
      SELECT
        COUNT(*) AS totalProducts,

        COALESCE(
          SUM(CASE WHEN p.stock <= 0 THEN 1 ELSE 0 END),
          0
        ) AS outOfStock,

        COALESCE(
          SUM(
            CASE
              WHEN p.stock > 0 AND p.stock <= p.reorder
              THEN 1 ELSE 0
            END
          ),
          0
        ) AS lowStock,

        COALESCE(
          SUM(
            CASE
              WHEN p.stock > 0 AND p.stock > p.reorder
              THEN 1 ELSE 0
            END
          ),
          0
        ) AS goodStock

      FROM (${inventory.sql}) p
    `,
    inventory.params
  );

  // Group dates in Sri Lankan time.
  const [dailyRows] = await db.execute(
    `
      SELECT
        DATE_FORMAT(
          CONVERT_TZ(
            o.completed_at,
            '+00:00',
            '+05:30'
          ),
          '%Y-%m-%d'
        ) AS day,

        COUNT(*) AS orders,
        COALESCE(SUM(s.total), 0) AS value

      FROM (${sales.sql}) s
      JOIN sales_orders o ON o.id = s.id

      GROUP BY day
      ORDER BY day
    `,
    sales.params
  );

  const dailyMap = new Map(
    dailyRows.map((row) => [
      row.day,
      {
        value: row.value,
        orders: Number(row.orders),
      },
    ])
  );

  const days = [];

  for (
    let day = selected.from;
    day <= selected.to;
    day = addDays(day, 1)
  ) {
    days.push({
      date: day,
      value: dailyMap.get(day)?.value || "0.00",
      orders: dailyMap.get(day)?.orders || 0,
    });
  }

  // Allocate bill discounts proportionally to product lines.
  // Existing item names/category values are sale snapshots.
  const revenueExpression = `
    CASE
      WHEN s.subtotal > 0
      THEN i.line_total * s.total / s.subtotal
      ELSE 0
    END
  `;

  const [categorySales] = await db.execute(
    `
      SELECT
        COALESCE(NULLIF(i.category_name, ''), 'Other') AS name,
        SUM(${revenueExpression}) AS revenue

      FROM (${sales.sql}) s
      JOIN sales_order_items i ON i.order_id = s.id

      GROUP BY COALESCE(NULLIF(i.category_name, ''), 'Other')
      HAVING revenue > 0
      ORDER BY revenue DESC, name
    `,
    sales.params
  );

  const [bestProducts] = await db.execute(
    `
      SELECT
        i.product_id AS id,
        COALESCE(MAX(p.name), MAX(i.product_name)) AS name,
        COALESCE(MAX(p.size), MAX(i.size)) AS size,
        COALESCE(MAX(p.colour), MAX(i.colour)) AS colour,
        SUM(i.quantity) AS sold,
        SUM(${revenueExpression}) AS revenue

      FROM (${sales.sql}) s
      JOIN sales_order_items i ON i.order_id = s.id
      LEFT JOIN products p ON p.id = i.product_id

      GROUP BY i.product_id
      ORDER BY sold DESC, revenue DESC, id
      LIMIT 5
    `,
    sales.params
  );

  // Most recent active completed bills, across all dates.
  const [recentSales] = await db.execute(
    `
      SELECT
        s.id,
        s.receipt AS number,
        s.date,
        s.customer,
        s.payment,
        s.status,
        s.total,

        (
          SELECT COALESCE(SUM(i.quantity), 0)
          FROM sales_order_items i
          WHERE i.order_id = s.id
        ) AS units

      FROM (${allSales.sql}) s
      ORDER BY s.date DESC, s.receipt DESC
      LIMIT 6
    `,
    allSales.params
  );

  const [lowStockProducts] = await db.execute(
    `
      SELECT
        p.id,
        p.name,
        p.sku,
        p.stock,
        p.reorder AS reorderLevel

      FROM (${inventory.sql}) p

      WHERE p.stock <= 0 OR p.stock <= p.reorder

      ORDER BY
        CASE WHEN p.stock <= 0 THEN 0 ELSE 1 END,
        p.stock,
        p.name,
        p.id

      LIMIT 5
    `,
    inventory.params
  );

  // Purchase status is shown only if the table records one.
  const purchaseTable = table(schema, "purchase_orders");

  const statusColumn = column(
    purchaseTable,
    ["status"],
    false
  );

  const purchaseStatus = statusColumn
    ? `COALESCE(
         NULLIF(CAST(h.${quote(statusColumn.name)} AS CHAR), ''),
         'Recorded'
       )`
    : "'Recorded'";

  const [latestPurchases] = await db.execute(
    `
      SELECT
        q.purchaseId AS id,
        MAX(q.company) AS supplier,
        MAX(q.date) AS date,
        SUM(q.quantity) AS quantity,
        SUM(q.lineTotal) AS total,
        ${purchaseStatus} AS status

      FROM (${purchasesDefinition.sql}) q

      JOIN ${quote(purchaseTable.name)} h
        ON h.id = q.purchaseId

      GROUP BY q.purchaseId, ${purchaseStatus}

      ORDER BY date DESC, id DESC
      LIMIT 5
    `,
    purchasesDefinition.params
  );

  const activities = [
    ...recentSales.map((sale) => ({
      id: `sale-${sale.id}`,
      date: sale.date,
      text: `Sale ${sale.number}`,
      amount: sale.total,
      detail: sale.payment,
    })),

    ...latestPurchases.map((purchase) => ({
      id: `purchase-${purchase.id}`,
      date: purchase.date,
      text: `Purchase · ${purchase.supplier || "Supplier"}`,
      amount: purchase.total,
      detail: `${purchase.quantity} units · ${purchase.status}`,
    })),
  ];

  // Add persisted edit/delete history when the audit table exists.
  const [auditTables] = await db.execute(
    `
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'sales_order_audit'
    `
  );

  if (auditTables.length) {
    const [auditRows] = await db.execute(`
      SELECT
        CAST(a.id AS CHAR) AS id,
        a.action,
        a.actor_name AS actor,
        a.reason,

        CONCAT(
          'GZ-',
          LPAD(
            CAST(s.receipt_number AS CHAR),
            GREATEST(
              8,
              CHAR_LENGTH(CAST(s.receipt_number AS CHAR))
            ),
            '0'
          )
        ) AS number,

        DATE_FORMAT(
          a.occurred_at,
          '%Y-%m-%dT%H:%i:%sZ'
        ) AS date

      FROM sales_order_audit a
      JOIN sales_orders s ON s.id = a.order_id
      ORDER BY a.occurred_at DESC, a.id DESC
      LIMIT 5
    `);

    activities.push(
      ...auditRows.map((row) => ({
        id: `audit-${row.id}`,
        date: row.date,
        text: `${row.action} bill ${row.number}`,
        amount: null,
        detail: `${row.actor} · ${row.reason}`,
      }))
    );
  }

  activities.sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );

  return {
    period: selected.period,
    from: selected.from,
    to: selected.to,

    actorName: String(user.name || "Admin"),

    totals: {
      totalSales: salesTotals[0].totalSales,
      totalOrders: Number(salesTotals[0].totalOrders),
      totalCustomers: Number(customerTotals[0].totalCustomers),
      totalProducts: Number(stockTotals[0].totalProducts),
    },

    stock: {
      good: Number(stockTotals[0].goodStock),
      low: Number(stockTotals[0].lowStock),
      out: Number(stockTotals[0].outOfStock),
    },

    days,
    categorySales,

    bestProducts: bestProducts.map((product) => ({
      ...product,
      sold: Number(product.sold),
    })),

    recentSales: recentSales.map((sale) => ({
      ...sale,
      units: Number(sale.units),
    })),

    lowStockProducts: lowStockProducts.map((product) => ({
      ...product,
      stock: Number(product.stock),
      reorderLevel: Number(product.reorderLevel),
    })),

    latestPurchases: latestPurchases.map((purchase) => ({
      ...purchase,
      quantity: Number(purchase.quantity),
    })),

    activities: activities.slice(0, 5),

    generatedAt: new Date().toISOString(),
  };
}

router.get("/", async (req, res, next) => {
  try {
    const result = await withSnapshot((db) =>
      loadDashboard(
        db,
        req.query.period || "month",
        req.user
      )
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Export all active completed sales in the selected dashboard period.
router.get("/sales.csv", async (req, res, next) => {
  try {
    const selected = selectedRange(
      req.query.period || "month"
    );

    const rows = await withSnapshot(async (db) => {
      const schema = await readSchema(db);

      const sales = salesDefinition(
        schema,
        selected.from,
        selected.to
      );

      const [result] = await db.execute(
        `${sales.sql} ORDER BY date DESC, receipt DESC`,
        sales.params
      );

      return result;
    });

    const headers = [
      "Receipt",
      "Date (Sri Lanka)",
      "Customer",
      "Phone",
      "Cashier",
      "Payment",
      "Status",
      "Subtotal LKR",
      "Discount LKR",
      "Total LKR",
    ];

    const csvRows = rows.map((sale) => [
      sale.receipt,
      readableDate(sale.date),
      sale.customer,
      sale.phone,
      sale.cashier,
      sale.payment,
      sale.status,
      sale.subtotal,
      sale.discount,
      sale.total,
    ]);

    const content = [headers, ...csvRows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");

    res.setHeader(
      "Content-Type",
      "text/csv; charset=utf-8"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="genzi-sales-${selected.from}-to-${selected.to}.csv"`
    );

    res.send("\uFEFF" + content);
  } catch (error) {
    next(error);
  }
});

router.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  if ([400, 403, 404, 409].includes(error.status)) {
    return res.status(error.status).json({
      message: error.message,
    });
  }

  console.error("Dashboard API error:", {
    code: error.code || error.name,
    message: error.sqlMessage || error.message,
  });

  res.status(500).json({
    message:
      "Unable to load the dashboard. Check the backend terminal for the database error.",
  });
});

export default router;