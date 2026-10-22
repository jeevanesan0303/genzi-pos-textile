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

import "./CustomersView.css";

import {
  getCustomers,
  saveCustomer,
  deleteCustomer
} from "../../api/customers";

function sortCustomers(rows) {
  return [...rows].sort((a, b) =>
    a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
  );
}

function CustomerForm({ customer, onSave, onClose }) {
  const [name, setName] = useState(customer?.name || "");
  const [phone, setPhone] = useState(
    customer?.phonenumber || ""
  );

  const [phoneTouched, setPhoneTouched] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const saving = useRef(false);

  const phoneValid = /^[0-9]{10}$/.test(phone);
  const showPhoneError =
    !phoneValid && (phoneTouched || phone.length > 0);

  function close() {
    if (!saving.current) onClose();
  }

  function changePhone(event) {
    const value = event.target.value;

    // Reject non-digits and values longer than ten digits.
    if (!/^[0-9]{0,10}$/.test(value)) return;

    setPhone(value);
    setError("");
  }

  async function submit(event) {
    event.preventDefault();

    if (saving.current) return;

    setError("");
    setPhoneTouched(true);

    const cleanName = name.trim();

    if (!cleanName || [...cleanName].length > 150) {
      setError("Customer name must contain 1 to 150 characters.");
      return;
    }

    if (!phoneValid) {
      setError("Phone number must contain exactly 10 digits.");
      return;
    }

    saving.current = true;
    setBusy(true);

    try {
      await onSave(
        {
          name: cleanName,
          phonenumber: phone
        },
        customer?.id
      );
    } catch (err) {
      setError(err.message || "Unable to save customer.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal
      title={customer ? "Edit customer" : "Add customer"}
      close={close}
    >
      <form
        className="gz-customer-form"
        onSubmit={submit}
        noValidate
      >
        {error && (
          <p role="alert" style={{ color: "#b42318" }}>
            {error}
          </p>
        )}

        <fieldset
          disabled={busy}
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          <div className="form-grid">
            <label htmlFor="customer-name">
              Customer name *
              <input
                id="customer-name"
                name="name"
                required
                maxLength={150}
                autoComplete="name"
                value={name}
                placeholder="Enter customer name"
                onChange={event => {
                  setName(event.target.value);
                  setError("");
                }}
              />
            </label>

            <label htmlFor="customer-phone">
              Phone number *
              <input
                id="customer-phone"
                name="phonenumber"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                required
                maxLength={10}
                pattern="[0-9]{10}"
                value={phone}
                placeholder="0771234567"
                aria-invalid={showPhoneError}
                aria-describedby="customer-phone-help"
                onChange={changePhone}
                onBlur={() => setPhoneTouched(true)}
                style={
                  showPhoneError
                    ? {
                        borderColor: "#dc2626",
                        outlineColor: "#dc2626"
                      }
                    : undefined
                }
              />

              <small
                id="customer-phone-help"
                style={{
                  display: "block",
                  marginTop: 6,
                  color: showPhoneError ? "#b42318" : undefined
                }}
              >
                {showPhoneError
                  ? `Enter exactly 10 digits (${phone.length}/10).`
                  : "10 digits, including the leading zero."}
              </small>
            </label>
          </div>

          <div className="gz-customer-form-actions">
            <button type="submit">
              {busy ? "Saving..." : "Save customer"}
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

export default function CustomersView({
  title,
  query = ""
}) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(null);

  const mounted = useRef(false);
  const operation = useRef(false);
  const loadVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++loadVersion.current;

    setLoading(true);
    setError("");

    try {
      const rows = await getCustomers();

      if (mounted.current && version === loadVersion.current) {
        setCustomers(sortCustomers(rows));
      }
    } catch (err) {
      if (mounted.current && version === loadVersion.current) {
        setError(err.message || "Unable to load customers.");
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
    const saved = await saveCustomer(values, id);

    if (!mounted.current) return;

    loadVersion.current += 1;

    setCustomers(current =>
      sortCustomers([
        saved,
        ...current.filter(customer => customer.id !== saved.id)
      ])
    );

    setEditor(null);
    setError("");

    void Swal.fire({
      icon: "success",
      title: id ? "Customer updated" : "Customer saved",
      text: "The server confirmed the database write.",
      timer: 1600,
      showConfirmButton: false
    });
  }

  async function handleDelete(customer) {
    if (operation.current) return;

    operation.current = true;
    setBusy(true);

    try {
      const confirmation = await Swal.fire({
        icon: "warning",
        title: "Delete customer?",
        text: `${customer.name} — ${customer.phonenumber}`,
        showCancelButton: true,
        confirmButtonText: "Delete customer",
        cancelButtonText: "Cancel",
        confirmButtonColor: "#dc2626"
      });

      if (!confirmation.isConfirmed || !mounted.current) return;

      await deleteCustomer(customer.id);

      if (!mounted.current) return;

      loadVersion.current += 1;

      setCustomers(current =>
        current.filter(row => row.id !== customer.id)
      );

      setError("");

      void Swal.fire({
        icon: "success",
        title: "Customer deleted",
        timer: 1400,
        showConfirmButton: false
      });
    } catch (err) {
      if (mounted.current) {
        setError(err.message || "Unable to delete customer.");
      }
    } finally {
      operation.current = false;

      if (mounted.current) setBusy(false);
    }
  }

  const search = String(query).trim().toLowerCase();

  const visible = customers.filter(customer =>
    customer.name.toLowerCase().includes(search) ||
    customer.phonenumber.includes(search)
  );

  return (
    <section className="gz-customers">
      {title(
        "Customers",
        "Manage customer names and phone numbers."
      )}

      <div className="gz-customers-toolbar">
        <button
          type="button"
          className="gz-customers-add"
          disabled={loading || busy}
          onClick={() => setEditor({ customer: null })}
        >
          <Plus size={17} />
          Add customer
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

        <span>{visible.length} customers</span>
      </div>

      {error && (
        <div
          className="panel"
          role="alert"
          style={{ color: "#b42318", marginBottom: 16 }}
        >
          {error}
        </div>
      )}

      <div className="panel table-wrap">
        {loading ? (
          <p role="status">Loading customers...</p>
        ) : (
          <>
            <DataTable>
              <thead>
                <tr>
                  <th>Customer name</th>
                  <th>Phone number</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {visible.map(customer => (
                  <tr key={customer.id}>
                    <td>{customer.name}</td>
                    <td>{customer.phonenumber}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          className="small secondary"
                          disabled={busy}
                          onClick={() => setEditor({ customer })}
                        >
                          <Pencil size={15} />
                          Edit
                        </button>

                        <button
                          type="button"
                          className="small secondary"
                          disabled={busy}
                          onClick={() => handleDelete(customer)}
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
              <p>
                {search
                  ? "No customers match your search."
                  : "No customers recorded. Click Add customer."}
              </p>
            )}
          </>
        )}
      </div>

      {editor && (
        <CustomerForm
          key={editor.customer?.id || "new"}
          customer={editor.customer}
          onSave={handleSave}
          onClose={() => setEditor(null)}
        />
      )}
    </section>
  );
}