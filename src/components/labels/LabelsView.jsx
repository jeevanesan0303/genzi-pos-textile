import React, {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Printer, Plus, Trash2, RefreshCw } from "lucide-react";
import JsBarcode from "jsbarcode";
import { loadPOS } from "../../api/pos";
import "./LabelsView.css";

// const LABEL_WIDTH = 38;
// const LABEL_HEIGHT = 25;
const MAX_LABELS = 500;

function priceText(value) {
  return `LKR ${Number(value || 0).toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function escapeHTML(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]
  );
}

function createBarcode(sku) {
  const code = String(sku ?? "").trim();

  if (!code) {
    throw new Error("This product has no SKU.");
  }

  const svg = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg"
  );

  JsBarcode(svg, code, {
    format: "CODE128",
    width: 2,
    height: 38,
    displayValue: false,
    margin: 0,
    marginLeft: 10,
    marginRight: 10,
    background: "#ffffff",
    lineColor: "#000000"
  });

  const width = Number(svg.getAttribute("width"));
  const height = Number(svg.getAttribute("height"));

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Barcode ${code}`);

  svg.removeAttribute("width");
  svg.removeAttribute("height");

  return svg;
}

export function labelLayout(settings = {}) {
  const bounded = (value, fallback, min, max) => {
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max
      ? number
      : fallback;
  };

  const width = bounded(settings.labelWidth, 38, 25, 100);
  const height = bounded(settings.labelHeight, 25, 25, 100);
  const gap = bounded(settings.labelGap, 0, 0, 10);
  const candidate = Number(settings.labelColumns);
  const columns = Number.isInteger(candidate) && candidate >= 1 && candidate <= 4
    ? candidate
    : 1;

  return {
    width,
    height,
    gap,
    columns,
    format: settings.labelFormat === "A4 sheet" ? "A4 sheet" : "Roll"
  };
}

export function PrintLabel({ product, settings = {} }) {
  const barcodeRef = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const container = barcodeRef.current;
    if (!container) return;

    container.replaceChildren();

    try {
      container.appendChild(createBarcode(product.sku));
      setError("");
    } catch {
      setError("Invalid barcode");
    }
  }, [product.sku]);

  const variant = [product.size, product.colour]
    .filter(Boolean)
    .join(" · ");
  const layout = labelLayout(settings);

  return (
    <div
      className="gz-label-sticker"
      style={{
        width: `${layout.width}mm`,
        height: `${layout.height}mm`
      }}
    >
  <style>{stickerCSS}</style>
      <b className="gz-label-store">
        {settings.store || "GEN ZI CORNER"}
      </b>

      <span className="gz-label-name">{product.name}</span>

      <small className="gz-label-variant">
        {variant || "\u00A0"}
      </small>

      <div className="gz-label-barcode" ref={barcodeRef} />

      <small className="gz-label-code">
        {error || product.sku}
      </small>

      <strong className="gz-label-price">
        {priceText(product.price)}
      </strong>
    </div>
  );
}

// These rules are shared by the preview and the isolated print document.
const stickerCSS = `
  .gz-label-sticker {
    box-sizing: border-box;
    width: var(--label-width, 38mm);
    height: var(--label-height, 25mm);
    padding: 1mm 1.5mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: #fff;
    color: #000;
    font-family: Arial, sans-serif;
    text-align: center;
    line-height: 1.05;
  }

  .gz-label-store,
  .gz-label-name,
  .gz-label-variant,
  .gz-label-code,
  .gz-label-price {
    display: block;
    width: 100%;
    margin: 0;
    padding: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
  }

  .gz-label-store {
    font-size: 7pt;
    font-weight: 700;
  }

  .gz-label-name {
    margin-top: 0.4mm;
    font-size: 6.5pt;
  }

  .gz-label-variant {
    margin-top: 0.3mm;
    font-size: 6pt;
  }

  .gz-label-barcode {
    width: 100%;
    height: 8mm;
    margin-top: 0.5mm;
    flex-shrink: 0;
  }

  .gz-label-barcode svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  .gz-label-code {
    margin-top: 0.2mm;
    font-size: 6pt;
    letter-spacing: 0.3pt;
  }

  .gz-label-price {
    margin-top: 0.5mm;
    font-size: 8pt;
    font-weight: 700;
  }
`;

function labelHTML(product, store) {
  const e = escapeHTML;
  const variant = [product.size, product.colour]
    .filter(Boolean)
    .join(" · ");

  return `
    <div class="gz-label-sticker">
      <b class="gz-label-store">${e(store)}</b>
      <span class="gz-label-name">${e(product.name)}</span>
      <small class="gz-label-variant">${e(variant) || "&nbsp;"}</small>
      <div class="gz-label-barcode">
        ${createBarcode(product.sku).outerHTML}
      </div>
      <small class="gz-label-code">${e(product.sku)}</small>
      <strong class="gz-label-price">${e(priceText(product.price))}</strong>
    </div>
  `;
}

export default function LabelsView({ data = {}, title }) {
  const [products, setProducts] = useState([]);
  const [selection, setSelection] = useState("");
  const [search, setSearch] = useState("");
  const [copies, setCopies] = useState("1");
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  const printLock = useRef(false);
  const frameRef = useRef(null);
  const mounted = useRef(false);

  const settings = data.settings || {};
  const store = settings.store || "GEN ZI CORNER";

  const layout = labelLayout(settings);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      frameRef.current?.remove();
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function fetchProducts() {
      setLoading(true);
      setError("");

      try {
        const result = await loadPOS();

        if (!Array.isArray(result.products)) {
          throw new Error("Invalid product response from the server.");
        }

        if (!active) return;

        const items = result.products.map(product => ({
          ...product,
          id: String(product.id),
          sku: String(product.sku ?? ""),
          price: product.price
        }));

        setProducts(items);
        setSelection(current =>
          items.some(product => product.id === current)
            ? current
            : items[0]?.id || ""
        );
      } catch (err) {
        if (active) {
          setError(err.message || "Unable to load products.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchProducts();

    return () => {
      active = false;
    };
  }, [reload]);

  useEffect(() => {
    function refresh() {
      setReload(value => value + 1);
    }

    window.addEventListener("genzi-products-changed", refresh);

    return () => {
      window.removeEventListener("genzi-products-changed", refresh);
    };
  }, []);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return products.filter(product =>
      [
        product.name,
        product.sku,
        product.size,
        product.colour,
        product.category,
        product.brand
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [products, search]);

  const selectedProduct = products.find(
    product => product.id === selection
  );

  const total = queue.reduce((sum, item) => sum + item.copies, 0);

  // Queue entries store a snapshot of the selected label details.
  const labels = useMemo(
    () => queue.flatMap(item =>
      Array.from({ length: item.copies }, () => item.product)
    ),
    [queue]
  );

  function add() {
    if (loading || printing || printLock.current) return;

    const count = Number(copies);

    if (
      !selectedProduct ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 100 ||
      total + count > MAX_LABELS
    ) {
      setError(
        "Select a product and enter 1–100 copies. Maximum 500 labels per batch."
      );
      return;
    }

    try {
      createBarcode(selectedProduct.sku);
    } catch {
      setError("This product needs a valid CODE128 SKU before printing.");
      return;
    }

    setQueue(current => [
      ...current,
      {
        key: crypto.randomUUID(),
        product: { ...selectedProduct },
        copies: count
      }
    ]);

    setError("");
  }

 async function print() {
  if (!labels.length || printLock.current) return;

  printLock.current = true;
  setPrinting(true);
  setError("");
  frameRef.current?.remove();

  let frame;

  try {
    const { width, height, columns, gap, format } = layout;
    const roll = format === "Roll";
    const rowWidth = columns * width + (columns - 1) * gap;

    if (!roll && rowWidth > 200) {
      throw new Error(
        "Labels exceed the A4 print width. Reduce columns, width or gap in Settings."
      );
    }

    const rowsPerPage = roll
      ? 1
      : Math.floor((287 + gap) / (height + gap));

    const perPage = columns * rowsPerPage;
    const pages = [];

    for (let index = 0; index < labels.length; index += perPage) {
      const batch = labels.slice(index, index + perPage);

      pages.push(`
        <section class="label-page">
          ${batch.map(product => labelHTML(product, store)).join("")}
        </section>
      `);
    }

    frame = document.createElement("iframe");
    frame.title = "Barcode label printing";
    frame.style.cssText =
      "position:fixed;left:-10000px;top:0;width:800px;height:1000px;border:0;";

    document.body.appendChild(frame);
    frameRef.current = frame;

    const doc = frame.contentDocument;
    const printWindow = frame.contentWindow;

    if (!doc || !printWindow) {
      throw new Error("Unable to open the label print document.");
    }

    doc.open();
    doc.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Gen Zi Corner labels</title>

          <style>
            @page {
              size: ${roll ? `${rowWidth}mm ${height}mm` : "A4"};
              margin: ${roll ? "0" : "5mm"};
            }

            html, body {
              margin: 0;
              padding: 0;
              width: ${roll ? rowWidth : 200}mm;
              background: #fff;
            }

            ${stickerCSS}

            .label-page {
              --label-width: ${width}mm;
              --label-height: ${height}mm;
              display: grid;
              grid-template-columns: repeat(${columns}, ${width}mm);
              grid-auto-rows: ${height}mm;
              gap: ${roll ? 0 : gap}mm ${gap}mm;
              align-content: start;
              width: ${roll ? rowWidth : 200}mm;
              break-after: page;
              page-break-after: always;
            }

            .label-page:last-child {
              break-after: auto;
              page-break-after: auto;
            }

            .gz-label-sticker {
              break-inside: avoid;
              page-break-inside: avoid;
            }
          </style>
        </head>

        <body>${pages.join("")}</body>
      </html>
    `);
    doc.close();

    await doc.fonts.ready;
    await new Promise(resolve => setTimeout(resolve, 150));

    if (!mounted.current) {
      frame.remove();
      return;
    }

    printWindow.focus();
    printWindow.print();
  } catch (err) {
    frame?.remove();

    if (mounted.current) {
      setError(err.message || "Unable to print labels.");
    }
  } finally {
    printLock.current = false;

    if (mounted.current) {
      setPrinting(false);
    }
  }
}

  return (
    <div className="gz-labels">
      <style>{stickerCSS}</style>

      {title
        ? title(
            "Barcode & Label Printing",
            "Select products and print using your saved label dimensions."
          )
        : <h1>Barcode & Label Printing</h1>}

      {error && (
        <div className="gz-labels-error" role="alert">
          {error}
        </div>
      )}

      <div className="settings-layout">
        <section className="panel">
          <div className="panel-head">
            <h3>1. Select product & copies</h3>

            <button
              type="button"
              disabled={loading || printing}
              onClick={() => setReload(value => value + 1)}
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>

          <label>
            Search products
            <input
              type="search"
              value={search}
              placeholder="Search name, SKU, size or colour"
              onChange={event => {
                setSearch(event.target.value);
                setSelection("");
              }}
            />
          </label>

          <label>
            Product
            <select
              value={selection}
              disabled={loading || printing}
              onChange={event => setSelection(event.target.value)}
            >
              <option value="">
                {loading ? "Loading products..." : "Select a product"}
              </option>

              {filteredProducts.map(product => (
                <option key={product.id} value={product.id}>
                  {[
                    product.name,
                    `SKU: ${product.sku}`,
                    product.size,
                    product.colour,
                    priceText(product.price)
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </option>
              ))}
            </select>
          </label>

          {!loading && !filteredProducts.length && (
            <p>No matching products.</p>
          )}

          {selectedProduct && (
            <div className="gz-labels-product-details">
              <strong>{selectedProduct.name}</strong>
              <span>SKU / barcode: {selectedProduct.sku}</span>
              <span>
                {[selectedProduct.category, selectedProduct.brand]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <span>
                Size: {selectedProduct.size || "—"} · Colour:{" "}
                {selectedProduct.colour || "—"}
              </span>
              <span>
                Stock: {selectedProduct.stock} ·{" "}
                {priceText(selectedProduct.price)}
              </span>
            </div>
          )}

          <label>
            Number of labels
            <input
              type="number"
              min="1"
              max="100"
              step="1"
              value={copies}
              disabled={printing}
              onChange={event => setCopies(event.target.value)}
            />
          </label>

          <button
            type="button"
            className="primary"
            disabled={loading || printing || !selectedProduct}
            onClick={add}
          >
            <Plus size={17} />
            Add to print batch
          </button>

          <hr />

          <h3>2. Printer layout</h3>

          <p>
            <strong>{layout.width} × {layout.height} mm</strong>
            {" · "}CODE128 · {layout.format} · {layout.columns} column(s)
          </p>

          <p>
            Printer preference: {settings.labelPrinter || "Not specified"}
          </p>

          <p className="muted">
            Match the paper size in the printer driver. Use 100% scale and
            disable browser headers and footers.
          </p>

          <button
            type="button"
            className="primary full"
            disabled={!total || printing}
            onClick={print}
          >
            <Printer size={18} />
            {printing ? "Opening print..." : `Print ${total} labels`}
          </button>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3>Print batch · {total} labels</h3>

            <button
              type="button"
              className="secondary"
              disabled={!queue.length || printing}
              onClick={() => setQueue([])}
            >
              Clear batch
            </button>
          </div>

          {queue.map(item => (
            <div className="list-item" key={item.key}>
              <div>
                <b>{item.product.name}</b>
                <small>
                  {item.product.sku} · {item.copies} copies ·{" "}
                  {priceText(item.product.price)}
                </small>
              </div>

              <button
                type="button"
                className="icon danger"
                aria-label={`Remove ${item.product.name} from batch`}
                disabled={printing}
                onClick={() => setQueue(current =>
                  current.filter(entry => entry.key !== item.key)
                )}
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}

          {!queue.length && (
            <div className="empty">
              Add products to begin a print batch.
            </div>
          )}

          <h3 className="gz-labels-preview-title">
            Label preview · {layout.width} × {layout.height} mm
          </h3>

          <div className="gz-labels-previews">
            {labels.slice(0, 8).map((product, index) => (
              <PrintLabel
                key={index}
                product={product}
                settings={settings}
              />
            ))}
          </div>

          {total > 8 && (
            <p>Showing 8 of {total} labels. All labels will print.</p>
          )}

          <p className="muted">
            Queued labels keep the product details selected when
            added. Remove and re-add a label after changing its price.
          </p>
        </section>
      </div>
    </div>
  );
}
