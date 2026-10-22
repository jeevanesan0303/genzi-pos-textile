import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReceiptFooter from "./ReceiptFooter";

export const money = value =>
  new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    minimumFractionDigits: 2
  }).format(Number(value) || 0);

export function escapeHTML(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    character =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[character]
  );
}

export function receiptHTML(order, displaySettings = {}) {
  const e = escapeHTML;

  // Saved sale settings take priority for store/payment history.
  const settings = {
    ...displaySettings,
    ...(order.settings || {})
  };

  const width =
    Number(settings.width ?? settings.receiptWidth) === 58
      ? 58
      : 80;

  const date = new Date(
    order.completedAt
  ).toLocaleString("en-LK", {
    timeZone: "Asia/Colombo"
  });

  const items = Array.isArray(order.items)
    ? order.items
    : [];

  const totalItems = items.reduce(
    (sum, item) => sum + Number(item.quantity),
    0
  );

  const rows = items
    .map(item => {
      const variant = [item.size, item.colour]
        .filter(Boolean)
        .join(" / ");

      return `
        <tr>
          <td>
            <strong>${e(item.name)}</strong>

            <br>

            <small>
              ${e(item.sku)}
              ${variant ? ` · ${e(variant)}` : ""}
            </small>

            <br>

            ${e(item.quantity)} × ${e(money(item.price))}
          </td>

          <td>
            ${e(money(item.lineTotal))}
          </td>
        </tr>
      `;
    })
    .join("");

  const footer = renderToStaticMarkup(
    React.createElement(ReceiptFooter, { settings })
  );

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">

        <title>${e(order.number)}</title>

        <style>
          @page {
            size: ${width}mm auto;
            margin: 3mm;
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            width: ${width - 6}mm;
            color: #000;
            background: #fff;
            font-family: Arial, sans-serif;
            font-size: 11px;
            line-height: 1.4;
          }

          h1 {
            margin: 5px 0;
            font-size: 18px;
          }

          p {
            margin: 5px 0;
            overflow-wrap: anywhere;
          }

          .center {
            text-align: center;
          }

          .logo {
            display: block;
            width: 15mm;
            height: auto;
            margin: 0 auto 5px;
          }

          hr {
            margin: 9px 0;
            border: 0;
            border-top: 1px dashed #000;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
          }

          tr {
            break-inside: avoid;
          }

          td {
            padding: 6px 0;
            vertical-align: top;
            border-bottom: 1px dotted #aaa;
          }

          td:first-child {
            overflow-wrap: anywhere;
          }

          td:last-child {
            padding-left: 5px;
            text-align: right;
            white-space: nowrap;
          }

          small {
            font-size: 10px;
          }

          .row {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            margin: 5px 0;
          }

          .row > :last-child {
            text-align: right;
          }

          .total {
            padding: 7px 0;
            font-size: 16px;
            font-weight: bold;
            border-top: 1px dashed #000;
            border-bottom: 1px dashed #000;
          }
        </style>
      </head>

      <body>
        <div class="center">
          ${
            settings.showLogo
              ? `
                <img
                  class="logo"
                  src="/assets/logo.png"
                  alt="Store logo"
                >
              `
              : ""
          }

          <h1>
            ${e(settings.store || "GEN ZI CORNER")}
          </h1>

          ${
            settings.tagline
              ? `<p>${e(settings.tagline)}</p>`
              : ""
          }

          ${
            settings.showContact !== false
              ? `
                <p>${e(settings.address)}</p>
                <p>${e(settings.phone)}</p>
              `
              : ""
          }
        </div>

        <hr>

        <div class="row">
          <span>Receipt</span>
          <strong>${e(order.number)}</strong>
        </div>

        <p>${e(date)}</p>

        <p>
          Cashier: ${e(order.cashierName)}
        </p>

        <p>
          Customer:
          ${e(order.customerName || "Walk-in customer")}
        </p>

        ${
          order.customerPhone
            ? `<p>Phone: ${e(order.customerPhone)}</p>`
            : ""
        }

        <hr>

        <table aria-label="Receipt items">
          <tbody>
            ${rows}
          </tbody>
        </table>

        <div class="row">
          <span>Total items</span>
          <strong>${e(totalItems)}</strong>
        </div>

        <div class="row">
          <span>Subtotal</span>
          <strong>${e(money(order.subtotal))}</strong>
        </div>

        <div class="row">
          <span>Discount</span>
          <strong>${e(money(order.discount))}</strong>
        </div>

        <div class="row total">
          <span>Total</span>
          <span>${e(money(order.total))}</span>
        </div>

        <p>
          Payment: ${e(order.paymentMethod)}
        </p>

        ${
          order.paymentMethod !== "Card"
            ? `
              <div class="row">
                <span>Cash paid</span>
                <strong>${e(money(order.cashPaid))}</strong>
              </div>

              <div class="row">
                <span>Cash received</span>
                <strong>
                  ${e(money(order.cashReceived))}
                </strong>
              </div>

              <div class="row">
                <span>Balance / Change</span>
                <strong>
                  ${e(money(order.changeDue))}
                </strong>
              </div>
            `
            : ""
        }

        ${
          order.paymentMethod !== "Cash"
            ? `
              <div class="row">
                <span>Card paid</span>
                <strong>${e(money(order.cardPaid))}</strong>
              </div>
            `
            : ""
        }

        <hr>

        <p class="center">
          ${e(
            settings.footer ||
            "Thank you for shopping with us!"
          )}
        </p>

        ${footer}
      </body>
    </html>
  `;
}

function waitForImage(image) {
  return new Promise((resolve, reject) => {
    if (image.complete) {
      if (image.naturalWidth > 0) {
        resolve();
      } else {
        reject(
          new Error(
            "A receipt image could not load. Check your logo and Instagram QR image."
          )
        );
      }

      return;
    }

    const timeout = setTimeout(() => {
      cleanup();

      reject(
        new Error(
          "Receipt images took too long to load. Check the images and try printing again."
        )
      );
    }, 10000);

    function cleanup() {
      clearTimeout(timeout);
      image.removeEventListener("load", loaded);
      image.removeEventListener("error", failed);
    }

    function loaded() {
      cleanup();
      resolve();
    }

    function failed() {
      cleanup();

      reject(
        new Error(
          "A receipt image could not load. Check your logo and Instagram QR image."
        )
      );
    }

    image.addEventListener("load", loaded);
    image.addEventListener("error", failed);
  });
}

export async function printReceipt(
  order,
  displaySettings = {}
) {
  let frame;

  try {
    if (order?.status !== "Completed") {
      throw new Error(
        "Only completed sales can be printed as receipts."
      );
    }

    frame = document.createElement("iframe");

    frame.title = "Receipt print";

    frame.style.cssText = `
      position: fixed;
      left: -10000px;
      top: 0;
      width: 400px;
      height: 600px;
      border: 0;
    `;

    document.body.appendChild(frame);

    const doc = frame.contentDocument;

    doc.open();
    doc.write(receiptHTML(order, displaySettings));
    doc.close();

    await Promise.all(
      Array.from(doc.images).map(waitForImage)
    );

    const printWindow = frame.contentWindow;

    printWindow.addEventListener(
      "afterprint",
      () => {
        setTimeout(() => frame.remove(), 500);
      },
      { once: true }
    );

    printWindow.focus();
    printWindow.print();
  } catch (error) {
    frame?.remove();

    window.alert(
      error.message ||
      "Unable to print this receipt. Please try again."
    );
  }
}
