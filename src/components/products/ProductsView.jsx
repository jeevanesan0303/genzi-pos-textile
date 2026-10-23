
import React, { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";

import CatalogueTools from "./CatalogueTools";
import ProductForm from "./ProductForm";
import "./ProductsView.css";

import { getCategories } from "../../api/categories";
import {
  getProducts,
  getProduct,
  saveProduct,
  deleteProduct
} from "../../api/products";

/* ==========================================
   PRODUCT IMAGE URL CONFIGURATION
========================================== */

const API_BASE = (
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  "https://genzi-api.xyphoraprime.com/api"
).replace(/\/+$/, "");

const API_ORIGIN = API_BASE.replace(/\/api$/, "");

function getProductImageUrl(image) {
  if (!image) return "";

  const value = String(image).trim();

  if (!value) return "";

  if (
    value.startsWith("data:image/") ||
    value.startsWith("blob:")
  ) {
    return value;
  }

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);

      if (
        ["genzicorner.com", "www.genzicorner.com"].includes(
          url.hostname
        ) &&
        url.pathname.startsWith("/api/product-photos/")
      ) {
        return `${API_ORIGIN}${url.pathname}${url.search}`;
      }

      return value;
    } catch {
      return "";
    }
  }

  const path = value.replace(/^\/+/, "");

  if (path.startsWith("api/product-photos/")) {
    return `${API_ORIGIN}/${path}`;
  }

  if (path.startsWith("product-photos/")) {
    return `${API_BASE}/${path}`;
  }

  return `${API_BASE}/product-photos/${path}`;
}

/* ==========================================
   PRODUCT IMAGE COMPONENT
========================================== */

function ProductPhoto({ product }) {
  const imageUrl = getProductImageUrl(product.image);

  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  const initial = String(product.name || "P")
    .charAt(0)
    .toUpperCase();

  return (
    <div className="gz-product-photo">
      {imageUrl && !imageFailed ? (
        <img
          key={imageUrl}
          src={imageUrl}
          alt={product.name || "Product photo"}
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span aria-hidden="true">
          {initial}
        </span>
      )}
    </div>
  );
}

/* ==========================================
   INITIAL FILTERS
========================================== */

const initialFilters = {
  size: "All",
  colour: "All",
  stock: "All"
};

/* ==========================================
   MAIN PRODUCTS VIEW
========================================== */

export default function ProductsView({
  title,
  query = "",
  money
}) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState(initialFilters);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(null);

  const alive = useRef(false);
  const operation = useRef(false);
  const readVersion = useRef(0);

  /* ==========================================
     SESSION VALIDATION
  ========================================== */

  function sameSession(token) {
    return (
      alive.current &&
      token === sessionStorage.getItem("genzi_api_token")
    );
  }

  /* ==========================================
     LOAD PRODUCTS AND CATEGORIES
  ========================================== */

  async function refresh() {
    if (operation.current) return;

    const version = ++readVersion.current;
    const token = sessionStorage.getItem("genzi_api_token");

    setLoading(true);
    setError("");

    try {
      const [nextProducts, nextCategories] = await Promise.all([
        getProducts(),
        getCategories()
      ]);

      if (
        !sameSession(token) ||
        version !== readVersion.current
      ) {
        return;
      }

      setProducts(nextProducts);
      setCategories(nextCategories);
    } catch (failure) {
      if (
        sameSession(token) &&
        version === readVersion.current
      ) {
        setError(failure.message);
      }
    } finally {
      if (
        alive.current &&
        version === readVersion.current
      ) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    alive.current = true;

    refresh();

    return () => {
      alive.current = false;
      readVersion.current += 1;
    };
  }, []);

  /* ==========================================
     OPEN ADD / EDIT PRODUCT
  ========================================== */

  async function openEditor(id) {
    if (operation.current || loading) return;

    operation.current = true;
    setBusy(true);
    setError("");

    const token = sessionStorage.getItem("genzi_api_token");

    try {
      const [nextCategories, product] = await Promise.all([
        getCategories(),
        id ? getProduct(id) : Promise.resolve(null)
      ]);

      if (!sameSession(token)) return;

      setCategories(nextCategories);

      if (!nextCategories.length) {
        throw new Error(
          "Create a category first, then return here to add a product."
        );
      }

      setEditor({ product });
    } catch (failure) {
      if (sameSession(token)) {
        setError(failure.message);
      }
    } finally {
      operation.current = false;

      if (alive.current) {
        setBusy(false);
      }
    }
  }

  /* ==========================================
     SAVE PRODUCT
  ========================================== */

  async function submitProduct(payload, id) {
    if (operation.current) {
      throw new Error(
        "Wait for the current operation to finish."
      );
    }

    operation.current = true;
    setBusy(true);

    const token = sessionStorage.getItem("genzi_api_token");

    try {
      const saved = await saveProduct(payload, id);

      if (!sameSession(token)) return;

      setProducts(current => {
        const next = current.filter(
          item => item.id !== saved.id
        );

        next.push(saved);

        return next.sort((a, b) =>
          a.name.localeCompare(b.name)
        );
      });

      setError("");
      setEditor(null);

      await Swal.fire({
        icon: "success",
        title: id ? "Product updated" : "Product created",
        text: "The database write was confirmed by the server.",
        timer: 1600,
        showConfirmButton: false
      });
    } finally {
      operation.current = false;

      if (alive.current) {
        setBusy(false);
      }
    }
  }

  /* ==========================================
     DELETE PRODUCT
  ========================================== */

  async function remove(product) {
    if (operation.current || loading) return;

    operation.current = true;
    setBusy(true);

    const token = sessionStorage.getItem("genzi_api_token");

    try {
      const confirmation = await Swal.fire({
        title: "Delete product?",
        text: `${product.name} (${product.sku}) will be removed from the database.`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Delete product",
        confirmButtonColor: "#dc2626"
      });

      if (
        !confirmation.isConfirmed ||
        !sameSession(token)
      ) {
        return;
      }

      await deleteProduct(product.id);

      if (!sameSession(token)) return;

      setProducts(current =>
        current.filter(
          item => item.id !== product.id
        )
      );

      setError("");

      await Swal.fire({
        icon: "success",
        title: "Product deleted",
        timer: 1400,
        showConfirmButton: false
      });
    } catch (failure) {
      if (sameSession(token)) {
        setError(failure.message);
      }
    } finally {
      operation.current = false;

      if (alive.current) {
        setBusy(false);
      }
    }
  }

  /* ==========================================
     SEARCH AND FILTER PRODUCTS
  ========================================== */

  const search = String(query || "")
    .trim()
    .toLowerCase();

  const visible = products.filter(product => {
    const matchesSearch = [
      product.name,
      product.sku,
      product.brand,
      product.category,
      product.size,
      product.colour
    ].some(value =>
      String(value || "")
        .toLowerCase()
        .includes(search)
    );

    const matchesSize =
      filters.size === "All" ||
      product.size === filters.size;

    const matchesColour =
      filters.colour === "All" ||
      product.colour === filters.colour;

    const matchesStock =
      filters.stock === "All" ||
      (
        filters.stock === "In stock" &&
        product.stock > 0
      ) ||
      (
        filters.stock === "Low stock" &&
        product.stock > 0 &&
        product.stock <= product.reorderLevel
      ) ||
      (
        filters.stock === "Out of stock" &&
        product.stock === 0
      );

    return (
      matchesSearch &&
      matchesSize &&
      matchesColour &&
      matchesStock
    );
  });

  /* ==========================================
     EXPORT PRODUCT CATALOGUE
  ========================================== */

  function exportProducts() {
    const headers = [
      "SKU",
      "Name",
      "Category",
      "Brand",
      "Size",
      "Colour",
      "Selling price",
      "Cost",
      "Opening stock",
      "Current stock",
      "Reorder minimum"
    ];

    const rows = visible.map(product => [
      product.sku,
      product.name,
      product.category,
      product.brand,
      product.size,
      product.colour,
      product.price,
      product.cost,
      product.openingStock,
      product.stock,
      product.reorderLevel
    ]);

    function csvCell(value) {
      let text = String(value ?? "");

      // Prevent spreadsheet formula injection.
      if (/^[=+\-@\t\r\n]/.test(text)) {
        text = "'" + text;
      }

      return `"${text.replaceAll('"', '""')}"`;
    }

    const csv =
      "\uFEFF" +
      [headers, ...rows]
        .map(row => row.map(csvCell).join(","))
        .join("\r\n");

    const url = URL.createObjectURL(
      new Blob([csv], {
        type: "text/csv;charset=utf-8"
      })
    );

    const link = document.createElement("a");

    link.href = url;
    link.download = "genzi-products.csv";
    link.click();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  /* ==========================================
     RENDER PRODUCTS PAGE
  ========================================== */

  return (
    <section className="gz-products">
      {title(
        "Products & Variants",
        "Manage your collection, product variants and stock."
      )}

      {/* PRODUCT TOOLBAR */}

      <div className="gz-products-toolbar">
        <div className="gz-products-toolbar-copy">
          <span className="gz-products-eyebrow">
            YOUR COLLECTION
          </span>

          <strong>
            {visible.length}
            <span>
              {" "}of {products.length} products
            </span>
          </strong>
        </div>

        <div className="gz-products-toolbar-actions">
          <button
            type="button"
            className="secondary"
            disabled={loading || busy}
            onClick={refresh}
          >
            <RefreshCw
              size={16}
              className={
                loading ? "gz-products-spin" : ""
              }
            />

            {loading ? "Loading..." : "Refresh"}
          </button>

          <button
            type="button"
            className="primary"
            disabled={loading || busy}
            onClick={() => openEditor()}
          >
            <Plus size={18} />
            Add product
          </button>
        </div>
      </div>

      {/* ERROR MESSAGE */}

      {error && (
        <div
          className="gz-products-error"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* CATALOGUE FILTERS */}

      <CatalogueTools
        products={products}
        filters={filters}
        setFilters={setFilters}
        exportProducts={exportProducts}
      />

      {/* LOADING STATE */}

      {loading ? (
        <div
          className="gz-products-loading"
          role="status"
        >
          <RefreshCw
            size={23}
            className="gz-products-spin"
          />

          <strong>
            Loading your collection
          </strong>

          <span>
            Please wait while products are loaded.
          </span>
        </div>
      ) : (
        <div className="gz-products-table-card">

          {/* TABLE HEADING */}

          <div className="gz-products-table-heading">
            <div>
              <h3>Product catalogue</h3>

              <p>
                Prices, variants and inventory in one place.
              </p>
            </div>

            <span className="gz-products-count">
              {visible.length} products
            </span>
          </div>

          {/* PRODUCT TABLE */}

          <div
            className="gz-products-table-scroll"
            role="region"
            aria-label="Product catalogue. Scroll to view all columns."
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  {[
                    "Product",
                    "SKU",
                    "Category",
                    "Brand",
                    "Size",
                    "Colour",
                    "Selling price",
                    "Cost",
                    "Opening",
                    "Current stock",
                    "Reorder",
                    "Actions"
                  ].map(heading => (
                    <th
                      key={heading}
                      scope="col"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {visible.map(product => (
                  <tr key={product.id}>

                    {/* PRODUCT IMAGE AND NAME */}

                    <td>
                      <div className="gz-product-identity">

                        <ProductPhoto
                          product={product}
                        />

                        <div className="gz-product-name">
                          <strong>
                            {product.name}
                          </strong>

                          <small>
                            {product.category || "Product"}
                          </small>
                        </div>
                      </div>
                    </td>

                    {/* SKU */}

                    <td>
                      <span className="gz-product-sku">
                        {product.sku}
                      </span>
                    </td>

                    {/* CATEGORY */}

                    <td>
                      {product.category}
                    </td>

                    {/* BRAND */}

                    <td>
                      {product.brand || "—"}
                    </td>

                    {/* SIZE */}

                    <td>
                      {product.size || "—"}
                    </td>

                    {/* COLOUR */}

                    <td>
                      {product.colour || "—"}
                    </td>

                    {/* SELLING PRICE */}

                    <td className="gz-product-price">
                      {money(product.price)}
                    </td>

                    {/* COST */}

                    <td className="gz-product-cost">
                      {money(product.cost)}
                    </td>

                    {/* OPENING STOCK */}

                    <td className="gz-product-number">
                      {product.openingStock}
                    </td>

                    {/* CURRENT STOCK */}

                    <td>
                      <span
                        className={`gz-product-stock ${
                          product.stock === 0
                            ? "is-out"
                            : product.stock <= product.reorderLevel
                              ? "is-low"
                              : "is-available"
                        }`}
                      >
                        <span aria-hidden="true" />

                        {product.stock}

                        {product.stock === 0
                          ? " · Out of stock"
                          : ""}
                      </span>
                    </td>

                    {/* REORDER LEVEL */}

                    <td className="gz-product-number">
                      {product.reorderLevel}
                    </td>

                    {/* ACTION BUTTONS */}

                    <td>
                      <div className="gz-product-actions">
                        <button
                          type="button"
                          className="gz-product-edit"
                          aria-label={`Edit ${product.name}`}
                          title="Edit product"
                          disabled={busy}
                          onClick={() =>
                            openEditor(product.id)
                          }
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          type="button"
                          className="gz-product-delete"
                          aria-label={`Delete ${product.name}`}
                          title="Delete product"
                          disabled={busy}
                          onClick={() =>
                            remove(product)
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {/* EMPTY PRODUCT STATE */}

                {!visible.length && (
                  <tr>
                    <td
                      colSpan={12}
                      className="gz-products-empty-cell"
                    >
                      <div className="gz-products-empty">
                        <span className="gz-products-empty-symbol">
                          <Plus size={25} />
                        </span>

                        <strong>
                          {products.length
                            ? "No matching products"
                            : "Your collection starts here"}
                        </strong>

                        <p>
                          {products.length
                            ? "Try a different search or reset your filters."
                            : "Click Add product to create your first product."}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* TABLE FOOTER */}

          <div className="gz-products-table-footer">
            <span>
              Showing{" "}
              <strong>
                {visible.length}
              </strong>{" "}
              of{" "}
              <strong>
                {products.length}
              </strong>{" "}
              products
            </span>

            <small>
              Scroll horizontally to view every column
            </small>
          </div>
        </div>
      )}

      {/* ADD / EDIT PRODUCT MODAL */}

      {editor && (
        <ProductForm
          key={editor.product?.id || "new"}
          product={editor.product}
          categories={categories}
          onSave={submitProduct}
          onClose={() => setEditor(null)}
        />
      )}
    </section>
  );
}
