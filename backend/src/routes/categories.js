import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

function readCategory(body) {
  if (
    typeof body?.name !== "string" ||
    (
      body.description !== undefined &&
      typeof body.description !== "string"
    )
  ) {
    const error = new Error("Enter valid category details.");
    error.status = 400;
    throw error;
  }

  const name = body.name.trim();
  const description = (body.description || "").trim();

  if (!name || [...name].length > 100) {
    const error = new Error(
      "Category name must contain 1 to 100 characters."
    );
    error.status = 400;
    throw error;
  }

  if ([...description].length > 500) {
    const error = new Error(
      "Description must not exceed 500 characters."
    );
    error.status = 400;
    throw error;
  }

  return { name, description };
}

router.param("id", (req, res, next, id) => {
  if (!/^[A-Za-z0-9_-]{1,36}$/.test(id)) {
    return res.status(400).json({
      message: "Invalid category ID."
    });
  }

  next();
});

router.get("/", async (req, res) => {
  const [categories] = await pool.execute(
    "SELECT id, name, description FROM categories ORDER BY name ASC"
  );

  res.json({ categories });
});

router.post("/", async (req, res) => {
  const { name, description } = readCategory(req.body);
  const id = randomUUID();

  await pool.execute(
    "INSERT INTO categories (id, name, description) VALUES (?, ?, ?)",
    [id, name, description]
  );

  res.status(201).json({
    category: { id, name, description }
  });
});

router.put("/:id", async (req, res) => {
  const { name, description } = readCategory(req.body);
  const { id } = req.params;

  const [result] = await pool.execute(
    "UPDATE categories SET name = ?, description = ? WHERE id = ?",
    [name, description, id]
  );

  if (!result.affectedRows) {
    return res.status(404).json({
      message: "Category not found. Refresh the list."
    });
  }

  res.json({
    category: { id, name, description }
  });
});

router.delete("/:id", async (req, res) => {
  const [result] = await pool.execute(
    "DELETE FROM categories WHERE id = ?",
    [req.params.id]
  );

  if (!result.affectedRows) {
    return res.status(404).json({
      message: "Category not found. Refresh the list."
    });
  }

  res.sendStatus(204);
});

export default router;