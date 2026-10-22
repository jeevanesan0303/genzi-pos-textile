import { pool } from "../db.js";

export const MODULES = [
  "dashboard",
  "pos",
  "products",
  "categories",
  "inventory",
  "purchases",
  "customers",
  "suppliers",
  "sales",
  "barcodes",
  "reports",
  "expenses",
  "staff",
  "offline_sync",
  "settings"
];

const ACTION_COLUMNS = {
  view: "can_view",
  create: "can_create",
  edit: "can_edit",
  delete: "can_delete"
};

export function requirePermission(module, action = "view") {
  if (!MODULES.includes(module)) {
    throw new Error(`Invalid permission module: ${module}`);
  }

  return async function (req, res, next) {
    try {
      if (!req.user?.id) {
        return res.status(401).json({
          message: "Please sign in."
        });
      }

      if (req.user.role === "Admin") {
        return next();
      }

      const [rows] = await pool.execute(
        `
        SELECT can_view
        FROM user_permissions
        WHERE user_id = ?
          AND module = ?
        LIMIT 1
        `,
        [req.user.id, module]
      );

      if (!rows.length || Number(rows[0].can_view) !== 1) {
        return res.status(403).json({
          message: "You do not have access to this module."
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export async function getUserPermissions(userId, role) {
  if (role === "Admin") {
    return Object.fromEntries(
      MODULES.map(module => [
        module,
        {
          view: true,
          create: true,
          edit: true,
          delete: true
        }
      ])
    );
  }

  const [rows] = await pool.execute(
    `
    SELECT
      module,
      can_view,
      can_create,
      can_edit,
      can_delete
    FROM user_permissions
    WHERE user_id = ?
    `,
    [userId]
  );

  const permissions = Object.fromEntries(
    MODULES.map(module => [
      module,
      {
        view: false,
        create: false,
        edit: false,
        delete: false
      }
    ])
  );

  for (const row of rows) {
    if (!MODULES.includes(row.module)) continue;

    permissions[row.module] = {
      view: Boolean(row.can_view),
      create: Boolean(row.can_create),
      edit: Boolean(row.can_edit),
      delete: Boolean(row.can_delete)
    };
  }

  return permissions;
}