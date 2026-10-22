
import React, { useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";

import Modal from "../common/Modal";
import ReceiptFooter from "./ReceiptFooter";
import { refundTotal } from "../../returns";
import { returnStatus } from "../../exchange";

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
  const [printError, setPrintError] = useState("");

  const receiptRef = useRef(null);
  const printLock = useRef(false);
  const autoPrintedSale = useRef(null);

  const sale = modal.sale;

  const settings = {
    ...(data.settings || {}),
    ...(sale.settings || {}),
    receiptWidth:
      sale.settings?.receiptWidth ??
      sale.settings?.width ??
      data.settings?.receiptWidth ??
      80,
  };

  const products = data.products || [];

  const requestedWidth = Number(settings.receiptWidth);

  const receiptWidth =
    Number.isFinite(requestedWidth) &&
    requestedWidth >= 40 &&
    requestedWidth <= 120
      ? requestedWidth
      : 80;

  const saleItems = sale.items || [];

  const refunded = Number(refundTotal(sale)) || 0;
  const saleTotal = Number(sale.total) || 0;
  const discount = Number(sale.discount) || 0;

  const subtotal = saleItems.reduce(
    (sum, item) =>
      sum +
      (Number(item.price) || 0) *
        (Number(item.qty) || 0),
    0
  );

  const totalItems = saleItems.reduce(
    (sum, item) => sum + (Number(item.qty) || 0),
    0
  );

  const payment = String(sale.payment || "Cash");
  const cardOnly = payment.toLowerCase() === "card";

  const hasCashReceived =
    sale.cashReceived != null &&
    sale.cashReceived !== "";

  const cashReceived = hasCashReceived
    ? Number(sale.cashReceived)
    : null;

  const cashPortion = Math.max(
    0,
    Number(sale.cash ?? saleTotal) || 0
  );

  const changeDue =
    sale.changeDue != null &&
    sale.changeDue !== ""
      ? Number(sale.changeDue)
      : cashReceived != null
        ? Math.max(0, cashReceived - cashPortion)
        : null;

  const getProduct = (item) => {
    const id =
      item.productId ??
      item.product_id ??
      item.id;

    if (id == null) return undefined;

    return products.find(
      (product) => String(product.id) === String(id)
    );
  };

  const getCode = (item) => {
    const product = getProduct(item);

    return String(
      item.barcode ||
        item.sku ||
        product?.barcode ||
        product?.sku ||
        ""
    ).trim();
  };

  const waitForImages = async () => {
    const images = Array.from(
      receiptRef.current?.querySelectorAll("img") || []
    );

    await Promise.all(
      images.map(
        (image) =>
          new Promise((resolve, reject) => {
            if (image.complete) {
              if (image.naturalWidth > 0) {
                resolve();
              } else {
                reject(
                  new Error(
                    "A receipt image could not load."
                  )
                );
              }
              return;
            }

            const timer = setTimeout(() => {
              cleanup();
              reject(
                new Error(
                  "Receipt images took too long to load."
                )
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
                  "A receipt image could not load."
                )
              );
            }

            image.addEventListener("load", loaded);
            image.addEventListener("error", failed);
          })
      )
    );
  };

  const printCurrentReceipt = async (
    isActive = () => true
  ) => {
    if (printLock.current) return;

    printLock.current = true;
    setPrintError("");

    try {
      await waitForImages();

      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      if (isActive()) {
        window.print();
      }
    } catch (error) {
      if (isActive()) {
        setPrintError(
          error?.message ||
            "Unable to prepare receipt for printing."
        );
      }
    } finally {
      printLock.current = false;
    }
  };

  useEffect(() => {
    if (!autoPrint) return;

    const saleKey = String(
      sale.id ?? sale.number ?? ""
    );

    if (autoPrintedSale.current === saleKey) {
      return;
    }

    autoPrintedSale.current = saleKey;

    let active = true;

    const timer = setTimeout(() => {
      if (active) {
        printCurrentReceipt(() => active);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [autoPrint, sale.id, sale.number]);

  const saveCash = async (event) => {
    event.preventDefault();
    setCashError("");

    const amount = Number(received);

    if (
      received.trim() === "" ||
      !Number.isFinite(amount) ||
      amount < cashPortion
    ) {
      setCashError(
        `Enter an amount of at least ${money(
          cashPortion
        )}.`
      );
      return;
    }

    try {
      setSaving(true);
      await onUpdateCash(sale, amount);
      setReceived("");
    } catch (error) {
      setCashError(
        error?.message ||
          "Unable to save cash details."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Receipt preview" close={close}>
      <style>{`
        .gz-receipt {
          box-sizing: border-box;
          width: ${receiptWidth}mm;
          max-width: 100%;
          margin: 0 auto;
          padding: 3mm;
          background: #fff !important;
          color: #000 !important;
          color-scheme: light;
          font-family: Arial, sans-serif;
          font-size: 10px;
          line-height: 1.2;
          overflow-wrap: anywhere;
        }

        .gz-receipt *,
        .gz-receipt *::before,
        .gz-receipt *::after {
          box-sizing: border-box;
        }

        .gz-receipt h2 {
          margin: 3px 0 2px;
          font-size: 16px;
          font-weight: 700;
          line-height: 1.1;
          text-align: center;
          color: #000 !important;
        }

        .gz-receipt p {
          margin: 2px 0;
          line-height: 1.2;
        }

        .gz-receipt .gr-center {
          text-align: center;
        }

        .gz-receipt .gr-logo {
          display: block;
          width: 42px;
          height: auto;
          max-height: 42px;
          object-fit: contain;
          margin: 0 auto 3px;
        }

        .gz-receipt hr {
          border: 0;
          border-top: 1px dashed #000;
          margin: 4px 0;
        }

        .gz-receipt .gr-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 6px;
          margin: 3px 0;
          width: 100%;
        }

        .gz-receipt .gr-row > :first-child {
          flex: 0 1 45%;
          min-width: 0;
        }

        .gz-receipt .gr-row > :last-child {
          flex: 1 1 55%;
          min-width: 0;
          text-align: right;
          overflow-wrap: anywhere;
          font-variant-numeric: tabular-nums;
        }

        .gz-receipt table {
          width: 100%;
          border-collapse: collapse;
          border-spacing: 0;
          table-layout: fixed;
          color: #000 !important;
          font-size: 10px;
        }

        .gz-receipt th,
        .gz-receipt td {
          padding: 2px 1px;
          vertical-align: top;
          color: #000 !important;
        }

        .gz-receipt th {
          text-align: right;
          font-weight: 700;
          border-bottom: 1px dashed #000;
          background: transparent !important;
        }

        .gz-receipt th:first-child,
        .gz-receipt td:first-child {
          text-align: left;
        }

        .gz-receipt .gr-item {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .gz-receipt .gr-product {
          padding: 3px 1px 1px;
          line-height: 1.2;
          overflow-wrap: anywhere;
        }

        .gz-receipt .gr-code {
          font-family: monospace;
          font-size: 9px;
          margin-right: 4px;
        }

        .gz-receipt .gr-name {
          font-weight: 500;
          margin-right: 4px;
        }

        .gz-receipt .gr-variant {
          font-size: 9px;
        }

        .gz-receipt .gr-values td {
          border-bottom: 1px dotted #aaa;
          font-variant-numeric: tabular-nums;
          text-align: right;
          padding-bottom: 3px;
        }

        .gz-receipt .gr-values td:first-child {
          text-align: left;
        }

        .gz-receipt .gr-total {
          border-top: 1px dashed #000;
          border-bottom: 1px dashed #000;
          padding: 5px 0;
          margin: 5px 0;
          font-size: 14px;
          font-weight: 700;
        }

        .gz-receipt .gr-total span,
        .gz-receipt .gr-total strong {
          font-weight: 700 !important;
        }

        .gz-receipt-footer {
          text-align: center;
          margin: 3px 0 0;
          padding: 0;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .gz-receipt-footer p {
          margin: 2px 0;
          line-height: 1.2;
        }

        .gz-receipt-footer .gz-footer-policy {
          margin: 3px 0;
          font-size: 9px;
        }

        .gz-receipt-footer .gz-footer-follow {
          margin: 3px 0 2px;
          font-size: 9px;
        }

        .gz-receipt-footer .gz-footer-qr {
          display: block;
          width: 25mm;
          height: 25mm;
          max-width: 100%;
          object-fit: contain;
          background: #fff;
          padding: 1mm;
          margin: 0 auto;
        }

        .gz-receipt-footer .gz-footer-instagram {
          margin: 2px 0 0;
          font-size: 9px;
          overflow-wrap: anywhere;
        }

        .gr-cash-form {
          margin: 18px 0;
        }

        .gr-cash-error {
          color: #dc2626;
        }

        @media print {
          @page {
            size: ${receiptWidth}mm 200mm;
            margin: 0;
          }

          html,
          body,
          #root {
            margin: 0 !important;
            padding: 0 !important;
            width: ${receiptWidth}mm !important;
            min-height: 0 !important;
            height: auto !important;
            overflow: visible !important;
            background: #fff !important;
          }

          body * {
            visibility: hidden !important;
          }

          .gz-receipt,
          .gz-receipt * {
            visibility: visible !important;
          }

          .gz-receipt {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: ${receiptWidth}mm !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 3mm !important;
            border: 0 !important;
            box-shadow: none !important;
            transform: none !important;
            overflow: visible !important;
            background: #fff !important;
            color: #000 !important;
          }

          .gz-receipt-footer {
            margin-bottom: 0 !important;
          }

          .gz-receipt .gr-item {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .gr-no-print {
            display: none !important;
          }
        }
      `}</style>

      <div
        ref={receiptRef}
        className="print-area receipt gz-receipt"
        style={{
          width: `${receiptWidth}mm`,
        }}
      >
        {settings.showLogo && (
          <img
            src="/assets/logo.png"
            alt="Store logo"
            className="gr-logo"
          />
        )}

        <h2>
          {settings.store || "GEN ZI CORNER"}
        </h2>

        {settings.tagline && (
          <p className="gr-center">
            {settings.tagline}
          </p>
        )}

        {settings.showContact !== false && (
          <p className="gr-center">
            {settings.address}
            {settings.address &&
              settings.phone && <br />}
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
            {new Date(sale.date).toLocaleString(
              "en-LK"
            )}
          </span>
        </div>

        <div className="gr-row">
          <span>Customer</span>
          <span>
            {sale.customer || "Walk-in customer"}
          </span>
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

          {saleItems.map((item, index) => {
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
                key={`${
                  item.id || "item"
                }-${index}`}
              >
                <tr>
                  <td
                    colSpan={3}
                    className="gr-product"
                  >
                    <span className="gr-code">
                      {code ||
                        "Barcode not recorded"}
                    </span>{" "}
                    <span className="gr-name">
                      {item.name}
                    </span>{" "}
                    {variant && (
                      <span className="gr-variant">
                        {variant}
                      </span>
                    )}
                  </td>
                </tr>

                <tr className="gr-values">
                  <td>{item.qty}</td>
                  <td>
                    {money(
                      Number(item.price) || 0
                    )}
                  </td>
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
          <strong>{totalItems}</strong>
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
            <strong>
              {money(Number(sale.card))}
            </strong>
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

            {sale.returns.map((r) => (
              <div key={r.id}>
                <p>
                  {r.mode === "exchange"
                    ? "EXCHANGE"
                    : "HISTORICAL ADJUSTMENT"}
                  {" · "}
                  {r.number || r.id}
                  <br />
                  {new Date(
                    r.date
                  ).toLocaleString()}
                  <br />
                  {(r.items || [])
                    .map(
                      (i) =>
                        `${i.name} × ${i.qty}`
                    )
                    .join(", ")}
                  <br />
                  Value: {money(r.total)}
                  {r.replacementNumber && (
                    <>
                      <br />
                      New bill:{" "}
                      {r.replacementNumber}
                    </>
                  )}
                </p>

                <button
                  type="button"
                  className="small gr-no-print"
                  onClick={() =>
                    modal.openReturnReceipt?.(r)
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
              <span>
                Exchange credit value
              </span>
              <strong>{money(refunded)}</strong>
            </div>

            <div className="gr-row">
              <span>
                Original bill retained value
              </span>
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

      {!cardOnly &&
        !hasCashReceived &&
        onUpdateCash && (
          <form
            className="gr-cash-form gr-no-print"
            onSubmit={saveCash}
          >
            <p>
              Older receipt: enter the actual
              cash received to save the missing
              payment details.
            </p>

            <label>
              Actual cash received
              <input
                required
                type="number"
                step="0.01"
                min={cashPortion}
                value={received}
                onChange={(event) =>
                  setReceived(event.target.value)
                }
              />
            </label>

            {cashError && (
              <p
                className="gr-cash-error"
                role="alert"
              >
                {cashError}
              </p>
            )}

            <button
              className="secondary"
              type="submit"
              disabled={saving}
            >
              {saving
                ? "Saving…"
                : "Save cash & balance"}
            </button>
          </form>
        )}

      {printError && (
        <p
          className="gr-no-print"
          role="alert"
          style={{ color: "#dc2626" }}
        >
          {printError}
        </p>
      )}

      <button
        type="button"
        className="primary full gr-no-print"
        onClick={() => printCurrentReceipt()}
      >
        <Printer size={17} />
        Print receipt
      </button>
    </Modal>
  );
}
