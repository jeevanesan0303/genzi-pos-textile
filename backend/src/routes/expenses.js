import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

const SELECT_EXPENSE = `
  SELECT
    id,
    name,
    DATE_FORMAT(expense_date, '%Y-%m-%d') AS date,
    category,
    amount,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM expenses
`;

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function text(value, label, maximum) {
  if (typeof value !== "string") {
    invalid(`Enter a valid ${label}.`);
  }

  const result = value.trim();

  if (!result || [...result].length > maximum) {
    invalid(`${label} must contain 1 to ${maximum} characters.`);
  }

  return result;
}

function readExpense(body) {
  const name = text(body?.name, "Description", 200);
  const category = text(body?.category, "Category", 100);

  const date = body?.date;

  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  ) {
    invalid("Enter a valid expense date.");
  }

  const year = Number(date.slice(0, 4));
  const parsedDate = new Date(`${date}T00:00:00.000Z`);

  if (
    year < 1000 ||
    year > 9999 ||
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date
  ) {
    invalid("Enter a valid calendar date.");
  }

  if (
    typeof body?.amount !== "string" &&
    typeof body?.amount !== "number"
  ) {
    invalid("Enter a valid expense amount.");
  }

  const amount = String(body.amount).trim();

  if (!/^\d{1,10}(\.\d{1,2})?$/.test(amount)) {
    invalid("Amount must contain up to two decimal places.");
  }

  const [whole, fraction = ""] = amount.split(".");
  const cents =
    Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

  if (
    !Number.isSafeInteger(cents) ||
    cents <= 0 ||
    cents > 999999999999
  ) {
    invalid("Amount must be between 0.01 and 9,999,999,999.99.");
  }

  return {
    name,
    date,
    category,
    amount: `${Number(whole)}.${fraction.padEnd(2, "0")}`
  };
}

router.param("id", (req, res, next, id) => {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)
  ) {
    return res.status(400).json({
      message: "Invalid expense ID."
    });
  }

  next();
});

// Read all expenses.
router.get("/", async (req, res) => {
  const [expenses] = await pool.execute(`
    ${SELECT_EXPENSE}
    ORDER BY expense_date DESC, created_at DESC, id DESC
  `);

  res.json({ expenses });
});

// Read one expense.
router.get("/:id", async (req, res) => {
  const [rows] = await pool.execute(
    `${SELECT_EXPENSE} WHERE id = ?`,
    [req.params.id]
  );

  if (!rows.length) {
    return res.status(404).json({
      message: "Expense not found."
    });
  }

  res.json({ expense: rows[0] });
});

async function saveExpense(req, res) {
  const values = readExpense(req.body);
  const editing = Boolean(req.params.id);
  const id = req.params.id || randomUUID();

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (editing) {
      const [existing] = await connection.execute(
        "SELECT id FROM expenses WHERE id = ? FOR UPDATE",
        [id]
      );

      if (!existing.length) {
        const error = new Error("Expense not found.");
        error.status = 404;
        throw error;
      }

      await connection.execute(
        `UPDATE expenses
         SET name = ?, expense_date = ?, category = ?, amount = ?
         WHERE id = ?`,
        [
          values.name,
          values.date,
          values.category,
          values.amount,
          id
        ]
      );
    } else {
      await connection.execute(
        `INSERT INTO expenses
           (id, name, expense_date, category, amount)
         VALUES (?, ?, ?, ?, ?)`,
        [
          id,
          values.name,
          values.date,
          values.category,
          values.amount
        ]
      );
    }

    const [rows] = await connection.execute(
      `${SELECT_EXPENSE} WHERE id = ?`,
      [id]
    );

    await connection.commit();

    res.status(editing ? 200 : 201).json({
      expense: rows[0]
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

router.post("/", saveExpense);
router.put("/:id", saveExpense);

// Delete one expense.
router.delete("/:id", async (req, res) => {
  const [result] = await pool.execute(
    "DELETE FROM expenses WHERE id = ?",
    [req.params.id]
  );

  if (!result.affectedRows) {
    return res.status(404).json({
      message: "Expense not found. Refresh the list."
    });
  }

  res.sendStatus(204);
});

export default router;