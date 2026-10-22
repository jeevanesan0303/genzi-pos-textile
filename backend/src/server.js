
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { pool } from "./db.js";
import authRoutes from "./routes/auth.js";
import categoryRoutes from "./routes/categories.js";
import productRoutes from "./routes/products.js";
import { productPhotoDirectory } from "./productPhotos.js";
import inventoryRoutes from "./routes/inventory.js";
import supplierRoutes from "./routes/suppliers.js";
import purchaseRoutes from "./routes/purchases.js";
import expenseRoutes from "./routes/expenses.js";
import customerRoutes from "./routes/customers.js";
import userRoutes from "./routes/users.js";
import posRoutes from "./routes/pos.js";
import salesRoutes from "./routes/sales.js";
import reportsRoutes from "./routes/reports.js";
import dashboardRoutes from "./routes/dashboard.js";
import settingsRoutes from "./routes/settings.js";
import accountRoutes from "./routes/account.js";
import permissionsRoutes from "./routes/permissions.js";

const app = express();

app.disable("x-powered-by");
app.use(helmet());

/* ==========================================
   CORS CONFIGURATION
========================================== */

const allowedOrigins = [
  "https://genzicorner.com",
  "https://www.genzicorner.com",
  "https://genzi-pos-textile.purple-forest-fa52.workers.dev"
];

app.use(
  "/api",
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
    maxAge: 86400
  })
);

/* ==========================================
   SECURITY AND CACHE CONTROL
========================================== */

app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

/* ==========================================
   PRODUCT PHOTOS
========================================== */

app.use(
  "/api/product-photos",
  express.static(productPhotoDirectory, {
    dotfiles: "deny",
    index: false,
    fallthrough: false
  })
);

/* ==========================================
   ROUTES WITH CUSTOM JSON PARSERS
========================================== */

app.use("/api/products", productRoutes);
app.use("/api/users", userRoutes);
app.use("/api/settings", settingsRoutes);

/* ==========================================
   STANDARD JSON PARSER
========================================== */

app.use(express.json({ limit: "128kb" }));

/* ==========================================
   ACCOUNT AND PERMISSIONS
========================================== */

app.use("/api/account", accountRoutes);
app.use("/api/permissions", permissionsRoutes);

/* ==========================================
   POS API ROUTES
========================================== */

app.use("/api/inventory", inventoryRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/pos", posRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/dashboard", dashboardRoutes);

/* ==========================================
   HEALTH CHECK
========================================== */

app.get("/api/health", async (req, res) => {
  await pool.execute("SELECT 1");

  res.json({
    ok: true,
    database: "connected"
  });
});

/* ==========================================
   AUTHENTICATION AND CATEGORIES
========================================== */

app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);

/* ==========================================
   UNKNOWN API ENDPOINTS
========================================== */

app.use("/api", (req, res) => {
  res.status(404).json({
    message: "This API endpoint is not implemented."
  });
});

/* ==========================================
   ERROR HANDLING
========================================== */

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      message: "Invalid JSON request."
    });
  }

  if (error.status === 413) {
    return res.status(413).json({
      message: "Request is too large. Choose a smaller photo."
    });
  }

  if ([400, 404, 409].includes(error.status)) {
    return res.status(error.status).json({
      message:
        error.status === 404
          ? "Requested record or image was not found."
          : error.message
    });
  }

  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      message: "A record with this unique value already exists."
    });
  }

  if (error.code === "ER_ROW_IS_REFERENCED_2") {
    return res.status(409).json({
      message:
        "This record is used by other records and cannot be deleted."
    });
  }

  console.error("API error:", {
    code: error.code || error.name,
    message: error.sqlMessage || error.message
  });

  res.status(500).json({
    message: "The server could not complete the request."
  });
});

/* ==========================================
   DATABASE CHECK AND SERVER STARTUP
========================================== */

try {
  await pool.execute(
    "SELECT id, name, description FROM categories LIMIT 1"
  );

  await pool.execute(
    "SELECT id, sku, category_id FROM products LIMIT 1"
  );

  const host = process.env.HOST || "127.0.0.1";
  const port = Number(process.env.PORT || 3001);

  const server = app.listen(port, host, () => {
    console.log(`API ready: http://${host}:${port}`);
    console.log("MySQL categories and products connected.");
  });

  server.on("error", async error => {
    console.error("Listen failed:", error.code);
    await pool.end();
    process.exitCode = 1;
  });
} catch (error) {
  console.error(
    "Startup failed:",
    error.code || error.message
  );

  await pool.end();
  process.exitCode = 1;
}
