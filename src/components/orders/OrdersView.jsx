import React, { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";

import DataTable from "../common/DataTable";
import PurchaseForm from "./PurchaseForm";
import { getSuppliers } from "../../api/suppliers";

import {
  getPurchases,
  getPurchase,
  savePurchase,
  deletePurchase
} from "../../api/purchases";

export default function OrdersView({
  title,
  money,
  query = ""
}) {
  const [purchases, setPurchases] = useState([]);
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

  async function refresh() {
    if (operation.current) return;

    const version = ++readVersion.current;
    const token = sessionStorage.getItem("genzi_api_token");

    setLoading(true);
    setError("");

    try {
      const orders = await getPurchases();

      if (
        !sameSession(token) ||
        version !== readVersion.current
      ) return;

      setPurchases(orders);
    } catch (failure) {
      if (
        sameSession(token) &&
        version === readVersion.current
      ) {
        setError(failure.message);
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
    refresh();

    return () => {
      mounted.current = false;
      readVersion.current += 1;
    };
  }, []);

  async function openEditor(id) {
    if (operation.current || loading) return;

    operation.current = true;
    setBusy(true);
    setError("");

    const token = sessionStorage.getItem("genzi_api_token");

    try {
      const [supplierList, purchase] = await Promise.all([
        getSuppliers(),
        id ? getPurchase(id) : Promise.resolve(null)
      ]);

      if (!sameSession(token)) return;

      setSuppliers(supplierList);
      setEditor({ purchase });
    } catch (failure) {
      if (sameSession(token)) setError(failure.message);
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function submitPurchase(payload, id) {
    if (operation.current) {
      throw new Error("Wait for the current operation to finish.");
    }

    operation.current = true;
    setBusy(true);

    const token = sessionStorage.getItem("genzi_api_token");

    try {
      const saved = await savePurchase(payload, id);

      if (!sameSession(token)) return;

      setPurchases(current => {
        const next = current.filter(order => order.id !== saved.id);
        next.push(saved);

        return next.sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        );
      });

      setError("");
      setEditor(null);

      await Swal.fire({
        icon: "success",
        title: id ? "Purchase updated" : "Purchase created",
        text: "The order and all product rows were saved in the database.",
        timer: 1700,
        showConfirmButton: false
      });
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function remove(order) {
    if (operation.current || loading) return;

    operation.current = true;
    setBusy(true);

    const token = sessionStorage.getItem("genzi_api_token");

    try {
      const confirmation = await Swal.fire({
        title: "Delete purchase order?",
        text:
          `Delete the purchase from ${order.companyName} ` +
          `and its ${order.itemCount} product rows?`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Delete purchase",
        confirmButtonColor: "#dc2626"
      });

      if (!confirmation.isConfirmed || !sameSession(token)) return;

      await deletePurchase(order.id, order.version);

      if (!sameSession(token)) return;

      setPurchases(current =>
        current.filter(item => item.id !== order.id)
      );

      setError("");

      await Swal.fire({
        icon: "success",
        title: "Purchase deleted",
        timer: 1400,
        showConfirmButton: false
      });
    } catch (failure) {
      if (sameSession(token)) setError(failure.message);
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const search = query.trim().toLowerCase();

  const visible = purchases.filter(order =>
    [
      order.id,
      order.companyName,
      order.supplierName
    ].some(value =>
      String(value || "").toLowerCase().includes(search)
    )
  );

  return (
    <>
      {title(
        "Purchase Orders",
        "Record multiple products under one supplier company."
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 20
        }}
      >
        <button
          type="button"
          className="primary"
          disabled={busy || loading}
          onClick={() => openEditor()}
        >
          <Plus size={18} />
          Add purchase
        </button>

        <button
          type="button"
          className="secondary"
          disabled={busy || loading}
          onClick={refresh}
        >
          <RefreshCw size={16} />
          {loading ? "Loading..." : "Refresh"}
        </button>

        <span className="muted">
          {visible.length} purchases
        </span>
      </div>

      {error && (
        <p className="notice danger" role="alert">{error}</p>
      )}

      {loading ? (
        <div className="panel" style={{ padding: 24 }} role="status">
          Loading purchases...
        </div>
      ) : (
        <div className="panel table-wrap">
          <DataTable>
            <thead>
              <tr>
                <th>Supplier company</th>
                <th>Supplier name</th>
                <th>Product rows</th>
                <th>Total units</th>
                <th>Total cost</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {visible.map(order => (
                <tr key={order.id}>
                  <td><b>{order.companyName || "—"}</b></td>
                  <td>{order.supplierName}</td>
                  <td>{order.itemCount}</td>
                  <td>{order.units}</td>
                  <td>{money(order.total)}</td>
                  <td>{new Date(order.createdAt).toLocaleString()}</td>

                  <td>
                    <div className="actions">
                      <button
                        type="button"
                        className="small"
                        disabled={busy}
                        onClick={() => openEditor(order.id)}
                      >
                        <Pencil size={15} />
                        Details / Edit
                      </button>

                      <button
                        type="button"
                        className="icon danger"
                        disabled={busy}
                        aria-label={`Delete purchase from ${order.companyName}`}
                        onClick={() => remove(order)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>

          {!visible.length && (
            <p style={{ padding: 24 }}>
              {purchases.length
                ? "No purchases match your search."
                : "No purchase orders yet. Click Add purchase."}
            </p>
          )}
        </div>
      )}

      {editor && (
        <PurchaseForm
          key={editor.purchase?.id || "new"}
          purchase={editor.purchase}
          suppliers={suppliers}
          money={money}
          onSave={submitPurchase}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  );
}