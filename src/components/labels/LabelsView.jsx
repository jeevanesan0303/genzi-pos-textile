
import React, {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import {
  Printer,
  Plus,
  Trash2,
  RefreshCw
} from "lucide-react";

import JsBarcode from "jsbarcode";
import { loadPOS } from "../../api/pos";
import "./LabelsView.css";

/* ==========================================
   GEN ZI CORNER - BARCODE LABEL PRINTING

   Printer: Xprinter XP-T361U
   Resolution: 203 DPI
   Barcode: CODE128

   IMPORTANT:
   - Do not stretch barcodes to 100% width.
   - Keep the original bar proportions.
   - Preserve quiet zones on both sides.
   - Print using 100% scale.
========================================== */

const MAX_LABELS = 500;
const PRINTER_DPI = 203;

// Use two printer dots per narrow barcode module.
const BARCODE_MODULE_DOTS = 2;

// Code 128 quiet zone: at least 10 modules
// on both the left and right.
const QUIET_ZONE_DOTS =
  BARCODE_MODULE_DOTS * 10;

// Printed barcode height in millimetres.
const BARCODE_HEIGHT_MM = 10;

// Horizontal label padding, per side.
const LABEL_PADDING_X_MM = 1.5;

// Extra tolerance for physical sizing checks.
const BARCODE_TOLERANCE_MM = 0.05;

/* ==========================================
   HELPERS
========================================== */

function dotsToMM(dots) {
  return (Number(dots) * 25.4) / PRINTER_DPI;
}

function priceText(value) {
  return `LKR ${Number(value || 0).toLocaleString(
    "en-LK",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  )}`;
}

function escapeHTML(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    character =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[character]
  );
}

function errorMessage(error) {
  return error instanceof Error
    ? error.message
    : String(error || "Unknown error");
}

/* ==========================================
   LABEL LAYOUT SETTINGS
========================================== */

export function labelLayout(settings = {}) {
  const bounded = (
    value,
    fallback,
    min,
    max
  ) => {
    const number = Number(value);

    return Number.isFinite(number) &&
      number >= min &&
      number <= max
      ? number
      : fallback;
  };

  const width = bounded(
    settings.labelWidth,
    38,
    25,
    100
  );

  const height = bounded(
    settings.labelHeight,
    25,
    25,
    100
  );

  const gap = bounded(
    settings.labelGap,
    0,
    0,
    10
  );

  const candidate = Number(
    settings.labelColumns
  );

  const columns =
    Number.isInteger(candidate) &&
    candidate >= 1 &&
    candidate <= 4
      ? candidate
      : 1;

  return {
    width,
    height,
    gap,
    columns,
    format:
      settings.labelFormat === "A4 sheet"
        ? "A4 sheet"
        : "Roll"
  };
}

/* ==========================================
   BARCODE GENERATION

   Generate at printer-dot proportions.

   Crucially, the resulting SVG has a
   physical width in millimetres.

   CSS must NOT resize it to 100%.
========================================== */

function createBarcode(
  sku,
  labelWidthMM = 38
) {
  const code = String(sku ?? "").trim();

  if (!code) {
    throw new Error(
      "This product has no SKU."
    );
  }

  const svg = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg"
  );

  try {
    JsBarcode(svg, code, {
      format: "CODE128",

      // Integer printer-dot module width
      width: BARCODE_MODULE_DOTS,

      // Internal SVG coordinate height
      height: 80,

      displayValue: false,

      margin: 0,
      marginTop: 0,
      marginBottom: 0,

      // Quiet zones: 10 modules each
      marginLeft: QUIET_ZONE_DOTS,
      marginRight: QUIET_ZONE_DOTS,

      background: "#ffffff",
      lineColor: "#000000"
    });
  } catch {
    throw new Error(
      `SKU "${code}" cannot be encoded as CODE128.`
    );
  }

  const generatedWidth = Number(
    svg.getAttribute("width")
  );

  const generatedHeight = Number(
    svg.getAttribute("height")
  );

  if (
    !Number.isFinite(generatedWidth) ||
    !Number.isFinite(generatedHeight) ||
    generatedWidth <= 0 ||
    generatedHeight <= 0
  ) {
    throw new Error(
      "Unable to generate barcode dimensions."
    );
  }

  // JsBarcode's SVG units are treated as
  // printer dots for physical-size output.
  const physicalWidthMM = dotsToMM(
    generatedWidth
  );

  const availableWidthMM =
    Number(labelWidthMM) -
    LABEL_PADDING_X_MM * 2;

  if (
    physicalWidthMM >
    availableWidthMM + BARCODE_TOLERANCE_MM
  ) {
    throw new Error(
      `SKU "${code}" is too long for a ` +
      `${labelWidthMM} mm sticker at a ` +
      `readable barcode size. ` +
      `Use a shorter SKU or a wider label.`
    );
  }

  // Keep the barcode's horizontal
  // proportions completely unchanged.
  svg.setAttribute(
    "viewBox",
    `0 0 ${generatedWidth} ${generatedHeight}`
  );

  svg.setAttribute(
    "width",
    `${physicalWidthMM.toFixed(4)}mm`
  );

  svg.setAttribute(
    "height",
    `${BARCODE_HEIGHT_MM}mm`
  );

  // Allows a fixed physical width and
  // independent vertical bar height.
  svg.setAttribute(
    "preserveAspectRatio",
    "none"
  );

  svg.setAttribute(
    "role",
    "img"
  );

  svg.setAttribute(
    "aria-label",
    `Code 128 barcode ${code}`
  );

  // Explicit sizes protect against
  // application-wide SVG styles.
  svg.style.setProperty(
    "width",
    `${physicalWidthMM.toFixed(4)}mm`,
    "important"
  );

  svg.style.setProperty(
    "height",
    `${BARCODE_HEIGHT_MM}mm`,
    "important"
  );

  svg.style.setProperty(
    "max-width",
    "none",
    "important"
  );

  svg.style.setProperty(
    "min-width",
    `${physicalWidthMM.toFixed(4)}mm`,
    "important"
  );

  svg.style.setProperty(
    "flex-shrink",
    "0"
  );

  svg.style.setProperty(
    "display",
    "block"
  );

  svg.style.setProperty(
    "shape-rendering",
    "crispEdges"
  );

  return svg;
}

/* ==========================================
   STICKER STYLES

   The barcode has a fixed physical width.
   It is centred, never stretched.
========================================== */

const stickerCSS = `
  .gz-label-sticker {
    box-sizing: border-box;

    width: var(--label-width, 38mm);
    height: var(--label-height, 25mm);

    padding: 0.7mm 1.5mm;

    display: flex;
    flex-direction: column;

    align-items: center;
    justify-content: center;

    background: #ffffff;
    color: #000000;

    font-family: Arial, sans-serif;
    text-align: center;
    line-height: 1;

    overflow: hidden;
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
    font-size: 6.7pt;
    font-weight: 700;
  }

  .gz-label-name {
    margin-top: 0.2mm;
    font-size: 6.1pt;
  }

  .gz-label-variant {
    margin-top: 0.2mm;
    font-size: 5.7pt;
  }

  .gz-label-barcode {
    box-sizing: border-box;

    width: 100%;
    height: 10mm;

    margin-top: 0.35mm;

    display: flex;
    align-items: center;
    justify-content: center;

    flex-shrink: 0;

    background: #ffffff;
    overflow: visible;
  }

  .gz-label-barcode svg {
    display: block !important;

    /* Never stretch to 100% width */
    width: auto;

    height: 10mm !important;

    max-width: none !important;
    max-height: none !important;

    flex-shrink: 0;

    shape-rendering: crispEdges;
  }

  .gz-label-code {
    margin-top: 0.15mm;

    font-size: 6pt;
    letter-spacing: 0.15pt;
  }

  .gz-label-price {
    margin-top: 0.3mm;

    font-size: 7.7pt;
    font-weight: 700;
  }

  @media print {
    .gz-label-sticker {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;

      break-inside: avoid;
      page-break-inside: avoid;
    }

    .gz-label-barcode,
    .gz-label-barcode svg {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
`;

/* ==========================================
   LABEL PREVIEW
========================================== */

export function PrintLabel({
  product,
  settings = {}
}) {
  const barcodeRef = useRef(null);

  const [error, setError] = useState("");

  const layout = labelLayout(settings);

  useEffect(() => {
    const container = barcodeRef.current;

    if (!container) return;

    container.replaceChildren();

    try {
      const barcode = createBarcode(
        product.sku,
        layout.width
      );

      container.appendChild(barcode);
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [product.sku, layout.width]);

  const variant = [
    product.size,
    product.colour
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="gz-label-sticker"
      style={{
        "--label-width": `${layout.width}mm`,
        "--label-height": `${layout.height}mm`,

        width: `${layout.width}mm`,
        height: `${layout.height}mm`
      }}
    >
      <style>{stickerCSS}</style>

      <b className="gz-label-store">
        {settings.store || "GEN ZI CORNER"}
      </b>

      <span className="gz-label-name">
        {product.name}
      </span>

      <small className="gz-label-variant">
        {variant || "\u00A0"}
      </small>

      <div
        className="gz-label-barcode"
        ref={barcodeRef}
      />

      <small className="gz-label-code">
        {error ? "INVALID BARCODE" : product.sku}
      </small>

      <strong className="gz-label-price">
        {priceText(product.price)}
      </strong>
    </div>
  );
}

/* ==========================================
   ISOLATED PRINT HTML
========================================== */

function labelHTML(
  product,
  store,
  labelWidth
) {
  const e = escapeHTML;

  const variant = [
    product.size,
    product.colour
  ]
    .filter(Boolean)
    .join(" · ");

  const barcodeHTML = createBarcode(
    product.sku,
    labelWidth
  ).outerHTML;

  return `
    <div class="gz-label-sticker">
      <b class="gz-label-store">
        ${e(store)}
      </b>

      <span class="gz-label-name">
        ${e(product.name)}
      </span>

      <small class="gz-label-variant">
        ${e(variant) || "&nbsp;"}
      </small>

      <div class="gz-label-barcode">
        ${barcodeHTML}
      </div>

      <small class="gz-label-code">
        ${e(product.sku)}
      </small>

      <strong class="gz-label-price">
        ${e(priceText(product.price))}
      </strong>
    </div>
  `;
}

/* ==========================================
   MAIN COMPONENT
========================================== */

export default function LabelsView({
  data = {},
  title
}) {
  const [products, setProducts] =
    useState([]);

  const [selection, setSelection] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [copies, setCopies] =
    useState("1");

  const [queue, setQueue] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [printing, setPrinting] =
    useState(false);

  const [error, setError] =
    useState("");

  const [reload, setReload] =
    useState(0);

  const printLock = useRef(false);
  const frameRef = useRef(null);
  const mounted = useRef(false);

  const settings = data.settings || {};

  const store =
    settings.store || "GEN ZI CORNER";

  const layout = labelLayout(settings);

  /* ========================================
     MOUNT / CLEANUP
  ======================================== */

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;

      frameRef.current?.remove();
      frameRef.current = null;
    };
  }, []);

  /* ========================================
     LOAD LIVE PRODUCTS FROM BACKEND
  ======================================== */

  useEffect(() => {
    let active = true;

    async function fetchProducts() {
      setLoading(true);
      setError("");

      try {
        const result = await loadPOS();

        if (!Array.isArray(result.products)) {
          throw new Error(
            "Invalid product response from the server."
          );
        }

        if (!active) return;

        const items = result.products.map(
          product => ({
            ...product,
            id: String(product.id),
            sku: String(product.sku ?? ""),
            price: product.price
          })
        );

        setProducts(items);

        setSelection(current =>
          items.some(
            product => product.id === current
          )
            ? current
            : items[0]?.id || ""
        );
      } catch (err) {
        if (active) {
          setError(
            errorMessage(err) ||
            "Unable to load products."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    fetchProducts();

    return () => {
      active = false;
    };
  }, [reload]);

  /* ========================================
     PRODUCT CHANGE EVENTS
  ======================================== */

  useEffect(() => {
    function refresh() {
      setReload(value => value + 1);
    }

    window.addEventListener(
      "genzi-products-changed",
      refresh
    );

    return () => {
      window.removeEventListener(
        "genzi-products-changed",
        refresh
      );
    };
  }, []);

  /* ========================================
     PRODUCT SEARCH
  ======================================== */

  const filteredProducts = useMemo(() => {
    const term = search
      .trim()
      .toLowerCase();

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

  /* ========================================
     PRINT QUEUE
  ======================================== */

  const total = queue.reduce(
    (sum, item) => sum + item.copies,
    0
  );

  const labels = useMemo(
    () =>
      queue.flatMap(item =>
        Array.from(
          { length: item.copies },
          () => item.product
        )
      ),
    [queue]
  );

  /* ========================================
     ADD PRODUCT TO PRINT BATCH
  ======================================== */

  function add() {
    if (
      loading ||
      printing ||
      printLock.current
    ) {
      return;
    }

    const count = Number(copies);

    if (
      !selectedProduct ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 100 ||
      total + count > MAX_LABELS
    ) {
      setError(
        "Select a product and enter 1–100 copies. " +
        "Maximum 500 labels per batch."
      );

      return;
    }

    // Validate that a physically readable
    // barcode fits the configured label.
    try {
      createBarcode(
        selectedProduct.sku,
        layout.width
      );
    } catch (err) {
      setError(errorMessage(err));
      return;
    }

    setQueue(current => [
      ...current,
      {
        key: crypto.randomUUID(),

        product: {
          ...selectedProduct
        },

        copies: count
      }
    ]);

    setError("");
  }

  /* ========================================
     PRINT LABELS
  ======================================== */

  async function print() {
    if (
      !labels.length ||
      printLock.current
    ) {
      return;
    }

    printLock.current = true;
    setPrinting(true);
    setError("");

    frameRef.current?.remove();
    frameRef.current = null;

    let frame;

    try {
      const {
        width,
        height,
        columns,
        gap,
        format
      } = layout;

      const roll = format === "Roll";

      const rowWidth =
        columns * width +
        (columns - 1) * gap;

      if (!roll && rowWidth > 200) {
        throw new Error(
          "Labels exceed the A4 print width. " +
          "Reduce columns, width or gap in Settings."
        );
      }

      if (roll && rowWidth > 80) {
        throw new Error(
          "The label layout exceeds the " +
          "80 mm printer paper width."
        );
      }

      // Generate all barcodes before opening
      // the print dialog. Invalid or oversized
      // barcodes will trigger a clear error.
      const rowsPerPage = roll
        ? 1
        : Math.floor(
            (287 + gap) / (height + gap)
          );

      const perPage =
        columns * rowsPerPage;

      if (perPage < 1) {
        throw new Error(
          "The selected label dimensions " +
          "do not fit the page."
        );
      }

      const pages = [];

      for (
        let index = 0;
        index < labels.length;
        index += perPage
      ) {
        const batch = labels.slice(
          index,
          index + perPage
        );

        const content = batch
          .map(product =>
            labelHTML(
              product,
              store,
              width
            )
          )
          .join("");

        pages.push(`
          <section class="label-page">
            ${content}
          </section>
        `);
      }

      /* ====================================
         ISOLATED PRINT IFRAME
      ==================================== */

      frame = document.createElement(
        "iframe"
      );

      frame.title =
        "Gen Zi Corner barcode printing";

      frame.style.cssText = [
        "position:fixed",
        "left:-10000px",
        "top:0",
        "width:800px",
        "height:1000px",
        "border:0"
      ].join(";");

      document.body.appendChild(frame);

      frameRef.current = frame;

      const doc = frame.contentDocument;
      const printWindow =
        frame.contentWindow;

      if (!doc || !printWindow) {
        throw new Error(
          "Unable to open the label print document."
        );
      }

      doc.open();

      doc.write(`
        <!doctype html>

        <html>
          <head>
            <meta charset="utf-8">

            <title>
              Gen Zi Corner Barcode Labels
            </title>

            <style>
              @page {
                size: ${
                  roll
                    ? `${rowWidth}mm ${height}mm`
                    : "A4"
                };

                margin: ${
                  roll ? "0" : "5mm"
                };
              }

              html,
              body {
                margin: 0;
                padding: 0;

                width: ${
                  roll ? rowWidth : 200
                }mm;

                background: #ffffff;
              }

              * {
                box-sizing: border-box;
              }

              ${stickerCSS}

              .label-page {
                --label-width: ${width}mm;
                --label-height: ${height}mm;

                display: grid;

                grid-template-columns:
                  repeat(
                    ${columns},
                    ${width}mm
                  );

                grid-auto-rows: ${height}mm;

                column-gap: ${gap}mm;

                row-gap: ${
                  roll ? 0 : gap
                }mm;

                align-content: start;

                width: ${
                  roll ? rowWidth : 200
                }mm;

                margin: 0;
                padding: 0;

                break-after: page;
                page-break-after: always;
              }

              .label-page:last-child {
                break-after: auto;
                page-break-after: auto;
              }

              .gz-label-sticker {
                width: ${width}mm;
                height: ${height}mm;

                break-inside: avoid;
                page-break-inside: avoid;
              }

              .gz-label-barcode svg {
                /* Preserve printer-dot widths */
                max-width: none !important;

                shape-rendering: crispEdges;
              }
            </style>
          </head>

          <body>
            ${pages.join("")}
          </body>
        </html>
      `);

      doc.close();

      if (doc.fonts?.ready) {
        await doc.fonts.ready;
      }

      // Allow the SVGs and print document
      // to complete their initial layout.
      await new Promise(resolve =>
        setTimeout(resolve, 200)
      );

      if (!mounted.current) {
        frame.remove();
        return;
      }

      printWindow.addEventListener(
        "afterprint",
        () => {
          if (frameRef.current === frame) {
            frame.remove();
            frameRef.current = null;
          }
        },
        { once: true }
      );

      printWindow.focus();
      printWindow.print();
    } catch (err) {
      frame?.remove();

      if (frameRef.current === frame) {
        frameRef.current = null;
      }

      if (mounted.current) {
        setError(
          errorMessage(err) ||
          "Unable to print labels."
        );
      }
    } finally {
      printLock.current = false;

      if (mounted.current) {
        setPrinting(false);
      }
    }
  }

  /* ========================================
     UI
  ======================================== */

  return (
    <div className="gz-labels">
      <style>{stickerCSS}</style>

      {title ? (
        title(
          "Barcode & Label Printing",
          "Select products and print using your saved label dimensions."
        )
      ) : (
        <h1>Barcode & Label Printing</h1>
      )}

      {error && (
        <div
          className="gz-labels-error"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="settings-layout">
        <section className="panel">
          <div className="panel-head">
            <h3>
              1. Select product & copies
            </h3>

            <button
              type="button"
              disabled={loading || printing}
              onClick={() =>
                setReload(value => value + 1)
              }
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
              onChange={event =>
                setSelection(event.target.value)
              }
            >
              <option value="">
                {loading
                  ? "Loading products..."
                  : "Select a product"}
              </option>

              {filteredProducts.map(product => (
                <option
                  key={product.id}
                  value={product.id}
                >
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

          {!loading &&
            !filteredProducts.length && (
              <p>No matching products.</p>
            )}

          {selectedProduct && (
            <div className="gz-labels-product-details">
              <strong>
                {selectedProduct.name}
              </strong>

              <span>
                SKU / barcode:{" "}
                {selectedProduct.sku}
              </span>

              <span>
                {[
                  selectedProduct.category,
                  selectedProduct.brand
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>

              <span>
                Size:{" "}
                {selectedProduct.size || "—"}{" "}
                · Colour:{" "}
                {selectedProduct.colour || "—"}
              </span>

              <span>
                Stock:{" "}
                {selectedProduct.stock} ·{" "}
                {priceText(
                  selectedProduct.price
                )}
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
              onChange={event =>
                setCopies(event.target.value)
              }
            />
          </label>

          <button
            type="button"
            className="primary"
            disabled={
              loading ||
              printing ||
              !selectedProduct
            }
            onClick={add}
          >
            <Plus size={17} />
            Add to print batch
          </button>

          <hr />

          <h3>2. Printer layout</h3>

          <p>
            <strong>
              {layout.width} ×{" "}
              {layout.height} mm
            </strong>

            {" · "}CODE128
            {" · "}{layout.format}
            {" · "}{layout.columns} column(s)
          </p>

          <p>
            Printer preference:{" "}
            {settings.labelPrinter ||
              "Not specified"}
          </p>

          <p className="muted">
            Optimized for 203 DPI printing.
            Barcode width is fixed in
            printer-dot proportions and
            will not be stretched.
          </p>

          <p className="muted">
            Print at 100% scale. Disable
            browser headers and footers.
            Match the paper size and media
            type in the printer driver.
          </p>

          <button
            type="button"
            className="primary full"
            disabled={!total || printing}
            onClick={print}
          >
            <Printer size={18} />

            {printing
              ? "Opening print..."
              : `Print ${total} labels`}
          </button>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3>
              Print batch · {total} labels
            </h3>

            <button
              type="button"
              className="secondary"
              disabled={
                !queue.length || printing
              }
              onClick={() => setQueue([])}
            >
              Clear batch
            </button>
          </div>

          {queue.map(item => (
            <div
              className="list-item"
              key={item.key}
            >
              <div>
                <b>
                  {item.product.name}
                </b>

                <small>
                  {item.product.sku} ·{" "}
                  {item.copies} copies ·{" "}
                  {priceText(
                    item.product.price
                  )}
                </small>
              </div>

              <button
                type="button"
                className="icon danger"
                aria-label={
                  `Remove ${item.product.name} from batch`
                }
                disabled={printing}
                onClick={() =>
                  setQueue(current =>
                    current.filter(
                      entry =>
                        entry.key !== item.key
                    )
                  )
                }
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}

          {!queue.length && (
            <div className="empty">
              Add products to begin
              a print batch.
            </div>
          )}

          <h3 className="gz-labels-preview-title">
            Label preview ·{" "}
            {layout.width} ×{" "}
            {layout.height} mm
          </h3>

          <div className="gz-labels-previews">
            {labels
              .slice(0, 8)
              .map((product, index) => (
                <PrintLabel
                  key={index}
                  product={product}
                  settings={settings}
                />
              ))}
          </div>

          {total > 8 && (
            <p>
              Showing 8 of {total} labels.
              All labels will print.
            </p>
          )}

          <p className="muted">
            Queued labels keep the product
            details selected when added.
            Remove and re-add a label after
            changing its price.
          </p>
        </section>
      </div>
    </div>
  );
}
