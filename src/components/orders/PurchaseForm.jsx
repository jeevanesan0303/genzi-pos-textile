import React, { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Modal from "../common/Modal";
import { getCategories } from "../../api/categories";

function emptyItem() {
  return {
    key: crypto.randomUUID(),
    category: "",
    productName: "",
    brand: "",
    quantity: "1",
    unitCost: ""
  };
}

function costInCents(value) {
  const text = String(value).trim();

  if (!/^\d{1,8}(\.\d{1,2})?$/.test(text)) {
    return null;
  }

  const [whole, fraction = ""] = text.split(".");

  return Number(whole) * 100 +
    Number(fraction.padEnd(2, "0"));
}

function lineTotal(item) {
  const cents = costInCents(item.unitCost);
  const quantity = Number(item.quantity);

  if (
    cents === null ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > 1000000
  ) {
    return 0;
  }

  return cents * quantity / 100;
}

export default function PurchaseForm({
  purchase,
  suppliers = [],
  money,
  onSave,
  onClose
}) {
  const [supplierId, setSupplierId] = useState(
    purchase?.supplierId || ""
  );

  const [items, setItems] = useState(() =>
    purchase?.items?.length
      ? purchase.items.map(item => ({
          key: crypto.randomUUID(),
          category: item.category || "",
          productName: item.productName || "",
          brand: item.brand || "",
          quantity: String(item.quantity),
          unitCost: String(item.unitCost)
        }))
      : [emptyItem()]
  );

  const [categories, setCategories] = useState([]);
  const [categoryLoading, setCategoryLoading] = useState(true);
  const [categoryError, setCategoryError] = useState("");
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);

  useEffect(() => {
    let active = true;

    setCategoryLoading(true);
    setCategoryError("");

    getCategories()
      .then(result => {
        if (active) setCategories(result);
      })
      .catch(err => {
        if (active) {
          setCategoryError(
            err.message || "Unable to load categories."
          );
        }
      })
      .finally(() => {
        if (active) setCategoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reload]);

  const companySuppliers = suppliers.filter(
    supplier => supplier.companyName?.trim()
  );

  const formatMoney = money || (value =>
    new Intl.NumberFormat("en-LK", {
      style: "currency",
      currency: "LKR"
    }).format(value)
  );

  const total = items.reduce(
    (sum, item) => sum + lineTotal(item),
    0
  );

  function updateItem(key, field, value) {
    setItems(current =>
      current.map(item =>
        item.key === key
          ? { ...item, [field]: value }
          : item
      )
    );
  }

  function close() {
    if (!saving.current) onClose();
  }

  async function submit(event) {
    event.preventDefault();

    if (saving.current) return;

    setError("");

    if (!companySuppliers.some(s => s.id === supplierId)) {
      setError("Select a supplier company.");
      return;
    }

    if (categoryLoading || categoryError) {
      setError("Load the categories before saving.");
      return;
    }

    const cleanItems = [];

    for (const [index, item] of items.entries()) {
      const row = index + 1;
      const quantity = Number(item.quantity);
      const unitCost = String(item.unitCost).trim();

      if (!categories.some(c => c.name === item.category)) {
        setError(`Product ${row}: select a current category.`);
        return;
      }

      if (!item.productName.trim()) {
        setError(`Product ${row}: enter a product name.`);
        return;
      }

      if (
        !/^\d+$/.test(String(item.quantity)) ||
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        quantity > 1000000
      ) {
        setError(
          `Product ${row}: quantity must be a whole number from 1 to 1,000,000.`
        );
        return;
      }

      if (costInCents(unitCost) === null) {
        setError(
          `Product ${row}: enter a valid cost with up to two decimal places.`
        );
        return;
      }

      cleanItems.push({
        category: item.category,
        productName: item.productName.trim(),
        brand: item.brand.trim(),
        quantity,
        unitCost
      });
    }

    saving.current = true;
    setBusy(true);

    try {
      await onSave(
        {
          supplierId,
          items: cleanItems,
          ...(purchase?.id
            ? { version: purchase.version }
            : {})
        },
        purchase?.id
      );
    } catch (err) {
      setError(err.message || "Unable to save purchase.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal
      title={purchase?.id
        ? "Edit purchase order"
        : "Create purchase order"}
      close={close}
    >
      <form onSubmit={submit}>
        {categoryError && (
          <div role="alert" className="panel">
            <p>{categoryError}</p>
            <button
              type="button"
              className="secondary"
              onClick={() => setReload(value => value + 1)}
              disabled={busy}
            >
              Retry loading categories
            </button>
          </div>
        )}

        {error && (
          <p role="alert" style={{ color: "#b42318" }}>
            {error}
          </p>
        )}

        <fieldset
          disabled={busy}
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          <label>
            Supplier company *
            <select
              value={supplierId}
              onChange={event => setSupplierId(event.target.value)}
              required
            >
              <option value="">Select supplier company</option>

              {companySuppliers.map(supplier => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.companyName} — {supplier.name}
                </option>
              ))}
            </select>
          </label>

          {!companySuppliers.length && (
            <p>
              Add a supplier with a company name in Suppliers first.
            </p>
          )}

          {items.map((item, index) => {
            const oldCategory = item.category &&
              !categories.some(c => c.name === item.category);

            return (
              <div
                key={item.key}
                className="panel"
                style={{ marginTop: 20, padding: 20 }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 16
                  }}
                >
                  <strong>Product {index + 1}</strong>

                  <button
                    type="button"
                    className="secondary"
                    aria-label={`Remove product ${index + 1}`}
                    disabled={items.length === 1}
                    onClick={() => {
                      setItems(current =>
                        current.filter(row => row.key !== item.key)
                      );
                    }}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>

                <div className="form-grid">
                  <label>
                    Category *
                    <select
                      required
                      value={item.category}
                      disabled={categoryLoading || Boolean(categoryError)}
                      onChange={event =>
                        updateItem(
                          item.key,
                          "category",
                          event.target.value
                        )
                      }
                    >
                      <option value="">
                        {categoryLoading
                          ? "Loading categories..."
                          : "Select category"}
                      </option>

                      {oldCategory && (
                        <option value={item.category} disabled>
                          {item.category} — select a current category
                        </option>
                      )}

                      {categories.map(category => (
                        <option
                          key={category.id}
                          value={category.name}
                        >
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Product *
                    <input
                      required
                      maxLength={150}
                      value={item.productName}
                      onChange={event =>
                        updateItem(
                          item.key,
                          "productName",
                          event.target.value
                        )
                      }
                    />
                  </label>

                  <label>
                    Brand
                    <input
                      maxLength={100}
                      value={item.brand}
                      onChange={event =>
                        updateItem(item.key, "brand", event.target.value)
                      }
                    />
                  </label>

                  <label>
                    Quantity *
                    <input
                      type="number"
                      required
                      min="1"
                      max="1000000"
                      step="1"
                      value={item.quantity}
                      onChange={event =>
                        updateItem(
                          item.key,
                          "quantity",
                          event.target.value
                        )
                      }
                    />
                  </label>

                  <label>
                    Unit cost (LKR) *
                    <input
                      type="number"
                      required
                      min="0"
                      max="99999999.99"
                      step="0.01"
                      value={item.unitCost}
                      onChange={event =>
                        updateItem(
                          item.key,
                          "unitCost",
                          event.target.value
                        )
                      }
                    />
                  </label>

                  <div>
                    <small>Line total</small>
                    <p><strong>{formatMoney(lineTotal(item))}</strong></p>
                  </div>
                </div>
              </div>
            );
          })}

          <button
            type="button"
            className="secondary"
            style={{ marginTop: 16 }}
            disabled={items.length >= 50}
            onClick={() =>
              setItems(current => [...current, emptyItem()])
            }
          >
            <Plus size={17} /> Add product row
          </button>

          <p>
            <strong>Total: {formatMoney(total)}</strong>
          </p>

          {!categoryLoading && !categoryError && !categories.length && (
            <p>Add a category in Categories before creating a purchase.</p>
          )}

          <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
            <button
              type="submit"
              disabled={
                categoryLoading ||
                Boolean(categoryError) ||
                !categories.length ||
                !companySuppliers.length
              }
            >
              {busy ? "Saving..." : "Save purchase"}
            </button>

            <button
              type="button"
              className="secondary"
              onClick={close}
            >
              Cancel
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}