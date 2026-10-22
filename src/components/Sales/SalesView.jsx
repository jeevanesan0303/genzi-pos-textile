import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  Eye,
  Pencil,
  Trash2,
  RefreshCw,
  Download,
} from "lucide-react";

import DataTable from "../common/DataTable";
import ReceiptModal from "../pos/ReceiptModal";
import SaleEditor from "./SaleEditor";

import {
  getSales,
  getSale,
  getSaleProducts,
  deleteSale,
} from "../../api/sales";

import {
  dateText,
  dayKey,
  exportSales,
} from "./salesExport";

import "./SalesView.css";

const money = (value) =>
  new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
  }).format(Number(value) || 0);

function receiptSale(order) {
  return {
    ...order,
    date: order.completedAt,
    payment: order.paymentMethod,
    customer:
      [order.customerName, order.customerPhone]
        .filter(Boolean)
        .join(" · ") || "Walk-in customer",
    cash: Number(order.cashPaid),
    card: Number(order.cardPaid),
    cashReceived: Number(order.cashReceived),
    changeDue: Number(order.changeDue),
    total: Number(order.total),
    discount: Number(order.discount),
    returns: [],
    items: order.items.map((item) => ({
      ...item,
      id: item.productId,
      productId: item.productId,
      qty: Number(item.quantity),
      price: Number(item.price),
    })),
  };
}

export default function SalesView({
  settings = {},
  setPage,
}) {
  const [sales, setSales] = useState([]);
  const [permissions, setPermissions] = useState({
    canEdit: false,
    canDelete: false,
  });

  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("Active");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(null);
  const [editor, setEditor] = useState(null);

  const actionLock = useRef(false);
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;

    setLoading(true);
    setError("");

    try {
      const result = await getSales();

      if (sequence !== loadSequence.current) return;

      setSales(result.sales);
      setPermissions(result.permissions);
    } catch (failure) {
      if (sequence === loadSequence.current) {
        setError(failure.message);
      }
    } finally {
      if (sequence === loadSequence.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    load();

    return () => {
      loadSequence.current += 1;
    };
  }, [load]);

  const invalidDates = Boolean(from && to && from > to);

  const filtered = useMemo(() => {
    if (invalidDates) return [];

    const query = search.trim().toLowerCase();

    return sales.filter((sale) => {
      const date = dayKey(sale.completedAt);

      const statusMatches =
        status === "All" ||
        (status === "Active"
          ? !sale.deletedAt
          : sale.displayStatus === status);

      return (
        sale.number.toLowerCase().includes(query) &&
        (!from || date >= from) &&
        (!to || date <= to) &&
        statusMatches
      );
    });
  }, [sales, search, from, to, status, invalidDates]);

  const activeTotal = filtered
    .filter((sale) => !sale.deletedAt)
    .reduce((sum, sale) => sum + Number(sale.total), 0);

  async function action(work) {
    if (actionLock.current) return;

    actionLock.current = true;
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await work();
    } catch (failure) {
      setError(failure.message);
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }

  function view(sale) {
    action(async () => {
      const order = await getSale(sale.id);

      if (order.deletedAt) {
        throw new Error("Deleted bills cannot be printed as valid receipts.");
      }

      setPreview(order);
    });
  }

  function edit(sale) {
    action(async () => {
      const [order, products] = await Promise.all([
        getSale(sale.id),
        getSaleProducts(),
      ]);

      if (order.deletedAt) {
        throw new Error("This bill has already been deleted.");
      }

      setEditor({ order, products });
    });
  }

  function remove(sale) {
    const reason = window.prompt(
      `Delete ${sale.number}?\n\nThis cancels the bill and restores its stock.\nEnter the reason:`
    );

    if (reason === null) return;

    if (reason.trim().length < 3) {
      setError("Enter a deletion reason with at least 3 characters.");
      return;
    }

    action(async () => {
      await deleteSale(sale.id, sale.version, reason.trim());
      await load();

      setNotice(`${sale.number} deleted. Stock has been restored.`);
      window.dispatchEvent(new Event("genzi-sales-changed"));
    });
  }

  async function saved(order) {
    setEditor(null);

    // Update this row immediately, then refresh the database list.
    setSales((current) =>
      current.map((sale) => (sale.id === order.id ? order : sale))
    );

    setNotice(`${order.number} updated successfully.`);
    window.dispatchEvent(new Event("genzi-sales-changed"));

    await load();
  }

  function resetFilters() {
    setSearch("");
    setFrom("");
    setTo("");
    setStatus("Active");
  }

  return (
    <section className="gz-sales">
      <div className="gz-sales-heading">
        <div>
          <small>GEN ZI CORNER / WORKSPACE</small>
          <h1>Sales & bills</h1>
          <p>View receipts and correct recorded sales.</p>
        </div>

        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() => setPage("POS Checkout")}
        >
          <Plus size={17} />
          New sale
        </button>
      </div>

      <div className="gz-sales-cards">
        <div>
          <small>Matching bills</small>
          <strong>{filtered.length}</strong>
        </div>

        <div>
          <small>Sales total · excluding deleted bills</small>
          <strong>{money(activeTotal)}</strong>
        </div>

        <div>
          <small>Edited bills in this selection</small>
          <strong>
            {filtered.filter(
              (sale) => sale.editedAt && !sale.deletedAt
            ).length}
          </strong>
        </div>
      </div>

      <div className="gz-sales-controls">
        <label className="gz-sales-search">
          Receipt number
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search GZ-00000010"
          />
        </label>

        <label>
          From date
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>

        <label>
          To date
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>

        <label>
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="Active">Active bills</option>
            <option value="Completed">Completed · never edited</option>
            <option value="Edited">Edited</option>
            <option value="Deleted">Deleted</option>
            <option value="All">All bills</option>
          </select>
        </label>

        <button
          type="button"
          className="secondary"
          onClick={resetFilters}
        >
          Reset
        </button>

        <button
          type="button"
          className="secondary"
          disabled={loading || busy}
          onClick={load}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="gz-sales-export">
        <span>Export matching bills:</span>

        {[
          ["pdf", "PDF"],
          ["xlsx", "Excel"],
          ["csv", "CSV"],
        ].map(([format, label]) => (
          <button
            key={format}
            type="button"
            className="secondary"
            disabled={!filtered.length || loading || busy}
            onClick={() => action(() => exportSales(format, filtered))}
          >
            <Download size={15} />
            {label}
          </button>
        ))}
      </div>

      {invalidDates && (
        <p className="gz-sales-error">
          From date must not be after To date.
        </p>
      )}

      {error && (
        <p className="gz-sales-error" role="alert">{error}</p>
      )}

      {notice && (
        <p className="gz-sales-success" role="status">{notice}</p>
      )}

      <div className="gz-sales-table-panel">
        {loading && <p role="status">Loading sales…</p>}

        <div className="gz-sales-scroll">
          <DataTable aria-label="Database sales orders">
            <thead>
              <tr>
                <th>Receipt / Sale date</th>
                <th>Customer</th>
                <th>Cashier</th>
                <th>Payment</th>
                <th>Total</th>
                <th>Status / Edited on</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((sale) => (
                <tr key={sale.id}>
                  <td>
                    <strong>{sale.number}</strong>
                    <small>{dateText(sale.completedAt)}</small>
                  </td>

                  <td>
                    {sale.customerName || "Walk-in customer"}
                    <small>{sale.customerPhone}</small>
                  </td>

                  <td>{sale.cashierName}</td>
                  <td>{sale.paymentMethod}</td>
                  <td className="gz-sales-money">{money(sale.total)}</td>

                  <td>
                    <span
                      className={`gz-sales-status ${sale.displayStatus.toLowerCase()}`}
                    >
                      {sale.displayStatus}
                    </span>

                    {sale.editedAt && (
                      <small>
                        Edited: {dateText(sale.editedAt)}
                        <br />
                        By {sale.editedBy}
                      </small>
                    )}

                    {sale.deletedAt && (
                      <small>
                        Deleted: {dateText(sale.deletedAt)}
                        <br />
                        By {sale.deletedBy}
                      </small>
                    )}

                    {sale.editReason && (
                      <small>Reason: {sale.editReason}</small>
                    )}
                  </td>

                  <td>
                    <div className="gz-sales-actions">
                      <button
                        type="button"
                        className="secondary"
                        title="View and print receipt"
                        aria-label={`View ${sale.number}`}
                        disabled={busy || Boolean(sale.deletedAt)}
                        onClick={() => view(sale)}
                      >
                        <Eye size={16} />
                      </button>

                      {permissions.canEdit && (
                        <button
                          type="button"
                          className="secondary"
                          title="Edit bill"
                          aria-label={`Edit ${sale.number}`}
                          disabled={busy || Boolean(sale.deletedAt)}
                          onClick={() => edit(sale)}
                        >
                          <Pencil size={16} />
                        </button>
                      )}

                      {permissions.canDelete && (
                        <button
                          type="button"
                          className="secondary gz-sales-delete"
                          title="Delete bill and restore stock"
                          aria-label={`Delete ${sale.number}`}
                          disabled={busy || Boolean(sale.deletedAt)}
                          onClick={() => remove(sale)}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>

        {!loading && !filtered.length && (
          <p className="gz-sales-empty">
            No bills match these filters.
          </p>
        )}
      </div>

      {editor &&
        createPortal(
          <SaleEditor
            key={`${editor.order.id}-${editor.order.version}`}
            order={editor.order}
            products={editor.products}
            close={() => setEditor(null)}
            onSaved={saved}
          />,
          document.body
        )}

      {preview &&
        createPortal(
          <ReceiptModal
            close={() => setPreview(null)}
            data={{
              products: [],
              settings: {
                ...settings,
                ...(preview.settings || {}),
                receiptWidth:
                  preview.settings?.width ??
                  settings.receiptWidth ??
                  80,
              },
            }}
            modal={{ sale: receiptSale(preview) }}
            money={money}
          />,
          document.body
        )}
    </section>
  );
}