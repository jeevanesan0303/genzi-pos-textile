import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = Router();

router.use(requireAuth);

function readCustomer(body) {
  if (typeof body?.name !== "string") {
    const error = new Error("Enter a valid customer name.");
    error.status = 400;
    throw error;
  }

  const name = body.name.trim();

  if (!name || [...name].length > 150) {
    const error = new Error(
      "Customer name must contain 1 to 150 characters."
    );
    error.status = 400;
    throw error;
  }

  if (
    typeof body?.phonenumber !== "string" ||
    !/^[0-9]{10}$/.test(body.phonenumber)
  ) {
    const error = new Error(
      "Phone number must contain exactly 10 digits."
    );
    error.status = 400;
    throw error;
  }

  return {
    name,
    phonenumber: body.phonenumber
  };
}

router.param("id", (req, res, next, id) => {
  const valid =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);

  if (!valid) {
    return res.status(400).json({
      message: "Invalid customer ID."
    });
  }

  next();
});

// Read all customers.
router.get(
  "/",
  requirePermission("customers", "view"),
  async (req, res) => {
  const [customers] = await pool.execute(`
    SELECT id, name, phonenumber
    FROM customers
    ORDER BY name ASC, id ASC
  `);

  res.json({ customers });
});


// Read one customer.
router.get(
  "/:id",
  requirePermission("customers", "view"),
  async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT id, name, phonenumber
     FROM customers
     WHERE id = ?`,
    [req.params.id]
  );

  if (!rows.length) {
    return res.status(404).json({
      message: "Customer not found."
    });
  }

  res.json({ customer: rows[0] });
});

async function saveCustomer(req, res) {
  const { name, phonenumber } = readCustomer(req.body);
  const editing = Boolean(req.params.id);
  const id = req.params.id || randomUUID();

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (editing) {
      const [existing] = await connection.execute(
        "SELECT id FROM customers WHERE id = ? FOR UPDATE",
        [id]
      );

      if (!existing.length) {
        const error = new Error("Customer not found.");
        error.status = 404;
        throw error;
      }

      await connection.execute(
        `UPDATE customers
         SET name = ?, phonenumber = ?
         WHERE id = ?`,
        [name, phonenumber, id]
      );
    } else {
      await connection.execute(
        `INSERT INTO customers (id, name, phonenumber)
         VALUES (?, ?, ?)`,
        [id, name, phonenumber]
      );
    }

    const [rows] = await connection.execute(
      `SELECT id, name, phonenumber
       FROM customers
       WHERE id = ?`,
      [id]
    );

    await connection.commit();

    res.status(editing ? 200 : 201).json({
      customer: rows[0]
    });
  } catch (error) {
    await connection.rollback();

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "A customer with this phone number already exists."
      });
    }

    throw error;
  } finally {
    connection.release();
  }
}

router.post(
  "/",
  requirePermission("customers", "create"),
  saveCustomer
);

router.put(
  "/:id",
  requirePermission("customers", "edit"),
  saveCustomer
);

// Delete a customer.
router.delete("/:id", async (req, res) => {
  try {
    const [result] = await pool.execute(
      "DELETE FROM customers WHERE id = ?",
      [req.params.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        message: "Customer not found. Refresh the list."
      });
    }

    res.sendStatus(204);
  } catch (error) {
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({
        message:
          "This customer is linked to other records and cannot be deleted."
      });
    }

    throw error;
  }
});

export default router;