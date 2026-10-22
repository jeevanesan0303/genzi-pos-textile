import { createHash, randomBytes } from "node:crypto";
import { pool } from "../db.js";

const sessions = new Map();

const SESSION_DURATION = 8 * 60 * 60 * 1000;

function tokenKey(token) {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

/* =====================================
   CREATE SESSION
===================================== */

export function createSession(user) {
  const token = randomBytes(32).toString("hex");

  sessions.set(tokenKey(token), {
    user,
    expiresAt: Date.now() + SESSION_DURATION
  });

  return token;
}

/* =====================================
   VERIFY SESSION + DATABASE USER
===================================== */

export async function requireAuth(req, res, next) {
  try {
    const header = req.get("authorization") || "";

    const match = /^Bearer ([a-f0-9]{64})$/i.exec(header);

    if (!match) {
      return res.status(401).json({
        message: "Please sign in."
      });
    }

    const key = tokenKey(match[1]);
    const session = sessions.get(key);

    if (!session || session.expiresAt <= Date.now()) {
      sessions.delete(key);

      return res.status(401).json({
        message: "Your session expired. Please sign in again."
      });
    }

    // Every session must belong to a database account.
    if (!session.user.id) {
      sessions.delete(key);

      return res.status(401).json({
        message: "Please sign in again."
      });
    }

    const [rows] = await pool.execute(
      `
      SELECT
        id,
        staff_id,
        staffname,
        email,
        role,
        usertype,
        status,
        version
      FROM \`Users\`
      WHERE id = ?
      LIMIT 1
      `,
      [session.user.id]
    );

    const account = rows[0];

    if (
      !account ||
      account.usertype !== "POS Access" ||
      account.status !== "Active" ||
      Number(account.version) !== Number(session.user.version)
    ) {
      sessions.delete(key);

      return res.status(401).json({
        message: "Your account changed. Please sign in again."
      });
    }

    req.user = {
      id: account.id,
      staffId: account.staff_id,
      name: account.staffname,
      email: account.email,
      role: account.role
    };

    req.sessionKey = key;

    next();

  } catch (error) {
    next(error);
  }
}

/* =====================================
   ADMIN ACCESS
===================================== */

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "Admin") {
    return res.status(403).json({
      message: "Administrator access required."
    });
  }

  next();
}

/* =====================================
   LOGOUT
===================================== */

export function revokeSession(key) {
  sessions.delete(key);
}

/* =====================================
   EXPIRED SESSION CLEANUP
===================================== */

setInterval(() => {
  const now = Date.now();

  for (const [key, session] of sessions) {
    if (session.expiresAt <= now) {
      sessions.delete(key);
    }
  }
}, 60000).unref();