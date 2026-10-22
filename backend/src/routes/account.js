import { Router } from "express";
import bcrypt from "bcryptjs";

import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.put("/password", async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};

    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string"
    ) {
      return res.status(400).json({
        message: "Enter your current and new passwords."
      });
    }

    if (
      newPassword.length < 12 ||
      Buffer.byteLength(newPassword, "utf8") > 72
    ) {
      return res.status(400).json({
        message:
          "New password must contain at least 12 characters and no more than 72 UTF-8 bytes."
      });
    }

    const [rows] = await pool.execute(
      `
      SELECT password_hash
      FROM \`Users\`
      WHERE id = ?
        AND usertype = 'POS Access'
        AND status = 'Active'
      LIMIT 1
      `,
      [req.user.id]
    );

    const account = rows[0];

    if (!account?.password_hash) {
      return res.status(401).json({
        message: "Account unavailable."
      });
    }

    const valid = await bcrypt.compare(
      currentPassword,
      account.password_hash
    );

    if (!valid) {
      return res.status(400).json({
        message: "Current password is incorrect."
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        message: "Choose a different password."
      });
    }

    const newHash = await bcrypt.hash(newPassword, 12);

    const [result] = await pool.execute(
      `
      UPDATE \`Users\`
      SET password_hash = ?,
          version = version + 1
      WHERE id = ?
        AND password_hash = ?
        AND usertype = 'POS Access'
        AND status = 'Active'
      `,
      [newHash, req.user.id, account.password_hash]
    );

    if (result.affectedRows !== 1) {
      return res.status(409).json({
        message:
          "Your account changed. Please sign in again."
      });
    }

    return res.json({
      message:
        "Password updated successfully. Please sign in again."
    });

  } catch (error) {
    next(error);
  }
});

export default router;