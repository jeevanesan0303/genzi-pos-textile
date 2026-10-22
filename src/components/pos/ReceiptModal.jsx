import {returnStatus} from '../../exchange';
import React, { useEffect, useRef, useState } from "react";
import { Printer } from 'lucide-react';
import Modal from '../common/Modal';
import ReceiptFooter from './ReceiptFooter';
import { refundTotal } from '../../returns';

export default function ReceiptModal({
  close,
  data,
  modal,
  money,
  onUpdateCash,
  autoPrint = false
}) {
  const [received, setReceived] = useState('');
  const [cashError, setCashError] = useState('');
  const [saving, setSaving] = useState(false);

  const sale = modal.sale;
  const settings = {
  ...(data.settings || {}),
  ...(sale.settings || {}),
  receiptWidth:
    sale.settings?.receiptWidth ??
    sale.settings?.width ??
    data.settings?.receiptWidth ??
    80
};
  const products = data.products || [];

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

  const payment = String(sale.payment || 'Cash');
  const cardOnly = payment.toLowerCase() === 'card';

  const hasCashReceived =
    sale.cashReceived != null && sale.cashReceived !== '';

  const cashReceived = hasCashReceived
    ? Number(sale.cashReceived)
    : null;

  // For split payments, sale.cash represents the cash portion.
  const cashPortion = Math.max(
    0,
    Number(sale.cash ?? saleTotal) || 0
  );

  const receiptRef = useRef(null);
const autoPrinted = useRef(false);
const printLock = useRef(false);
const [printError, setPrintError] = useState("");

async function printCurrentReceipt(isActive = () => true) {
  if (printLock.current) return;

  printLock.current = true;
  setPrintError("");

  try {
    const images = Array.from(
      receiptRef.current?.querySelectorAll("img") || []
    );

    await Promise.all(images.map(image => new Promise((resolve, reject) => {
      if (image.complete) {
        if (image.naturalWidth > 0) resolve();
        else reject(new Error("A receipt image could not load."));
        return;
      }

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Receipt images took too long to load."));
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
        reject(new Error("A receipt image could not load."));
      }

      image.addEventListener("load", loaded);
      image.addEventListener("error", failed);
    })));

    await document.fonts.ready;

    if (isActive()) window.print();
  } catch (error) {
    if (isActive()) setPrintError(error.message);
  } finally {
    printLock.current = false;
  }
}

useEffect(() => {
  if (!autoPrint || autoPrinted.current) return;

  let active = true;

  const timer = setTimeout(() => {
    if (!active) return;
    autoPrinted.current = true;
    printCurrentReceipt(() => active);
  }, 150);

  return () => {
    active = false;
    clearTimeout(timer);
  };
}, [autoPrint]);

  const changeDue =
    sale.changeDue != null && sale.changeDue !== ''
      ? Number(sale.changeDue)
      : cashReceived != null
        ? Math.max(0, cashReceived - cashPortion)
        : null;

  const getProduct = (item) => {
    const id = item.productId ?? item.product_id ?? item.id;
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
        ''
    ).trim();
  };

  const saveCash = async (event) => {
    event.preventDefault();
    setCashError('');

    const amount = Number(received);

    if (
      received.trim() === '' ||
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
      setReceived('');
    } catch (error) {
      setCashError(error?.message || 'Unable to save cash details.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Receipt preview" close={close}>
      <style>{`
        .gz-receipt {
          box-sizing: border-box;
          max-width: 100%;
          margin: 0 auto;
          padding: 4mm;
          color: #000;
          background: #fff;
          font-family: Arial, sans-serif;
          font-size: 11px;
          line-height: 1.4;
          overflow-wrap: anywhere;
        }
        .gz-receipt * { box-sizing: border-box; }
        .gz-receipt h2 {
          margin: 8px 0 4px;
          font-size: 18px;
          text-align: center;
        }
        .gz-receipt .gr-center {
          text-align: center;
          margin: 5px 0;
        }
        .gz-receipt .gr-logo {
          display: block;
          width: 48px;
          height: auto;
          margin: 0 auto 6px;
        }
        .gz-receipt hr {
          border: 0;
          border-top: 1px dashed #000;
          margin: 10px 0;
        }
        .gz-receipt table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: inherit;
          color: #000;
        }
        .gz-receipt th,
        .gz-receipt td {
          padding: 5px 2px;
          vertical-align: top;
        }
        .gz-receipt th {
          border-bottom: 1px dashed #000;
          font-weight: 700;
          text-align: right;
        }
        .gz-receipt th:first-child { text-align: left; }
        .gz-receipt .gr-product {
  padding: 5px 0 2px;
  overflow-wrap: anywhere;
  line-height: 1.3;
}
        .gz-receipt .gr-code {
  display: inline;
  font-family: monospace;
  font-size: 10px;
  margin-right: 5px;
}

.gz-receipt .gr-name {
  display: inline;
  font-weight: 100;
  margin-right: 5px;
}

.gz-receipt .gr-variant {
  display: inline;
  font-size: 10px;
}
        .gz-receipt .gr-values td {
          text-align: right;
          border-bottom: 1px dotted #aaa;
          font-variant-numeric: tabular-nums;
        }
        .gz-receipt .gr-values td:first-child {
          text-align: left;
        }
        .gz-receipt .gr-row {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          margin: 6px 0;
        }
        .gz-receipt .gr-row > :last-child {
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        .gz-receipt .gr-total {
          border-top: 1px dashed #000;
          border-bottom: 1px dashed #000;
          padding: 8px 0;
          margin: 10px 0;
          font-size: 15px;
          font-weight: 700;
        }
        .gz-receipt .gr-item {
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .gr-cash-form { margin: 18px 0; }
        .gr-cash-error { color: #dc2626; }

        /* Compact receipt spacing */
.gz-receipt {
  line-height: 1.2;
}

.gz-receipt h2 {
  margin: 4px 0 2px;
}

.gz-receipt p,
.gz-receipt .gr-center {
  margin: 3px 0;
  line-height: 1.2;
}

.gz-receipt .gr-logo {
  margin-bottom: 3px;
}

.gz-receipt hr {
  margin: 5px 0;
}

.gz-receipt th,
.gz-receipt td {
  padding: 2px;
}

.gz-receipt .gr-product {
  padding: 3px 0 1px;
  line-height: 1.2;
}

.gz-receipt .gr-values td {
  padding-top: 2px;
  padding-bottom: 3px;
}

.gz-receipt .gr-row {
  margin: 3px 0;
}

.gz-receipt .gr-total {
  padding: 4px 0;
  margin: 5px 0;
}

.gz-receipt .gr-total,
.gz-receipt .gr-total strong {
  font-weight: 500;
}

        @media print {
          @page {
            size: ${receiptWidth}mm auto;
            margin: 0;
          }
          .gz-receipt {
            width: ${receiptWidth}mm !important;
            max-width: none !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: 0 !important;
          }
          .gr-no-print { display: none !important; }
        }
      /* Keep the receipt white in both light and dark mode. */
.gz-receipt {
  color-scheme: light;
  color: #000 !important;
  background: #fff !important;
  font-family: Arial, sans-serif;
  font-size: 11px;
  line-height: 1.2;
}

.gz-receipt h2 {
  color: #17243b !important;
  background: transparent !important;
  font-size: 18px;
  font-weight: 700;
  text-align: center;
  margin: 4px 0 2px;
}

.gz-receipt p,
.gz-receipt span,
.gz-receipt small,
.gz-receipt strong,
.gz-receipt b,
.gz-receipt td {
  color: #000 !important;
}

.gz-receipt table,
.gz-receipt tbody,
.gz-receipt tr,
.gz-receipt td {
  background: transparent !important;
}

.gz-receipt thead,
.gz-receipt thead tr,
.gz-receipt th {
  background: #f4f5f9 !important;
}

.gz-receipt th {
  color: #667085 !important;
  font-weight: 700;
  border-bottom: 1px dashed #000 !important;
}

.gz-receipt th,
.gz-receipt td {
  padding: 2px;
}

.gz-receipt .gr-product {
  padding: 3px 0 1px;
  line-height: 1.2;
  border-bottom: 1px solid #dce2ed !important;
}

.gz-receipt .gr-code {
  display: inline;
  font-family: monospace;
  font-size: 10px;
  margin-right: 5px;
}

.gz-receipt .gr-name {
  display: inline;
  font-weight: 400;
  margin-right: 5px;
}

.gz-receipt .gr-variant {
  display: inline;
  font-size: 10px;
}

.gz-receipt .gr-values td {
  padding-top: 2px;
  padding-bottom: 3px;
  border-bottom: 1px dotted #aaa !important;
}

.gz-receipt .gr-row {
  margin: 3px 0;
}

.gz-receipt .gr-total {
  padding: 4px 0;
  margin: 5px 0;
  font-size: 15px;
  border-top: 1px dashed #000 !important;
  border-bottom: 1px dashed #000 !important;
}

/* Bold total, matching your second screenshot. */
.gz-receipt .gr-total,
.gz-receipt .gr-total span,
.gz-receipt .gr-total strong {
  font-weight: 700 !important;
}

.gz-receipt p,
.gz-receipt .gr-center {
  margin: 3px 0;
  line-height: 1.2;
}

.gz-receipt hr {
  margin: 5px 0;
  border: 0;
  border-top: 1px dashed #000 !important;
}

.gz-receipt .gr-logo {
  margin-bottom: 3px;
}`}</style>

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

        <h2>{settings.store || 'GEN ZI CORNER'}</h2>

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
          <span>{new Date(sale.date).toLocaleString('en-LK')}</span>
        </div>

        <div className="gr-row">
          <span>Customer</span>
          <span>{sale.customer || 'Walk-in customer'}</span>
        </div>

        <hr />

        <table aria-label="Receipt items">
          <colgroup>
            <col style={{ width: '18%' }} />
            <col style={{ width: '36%' }} />
            <col style={{ width: '46%' }} />
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
              .join(' · ');

            return (
              <tbody className="gr-item" key={`${item.id || 'item'}-${index}`}>
                <tr>
                  <td colSpan={3} className="gr-product">
                    <span className="gr-code">
                      {code || 'Barcode not recorded'}
                    </span>
                    <span className="gr-name">{item.name}</span>
                    {variant && (
                      <span className="gr-variant">{variant}</span>
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
                  : 'Not recorded'}
              </strong>
            </div>

            <div className="gr-row">
              <span>Balance / Change</span>
              <strong>
                {changeDue != null ? money(changeDue) : 'Not recorded'}
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

        {sale.exchangeFrom&&<><hr/><p>EXCHANGE PURCHASE · Original bill: {sale.exchangeFrom}</p><p>Credit applied: {money(sale.exchangeCredit||0)}<br/>Additional payment: {money(sale.additionalPayment||0)}</p></>}
        {sale.returns?.length>0&&<><hr/><strong>{returnStatus(sale)}</strong>{sale.returns.map(r=><div key={r.id}><p>{r.mode==='exchange'?'EXCHANGE':'HISTORICAL ADJUSTMENT'} · {r.number||r.id}<br/>{new Date(r.date).toLocaleString()}<br/>{r.items.map(i=>i.name+' × '+i.qty).join(', ')}<br/>Value: {money(r.total)}{r.replacementNumber&&<><br/>New bill: {r.replacementNumber}</>}</p><button className="small gr-no-print" onClick={()=>modal.openReturnReceipt?.(r)}>View exchange receipt</button></div>)}</>}
        {refunded > 0 && (
          <>
            <hr />
            <div className="gr-row">
              <span>Exchange credit value</span>
              <strong>{money(refunded)}</strong>
            </div>
            <div className="gr-row">
              <span>Original bill retained value</span>
              <strong>{money(saleTotal - refunded)}</strong>
            </div>
          </>
        )}

        <hr />

        <p className="gr-center">
          {settings.footer ?? 'Thank you for shopping with us!'}
        </p>

        <ReceiptFooter settings={settings} />
      </div>

      {!cardOnly && !hasCashReceived && onUpdateCash && (
        <form
          className="gr-cash-form gr-no-print"
          onSubmit={saveCash}
        >
          <p>
            Older receipt: enter the actual cash received to save the
            missing payment details.
          </p>

          <label>
            Actual cash received
            <input
              required
              type="number"
              step="0.01"
              min={cashPortion}
              value={received}
              onChange={(event) => setReceived(event.target.value)}
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
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save cash & balance'}
          </button>
        </form>
      )}
      {printError && (
  <p className="gr-no-print" role="alert" style={{ color: "#dc2626" }}>
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