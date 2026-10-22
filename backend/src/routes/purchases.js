import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function readText(value, label, max, required = true) {
  if (value === undefined && !required) return "";

  if (typeof value !== "string") {
    fail(`Enter a valid ${label}.`);
  }

  const result = value.trim();

  if (required && !result) {
    fail(`${label} is required.`);
  }

  if ([...result].length > max) {
    fail(`${label} must not exceed ${max} characters.`);
  }

  return result;
}

function readOrder(body, editing) {
  if (!body || typeof body !== "object") {
    fail("Enter valid purchase details.");
  }

  const supplierId = readText(
    body.supplierId,
    "Supplier",
    36
  );

  if (!UUID.test(supplierId)) {
    fail("Select a valid supplier.");
  }

  if (
    !Array.isArray(body.items) ||
    body.items.length < 1 ||
    body.items.length > 50
  ) {
    fail("Add between 1 and 50 product rows.");
  }

  if (
    editing &&
    (!Number.isInteger(body.version) || body.version < 1)
  ) {
    fail("Refresh this purchase before editing.");
  }

  let totalCents = 0;

  const items = body.items.map((item, index) => {
    const label = `Row ${index + 1}`;

    if (!item || typeof item !== "object") {
      fail(`${label}: invalid product details.`);
    }

    const category = readText(
      item.category,
      `${label} category`,
      100
    );

    const productName = readText(
      item.productName,
      `${label} product name`,
      150
    );

    const brand = readText(
      item.brand,
      `${label} brand`,
      100,
      false
    );

    const rawQuantity = String(item.quantity ?? "").trim();

    if (!/^\d+$/.test(rawQuantity)) {
      fail(`${label}: quantity must be a whole number.`);
    }

    const quantity = Number(rawQuantity);

    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 1_000_000
    ) {
      fail(`${label}: quantity must be between 1 and 1,000,000.`);
    }

    const rawCost = String(item.unitCost ?? "").trim();

    if (!/^\d{1,8}(\.\d{1,2})?$/.test(rawCost)) {
      fail(
        `${label}: cost must be nonnegative with at most 2 decimal places.`
      );
    }

    const [whole, fraction = ""] = rawCost.split(".");
    const costCents =
      Number(whole) * 100 +
      Number(fraction.padEnd(2, "0"));

    const lineCents = costCents * quantity;

    if (!Number.isSafeInteger(lineCents)) {
      fail(`${label}: line total is too large.`);
    }

    totalCents += lineCents;

    if (
      !Number.isSafeInteger(totalCents) ||
      totalCents > 999_999_999_999
    ) {
      fail("Purchase total is too large.");
    }

    return {
      category,
      productName,
      brand,
      quantity,
      unitCost: (costCents / 100).toFixed(2),
      lineTotal: (lineCents / 100).toFixed(2)
    };
  });

  return {
    supplierId,
    version: body.version,
    items,
    total: (totalCents / 100).toFixed(2)
  };
}

const ORDER_SELECT = `
  SELECT
    po.id,
    po.supplier_id,
    po.total,
    po.version,
    po.created_at,
    po.updated_at,
    s.name AS supplier_name,
    s.company_name
  FROM purchase_orders po
  JOIN suppliers s ON s.id = po.supplier_id
`;

function serializeOrder(row) {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    companyName: row.company_name,
    total: Number(row.total),
    version: Number(row.version),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

router.param("id", (req, res, next, id) => {
  if (!UUID.test(id)) {
    return res.status(400).json({
      message: "Invalid purchase ID."
    });
  }

  next();
});

router.get("/", async (req, res) => {
  const [rows] = await pool.execute(`
    SELECT
      po.id,
      po.supplier_id,
      po.total,
      po.version,
      po.created_at,
      po.updated_at,
      s.name AS supplier_name,
      s.company_name,
      (
        SELECT COUNT(*)
        FROM purchase_order_items AS poi
        WHERE poi.purchase_id = po.id
      ) AS item_count,
      (
        SELECT COALESCE(SUM(poi.quantity), 0)
        FROM purchase_order_items AS poi
        WHERE poi.purchase_id = po.id
      ) AS units
    FROM purchase_orders AS po
    INNER JOIN suppliers AS s
      ON s.id = po.supplier_id
    ORDER BY po.created_at DESC, po.id DESC
  `);

  res.json({
    purchases: rows.map(row => ({
      id: row.id,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      companyName: row.company_name,
      total: Number(row.total),
      version: Number(row.version),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      itemCount: Number(row.item_count),
      units: Number(row.units)
    }))
  });
});

router.get("/:id", async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Lock the header while reading its items for a consistent edit form.
    const [exists] = await connection.execute(
      "SELECT id FROM purchase_orders WHERE id = ? FOR SHARE",
      [req.params.id]
    );

    if (!exists.length) fail("Purchase not found.", 404);

    const [orders] = await connection.execute(
      `${ORDER_SELECT} WHERE po.id = ?`,
      [req.params.id]
    );

    const [items] = await connection.execute(
      `SELECT category, product_name, brand, quantity, unit_cost
       FROM purchase_order_items
       WHERE purchase_id = ?
       ORDER BY line_number`,
      [req.params.id]
    );

    const purchase = {
      ...serializeOrder(orders[0]),
      items: items.map(item => ({
        category: item.category,
        productName: item.product_name,
        brand: item.brand,
        quantity: Number(item.quantity),
        unitCost: item.unit_cost
      }))
    };

    await connection.commit();

    res.json({ purchase });
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
});

async function saveOrder(req, res, editing) {
  const order = readOrder(req.body, editing);
  const id = editing ? req.params.id : randomUUID();
  const connection = await pool.getConnection();

  let saved;

  try {
    await connection.beginTransaction();

    if (editing) {
      const [existing] = await connection.execute(
        "SELECT version FROM purchase_orders WHERE id = ? FOR UPDATE",
        [id]
      );

      if (!existing.length) fail("Purchase not found.", 404);

      if (Number(existing[0].version) !== order.version) {
        fail(
          "Another user changed this purchase. Close and reopen it before editing.",
          409
        );
      }
    }

    const [suppliers] = await connection.execute(
      "SELECT company_name FROM suppliers WHERE id = ? FOR SHARE",
      [order.supplierId]
    );

    if (!suppliers.length) {
      fail("Selected supplier no longer exists.");
    }

    if (!suppliers[0].company_name.trim()) {
      fail("Add a company name to this supplier first.");
    }

    if (editing) {
      await connection.execute(
        `UPDATE purchase_orders
         SET supplier_id = ?, total = ?, version = version + 1
         WHERE id = ?`,
        [order.supplierId, order.total, id]
      );

      await connection.execute(
        "DELETE FROM purchase_order_items WHERE purchase_id = ?",
        [id]
      );
    } else {
      await connection.execute(
        `INSERT INTO purchase_orders (id, supplier_id, total)
         VALUES (?, ?, ?)`,
        [id, order.supplierId, order.total]
      );
    }

    for (const [index, item] of order.items.entries()) {
      await connection.execute(
        `INSERT INTO purchase_order_items (
          id, purchase_id, line_number, category, product_name,
          brand, quantity, unit_cost, line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          id,
          index + 1,
          item.category,
          item.productName,
          item.brand,
          item.quantity,
          item.unitCost,
          item.lineTotal
        ]
      );
    }

    const [rows] = await connection.execute(
      `${ORDER_SELECT} WHERE po.id = ?`,
      [id]
    );

    saved = {
      ...serializeOrder(rows[0]),
      itemCount: order.items.length,
      units: order.items.reduce(
        (sum, item) => sum + item.quantity,
        0
      )
    };

    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }

  res.status(editing ? 200 : 201).json({
    purchase: saved
  });
}

router.post("/", async (req, res) => {
  await saveOrder(req, res, false);
});

router.put("/:id", async (req, res) => {
  await saveOrder(req, res, true);
});

router.delete("/:id", async (req, res) => {
  const version = req.body?.version;

  if (!Number.isInteger(version) || version < 1) {
    fail("Refresh the purchase list before deleting.");
  }

  const [result] = await pool.execute(
    "DELETE FROM purchase_orders WHERE id = ? AND version = ?",
    [req.params.id, version]
  );

  if (!result.affectedRows) {
    return res.status(409).json({
      message: "Purchase changed or was already deleted. Refresh the list."
    });
  }

  // Related item rows are deleted by ON DELETE CASCADE.
  res.sendStatus(204);
});

export default router;