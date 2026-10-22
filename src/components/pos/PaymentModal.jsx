import React from "react";
import Modal from "../common/Modal";

import CustomerPhoneField, {
  validCustomerPhone,
  findCustomersByPhone,
} from "./CustomerPhoneField";

function toCents(value) {
  const text = String(value ?? "");

  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text)) {
    return NaN;
  }

  const [whole, fraction = ""] = text.split(".");

  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export default function PaymentModal({
  close,
  finish,
  total,
  payment,
  setPayment,
  cardAmount,
  setCardAmount,
  tender,
  setTender,
  money,
  data,
  customer,
  setCustomer,
  busy = false,
  pending = false,
  error = "",
  recover,
  canSubmit = true,
  customerLookupPending = false,
  customerLookupError = "",
  offline = false,
}) {
  const locked = busy || Boolean(pending);

  const amountDue = Number(total.total) || 0;
  const totalCents = toCents(total.total);

  const cardCents =
    payment === "Card"
      ? totalCents
      : payment === "Split"
        ? toCents(cardAmount)
        : 0;

  const cashDueCents = totalCents - cardCents;

  const tenderCents = payment === "Card" ? 0 : toCents(tender);

  const cashDue = Number.isFinite(cashDueCents)
    ? Math.max(0, cashDueCents / 100)
    : 0;

  const change =
    payment === "Card"
      ? 0
      : Number.isFinite(tenderCents) && Number.isFinite(cashDueCents)
        ? Math.max(0, (tenderCents - cashDueCents) / 100)
        : 0;

  const phone = String(customer || "");

  const customers = (data?.customers || []).map((item) => ({
    ...item,
    phone: String(item.phone ?? item.phonenumber ?? ""),
  }));

  const matches = findCustomersByPhone(customers, phone);

  const phoneOK = !phone || (validCustomerPhone(phone) && matches.length === 1);

  const paymentOK =
    ["Cash", "Card", "Split"].includes(payment) &&
    Number.isSafeInteger(totalCents) &&
    totalCents >= 0 &&
    Number.isSafeInteger(cardCents) &&
    Number.isSafeInteger(tenderCents) &&
    tenderCents >= cashDueCents &&
    (payment !== "Split" || (cardCents > 0 && cardCents < totalCents));

  function safeClose() {
    if (!locked) close();
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (locked || !canSubmit || !phoneOK || !paymentOK) {
      return;
    }

    finish(event);
  }

  return (
    <Modal title="Complete payment" close={safeClose}>
      <form onSubmit={handleSubmit}>
        <div className="payment-total">
          <small>AMOUNT DUE</small>
          <strong>{money(amountDue)}</strong>
        </div>

        <fieldset
          disabled={locked}
          style={{
            border: 0,
            padding: 0,
            margin: 0,
            minWidth: 0,
          }}
        >
          <CustomerPhoneField
            customers={customers}
            value={customer}
            onChange={setCustomer}
            id="payment-customer-phone"
            lookupPending={customerLookupPending}
            lookupError={customerLookupError}
            offline={offline}
            disabled={locked}
          />

          <div className="chips">
            {["Cash", "Card", "Split"].map((method) => (
              <button
                key={method}
                type="button"
                className={payment === method ? "selected" : ""}
                onClick={() => setPayment(method)}
              >
                {method}
              </button>
            ))}
          </div>

          {payment === "Split" && (
            <label>
              Card portion (LKR)
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={Math.max(0, amountDue - 0.01)}
                required
                value={cardAmount}
                onChange={(event) => setCardAmount(event.target.value)}
              />
            </label>
          )}

          {payment !== "Card" && (
            <label>
              Cash received (LKR)
              <input
                type="number"
                step="0.01"
                min={cashDue}
                required
                value={tender}
                onChange={(event) => setTender(event.target.value)}
              />
            </label>
          )}

          <div className="sum-row">
            <span>Change</span>
            <strong>{money(change)}</strong>
          </div>

          <p className="muted">
            Card payments are recorded only. This form does not process bank
            payments.
          </p>

          <button
            type="submit"
            className="primary full"
            disabled={locked || !canSubmit || !phoneOK || !paymentOK}
          >
            {busy ? "Saving…" : "Complete sale"}
          </button>
        </fieldset>

        {error && (
          <p
            role="alert"
            style={{
              color: "#dc2626",
              marginTop: 12,
            }}
          >
            {error}
          </p>
        )}

        {pending && (
          <div style={{ marginTop: 12 }}>
            <p className="muted">
              Payment confirmation is pending. Recover the existing request
              before starting another sale.
            </p>

            <button
              type="button"
              className="secondary full"
              disabled={busy || !recover}
              onClick={recover}
            >
              {busy ? "Checking…" : "Recover / Retry safely"}
            </button>
          </div>
        )}
      </form>
    </Modal>
  );
}
