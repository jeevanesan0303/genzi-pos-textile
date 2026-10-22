import React, { useMemo, useRef, useState } from "react";
import Modal from "../common/Modal";
import { updateSale } from "../../api/sales";

const money = (value) =>
  new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
  }).format(Number(value) || 0);

function toCents(value) {
  const text = String(value ?? "");

  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text)) return NaN;

  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export default function SaleEditor({
  order,
  products,
  close,
  onSaved,
}) {
  const [items, setItems] = useState(
    order.items.map((item) => ({
      ...item,
      quantity: String(item.quantity),
      price: String(item.price),
    }))
  );

  const [phone, setPhone] = useState(order.customerPhone || "");
  const [discount, setDiscount] = useState(String(order.discount));
  const [method, setMethod] = useState(order.paymentMethod || "Cash");
  const [cashReceived, setCashReceived] = useState(
    String(order.cashReceived || "0")
  );
  const [cardPaid, setCardPaid] = useState(
    String(order.cardPaid || "0")
  );
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const inFlight = useRef(false);

  const availableProducts = useMemo(() => {
    const chosen = new Set(items.map((item) => item.productId));
    const query = search.trim().toLowerCase();

    return products.filter(
      (product) =>
        !chosen.has(product.id) &&
        `${product.name} ${product.sku}`.toLowerCase().includes(query)
    );
  }, [products, items, search]);

  const subtotalCents = items.reduce((sum, item) => {
    const quantity = Number(item.quantity);
    return sum + toCents(item.price) * quantity;
  }, 0);

  const discountCents = toCents(discount);
  const totalCents = subtotalCents - discountCents;

  function updateItem(productId, field, value) {
    setItems((current) =>
      current.map((item) =>
        item.productId === productId
          ? { ...item, [field]: value }
          : item
      )
    );
  }

  function addProduct() {
    const product = availableProducts.find(
      (item) => item.id === selected
    );

    if (!product) return;

    setItems((current) => [
      ...current,
      {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        size: product.size,
        colour: product.colour,
        quantity: "1",
        price: String(product.price),
      },
    ]);

    setSelected("");
    setSearch("");
  }

  async function submit(event) {
    event.preventDefault();

    if (inFlight.current) return;

    setError("");

    const invalidItems = items.some(
      (item) =>
        !Number.isInteger(Number(item.quantity)) ||
        Number(item.quantity) < 1 ||
        Number(item.quantity) > 1000000 ||
        !Number.isSafeInteger(toCents(item.price))
    );

    if (!items.length || invalidItems) {
      setError("Choose products with valid quantities and prices.");
      return;
    }

    if (
      !Number.isSafeInteger(totalCents) ||
      !Number.isSafeInteger(discountCents) ||
      totalCents < 0 ||
      discountCents < 0
    ) {
      setError("Enter a valid discount that does not exceed subtotal.");
      return;
    }

    if (phone && !/^0[2-9]\d{8}$/.test(phone)) {
      setError("Enter a valid 10-digit Sri Lankan phone number.");
      return;
    }

    if (reason.trim().length < 3) {
      setError("Enter a reason for editing this bill.");
      return;
    }

    inFlight.current = true;
    setBusy(true);

    try {
      const saved = await updateSale(order.id, {
        version: order.version,
        customerPhone: phone,
        discount,
        reason: reason.trim(),
        items: items.map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity),
          price: item.price,
        })),
        payment: {
          method,
          cashReceived,
          cardPaid,
        },
      });

      onSaved(saved);
    } catch (failure) {
      setError(failure.message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Edit bill · ${order.number}`}
      close={() => {
        if (!inFlight.current) close();
      }}
    >
      <form className="gz-sale-editor" onSubmit={submit}>
        <fieldset disabled={busy}>
          <p className="gz-sale-note">
            Stock will be adjusted by the difference between the
            original and updated quantities.
          </p>

          <label>
            Customer phone number
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={phone}
              placeholder="Blank for walk-in customer"
              onChange={(event) =>
                setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))
              }
            />
          </label>

          <label>
            Find a product by name or SKU
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setSelected("");
              }}
              placeholder="Search products"
            />
          </label>

          <div className="gz-sale-add">
            <select
              aria-label="Product to add"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">Select product</option>
              {availableProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.sku} · {product.name} · {product.size}
                  {" "}· Stock: {product.stock}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="secondary"
              disabled={!selected || items.length >= 100}
              onClick={addProduct}
            >
              Add item
            </button>
          </div>

          <div className="gz-sale-lines">
            {items.map((item) => (
              <div className="gz-sale-line" key={item.productId}>
                <div className="gz-sale-product">
                  <strong>{item.name}</strong>
                  <small>
                    {item.sku} · {item.size} · {item.colour}
                  </small>
                </div>

                <label>
                  Quantity
                  <input
                    type="number"
                    min="1"
                    max="1000000"
                    step="1"
                    required
                    value={item.quantity}
                    onChange={(event) =>
                      updateItem(
                        item.productId,
                        "quantity",
                        event.target.value
                      )
                    }
                  />
                </label>

                <label>
                  Unit price
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={item.price}
                    onChange={(event) =>
                      updateItem(
                        item.productId,
                        "price",
                        event.target.value
                      )
                    }
                  />
                </label>

                <div>
                  <small>Amount</small>
                  <strong>
                    {money(
                      (toCents(item.price) * Number(item.quantity)) / 100
                    )}
                  </strong>
                </div>

                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    setItems((current) =>
                      current.filter(
                        (line) => line.productId !== item.productId
                      )
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="gz-sale-form-grid">
            <label>
              Discount (LKR)
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
              />
            </label>

            <label>
              Payment method
              <select
                value={method}
                onChange={(event) => setMethod(event.target.value)}
              >
                <option>Cash</option>
                <option>Card</option>
                <option>Split</option>
              </select>
            </label>

            {method === "Split" && (
              <label>
                Card paid (LKR)
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={cardPaid}
                  onChange={(event) => setCardPaid(event.target.value)}
                />
              </label>
            )}

            {method !== "Card" && (
              <label>
                Cash received (LKR)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={cashReceived}
                  onChange={(event) => setCashReceived(event.target.value)}
                />
              </label>
            )}
          </div>

          <div className="gz-sale-editor-total">
            <span>Updated total</span>
            <strong>{money(totalCents / 100)}</strong>
          </div>

          <p className="gz-sale-note">
            Payment changes update the recorded bill only. They do
            not charge or refund a bank card.
          </p>

          <label>
            Reason for editing
            <textarea
              required
              minLength={3}
              maxLength={500}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain why this bill is being corrected"
            />
          </label>

          <div className="gz-sale-form-actions">
            <button type="button" className="secondary" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="primary">
              {busy ? "Saving…" : "Save bill"}
            </button>
          </div>
        </fieldset>

        {error && <p className="gz-sales-error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}