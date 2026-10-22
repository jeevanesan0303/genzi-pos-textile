import React, { useRef, useState } from "react";
import { Save, Printer, Sun, Moon, RefreshCw } from "lucide-react";
import { createPortal } from "react-dom";
import ReceiptModal from "../pos/ReceiptModal";
import { PrintLabel } from "../labels/LabelsView";
import { money } from "../../domain";
import { getSettings, saveSettings } from "../../api/settings";
import UserRolesSecurity from "./UserRolesSecurity";
export default function SettingsView({
  data,
  settingsMeta,
  onSettingsSaved,
  theme,
  setTheme,
  title
}) {
  const [tab, setTab] = useState("General Settings");
  const [draft, setDraft] = useState(() => ({ ...data.settings }));
  const [version, setVersion] = useState(settingsMeta.version);
  const [canEdit, setCanEdit] = useState(settingsMeta.canEdit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [test, setTest] = useState(false);
  const lock = useRef(false);

  function update(key, value) {
    setDraft(current => ({ ...current, [key]: value }));
    setMessage("");
    setError("");
  }

  function field(key, label, options = {}) {
    return (
      <label key={key}>
        {label}
        <input
          type={options.type || "text"}
          value={draft[key] ?? ""}
          disabled={!canEdit || busy}
          onChange={event => update(key, event.target.value)}
          {...options}
        />
      </label>
    );
  }

  function toggle(key, label) {
    return (
      <label className="toggle-row" key={key}>
        <input
          type="checkbox"
          checked={Boolean(draft[key])}
          disabled={!canEdit || busy}
          onChange={event => update(key, event.target.checked)}
        />
        {label}
      </label>
    );
  }

  async function save(event) {
    event.preventDefault();
    if (lock.current || !canEdit) return;

    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const result = await saveSettings(draft, version);
      setDraft(result.settings);
      setVersion(result.version);
      setCanEdit(result.canEdit);
      onSettingsSaved(result);
      setMessage("Store and printer settings saved.");
    } catch (err) {
      setError(err.message || "Unable to save settings.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function reload() {
    if (lock.current) return;

    if (!window.confirm("Reload saved settings and discard unsaved changes?")) {
      return;
    }

    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const result = await getSettings();
      setDraft(result.settings);
      setVersion(result.version);
      setCanEdit(result.canEdit);
      onSettingsSaved(result);
      setMessage("Saved settings loaded.");
    } catch (err) {
      setError(err.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function uploadQR(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (
      !["image/png", "image/jpeg"].includes(file.type) ||
      file.size > 500000
    ) {
      setError("Choose a PNG or JPEG image below 500 KB.");
      return;
    }

    try {
      const result = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Unable to read this image."));
        reader.readAsDataURL(file);
      });

      await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = resolve;
        image.onerror = () => reject(new Error("This image could not be opened."));
        image.src = result;
      });

      update("instagramQr", result);
    } catch (err) {
      setError(err.message);
    }
  }

  const sampleProduct = {
    id: "settings-preview",
    name: "Sample dress",
    sku: "123456",
    size: "M",
    colour: "Black",
    price: 1000
  };

  const testSale = {
    id: "settings-test",
    number: "TEST RECEIPT",
    date: new Date().toISOString(),
    customer: "Walk-in customer",
    payment: "Cash",
    total: 1000,
    subtotal: 1000,
    discount: 0,
    cash: 1000,
    card: 0,
    cashReceived: 1500,
    changeDue: 500,
    settings: {
      ...draft,
      width: Number(draft.receiptWidth)
    },
    items: [{ ...sampleProduct, qty: 1 }],
    returns: []
  };

  return (
    <>
      {title(
        "POS System & Store Configuration",
        "Manage store information, receipts and label printing."
      )}

      <form onSubmit={save}>
        <div className="report-toolbar">
          <div className="chips">
            {[
              "General Settings",
              "Receipt Customization",
              "Label Printers",
              "User Roles & Security"
            ].map(name => (
              <button
                type="button"
                key={name}
                className={tab === name ? "selected" : ""}
                onClick={() => setTab(name)}
              >
                {name}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {tab !== "User Roles & Security" && (
  <div style={{ display: "flex", gap: 8 }}>
    <button type="button" disabled={busy} onClick={reload}>
      <RefreshCw size={16} />
      Reload
    </button>

    <button
      type="submit"
      className="primary"
      disabled={busy || !canEdit}
    >
      <Save size={18} />
      {busy ? "Please wait..." : "Save Settings"}
    </button>
  </div>
)}
          </div>
        </div>

        {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}
        {message && <p role="status">{message}</p>}
        {tab !== "User Roles & Security" && !canEdit && (
  <p>Only Admin can edit these settings.</p>
)}

        {tab === "General Settings" && (
          <section className="panel">
            <h3>Store information</h3>

            <div className="form-grid">
              {field("store", "Store name", { required: true, maxLength: 100 })}
              {field("phone", "Phone number", { type: "tel", maxLength: 30 })}
              {field("address", "Store address", { maxLength: 500 })}
              {field("tagline", "Tagline / subtitle", { maxLength: 150 })}
            </div>

            <h3>Appearance</h3>

            <div className="theme-choices">
              <button
                type="button"
                className={theme === "light" ? "selected" : ""}
                onClick={() => setTheme("light")}
              >
                <Sun /> Light mode
              </button>

              <button
                type="button"
                className={theme === "dark" ? "selected" : ""}
                onClick={() => setTheme("dark")}
              >
                <Moon /> Dark mode
              </button>
            </div>

            <p>Appearance is saved for this browser.</p>
          </section>
        )}

        {tab === "Receipt Customization" && (
          <div className="settings-layout">
            <section className="panel">
              <h3>Receipt layout & hardware</h3>

              {field("receiptPrinter", "Receipt printer display name", {
                maxLength: 150
              })}

              <label>
                Receipt width
                <select
                  value={draft.receiptWidth}
                  disabled={!canEdit || busy}
                  onChange={event => update("receiptWidth", Number(event.target.value))}
                >
                  <option value={58}>58 mm</option>
                  <option value={80}>80 mm</option>
                </select>
              </label>

              <h3>Receipt information</h3>

              {field("store", "Receipt main header", {
                required: true,
                maxLength: 100
              })}
              {field("tagline", "Receipt subtitle", { maxLength: 150 })}
              {field("address", "Address", { maxLength: 500 })}
              {field("phone", "Phone number", { type: "tel", maxLength: 30 })}
              {field("footer", "Receipt footer", { maxLength: 500 })}
              {field("instagramUrl", "Instagram link or handle", {
                maxLength: 500
              })}

              <label>
                Instagram QR image
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  disabled={!canEdit || busy}
                  onChange={uploadQR}
                />
              </label>

              {draft.instagramQr && (
                <>
                  <img
                    src={draft.instagramQr}
                    alt="Instagram QR preview"
                    style={{ width: 100, height: 100, objectFit: "contain" }}
                  />

                  <button
                    type="button"
                    disabled={!canEdit || busy}
                    onClick={() => update("instagramQr", "")}
                  >
                    Use default QR image
                  </button>
                </>
              )}

              <p>
                Upload the actual Instagram QR code. Changing the profile
                text does not generate a new QR code.
              </p>

              {toggle("showLogo", "Show store logo")}
              {toggle("showContact", "Show address and phone")}
              {toggle("autoPrint", "Open print dialog after successful payment")}

              <p>
                Select the physical printer in the browser print dialog.
                The saved display name does not automatically select it.
              </p>
            </section>

            <section className="panel">
              <h3>Receipt preview</h3>

              <p>
                Preview the current values using your existing receipt layout.
                Save Settings to apply them to new bills.
              </p>

              <button
                type="button"
                className="secondary"
                onClick={() => setTest(true)}
              >
                <Printer size={18} />
                Preview / print test receipt
              </button>
            </section>
          </div>
        )}

        {tab === "Label Printers" && (
          <div className="settings-layout">
            <section className="panel">
              <h3>Barcode label printer</h3>

              {field("labelPrinter", "Label printer display name", {
                maxLength: 150
              })}

              <label>
                Paper format
                <select
                  value={draft.labelFormat}
                  disabled={!canEdit || busy}
                  onChange={event => update("labelFormat", event.target.value)}
                >
                  <option>Roll</option>
                  <option>A4 sheet</option>
                </select>
              </label>

              <div className="form-grid">
                {field("labelWidth", "Label width (mm)", {
                  type: "number", min: 25, max: 100, step: 0.01, required: true
                })}
                {field("labelHeight", "Label height (mm)", {
                  type: "number", min: 25, max: 100, step: 0.01, required: true
                })}
                {field("labelColumns", "Columns", {
                  type: "number", min: 1, max: 4, step: 1, required: true
                })}
                {field("labelGap", "Gap between labels (mm)", {
                  type: "number", min: 0, max: 10, step: 0.01, required: true
                })}
              </div>

              <p>
                For roll printing, columns describe labels across one row,
                and gap is the horizontal space between them. The vertical
                feed gap is configured in the printer driver.
              </p>

              <p>
                For A4, gap applies horizontally and vertically.
                The sheet uses 5 mm page margins.
              </p>
            </section>

            <section className="panel">
              <h3>Live label preview</h3>
              <PrintLabel product={sampleProduct} settings={draft} />
              <p>Save settings, then print a test label in Barcode Studio.</p>
            </section>
          </div>
        )}
      </form>

         {tab === "User Roles & Security" && (
        <UserRolesSecurity />
      )}

      {test && createPortal(
        <ReceiptModal
          close={() => setTest(false)}
          data={{ settings: draft, products: [sampleProduct] }}
          modal={{ sale: testSale }}
          money={money}
        />,
        document.body
      )}
    </>
  );
}