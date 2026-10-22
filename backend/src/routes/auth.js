import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import bcrypt from "bcryptjs";

import { pool } from "../db.js";

import {
  createSession,
  requireAuth,
  revokeSession
} from "../middleware/auth.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    message:
      "Too many unsuccessful login attempts. Please try again later."
  }
});

// Used to avoid revealing whether an email exists.
const DUMMY_HASH =
  "$2b$12$9TzZcQaSjrjIOGXWiE0dMeQS25IAnNJCwSLjLyxYU9ArOam2oWDba";

/* =====================================
   DATABASE USER LOGIN
===================================== */

router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      email.length > 254 ||
      password.length > 256 ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        message: "Enter a valid email and password."
      });
    }

    const address = email.trim().toLowerCase();

    // All accounts, including Admin, come from MySQL.
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
        password_hash,
        version
      FROM \`Users\`
      WHERE email = ?
      LIMIT 1
      `,
      [address]
    );

    const account = rows[0];

    const validPassword = await bcrypt.compare(
      password,
      account?.password_hash || DUMMY_HASH
    );

    if (
      !account ||
      !validPassword ||
      account.usertype !== "POS Access" ||
      account.status !== "Active"
    ) {
      return res.status(401).json({
        message: "Incorrect email or password, or account unavailable."
      });
    }

    const user = {
      id: account.id,
      staffId: account.staff_id,
      name: account.staffname,
      email: account.email,
      role: account.role,
      version: Number(account.version)
    };

    const token = createSession(user);

    return res.json({
      token,
      user: {
        id: user.id,
        staffId: user.staffId,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    next(error);
  }
});

/* =====================================
   CURRENT LOGGED-IN USER
===================================== */

router.get("/me", requireAuth, (req, res) => {
  res.json({
    user: req.user
  });
});

/* =====================================
   LOGOUT
===================================== */

router.post("/logout", requireAuth, (req, res) => {
  revokeSession(req.sessionKey);

  res.sendStatus(204);
});

export default router;