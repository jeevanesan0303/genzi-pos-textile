import React, { useState } from 'react';
import Modal from '../common/Modal';
import { applyReturn, returnedQty } from '../../returns';

export default function ReturnModal({
  sale,
  data,
  close,
  submit,
  money,
}) {
  const [qty, setQty] = useState({});
  const [lines, setLines] = useState({});
  const [reason, setReason] = useState('');
  const [condition, setCondition] = useState('Resellable');
  const [payment, setPayment] = useState('Cash');
  const [error, setError] = useState('');

  const round = value => Math.round(value * 100) / 100;

  const hasSelectedItems = Object.values(qty).some(
    value => Number(value) > 0
  );

  let credit = 0;
  let previewError = '';

  if (hasSelectedItems) {
    try {
      const preview = applyReturn(
        data,
        sale.id,
        qty,
        'Exchange preview'
      );

      const original = preview.sales.find(item => item.id === sale.id);
      credit = Number(original.returns.at(-1).total);
    } catch (err) {
      previewError = err.message;
    }
  }

  const replacements = Object.entries(lines)
    .filter(([, quantity]) => Number(quantity) > 0)
    .map(([id, quantity]) => ({
      id,
      qty: Number(quantity),
    }));

  function availableStock(product) {
    const restored =
      condition === 'Resellable'
        ? Number(qty[product.id] || 0)
        : 0;

    return Number(product.stock || 0) + restored;
  }

  const replacementError = replacements.some(line => {
    const product = data.products.find(item => item.id === line.id);

    return (
      !product ||
      !Number.isInteger(line.qty) ||
      line.qty < 1 ||
      line.qty > availableStock(product) ||
      !Number.isFinite(Number(product.price)) ||
      Number(product.price) < 0
    );
  });

  const newTotal = round(
    replacements.reduce((total, line) => {
      const product = data.products.find(item => item.id === line.id);
      return total + Number(product?.price || 0) * line.qty;
    }, 0)
  );

  const difference = round(newTotal - credit);
  const lowerValue = replacements.length > 0 && difference < 0;

  const canSubmit =
    hasSelectedItems &&
    !previewError &&
    replacements.length > 0 &&
    !replacementError &&
    difference >= 0 &&
    reason.trim().length > 0;

  function updateQuantity(setter, id, value) {
    if (value !== '' && !/^\d+$/.test(value)) return;

    setter(current => ({
      ...current,
      [id]: value,
    }));

    setError('');
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!hasSelectedItems) {
      setError('Select the original items to exchange.');
      return;
    }

    if (previewError) {
      setError(previewError);
      return;
    }

    if (!replacements.length) {
      setError('Select at least one replacement item.');
      return;
    }

    if (replacementError) {
      setError('Check replacement quantities and available stock.');
      return;
    }

    if (difference < 0) {
      setError(
        'Replacement value must equal or exceed the exchange value.'
      );
      return;
    }

    if (!reason.trim()) {
      setError('Enter an exchange reason.');
      return;
    }

    setError('');

    submit(qty, reason.trim(), {
      mode: 'exchange',
      replacements,
      condition,
      payment,
    });
  }

  return (
    <Modal title={`Product Exchange · ${sale.number}`} close={close}>
      <p>
        Exchanges only within 5 days of purchase. No cash refunds.
        Replacement items must equal or exceed the exchange value.
      </p>

      <form onSubmit={handleSubmit}>
        <h3>Original bill items</h3>

        <p>
          Select the quantities to exchange. Credit uses the original
          discounted amount paid.
        </p>

        {sale.items.map(item => {
          const remaining = Math.max(
            0,
            Number(item.qty) - returnedQty(sale, item.id)
          );

          return (
            <label key={item.id}>
              {item.sku} · {item.name}
              <small>
                {item.size} / {item.colour} · Available to exchange:{' '}
                {remaining}
              </small>

              <input
                aria-label={`Exchange quantity ${item.name}`}
                type="number"
                inputMode="numeric"
                min="0"
                max={remaining}
                step="1"
                disabled={remaining === 0}
                value={qty[item.id] ?? ''}
                onChange={event =>
                  updateQuantity(setQty, item.id, event.target.value)
                }
              />
            </label>
          );
        })}

        <label>
          Item condition
          <select
            value={condition}
            onChange={event => {
              setCondition(event.target.value);
              setError('');
            }}
          >
            <option value="Resellable">Resellable</option>
            <option value="Damaged">Damaged</option>
          </select>
        </label>

        <p>
          {condition === 'Damaged'
            ? 'Damaged items will not increase saleable stock.'
            : 'Exchanged original items will be restored to saleable stock.'}
        </p>

        {previewError && (
          <p role="alert" style={{ color: '#dc2626' }}>
            {previewError}
          </p>
        )}

        <div className="panel">
          <strong>Exchange value: {money(credit)}</strong>
        </div>

        <h3>Replacement items</h3>

        <p>Select new items using their current selling prices.</p>

        <div style={{ maxHeight: 280, overflowY: 'auto' }}>
          {data.products.map(product => {
            const stock = availableStock(product);

            return (
              <label key={product.id}>
                {product.sku} · {product.name}
                <small>
                  {product.size} / {product.colour} ·{' '}
                  {money(product.price)} · Available stock: {stock}
                </small>

                <input
                  aria-label={`Replacement quantity ${product.name}`}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max={stock}
                  step="1"
                  disabled={stock <= 0}
                  value={lines[product.id] ?? ''}
                  onChange={event =>
                    updateQuantity(
                      setLines,
                      product.id,
                      event.target.value
                    )
                  }
                />
              </label>
            );
          })}
        </div>

        <div className="panel" style={{ marginTop: 16 }}>
          <div className="between">
            <span>Replacement items total</span>
            <strong>{money(newTotal)}</strong>
          </div>

          <div className="between">
            <span>Exchange value</span>
            <strong>{money(credit)}</strong>
          </div>

          <div className="between">
            <span>Additional payment</span>
            <strong>{money(Math.max(0, difference))}</strong>
          </div>

          {lowerValue && (
            <p role="alert" style={{ color: '#dc2626' }}>
              Select additional items worth {money(-difference)}.
              Cash refunds and unused credit are not issued.
            </p>
          )}

          {replacementError && (
            <p role="alert" style={{ color: '#dc2626' }}>
              Check replacement quantities and available stock.
            </p>
          )}
        </div>

        {difference > 0 && (
          <label>
            Additional payment method
            <select
              value={payment}
              onChange={event => setPayment(event.target.value)}
            >
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="Bank Transfer">Bank Transfer</option>
            </select>
          </label>
        )}

        <label>
          Exchange reason
          <input
            required
            maxLength={300}
            placeholder="Enter the reason for this exchange"
            value={reason}
            onChange={event => {
              setReason(event.target.value);
              setError('');
            }}
          />
        </label>

        {error && (
          <p role="alert" style={{ color: '#dc2626' }}>
            {error}
          </p>
        )}

        <div className="modal-footer">
          <button
            type="button"
            className="secondary"
            onClick={close}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="primary"
            disabled={!canSubmit}
          >
            Confirm exchange
          </button>
        </div>
      </form>
    </Modal>
  );
}