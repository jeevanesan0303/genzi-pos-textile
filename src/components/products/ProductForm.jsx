import React, { useRef, useState } from "react";
import Modal from "../common/Modal";

const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024;

const emptyForm = {
  name: "",
  categoryId: "",
  sku: "",
  brand: "",
  size: "",
  colour: "",
  price: "",
  cost: "",
  openingStock: "",
  reorderLevel: "8"
};

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(
      new Error("Unable to read the selected photo.")
    );

    reader.readAsDataURL(file);
  });
}

export default function ProductForm({
  product,
  categories,
  onSave,
  onClose
}) {
  const editing = Boolean(product?.id);

  const [form, setForm] = useState(() => ({
    ...emptyForm,
    ...(product || {})
  }));

  const [photo, setPhoto] = useState(undefined);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [preview, setPreview] = useState(product?.image || "");
  const [busy, setBusy] = useState(false);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [error, setError] = useState("");

  const inFlight = useRef(false);
  const fileInput = useRef(null);

  function change(key, value) {
    setForm(current => ({ ...current, [key]: value }));
    setError("");
  }

  async function choosePhoto(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    setError("");

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPEG, PNG or WebP photo.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_PHOTO_BYTES) {
      setError("Photo must be no larger than 1.5 MiB.");
      event.target.value = "";
      return;
    }

    setReadingPhoto(true);

    try {
      const dataUrl = await readFile(file);
      setPhoto(dataUrl);
      setPreview(dataUrl);
      setRemovePhoto(false);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setReadingPhoto(false);
    }
  }

  async function submit(event) {
    event.preventDefault();

    if (inFlight.current || readingPhoto) return;

    if (!/^[0-9]{6}$/.test(form.sku)) {
      setError("SKU must contain exactly 6 digits.");
      return;
    }

    if (
      !categories.some(
        category => String(category.id) === String(form.categoryId)
      )
    ) {
      setError("Select an available category.");
      return;
    }

    inFlight.current = true;
    setBusy(true);
    setError("");

    try {
      await onSave({
        name: form.name.trim(),
        categoryId: String(form.categoryId),
        sku: form.sku,
        brand: form.brand.trim(),
        size: form.size.trim(),
        colour: form.colour.trim(),
        price: String(form.price),
        cost: String(form.cost),
        reorderLevel: String(form.reorderLevel),
        ...(!editing
          ? { openingStock: String(form.openingStock) }
          : {}),
        ...(photo !== undefined ? { photo } : {}),
        removePhoto
      }, product?.id);
    } catch (failure) {
      setError(failure.message || "Unable to save product.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal
      title={editing ? "Edit product" : "Add product"}
      close={() => {
        if (!inFlight.current && !readingPhoto) onClose();
      }}
    >
      <form onSubmit={submit} aria-busy={busy || readingPhoto}>
        <fieldset
          disabled={busy || readingPhoto}
          style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
        >
          {error && (
            <p className="notice danger" role="alert">
              {error}
            </p>
          )}

          <div className="form-grid">
            <label>
              Product name
              <input
                required
                maxLength={150}
                value={form.name}
                onChange={event => change("name", event.target.value)}
              />
            </label>

            <label>
              Category
              <select
                required
                value={form.categoryId}
                onChange={event => change("categoryId", event.target.value)}
              >
                <option value="">Select category</option>
                {categories.map(category => (
                  <option key={category.id} value={String(category.id)}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              SKU / Barcode — exactly 6 digits
              <input
                required
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                placeholder="001234"
                value={form.sku}
                aria-invalid={
                  Boolean(form.sku) && !/^[0-9]{6}$/.test(form.sku)
                }
                onChange={event => {
                  change(
                    "sku",
                    event.target.value.replace(/\D/g, "").slice(0, 6)
                  );
                }}
              />
              {form.sku && !/^[0-9]{6}$/.test(form.sku) && (
                <small style={{ color: "#dc2626" }}>
                  Enter all 6 digits.
                </small>
              )}
            </label>

            <label>
              Brand
              <input
                maxLength={100}
                value={form.brand}
                onChange={event => change("brand", event.target.value)}
              />
            </label>

            <label>
              Size
              <input
                maxLength={50}
                placeholder="S, M, L, XL, Free..."
                value={form.size}
                onChange={event => change("size", event.target.value)}
              />
            </label>

            <label>
              Colour
              <input
                maxLength={50}
                value={form.colour}
                onChange={event => change("colour", event.target.value)}
              />
            </label>

            <label>
              Selling price (LKR)
              <input
                required
                type="number"
                min="0"
                max="9999999999.99"
                step="0.01"
                value={form.price}
                onChange={event => change("price", event.target.value)}
              />
            </label>

            <label>
              Cost (LKR)
              <input
                required
                type="number"
                min="0"
                max="9999999999.99"
                step="0.01"
                value={form.cost}
                onChange={event => change("cost", event.target.value)}
              />
            </label>

            <label>
              Opening stock
              <input
                required
                type="number"
                min="0"
                max="1000000000"
                step="1"
                disabled={editing}
                value={form.openingStock}
                onChange={event => change("openingStock", event.target.value)}
              />
              {editing && (
                <small>
                  Initial quantity is retained. Current stock: {product.stock}.
                </small>
              )}
            </label>

            <label>
              Reorder minimum
              <input
                required
                type="number"
                min="0"
                max="1000000000"
                step="1"
                value={form.reorderLevel}
                onChange={event => change("reorderLevel", event.target.value)}
              />
            </label>

            <label>
              Product photo — optional
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={choosePhoto}
              />
              <small>JPEG, PNG or WebP, up to 1.5 MiB.</small>
            </label>
          </div>

          {preview && (
            <div style={{ marginTop: 16 }}>
              <img
                src={preview}
                alt="Product preview"
                style={{
                  width: 140,
                  height: 140,
                  objectFit: "cover",
                  borderRadius: 12
                }}
              />

              <div>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setPreview("");
                    setPhoto(undefined);
                    setRemovePhoto(true);

                    if (fileInput.current) {
                      fileInput.current.value = "";
                    }
                  }}
                >
                  Remove photo
                </button>
              </div>
            </div>
          )}

          <div className="modal-footer">
            <button
              type="button"
              className="secondary"
              onClick={onClose}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="primary"
              disabled={!categories.length}
            >
              {busy
                ? "Saving..."
                : readingPhoto
                  ? "Reading photo..."
                  : editing
                    ? "Save changes"
                    : "Create product"}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}