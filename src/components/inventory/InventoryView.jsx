import React, { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import { Pencil, RefreshCw } from "lucide-react";

import DataTable from "../common/DataTable";
import { getProducts } from "../../api/products";
import { updateProductStock } from "../../api/inventory";

import "./InventoryView.css";

export default function InventoryView({
  title,
  money,
  query = ""
}) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  const mounted = useRef(false);
  const readVersion = useRef(0);
  const operation = useRef(false);
  const reading = useRef(false);

  function sameSession(token) {
    return mounted.current &&
      token === sessionStorage.getItem("genzi_api_token");
  }

  async function refreshProducts() {
    if (operation.current) return;

    const version = ++readVersion.current;
    const token = sessionStorage.getItem("genzi_api_token");

    reading.current = true;
    setLoading(true);
    setError("");

    try {
      const result = await getProducts();

      if (
        !sameSession(token) ||
        version !== readVersion.current
      ) {
        return;
      }

      setProducts(result);
    } catch (failure) {
      if (
        sameSession(token) &&
        version === readVersion.current
      ) {
        setError(failure.message || "Unable to load products.");
      }
    } finally {
      if (
        mounted.current &&
        version === readVersion.current
      ) {
        reading.current = false;
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    mounted.current = true;
    refreshProducts();

    return () => {
      mounted.current = false;
      readVersion.current += 1;
    };
  }, []);

  async function editStock(product) {
    if (operation.current || reading.current) return;

    operation.current = true;
    setBusyId(product.id);
    setError("");

    const token = sessionStorage.getItem("genzi_api_token");

    try {
      const result = await Swal.fire({
        title: "Update stock count",
        text:
          `${product.name} · SKU ${product.sku}. ` +
          `Current stock: ${product.stock}. Enter the new total quantity.`,
        input: "number",
        inputValue: product.stock,
        inputLabel: "New stock quantity",
        inputAttributes: {
          min: "0",
          max: "1000000000",
          step: "1",
          inputmode: "numeric"
        },
        showCancelButton: true,
        confirmButtonText: "Save stock",
        cancelButtonText: "Cancel",
        showLoaderOnConfirm: true,
        allowOutsideClick: () => !Swal.isLoading(),
        allowEscapeKey: () => !Swal.isLoading(),

        preConfirm: async value => {
          const raw = String(value).trim();
          const stock = Number(raw);

          if (
            !/^\d+$/.test(raw) ||
            !Number.isSafeInteger(stock) ||
            stock > 1_000_000_000
          ) {
            Swal.showValidationMessage(
              "Enter a whole number between 0 and 1,000,000,000."
            );
            return false;
          }

          if (!sameSession(token)) {
            Swal.showValidationMessage(
              "Your session changed. Cancel and sign in again."
            );
            return false;
          }

          try {
            return await updateProductStock(
              product.id,
              stock,
              product.stock
            );
          } catch (failure) {
            Swal.showValidationMessage(failure.message);
            return false;
          }
        }
      });

      if (!result.isConfirmed || !sameSession(token)) return;

      const saved = result.value;

      setProducts(current =>
        current.map(item =>
          item.id === saved.id
            ? { ...item, stock: saved.stock }
            : item
        )
      );

      await Swal.fire({
        icon: "success",
        title: "Stock updated",
        text: `Database stock count: ${saved.stock}`,
        timer: 1600,
        showConfirmButton: false
      });
    } catch (failure) {
      if (sameSession(token)) {
        setError(failure.message || "Unable to update stock.");
      }
    } finally {
      operation.current = false;

      if (mounted.current) {
        setBusyId("");
      }
    }
  }

  const low = products.filter(
    product => product.stock <= product.reorderLevel
  );

  const totalUnits = products.reduce(
    (total, product) => total + product.stock,
    0
  );

  const stockValue = products.reduce(
    (total, product) => total + product.stock * product.cost,
    0
  );

  const search = query.trim().toLowerCase();

  const visibleProducts = products.filter(product => {
    const matchesFilter =
      filter === "all" ||
      product.stock <= product.reorderLevel;

    const matchesSearch = [
      product.name,
      product.sku,
      product.category,
      product.brand,
      product.size,
      product.colour
    ].some(value =>
      String(value || "").toLowerCase().includes(search)
    );

    return matchesFilter && matchesSearch;
  });

  return (
    <section className="gz-inventory">
      {title(
        "Stock control",
        "Review database stock and update the physical count of each product."
      )}

      {error && (
        <div className="notice danger" role="alert">
          {error}
        </div>
      )}

      <div className="inventory-summary">
        <div className="panel">
          <small>Units on hand</small>
          <h2>{loading ? "…" : totalUnits}</h2>
        </div>

        <div className="panel">
          <small>Stock cost value</small>
          <h2>{loading ? "…" : money(stockValue)}</h2>
        </div>

        <div className="panel">
          <small>Reorder alerts</small>
          <h2>{loading ? "…" : `${low.length} variants`}</h2>
        </div>
      </div>

      <div className="panel">
        <div
          className="panel-head"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16
          }}
        >
          <div>
            <h3>Replenishment planner</h3>
            <small className="muted">
              Summary cards include all database products.
            </small>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12
            }}
          >
            <label>
              Show{" "}
              <select
                value={filter}
                disabled={loading || Boolean(busyId)}
                onChange={event => setFilter(event.target.value)}
              >
                <option value="all">All products</option>
                <option value="low">Needs reorder</option>
              </select>
            </label>

            <button
              type="button"
              className="secondary"
              disabled={loading || Boolean(busyId)}
              onClick={refreshProducts}
            >
              <RefreshCw size={16} />
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        {loading ? (
          <p role="status" style={{ padding: 20 }}>
            Loading stock from the database...
          </p>
        ) : (
          <div className="table-wrap">
            <DataTable>
              <thead>
                <tr>
                  <th>Variant</th>
                  <th>Category</th>
                  <th>Available / minimum</th>
                  <th>Suggested order</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {visibleProducts.map(product => {
                  const needsReorder =
                    product.stock <= product.reorderLevel;

                  const suggestedOrder = needsReorder
                    ? Math.max(
                        0,
                        2 * product.reorderLevel - product.stock
                      )
                    : 0;

                  return (
                    <tr key={product.id}>
                      <td>
                        <b>{product.name}</b>
                        <small style={{ display: "block" }}>
                          {product.sku}
                          {" · "}
                          {product.size || "—"}
                          {" · "}
                          {product.colour || "—"}
                        </small>
                      </td>

                      <td>{product.category}</td>

                      <td>
                        <b>{product.stock}</b>
                        {" / "}
                        {product.reorderLevel}
                      </td>

                      <td>{suggestedOrder}</td>

                      <td>
                        <span
                          className={`badge ${
                            needsReorder ? "amber" : "green"
                          }`}
                        >
                          {product.stock === 0
                            ? "Out of stock"
                            : needsReorder
                              ? "Low stock"
                              : "In stock"}
                        </span>
                      </td>

                      <td>
                        <button
                          type="button"
                          className="small"
                          disabled={Boolean(busyId)}
                          onClick={() => editStock(product)}
                        >
                          <Pencil size={14} />
                          {busyId === product.id
                            ? "Updating..."
                            : "Edit stock"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>

            {!visibleProducts.length && (
              <p style={{ padding: 20 }}>
                {!products.length
                  ? "No database products yet. Add products first."
                  : search
                    ? "No products match your search."
                    : "All products are above their reorder minimum."}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}