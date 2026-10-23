import React, { useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import Modal from "../common/Modal";
import ReceiptFooter from "./ReceiptFooter";
import { returnStatus } from "../../exchange";
import { refundTotal } from "../../returns";

export default function ReceiptModal({
  close,
  data,
  modal,
  money,
  onUpdateCash,
  autoPrint = false,
}) {
  const [received, setReceived] = useState("");
  const [cashError, setCashError] = useState("");
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState("");

  const receiptRef = useRef(null);
  const styleRef = useRef(null);
  const printButtonRef = useRef(null);
  const printLock = useRef(false);
  const autoPrinted = useRef(false);
  const mounted = useRef(false);
  const shortcutRef = useRef({});

  const sale = modal.sale;
  const products = data.products || [];

  const settings = {
    ...(data.settings || {}),
    ...(sale.settings || {}),
    receiptWidth:
      sale.settings?.receiptWidth ??
      sale.settings?.width ??
      data.settings?.receiptWidth ??
      80,
  };

  const requestedWidth = Number(settings.receiptWidth);

  const receiptWidth =
    Number.isFinite(requestedWidth) &&
    requestedWidth >= 40 &&
    requestedWidth <= 120
      ? requestedWidth
      : 80;

  const refunded = Number(refundTotal(sale)) || 0;
  const saleTotal = Number(sale.total) || 0;
  const discount = Number(sale.discount) || 0;

  const subtotal = (sale.items || []).reduce(
    (sum, item) =>
      sum + (Number(item.price) || 0) * (Number(item.qty) || 0),
    0
  );

  const payment = String(sale.payment || "Cash");
  const cardOnly = payment.toLowerCase() === "card";

  const hasCashReceived =
    sale.cashReceived != null && sale.cashReceived !== "";

  const cashReceived = hasCashReceived
    ? Number(sale.cashReceived)
    : null;

  const cashPortion = Math.max(
    0,
    Number(sale.cash ?? saleTotal) || 0
  );

  const changeDue =
    sale.changeDue != null && sale.changeDue !== ""
      ? Number(sale.changeDue)
      : cashReceived != null
        ? Math.max(0, cashReceived - cashPortion)
        : null;

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  function safeClose() {
    if (saving || printLock.current) return;
    close();
  }

  function getProduct(item) {
    const id = item.productId ?? item.product_id ?? item.id;

    if (id == null) return undefined;

    return products.find(
      (product) => String(product.id) === String(id)
    );
  }

  function getCode(item) {
    const product = getProduct(item);

    return String(
      item.barcode ||
        item.sku ||
        product?.barcode ||
        product?.sku ||
        ""
    ).trim();
  }

  function waitForImage(image) {
    return new Promise((resolve, reject) => {
      if (image.complete) {
        if (image.naturalWidth > 0) {
          resolve();
        } else {
          reject(
            new Error(
              "A receipt image could not load. Check the logo and Instagram QR image."
            )
          );
        }

        return;
      }

      const timer = setTimeout(() => {
        cleanup();

        reject(
          new Error("Receipt images took too long to load.")
        );
      }, 10000);

      function cleanup() {
        clearTimeout(timer);
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
            "A receipt image could not load. Check the logo and Instagram QR image."
          )
        );
      }

      image.addEventListener("load", loaded);
      image.addEventListener("error", failed);
    });
  }

  async function printCurrentReceipt(isActive = () => true) {
    if (
      saving ||
      printLock.current ||
      !receiptRef.current
    ) {
      return;
    }

    printLock.current = true;
    setPrinting(true);
    setPrintError("");

    let frame;
    let cleanupTimer;
    let printStarted = false;

    function removeFrame() {
      clearTimeout(cleanupTimer);
      frame?.remove();
    }

    try {
      frame = document.createElement("iframe");
      frame.title = "Receipt printing";

      frame.style.cssText = `
        position: fixed;
        left: -10000px;
        top: 0;
        width: ${receiptWidth}mm;
        height: 600px;
        border: 0;
      `;

      document.body.appendChild(frame);

      const doc = frame.contentDocument;
      const printWindow = frame.contentWindow;

      if (!doc || !printWindow) {
        throw new Error(
          "Unable to open the receipt print window."
        );
      }

      const receiptCopy = receiptRef.current.cloneNode(true);

      receiptCopy.querySelectorAll("img").forEach((image) => {
        const source = image.getAttribute("src");

        if (source) {
          image.setAttribute(
            "src",
            new URL(source, document.baseURI).href
          );
        }
      });

      const receiptStyles =
        styleRef.current?.textContent || "";

      doc.open();

      doc.write(`
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Receipt</title>
            <style>
              ${receiptStyles}

              html,
              body {
                margin: 0 !important;
                padding: 0 !important;
                background: #fff !important;
              }

              body {
                width: ${receiptWidth}mm !important;
              }

              .print-area.gz-receipt {
                display: block !important;
                position: static !important;
                width: ${receiptWidth}mm !important;
                max-width: none !important;
                height: auto !important;
                min-height: 0 !important;
                margin: 0 !important;
                padding: 3mm !important;
                overflow: visible !important;
                border: 0 !important;
                box-shadow: none !important;
              }

              .gr-no-print {
                display: none !important;
              }

              .gz-receipt img {
                max-width: 100%;
              }
            </style>
          </head>
          <body>${receiptCopy.outerHTML}</body>
        </html>
      `);

      doc.close();

      await Promise.all(
        Array.from(doc.images).map(waitForImage)
      );

      if (doc.fonts?.ready) {
        await doc.fonts.ready;
      }

      if (!mounted.current || !isActive()) {
        removeFrame();
        return;
      }

      const receipt = doc.querySelector(".gz-receipt");

      if (!receipt) {
        throw new Error("Receipt content was not found.");
      }

      const heightPx = Math.max(
        receipt.scrollHeight,
        receipt.getBoundingClientRect().height
      );

      const heightMm = Math.max(
        80,
        Math.ceil((heightPx * 25.4) / 96 + 8)
      );

      const pageStyle = doc.createElement("style");

      pageStyle.textContent = `
        @page {
          size: ${receiptWidth}mm ${heightMm}mm;
          margin: 0;
        }

        @media print {
          html,
          body {
            width: ${receiptWidth}mm !important;
            height: auto !important;
            overflow: visible !important;
          }

          .gz-receipt .gr-item {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `;

      doc.head.appendChild(pageStyle);

      await new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(resolve);
        });
      });

      if (!mounted.current || !isActive()) {
        removeFrame();
        return;
      }

      printWindow.addEventListener(
        "afterprint",
        () => {
          cleanupTimer = setTimeout(removeFrame, 500);

          if (mounted.current) {
            printButtonRef.current?.focus();
          }
        },
        { once: true }
      );

      printWindow.focus();
      printWindow.print();
      printStarted = true;

      if (!cleanupTimer) {
        cleanupTimer = setTimeout(removeFrame, 60000);
      }
    } catch (error) {
      removeFrame();

      if (mounted.current && isActive()) {
        setPrintError(
          error?.message || "Unable to print receipt."
        );
      }
    } finally {
      if (!printStarted) removeFrame();

      printLock.current = false;

      if (mounted.current) {
        setPrinting(false);
      }
    }
  }

  useEffect(() => {
    if (!autoPrint || autoPrinted.current) return;

    let active = true;

    const timer = setTimeout(() => {
      if (!active) return;

      autoPrinted.current = true;
      void printCurrentReceipt(() => active);
    }, 150);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [autoPrint]);

  async function saveCash(event) {
    event.preventDefault();

    if (
      saving ||
      printLock.current ||
      !onUpdateCash
    ) {
      return;
    }

    setCashError("");

    const amount = Number(received);

    if (
      received.trim() === "" ||
      !Number.isFinite(amount) ||
      amount < cashPortion
    ) {
      setCashError(
        `Enter an amount of at least ${money(cashPortion)}.`
      );
      return;
    }

    try {
      setSaving(true);

      await onUpdateCash(sale, amount);

      if (mounted.current) {
        setReceived("");
      }
    } catch (error) {
      if (mounted.current) {
        setCashError(
          error?.message || "Unable to save cash details."
        );
      }
    } finally {
      if (mounted.current) {
        setSaving(false);
      }
    }
  }

  shortcutRef.current = {
    print: printCurrentReceipt,
    close: safeClose,
    saving,
  };

  useEffect(() => {
    function handleReceiptKeyboard(event) {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.keyCode === 229 ||
        document.querySelector(".swal2-container")
      ) {
        return;
      }

      if (
        event.key !== "Enter" &&
        event.key !== "Escape"
      ) {
        return;
      }

      if (
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }

      // Enter in the cash correction form keeps its normal behavior.
      if (
        event.key === "Enter" &&
        event.target instanceof Element &&
        event.target.closest(
          "input, textarea, select, [contenteditable='true'], .gr-cash-form"
        )
      ) {
        return;
      }

      // Stop Enter from activating the focused × or Close button.
      event.preventDefault();
      event.stopImmediatePropagation();

      if (event.repeat) return;

      const current = shortcutRef.current;

      if (
        current.saving ||
        printLock.current
      ) {
        return;
      }

      if (event.key === "Escape") {
        current.close();
        return;
      }

      // Enter always prints the receipt.
      void current.print();
    }

    window.addEventListener(
      "keydown",
      handleReceiptKeyboard,
      true
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleReceiptKeyboard,
        true
      );
    };
  }, []);

  return (
    <Modal title="Receipt preview" close={safeClose}>
      <style ref={styleRef}>{`
        .gz-receipt {
          box-sizing: border-box;
          max-width: 100%;
          margin: 0 auto;
          padding: 4mm;
          color-scheme: light;
          color: #000 !important;
          background: #fff !important;
          font-family: Arial, sans-serif;
          font-size: 11px;
          line-height: 1.2;
          overflow-wrap: anywhere;
        }

        .gz-receipt * {
          box-sizing: border-box;
        }

        .gz-receipt h2 {
          margin: 4px 0 2px;
          color: #17243b !important;
          background: transparent !important;
          font-size: 18px;
          font-weight: 700;
          text-align: center;
        }

        .gz-receipt p,
        .gz-receipt .gr-center {
          margin: 3px 0;
          line-height: 1.2;
        }

        .gz-receipt .gr-center {
          text-align: center;
        }

        .gz-receipt .gr-logo {
          display: block;
          width: 48px;
          height: auto;
          margin: 0 auto 3px;
        }

        .gz-receipt hr {
          margin: 5px 0;
          border: 0;
          border-top: 1px dashed #000 !important;
        }

        .gz-receipt table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: inherit;
          color: #000;
        }

        .gz-receipt table,
        .gz-receipt tbody,
        .gz-receipt tr,
        .gz-receipt td {
          background: transparent !important;
        }

        .gz-receipt th,
        .gz-receipt td {
          padding: 2px;
          vertical-align: top;
        }

        .gz-receipt thead,
        .gz-receipt thead tr,
        .gz-receipt th {
          background: #f4f5f9 !important;
        }

        .gz-receipt th {
          color: #667085 !important;
          border-bottom: 1px dashed #000 !important;
          font-weight: 700;
          text-align: right;
        }

        .gz-receipt th:first-child {
          text-align: left;
        }

        .gz-receipt p,
        .gz-receipt span,
        .gz-receipt small,
        .gz-receipt strong,
        .gz-receipt b,
        .gz-receipt td {
          color: #000 !important;
        }

        .gz-receipt .gr-product {
          padding: 3px 0 1px;
          line-height: 1.2;
          overflow-wrap: anywhere;
          border-bottom: 1px solid #dce2ed !important;
        }

        .gz-receipt .gr-code {
          display: inline;
          margin-right: 5px;
          font-family: monospace;
          font-size: 10px;
        }

        .gz-receipt .gr-name {
          display: inline;
          margin-right: 5px;
          font-weight: 400;
        }

        .gz-receipt .gr-variant {
          display: inline;
          font-size: 10px;
        }

        .gz-receipt .gr-values td {
          padding-top: 2px;
          padding-bottom: 3px;
          text-align: right;
          border-bottom: 1px dotted #aaa !important;
          font-variant-numeric: tabular-nums;
        }

        .gz-receipt .gr-values td:first-child {
          text-align: left;
        }

        .gz-receipt .gr-row {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          margin: 3px 0;
        }

        .gz-receipt .gr-row > :last-child {
          text-align: right;
          font-variant-numeric: tabular-nums;
        }

        .gz-receipt .gr-total {
          padding: 4px 0;
          margin: 5px 0;
          font-size: 15px;
          border-top: 1px dashed #000 !important;
          border-bottom: 1px dashed #000 !important;
        }

        .gz-receipt .gr-total,
        .gz-receipt .gr-total span,
        .gz-receipt .gr-total strong {
          font-weight: 700 !important;
        }

        .gz-receipt .gr-item {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .gr-cash-form {
          margin: 18px 0;
        }

        .gr-cash-error {
          color: #dc2626;
        }

        .gr-receipt-actions {
          display: grid;
          gap: 10px;
          margin-top: 16px;
        }

        .gr-receipt-shortcuts {
          margin: 0;
          text-align: center;
          font-size: 12px;
          color: var(--muted, #737184);
        }

        @media print {
          @page {
            size: ${receiptWidth}mm 300mm;
            margin: 0;
          }

          .gz-receipt {
            width: ${receiptWidth}mm !important;
            max-width: none !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: 0 !important;
          }

          .gr-no-print {
            display: none !important;
          }
        }
      `}</style>

      <div
        ref={receiptRef}
        className="print-area receipt gz-receipt"
        style={{ width: `${receiptWidth}mm` }}
      >
        {settings.showLogo && (
          <img
            src="/assets/logo.png"
            alt="Store logo"
            className="gr-logo"
          />
        )}

        <h2>{settings.store || "GEN ZI CORNER"}</h2>

        {settings.tagline && (
          <p className="gr-center">{settings.tagline}</p>
        )}

        {settings.showContact !== false && (
          <p className="gr-center">
            {settings.address}
            {settings.address && settings.phone && <br />}
            {settings.phone}
          </p>
        )}

        <hr />

        <div className="gr-row">
          <span>Receipt</span>
          <strong>{sale.number}</strong>
        </div>

        <div className="gr-row">
          <span>Date</span>
          <span>
            {new Date(sale.date).toLocaleString("en-LK", {
              timeZone: "Asia/Colombo",
            })}
          </span>
        </div>

        <div className="gr-row">
          <span>Customer</span>
          <span>{sale.customer || "Walk-in customer"}</span>
        </div>

        <hr />

        <table aria-label="Receipt items">
          <colgroup>
            <col style={{ width: "18%" }} />
            <col style={{ width: "36%" }} />
            <col style={{ width: "46%" }} />
          </colgroup>

          <thead>
            <tr>
              <th>Qty</th>
              <th>Price</th>
              <th>Amount</th>
            </tr>
          </thead>

          {(sale.items || []).map((item, index) => {
            const product = getProduct(item);
            const code = getCode(item);

            const variant = [
              item.size || product?.size,
              item.colour || product?.colour,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <tbody
                className="gr-item"
                key={`${item.id || "item"}-${index}`}
              >
                <tr>
                  <td colSpan={3} className="gr-product">
                    <span className="gr-code">
                      {code || "Barcode not recorded"}
                    </span>

                    <span className="gr-name">
                      {item.name}
                    </span>

                    {variant && (
                      <span className="gr-variant">
                        {variant}
                      </span>
                    )}
                  </td>
                </tr>

                <tr className="gr-values">
                  <td>{item.qty}</td>
                  <td>{money(Number(item.price) || 0)}</td>
                  <td>
                    {money(
                      (Number(item.price) || 0) *
                        (Number(item.qty) || 0)
                    )}
                  </td>
                </tr>
              </tbody>
            );
          })}
        </table>

        <div className="gr-row">
          <span>Total items</span>
          <strong>
            {(sale.items || []).reduce(
              (sum, item) => sum + (Number(item.qty) || 0),
              0
            )}
          </strong>
        </div>

        <div className="gr-row">
          <span>Subtotal</span>
          <strong>{money(subtotal)}</strong>
        </div>

        {discount > 0 && (
          <div className="gr-row">
            <span>Discount</span>
            <strong>{money(discount)}</strong>
          </div>
        )}

        <div className="gr-row gr-total">
          <span>Total (LKR)</span>
          <strong>{money(saleTotal)}</strong>
        </div>

        <div className="gr-row">
          <span>Payment method</span>
          <strong>{payment}</strong>
        </div>

        {!cardOnly && (
          <>
            <div className="gr-row">
              <span>Cash received</span>
              <strong>
                {cashReceived != null
                  ? money(cashReceived)
                  : "Not recorded"}
              </strong>
            </div>

            <div className="gr-row">
              <span>Balance / Change</span>
              <strong>
                {changeDue != null
                  ? money(changeDue)
                  : "Not recorded"}
              </strong>
            </div>
          </>
        )}

        {Number(sale.card) > 0 && (
          <div className="gr-row">
            <span>Card paid</span>
            <strong>{money(Number(sale.card))}</strong>
          </div>
        )}

        {sale.exchangeFrom && (
          <>
            <hr />

            <p>
              EXCHANGE PURCHASE · Original bill:{" "}
              {sale.exchangeFrom}
            </p>

            <p>
              Credit applied:{" "}
              {money(sale.exchangeCredit || 0)}
              <br />
              Additional payment:{" "}
              {money(sale.additionalPayment || 0)}
            </p>
          </>
        )}

        {sale.returns?.length > 0 && (
          <>
            <hr />

            <strong>{returnStatus(sale)}</strong>

            {sale.returns.map((record) => (
              <div key={record.id}>
                <p>
                  {record.mode === "exchange"
                    ? "EXCHANGE"
                    : "HISTORICAL ADJUSTMENT"}
                  {" · "}
                  {record.number || record.id}
                  <br />

                  {new Date(record.date).toLocaleString()}
                  <br />

                  {(record.items || [])
                    .map(
                      (item) =>
                        `${item.name} × ${item.qty}`
                    )
                    .join(", ")}

                  <br />
                  Value: {money(record.total)}

                  {record.replacementNumber && (
                    <>
                      <br />
                      New bill: {record.replacementNumber}
                    </>
                  )}
                </p>

                <button
                  type="button"
                  className="small gr-no-print"
                  onClick={() =>
                    modal.openReturnReceipt?.(record)
                  }
                >
                  View exchange receipt
                </button>
              </div>
            ))}
          </>
        )}

        {refunded > 0 && (
          <>
            <hr />

            <div className="gr-row">
              <span>Exchange credit value</span>
              <strong>{money(refunded)}</strong>
            </div>

            <div className="gr-row">
              <span>Original bill retained value</span>
              <strong>
                {money(saleTotal - refunded)}
              </strong>
            </div>
          </>
        )}

        <hr />

        <p className="gr-center">
          {settings.footer ??
            "Thank you for shopping with us!"}
        </p>

        <ReceiptFooter settings={settings} />
      </div>

      {!cardOnly && !hasCashReceived && onUpdateCash && (
        <form
          className="gr-cash-form gr-no-print"
          onSubmit={saveCash}
        >
          <p>
            Older receipt: enter the actual cash received
            to save the missing payment details.
          </p>

          <label>
            Actual cash received
            <input
              required
              type="number"
              step="0.01"
              min={cashPortion}
              value={received}
              disabled={saving || printing}
              onChange={(event) =>
                setReceived(event.target.value)
              }
            />
          </label>

          {cashError && (
            <p className="gr-cash-error" role="alert">
              {cashError}
            </p>
          )}

          <button
            className="secondary"
            type="submit"
            disabled={saving || printing}
          >
            {saving ? "Saving…" : "Save cash & balance"}
          </button>
        </form>
      )}

      {printError && (
        <p
          className="gr-no-print"
          role="alert"
          style={{
            color: "#dc2626",
            marginTop: 12,
          }}
        >
          {printError}
        </p>
      )}

      <div className="gr-receipt-actions gr-no-print">
        <button
          ref={printButtonRef}
          type="button"
          className="primary full"
          disabled={saving || printing}
          onClick={() => void printCurrentReceipt()}
        >
          <Printer size={17} />
          {printing
            ? "Preparing receipt…"
            : "Print receipt · Enter"}
        </button>

        <button
          type="button"
          className="secondary full"
          disabled={saving || printing}
          onClick={safeClose}
        >
          Close · Esc
        </button>

        <p className="gr-receipt-shortcuts">
          Enter: print receipt · Esc: close preview
        </p>
      </div>
    </Modal>
  );
}
