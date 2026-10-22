import React from "react";

export const validCustomerPhone = (value) =>
  /^0[2-9]\d{8}$/.test(String(value || ""));

export function findCustomersByPhone(customers = [], phone = "") {
  return customers.filter((item) => String(item.phone || "").trim() === phone);
}

export default function CustomerPhoneField({
  customers = [],
  value = "",
  onChange,
  id = "customer-phone",
  lookupPending = false,
  lookupError = "",
  offline = false,
  disabled = false,
}) {
  const phone = String(value || "");
  const valid = validCustomerPhone(phone);
  const matches = valid ? findCustomersByPhone(customers, phone) : [];
  const matched = matches.length === 1 ? matches[0] : null;

  let error = "";

  if (phone && !valid) {
    error = "Enter a valid 10-digit Sri Lankan phone number.";
  } else if (lookupPending) {
    error = "";
  } else if (lookupError) {
    error = lookupError;
  } else if (valid && matches.length === 0) {
    error = offline
      ? "Customer not downloaded on this device. Connect online, or use walk-in."
      : "Customer not found. Register this customer first.";
  } else if (matches.length > 1) {
    error = "Duplicate phone number. Correct the customer records.";
  }

  return (
    <div style={{ margin: "16px 0" }}>
      <label htmlFor={id} style={{ margin: "0 0 8px" }}>
        Customer phone number
      </label>

      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder="0771234567"
        maxLength={10}
        disabled={disabled}
        value={phone}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-status`}
        onChange={(event) =>
          onChange(event.target.value.replace(/\D/g, "").slice(0, 10))
        }
        style={{
          borderColor: error ? "#dc2626" : undefined,
          color: error ? "#dc2626" : undefined,
        }}
      />

      <div
        id={`${id}-status`}
        aria-live="polite"
        style={{
          marginTop: 7,
          fontSize: 12,
          color: error
            ? "#dc2626"
            : matched
              ? "#16845b"
              : "var(--muted, #737184)",
        }}
      >
        {error ||
          (lookupPending
            ? "Checking customer..."
            : matched
              ? `Customer: ${matched.name}`
              : "Optional — leave blank for a walk-in customer.")}
      </div>
      {phone && (
        <button
          type="button"
          className="secondary"
          disabled={disabled}
          onClick={() => onChange("")}
          style={{ marginTop: 8 }}
        >
          Use walk-in (clear phone)
        </button>
      )}
    </div>
  );
}
