import React, { useEffect, useRef, useState } from "react";

export default function ReceiptSms({
  sale,
  printing = false,
  saving = false,
  onSent,
}) {
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [notice, setNotice] = useState("");
  const [hasError, setHasError] = useState(false);

  const lock = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  async function sendSms() {
    if (
      lock.current ||
      accepted ||
      printing ||
      saving
    ) {
      return;
    }

    setNotice("");
    setHasError(false);

    if (!navigator.onLine) {
      setHasError(true);
      setNotice("Connect to the internet before sending SMS.");
      return;
    }

    if (!sale.id) {
      setHasError(true);
      setNotice("Save and sync this sale before sending SMS.");
      return;
    }

    const token = sessionStorage.getItem("genzi_api_token");

    if (!token) {
      setHasError(true);
      setNotice("Please sign in again before sending SMS.");
      return;
    }

    lock.current = true;
    setBusy(true);

    try {
      const apiBase = (
        import.meta.env.VITE_API_URL ||
        import.meta.env.VITE_API_BASE_URL ||
        "/api"
      ).replace(/\/+$/, "");

      const response = await fetch(
        `${apiBase}/receipts/${encodeURIComponent(sale.id)}/sms`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },

          // The backend gets the customer's phone
          // directly from the saved sale.
          body: JSON.stringify({}),
        }
      );

      let result;

      try {
        result = await response.json();
      } catch {
        throw new Error(
          "Unexpected API response. Check receipt API routing and Notify.lk Logs before retrying."
        );
      }

      if (!response.ok) {
        throw new Error(
          result.message || "Unable to send SMS."
        );
      }

      if (!mounted.current) return;

      setAccepted(true);
      setNotice(
        result.message || "SMS accepted by Notify.lk."
      );
            onSent?.();
    } catch (error) {
      if (!mounted.current) return;

      setHasError(true);
      setNotice(
        error.message ||
          "Sending could not be confirmed. Check Notify.lk Logs before retrying."
      );
    } finally {
      lock.current = false;

      if (mounted.current) {
        setBusy(false);
      }
    }
  }

  return (
    <div
      className="gr-sms-form gr-no-print"
      style={{
        display: "block",
        margin: 0,
        padding: 0,
        border: 0,
      }}
    >
      <button
        type="button"
        className="secondary full"
        style={{
          width: "100%",
          minHeight: 44,
        }}
        disabled={
          busy ||
          accepted ||
          printing ||
          saving ||
          !sale.id
        }
        onClick={() => void sendSms()}
      >
        {busy
          ? "Sending SMS…"
          : accepted
            ? "SMS accepted"
            : "Send SMS"}
      </button>

      {notice && (
        <p
          role={hasError ? "alert" : "status"}
          aria-live="polite"
          style={{
            margin: "10px 0 0",
            fontSize: 13,
            lineHeight: 1.5,
            color: hasError ? "#ef4444" : "#22c55e",
          }}
        >
          {notice}
        </p>
      )}
    </div>
  );
}