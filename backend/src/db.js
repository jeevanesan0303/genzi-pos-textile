import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { fileURLToPath } from "node:url";

dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url))
});

const required = [
  "DB_HOST",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD"
];

for (const key of required) {
  if (!process.env[key]?.trim()) {
    throw new Error(`Missing ${key} in backend/.env`);
  }
}

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 50,
  timezone: "Z"
});