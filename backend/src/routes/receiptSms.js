import { Router } from "express";
import { randomBytes } from "node:crypto";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

function escapeHtml(value) {
  const replacements = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) => replacements[character]
  );
}

function money(value) {
  return Number(value || 0).toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizePhone(value) {
  let phone = String(value ?? "")
    .trim()
    .replace(/[\s()-]/g, "");

  if (phone.startsWith("+")) {
    phone = phone.slice(1);
  }

  if (/^07\d{8}$/.test(phone)) {
    phone = `94${phone.slice(1)}`;
  }

  if (!/^947\d{8}$/.test(phone)) {
    fail(
      "Enter a valid Sri Lankan mobile number, such as 0771234567."
    );
  }

  return phone;
}

function receiptNumber(value) {
  return `GZ-${String(value).padStart(8, "0")}`;
}

function receiptOrigin() {
  const configured = process.env.PUBLIC_RECEIPT_BASE_URL;

  if (!configured) {
    fail("The public receipt URL is not configured.", 409);
  }

  let url;

  try {
    url = new URL(configured);
  } catch {
    fail("The public receipt URL is invalid.", 409);
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    fail(
      "The public receipt URL must be an HTTPS origin, such as https://genzicorner.com.",
      409
    );
  }

  return url.origin;
}

/* ==========================================
   RECEIPT PRIVACY HEADERS
========================================== */

router.use((req, res, next) => {
  res.set({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  });

  next();
});

/* ==========================================
   PUBLIC RECEIPT PAGE

   GET /api/receipts/view/:token

   The unpredictable token grants access to
   this receipt without a customer login.
========================================== */

router.get("/view/:token", async (req, res, next) => {
  try {
    const { token } = req.params;

    if (!/^[a-f0-9]{48}$/.test(token)) {
      return res.status(404).send("Receipt unavailable.");
    }

    const [rows] = await pool.execute(
      `
        SELECT
          s.id,
          CAST(s.receipt_number AS CHAR) AS number,
          s.receipt_settings,
          s.subtotal,
          s.discount,
          s.total,
          s.payment_method,
          DATE_FORMAT(
            s.completed_at,
            '%Y-%m-%d %H:%i UTC'
          ) AS completed_date
        FROM receipt_sms_links AS link
        INNER JOIN sales_orders AS s
          ON s.id = link.order_id
        WHERE link.token = ?
          AND link.expires_at > UTC_TIMESTAMP()
          AND s.status = 'Completed'
      `,
      [token]
    );

    if (!rows.length) {
      return res
        .status(404)
        .send("Receipt unavailable or expired.");
    }

    const sale = rows[0];

    const settings =
      typeof sale.receipt_settings === "string"
        ? JSON.parse(sale.receipt_settings)
        : sale.receipt_settings || {};

    const [items] = await pool.execute(
      `
        SELECT
          product_name,
          sku,
          size,
          colour,
          quantity,
          unit_price,
          line_total
        FROM sales_order_items
        WHERE order_id = ?
        ORDER BY line_number
      `,
      [sale.id]
    );

    const itemRows = items
      .map((item) => {
        const description = [
          item.sku,
          item.size,
          item.colour,
        ]
          .filter(Boolean)
          .join(" · ");

        return `
          <tr>
            <td>
              ${escapeHtml(item.product_name)}
              <br>
              <small>${escapeHtml(description)}</small>
            </td>
            <td>${escapeHtml(item.quantity)}</td>
            <td>${money(item.unit_price)}</td>
            <td>${money(item.line_total)}</td>
          </tr>
        `;
      })
      .join("");

    res.type("html").send(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1"
          >
          <meta name="referrer" content="no-referrer">
          <title>Genzi Corner Receipt</title>

          <style>
            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              padding: 20px 12px;
              background: #f5f2fa;
              color: #24202d;
              font-family: Arial, sans-serif;
              font-size: 14px;
            }

            main {
              width: 100%;
              max-width: 620px;
              margin: 0 auto;
              padding: 24px 16px;
              background: #ffffff;
              border-radius: 14px;
              overflow-wrap: anywhere;
            }

            header {
              text-align: center;
            }

            h1 {
              margin: 0 0 10px;
              font-size: 24px;
            }

            h2 {
              font-size: 18px;
            }

            p {
              line-height: 1.5;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 12px;
            }

            th,
            td {
              padding: 10px 4px;
              border-bottom: 1px solid #e9e5ef;
              text-align: right;
              vertical-align: top;
            }

            th:first-child,
            td:first-child {
              width: 44%;
              text-align: left;
            }

            small {
              color: #6b6475;
            }

            .summary {
              margin-top: 20px;
            }

            .summary p {
              display: flex;
              justify-content: space-between;
              gap: 12px;
            }

            .total {
              padding-top: 12px;
              border-top: 1px solid #e9e5ef;
              font-size: 20px;
              font-weight: bold;
            }

            footer {
              margin-top: 24px;
              text-align: center;
            }

            @media print {
              body {
                padding: 0;
                background: #ffffff;
              }

              main {
                max-width: none;
                border-radius: 0;
              }
            }
          </style>
        </head>

        <body>
          <main>
            <header>
              <h1>
                ${escapeHtml(settings.store || "Genzi Corner")}
              </h1>

              <p>
                ${escapeHtml(settings.address)}
                <br>
                ${escapeHtml(settings.phone)}
              </p>

              <h2>
                Receipt ${escapeHtml(receiptNumber(sale.number))}
              </h2>

              <p>${escapeHtml(sale.completed_date)}</p>
            </header>

            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Price<br>Rs.</th>
                  <th>Amount<br>Rs.</th>
                </tr>
              </thead>

              <tbody>
                ${itemRows}
              </tbody>
            </table>

            <section class="summary">
              <p>
                <span>Subtotal</span>
                <span>Rs. ${money(sale.subtotal)}</span>
              </p>

              <p>
                <span>Discount</span>
                <span>Rs. ${money(sale.discount)}</span>
              </p>

              <p class="total">
                <span>Total</span>
                <span>Rs. ${money(sale.total)}</span>
              </p>

              <p>
                <span>Payment</span>
                <span>${escapeHtml(sale.payment_method)}</span>
              </p>
            </section>

            <footer>
              <p>
                ${escapeHtml(
                  settings.footer ||
                    "Thank you for shopping with us!"
                )}
              </p>

              <small>
                This receipt displays the current completed sale.
                Please contact the store regarding returns or refunds.
              </small>
            </footer>
          </main>
        </body>
      </html>
    `);
  } catch (error) {
    next(error);
  }
});

/* ==========================================
   SEND RECEIPT SMS

   POST /api/receipts/:orderId/sms

   Requires a signed-in cashier, manager
   or administrator.
========================================== */

router.post(
  "/:orderId/sms",
  requireAuth,
  async (req, res, next) => {
    let claimed = false;
    const orderId = req.params.orderId;

    try {
      if (
        !["Admin", "Manager", "Cashier"].includes(req.user.role)
      ) {
        fail("Checkout access required.", 403);
      }

      if (
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          orderId
        )
      ) {
        fail(
          "This sale must be saved and synced online before sending SMS."
        );
      }

      const [sales] = await pool.execute(
        `
          SELECT
            id,
            owner_key,
            status,
            CAST(receipt_number AS CHAR) AS number,
            customer_phone,
            total
          FROM sales_orders
          WHERE id = ?
          LIMIT 1
        `,
        [orderId]
      );

      const sale = sales[0];

      if (!sale || sale.status !== "Completed") {
        fail("Completed sale not found.", 404);
      }

      if (
        req.user.role !== "Admin" &&
       sale.owner_key !== `staff:${req.user.id}`
      ) {
        fail(
          "You can send receipts only for your own sales.",
          403
        );
      }

      const phone = normalizePhone(
        req.body?.phone || sale.customer_phone
      );

      const userId = process.env.NOTIFY_USER_ID;
      const apiKey = process.env.NOTIFY_API_KEY;
      const senderId = process.env.NOTIFY_SENDER_ID;

      if (!userId || !apiKey || !senderId) {
        fail("SMS is not configured on the server.", 409);
      }

      const origin = receiptOrigin();

      await pool.execute(
        `
          INSERT INTO receipt_sms_links (
            order_id,
            token,
            expires_at
          )
          VALUES (
            ?,
            ?,
            DATE_ADD(UTC_TIMESTAMP(), INTERVAL 90 DAY)
          )
          ON DUPLICATE KEY UPDATE order_id = order_id
        `,
        [orderId, randomBytes(24).toString("hex")]
      );

      const [claim] = await pool.execute(
        `
          UPDATE receipt_sms_links
          SET
            send_state = 'sending',
            destination = ?,
            attempted_at = UTC_TIMESTAMP()
          WHERE order_id = ?
            AND expires_at > UTC_TIMESTAMP()
            AND send_state IN ('new', 'failed')
            AND (
              attempted_at IS NULL
              OR attempted_at <
                DATE_SUB(UTC_TIMESTAMP(), INTERVAL 60 SECOND)
            )
        `,
        [phone, orderId]
      );

      if (!claim.affectedRows) {
        fail(
          "SMS was already sent, is processing, has an uncertain result, or the receipt link expired. Check Notify.lk Logs before retrying. Failed attempts require a 60-second wait.",
          409
        );
      }

      claimed = true;

      const [links] = await pool.execute(
        `
          SELECT token
          FROM receipt_sms_links
          WHERE order_id = ?
          LIMIT 1
        `,
        [orderId]
      );

     const link =
        `${origin}/api/receipts/view/${links[0].token}`;

        const message = [
        "Hello!😊",
        "Thank you for shopping with Gen Zi Corner !! ",
        `Bill No: ${receiptNumber(sale.number)}`,
        `Total: Rs. ${Number(sale.total).toFixed(2)}`,
        `Receipt: ${link}`
        ].join("\n");

      const response = await fetch(
        "https://app.notify.lk/api/v1/send",
        {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(15000),
          body: new URLSearchParams({
            user_id: userId,
            api_key: apiKey,
            sender_id: senderId,
            to: phone,
            message,
          }),
        }
      );

      const result = await response.json();

      if (response.ok && result.status === "success") {
        await pool.execute(
          `
            UPDATE receipt_sms_links
            SET
              send_state = 'sent',
              sent_at = UTC_TIMESTAMP()
            WHERE order_id = ?
          `,
          [orderId]
        );

        return res.json({
          message:
            "SMS accepted by Notify.lk. Check Notify.lk Logs for delivery status.",
        });
      }

      if (result.status === "error") {
        await pool.execute(
          `
            UPDATE receipt_sms_links
            SET send_state = 'failed'
            WHERE order_id = ?
          `,
          [orderId]
        );

        claimed = false;

        return res.status(502).json({
          message:
            "Notify.lk rejected the SMS. Check account balance, credentials and Sender ID. Retry after 60 seconds.",
        });
      }

      throw new Error("Uncertain SMS provider response.");
    } catch (error) {
      if (claimed) {
        try {
          await pool.execute(
            `
              UPDATE receipt_sms_links
              SET send_state = 'unknown'
              WHERE order_id = ?
            `,
            [orderId]
          );
        } catch {
          // Keep the existing sending state locked.
        }

        return res.status(502).json({
          message:
            "SMS result is uncertain. Check Notify.lk Logs. Resending is blocked to prevent duplicate messages.",
        });
      }

      next(error);
    }
  }
);

export default router;