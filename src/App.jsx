import { isOfflineSession } from "./offline/access";
import { syncOfflineOrders } from "./api/pos";
import { handleFormEnter, ignoreShortcut } from "./keyboard";
import { processReturn, returnStatus } from "./exchange";
import ReturnReceipt from "./components/orders/ReturnReceipt";
import { deleteLocalSale } from "./saleDeletion";
import DataTable from "./components/common/DataTable";
import { applyReturn, refundTotal, returnedQty } from "./returns";
import ReturnModal from "./components/orders/ReturnModal";
import CatalogueTools from "./components/products/CatalogueTools";
import Header from "./components/layout/Header";
import DashboardView from "./components/dashboard/DashboardView";
import ExpensesView from "./components/expenses/ExpensesView";
import ReceiptModal from "./components/pos/ReceiptModal";
import PaymentModal from "./components/pos/PaymentModal";
import LoginView from "./components/auth/LoginView";
import LabelsView from "./components/labels/LabelsView";
import SettingsView from "./components/settings/SettingsView";
import ReportsView from "./components/reports/ReportsView";
import Label from "./components/common/Label";
import Modal from "./components/common/Modal";
import Empty from "./components/common/Empty";
import OfflineView from "./components/offline/OfflineView";
import EmployeesView from "./components/employees/EmployeesView";
import SalesView from "./components/Sales/SalesView";
import SuppliersView from "./components/suppliers/SuppliersView";
import CustomersView from "./components/customers/CustomersView";
import OrdersView from "./components/orders/OrdersView";
import InventoryView from "./components/inventory/InventoryView";
import CategoriesView from "./components/categories/CategoriesView";
import ProductsView from "./components/products/ProductsView";
import PosView from "./components/pos/PosView";
import { getMyPermissions } from "./api/permissions";
import { getSettings } from "./api/settings";

import {
  validCustomerPhone,
  findCustomersByPhone,
} from "./components/pos/CustomerPhoneField";
import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Layers,
  Boxes,
  Truck,
  Users,
  Contact,
  Receipt,
  Barcode,
  BarChart3,
  Shield,
  Cloud,
  Settings,
  Search,
  Plus,
  Sun,
  Moon,
  LogOut,
  ChevronRight,
  X,
  Trash2,
  Pencil,
  Printer,
  Download,
  Wifi,
  WifiOff,
  Check,
  ArrowUpRight,
  ShoppingCart,
  Menu,
  Keyboard,
} from "lucide-react";
import Swal from "sweetalert2";
import JsBarcode from "jsbarcode";
import { seed, money, totals, completeSale } from "./domain";
import { syncSales } from "./cloud";
import {
  loginAdmin,
  getCurrentUser,
  logoutAdmin,
  getCategories,
  saveCategory,
  deleteCategory,
} from "./api/categories";
function AppSidebar({
  side,
  pages: pages2,
  page,
  setPage,
  setQuery,
  pending,
  onLogout,
}) {
  return (
    <aside
      id="gz-app-navigation"
      className={`sidebar gz-app-sidebar ${side ? "is-expanded" : "is-collapsed"}`}
      inert={!side}
      aria-label="Store navigation"
    >
      <div className="brand">
        <img src="/assets/logo.png" alt="Gen Zi Corner" />
        <div>
          <b>GEN ZI CORNER</b>
          <small>STORE WORKSPACE</small>
        </div>
      </div>
      <span className="nav-label">MAIN MENU</span>
      <nav>
        {pages2.map(([name, Icon]) => (
          <button
            type="button"
            key={name}
            className={page === name ? "active" : ""}
            aria-current={page === name ? "page" : void 0}
            onClick={() => {
              setPage(name);
              setQuery("");
            }}
          >
            <Icon size={18} />
            <span>{name}</span>
            {name === "Offline Sync Center" && pending.length > 0 && (
              <em>{pending.length}</em>
            )}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="avatar">SM</div>
        <div>
          <b>Store Manager</b>
          <small>Store workspace</small>
        </div>
        <button
          type="button"
          className="icon"
          aria-label="Log out"
          onClick={onLogout}
        >
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
}
const sidebarLayoutCss = `
.app.gz-sidebar-layout{--gz-nav-width:250px;display:flex;min-height:100vh}
.app.gz-sidebar-layout>.sidebar.gz-app-sidebar{position:fixed;inset:0 auto 0 0;z-index:40;display:flex;flex-direction:column;width:var(--gz-nav-width);height:100vh;height:100dvh;padding:24px 13px;background:var(--nav,#231c32);color:#c8c0d8;overflow:hidden;transition:transform .25s ease,visibility .25s}
.app.gz-sidebar-layout>.gz-app-sidebar.is-expanded{transform:translateX(0);visibility:visible}
.app.gz-sidebar-layout>.gz-app-sidebar.is-collapsed{transform:translateX(-100%);visibility:hidden;pointer-events:none}
.app.gz-sidebar-layout>.gz-app-sidebar .brand{flex-shrink:0;padding-bottom:26px}
.app.gz-sidebar-layout>.gz-app-sidebar nav{flex:1;min-height:0;overflow-y:auto;scrollbar-width:thin}
.app.gz-sidebar-layout>.gz-app-sidebar nav>button{display:flex;align-items:center;gap:11px;width:100%;margin-bottom:5px;padding:13px 12px;border-radius:10px;text-align:left}
.app.gz-sidebar-layout>.gz-app-sidebar nav>button span{flex:1}
.app.gz-sidebar-layout>.gz-app-sidebar .sidebar-bottom{flex-shrink:0;margin-top:15px}
.app.gz-sidebar-layout>.workspace{flex:none;min-width:0;transition:margin-left .25s ease,width .25s ease}
.app.gz-sidebar-layout.gz-nav-expanded>.workspace{width:calc(100% - var(--gz-nav-width));margin-left:var(--gz-nav-width)}
.app.gz-sidebar-layout.gz-nav-collapsed>.workspace{width:100%;margin-left:0}
.app.gz-sidebar-layout>.gz-app-toggle{position:fixed;top:13px;left:14px;z-index:50;display:grid;place-items:center;width:40px;height:40px;padding:0;border:1px solid var(--line,#ebe8f1);border-radius:10px;background:var(--panel,#fff);color:var(--text,#242038);cursor:pointer;transition:left .25s ease}
.app.gz-sidebar-layout.gz-nav-expanded>.gz-app-toggle{left:calc(var(--gz-nav-width) + 14px)}
.app.gz-sidebar-layout .gz-topbar{padding-left:70px}
.app.gz-sidebar-layout .gz-topbar .mobile-menu{display:none}
@media(max-width:700px){.app.gz-sidebar-layout{--gz-nav-width:210px}}
@media(prefers-reduced-motion:reduce){.app.gz-sidebar-layout>.sidebar.gz-app-sidebar,.app.gz-sidebar-layout>.workspace,.app.gz-sidebar-layout>.gz-app-toggle{transition:none}}
@media print{.app.gz-sidebar-layout>.gz-app-toggle{display:none}}
`;
const pages = [
  ["Overview", LayoutDashboard],
  ["POS Checkout", ShoppingBag],
  ["Products & Variants", Package],
  ["Categories", Layers],
  ["Stock & Transfers", Boxes],
  ["Purchase Orders", Truck],
  ["Customers & Loyalty", Users],
  ["Suppliers", Contact],
  ["Sales & Exchanges", Receipt],
  ["Barcode Studio", Barcode],
  ["Reports & Insights", BarChart3],
  ["Expenses", Receipt],
  ["Staff & Permissions", Shield],
  ["Offline Sync Center", Cloud],
  ["Settings & Printers", Settings],
];

// const allowedPages = useMemo(() => {
//   if (!userPermissions) return [];

//   return pages.filter(([name]) => {
//     const module = PAGE_PERMISSIONS[name];

//     if (!module) {
//       return false;
//     }

//     return userPermissions[module]?.view === true;
//   });
// }, [pages, userPermissions]);

// useEffect(() => {
//   if (permissionsLoading || !userPermissions) return;

//   const permittedNames = allowedPages.map(([name]) => name);

//   if (!permittedNames.includes(page)) {
//     setPage(permittedNames[0] || "");
//     setQuery("");
//   }
// }, [
//   allowedPages,
//   page,
//   permissionsLoading,
//   userPermissions
// ]);

const schemas = {
  expenses: [
    ["name", "Expense description"],
    ["date", "Date", "date"],
    ["amount", "Amount (LKR)", "number"],
    ["category", "Expense category"],
  ],
  products: [
    ["name", "Product name"],
    ["sku", "SKU / barcode"],
    ["brand", "Brand"],
    ["category", "Category", "category"],
    ["size", "Size"],
    ["colour", "Colour"],
    ["price", "Selling price (LKR)", "number"],
    ["cost", "Cost (LKR)", "number"],
    ["stock", "Opening stock", "number"],
    ["reorderLevel", "Reorder minimum", "number"],
    ["image", "Product photo", "file"],
  ],
  categories: [
    ["name", "Category name"],
    ["description", "Description"],
  ],
  customers: [
    ["name", "Customer name"],
    ["phone", "Phone"],
    ["email", "Email", "email"],
    ["points", "Loyalty points", "number"],
  ],
  suppliers: [
    ["name", "Supplier name"],
    ["phone", "Phone"],
    ["email", "Email", "email"],
    ["balance", "Opening balance (LKR)", "number"],
  ],
  purchases: [
    ["supplier", "Supplier", "supplier"],
    ["productId", "Product", "product"],
    ["quantity", "Quantity", "number"],
    ["cost", "Unit cost (LKR)", "number"],
  ],
  staff: [
    ["name", "Staff name"],
    ["email", "Email", "email"],
    ["role", "Role", "role"],
    ["active", "Active", "active"],
  ],
};
function load() {
  try {
    const d =
      JSON.parse(localStorage.getItem("genzi-v1")) || structuredClone(seed);
    d.settings = {
      ...seed.settings,
      ...d.settings,
      receiptWidth: String(d.settings?.receiptWidth || 80).replace("mm", ""),
    };
    const images = ["dress", "saree", "shirt", "trousers", "kurti", "blue"];
    d.expenses = d.expenses || [];
    d.stockMovements = d.stockMovements || [];
    d.products = d.products
      .map((p) => ({
        ...p,
        image: images.some((n) => p.image === "/assets/" + n + ".jpg")
          ? "/assets/dress-" +
            images.indexOf(
              images.find((n) => p.image === "/assets/" + n + ".jpg"),
            ) +
            ".jpg"
          : p.image,
      }))
      .map((p) => ({
        ...p,
        image:
          p.image === "/assets/dress-0.jpg" ? "/assets/dress-0.jpeg" : p.image,
      }));
    return d;
  } catch {
    return structuredClone(seed);
  }
}

const PAGE_PERMISSIONS = {
  Overview: "dashboard",
  "POS Checkout": "pos",
  "Products & Variants": "products",
  Categories: "categories",
  "Stock & Transfers": "inventory",
  "Purchase Orders": "purchases",
  "Customers & Loyalty": "customers",
  Suppliers: "suppliers",
  "Sales & Exchanges": "sales",
  "Barcode Studio": "barcodes",
  "Reports & Insights": "reports",
  Expenses: "expenses",
  "Staff & Permissions": "staff",
  "Offline Sync Center": "offline_sync",
  "Settings & Printers": "settings",
};

function App() {
  const [data, setData] = useState(load),
    [page, setPage] = useState("Overview"),
    [user, setUser] = useState(null),
    [theme, setTheme] = useState(
      () => localStorage.getItem("genzi-theme") || "light",
    ),
    [online, setOnline] = useState(navigator.onLine),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("All"),
    [cart, setCart] = useState([]),
    [customer, setCustomer] = useState(""),
    [discount, setDiscount] = useState(0),
    [modal, setModal] = useState(null),
    [form, setForm] = useState({}),
    [payment, setPayment] = useState("Cash"),
    [tender, setTender] = useState(""),
    [cardAmount, setCardAmount] = useState(0),
    [side, setSide] = useState(true),
    [label, setLabel] = useState("p1"),
    [copies, setCopies] = useState(1),
    [syncing, setSyncing] = useState(false),
    [storageError, setStorageError] = useState("");
  const [filters, setFilters] = useState({
    size: "All",
    colour: "All",
    stock: "All",
  });
  const searchRef = useRef();
  const completing = useRef(false);

  const [authChecking, setAuthChecking] = useState(true);
  const [categoriesReady, setCategoriesReady] = useState(false);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoryError, setCategoryError] = useState("");
  const [categoryBusy, setCategoryBusy] = useState(false);

  const categoryInFlight = useRef(false);
  const categoryReadVersion = useRef(0);

  const [settingsMeta, setSettingsMeta] = useState(null);
  const [settingsError, setSettingsError] = useState("");
  const [settingsReload, setSettingsReload] = useState(0);

  const [userPermissions, setUserPermissions] = useState(null);
  const [permissionsLoading, setPermissionsLoading] = useState(true);

  // Get pages that the logged-in user is allowed to view.
  const allowedPages = useMemo(() => {
    if (!userPermissions) return [];

    return pages.filter(([name]) => {
      const moduleKey = PAGE_PERMISSIONS[name];

      if (!moduleKey) return false;

      const permission = userPermissions[moduleKey];

      return (
        permission?.view === true ||
        permission?.can_view === true ||
        permission?.view === 1 ||
        permission?.can_view === 1
      );
    });
  }, [userPermissions]);

  // Redirect if the current page is not permitted.
  useEffect(() => {
    if (permissionsLoading || !userPermissions) return;

    const isAllowed = allowedPages.some(([name]) => name === page);

    if (!isAllowed) {
      setPage(allowedPages[0]?.[0] || "");
      setQuery("");
    }
  }, [allowedPages, page, permissionsLoading]);

  useEffect(() => {
    let cancelled = false;

    async function loadPermissions() {
      const token = sessionStorage.getItem("genzi_api_token");

      if (!user || !token) {
        setUserPermissions(null);
        setPermissionsLoading(false);
        return;
      }

      setPermissionsLoading(true);
      setUserPermissions(null);

      try {
        const result = await getMyPermissions();

        if (!cancelled) {
          setUserPermissions(result.permissions || {});
        }
      } catch (error) {
        console.error("Unable to load permissions:", error);

        if (!cancelled) {
          setUserPermissions({});
        }
      } finally {
        if (!cancelled) {
          setPermissionsLoading(false);
        }
      }
    }

    loadPermissions();

    return () => {
      cancelled = true;
    };
  }, [user]);

  function applyStoreSettings(result) {
    setData((current) => ({
      ...current,
      settings: result.settings,
    }));

    setSettingsMeta({
      version: result.version,
      canEdit: result.canEdit,
    });
  }

  useEffect(() => {
    if (!user) {
      setSettingsMeta(null);
      setSettingsError("");
      return;
    }

    const controller = new AbortController();

    setSettingsMeta(null);
    setSettingsError("");

    getSettings(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          applyStoreSettings(result);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setSettingsError(error.message || "Unable to load settings.");
        }
      });

    return () => controller.abort();
  }, [user, settingsReload]);

  useEffect(() => {
    let active = true;

    function expireSession() {
      categoryReadVersion.current += 1;
      setUser(null);
      setModal(null);
      setCategoriesReady(false);
      setCategoriesLoading(false);
      sessionStorage.removeItem("genzi_demo_user");
    }

    window.addEventListener("genzi-session-expired", expireSession);

    async function restoreSession() {
      try {
        if (!sessionStorage.getItem("genzi_api_token")) return;

        const account = await getCurrentUser();

        if (active && account?.name) {
          setUser(account.name);
        }
      } catch {
        if (active) {
          sessionStorage.removeItem("genzi_api_token");
          sessionStorage.removeItem("genzi_demo_user");
        }
      } finally {
        if (active) setAuthChecking(false);
      }
    }

    restoreSession();

    return () => {
      active = false;
      window.removeEventListener("genzi-session-expired", expireSession);
    };
  }, []);

  async function refreshCategories() {
    if (categoryInFlight.current) return;

    const token = sessionStorage.getItem("genzi_api_token");
    if (!token) return;

    const version = ++categoryReadVersion.current;

    setCategoriesLoading(true);
    setCategoriesReady(false);
    setCategoryError("");

    try {
      const categories = await getCategories();

      if (
        version !== categoryReadVersion.current ||
        token !== sessionStorage.getItem("genzi_api_token")
      ) {
        return;
      }

      setData((current) => ({
        ...current,
        categories,
      }));

      setCategoriesReady(true);
    } catch (error) {
      if (
        version === categoryReadVersion.current &&
        token === sessionStorage.getItem("genzi_api_token")
      ) {
        setCategoryError(error.message);
      }
    } finally {
      if (version === categoryReadVersion.current) {
        setCategoriesLoading(false);
      }
    }
  }

  useEffect(() => {
    if (user) {
      if (!isOfflineSession() && navigator.onLine !== false)
        refreshCategories();
    } else {
      categoryReadVersion.current += 1;
      setCategoriesReady(false);
      setCategoriesLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (modal?.kind === "payment") completing.current = false;
  }, [modal]);
  useEffect(() => {
    try {
      localStorage.setItem("genzi-v1", JSON.stringify(data));
      setStorageError("");
    } catch {
      setStorageError(
        "Device storage is full. Export a backup before closing.",
      );
    }
  }, [data]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("genzi-theme", theme);
    } catch {}
  }, [theme]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const toast = (title2, icon = "success") =>
    Swal.fire({
      title: title2,
      icon,
      toast: true,
      position: "top-end",
      timer: 2200,
      showConfirmButton: false,
    });
  const change = (k, v) => setData((d) => ({ ...d, [k]: v }));
  const open = (kind, item) => {
    if (
      kind === "categories" &&
      (!categoriesReady || categoriesLoading || categoryInFlight.current)
    ) {
      return toast("Wait for categories to load from the server.", "warning");
    }

    setForm(item ? { reorderLevel: 8, ...item } : { reorderLevel: 8 });
    setModal({ kind, editing: !!item });
  };
  useEffect(() => {
    if (!user) return;
    const run = () => {
      if (navigator.onLine && !document.hidden)
        syncOfflineOrders().catch(() => {});
    };
    run();
    const timer = setInterval(run, 30000);
    window.addEventListener("online", run);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", run);
    };
  }, [user]);
  const pending = data.sales.filter((s) => s.sync !== "synced");
  const total = totals(cart, discount);
  const p = data.products.find((p2) => p2.id === label) || data.products[0];
  useEffect(() => {
    function key(e) {
      if (handleFormEnter(e)) return;
      if (ignoreShortcut(e)) return;
      const dialog = document.querySelector(
        '[role="dialog"],[role="alertdialog"]',
      );
      if (dialog) return;
      if (e.key === "Escape") {
        if (query) {
          e.preventDefault();
          setQuery("");
        }
        return;
      }
      if (!user) return;
      if (
        e.key === "Enter" &&
        page === "POS Checkout" &&
        cart.length &&
        !e.target.closest(
          'input,textarea,select,button,a,[contenteditable="true"],.profile-menu',
        )
      ) {
        e.preventDefault();
        setTender("");
        setModal({ kind: "payment" });
        return;
      }
      if (e.key === "F8") {
        e.preventDefault();
        setTheme((t) => (t === "light" ? "dark" : "light"));
        return;
      }
      if (e.key === "F2" || ((e.ctrlKey || e.metaKey) && e.key === "k")) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.target.closest('input,textarea,select,[contenteditable="true"]'))
        return;
      if (e.key === "F6" && page === "POS Checkout") {
        e.preventDefault();
        hold();
      }
      if (e.key === "F7" && page === "POS Checkout") {
        e.preventDefault();
        setModal({ kind: "held" });
      }
      if (e.key === "F4" && page === "POS Checkout" && cart.length) {
        e.preventDefault();
        setTender("");
        setModal({ kind: "payment" });
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [page, cart, customer, discount, data.held, query, user, modal]);

  async function saveCategoryForm() {
    if (categoryInFlight.current) return;

    if (!categoriesReady || categoriesLoading) {
      return toast("Refresh categories first.", "warning");
    }

    const name = String(form.name || "").trim();
    const description = String(form.description || "").trim();

    if (!name || [...name].length > 100) {
      return toast("Category name must contain 1 to 100 characters.", "error");
    }

    if ([...description].length > 500) {
      return toast("Description must not exceed 500 characters.", "error");
    }

    const editing = modal.editing;
    const oldCategory = data.categories.find((item) => item.id === form.id);

    const token = sessionStorage.getItem("genzi_api_token");

    categoryInFlight.current = true;
    setCategoryBusy(true);
    setCategoryError("");

    try {
      const saved = await saveCategory(
        { id: form.id, name, description },
        editing,
      );

      if (token !== sessionStorage.getItem("genzi_api_token")) return;

      setData((current) => ({
        ...current,
        categories: (editing
          ? current.categories.map((item) =>
              item.id === saved.id ? saved : item,
            )
          : [...current.categories, saved]
        ).sort((a, b) => a.name.localeCompare(b.name)),

        // Products are still local and currently reference category names.
        products:
          editing && oldCategory
            ? current.products.map((product) =>
                product.category === oldCategory.name
                  ? { ...product, category: saved.name }
                  : product,
              )
            : current.products,
      }));

      if (editing && oldCategory && category === oldCategory.name) {
        setCategory(saved.name);
      }

      setModal(null);

      toast(
        editing
          ? "Category updated in the database."
          : "Category saved in the database.",
      );
    } catch (error) {
      setCategoryError(error.message);
      toast(error.message, "error");
    } finally {
      categoryInFlight.current = false;
      setCategoryBusy(false);
    }
  }

  async function removeCategoryRecord(id) {
    if (categoryInFlight.current || !categoriesReady || categoriesLoading) {
      return;
    }

    const selected = data.categories.find((item) => item.id === id);
    if (!selected) return;

    if (data.products.some((product) => product.category === selected.name)) {
      return toast(
        "Move this category's products to another category first.",
        "warning",
      );
    }

    const token = sessionStorage.getItem("genzi_api_token");

    categoryInFlight.current = true;
    setCategoryBusy(true);

    try {
      const result = await Swal.fire({
        title: `Delete "${selected.name}"?`,
        text: "This deletes the category from the database.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Delete category",
        confirmButtonColor: "#dc2626",
      });

      if (!result.isConfirmed) return;
      if (token !== sessionStorage.getItem("genzi_api_token")) return;

      await deleteCategory(id);

      if (token !== sessionStorage.getItem("genzi_api_token")) return;

      setData((current) => ({
        ...current,
        categories: current.categories.filter((item) => item.id !== id),
      }));

      if (category === selected.name) setCategory("All");

      setCategoryError("");
      toast("Category deleted from the database.");
    } catch (error) {
      setCategoryError(error.message);
      toast(error.message, "error");
    } finally {
      categoryInFlight.current = false;
      setCategoryBusy(false);
    }
  }

  function save(e) {
    e.preventDefault();
    if (modal.kind === "categories") {
      return saveCategoryForm();
    }

    const k = modal.kind;
    const item = { ...form, id: form.id || crypto.randomUUID() };
    for (const [f, , t] of schemas[k]) {
      if (typeof item[f] === "string") item[f] = item[f].trim();
      if (t === "number") {
        item[f] = Number(item[f] || 0);
        if (!Number.isFinite(item[f]) || item[f] < 0)
          return toast("Enter a valid non-negative " + f, "error");
      }
    }
    if (!item.name?.trim() && k !== "purchases")
      return toast("Name is required", "error");
    if (k === "customers" || k === "suppliers") {
      if (!/^0[2-9]\d{8}$/.test(item.phone || ""))
        return toast("Enter a valid 10-digit Sri Lankan phone number", "error");
      if (data[k].some((x) => x.id !== item.id && x.phone === item.phone))
        return toast("Phone number already exists", "error");
    }
    if (k === "customers" && !Number.isInteger(item.points))
      return toast("Loyalty points must be whole numbers", "error");
    if (
      k === "purchases" &&
      (!Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        !data.products.some((p2) => p2.id === item.productId))
    )
      return toast(
        "Select an existing product and whole positive quantity",
        "error",
      );
    if (
      k === "purchases" &&
      modal.editing &&
      data.purchases.find((x) => x.id === item.id)?.status === "Received"
    )
      return toast("Received purchases cannot be edited", "error");
    if (
      k === "products" &&
      (!Number.isInteger(item.stock) ||
        item.stock < 0 ||
        !Number.isInteger(item.reorderLevel) ||
        item.reorderLevel < 0)
    )
      return toast(
        "Stock and reorder minimum must be whole non-negative numbers",
        "error",
      );
    if (
      k === "products" &&
      data.products.some((x) => x.sku === item.sku && x.id !== item.id)
    )
      return toast("SKU already exists", "error");
    if (k === "products") {
      if (!item.image) item.image = "/assets/dress-0.jpeg";
      if (item.price < item.cost)
        return toast("Selling price must cover cost", "error");
    }
    if (k === "purchases") {
      item.status = "Pending";
      item.date = /* @__PURE__ */ new Date().toLocaleDateString();
      item.total = item.quantity * item.cost;
    }
    change(
      k,
      modal.editing
        ? data[k].map((x) => (x.id === item.id ? item : x))
        : [...data[k], item],
    );
    setModal(null);
    toast(modal.editing ? "Changes saved" : "Added successfully");
  }
  async function remove(k, id) {
    if (k === "categories") {
      return removeCategoryRecord(id);
    }

    if (
      k === "purchases" &&
      data.purchases.find((x) => x.id === id)?.status === "Received"
    )
      return toast("Received purchases cannot be deleted", "error");
    if (
      k === "products" &&
      data.sales.some((s) => s.items.some((i) => i.id === id) && !s.returned)
    )
      return toast(
        "Keep products referenced by returnable receipts; set stock to zero instead",
        "warning",
      );
    if (k === "products" && cart.some((x) => x.id === id))
      return toast("Remove this item from the cart first", "warning");
    const r = await Swal.fire({
      title: "Delete this record?",
      text: "This removes the local record.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#7c4dff",
    });
    if (r.isConfirmed)
      change(
        k,
        data[k].filter((x) => x.id !== id),
      );
  }
  function add(item) {
    const found = cart.find((x) => x.id === item.id);
    if (item.stock < 1 || (found && found.qty >= item.stock))
      return toast("No more stock available", "warning");
    setCart((c) =>
      found
        ? c.map((x) => (x.id === item.id ? { ...x, qty: x.qty + 1 } : x))
        : [...c, { ...item, qty: 1 }],
    );
  }
  function finish(event) {
    event.preventDefault();
    if (completing.current) return;
    if (!cart.length) {
      return toast("Add products before completing payment.", "error");
    }
    if (storageError) {
      return toast(
        "Storage unavailable \u2014 export and free space first.",
        "error",
      );
    }
    const phone = String(customer || "").trim();
    let selectedCustomer = null;
    if (phone) {
      if (!validCustomerPhone(phone)) {
        return toast(
          "Enter a valid 10-digit Sri Lankan customer phone number.",
          "error",
        );
      }
      const matches = findCustomersByPhone(data.customers || [], phone);
      if (matches.length === 0) {
        return toast(
          "Customer not found. Register this customer first.",
          "error",
        );
      }
      if (matches.length > 1) {
        return toast(
          "Duplicate phone number. Correct the customer records.",
          "error",
        );
      }
      selectedCustomer = matches[0];
    }
    if (!["Cash", "Card", "Split"].includes(payment)) {
      return toast("Select a valid payment method.", "error");
    }
    const amountDue = Number(total.total);
    if (!Number.isFinite(amountDue) || amountDue < 0) {
      return toast("Invalid sale total.", "error");
    }
    const cardPaid =
      payment === "Card"
        ? amountDue
        : payment === "Split"
          ? Number(cardAmount)
          : 0;
    if (
      !Number.isFinite(cardPaid) ||
      cardPaid < 0 ||
      cardPaid > amountDue ||
      (payment === "Split" && String(cardAmount).trim() === "")
    ) {
      return toast("Enter a valid card amount.", "error");
    }
    const cashDue = Math.round((amountDue - cardPaid) * 100) / 100;
    const received = payment === "Card" ? 0 : Number(tender);
    if (
      payment !== "Card" &&
      (String(tender).trim() === "" ||
        !Number.isFinite(received) ||
        received < cashDue)
    ) {
      return toast("Cash received is insufficient.", "error");
    }
    completing.current = true;
    try {
      const products = completeSale(data.products, cart);
      const sale = {
        id: crypto.randomUUID(),
        number: "GZ-" + String(data.sales.length + 1).padStart(5, "0"),
        date: /* @__PURE__ */ new Date().toISOString(),
        items: cart.map((item) => ({ ...item })),
        // Save a snapshot so old receipts keep the original details.
        customerId: selectedCustomer?.id ?? null,
        customer: selectedCustomer?.name || "Walk-in customer",
        customerPhone: phone,
        discount: Math.round((total.subtotal - amountDue) * 100) / 100,
        total: amountDue,
        payment,
        cash: cashDue,
        cashReceived: received,
        changeDue:
          payment === "Card" ? 0 : Math.round((received - cashDue) * 100) / 100,
        card: cardPaid,
        sync: "pending",
        returned: false,
      };
      const next = {
        ...data,
        products,
        sales: [sale, ...data.sales],
      };
      localStorage.setItem("genzi-v1", JSON.stringify(next));
      setData(next);
      setCart([]);
      setDiscount(0);
      setCustomer("");
      setTender("");
      setCardAmount(0);
      setModal({ kind: "receipt", sale });
      if (data.settings.autoPrint) {
        setTimeout(() => window.print(), 150);
      }
      toast("Sale saved on this device.");
    } catch (error) {
      completing.current = false;
      toast(error?.message || "Unable to complete the sale.", "error");
    }
  }
  function hold() {
    if (!cart.length) return;
    change("held", [
      ...data.held,
      {
        id: crypto.randomUUID(),
        items: cart,
        customer,
        discount,
        date: /* @__PURE__ */ new Date().toLocaleTimeString(),
      },
    ]);
    setCart([]);
    setDiscount(0);
    setCustomer("");
    toast("Bill held");
  }
  async function sync() {
    setSyncing(true);
    try {
      const result = await syncSales(pending);
      setData((d) => ({
        ...d,
        sales: d.sales.map((s) =>
          result.acceptedIds.includes(s.id) ? { ...s, sync: "synced" } : s,
        ),
      }));
      toast("Server acknowledged " + result.acceptedIds.length + " sales");
    } catch (e) {
      Swal.fire("Cloud sync", e.message, "info");
    } finally {
      setSyncing(false);
    }
  }
  function download(value, name, type = "application/json") {
    const url = URL.createObjectURL(new Blob([value], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  async function adjustStock(product) {
    const result = await Swal.fire({
      title: "Adjust " + product.sku,
      input: "number",
      inputLabel: "New physical stock count",
      inputValue: product.stock,
      inputAttributes: { min: "0", step: "1" },
      showCancelButton: true,
      inputValidator: (v) =>
        !/^\d+$/.test(v) ? "Enter a whole non-negative count" : void 0,
    });
    if (!result.isConfirmed) return;
    const reason = await Swal.fire({
      title: "Reason for adjustment",
      input: "text",
      inputLabel: "Explain the stock change",
      showCancelButton: true,
      inputValidator: (v) => (!v.trim() ? "A reason is required" : void 0),
    });
    if (!reason.isConfirmed) return;
    setData((d) => {
      const current = d.products.find((p2) => p2.id === product.id);
      if (!current) return d;
      return {
        ...d,
        products: d.products.map((p2) =>
          p2.id === product.id ? { ...p2, stock: Number(result.value) } : p2,
        ),
        stockMovements: [
          {
            id: crypto.randomUUID(),
            date: /* @__PURE__ */ new Date().toISOString(),
            sku: current.sku,
            before: current.stock,
            after: Number(result.value),
            reason: reason.value.trim(),
            user,
          },
          ...(d.stockMovements || []),
        ],
      };
    });
    toast("Stock adjustment recorded");
  }
  function exportProducts() {
    const cols = [
      "sku",
      "name",
      "brand",
      "category",
      "size",
      "colour",
      "price",
      "cost",
      "stock",
      "reorderLevel",
    ];
    const cell = (v) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
    download(
      [cols, ...data.products.map((p2) => cols.map((k) => p2[k]))]
        .map((r) => r.map(cell).join(","))
        .join("\n"),
      "genzi-products.csv",
      "text/csv",
    );
  }
  const filteredProducts = data.products.filter(
    (p2) =>
      (filters.size === "All" || p2.size === filters.size) &&
      (filters.colour === "All" || p2.colour === filters.colour) &&
      (filters.stock === "All" ||
        (filters.stock === "In stock"
          ? p2.stock > 0
          : filters.stock === "Low stock"
            ? p2.stock > 0 && p2.stock <= Number(p2.reorderLevel ?? 8)
            : p2.stock === 0)),
  );
  function backup() {
    download(JSON.stringify(data, null, 2), "genzi-backup.json");
  }
  function exportSales() {
    const rows = [
      [
        "Receipt",
        "Date",
        "Customer",
        "Original total",
        "Exchange credit",
        "Net total",
        "Status",
      ],
      ...data.sales.map((s) => [
        s.number,
        s.date,
        s.customer,
        s.total,
        refundTotal(s),
        s.total - refundTotal(s),
        returnStatus(s),
      ]),
    ];
    download(
      rows
        .map((r) =>
          r.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(","),
        )
        .join("\n"),
      "genzi-sales.csv",
      "text/csv",
    );
  }
  function updateReceiptCash(s, amount) {
    const due = s.cash ?? Math.max(0, s.total - Number(s.card || 0));
    if (!Number.isFinite(amount) || amount < due)
      return toast("Cash received must cover cash due", "error");
    const updated = {
      ...s,
      cashReceived: amount,
      changeDue: Math.round((amount - due) * 100) / 100,
    };
    try {
      const next = {
        ...data,
        sales: data.sales.map((x) => (x.id === s.id ? updated : x)),
      };
      localStorage.setItem("genzi-v1", JSON.stringify(next));
      setData(next);
      setModal({ kind: "receipt", sale: updated });
      toast("Cash details saved");
    } catch {
      toast("Cannot save payment details", "error");
    }
  }
  async function deleteSale(s) {
    if (s.exchangeFrom || s.returns?.some((r2) => r2.mode === "exchange"))
      return toast(
        "Linked exchange receipts must be retained for stock and payment history",
        "warning",
      );
    if (s.sync === "synced")
      return toast(
        "Cloud-synced sales require a backend deletion endpoint",
        "warning",
      );
    const r = await Swal.fire({
      title: "Delete receipt " + s.number + "?",
      text: "Unsold quantities will be restored to stock. Linked returns and the receipt will be removed from local reports.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete receipt",
    });
    if (!r.isConfirmed) return;
    setData((d) => deleteLocalSale(d, s.id));
    toast("Receipt deleted; remaining units restored");
  }
  function returnSale(s) {
    setModal({ kind: "return", sale: s });
  }
  function submitReturn(qty, reason, options) {
    try {
      const result = processReturn(data, modal.sale.id, qty, reason, options);
      localStorage.setItem("genzi-v1", JSON.stringify(result.data));
      setData(result.data);
      setModal({
        kind: "returnReceipt",
        record: result.record,
        originalNumber: result.originalNumber,
      });
      toast("Exchange saved");
    } catch (e) {
      toast(e.message, "error");
    }
  }
  const actions = (k, item) => (
    <div className="actions">
      <button
        className="icon"
        aria-label={"Edit " + item.name}
        onClick={() => open(k, item)}
      >
        <Pencil size={15} />
      </button>
      <button
        className="icon danger"
        aria-label={"Delete " + item.name}
        onClick={() => remove(k, item.id)}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
  const table = (k, cols) => (
    <div className="panel table-wrap">
      <DataTable>
        <thead>
          <tr>
            {cols.map(([f, t]) => (
              <th key={f}>{t}</th>
            ))}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {data[k]
            .filter((x) =>
              JSON.stringify(x).toLowerCase().includes(query.toLowerCase()),
            )
            .map((x) => (
              <tr key={x.id}>
                {cols.map(([f]) => (
                  <td key={f}>
                    {f === "name" ? (
                      <span className="cell-name">
                        {x.image && <img src={x.image} />}
                        <b>{x[f]}</b>
                      </span>
                    ) : [
                        "price",
                        "balance",
                        "total",
                        "cost",
                        "amount",
                      ].includes(f) ? (
                      money(x[f])
                    ) : f === "stock" ? (
                      <span
                        className={"badge " + (x.stock < 8 ? "amber" : "green")}
                      >
                        {x.stock} in stock
                      </span>
                    ) : (
                      x[f]
                    )}
                  </td>
                ))}
                <td>
                  {actions(k, x)}
                  {k === "purchases" && x.status === "Pending" && (
                    <button
                      className="small"
                      onClick={() => {
                        setData((d) =>
                          d.purchases.find((a) => a.id === x.id)?.status !==
                          "Pending"
                            ? d
                            : {
                                ...d,
                                purchases: d.purchases.map((a) =>
                                  a.id === x.id
                                    ? { ...a, status: "Received" }
                                    : a,
                                ),
                                products: d.products.map((p2) =>
                                  p2.id === x.productId
                                    ? { ...p2, stock: p2.stock + x.quantity }
                                    : p2,
                                ),
                              },
                        );
                        toast("Stock received");
                      }}
                    >
                      Receive
                    </button>
                  )}
                </td>
              </tr>
            ))}
        </tbody>
      </DataTable>
      {!data[k].length && (
        <Empty text="No records yet. Use the Add button to get started." />
      )}
    </div>
  );
  function title(text, sub, kind) {
    return (
      <div className="page-title">
        <div>
          <span className="eyebrow">GEN ZI CORNER / WORKSPACE</span>
          <h1>{text}</h1>
          <p>{sub}</p>
        </div>
        {kind && (
          <button className="primary" onClick={() => open(kind)}>
            <Plus size={18} />
            Add{" "}
            {kind === "expenses"
              ? "Expense"
              : kind === "products"
                ? "Product"
                : kind === "purchases"
                  ? "Purchase Order"
                  : kind === "categories"
                    ? "Category"
                    : kind === "staff"
                      ? "Staff"
                      : kind === "customers"
                        ? "Customer"
                        : "Supplier"}
          </button>
        )}
      </div>
    );
  }
  const liveSales = data.sales.filter((s) => !s.returned);
  const revenue = data.sales.reduce((a, s) => a + s.total - refundTotal(s), 0);
  const profit = liveSales.reduce(
    (a, s) =>
      a +
      s.total -
      refundTotal(s) -
      s.items.reduce((b, i) => b + i.cost * (i.qty - returnedQty(s, i.id)), 0),
    0,
  );
  const viewProps = {
    deleteSale,
    title,
    data,
    setData,
    table,
    query,
    actions,
    setPage,
    category,
    setCategory,
    add,
    cart,
    setCart,
    customer,
    setCustomer,
    discount,
    setDiscount,
    total,
    setTender,
    setModal,
    hold,
    toast,
    money,
    Empty,
    exportSales,
    returnSale,
    pending,
    online,
    syncing,
    sync,
    backup,
  };
  async function logout() {
    if (categoryInFlight.current) {
      return toast("Wait for the category operation to finish.", "warning");
    }

    categoryReadVersion.current += 1;

    try {
      await logoutAdmin();
    } catch {
      toast(
        "Signed out on this device. Server logout could not be confirmed.",
        "warning",
      );
    }

    sessionStorage.removeItem("genzi_demo_user");
    sessionStorage.removeItem("genzi_api_token");

    setUser(null);
    setCategoriesReady(false);
    setCategoriesLoading(false);
    setCategoryError("");
    setCart([]);
    setCustomer("");
    setDiscount(0);
    setTender("");
    setCardAmount(0);
    setModal(null);
    setQuery("");
    setPage("Overview");
    setSide(true);
  }
  if (authChecking) {
    return (
      <div style={{ padding: 40 }} role="status">
        Checking your session...
      </div>
    );
  }

  if (!user) {
    return (
      <LoginView
        setUser={setUser}
        setModal={setModal}
        modal={modal}
        signIn={loginAdmin}
      />
    );
  }
  if (!settingsMeta) {
    return (
      <div style={{ padding: 40 }}>
        {settingsError ? (
          <>
            <p role="alert">{settingsError}</p>
            <button
              type="button"
              onClick={() => setSettingsReload((value) => value + 1)}
            >
              Retry loading settings
            </button>
          </>
        ) : (
          <p role="status">Loading store settings...</p>
        )}
      </div>
    );
  }
  return (
    <div
      className={`app gz-sidebar-layout ${side ? "gz-nav-expanded" : "gz-nav-collapsed"}`}
    >
      <style>{sidebarLayoutCss}</style>
      <button
        type="button"
        className="gz-app-toggle"
        aria-label={side ? "Hide sidebar" : "Show sidebar"}
        aria-expanded={side}
        aria-controls="gz-app-navigation"
        onClick={() => setSide((v) => !v)}
      >
        <Menu size={22} />
      </button>
      <AppSidebar
        side={side}
        pages={allowedPages}
        page={page}
        setPage={setPage}
        setQuery={setQuery}
        pending={pending}
        onLogout={logout}
      />

      <div className="workspace">
        <Header
          onLogout={logout}
          side={side}
          setSide={setSide}
          searchRef={searchRef}
          query={query}
          setQuery={setQuery}
          online={online}
          theme={theme}
          setTheme={setTheme}
          data={data}
          setPage={setPage}
        />
        <main>
          {isOfflineSession() && (
            <div className="notice" role="status">
              Offline cash billing · Bills are saved on this device. After
              reconnecting, sign out and sign in online as the same cashier to
              sync. Do not clear browser data.
            </div>
          )}
          {permissionsLoading ? (
            <div className="panel" role="status">
              Loading your access permissions...
            </div>
          ) : !allowedPages.some(([name]) => name === page) ? (
            <div className="panel" role="alert">
              You do not have permission to access this module.
            </div>
          ) : (
            <>
              {storageError && (
                <div className="notice danger">{storageError}</div>
              )}
              {pending.length > 0 && (
                <div className="notice">
                  <Cloud size={17} />
                  {pending.length} sale(s) saved on this device · Awaiting cloud
                  acknowledgement{" "}
                  <button onClick={() => setPage("Offline Sync Center")}>
                    View queue →
                  </button>
                </div>
              )}
              {page === "Overview" && (
                <DashboardView data={data} money={money} setPage={setPage} />
              )}
              {page === "Reports & Insights" && <ReportsView title={title} />}
              {page === "POS Checkout" && <PosView settings={data.settings} />}
              {page === "Products & Variants" && (
                <ProductsView title={title} query={query} money={money} />
              )}
              {page === "Categories" && (
                <CategoriesView
                  {...viewProps}
                  categoriesReady={categoriesReady}
                  categoriesLoading={categoriesLoading}
                  categoryError={categoryError}
                  categoryBusy={categoryBusy}
                  refreshCategories={refreshCategories}
                />
              )}
              {page === "Stock & Transfers" && (
                <InventoryView title={title} money={money} query={query} />
              )}
              {page === "Purchase Orders" && (
                <OrdersView title={title} money={money} query={query} />
              )}
              {page === "Customers & Loyalty" && (
                <CustomersView title={title} query={query} />
              )}
              {page === "Suppliers" && (
                <SuppliersView title={title} query={query} />
              )}
              {page === "Sales & Exchanges" && (
                <SalesView settings={data.settings} setPage={setPage} />
              )}
              {page === "Barcode Studio" && (
                <LabelsView data={data} title={title} />
              )}
              {page === "Expenses" && (
                <ExpensesView title={title} query={query} money={money} />
              )}
              {page === "Staff & Permissions" && (
                <EmployeesView title={title} query={query} />
              )}
              {page === "Offline Sync Center" && <OfflineView {...viewProps} />}
              {page === "Settings & Printers" && (
                <SettingsView
                  data={data}
                  settingsMeta={settingsMeta}
                  onSettingsSaved={applyStoreSettings}
                  theme={theme}
                  setTheme={setTheme}
                  title={title}
                />
              )}
            </>
          )}
        </main>
        <footer>
          GEN ZI CORNER{" "}
          <span>
            Crafted for textile retail · Frontend demo by Xyphora Prime
          </span>
        </footer>
      </div>
      {modal && schemas[modal.kind] && (
        <Modal
          title={
            (modal.editing ? "Edit " : "Add ") +
            (modal.kind === "products"
              ? "product"
              : modal.kind === "purchases"
                ? "purchase order"
                : modal.kind === "categories"
                  ? "category"
                  : modal.kind === "staff"
                    ? "staff member"
                    : modal.kind.slice(0, -1))
          }
          close={() => {
            if (!categoryInFlight.current) setModal(null);
          }}
        >
          <form onSubmit={save}>
            <fieldset
              disabled={modal.kind === "categories" && categoryBusy}
              style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
            >
              <p className="muted">
                Keep your store records accurate and up to date.
              </p>
              <div className="form-grid">
                {schemas[modal.kind].map(([k, t, type]) => (
                  <label key={k}>
                    {t}
                    {[
                      "category",
                      "supplier",
                      "product",
                      "role",
                      "active",
                    ].includes(type) ? (
                      <select
                        required
                        value={form[k] || ""}
                        onChange={(e) =>
                          setForm({ ...form, [k]: e.target.value })
                        }
                      >
                        <option value="">Select {t.toLowerCase()}</option>
                        {(type === "category"
                          ? data.categories.map((c) => [c.name, c.name])
                          : type === "supplier"
                            ? data.suppliers.map((s) => [s.name, s.name])
                            : type === "product"
                              ? data.products.map((p2) => [p2.id, p2.name])
                              : type === "role"
                                ? ["Cashier", "Manager", "Admin"].map((x) => [
                                    x,
                                    x,
                                  ])
                                : ["Yes", "No"].map((x) => [x, x])
                        ).map(([v, t2]) => (
                          <option key={v} value={v}>
                            {t2}
                          </option>
                        ))}
                      </select>
                    ) : type === "file" ? (
                      <>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const f = e.target.files[0];
                            if (!f) return;
                            if (f.size > 15e5)
                              return toast(
                                "Choose a photo below 1.5MB",
                                "warning",
                              );
                            const reader = new FileReader();
                            reader.onload = () =>
                              setForm((v) => ({ ...v, image: reader.result }));
                            reader.readAsDataURL(f);
                          }}
                        />
                        {form.image && (
                          <img className="form-photo" src={form.image} />
                        )}
                      </>
                    ) : (
                      <input
                        required={
                          ![
                            "description",
                            "phone",
                            "email",
                            "points",
                            "balance",
                          ].includes(k)
                        }
                        type={type || "text"}
                        inputMode={k === "phone" ? "numeric" : void 0}
                        maxLength={k === "phone" ? 10 : void 0}
                        pattern={k === "phone" ? "0[2-9][0-9]{8}" : void 0}
                        aria-invalid={
                          k === "phone" &&
                          !!form[k] &&
                          !/^0[2-9]\d{8}$/.test(form[k])
                        }
                        style={
                          k === "phone" &&
                          !!form[k] &&
                          !/^0[2-9]\d{8}$/.test(form[k])
                            ? { borderColor: "#dc2626", color: "#dc2626" }
                            : void 0
                        }
                        min={
                          modal.kind === "purchases" && k === "quantity" ? 1 : 0
                        }
                        step={k === "price" || k === "cost" ? "0.01" : "1"}
                        value={form[k] ?? ""}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            [k]:
                              k === "phone"
                                ? e.target.value.replace(/\D/g, "").slice(0, 10)
                                : e.target.value,
                          })
                        }
                      />
                    )}
                  </label>
                ))}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary">
                  <Check size={17} />
                  {modal.kind === "categories" && categoryBusy
                    ? "Saving..."
                    : modal.editing
                      ? "Save changes"
                      : "Create record"}
                </button>
              </div>
            </fieldset>
          </form>
        </Modal>
      )}
      {modal?.kind === "returnReceipt" && (
        <ReturnReceipt
          record={modal.record}
          originalNumber={modal.originalNumber}
          settings={data.settings}
          money={money}
          close={() => setModal(null)}
        />
      )}
      {modal?.kind === "return" && (
        <ReturnModal
          data={data}
          sale={data.sales.find((s) => s.id === modal.sale.id)}
          close={() => setModal(null)}
          submit={submitReturn}
          money={money}
        />
      )}
      {modal?.kind === "payment" && (
        <PaymentModal
          close={() => setModal(null)}
          finish={finish}
          total={total}
          payment={payment}
          setPayment={setPayment}
          cardAmount={cardAmount}
          setCardAmount={setCardAmount}
          tender={tender}
          setTender={setTender}
          money={money}
          data={data}
          customer={customer}
          setCustomer={setCustomer}
        />
      )}
      {modal?.kind === "held" && (
        <Modal title="Held bills" close={() => setModal(null)}>
          {data.held.map((h) => (
            <div className="list-item" key={h.id}>
              <div>
                <b>{h.customer || "Walk-in"}</b>
                <small>
                  {h.items.length} items · {h.date}
                </small>
              </div>
              <button
                className="small"
                disabled={!!cart.length}
                onClick={() => {
                  setCart(h.items);
                  setCustomer(h.customer);
                  setDiscount(h.discount);
                  change(
                    "held",
                    data.held.filter((x) => x.id !== h.id),
                  );
                  setModal(null);
                }}
              >
                Resume
              </button>
              <button
                className="icon danger"
                onClick={() =>
                  change(
                    "held",
                    data.held.filter((x) => x.id !== h.id),
                  )
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {!!cart.length && (
            <p>Hold or clear the current cart before resuming another bill.</p>
          )}
          {!data.held.length && <Empty text="No held bills." />}
        </Modal>
      )}
      {modal?.kind === "receipt" && (
        <ReceiptModal
          close={() => setModal(null)}
          data={data}
          modal={{
            ...modal,
            openReturnReceipt: (r) =>
              setModal({
                kind: "returnReceipt",
                record: r,
                originalNumber: modal.sale.number,
              }),
          }}
          money={money}
          onUpdateCash={updateReceiptCash}
        />
      )}
    </div>
  );
}
var stdin_default = App;
export { stdin_default as default };
