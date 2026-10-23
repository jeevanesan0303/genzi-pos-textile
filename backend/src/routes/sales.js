import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import {
  fail,
  uuid,
  cents,
  decimal,
  calculate,
  payment,
} from "../posRules.js";

const router = Router();

router.use(requireAuth);
router.use(requirePermission("sales", "view"));

router.use((req, res, next) => {
  const role = String(req.user?.role || "").trim().toLowerCase();

  req.salesActor = {
  role,
  key: req.user.id
    ? `staff:${req.user.id}`
    : `admin:${String(req.user.email).toLowerCase()}`,
  name: String(req.user.name || "Staff").slice(0, 100),

  // Module access is already checked by requirePermission("sales", "view").
  canEdit: true,
  canDelete: true,
};

  next();
});

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const decodeJSON = (value) =>
  typeof value === "string" ? JSON.parse(value) : value;

const SELECT_ORDER = `
  SELECT
    id,
    owner_key AS ownerKey,
    CAST(receipt_number AS CHAR) AS receiptNumber,
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
    edited_by AS editedBy,
    deleted_by AS deletedBy,
    edit_reason AS editReason,
    DATE_FORMAT(
      completed_at, '%Y-%m-%dT%H:%i:%sZ'
    ) AS completedAt,
    DATE_FORMAT(
      edited_at, '%Y-%m-%dT%H:%i:%sZ'
    ) AS editedAt,
    DATE_FORMAT(
      deleted_at, '%Y-%m-%dT%H:%i:%sZ'
    ) AS deletedAt
  FROM sales_orders
`;

function formatOrder(row) {
  return {
    ...row,
    number: `GZ-${row.receiptNumber.padStart(8, "0")}`,
    version: Number(row.version),
    settings: decodeJSON(row.settings) || {},
    displayStatus: row.deletedAt
      ? "Deleted"
      : row.editedAt
        ? "Edited"
        : row.status,
  };
}

function checkAccess(order, actor) {
  // Access is already verified by requirePermission("sales", "view").
  // Any authorized staff member may view this receipt.
}

async function details(db, id) {
  const [orders] = await db.execute(
    `${SELECT_ORDER} WHERE id = ?`,
    [id]
  );

  if (!orders.length) fail("Bill not found.", 404);

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
        unit_cost AS cost,
        line_total AS lineTotal
      FROM sales_order_items
      WHERE order_id = ?
      ORDER BY line_number
    `,
    [id]
  );

  return {
    ...formatOrder(orders[0]),
    items: items.map((item) => ({
      ...item,
      quantity: Number(item.quantity),
    })),
  };
}

function readReason(value) {
  if (typeof value !== "string") {
    fail("Enter a reason for this change.");
  }

  const reason = value.trim();

  if (reason.length < 3 || [...reason].length > 500) {
    fail("Reason must contain 3 to 500 characters.");
  }

  return reason;
}

function readItems(value) {
  if (!Array.isArray(value) || !value.length || value.length > 100) {
    fail("A bill must contain 1 to 100 different products.");
  }

  const seen = new Set();

  return value.map((item) => {
    const productId = uuid(item?.productId, "product ID");

    if (seen.has(productId)) {
      fail("The same product cannot appear twice.");
    }

    seen.add(productId);

    if (
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 1000000
    ) {
      fail("Quantity must be a whole number from 1 to 1,000,000.");
    }

    return {
      productId,
      quantity: item.quantity,
      price: cents(item.price, "Unit price"),
    };
  });
}

async function audit(db, req, action, reason, before, after) {
  await db.execute(
    `
      INSERT INTO sales_order_audit (
        order_id,
        action,
        actor_key,
        actor_name,
        reason,
        before_json,
        after_json,
        occurred_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
    `,
    [
      before.id,
      action,
      req.salesActor.key,
      req.salesActor.name,
      reason,
      JSON.stringify(before),
      JSON.stringify(after),
    ]
  );
}

async function transaction(work) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

async function lockOrder(db, id, version) {
  if (!Number.isInteger(version) || version < 1) {
    fail("Refresh the bill before changing it.");
  }

  const [rows] = await db.execute(
    `
      SELECT id, status, version, deleted_at
      FROM sales_orders
      WHERE id = ?
      FOR UPDATE
    `,
    [id]
  );

  const row = rows[0];

  if (!row) fail("Bill not found.", 404);

  if (row.deleted_at || row.status !== "Completed") {
    fail("Only completed, non-deleted bills can be changed.", 409);
  }

  if (Number(row.version) !== version) {
    fail(
      "This bill changed in another session. Close the editor, refresh and open it again.",
      409
    );
  }
}

async function lockProducts(db, ids) {
  const products = new Map();

  for (const id of [...new Set(ids)].sort()) {
    const [rows] = await db.execute(
      "SELECT * FROM products WHERE id = ? FOR UPDATE",
      [id]
    );

    if (!rows.length) {
      fail(
        "A product on this bill no longer exists. Restore its catalogue record before changing the bill.",
        409
      );
    }

    products.set(id, rows[0]);
  }

  return products;
}

// Admin/Manager: all completed sales, including deleted bills.
// Cashier: their own completed sales.
// All staff granted Sales & Exchanges access can view all bills.
router.get(
  "/",
  asyncRoute(async (req, res) => {
    const [rows] = await pool.execute(
      `
        ${SELECT_ORDER}
        WHERE completed_at IS NOT NULL
        ORDER BY completed_at DESC, receipt_number DESC
      `
    );

    res.json({
      sales: rows.map(formatOrder),
      permissions: {
        canEdit: req.salesActor.canEdit,
        canDelete: req.salesActor.canDelete,
      },
    });
  })
);

router.get(
  "/products",
  asyncRoute(async (req, res) => {
    if (!req.salesActor.canEdit) {
      fail("You cannot edit sales.", 403);
    }

    const [products] = await pool.execute(`
      SELECT
        id, name, sku, size, colour,
        selling_price AS price,
        stock
      FROM products
      ORDER BY name, sku
    `);

    res.json({ products });
  })
);

router.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const id = uuid(req.params.id);

    const order = await transaction(async (db) => {
      const [rows] = await db.execute(
        "SELECT id FROM sales_orders WHERE id = ? FOR SHARE",
        [id]
      );

      if (!rows.length) fail("Bill not found.", 404);

      const result = await details(db, id);
      checkAccess(result, req.salesActor);
      return result;
    });

    res.json({ order });
  })
);

router.put(
  "/:id",
  asyncRoute(async (req, res) => {
    if (!req.salesActor.canEdit) {
  fail("You do not have permission to edit bills.", 403);
}

    const id = uuid(req.params.id);
    const body = req.body || {};
    const reason = readReason(body.reason);
    const items = readItems(body.items);
    const discount = cents(body.discount, "Discount");

    const totals = calculate(items, discount);
    const paid = payment(totals.total, body.payment);

    const phone = body.customerPhone || "";

    if (
      typeof phone !== "string" ||
      (phone && !/^0[2-9]\d{8}$/.test(phone))
    ) {
      fail("Enter a valid 10-digit Sri Lankan customer phone number.");
    }

    const order = await transaction(async (db) => {
      await lockOrder(db, id, body.version);

      const before = await details(db, id);

      let customer = null;

      if (phone) {
        const [customers] = await db.execute(
          `
            SELECT id, name
            FROM customers
            WHERE phonenumber = ?
            FOR SHARE
          `,
          [phone]
        );

        if (customers.length !== 1) {
          fail(
            "Customer phone must match exactly one registered customer."
          );
        }

        customer = customers[0];
      }

      const oldItems = new Map(
        before.items.map((item) => [item.productId, item])
      );

      const newItems = new Map(
        items.map((item) => [item.productId, item])
      );

      const products = await lockProducts(db, [
        ...oldItems.keys(),
        ...newItems.keys(),
      ]);

      // Reverse the old sold quantity and apply the new quantity.
      // Example: old 2, new 5 => reduce available stock by 3.
      for (const [productId, product] of products) {
        const oldQuantity = oldItems.get(productId)?.quantity || 0;
        const newQuantity = newItems.get(productId)?.quantity || 0;

        const stock =
          Number(product.stock) + oldQuantity - newQuantity;

        if (!Number.isSafeInteger(stock) || stock < 0) {
          fail(`Insufficient stock for ${product.name}.`, 409);
        }

        if (stock > 2147483647) {
          fail("Resulting stock quantity is too large.");
        }

        await db.execute(
          "UPDATE products SET stock = ? WHERE id = ?",
          [stock, productId]
        );
      }

      await db.execute(
        "DELETE FROM sales_order_items WHERE order_id = ?",
        [id]
      );

      for (const [index, item] of items.entries()) {
        const product = products.get(item.productId);
        const previous = oldItems.get(item.productId);

        let category = previous?.category || "";

        if (!previous) {
          const [categories] = await db.execute(
            "SELECT name FROM categories WHERE id = ?",
            [product.category_id]
          );

          category = categories[0]?.name || "";
        }

        // Retain historical descriptions/cost for existing lines.
        await db.execute(
          `
            INSERT INTO sales_order_items (
              order_id, product_id, line_number,
              sku, product_name, category_name,
              brand, size, colour, quantity,
              unit_price, unit_cost, line_total
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            id,
            item.productId,
            index + 1,
            previous?.sku ?? product.sku,
            previous?.name ?? product.name,
            category,
            previous?.brand ?? product.brand ?? "",
            previous?.size ?? product.size ?? "",
            previous?.colour ?? product.colour ?? "",
            item.quantity,
            decimal(item.price),
            previous?.cost ?? product.cost,
            decimal(item.price * item.quantity),
          ]
        );
      }

      await db.execute(
        `
          UPDATE sales_orders
          SET
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
            edited_at = UTC_TIMESTAMP(),
            edited_by = ?,
            edit_reason = ?,
            version = version + 1
          WHERE id = ?
        `,
        [
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
          req.salesActor.name,
          reason,
          id,
        ]
      );

      const after = await details(db, id);

      await audit(db, req, "Edited", reason, before, after);

      return after;
    });

    res.json({ order });
  })
);

router.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    if (!req.salesActor.canDelete) {
  fail("You do not have permission to delete bills.", 403);
}

    const id = uuid(req.params.id);
    const reason = readReason(req.body?.reason);

    const order = await transaction(async (db) => {
      await lockOrder(db, id, req.body?.version);

      const before = await details(db, id);

     
const products = new Map();

for (const productId of [
  ...new Set(
    before.items
      .map((item) => item.productId)
      .filter(Boolean)
  )
].sort()) {
  const [rows] = await db.execute(
    "SELECT * FROM products WHERE id = ? FOR UPDATE",
    [productId]
  );

  // Historical product may already be deleted.
  // Skip missing products instead of blocking bill cancellation.
  if (rows.length) {
    products.set(productId, rows[0]);
  }
}

const restoreQuantities = new Map();

for (const item of before.items) {
  // Only restore stock for products that still exist.
  if (!products.has(item.productId)) {
    continue;
  }

  restoreQuantities.set(
    item.productId,
    (restoreQuantities.get(item.productId) || 0) +
      Number(item.quantity)
  );
}

for (const [productId, quantity] of restoreQuantities) {
  const product = products.get(productId);
  const stock = Number(product.stock) + quantity;

  if (
    !Number.isSafeInteger(stock) ||
    stock < 0 ||
    stock > 2147483647
  ) {
    fail("Resulting stock quantity is too large.");
  }

  await db.execute(
    "UPDATE products SET stock = ? WHERE id = ?",
    [stock, productId]
  );
}


      await db.execute(
        `
          UPDATE sales_orders
          SET
            status = 'Cancelled',
            deleted_at = UTC_TIMESTAMP(),
            deleted_by = ?,
            edit_reason = ?,
            version = version + 1
          WHERE id = ?
        `,
        [req.salesActor.name, reason, id]
      );

      const after = await details(db, id);

      await audit(db, req, "Deleted", reason, before, after);

      return after;
    });

    res.json({ order });
  })
);

// Route-specific errors, including authorization and stale versions.
router.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  if (
    ["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes(error.code)
  ) {
    return res.status(409).json({
      message: "Another transaction is using this bill. Refresh and retry.",
    });
  }

  if ([400, 403, 404, 409].includes(error.status)) {
    return res.status(error.status).json({
      message: error.message,
    });
  }

  console.error("Sales API error:", error.code || error.name);

  res.status(500).json({
    message: "The server could not complete the sales request.",
  });
});

export default router;
