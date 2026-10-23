import { isOfflineSession } from "../../offline/access";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  Barcode,
  Plus,
  Minus,
  Trash2,
  RefreshCw,
  Printer,
  X,
  Pause,
} from "lucide-react";

import {
  loadPOS,
  findCustomer,
  listOrders,
  getOrder,
  submitOrder,
  recoverRequest,
} from "../../api/pos";

import { money } from "./receipt";
import { createPortal } from "react-dom";
import PaymentModal from "./PaymentModal";
import ReceiptModal from "./ReceiptModal";
import "./PosView.css";
// import ReceiptFooter from "./ReceiptFooter";
const emptyDraft = () => ({
  items: [],
  phone: "",
  discount: "0",
  heldId: null,
  version: null,
});

const toCents = (value) =>
  /^\d{1,10}(\.\d{1,2})?$/.test(String(value))
    ? Math.round(Number(value) * 100)
    : NaN;

const amount = (value) => (value / 100).toFixed(2);

const keyFor = (actor, suffix) => `genzi-pos-v2:${actor}:${suffix}`;

function Dialog({ title, children, close, locked = false, wide = false }) {
  const ref = useRef(null);

  useEffect(() => {
    ref.current.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className={`gzpos-dialog ${wide ? "wide" : ""}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!locked) close();
      }}
    >
      <div className="gzpos-dialog-head">
        <h2>{title}</h2>

        <button
          type="button"
          aria-label="Close"
          disabled={locked}
          onClick={close}
        >
          <X size={19} />
        </button>
      </div>

      {children}
    </dialog>
  );
}
function toOriginalReceipt(order) {
  return {
    ...order,

    date: order.completedAt || order.createdAt,
    payment: order.paymentMethod,

    customer:
      [order.customerName, order.customerPhone].filter(Boolean).join(" · ") ||
      "Walk-in customer",

    cash: Number(order.cashPaid),
    card: Number(order.cardPaid),
    cashReceived: Number(order.cashReceived),
    changeDue: Number(order.changeDue),

    total: Number(order.total),
    subtotal: Number(order.subtotal),
    discount: Number(order.discount),

    items: (order.items || []).map((item) => ({
      ...item,
      id: item.productId,
      productId: item.productId,
      qty: Number(item.quantity),
      price: Number(item.price),
    })),

    returns: order.returns || [],
  };
}

export default function PosView({ settings = {} }) {
  const root = useRef(null);
  const barcode = useRef(null);
  const alive = useRef(false);
  const op = useRef(false);
  const booted = useRef(false);
  const catalogueVersion = useRef(0);
  const bootstrapInFlight = useRef(false);
  const draftRef = useRef(emptyDraft());

  const [actor, setActor] = useState(null);
  const [products, setProducts] = useState([]);
  const [draft, setDraftState] = useState(emptyDraft);
  const [pending, setPending] = useState(null);

  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [storageError, setStorageError] = useState("");

  const [scan, setScan] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [page, setPage] = useState(1);

  const [customer, setCustomer] = useState(null);
  const [customerStatus, setCustomerStatus] = useState("");
  const [customerLookupState, setCustomerLookupState] = useState("walk-in");

  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [customerSaving, setCustomerSaving] = useState(false);
  const [customerCreateError, setCustomerCreateError] = useState("");
  const [customerLookupVersion, setCustomerLookupVersion] = useState(0);
  const customerSaveLock = useRef(false);

  const [modal, setModal] = useState(null);
  const [bills, setBills] = useState([]);
  const [heldCount, setHeldCount] = useState(0);
  const [receipt, setReceipt] = useState(null);

  const [method, setMethod] = useState("Cash");
  const [cash, setCash] = useState("");
  const [card, setCard] = useState("");

  function setDraft(value) {
    const next = typeof value === "function" ? value(draftRef.current) : value;

    draftRef.current = next;
    setDraftState(next);

    if (actor) {
      try {
        sessionStorage.setItem(
          keyFor(actor.key, "draft"),
          JSON.stringify(next),
        );

        setStorageError("");
      } catch {
        setStorageError(
          "Browser storage is unavailable. Keep this page open and enable storage before checkout.",
        );
      }
    }
  }

  async function bootstrap(initial = false, reprice = false) {
    if (bootstrapInFlight.current) return;
    bootstrapInFlight.current = true;
    const version = ++catalogueVersion.current;

    if (initial) setLoading(true);

    try {
      const result = await loadPOS();

      if (!alive.current || version !== catalogueVersion.current) {
        return;
      }

      if (!Array.isArray(result.products) || !result.actor?.key) {
        throw new Error("Invalid catalogue response.");
      }

      setProducts(result.products);
      setError("");
      setLoading(false);
      if (result.offline)
        setNotice(
          "Offline catalogue ready. Cash bills for walk-in or downloaded customers are saved on this device until database confirmation.",
        );

      if (!booted.current) {
        setActor(result.actor);

        try {
          const saved = JSON.parse(
            sessionStorage.getItem(keyFor(result.actor.key, "draft")) || "null",
          );

          const unresolved = JSON.parse(
            sessionStorage.getItem(keyFor(result.actor.key, "pending")) ||
              "null",
          );

          if (saved && Array.isArray(saved.items)) {
            draftRef.current = saved;
            setDraftState(saved);
          }

          if (unresolved?.requestKey) {
            setPending(unresolved);
          }
        } catch {
          setStorageError(
            "Saved POS draft could not be read. Do not clear browser storage if a payment was pending; contact your administrator.",
          );
        }

        booted.current = true;
      }

      if (reprice && !op.current) {
        setDraft((current) => ({
          ...current,
          items: current.items.map((item) => {
            const live = result.products.find((p) => p.id === item.productId);

            return live
              ? {
                  ...item,
                  name: live.name,
                  sku: live.sku,
                  size: live.size,
                  colour: live.colour,
                  price: String(live.price),
                }
              : item;
          }),
        }));

        setNotice(
          "Prices and stock refreshed. Check quantities before payment.",
        );
      }
    } catch (err) {
      if (alive.current && version === catalogueVersion.current) {
        setError(err.message);
      }
    } finally {
      bootstrapInFlight.current = false;
      if (alive.current && version === catalogueVersion.current) {
        setLoading(false);
      }
    }
  }

  async function updateHeldCount() {
    try {
      const result = await listOrders("Held");

      if (alive.current) {
        setHeldCount(result.orders.length);
      }
    } catch {
      // Opening the bill list reports errors visibly.
    }
  }

  useEffect(() => {
    alive.current = true;

    bootstrap(true);
    updateHeldCount();
    const reconnect = () => bootstrap(!booted.current);
    window.addEventListener("online", reconnect);

    const poll = setInterval(() => {
      if (!document.hidden && !op.current && booted.current) {
        bootstrap();
      }
    }, 30000);

    return () => {
      alive.current = false;
      catalogueVersion.current += 1;
      clearInterval(poll);
      window.removeEventListener("online", reconnect);
    };
  }, []);

  useLayoutEffect(() => {
    const resize = () => {
      if (root.current) {
        const height = Math.max(
          500,
          window.innerHeight - root.current.getBoundingClientRect().top - 20,
        );

        root.current.style.setProperty("--pos-height", `${height}px`);
      }
    };

    resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
    };
  }, [loading]);

  useEffect(() => {
    let active = true;

    setCustomer(null);

    if (!draft.phone) {
      setCustomerLookupState("walk-in");
      setCustomerStatus("Walk-in customer");
      return;
    }

    if (!/^\d{10}$/.test(draft.phone)) {
      setCustomerLookupState("invalid");
      setCustomerStatus("Enter exactly 10 digits.");
      return;
    }

    setCustomerLookupState("searching");
    setCustomerStatus("Searching customer...");

    const timer = setTimeout(async () => {
      try {
        const result = await findCustomer(draft.phone);

        if (!active) return;

        setCustomer(result.customer);
        setCustomerLookupState(result.customer ? "matched" : "not-found");
        setCustomerStatus(
          result.customer
            ? `${result.customer.name}${result.offline ? " - saved offline customer" : ""}`
            : result.offline
              ? "Customer not downloaded on this device. Connect online to register/download, or clear the phone for walk-in."
              : "Customer not found. Click New customer, or clear for walk-in.",
        );
      } catch (err) {
        if (active) {
          setCustomerLookupState("unavailable");
          setCustomerStatus(err.message);
        }
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [draft.phone, customerLookupVersion]);

  useEffect(() => {
    const refreshCustomer = () => setCustomerLookupVersion((v) => v + 1);
    window.addEventListener("offline", refreshCustomer);
    window.addEventListener("online", refreshCustomer);
    return () => {
      window.removeEventListener("offline", refreshCustomer);
      window.removeEventListener("online", refreshCustomer);
    };
  }, []);

  const blocked = loading || busy || Boolean(pending) || !actor;

  const subtotal = draft.items.reduce(
    (sum, item) => sum + toCents(item.price) * item.quantity,
    0,
  );

  const discount = toCents(draft.discount || "0");
  const total = subtotal - discount;

  const units = draft.items.reduce((sum, item) => sum + item.quantity, 0);

  const customerOK = !draft.phone || customer?.phonenumber === draft.phone;

  const totalsOK =
    Number.isSafeInteger(total) && total >= 0 && subtotal <= 999999999999;

  const selectedCard =
    method === "Card" ? total : method === "Split" ? toCents(card) : 0;

  const cashDue = total - selectedCard;

  const received = method === "Card" ? 0 : toCents(cash);

  const paymentOK =
    totalsOK &&
    Number.isFinite(selectedCard) &&
    Number.isFinite(received) &&
    received >= cashDue &&
    (method !== "Split" || (selectedCard > 0 && selectedCard < total));

  function openNewCustomer() {
    if (blocked || op.current || customerSaveLock.current) return;

    setNewCustomerName("");
    setNewCustomerPhone(draftRef.current.phone || "");
    setCustomerCreateError("");
    setModal("new-customer");
  }

  function closeNewCustomer() {
    if (customerSaveLock.current) return;

    setModal(null);

    requestAnimationFrame(() => {
      barcode.current?.focus();
    });
  }

  async function saveNewCustomer(event) {
    event.preventDefault();

    if (customerSaveLock.current || blocked || op.current) {
      return;
    }

    const name = newCustomerName.trim();
    const phonenumber = newCustomerPhone.trim();

    if (!name) {
      setCustomerCreateError("Enter the customer name.");
      return;
    }

    if (!/^\d{10}$/.test(phonenumber)) {
      setCustomerCreateError("Phone number must contain exactly 10 digits.");
      return;
    }

    const token = sessionStorage.getItem("genzi_api_token");

    if (!token) {
      setCustomerCreateError("Your session has expired. Please sign in again.");
      window.dispatchEvent(new Event("genzi-session-expired"));
      return;
    }

    customerSaveLock.current = true;
    setCustomerSaving(true);
    setCustomerCreateError("");

    try {
      const apiBase = (
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  "/api"
).replace(/\/+$/, "");

      const response = await fetch(`${apiBase}/customers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          phonenumber,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (response.status === 401) {
        sessionStorage.removeItem("genzi_api_token");
        window.dispatchEvent(new Event("genzi-session-expired"));

        throw new Error("Your session has expired. Please sign in again.");
      }

      if (!response.ok) {
        throw new Error(
          result.message ||
            (response.status === 409
              ? "This phone number already exists. Close this form and search that number."
              : "Unable to save the customer."),
        );
      }

      if (!alive.current) return;

      // Preserve the current bill and select the registered phone.
      setCustomer(null);
      setCustomerStatus("Searching customer...");

      setDraft((current) => ({
        ...current,
        phone: phonenumber,
      }));

      setCustomerLookupVersion((value) => value + 1);
      setModal(null);
      setNotice(`Customer ${name} saved.`);
      setError("");

      window.dispatchEvent(new Event("genzi-customers-changed"));

      requestAnimationFrame(() => {
        barcode.current?.focus();
      });
    } catch (err) {
      if (alive.current) {
        setCustomerCreateError(
          err instanceof TypeError
            ? "Connection interrupted. The customer may have been saved. Close this form and search the phone number before retrying."
            : err.message || "Unable to save the customer.",
        );
      }
    } finally {
      customerSaveLock.current = false;

      if (alive.current) {
        setCustomerSaving(false);
      }
    }
  }

  function addProduct(product) {
    if (blocked || op.current) return;

    const current = draftRef.current;

    const old = current.items.find((item) => item.productId === product.id);

    if ((old?.quantity || 0) >= Number(product.stock)) {
      setError(`Stock limit reached for ${product.name}.`);
      return;
    }

    if (!old && current.items.length >= 100) {
      setError("A bill can contain up to 100 different products.");
      return;
    }

    setDraft({
      ...current,

      items: old
        ? current.items.map((item) =>
            item.productId === product.id
              ? {
                  ...item,
                  quantity: item.quantity + 1,
                }
              : item,
          )
        : [
            ...current.items,
            {
              productId: product.id,
              name: product.name,
              sku: product.sku,
              size: product.size,
              colour: product.colour,
              price: String(product.price),
              quantity: 1,
            },
          ],
    });

    setError("");
    setNotice(`${product.sku} · ${product.name} added.`);
    setScan("");
    barcode.current?.focus();
  }

  function scanProduct(event) {
    event.preventDefault();

    const code = scan.trim();

    const product = products.find((item) => item.sku === code);

    if (!/^\d{6}$/.test(code) || !product) {
      setError(
        `SKU ${code || "(empty)"} not found. Scan the six-digit product SKU.`,
      );

      barcode.current?.select();
      return;
    }

    addProduct(product);
  }

  function quantity(productId, value) {
    if (blocked) return;
    if (!Number.isInteger(value) || value < 0) return;

    const stock = Number(products.find((p) => p.id === productId)?.stock || 0);

    const old = draft.items.find((item) => item.productId === productId);

    if (value > old.quantity && value > stock) {
      setError(`Only ${stock} units are currently available.`);
      return;
    }

    setDraft((current) => ({
      ...current,

      items:
        value === 0
          ? current.items.filter((item) => item.productId !== productId)
          : current.items.map((item) =>
              item.productId === productId
                ? { ...item, quantity: value }
                : item,
            ),
    }));
  }

  function billSettings() {
    return {
      store: settings.store || "Gen Zi Corner",
      address: settings.address || "",
      phone: settings.phone || "",
      tagline: settings.tagline || "",
      footer: settings.footer || "Thank you for shopping with us!",
      width: Number(settings.receiptWidth) === 58 ? 58 : 80,
    };
  }

  function payload(action) {
    const current = draftRef.current;

    if (!current.items.length || !totalsOK || !customerOK) {
      throw new Error("Check the items, customer phone and discount first.");
    }

    return {
      requestKey: crypto.randomUUID(),
      action,

      ...(current.heldId
        ? {
            id: current.heldId,
            version: current.version,
          }
        : {}),

      customerPhone: current.phone,
      discount: current.discount || "0",

      items: current.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        expectedPrice: item.price,
      })),

      settings: billSettings(),

      ...(action === "complete"
        ? {
            payment: {
              method,
              cashReceived: method === "Card" ? "0" : cash,
              cardPaid: method === "Split" ? card : "0",
            },
          }
        : {}),
    };
  }

  function confirmed(result, body) {
    if (!result?.order?.id) {
      throw new Error(
        "Invalid server confirmation. Recover this request before continuing.",
      );
    }

    const order = result.order;

    if (body.action !== "cancel" || draftRef.current.heldId === body.id) {
      setDraft(emptyDraft());
    }

    try {
      sessionStorage.removeItem(keyFor(actor.key, "pending"));
    } catch {
      setStorageError(
        "Sale confirmed, but browser storage could not be updated. Keep the receipt number.",
      );
    }

    setPending(null);
    setModal(null);
    setError("");

    if (order.status === "Completed") {
      setReceipt({
        ...order,
        autoPrintRequested: Boolean(order.settings?.autoPrint),
      });
      setModal("receipt");

      setNotice(
        order.offline
          ? `Sale ${order.number} saved on this device. Database sync pending; keep this browser signed in.`
          : `Sale ${order.number} confirmed. Stock updated.`,
      );

      window.dispatchEvent(new Event("genzi-products-changed"));

      window.dispatchEvent(new Event("genzi-sales-changed"));
    } else {
      setNotice(
        order.status === "Held"
          ? `${order.number} held. Stock is not reserved.`
          : `${order.number} cancelled.`,
      );
    }

    bootstrap();
    updateHeldCount();
  }

  async function execute(body, recovery = false) {
    if (op.current || !actor) return;

    op.current = true;
    setBusy(true);
    setError("");

    try {
      // Persist before sending a payment request.
      sessionStorage.setItem(
        keyFor(actor.key, "pending"),
        JSON.stringify(body),
      );

      setPending(body);

      let result = recovery
        ? (await recoverRequest(body.requestKey)).result
        : null;

      // Retry always uses the same request key and body.
      if (!result) {
        result = await submitOrder(body);
      }

      if (alive.current) {
        confirmed(result, body);
      }
    } catch (err) {
      if (!alive.current) return;

      const definite = err.status >= 400 && err.status < 500 && !err.uncertain;

      if (definite) {
        try {
          sessionStorage.removeItem(keyFor(actor.key, "pending"));
        } catch {
          // Keep the error visible.
        }

        setPending(null);
      }

      setError(
        err.message || "Unable to confirm this bill. Use Recover / Retry.",
      );
    } finally {
      op.current = false;

      if (alive.current) {
        setBusy(false);
      }
    }
  }

  function hold() {
    try {
      execute(payload("hold"));
    } catch (err) {
      setError(err.message);
    }
  }

  function openPayment() {
    if (blocked || !draft.items.length) return;

    if (!customerOK || !totalsOK) {
      setError("Check customer phone and discount.");
      return;
    }

    setMethod("Cash");
    setCash("");
    setCard("");
    setError("");
    setModal("payment");
  }

  async function showBills(status) {
    if (blocked || op.current) return;

    op.current = true;
    setBusy(true);
    setError("");

    try {
      const result = await listOrders(status);

      if (alive.current) {
        setBills(result.orders);
        setModal(status === "Held" ? "held" : "history");
      }
    } catch (err) {
      if (alive.current) setError(err.message);
    } finally {
      op.current = false;
      if (alive.current) setBusy(false);
    }
  }

  async function openBill(id, resume) {
    if (op.current) return;

    if (resume && draft.items.length) {
      setError("Hold or clear the current bill before resuming another.");
      return;
    }

    op.current = true;
    setBusy(true);
    setError("");

    try {
      const { order } = await getOrder(id);

      if (!alive.current) return;

      if (resume) {
        if (order.status !== "Held") {
          throw new Error("This bill is no longer held. Refresh the list.");
        }

        setDraft({
          heldId: order.id,
          version: order.version,
          phone: order.customerPhone || "",
          discount: order.discount,

          items: order.items.map((item) => ({
            ...item,
            price: String(item.price),
            quantity: Number(item.quantity),
          })),
        });

        setModal(null);

        setNotice(
          `${order.number} resumed. Prices and stock will be checked at payment.`,
        );
      } else {
        setReceipt(order);
        setModal("receipt");
      }
    } catch (err) {
      if (alive.current) setError(err.message);
    } finally {
      op.current = false;
      if (alive.current) setBusy(false);
    }
  }

  useEffect(() => {
    function shortcut(event) {
      if (modal || blocked || event.repeat) return;

      if (!["F2", "F4", "F6", "F7"].includes(event.key)) {
        return;
      }

      event.preventDefault();

      if (event.key === "F2") {
        barcode.current?.focus();
      }

      if (event.key === "F4") {
        openPayment();
      }

      if (event.key === "F6" && draft.items.length) {
        hold();
      }

      if (event.key === "F7") {
        showBills("Held");
      }
    }

    window.addEventListener("keydown", shortcut);

    return () => {
      window.removeEventListener("keydown", shortcut);
    };
  });

  const matches = products.filter((product) => {
    const categoryMatches = category === "All" || product.category === category;

    const textMatches = `${product.name} ${product.sku}`
      .toLowerCase()
      .includes(search.trim().toLowerCase());

    return categoryMatches && textMatches;
  });

  const pages = Math.max(1, Math.ceil(matches.length / 12));

  const currentPage = Math.min(page, pages);

  const visible = matches.slice((currentPage - 1) * 12, currentPage * 12);

  const localError = error && (
    <div className="gzpos-alert" role="alert">
      {error}
    </div>
  );

  return (
    <section className="gzpos" ref={root}>
      <div className="gzpos-top">
        <div>
          <h1>POS checkout</h1>

          <small>
            {actor?.name || "Connecting..."} · F2 scan · F4 pay · F6 hold · F7
            held bills
          </small>
        </div>

        <div className="gzpos-actions">
          <button disabled={blocked} onClick={() => showBills("Completed")}>
            Recent receipts
          </button>

          <button disabled={blocked} onClick={() => showBills("Held")}>
            <Pause size={15} />
            Held bills ({heldCount})
          </button>
        </div>
      </div>

      {localError}
      {error && !actor && (
        <button
          type="button"
          disabled={loading || busy}
          onClick={() => bootstrap(true)}
        >
          Retry loading catalogue
        </button>
      )}

      {storageError && (
        <div className="gzpos-alert" role="alert">
          {storageError}
        </div>
      )}

      {pending && (
        <div className="gzpos-pending">
          <strong>
            Unconfirmed {pending.action} request — bill editing is locked.
          </strong>

          <button disabled={busy} onClick={() => execute(pending, true)}>
            {busy ? "Checking..." : "Recover / Retry safely"}
          </button>
        </div>
      )}

      <div className="gzpos-layout">
        <div className="gzpos-catalogue gzpos-panel">
          <form className="gzpos-scan" onSubmit={scanProduct}>
            <label>
              Barcode / SKU
              <input
                ref={barcode}
                autoFocus
                disabled={blocked}
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                autoComplete="off"
                placeholder="Scan six-digit SKU, then Enter"
              />
            </label>

            <button className="gzpos-primary" disabled={blocked}>
              <Barcode size={18} />
              Add item
            </button>
          </form>

          <small className="gzpos-notice" role="status">
            {notice ||
              "Scanner ready. Use a USB/Bluetooth keyboard-mode scanner with Enter suffix."}
          </small>

          <div className="gzpos-section">
            <h2>Available products</h2>

            <button
              disabled={blocked}
              onClick={() => bootstrap(false, true)}
              title="Refresh catalogue and apply current prices to the bill"
            >
              <RefreshCw size={15} />
              Refresh prices &amp; stock
            </button>
          </div>

          <div className="gzpos-filters">
            <label>
              <span className="gzpos-sr">Search products</span>

              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search product name or SKU"
              />
            </label>

            <select
              aria-label="Category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
            >
              <option>All</option>

              {[...new Set(products.map((product) => product.category))]
                .sort()
                .map((name) => (
                  <option key={name}>{name}</option>
                ))}
            </select>
          </div>

          <div className="gzpos-products">
            <table>
              <thead>
                <tr>
                  <th>SKU / Product</th>
                  <th>Size / Colour</th>
                  <th>Stock</th>
                  <th>Price</th>
                  <th>Add</th>
                </tr>
              </thead>

              <tbody>
                {visible.map((product) => {
                  const selected =
                    draft.items.find((item) => item.productId === product.id)
                      ?.quantity || 0;

                  return (
                    <tr key={product.id}>
                      <td>
                        <small>{product.sku}</small>
                        <strong>{product.name}</strong>

                        <small>
                          {product.category}
                          {product.brand ? ` · ${product.brand}` : ""}
                        </small>
                      </td>

                      <td>
                        {[product.size, product.colour]
                          .filter(Boolean)
                          .join(" / ") || "—"}
                      </td>

                      <td>
                        <span
                          className={
                            Number(product.stock) === 0 ? "gzpos-stock-out" : ""
                          }
                        >
                          {product.stock}
                        </span>

                        {selected > 0 && <small>{selected} in bill</small>}
                      </td>

                      <td>{money(product.price)}</td>

                      <td>
                        <button
                          aria-label={`Add ${product.name}`}
                          disabled={
                            blocked || selected >= Number(product.stock)
                          }
                          onClick={() => addProduct(product)}
                        >
                          <Plus size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {loading ? (
              <p>Loading products...</p>
            ) : !matches.length ? (
              <p>No matching products.</p>
            ) : null}
          </div>

          <div className="gzpos-pagination">
            <small>
              {matches.length} products · Page {currentPage}/{pages}
            </small>

            <div>
              <button
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </button>

              <button
                disabled={currentPage >= pages}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        <aside className="gzpos-summary gzpos-panel">
          <div className="gzpos-summary-heading">
            <h2>
              Order summary {draft.heldId && <small>· Resumed bill</small>}
            </h2>

            <button
              type="button"
              className="gzpos-new-customer-button"
              disabled={blocked || customerSaving}
              onClick={openNewCustomer}
            >
              <Plus size={15} />
              New customer
            </button>
          </div>

          <label>
            Customer phone number
            <input
              disabled={blocked}
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={draft.phone}
              placeholder="Optional — walk-in customer"
              onChange={(e) => {
                if (/^\d{0,10}$/.test(e.target.value)) {
                  setDraft((current) => ({
                    ...current,
                    phone: e.target.value,
                  }));
                }
              }}
            />
          </label>

          <small
            className={draft.phone && !customer ? "gzpos-customer-warning" : ""}
          >
            {customerStatus}
          </small>

          <div className="gzpos-section">
            <h3>Current sale · {units} items</h3>

            <button
              disabled={blocked || (!draft.items.length && !draft.heldId)}
              onClick={() => {
                const question = draft.heldId
                  ? "Discard local edits? The saved held bill will remain in Held bills."
                  : "Clear this unsaved bill?";

                if (window.confirm(question)) {
                  setDraft(emptyDraft());
                  setError("");
                }
              }}
            >
              Clear
            </button>
          </div>

          <div className="gzpos-cart">
            {draft.items.map((item) => {
              const live = products.find(
                (product) => product.id === item.productId,
              );

              return (
                <article key={item.productId}>
                  <div className="gzpos-cart-title">
                    <div>
                      <strong>{item.name}</strong>

                      <small>
                        {item.sku} ·{" "}
                        {[item.size, item.colour].filter(Boolean).join(" / ")}
                      </small>
                    </div>

                    <button
                      aria-label={`Remove ${item.name}`}
                      disabled={blocked}
                      onClick={() => quantity(item.productId, 0)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  <div className="gzpos-cart-bottom">
                    <span>{money(item.price)}</span>

                    <div className="gzpos-qty">
                      <button
                        disabled={blocked}
                        aria-label={`Decrease ${item.name}`}
                        onClick={() =>
                          quantity(item.productId, item.quantity - 1)
                        }
                      >
                        <Minus size={13} />
                      </button>

                      <span>{item.quantity}</span>

                      <button
                        disabled={
                          blocked ||
                          !live ||
                          item.quantity >= Number(live.stock)
                        }
                        aria-label={`Increase ${item.name}`}
                        onClick={() =>
                          quantity(item.productId, item.quantity + 1)
                        }
                      >
                        <Plus size={13} />
                      </button>
                    </div>

                    <b>{money(amount(toCents(item.price) * item.quantity))}</b>
                  </div>

                  {(!live || item.quantity > Number(live.stock)) && (
                    <small className="gzpos-stock-out">
                      {live
                        ? `Only ${live.stock} available — reduce quantity.`
                        : "Product removed — remove this item."}
                    </small>
                  )}
                </article>
              );
            })}

            {!draft.items.length && (
              <div className="gzpos-empty">
                <Barcode size={28} />
                <p>Scan or select a product to begin.</p>
              </div>
            )}
          </div>

          <div className="gzpos-totals">
            <div>
              <span>Items</span>
              <b>{units}</b>
            </div>

            <div>
              <span>Subtotal</span>
              <b>{money(amount(subtotal))}</b>
            </div>

            <label>
              Discount (LKR)
              <input
                disabled={blocked}
                type="number"
                min="0"
                max={subtotal / 100}
                step="0.01"
                value={draft.discount}
                onChange={(e) =>
                  setDraft((current) => ({
                    ...current,
                    discount: e.target.value,
                  }))
                }
              />
            </label>

            <div className="gzpos-grand">
              <span>Total</span>

              <b>{money(totalsOK ? amount(total) : 0)}</b>
            </div>
          </div>

          <div className="gzpos-checkout">
            <button
              className="gzpos-primary"
              disabled={
                blocked ||
                !draft.items.length ||
                !totalsOK ||
                !customerOK ||
                Boolean(storageError)
              }
              onClick={openPayment}
            >
              Pay {money(totalsOK ? amount(total) : 0)}
            </button>

            <button
              disabled={
                blocked ||
                !draft.items.length ||
                !totalsOK ||
                !customerOK ||
                Boolean(storageError)
              }
              onClick={hold}
            >
              <Pause size={16} />

              {draft.heldId ? "Save held bill" : "Hold bill"}
            </button>
          </div>
        </aside>
      </div>

      {modal === "new-customer" && (
        <Dialog
          title="New customer"
          close={closeNewCustomer}
          locked={customerSaving}
        >
          <form
            className="gzpos-new-customer-form"
            onSubmit={saveNewCustomer}
            aria-busy={customerSaving}
          >
            {customerCreateError && (
              <p className="gzpos-error" role="alert">
                {customerCreateError}
              </p>
            )}

            <label htmlFor="pos-new-customer-name">
              Customer name
              <input
                id="pos-new-customer-name"
                type="text"
                autoComplete="name"
                autoFocus
                required
                value={newCustomerName}
                disabled={customerSaving}
                placeholder="Enter customer name"
                onChange={(event) => {
                  setNewCustomerName(event.target.value);
                  setCustomerCreateError("");
                }}
              />
            </label>

            <label htmlFor="pos-new-customer-phone">
              Phone number
              <input
                id="pos-new-customer-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                required
                pattern="[0-9]{10}"
                minLength={10}
                maxLength={10}
                title="Enter exactly 10 digits."
                value={newCustomerPhone}
                disabled={customerSaving}
                placeholder="0771234567"
                aria-describedby="pos-new-customer-phone-help"
                onChange={(event) => {
                  setNewCustomerPhone(
                    event.target.value.replace(/\D/g, "").slice(0, 10),
                  );
                  setCustomerCreateError("");
                }}
              />
            </label>

            <small id="pos-new-customer-phone-help">
              Enter exactly 10 digits.
            </small>

            <div className="gzpos-new-customer-actions">
              <button
                type="button"
                disabled={customerSaving}
                onClick={closeNewCustomer}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="gzpos-primary"
                disabled={
                  customerSaving ||
                  !newCustomerName.trim() ||
                  !/^\d{10}$/.test(newCustomerPhone)
                }
              >
                {customerSaving ? "Saving..." : "Save customer"}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {modal === "payment" &&
        createPortal(
          <PaymentModal
            close={() => {
              if (op.current || busy || pending) return;
              setModal(null);
            }}

            finish={(event) => {
              event.preventDefault();

              if (
                op.current ||
                busy ||
                pending ||
                !paymentOK ||
                !customerOK ||
                !totalsOK ||
                storageError
              ) {
                return;
              }

              try {
                execute(payload("complete"));
              } catch (err) {
                setError(err.message);
              }
            }}

            total={{
              total: totalsOK ? amount(total) : "0.00",
            }}

            payment={method}
            setPayment={setMethod}

            cardAmount={card}
            setCardAmount={setCard}

            tender={cash}
            setTender={setCash}

            money={money}

            data={{
              customers:
                customer && customer.phonenumber === draft.phone
                  ? [
                      {
                        ...customer,
                        phone: customer.phonenumber,
                      },
                    ]
                  : [],
            }}

            customer={draft.phone}
            customerLookupPending={customerLookupState === "searching"}
            customerLookupError={
              customerLookupState === "not-found" ||
              customerLookupState === "unavailable"
                ? customerStatus
                : ""
            }
            offline={navigator.onLine === false || isOfflineSession()}

            setCustomer={(phone) => {
              if (op.current || busy || pending) return;

              setDraft((current) => ({
                ...current,
                phone,
              }));
            }}

            busy={busy}
            pending={Boolean(pending)}
            error={error}

            canSubmit={customerOK && totalsOK && !storageError}

            recover={() => {
              if (pending) execute(pending, true);
            }}
          />,
          document.body,
        )}

      {(modal === "held" || modal === "history") && (
        <Dialog
          title={
            modal === "held"
              ? "Your held bills"
              : "Your last 30 completed sales"
          }
          locked={busy || Boolean(pending)}
          close={() => setModal(null)}
          wide
        >
          {localError}

          {pending && (
            <button disabled={busy} onClick={() => execute(pending, true)}>
              Recover / Retry safely
            </button>
          )}

          {modal === "held" && (
            <p>
              Held bills do not reserve stock. Hold or clear your current bill
              before resuming another.
            </p>
          )}

          <div className="gzpos-bills">
            {bills.map((bill) => (
              <article key={bill.id}>
                <div>
                  <strong>{bill.number}</strong>

                  <small>
                    {bill.customerName || "Walk-in"} · {bill.customerPhone}
                  </small>

                  <small>
                    {new Date(
                      bill.completedAt || bill.createdAt,
                    ).toLocaleString("en-LK")}
                  </small>

                  <b>{money(bill.total)}</b>
                </div>

                <div className="gzpos-actions">
                  <button
                    disabled={
                      busy ||
                      Boolean(pending) ||
                      (modal === "held" && draft.items.length > 0)
                    }
                    onClick={() => openBill(bill.id, modal === "held")}
                  >
                    {modal === "held" ? "Resume" : "View / Print"}
                  </button>

                  {modal === "held" && (
                    <button
                      disabled={busy || Boolean(pending)}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Cancel ${bill.number}? No stock has been deducted.`,
                          )
                        ) {
                          execute({
                            requestKey: crypto.randomUUID(),
                            action: "cancel",
                            id: bill.id,
                            version: bill.version,
                          });
                        }
                      }}
                    >
                      Cancel bill
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>

          {!bills.length && <p>No bills found.</p>}
        </Dialog>
      )}

      {modal === "receipt" &&
        receipt &&
        createPortal(
          <ReceiptModal
            close={() => {
              setModal(null);

              requestAnimationFrame(() => {
                barcode.current?.focus();
              });
            }}

            data={{
              settings: {
                ...settings,
                ...(receipt.settings || {}),

                receiptWidth:
                  receipt.settings?.width ?? settings.receiptWidth ?? 80,
              },

              products,
            }}

            modal={{
              sale: toOriginalReceipt(receipt),
            }}

            money={money}
            autoPrint={Boolean(receipt.autoPrintRequested)}
          />,
          document.body,
        )}
    </section>
  );
}
