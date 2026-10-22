import React, { useRef, useState } from "react";
import Modal from "../common/Modal";

export default function SupplierForm({
  supplier,
  onSave,
  onClose
}) {
  const editing = Boolean(supplier?.id);

  const [form, setForm] = useState(() => ({
    name: supplier?.name || "",
    companyName: supplier?.companyName || "",
    phone: supplier?.phone || "",
    email: supplier?.email || "",
    address: supplier?.address || ""
  }));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  const phoneInvalid =
    Boolean(form.phone) &&
    !/^0[2-9][0-9]{8}$/.test(form.phone);

  function change(key, value) {
    setForm(current => ({ ...current, [key]: value }));
    setError("");
  }

  function close() {
    if (!inFlight.current) onClose();
  }

  async function submit(event) {
    event.preventDefault();

    if (inFlight.current) return;

    const payload = {
      name: form.name.trim(),
      companyName: form.companyName.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      address: form.address.trim()
    };

    if (!payload.name) {
      setError("Supplier name is required.");
      return;
    }

    if (!/^0[2-9][0-9]{8}$/.test(payload.phone)) {
      setError("Enter a valid 10-digit Sri Lankan phone number.");
      return;
    }

    if (
      payload.email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)
    ) {
      setError("Enter a valid email address.");
      return;
    }

    inFlight.current = true;
    setBusy(true);
    setError("");

    try {
      await onSave(payload, supplier?.id);
    } catch (failure) {
      setError(failure.message || "Unable to save supplier.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal
      title={editing ? "Edit supplier" : "Add supplier"}
      close={close}
    >
      <form onSubmit={submit} aria-busy={busy}>
        <fieldset
          disabled={busy}
          style={{
            border: 0,
            padding: 0,
            margin: 0,
            minWidth: 0
          }}
        >
          {error && (
            <p className="notice danger" role="alert">
              {error}
            </p>
          )}

          <div className="form-grid">
            <label>
              Supplier name *
              <input
                required
                type="text"
                maxLength={150}
                autoComplete="name"
                value={form.name}
                onChange={event => change("name", event.target.value)}
              />
            </label>

            <label>
              Company name
              <input
                type="text"
                maxLength={150}
                autoComplete="organization"
                value={form.companyName}
                onChange={event => {
                  change("companyName", event.target.value);
                }}
              />
            </label>

            <label>
              Phone *
              <input
                required
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                minLength={10}
                maxLength={10}
                pattern="0[2-9][0-9]{8}"
                placeholder="0771234567"
                value={form.phone}
                aria-invalid={phoneInvalid}
                aria-describedby={
                  phoneInvalid ? "supplier-phone-error" : undefined
                }
                style={phoneInvalid
                  ? { borderColor: "#dc2626", color: "#dc2626" }
                  : undefined}
                onChange={event => {
                  change(
                    "phone",
                    event.target.value.replace(/\D/g, "").slice(0, 10)
                  );
                }}
              />

              {phoneInvalid && (
                <small
                  id="supplier-phone-error"
                  style={{ color: "#dc2626" }}
                >
                  Enter 10 digits, starting with 0.
                </small>
              )}
            </label>

            <label>
              Email
              <input
                type="email"
                maxLength={254}
                autoComplete="email"
                value={form.email}
                onChange={event => change("email", event.target.value)}
              />
            </label>

            <label style={{ gridColumn: "1 / -1" }}>
              Address
              <textarea
                rows={3}
                maxLength={500}
                autoComplete="street-address"
                value={form.address}
                style={{ width: "100%", resize: "vertical" }}
                onChange={event => change("address", event.target.value)}
              />
            </label>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="secondary"
              onClick={close}
            >
              Cancel
            </button>

            <button type="submit" className="primary">
              {busy
                ? "Saving..."
                : editing
                  ? "Save changes"
                  : "Create supplier"}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}