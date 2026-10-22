import express, { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import {
  saveProductPhoto,
  removeProductPhoto
} from "../productPhotos.js";

const router = Router();

router.use(requireAuth);

// Only authenticated product requests get the larger JSON limit.
router.use(express.json({ limit: "3mb" }));

const SELECT_PRODUCTS = `
  SELECT
    p.id,
    p.name,
    p.category_id,
    c.name AS category_name,
    p.sku,
    p.brand,
    p.size,
    p.colour,
    p.selling_price,
    p.cost,
    p.opening_stock,
    p.stock,
    p.reorder_minimum,
    p.photo_path,
    p.created_at,
    p.updated_at
  FROM products p
  INNER JOIN categories c ON c.id = p.category_id
`;

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function text(value, label, max, required = false) {
  if (value === undefined && !required) return "";

  if (typeof value !== "string") {
    fail(`Enter a valid ${label}.`);
  }

  const result = value.trim();

  if (
    (required && !result) ||
    [...result].length > max
  ) {
    fail(
      `${label} must ${required ? "contain 1 to" : "not exceed"} ${max} characters.`
    );
  }

  return result;
}

function money(value, label) {
  if (!["string", "number"].includes(typeof value)) {
    fail(`Enter a valid ${label}.`);
  }

  const raw = String(value).trim();

  if (!/^\d{1,10}(\.\d{1,2})?$/.test(raw)) {
    fail(`${label} must be nonnegative with at most 2 decimal places.`);
  }

  return Number(raw).toFixed(2);
}

function quantity(value, label) {
  if (!["string", "number"].includes(typeof value)) {
    fail(`Enter a valid ${label}.`);
  }

  const raw = String(value).trim();

  if (!/^\d+$/.test(raw)) {
    fail(`${label} must be a whole number, zero or higher.`);
  }

  const number = Number(raw);

  if (!Number.isSafeInteger(number) || number > 1_000_000_000) {
    fail(`${label} is too large.`);
  }

  return number;
}

function readProduct(body, editing) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    fail("Enter valid product details.");
  }

  const sku = text(body.sku, "SKU", 6, true);

  if (!/^[0-9]{6}$/.test(sku)) {
    fail("SKU must contain exactly 6 digits.");
  }

  if (
    body.removePhoto !== undefined &&
    typeof body.removePhoto !== "boolean"
  ) {
    fail("Invalid photo removal option.");
  }

  if (
    body.photo !== undefined &&
    typeof body.photo !== "string"
  ) {
    fail("Choose a valid photo.");
  }

  if (body.removePhoto && body.photo) {
    fail("Choose either a replacement photo or Remove photo.");
  }

  return {
    name: text(body.name, "Product name", 150, true),
    categoryId: text(body.categoryId, "Category", 36, true),
    sku,
    brand: text(body.brand, "Brand", 100),
    size: text(body.size, "Size", 50),
    colour: text(body.colour, "Colour", 50),
    price: money(body.price, "Selling price"),
    cost: money(body.cost, "Cost"),
    openingStock: editing
      ? undefined
      : quantity(body.openingStock, "Opening stock"),
    reorderLevel: quantity(body.reorderLevel, "Reorder minimum"),
    photo: body.photo,
    removePhoto: body.removePhoto === true
  };
}

function serialize(row) {
  return {
    id: row.id,
    name: row.name,
    categoryId: String(row.category_id),
    category: row.category_name,
    sku: row.sku,
    brand: row.brand,
    size: row.size,
    colour: row.colour,
    price: Number(row.selling_price),
    cost: Number(row.cost),
    openingStock: Number(row.opening_stock),
    stock: Number(row.stock),
    reorderLevel: Number(row.reorder_minimum),
    image: row.photo_path
      ? `/api/product-photos/${row.photo_path}`
      : "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function findProduct(connection, id) {
  const [rows] = await connection.execute(
    `${SELECT_PRODUCTS} WHERE p.id = ?`,
    [id]
  );

  if (!rows.length) fail("Product not found.", 404);

  return serialize(rows[0]);
}

router.param("id", (req, res, next, id) => {
  if (!/^[a-f0-9-]{36}$/i.test(id)) {
    return res.status(400).json({
      message: "Invalid product ID."
    });
  }

  next();
});

router.get("/", async (req, res) => {
  const [rows] = await pool.execute(
    `${SELECT_PRODUCTS} ORDER BY p.name ASC, p.id ASC`
  );

  res.json({ products: rows.map(serialize) });
});

router.get("/:id", async (req, res) => {
  res.json({
    product: await findProduct(pool, req.params.id)
  });
});

async function writeProduct(req, res, editing) {
  const product = readProduct(req.body, editing);
  const id = editing ? req.params.id : randomUUID();

  let newPhoto = null;
  let oldPhoto = null;
  let connection;
  let committed = false;
  let saved;

  try {
    if (product.photo !== undefined) {
      newPhoto = await saveProductPhoto(product.photo);
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    if (editing) {
      const [existing] = await connection.execute(
        "SELECT photo_path FROM products WHERE id = ? FOR UPDATE",
        [id]
      );

      if (!existing.length) fail("Product not found.", 404);

      oldPhoto = existing[0].photo_path;
    }

    const [categories] = await connection.execute(
      "SELECT id FROM categories WHERE id = ?",
      [product.categoryId]
    );

    if (!categories.length) {
      fail("Selected category no longer exists. Refresh the categories.");
    }

    const photoPath = newPhoto ||
      (product.removePhoto ? null : oldPhoto);

    if (editing) {
      // Opening stock and current stock are deliberately unchanged.
      await connection.execute(
        `UPDATE products SET
          name = ?,
          category_id = ?,
          sku = ?,
          brand = ?,
          size = ?,
          colour = ?,
          selling_price = ?,
          cost = ?,
          reorder_minimum = ?,
          photo_path = ?
        WHERE id = ?`,
        [
          product.name,
          product.categoryId,
          product.sku,
          product.brand,
          product.size,
          product.colour,
          product.price,
          product.cost,
          product.reorderLevel,
          photoPath,
          id
        ]
      );
    } else {
      await connection.execute(
        `INSERT INTO products (
          id, name, category_id, sku, brand, size, colour,
          selling_price, cost, opening_stock, stock,
          reorder_minimum, photo_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          product.name,
          product.categoryId,
          product.sku,
          product.brand,
          product.size,
          product.colour,
          product.price,
          product.cost,
          product.openingStock,
          product.openingStock,
          product.reorderLevel,
          photoPath
        ]
      );
    }

    saved = await findProduct(connection, id);

    await connection.commit();
    committed = true;
  } catch (error) {
    if (connection && !committed) {
      await connection.rollback().catch(() => {});
    }

    if (newPhoto && !committed) {
      await removeProductPhoto(newPhoto);
    }

    if (error.code === "ER_DUP_ENTRY") {
      error.status = 409;
      error.message = "This six-digit SKU already belongs to another product.";
    }

    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      error.status = 400;
      error.message = "Selected category no longer exists.";
    }

    throw error;
  } finally {
    connection?.release();
  }

  if (
    oldPhoto &&
    (newPhoto || product.removePhoto)
  ) {
    await removeProductPhoto(oldPhoto);
  }

  res.status(editing ? 200 : 201).json({ product: saved });
}

router.post("/", async (req, res) => {
  await writeProduct(req, res, false);
});

router.put("/:id", async (req, res) => {
  await writeProduct(req, res, true);
});

router.delete("/:id", async (req, res) => {
  const connection = await pool.getConnection();
  let photo = null;

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      "SELECT photo_path FROM products WHERE id = ? FOR UPDATE",
      [req.params.id]
    );

    if (!rows.length) fail("Product not found.", 404);

    photo = rows[0].photo_path;

    await connection.execute(
      "DELETE FROM products WHERE id = ?",
      [req.params.id]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});

    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      error.status = 409;
      error.message = "This product is referenced by other records and cannot be deleted.";
    }

    throw error;
  } finally {
    connection.release();
  }

  await removeProductPhoto(photo);

  res.sendStatus(204);
});

export default router;