import { Router } from "express";
import { randomUUID, createHash } from "node:crypto";

import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { readStoreSettings } from "../storeSettings.js";
import {
  fail,
  cents,
  decimal,
  uuid,
  readLines,
  calculate,
  payment,
} from "../posRules.js";

const router = Router();

router.use(requireAuth);

router.use((req, res, next) => {
  if (!["Admin", "Manager", "Cashier"].includes(req.user.role)) {
    return res.status(403).json({
      message: "This role cannot use checkout.",
    });
  }

  req.owner = req.user.id
    ? `staff:${req.user.id}`
    : `admin:${String(req.user.email).toLowerCase()}`;

  next();
});

const json = (value) => (typeof value === "string" ? JSON.parse(value) : value);

const ORDER = `
  SELECT
    id,
    CAST(receipt_number AS CHAR) AS number,
    status,
    version,
    cashier_name AS cashierName,
    customer_name AS customerName,
    customer_phone AS customerPhone,
    subtotal,
    discount,
    total,
    payment_method AS paymentMethod,
    cash_received AS cashReceived,
    cash_paid AS cashPaid,
    card_paid AS cardPaid,
    change_due AS changeDue,
    receipt_settings AS settings,
    DATE_FORMAT(
      created_at,
      '%Y-%m-%dT%H:%i:%sZ'
    ) AS createdAt,
    DATE_FORMAT(
      completed_at,
      '%Y-%m-%dT%H:%i:%sZ'
    ) AS completedAt
  FROM sales_orders
`;

async function orderDetails(db, id, owner) {
  const [rows] = await db.execute(`${ORDER} WHERE id = ? AND owner_key = ?`, [
    id,
    owner,
  ]);

  if (!rows.length) {
    fail("Bill not found for this cashier.", 404);
  }

  const order = rows[0];

  const [items] = await db.execute(
    `
      SELECT
        product_id AS productId,
        sku,
        product_name AS name,
        category_name AS category,
        brand,
        size,
        colour,
        quantity,
        unit_price AS price,
        line_total AS lineTotal
      FROM sales_order_items
      WHERE order_id = ?
      ORDER BY line_number
    `,
    [id],
  );

  return {
    ...order,
    number: `GZ-${order.number.padStart(8, "0")}`,
    version: Number(order.version),
    settings: json(order.settings),
    items,
  };
}

function receiptSettings(value = {}) {
  const result = {};

  const fields = [
    ["store", "Gen Zi Corner", 100],
    ["address", "", 300],
    ["phone", "", 40],
    ["tagline", "", 150],
    ["footer", "Thank you for shopping with us!", 300],
  ];

  for (const [key, fallback, limit] of fields) {
    const text = value[key] ?? fallback;

    if (typeof text !== "string" || [...text].length > limit) {
      fail(`Invalid receipt ${key}.`);
    }

    result[key] = text.trim();
  }

  result.width = Number(value.width) === 58 ? 58 : 80;

  return result;
}

router.get("/bootstrap", async (req, res) => {
  const [products] = await pool.execute(`
    SELECT
      p.id,
      p.name,
      p.sku,
      p.brand,
      p.size,
      p.colour,
      p.selling_price AS price,
      p.stock,
      p.reorder_minimum AS reorderLevel,
      c.name AS category
    FROM products p
    JOIN categories c ON c.id = p.category_id
    ORDER BY p.name, p.sku
  `);

  // Minimal checkout fields only; used for prepared-device offline cash sales.
  const [customers] = await pool.execute(`
    SELECT id, name, phonenumber
    FROM customers
    WHERE phonenumber IS NOT NULL
    ORDER BY name, id
  `);

  res.json({
    actor: {
      key: req.owner,
      name: req.user.name,
    },
    products,
    customers,
  });
});

router.get("/customer", async (req, res) => {
  const phone = req.query.phone;

  if (typeof phone !== "string" || !/^\d{10}$/.test(phone)) {
    fail("Phone number must contain exactly 10 digits.");
  }

  const [rows] = await pool.execute(
    `
      SELECT id, name, phonenumber
      FROM customers
      WHERE phonenumber = ?
      LIMIT 1
    `,
    [phone],
  );

  res.json({
    customer: rows[0] || null,
  });
});

router.get("/orders", async (req, res) => {
  const status = req.query.status || "Held";

  if (!["Held", "Completed"].includes(status)) {
    fail("Invalid bill status.");
  }

  const [orders] = await pool.execute(
    `
      ${ORDER}
      WHERE owner_key = ? AND status = ?
      ORDER BY updated_at DESC
      ${status === "Completed" ? "LIMIT 30" : ""}
    `,
    [req.owner, status],
  );

  res.json({
    orders: orders.map((row) => ({
      ...row,
      settings: json(row.settings),
      number: `GZ-${row.number.padStart(8, "0")}`,
      version: Number(row.version),
    })),
  });
});

router.get("/orders/:id", async (req, res) => {
  const id = uuid(req.params.id);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `
        SELECT id
        FROM sales_orders
        WHERE id = ? AND owner_key = ?
        FOR SHARE
      `,
      [id, req.owner],
    );

    if (!rows.length) {
      fail("Bill not found for this cashier.", 404);
    }

    const order = await orderDetails(connection, id, req.owner);

    await connection.commit();

    res.json({ order });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

router.get("/requests/:key", async (req, res) => {
  const [rows] = await pool.execute(
    `
      SELECT response_json
      FROM pos_requests
      WHERE request_key = ? AND owner_key = ?
    `,
    [uuid(req.params.key), req.owner],
  );

  res.json({
    result: rows[0]?.response_json ? json(rows[0].response_json) : null,
  });
});

router.post("/orders", async (req, res, next) => {
  let connection;

  try {
    const body = req.body || {};
    const key = uuid(body.requestKey, "request ID");

    if (!["hold", "complete", "cancel"].includes(body.action)) {
      fail("Invalid bill action.");
    }

    const id = body.id ? uuid(body.id, "bill ID") : randomUUID();

    if (body.action === "cancel" && !body.id) {
      fail("Select a held bill to cancel.");
    }

    if (body.id && (!Number.isInteger(body.version) || body.version < 1)) {
      fail("Refresh the bill version.");
    }

    const digest = createHash("sha256")
      .update(JSON.stringify(body))
      .digest("hex");

    connection = await pool.getConnection();

    await connection.beginTransaction();

    // A unique request key prevents duplicate checkout writes.
    try {
      await connection.execute(
        `
          INSERT INTO pos_requests (
            request_key,
            owner_key,
            body_hash
          )
          VALUES (?, ?, ?)
        `,
        [key, req.owner, digest],
      );
    } catch (error) {
      if (error.code !== "ER_DUP_ENTRY") throw error;

      await connection.rollback();

      const [rows] = await connection.execute(
        `
          SELECT owner_key, body_hash, response_json
          FROM pos_requests
          WHERE request_key = ?
        `,
        [key],
      );

      const old = rows[0];

      if (!old || old.owner_key !== req.owner || old.body_hash !== digest) {
        fail("Request ID was already used for different details.", 409);
      }

      return res.json(json(old.response_json));
    }

    if (body.id) {
      const [rows] = await connection.execute(
        `
          SELECT owner_key, status, version
          FROM sales_orders
          WHERE id = ?
          FOR UPDATE
        `,
        [id],
      );

      const old = rows[0];

      if (!old || old.owner_key !== req.owner) {
        fail("Bill not found for this cashier.", 404);
      }

      if (old.status !== "Held") {
        fail(
          "This bill is already completed or cancelled. Refresh the bill list.",
          409,
        );
      }

      if (Number(old.version) !== body.version) {
        fail(
          "This bill changed in another session. Refresh and resume its latest version.",
          409,
        );
      }
    }

    if (body.action === "cancel") {
      await connection.execute(
        `
          UPDATE sales_orders
          SET
            status = 'Cancelled',
            version = version + 1
          WHERE id = ?
        `,
        [id],
      );
    } else {
      const items = readLines(body.items);
      const discount = cents(body.discount, "Discount");
      const phone = body.customerPhone || "";

      if (typeof phone !== "string" || (phone && !/^\d{10}$/.test(phone))) {
        fail("Customer phone must contain exactly 10 digits or be blank.");
      }

      let customer = null;

      if (phone) {
        const [rows] = await connection.execute(
          `
            SELECT id, name, phonenumber
            FROM customers
            WHERE phonenumber = ?
            FOR SHARE
          `,
          [phone],
        );

        customer = rows[0];

        if (!customer) {
          fail(
            "Customer was not found. Register the customer first, or clear the phone for a walk-in sale.",
          );
        }
      }

      // Stable lock order reduces deadlocks between cashiers.
      const locked = new Map();

      const sortedItems = [...items].sort((a, b) =>
        a.productId.localeCompare(b.productId),
      );

      for (const item of sortedItems) {
        const [rows] = await connection.execute(
          `
            SELECT *
            FROM products
            WHERE id = ?
            FOR UPDATE
          `,
          [item.productId],
        );

        const product = rows[0];

        if (!product) {
          fail(
            "A product was removed. Refresh the catalogue and remove it from this bill.",
            409,
          );
        }

        const price = cents(product.selling_price, "Product price");

        if (price !== item.expectedPrice) {
          fail(
            `Price changed for ${product.name}. Close payment and click Refresh prices & stock.`,
            409,
          );
        }

        if (
          body.action === "complete" &&
          Number(product.stock) < item.quantity
        ) {
          fail(
            `Insufficient stock for ${product.name}. Available: ${product.stock}.`,
            409,
          );
        }

        locked.set(item.productId, {
          ...product,
          priceCents: price,
        });
      }

      const totals = calculate(
        items.map((item) => ({
          price: locked.get(item.productId).priceCents,
          quantity: item.quantity,
        })),
        discount,
      );

      const paid =
        body.action === "complete"
          ? payment(totals.total, body.payment)
          : {
              method: null,
              cashReceived: 0,
              cashPaid: 0,
              cardPaid: 0,
              changeDue: 0,
            };

      const savedSettings = await readStoreSettings(connection);

      const settings = {
        ...savedSettings.settings,
        width: Number(savedSettings.settings.receiptWidth),
      };

      const status = body.action === "complete" ? "Completed" : "Held";

      const fields = [
        status,
        String(req.user.name || "").slice(0, 100),
        customer?.id || null,
        customer?.name || "",
        phone,
        decimal(totals.subtotal),
        decimal(totals.discount),
        decimal(totals.total),
        paid.method,
        decimal(paid.cashReceived),
        decimal(paid.cashPaid),
        decimal(paid.cardPaid),
        decimal(paid.changeDue),
        JSON.stringify(settings),
      ];

      if (body.id) {
        await connection.execute(
          `
            UPDATE sales_orders
            SET
              status = ?,
              cashier_name = ?,
              customer_id = ?,
              customer_name = ?,
              customer_phone = ?,
              subtotal = ?,
              discount = ?,
              total = ?,
              payment_method = ?,
              cash_received = ?,
              cash_paid = ?,
              card_paid = ?,
              change_due = ?,
              receipt_settings = ?,
              completed_at = ${
                status === "Completed" ? "UTC_TIMESTAMP()" : "NULL"
              },
              version = version + 1
            WHERE id = ?
          `,
          [...fields, id],
        );

        await connection.execute(
          "DELETE FROM sales_order_items WHERE order_id = ?",
          [id],
        );
      } else {
        await connection.execute(
          `
            INSERT INTO sales_orders (
              status,
              cashier_name,
              customer_id,
              customer_name,
              customer_phone,
              subtotal,
              discount,
              total,
              payment_method,
              cash_received,
              cash_paid,
              card_paid,
              change_due,
              receipt_settings,
              id,
              owner_key,
              completed_at
            )
            VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              ${status === "Completed" ? "UTC_TIMESTAMP()" : "NULL"}
            )
          `,
          [...fields, id, req.owner],
        );
      }

      for (const [index, item] of items.entries()) {
        const product = locked.get(item.productId);

        const [categories] = await connection.execute(
          "SELECT name FROM categories WHERE id = ?",
          [product.category_id],
        );

        await connection.execute(
          `
            INSERT INTO sales_order_items (
              order_id,
              product_id,
              line_number,
              sku,
              product_name,
              category_name,
              brand,
              size,
              colour,
              quantity,
              unit_price,
              unit_cost,
              line_total
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            id,
            item.productId,
            index + 1,
            product.sku,
            product.name,
            categories[0]?.name || "",
            product.brand || "",
            product.size || "",
            product.colour || "",
            item.quantity,
            decimal(product.priceCents),
            product.cost,
            decimal(product.priceCents * item.quantity),
          ],
        );

        if (status === "Completed") {
          const [updated] = await connection.execute(
            `
              UPDATE products
              SET stock = stock - ?
              WHERE id = ? AND stock >= ?
            `,
            [item.quantity, item.productId, item.quantity],
          );

          if (!updated.affectedRows) {
            fail("Stock changed. Refresh and retry.", 409);
          }
        }
      }
    }

    const result = {
      order: await orderDetails(connection, id, req.owner),
    };

    await connection.execute(
      `
        UPDATE pos_requests
        SET response_json = ?
        WHERE request_key = ?
      `,
      [JSON.stringify(result), key],
    );

    await connection.commit();

    res.json(result);
  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => {});
    }

    if (["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes(error.code)) {
      error.status = 409;
      error.message =
        "Another checkout is updating these records. Retry this bill.";
    }

    next(error);
  } finally {
    connection?.release();
  }
});

export default router;
