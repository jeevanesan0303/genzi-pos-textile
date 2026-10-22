import express, { Router } from "express";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import sharp from "sharp";

import { pool } from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

import {
  checkStaffMailConfiguration,
  sendStaffCredentials
} from "../staffMail.js";

const router = Router();

router.use(requireAuth, requireAdmin);
router.use(express.json({ limit: "3mb" }));

const ROLES = ["Worker", "Cashier", "Manager", "Admin"];

const TYPES = ["Normal Staff", "POS Access"];

const GENDERS = [
  "Male",
  "Female",
  "Other",
  "Prefer not to say"
];

const STATUSES = ["Active", "Inactive"];

const PUBLIC_SELECT = `
  SELECT
    id,
    staff_id AS staffId,
    staff_photo AS photo,
    staffname AS name,
    salary,
    DATE_FORMAT(dob, '%Y-%m-%d') AS dob,
    DATE_FORMAT(joining_date, '%Y-%m-%d') AS joiningDate,
    address,
    usertype AS userType,
    gender,
    email,
    phone_number AS phone,
    role,
    status,
    version
  FROM \`Users\`
`;

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function todayInSriLanka() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const get = type => parts.find(part => part.type === type).value;

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function text(value, label, maximum) {
  if (typeof value !== "string") fail(`Enter ${label}.`);

  const result = value.trim();

  if (!result || [...result].length > maximum) {
    fail(`${label} must contain 1 to ${maximum} characters.`);
  }

  return result;
}

function date(value, label) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < "1900-01-01"
  ) {
    fail(`Enter a valid ${label}.`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    fail(`Enter a valid ${label}.`);
  }

  return value;
}

function readStaff(body) {
  const staffId = text(body?.staffId, "Staff ID", 30);

  if (!/^[A-Za-z0-9_-]+$/.test(staffId)) {
    fail("Staff ID may contain letters, numbers, hyphens and underscores.");
  }

  const name = text(body?.name, "Staff name", 100);
  const address = text(body?.address, "Address", 500);
  const dob = date(body?.dob, "date of birth");
  const joiningDate = date(body?.joiningDate, "joining date");

  if (dob > todayInSriLanka()) {
    fail("Date of birth cannot be in the future.");
  }

  if (joiningDate < dob) {
    fail("Joining date cannot be before date of birth.");
  }

  if (
    typeof body?.phone !== "string" ||
    !/^[0-9]{10}$/.test(body.phone)
  ) {
    fail("Phone number must contain exactly 10 digits.");
  }

  if (!ROLES.includes(body.role)) fail("Select a valid role.");
  if (!TYPES.includes(body.userType)) fail("Select a valid user type.");
  if (!GENDERS.includes(body.gender)) fail("Select a valid gender.");

      const status = body.status ?? "Active";

    if (!STATUSES.includes(status)) {
      fail("Select a valid account status.");
    }

  const salary = String(body.salary ?? "").trim();

  if (!/^\d{1,10}(\.\d{1,2})?$/.test(salary)) {
    fail("Enter a non-negative salary with up to two decimal places.");
  }

  let email = null;
  let password = "";

  if (body.userType === "POS Access") {
    email = text(body.email, "Email", 254).toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fail("Enter a valid email address.");
    }

    // if (email === process.env.ADMIN_EMAIL?.trim().toLowerCase()) {
    //   fail("This email belongs to the main administrator.");
    // }

    if (body.password !== undefined && typeof body.password !== "string") {
      fail("Enter a valid password.");
    }

    password = body.password || "";

    if (
      password &&
      (password.length < 12 || Buffer.byteLength(password, "utf8") > 72)
    ) {
      fail("Password must have at least 12 characters and no more than 72 UTF-8 bytes.");
    }
  }

  return {
    staffId,
    name,
    salary,
    dob,
    joiningDate,
    address,
    userType: body.userType,
    gender: body.gender,
    email,
    password,
    phone: body.phone,
    role: body.role,
    status
  };
}

async function readPhoto(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;

  if (typeof value !== "string" || value.length > 2200000) {
    fail("Choose a photo smaller than 1.5 MB.");
  }

  const match = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value);

  if (!match) fail("Choose a JPEG, PNG or WebP photo.");

  const buffer = Buffer.from(match[1], "base64");

  if (!buffer.length || buffer.length > 1500000) {
    fail("Choose a photo smaller than 1.5 MB.");
  }

  try {
    const input = sharp(buffer, { limitInputPixels: 20000000 });
    const metadata = await input.metadata();

    if (
      !["jpeg", "png", "webp"].includes(metadata.format) ||
      (metadata.pages || 1) > 1
    ) {
      fail("Choose a static JPEG, PNG or WebP photo.");
    }

    const output = await input
      .rotate()
      .resize(400, 400, { fit: "cover", withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();

    if (output.length > 200000) {
      fail("Photo is too complex. Choose a smaller image.");
    }

    return `data:image/webp;base64,${output.toString("base64")}`;
  } catch (error) {
    if (error.status) throw error;
    fail("Unable to process this photo. Choose another image.");
  }
}

router.param("id", (req, res, next, id) => {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) {
    return res.status(400).json({ message: "Invalid staff ID." });
  }

  next();
});

router.get("/", async (req, res) => {
  const [users] = await pool.execute(
    `${PUBLIC_SELECT} ORDER BY staffname ASC, id ASC`
  );

  res.json({ users });
});

router.get("/:id", async (req, res) => {
  const [rows] = await pool.execute(
    `${PUBLIC_SELECT} WHERE id = ?`,
    [req.params.id]
  );

  if (!rows.length) fail("Staff member not found.", 404);

  res.json({ user: rows[0] });
});

async function save(req, res) {
  const data = readStaff(req.body);
  const photo = await readPhoto(req.body.photoData);
  const editing = Boolean(req.params.id);
  const id = req.params.id || randomUUID();

  if (
    editing &&
    (!Number.isInteger(req.body.version) || req.body.version < 1)
  ) {
    fail("Refresh the staff record before editing.");
  }

  // Keep the administrator's own session/profile unchanged here.
 if (
  editing &&
  req.user?.id &&
  String(req.user.id) === String(id)
) {
  fail("Ask another administrator to edit your account.", 409);
}

  const newHash = data.password
    ? await bcrypt.hash(data.password, 12)
    : null;

  const connection = await pool.getConnection();
  let saved;
  let shouldEmail = false;

  try {
    await connection.beginTransaction();

    let old;

    if (editing) {
      const [rows] = await connection.execute(
        "SELECT * FROM `Users` WHERE id = ? FOR UPDATE",
        [id]
      );

      old = rows[0];

      if (!old) fail("Staff member not found.", 404);

      if (Number(old.version) !== req.body.version) {
        fail("Another user changed this staff record. Close and refresh.", 409);
      }
    }

    let passwordHash = null;

    if (data.userType === "POS Access") {
      const needsPassword =
        !old ||
        old.usertype !== "POS Access" ||
        old.email !== data.email;

      if (needsPassword && !newHash) {
        fail("Enter a password when creating access or changing the email.");
      }

      passwordHash = newHash || old?.password_hash;

      if (!passwordHash) fail("Enter a password for this POS account.");

      shouldEmail = Boolean(newHash);

      if (shouldEmail) checkStaffMailConfiguration();
    }

    const finalPhoto =
      photo === undefined ? old?.staff_photo || null : photo;

    const values = [
      data.staffId,
      finalPhoto,
      data.name,
      data.salary,
      data.dob,
      data.joiningDate,
      data.address,
      data.userType,
      data.gender,
      data.email,
      passwordHash,
      data.phone,
      data.role,
      data.status
    ];

    if (editing) {
      await connection.execute(
        `UPDATE \`Users\` SET
           staff_id = ?, staff_photo = ?, staffname = ?,
           salary = ?, dob = ?, joining_date = ?, address = ?,
           usertype = ?, gender = ?, email = ?, password_hash = ?,
           phone_number = ?, role = ?,status = ?, version = version + 1
         WHERE id = ?`,
        [...values, id]
      );
    } else {
      await connection.execute(
        `INSERT INTO \`Users\` (
           staff_id, staff_photo, staffname, salary, dob,
           joining_date, address, usertype, gender, email,
           password_hash, phone_number, role,status, id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?)`,
        [...values, id]
      );
    }

    const [rows] = await connection.execute(
      `${PUBLIC_SELECT} WHERE id = ?`,
      [id]
    );

    saved = rows[0];
    await connection.commit();
  } catch (error) {
    await connection.rollback();

    if (error.code === "ER_DUP_ENTRY") {
      fail("Staff ID, email or phone number is already in use.", 409);
    }

    throw error;
  } finally {
    connection.release();
  }

  let emailStatus = "not-needed";

  if (shouldEmail) {
    try {
      await sendStaffCredentials({
        name: data.name,
        email: data.email,
        password: data.password
      });

      emailStatus = "accepted";
    } catch (error) {
      // Do not log the email contents or password.
      console.error("Staff email failed:", error.code || error.name);
      emailStatus = "unconfirmed";
    }
  }

  res.status(editing ? 200 : 201).json({
    user: saved,
    emailStatus
  });
}

router.post("/", save);
router.put("/:id", save);

router.delete("/:id", async (req, res) => {
  if (req.user.id === req.params.id) {
    fail("You cannot delete your own account.", 409);
  }

  const version = req.body?.version;

  if (!Number.isInteger(version) || version < 1) {
    fail("Refresh the staff record before deleting.");
  }

  const [result] = await pool.execute(
    "DELETE FROM `Users` WHERE id = ? AND version = ?",
    [req.params.id, version]
  );

  if (!result.affectedRows) {
    fail("This record changed or was deleted. Refresh the list.", 409);
  }

  res.sendStatus(204);
});

export default router;