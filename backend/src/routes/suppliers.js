import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function readText(value, label, max, required = false) {
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

function readSupplier(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    fail("Enter valid supplier details.");
  }

  const name = readText(body.name, "Supplier name", 150, true);
  const companyName = readText(
    body.companyName,
    "Company name",
    150
  );

  const phone = readText(body.phone, "Phone number", 10, true);
  const email = readText(body.email, "Email", 254);
  const address = readText(body.address, "Address", 500);

  if (!/^0[2-9][0-9]{8}$/.test(phone)) {
    fail("Enter a valid 10-digit Sri Lankan phone number.");
  }

  if (
    email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    fail("Enter a valid email address.");
  }

  return { name, companyName, phone, email, address };
}

function serialize(row) {
  return {
    id: row.id,
    name: row.name,
    companyName: row.company_name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const SELECT_SUPPLIERS = `
  SELECT
    id,
    name,
    company_name,
    phone,
    email,
    address,
    created_at,
    updated_at
  FROM suppliers
`;

router.param("id", (req, res, next, id) => {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)
  ) {
    return res.status(400).json({
      message: "Invalid supplier ID."
    });
  }

  next();
});

router.get("/", async (req, res) => {
  const [rows] = await pool.execute(
    `${SELECT_SUPPLIERS} ORDER BY name ASC, id ASC`
  );

  res.json({
    suppliers: rows.map(serialize)
  });
});

router.get("/:id", async (req, res) => {
  const [rows] = await pool.execute(
    `${SELECT_SUPPLIERS} WHERE id = ?`,
    [req.params.id]
  );

  if (!rows.length) {
    return res.status(404).json({
      message: "Supplier not found."
    });
  }

  res.json({
    supplier: serialize(rows[0])
  });
});

async function writeSupplier(req, res, editing) {
  const supplier = readSupplier(req.body);
  const id = editing ? req.params.id : randomUUID();
  const connection = await pool.getConnection();

  let saved;

  try {
    await connection.beginTransaction();

    if (editing) {
      const [existing] = await connection.execute(
        "SELECT id FROM suppliers WHERE id = ? FOR UPDATE",
        [id]
      );

      if (!existing.length) {
        fail("Supplier no longer exists. Refresh the list.", 404);
      }

      await connection.execute(
        `UPDATE suppliers
         SET name = ?,
             company_name = ?,
             phone = ?,
             email = ?,
             address = ?
         WHERE id = ?`,
        [
          supplier.name,
          supplier.companyName,
          supplier.phone,
          supplier.email,
          supplier.address,
          id
        ]
      );
    } else {
      await connection.execute(
        `INSERT INTO suppliers (
          id, name, company_name, phone, email, address
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id,
          supplier.name,
          supplier.companyName,
          supplier.phone,
          supplier.email,
          supplier.address
        ]
      );
    }

    const [rows] = await connection.execute(
      `${SELECT_SUPPLIERS} WHERE id = ?`,
      [id]
    );

    saved = serialize(rows[0]);

    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }

  res.status(editing ? 200 : 201).json({
    supplier: saved
  });
}

router.post("/", async (req, res) => {
  await writeSupplier(req, res, false);
});

router.put("/:id", async (req, res) => {
  await writeSupplier(req, res, true);
});

router.delete("/:id", async (req, res) => {
  try {
    const [result] = await pool.execute(
      "DELETE FROM suppliers WHERE id = ?",
      [req.params.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        message: "Supplier no longer exists. Refresh the list."
      });
    }

    res.sendStatus(204);
  } catch (error) {
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({
        message: "This supplier is used by other records and cannot be deleted."
      });
    }

    throw error;
  }
});

export default router;