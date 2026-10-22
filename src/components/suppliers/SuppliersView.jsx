import React, { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";

import DataTable from "../common/DataTable";
import SupplierForm from "./SupplierForm";

import {
  getSuppliers,
  getSupplier,
  saveSupplier,
  deleteSupplier
} from "../../api/suppliers";

export default function SuppliersView({
  title,
  query = ""
}) {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(null);

  const mounted = useRef(false);
  const operation = useRef(false);
  const readVersion = useRef(0);

  function sameSession(token) {
    return mounted.current &&
      token === sessionStorage.getItem("genzi_api_token");
  }

  async function refreshSuppliers() {
    if (operation.current) return;

    const version = ++readVersion.current;
    const token = sessionStorage.getItem("genzi_api_token");

    setLoading(true);
    setError("");

    try {
      const result = await getSuppliers();

      if (
        !sameSession(token) ||
        version !== readVersion.current
      ) return;

      setSuppliers(result);
    } catch (failure) {
      if (
        sameSession(token) &&
        version === readVersion.current
      ) {
        setError(failure.message || "Unable to load suppliers.");
      }
    } finally {
      if (
        mounted.current &&
        version === readVersion.current
      ) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    mounted.current = true;
    refreshSuppliers();

    return () => {
      mounted.current = false;
      readVersion.current += 1;
    };
  }, []);

  function addSupplier() {
    if (operation.current || loading) return;

    setError("");
    setEditor({ supplier: null });
  }

  async function editSupplier(id) {
    if (operation.current || loading) return;

    operation.current = true;
    setBusy(true);
    setError("");

    const token = sessionStorage.getItem("genzi_api_token");

    try {
      const supplier = await getSupplier(id);

      if (!sameSession(token)) return;

      setEditor({ supplier });
    } catch (failure) {
      if (sameSession(token)) {
        setError(failure.message);
      }
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function submitSupplier(payload, id) {
    if (operation.current) {
      throw new Error("Wait for the current operation to finish.");
    }

    operation.current = true;
    setBusy(true);

    const token = sessionStorage.getItem("genzi_api_token");

    try {
      const saved = await saveSupplier(payload, id);

      if (!sameSession(token)) return;

      setSuppliers(current => {
        const next = current.filter(item => item.id !== saved.id);
        next.push(saved);

        return next.sort((a, b) => a.name.localeCompare(b.name));
      });

      setError("");
      setEditor(null);

      await Swal.fire({
        icon: "success",
        title: id ? "Supplier updated" : "Supplier created",
        text: "The supplier was saved in the database.",
        timer: 1600,
        showConfirmButton: false
      });
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function removeSupplier(supplier) {
    if (operation.current || loading) return;

    operation.current = true;
    setBusy(true);

    const token = sessionStorage.getItem("genzi_api_token");

    try {
      const confirmation = await Swal.fire({
        title: "Delete supplier?",
        text: `${supplier.name} will be removed from the database.`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Delete supplier",
        cancelButtonText: "Cancel",
        confirmButtonColor: "#dc2626"
      });

      if (!confirmation.isConfirmed || !sameSession(token)) return;

      await deleteSupplier(supplier.id);

      if (!sameSession(token)) return;

      setSuppliers(current =>
        current.filter(item => item.id !== supplier.id)
      );

      setError("");

      await Swal.fire({
        icon: "success",
        title: "Supplier deleted",
        timer: 1400,
        showConfirmButton: false
      });
    } catch (failure) {
      if (sameSession(token)) {
        setError(failure.message || "Unable to delete supplier.");
      }
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const search = query.trim().toLowerCase();

  const visibleSuppliers = suppliers.filter(supplier =>
    [
      supplier.name,
      supplier.companyName,
      supplier.phone,
      supplier.email,
      supplier.address
    ].some(value =>
      String(value || "").toLowerCase().includes(search)
    )
  );

  return (
    <>
      {title(
        "Suppliers",
        "Your sourcing partners, in one place."
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 20
        }}
      >
        <button
          type="button"
          className="primary"
          disabled={loading || busy}
          onClick={addSupplier}
        >
          <Plus size={18} />
          Add supplier
        </button>

        <button
          type="button"
          className="secondary"
          disabled={loading || busy}
          onClick={refreshSuppliers}
        >
          <RefreshCw size={16} />
          {loading ? "Loading..." : "Refresh"}
        </button>

        <span className="muted">
          {visibleSuppliers.length} of {suppliers.length} suppliers
        </span>
      </div>

      {error && (
        <div className="notice danger" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="panel" role="status" style={{ padding: 24 }}>
          Loading suppliers from the database...
        </div>
      ) : (
        <div className="panel table-wrap">
          <DataTable>
            <thead>
              <tr>
                <th>Supplier name</th>
                <th>Company name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Address</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {visibleSuppliers.map(supplier => (
                <tr key={supplier.id}>
                  <td><b>{supplier.name}</b></td>
                  <td>{supplier.companyName || "—"}</td>
                  <td>{supplier.phone}</td>
                  <td>{supplier.email || "—"}</td>

                  <td
                    style={{
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                      maxWidth: 280
                    }}
                  >
                    {supplier.address || "—"}
                  </td>

                  <td>
                    <div className="actions">
                      <button
                        type="button"
                        className="icon"
                        aria-label={`Edit ${supplier.name}`}
                        disabled={busy}
                        onClick={() => editSupplier(supplier.id)}
                      >
                        <Pencil size={16} />
                      </button>

                      <button
                        type="button"
                        className="icon danger"
                        aria-label={`Delete ${supplier.name}`}
                        disabled={busy}
                        onClick={() => removeSupplier(supplier)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>

          {!visibleSuppliers.length && (
            <p style={{ padding: 24, textAlign: "center" }}>
              {suppliers.length
                ? "No suppliers match your search."
                : "No database suppliers yet. Click Add supplier."}
            </p>
          )}
        </div>
      )}

      {editor && (
        <SupplierForm
          key={editor.supplier?.id || "new"}
          supplier={editor.supplier}
          onSave={submitSupplier}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  );
}