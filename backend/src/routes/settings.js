import { Router, json } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import {
  readStoreSettings,
  validateSettings
} from "../storeSettings.js";

const router = Router();

router.use(requireAuth);

function isAdmin(user) {
  return String(user?.role || "").trim().toLowerCase() === "admin";
}

router.get("/", async (req, res, next) => {
  try {
    const result = await readStoreSettings(pool);

    res.json({
      ...result,
      canEdit: isAdmin(req.user)
    });
  } catch (error) {
    next(error);
  }
});

router.put(
  "/",
  (req, res, next) => {
    if (!isAdmin(req.user)) {
      return res.status(403).json({
        message: "Only administrators can update store settings."
      });
    }

    next();
  },
  json({ limit: "800kb" }),
  async (req, res, next) => {
    try {
      const version = Number(req.body?.version);

      if (!Number.isSafeInteger(version) || version < 1) {
        return res.status(400).json({
          message: "Reload settings before saving."
        });
      }

      const settings = validateSettings(req.body?.settings);

      const [result] = await pool.execute(
        `UPDATE store_settings
         SET settings_json = ?,
             version = version + 1,
             updated_by = ?
         WHERE id = 1 AND version = ?`,
        [
          JSON.stringify(settings),
          String(req.user.email || req.user.name || "Admin").slice(0, 254),
          version
        ]
      );

      if (result.affectedRows !== 1) {
        return res.status(409).json({
          message:
            "Settings were changed by another administrator. Reload and apply your changes again."
        });
      }

      res.json({
        settings,
        version: version + 1,
        canEdit: true
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;