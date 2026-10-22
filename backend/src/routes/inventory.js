import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

function validCount(value) {
  return Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 1_000_000_000;
}

router.patch("/:id/stock", async (req, res) => {
  const { id } = req.params;
  const { stock, expectedStock } = req.body || {};

  if (!/^[a-f0-9-]{36}$/i.test(id)) {
    return res.status(400).json({
      message: "Invalid product ID."
    });
  }

  if (!validCount(stock) || !validCount(expectedStock)) {
    return res.status(400).json({
      message: "Stock must be a whole number between 0 and 1,000,000,000."
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      "SELECT stock FROM products WHERE id = ? FOR UPDATE",
      [id]
    );

    if (!rows.length) {
      await connection.rollback();

      return res.status(404).json({
        message: "Product no longer exists. Refresh the list."
      });
    }

    const currentStock = Number(rows[0].stock);

    if (currentStock !== expectedStock) {
      await connection.rollback();

      return res.status(409).json({
        message:
          `Stock has changed from ${expectedStock} to ${currentStock}. ` +
          "Cancel this popup, refresh the list and try again."
      });
    }

    await connection.execute(
      "UPDATE products SET stock = ? WHERE id = ?",
      [stock, id]
    );

    await connection.commit();

    res.json({
      product: {
        id,
        stock
      }
    });
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
});

export default router;