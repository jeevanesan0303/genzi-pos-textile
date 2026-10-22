import { Router } from "express";
import { pool } from "../db.js";
import {
  requireAuth,
  requireAdmin
} from "../middleware/auth.js";

import {
  MODULES,
  getUserPermissions
} from "../middleware/permissions.js";

const router = Router();

router.use(requireAuth);

const ACTIONS = ["view", "create", "edit", "delete"];

const COLUMN_MAP = {
  view: "can_view",
  create: "can_create",
  edit: "can_edit",
  delete: "can_delete"
};

const emptyPermission = () => ({
  view: false,
  create: false,
  edit: false,
  delete: false
});

/* =========================================
   AVAILABLE PERMISSION MODULES
========================================= */

router.get("/modules", (req, res) => {
  res.json({
    modules: MODULES,
    actions: ACTIONS
  });
});

/* =========================================
   CURRENT USER PERMISSIONS
========================================= */

router.get("/me", async (req, res, next) => {
  try {
    const permissions = await getUserPermissions(
      req.user.id,
      req.user.role
    );

    res.json({
      user: req.user,
      permissions
    });

  } catch (error) {
    next(error);
  }
});

/* =========================================
   ADMIN ROUTES
========================================= */

router.use(requireAdmin);

/* =========================================
   LIST POS ACCESS USERS
========================================= */

router.get("/users", async (req, res, next) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
        id,
        staff_id AS staffId,
        staffname AS name,
        email,
        role,
        usertype AS userType,
        status
      FROM \`Users\`
      WHERE usertype = 'POS Access'
      ORDER BY staffname ASC
    `);

    res.json({ users: rows });

  } catch (error) {
    next(error);
  }
});

/* =========================================
   GET USER PERMISSIONS
========================================= */

router.get("/users/:id", async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT
        id,
        staff_id AS staffId,
        staffname AS name,
        email,
        role,
        status
      FROM \`Users\`
      WHERE id = ?
        AND usertype = 'POS Access'
      LIMIT 1
      `,
      [req.params.id]
    );

    const user = rows[0];

    if (!user) {
      return res.status(404).json({
        message: "POS user not found."
      });
    }

    const permissions = await getUserPermissions(
      user.id,
      user.role
    );

    res.json({
      user,
      permissions
    });

  } catch (error) {
    next(error);
  }
});

/* =========================================
   UPDATE USER PERMISSIONS
========================================= */

router.put("/users/:id", async (req, res, next) => {
  let connection;

  try {
    const { permissions } = req.body || {};

    if (
      !permissions ||
      typeof permissions !== "object" ||
      Array.isArray(permissions)
    ) {
      return res.status(400).json({
        message: "Invalid permissions data."
      });
    }

    const keys = Object.keys(permissions);

    if (
      keys.length !== MODULES.length ||
      keys.some(module => !MODULES.includes(module))
    ) {
      return res.status(400).json({
        message: "All permission modules are required."
      });
    }

    for (const module of MODULES) {
      const entry = permissions[module];

      if (
        !entry ||
        typeof entry !== "object" ||
        Array.isArray(entry) ||
        Object.keys(entry).length !== ACTIONS.length ||
        ACTIONS.some(
          action =>
            typeof entry[action] !== "boolean"
        )
      ) {
        return res.status(400).json({
          message: `Invalid permissions for ${module}.`
        });
      }
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `
      SELECT id, role, status
      FROM \`Users\`
      WHERE id = ?
        AND usertype = 'POS Access'
      LIMIT 1
      FOR UPDATE
      `,
      [req.params.id]
    );

    const user = rows[0];

    if (!user) {
      await connection.rollback();

      return res.status(404).json({
        message: "POS user not found."
      });
    }

    if (user.role === "Admin") {
      await connection.rollback();

      return res.status(403).json({
        message:
          "Administrator permissions cannot be modified."
      });
    }

    if (user.id === req.user.id) {
      await connection.rollback();

      return res.status(403).json({
        message:
          "You cannot modify your own permissions."
      });
    }

    for (const module of MODULES) {
      const entry = permissions[module];

      const allowed = Number(entry.view === true);

        const values = [
        allowed,
        allowed,
        allowed,
        allowed
        ];

      await connection.execute(
        `
        INSERT INTO user_permissions (
          user_id,
          module,
          can_view,
          can_create,
          can_edit,
          can_delete
        )
        VALUES (?, ?, ?, ?, ?, ?)

        ON DUPLICATE KEY UPDATE
          can_view = VALUES(can_view),
          can_create = VALUES(can_create),
          can_edit = VALUES(can_edit),
          can_delete = VALUES(can_delete)
        `,
        [user.id, module, ...values]
      );
    }

    // Invalidate the user's existing sessions.
    await connection.execute(
      `
      UPDATE \`Users\`
      SET version = version + 1
      WHERE id = ?
      `,
      [user.id]
    );

    await connection.commit();
    // connection = null;

    res.json({
      message: "User permissions updated successfully."
    });

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    next(error);

  } finally {
    connection?.release();
  }
});

export default router;