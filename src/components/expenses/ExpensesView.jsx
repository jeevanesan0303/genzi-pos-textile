import React, {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

import { Plus, RefreshCw, Pencil, Trash2 } from "lucide-react";
import Swal from "sweetalert2";

import Modal from "../common/Modal";
import DataTable from "../common/DataTable";

import "./ExpensesView.css";

import {
  getExpenses,
  saveExpense,
  deleteExpense
} from "../../api/expenses";

const CATEGORIES = [
  "Rent",
  "Utilities",
  "Salaries",
  "Transport",
  "Maintenance",
  "Marketing",
  "Office supplies",
  "Other"
];

function today() {
  const now = new Date();

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");
}

function sortExpenses(rows) {
  return [...rows].sort((a, b) =>
    b.date.localeCompare(a.date) ||
    String(b.createdAt).localeCompare(String(a.createdAt))
  );
}

function ExpenseForm({ expense, onSave, onClose }) {
  const [form, setForm] = useState({
    name: expense?.name || "",
    date: expense?.date || today(),
    category: expense?.category || "",
    amount: expense ? String(expense.amount) : ""
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);

  function change(field, value) {
    setForm(current => ({ ...current, [field]: value }));
    setError("");
  }

  function close() {
    if (!saving.current) onClose();
  }

  async function submit(event) {
    event.preventDefault();

    if (saving.current) return;

    setError("");

    if (!form.name.trim() || !form.category.trim()) {
      setError("Enter a description and select a category.");
      return;
    }

    if (
      !/^\d{1,10}(\.\d{1,2})?$/.test(form.amount) ||
      Number(form.amount) <= 0
    ) {
      setError(
        "Enter an amount greater than zero, with up to two decimals."
      );
      return;
    }

    saving.current = true;
    setBusy(true);

    try {
      await onSave(
        {
          ...form,
          name: form.name.trim(),
          category: form.category.trim()
        },
        expense?.id
      );
    } catch (err) {
      setError(err.message || "Unable to save expense.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  const categories = Array.from(
    new Set([...CATEGORIES, expense?.category].filter(Boolean))
  );

  return (
    <Modal
      title={expense ? "Edit expense" : "Add expense"}
      close={close}
    >
      <form className="gz-expense-form" onSubmit={submit}>
        {error && (
          <p className="gz-expense-form-error" role="alert">
            {error}
          </p>
        )}

        <fieldset
          disabled={busy}
          style={{ border: 0, margin: 0, padding: 0 }}
        >
          <div className="form-grid">
            <label className="gz-expense-description-field">
              Description *
              <input
                required
                maxLength={200}
                value={form.name}
                placeholder="Example: October electricity bill"
                onChange={event => change("name", event.target.value)}
              />
            </label>

            <label>
              Date *
              <input
                required
                type="date"
                min="1000-01-01"
                max="9999-12-31"
                value={form.date}
                onChange={event => change("date", event.target.value)}
              />
            </label>

            <label>
              Category *
              <select
                required
                value={form.category}
                onChange={event =>
                  change("category", event.target.value)
                }
              >
                <option value="">Select expense category</option>

                {categories.map(category => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label className="gz-expense-amount-field">
              Amount (LKR) *
              <input
                required
                type="number"
                min="0.01"
                max="9999999999.99"
                step="0.01"
                value={form.amount}
                placeholder="0.00"
                onChange={event => change("amount", event.target.value)}
              />
            </label>
          </div>

          <div className="gz-expense-form-actions">
            <button type="submit">
              {busy ? "Saving..." : "Save expense"}
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

export default function ExpensesView({
  title,
  query = "",
  money
}) {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(null);

  const mounted = useRef(false);
  const operation = useRef(false);
  const loadVersion = useRef(0);

  const formatMoney = money || (value =>
    new Intl.NumberFormat("en-LK", {
      style: "currency",
      currency: "LKR"
    }).format(Number(value) || 0)
  );

  const refresh = useCallback(async () => {
    const version = ++loadVersion.current;

    setLoading(true);
    setError("");

    try {
      const rows = await getExpenses();

      if (mounted.current && version === loadVersion.current) {
        setExpenses(sortExpenses(rows));
      }
    } catch (err) {
      if (mounted.current && version === loadVersion.current) {
        setError(err.message || "Unable to load expenses.");
      }
    } finally {
      if (mounted.current && version === loadVersion.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();

    return () => {
      mounted.current = false;
      loadVersion.current += 1;
    };
  }, [refresh]);

  async function handleSave(values, id) {
    const saved = await saveExpense(values, id);

    if (!mounted.current) return;

    // Prevent an older list response from overwriting this save.
    loadVersion.current += 1;

    setExpenses(current =>
      sortExpenses([
        saved,
        ...current.filter(row => row.id !== saved.id)
      ])
    );

    setEditor(null);
    setError("");

    void Swal.fire({
      icon: "success",
      title: id ? "Expense updated" : "Expense saved",
      text: "The server confirmed the database write.",
      timer: 1600,
      showConfirmButton: false
    });
  }

  async function handleDelete(expense) {
    if (operation.current) return;

    operation.current = true;
    setBusy(true);

    try {
      const confirmation = await Swal.fire({
        icon: "warning",
        title: "Delete expense?",
        text: `${expense.name} — ${formatMoney(expense.amount)}`,
        showCancelButton: true,
        confirmButtonText: "Delete expense",
        confirmButtonColor: "#dc2626",
        cancelButtonText: "Cancel"
      });

      if (!confirmation.isConfirmed || !mounted.current) return;

      await deleteExpense(expense.id);

      if (!mounted.current) return;

      loadVersion.current += 1;

      setExpenses(current =>
        current.filter(row => row.id !== expense.id)
      );

      setError("");

      void Swal.fire({
        icon: "success",
        title: "Expense deleted",
        timer: 1400,
        showConfirmButton: false
      });
    } catch (err) {
      if (mounted.current) {
        setError(err.message || "Unable to delete expense.");
      }
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const search = String(query).trim().toLowerCase();

  const visible = expenses.filter(expense =>
    [
      expense.name,
      expense.category,
      expense.date,
      expense.amount
    ].some(value => String(value).toLowerCase().includes(search))
  );

  // Sum rounded cents to avoid accumulating decimal fractions.
  const totalCents = visible.reduce(
    (sum, expense) =>
      sum + Math.round(Number(expense.amount) * 100),
    0
  );

  return (
    <section className="gz-expenses">
      {title(
        "Expenses",
        "Record store operating costs for clear business reports."
      )}

      <div className="gz-expenses-toolbar">
        <div className="gz-expenses-toolbar-buttons">
          <button
            type="button"
            className="gz-expenses-add"
            disabled={loading || busy}
            onClick={() => setEditor({ expense: null })}
          >
            <Plus size={17} />
            Add expense
          </button>

          <button
            type="button"
            className="secondary"
            disabled={loading || busy}
            onClick={refresh}
          >
            <RefreshCw size={17} />
            {loading ? " Loading..." : " Refresh"}
          </button>
        </div>

        <div className="gz-expenses-summary">
          <span className="gz-expenses-count">
            {visible.length} expenses
          </span>

          <div className="gz-expenses-total">
            <small>Total expenses</small>
            <strong>{formatMoney(totalCents / 100)}</strong>
          </div>
        </div>
      </div>

      {error && (
        <div className="gz-expenses-error" role="alert">
          {error}
        </div>
      )}

      <div className="panel table-wrap gz-expenses-table">
        {loading ? (
          <p role="status">Loading expenses...</p>
        ) : (
          <>
            <DataTable>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {visible.map(expense => (
                  <tr key={expense.id}>
                    <td>{expense.name}</td>
                    <td>{expense.date}</td>

                    <td>
                      <span className="gz-expense-category">
                        {expense.category}
                      </span>
                    </td>

                    <td className="gz-expense-amount">
                      {formatMoney(expense.amount)}
                    </td>

                    <td>
                      <div className="gz-expense-row-actions">
                        <button
                          type="button"
                          className="small secondary gz-expense-edit"
                          disabled={busy}
                          onClick={() => setEditor({ expense })}
                        >
                          <Pencil size={15} />
                          Edit
                        </button>

                        <button
                          type="button"
                          className="small secondary gz-expense-delete"
                          disabled={busy}
                          onClick={() => handleDelete(expense)}
                        >
                          <Trash2 size={15} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>

            {!visible.length && !error && (
              <p className="gz-expenses-empty">
                {search
                  ? "No expenses match your search."
                  : "No expenses recorded. Click Add expense."}
              </p>
            )}
          </>
        )}
      </div>

      {editor && (
        <ExpenseForm
          key={editor.expense?.id || "new"}
          expense={editor.expense}
          onSave={handleSave}
          onClose={() => setEditor(null)}
        />
      )}
    </section>
  );
}