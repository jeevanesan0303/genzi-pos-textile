import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.use((req, res, next) => {
  const role = String(req.user?.role || "")
    .trim()
    .toLowerCase();

  if (!["admin", "manager"].includes(role)) {
    return res.status(403).json({
      message: "Only Admin and Manager can access business reports.",
    });
  }

  next();
});

const TABLES = [
  "sales_orders",
  "sales_order_items",
  "products",
  "categories",
  "customers",
  "suppliers",
  "purchase_orders",
  "purchase_order_items",
  "expenses",
  "Users",
];

const TYPES = [
  "sales",
  "product",
  "inventory",
  "customer",
  "supplier",
  "purchase",
  "expense",
  "employee",
];

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

// Identifiers come only from database metadata and approved candidates.
function quote(value) {
  return "`" + String(value).replace(/`/g, "``") + "`";
}

async function readSchema(db) {
  const placeholders = TABLES.map(() => "?").join(",");

  const [rows] = await db.execute(
    `
      SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (${placeholders})
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `,
    TABLES
  );

  const schema = new Map();

  for (const row of rows) {
    const key = row.TABLE_NAME.toLowerCase();

    if (!schema.has(key)) {
      schema.set(key, {
        name: row.TABLE_NAME,
        columns: new Map(),
      });
    }

    schema.get(key).columns.set(
      row.COLUMN_NAME.toLowerCase(),
      {
        name: row.COLUMN_NAME,
        type: row.DATA_TYPE.toLowerCase(),
      }
    );
  }

  return schema;
}

function table(schema, name) {
  const result = schema.get(name.toLowerCase());

  if (!result) {
    fail(
      `Report setup: table "${name}" was not found or the database user cannot read it.`,
      409
    );
  }

  return result;
}

function column(tbl, candidates, required = true) {
  for (const candidate of candidates) {
    const found = tbl.columns.get(candidate.toLowerCase());
    if (found) return found;
  }

  if (required) {
    fail(
      `Report setup: "${tbl.name}" needs one of these columns: ${candidates.join(", ")}.`,
      409
    );
  }

  return null;
}

function ref(alias, col) {
  return `${alias}.${quote(col.name)}`;
}

function field(tbl, alias, candidates, required = true) {
  const col = column(tbl, candidates, required);
  return col ? ref(alias, col) : "NULL";
}

function dateColumn(tbl, candidates, required = false) {
  const col = column(tbl, candidates, required);

  if (!col) return null;

  if (!["date", "datetime", "timestamp"].includes(col.type)) {
    fail(
      `Report setup: ${tbl.name}.${col.name} must be a DATE, DATETIME or TIMESTAMP column.`,
      409
    );
  }

  return col;
}

function dateExpression(alias, col) {
  if (!col) return "NULL";

  const format =
    col.type === "date"
      ? "%Y-%m-%d"
      : "%Y-%m-%dT%H:%i:%sZ";

  return `DATE_FORMAT(${ref(alias, col)}, '${format}')`;
}

function validDay(value, label) {
  if (value === undefined || value === "") return "";

  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < "1000-01-01" ||
    value > "9998-12-31"
  ) {
    fail(`Invalid ${label}.`);
  }

  const date = new Date(`${value}T00:00:00Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    fail(`Invalid ${label}.`);
  }

  return value;
}

function nextDay(value) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function sriLankaMidnightUTC(value) {
  return new Date(`${value}T00:00:00+05:30`)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}

function range(alias, col, from, to) {
  if (!col) return { sql: "", params: [] };

  const conditions = [];
  const params = [];
  const expression = ref(alias, col);

  if (from) {
    conditions.push(`${expression} >= ?`);
    params.push(
      col.type === "date"
        ? from
        : sriLankaMidnightUTC(from)
    );
  }

  if (to) {
    const end = nextDay(to);

    conditions.push(`${expression} < ?`);
    params.push(
      col.type === "date"
        ? end
        : sriLankaMidnightUTC(end)
    );
  }

  return {
    sql: conditions.length
      ? ` AND ${conditions.join(" AND ")}`
      : "",
    params,
  };
}

function reportColumn(key, label, type = "text") {
  return { key, label, type };
}

function dateNote(col, label) {
  return col
    ? `Date filter: ${label}. Date/time values are shown in Sri Lanka time.`
    : "Current records. This table has no matching date field, so the date filter does not restrict these rows.";
}

function salesDefinition(schema, from, to) {
  const orders = table(schema, "sales_orders");
  const items = table(schema, "sales_order_items");

  const completed = dateColumn(
    orders,
    ["completed_at"],
    true
  );

  const edited = dateColumn(orders, ["edited_at"]);
  const deleted = column(orders, ["deleted_at"], false);

  const filter = range("s", completed, from, to);

  const id = field(orders, "s", ["id"]);
  const number = field(orders, "s", ["receipt_number"]);
  const total = field(orders, "s", ["total"]);
  const status = field(orders, "s", ["status"]);

  const itemOrder = field(items, "i", ["order_id"]);
  const quantity = field(items, "i", ["quantity"]);
  const unitCost = field(items, "i", ["unit_cost"]);

  const cost = `
    (
      SELECT COALESCE(SUM(${quantity} * ${unitCost}), 0)
      FROM ${quote(items.name)} i
      WHERE ${itemOrder} = ${id}
    )
  `;

  const displayStatus = edited
    ? `CASE
         WHEN ${ref("s", edited)} IS NOT NULL THEN 'Edited'
         ELSE 'Completed'
       END`
    : "'Completed'";

  return {
    title: "Sales Report",
    note:
      "Completed sales only, using current saved bill values. Held, cancelled and deleted bills are excluded. Date filter uses the original completion date. Separate exchange credits are not included.",
    columns: [
      reportColumn("receipt", "Receipt"),
      reportColumn("date", "Sale date", "datetime"),
      reportColumn("customer", "Customer"),
      reportColumn("phone", "Phone"),
      reportColumn("cashier", "Cashier"),
      reportColumn("payment", "Payment"),
      reportColumn("status", "Status"),
      reportColumn("subtotal", "Subtotal", "money"),
      reportColumn("discount", "Discount", "money"),
      reportColumn("total", "Sales total", "money"),
      reportColumn("cost", "Sold item cost", "money"),
      reportColumn("profit", "Gross profit", "money"),
      reportColumn("editedAt", "Edited on", "datetime"),
    ],
    sql: `
      SELECT
        ${id} AS id,

        CONCAT(
          'GZ-',
          LPAD(
            CAST(${number} AS CHAR),
            GREATEST(8, CHAR_LENGTH(CAST(${number} AS CHAR))),
            '0'
          )
        ) AS receipt,

        ${dateExpression("s", completed)} AS date,

        COALESCE(
          NULLIF(${field(orders, "s", ["customer_name"])}, ''),
          'Walk-in customer'
        ) AS customer,

        ${field(orders, "s", ["customer_phone"])} AS phone,
        ${field(orders, "s", ["cashier_name"])} AS cashier,
        ${field(orders, "s", ["payment_method"])} AS payment,
        ${displayStatus} AS status,

        ${field(orders, "s", ["subtotal"])} AS subtotal,
        ${field(orders, "s", ["discount"])} AS discount,
        ${total} AS total,
        ${cost} AS cost,
        (${total} - ${cost}) AS profit,

        ${dateExpression("s", edited)} AS editedAt

      FROM ${quote(orders.name)} s

      WHERE LOWER(${status}) = 'completed'
        AND ${ref("s", completed)} IS NOT NULL
        ${deleted ? `AND ${ref("s", deleted)} IS NULL` : ""}
        ${filter.sql}
    `,
    params: filter.params,
    order: "date DESC, receipt DESC",
  };
}

function expenseDefinition(schema, from, to) {
  const expenses = table(schema, "expenses");

  const date = dateColumn(
    expenses,
    ["expense_date", "date"],
    true
  );

  const filter = range("e", date, from, to);

  return {
    title: "Expense Report",
    note: dateNote(date, "expense date"),
    columns: [
      reportColumn("description", "Description"),
      reportColumn("date", "Expense date", date.type),
      reportColumn("category", "Category"),
      reportColumn("amount", "Amount", "money"),
    ],
    sql: `
      SELECT
        ${field(expenses, "e", ["id"])} AS id,

        ${field(
          expenses,
          "e",
          ["name", "description", "title", "expense_name"]
        )} AS description,

        ${dateExpression("e", date)} AS date,

        ${field(
          expenses,
          "e",
          ["category", "expense_category"],
          false
        )} AS category,

        ${field(expenses, "e", ["amount"])} AS amount

      FROM ${quote(expenses.name)} e
      WHERE 1 = 1 ${filter.sql}
    `,
    params: filter.params,
    order: "date DESC, id",
  };
}

function productDefinition(schema, from, to, inventory = false) {
  const products = table(schema, "products");
  const categories = table(schema, "categories");

  const created = inventory
    ? null
    : dateColumn(products, ["created_at", "created_date"]);

  const filter = range("p", created, from, to);

  const stock = field(products, "p", ["stock"]);
  const cost = field(products, "p", ["cost", "cost_price"]);
  const reorder = field(
    products,
    "p",
    ["reorder_minimum", "reorder_level", "reorderLevel"]
  );

  const common = [
    reportColumn("name", "Product"),
    reportColumn("sku", "SKU"),
    reportColumn("category", "Category"),
    reportColumn("brand", "Brand"),
    reportColumn("size", "Size"),
    reportColumn("colour", "Colour"),
  ];

  return {
    title: inventory ? "Inventory & Stock Report" : "Product Report",

    note: inventory
      ? "Current stock snapshot. The date filter does not reconstruct historical stock. Low stock means available quantity is less than or equal to the reorder minimum."
      : dateNote(created, "product creation date"),

    columns: inventory
      ? [
          ...common,
          reportColumn("stock", "Available", "number"),
          reportColumn("reorder", "Reorder minimum", "number"),
          reportColumn("cost", "Unit cost", "money"),
          reportColumn("stockValue", "Stock cost value", "money"),
          reportColumn("stockStatus", "Stock status"),
        ]
      : [
          ...common,
          reportColumn("price", "Selling price", "money"),
          reportColumn("cost", "Cost", "money"),
          reportColumn("stock", "Available", "number"),
          reportColumn("createdAt", "Created on", "datetime"),
        ],

    sql: `
      SELECT
        ${field(products, "p", ["id"])} AS id,
        ${field(products, "p", ["name"])} AS name,
        ${field(products, "p", ["sku"])} AS sku,

        ${field(categories, "c", ["name"])} AS category,

        ${field(products, "p", ["brand"], false)} AS brand,
        ${field(products, "p", ["size"], false)} AS size,
        ${field(products, "p", ["colour", "color"], false)} AS colour,

        ${field(
          products,
          "p",
          ["selling_price", "price"]
        )} AS price,

        ${cost} AS cost,
        ${stock} AS stock,
        ${reorder} AS reorder,
        (${stock} * ${cost}) AS stockValue,

        CASE
          WHEN ${stock} <= 0 THEN 'Out of stock'
          WHEN ${stock} <= ${reorder} THEN 'Low stock'
          ELSE 'In stock'
        END AS stockStatus,

        ${dateExpression("p", created)} AS createdAt

      FROM ${quote(products.name)} p

      LEFT JOIN ${quote(categories.name)} c
        ON ${field(categories, "c", ["id"])}
         = ${field(products, "p", ["category_id"])}

      WHERE 1 = 1 ${filter.sql}
    `,
    params: filter.params,
    order: "name, sku",
  };
}

function customerDefinition(schema, from, to) {
  const customers = table(schema, "customers");

  const created = dateColumn(
    customers,
    ["created_at", "created_date", "registered_at"]
  );

  const filter = range("c", created, from, to);

  return {
    title: "Customer Report",
    note: dateNote(created, "customer registration date"),
    columns: [
      reportColumn("name", "Customer"),
      reportColumn("phone", "Phone number"),
      reportColumn("createdAt", "Registered on", "datetime"),
    ],
    sql: `
      SELECT
        ${field(customers, "c", ["id"])} AS id,
        ${field(customers, "c", ["name"])} AS name,

        ${field(
          customers,
          "c",
          ["phonenumber", "phone_number", "phone"]
        )} AS phone,

        ${dateExpression("c", created)} AS createdAt

      FROM ${quote(customers.name)} c
      WHERE 1 = 1 ${filter.sql}
    `,
    params: filter.params,
    order: "name, id",
  };
}

function supplierDefinition(schema, from, to) {
  const suppliers = table(schema, "suppliers");

  const created = dateColumn(
    suppliers,
    ["created_at", "created_date"]
  );

  const filter = range("s", created, from, to);

  return {
    title: "Supplier Report",
    note: dateNote(created, "supplier creation date"),
    columns: [
      reportColumn("name", "Supplier"),
      reportColumn("company", "Company"),
      reportColumn("phone", "Phone"),
      reportColumn("email", "Email"),
      reportColumn("address", "Address"),
      reportColumn("createdAt", "Created on", "datetime"),
    ],
    sql: `
      SELECT
        ${field(suppliers, "s", ["id"])} AS id,

        ${field(
          suppliers,
          "s",
          ["name", "supplier_name", "suppliername"]
        )} AS name,

        ${field(
          suppliers,
          "s",
          ["company_name", "companyname", "company"]
        )} AS company,

        ${field(
          suppliers,
          "s",
          ["phone", "phone_number", "phonenumber"]
        )} AS phone,

        ${field(suppliers, "s", ["email"], false)} AS email,
        ${field(suppliers, "s", ["address"], false)} AS address,
        ${dateExpression("s", created)} AS createdAt

      FROM ${quote(suppliers.name)} s
      WHERE 1 = 1 ${filter.sql}
    `,
    params: filter.params,
    order: "company, name",
  };
}

function purchaseDefinition(schema, from, to) {
  const orders = table(schema, "purchase_orders");
  const items = table(schema, "purchase_order_items");
  const suppliers = table(schema, "suppliers");

  const date = dateColumn(
    orders,
    ["purchase_date", "order_date", "date", "created_at"],
    true
  );

  const filter = range("p", date, from, to);

  const quantity = field(items, "i", ["quantity", "qty"]);
  const cost = field(items, "i", ["unit_cost", "cost", "cost_price"]);

  const categoryName = column(
    items,
    ["category_name", "category"],
    false
  );

  const categoryId = column(items, ["category_id"], false);

  let category = "NULL";
  let categoryJoin = "";

  if (categoryName) {
    category = ref("i", categoryName);
  } else if (categoryId) {
    const categories = table(schema, "categories");

    category = field(categories, "c", ["name"]);

    categoryJoin = `
      LEFT JOIN ${quote(categories.name)} c
        ON ${field(categories, "c", ["id"])}
         = ${ref("i", categoryId)}
    `;
  }

  return {
    title: "Purchase Report",
    note:
      `${dateNote(date, date.name)} One row represents one product line. Line totals are quantity × unit cost.`,
    columns: [
      reportColumn("purchaseId", "Purchase ID"),
      reportColumn("date", "Purchase date", date.type),
      reportColumn("company", "Supplier company"),
      reportColumn("category", "Category"),
      reportColumn("product", "Product"),
      reportColumn("brand", "Brand"),
      reportColumn("quantity", "Quantity", "number"),
      reportColumn("cost", "Unit cost", "money"),
      reportColumn("lineTotal", "Line total", "money"),
    ],
    sql: `
      SELECT
        ${field(items, "i", ["id"])} AS id,
        ${field(orders, "p", ["id"])} AS purchaseId,
        ${dateExpression("p", date)} AS date,

        ${field(
          suppliers,
          "s",
          ["company_name", "companyname", "company"]
        )} AS company,

        ${category} AS category,

        ${field(
          items,
          "i",
          ["product_name", "product", "name"]
        )} AS product,

        ${field(items, "i", ["brand"], false)} AS brand,
        ${quantity} AS quantity,
        ${cost} AS cost,
        (${quantity} * ${cost}) AS lineTotal

      FROM ${quote(orders.name)} p

      JOIN ${quote(items.name)} i
        ON ${field(items, "i", ["purchase_id"])}
         = ${field(orders, "p", ["id"])}

      LEFT JOIN ${quote(suppliers.name)} s
        ON ${field(suppliers, "s", ["id"])}
         = ${field(orders, "p", ["supplier_id"])}

      ${categoryJoin}

      WHERE 1 = 1 ${filter.sql}
    `,
    params: filter.params,
    order: "date DESC, purchaseId, id",
  };
}

function employeeDefinition(schema, from, to) {
  const users = table(schema, "Users");

  const joining = dateColumn(
    users,
    ["joining_date"],
    true
  );

  const dob = dateColumn(users, ["dob"]);
  const filter = range("u", joining, from, to);

  return {
    title: "Employee Report",
    note:
      "Date filter uses joining date. Salary is the current monthly salary, not salary paid during the selected period.",
    columns: [
      reportColumn("staffId", "Staff ID"),
      reportColumn("name", "Staff name"),
      reportColumn("phone", "Phone"),
      reportColumn("email", "Email"),
      reportColumn("userType", "User type"),
      reportColumn("role", "Role"),
      reportColumn("gender", "Gender"),
      reportColumn("dob", "Date of birth", "date"),
      reportColumn("joiningDate", "Joining date", "date"),
      reportColumn("salary", "Monthly salary", "money"),
      reportColumn("address", "Address"),
    ],
    sql: `
      SELECT
        ${field(users, "u", ["id"])} AS id,
        ${field(users, "u", ["staff_id"])} AS staffId,
        ${field(users, "u", ["staffname"])} AS name,
        ${field(users, "u", ["phone_number"])} AS phone,
        ${field(users, "u", ["email"], false)} AS email,
        ${field(users, "u", ["usertype"])} AS userType,
        ${field(users, "u", ["role"])} AS role,
        ${field(users, "u", ["gender"], false)} AS gender,
        ${dateExpression("u", dob)} AS dob,
        ${dateExpression("u", joining)} AS joiningDate,
        ${field(users, "u", ["salary"])} AS salary,
        ${field(users, "u", ["address"], false)} AS address

      FROM ${quote(users.name)} u
      WHERE 1 = 1 ${filter.sql}
    `,
    params: filter.params,
    order: "joiningDate DESC, staffId",
  };
}

function definition(schema, type, from, to) {
  switch (type) {
    case "sales":
      return salesDefinition(schema, from, to);
    case "product":
      return productDefinition(schema, from, to);
    case "inventory":
      return productDefinition(schema, from, to, true);
    case "customer":
      return customerDefinition(schema, from, to);
    case "supplier":
      return supplierDefinition(schema, from, to);
    case "purchase":
      return purchaseDefinition(schema, from, to);
    case "expense":
      return expenseDefinition(schema, from, to);
    case "employee":
      return employeeDefinition(schema, from, to);
    default:
      fail("Unknown report.");
  }
}

async function summary(db, schema, from, to) {
  const sales = salesDefinition(schema, from, to);
  const expenses = expenseDefinition(schema, from, to);

  const [salesRows] = await db.execute(
    `
      SELECT
        COALESCE(SUM(r.total), 0) AS revenue,
        COALESCE(SUM(r.cost), 0) AS soldCost,
        COALESCE(SUM(r.profit), 0) AS grossProfit
      FROM (${sales.sql}) r
    `,
    sales.params
  );

  const [expenseRows] = await db.execute(
    `
      SELECT COALESCE(SUM(r.amount), 0) AS expenses
      FROM (${expenses.sql}) r
    `,
    expenses.params
  );

  return {
    ...salesRows[0],
    expenses: expenseRows[0].expenses,
  };
}

router.get("/:type", async (req, res) => {
  let db;

  try {
    const type = req.params.type;

    if (!TYPES.includes(type)) fail("Unknown report.", 404);

    const from = validDay(req.query.from, "From date");
    const to = validDay(req.query.to, "To date");

    if (from && to && from > to) {
      fail("From date cannot be after To date.");
    }

    db = await pool.getConnection();

    // Keep timestamp serialization consistent.
    await db.query("SET time_zone = '+00:00'");
    await db.query(
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"
    );
    await db.query("START TRANSACTION READ ONLY");

    const schema = await readSchema(db);
    const report = definition(schema, type, from, to);

    const [rows] = await db.execute(
      `${report.sql} ORDER BY ${report.order}`,
      report.params
    );

    // A missing optional summary configuration should not hide
    // another otherwise-valid report.
    let totals = null;
    let summaryMessage = "";

    try {
      totals = await summary(db, schema, from, to);
    } catch (error) {
      if (error.status !== 409) throw error;
      summaryMessage = error.message;
    }

    await db.commit();

    res.json({
      type,
      title: report.title,
      note: report.note,
      columns: report.columns,
      rows,
      summary: totals,
      summaryMessage,
      from,
      to,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (db) await db.rollback().catch(() => {});

    if ([400, 403, 404, 409].includes(error.status)) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    console.error("Reports API error:", {
      code: error.code || error.name,
      message: error.sqlMessage || error.message,
    });

    res.status(500).json({
      message:
        "Unable to load this report. Check the backend terminal for the database error.",
    });
  } finally {
    db?.release();
  }
});

export default router;

export {
  readSchema,
  salesDefinition,
  productDefinition,
  purchaseDefinition,
  table,
  column,
  quote,
};