import React, {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

import { getProducts } from "../../api/products";
import { createPortal } from "react-dom";
import {
  Menu,
  Search,
  Wifi,
  WifiOff,
  Moon,
  Sun,
  Bell,
  Package,
  MessageSquare,
  X,
  CheckCheck,
  ChevronDown,
  Settings,
  LogOut,
} from "lucide-react";

export default function Header({
  onLogout,
  side,
  setSide,
  searchRef,
  query = "",
  setQuery,
  online,
  theme,
  setTheme,
  data = {},
  setPage,
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);
  useEffect(() => { const close = e => { if (e.type === 'keydown' ? e.key === 'Escape' : !profileRef.current?.contains(e.target)) setProfileOpen(false) }; document.addEventListener('pointerdown', close); document.addEventListener('keydown', close); return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close) } }, []);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [read, setRead] = useState(() => new Set());
  const [position, setPosition] = useState({
    top: 75,
    right: 12,
    maxHeight: 480,
  });

  const bellRef = useRef(null);
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  const [products, setProducts] = useState([]);
const [stockLoading, setStockLoading] = useState(true);
const [stockError, setStockError] = useState("");

const stockMounted = useRef(false);
const stockRequestVersion = useRef(0);

const refreshStockAlerts = useCallback(async () => {
  if (!stockMounted.current) return;

  const version = ++stockRequestVersion.current;
  const token = sessionStorage.getItem("genzi_api_token");

  if (!token) {
    setProducts([]);
    setStockLoading(false);
    setStockError("Sign in to load stock alerts.");
    return;
  }

  if (!navigator.onLine) {
    setStockLoading(false);
    setStockError("Offline. Stock alerts may be outdated.");
    return;
  }

  setStockLoading(true);

  try {
    const databaseProducts = await getProducts();

    if (
      !stockMounted.current ||
      version !== stockRequestVersion.current ||
      token !== sessionStorage.getItem("genzi_api_token")
    ) {
      return;
    }

    setProducts(databaseProducts);
    setStockError("");
  } catch (error) {
    if (
      stockMounted.current &&
      version === stockRequestVersion.current &&
      token === sessionStorage.getItem("genzi_api_token")
    ) {
      setStockError(
        error.message || "Unable to refresh stock alerts."
      );
    }
  } finally {
    if (
      stockMounted.current &&
      version === stockRequestVersion.current
    ) {
      setStockLoading(false);
    }
  }
}, []);

useEffect(() => {
  stockMounted.current = true;

  refreshStockAlerts();

  function refreshWhenVisible() {
    if (document.visibilityState === "visible") {
      refreshStockAlerts();
    }
  }

  function showOffline() {
    stockRequestVersion.current += 1;
    setStockLoading(false);
    setStockError("Offline. Stock alerts may be outdated.");
  }

  const timer = window.setInterval(refreshWhenVisible, 30000);

  window.addEventListener("focus", refreshWhenVisible);
  window.addEventListener("online", refreshStockAlerts);
  window.addEventListener("offline", showOffline);
  window.addEventListener(
    "genzi-products-changed",
    refreshStockAlerts
  );

  document.addEventListener(
    "visibilitychange",
    refreshWhenVisible
  );

  return () => {
    stockMounted.current = false;
    stockRequestVersion.current += 1;

    window.clearInterval(timer);

    window.removeEventListener("focus", refreshWhenVisible);
    window.removeEventListener("online", refreshStockAlerts);
    window.removeEventListener("offline", showOffline);
    window.removeEventListener(
      "genzi-products-changed",
      refreshStockAlerts
    );

    document.removeEventListener(
      "visibilitychange",
      refreshWhenVisible
    );
  };
}, [refreshStockAlerts]);

// Fetch the latest counts whenever the bell panel opens.
useEffect(() => {
  if (open) refreshStockAlerts();
}, [open, refreshStockAlerts]);

  const messages = Array.isArray(data.notifications)
    ? data.notifications
    : [];

  const stockAlerts = products
  .filter(product => {
    if (
      !product ||
      product.id == null ||
      product.stock == null ||
      product.reorderLevel == null ||
      String(product.stock).trim() === "" ||
      String(product.reorderLevel).trim() === ""
    ) {
      return false;
    }

    const stock = Number(product.stock);
    const minimum = Number(product.reorderLevel);

    return (
      Number.isInteger(stock) &&
      Number.isInteger(minimum) &&
      stock >= 0 &&
      minimum >= 0 &&
      stock <= minimum
    );
  })
  .sort((a, b) => {
    return Number(a.stock) - Number(b.stock) ||
      String(a.name).localeCompare(String(b.name));
  })
  .map(product => {
    const stock = Number(product.stock);
    const minimum = Number(product.reorderLevel);

    return {
      id: `stock:${product.id}`,

      // A changed count or threshold becomes unread again.
      readKey: JSON.stringify([
        "stock",
        product.id,
        stock,
        minimum
      ]),

      type: "stock",
      title: stock === 0 ? "Out of stock" : "Reorder alert",

      message:
        `${product.name || "Product"} — ` +
        `${stock} remaining · Reorder minimum: ${minimum}`,

      code: product.sku || "",
      urgent: stock === 0,
      page: "Stock & Transfers"
    };
  });

  const messageAlerts = messages
    .filter((message) => message && message.id != null)
    .map((message) => ({
      id: `message:${message.id}`,
      readKey: JSON.stringify([
        "message",
        message.id,
        message.title,
        message.message,
        message.text,
        message.updatedAt,
      ]),
      type: "message",
      title: message.title || "Store message",
      message: message.message || message.text || "",
      page: message.page,
    }));

  const notifications = [...stockAlerts, ...messageAlerts];

  const unreadCount = notifications.filter(
    (item) => !read.has(item.readKey)
  ).length;

  const visibleNotifications = notifications.filter(
    (item) => filter === "all" || item.type === filter
  );

  function closeNotifications(restoreFocus = false) {
    setOpen(false);

    if (restoreFocus) {
      bellRef.current?.focus();
    }
  }

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const rect = bellRef.current?.getBoundingClientRect();
      if (!rect) return;

      const top = Math.max(
        12,
        Math.min(rect.bottom + 10, window.innerHeight - 180)
      );

      setPosition({
        top,
        right: Math.max(12, window.innerWidth - rect.right),
        maxHeight: Math.max(160, window.innerHeight - top - 12),
      });
    }

    function handleOutsideClick(event) {
      if (
        !panelRef.current?.contains(event.target) &&
        !bellRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        bellRef.current?.focus();
      }
    }

    updatePosition();
    closeRef.current?.focus();

    document.addEventListener("pointerdown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape, true);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      document.removeEventListener("pointerdown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape, true);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  function markAllRead() {
    setRead((current) => {
      const next = new Set(current);

      notifications.forEach((item) => {
        next.add(item.readKey);
      });

      return next;
    });
  }

  function openNotification(item) {
    setRead((current) => new Set([...current, item.readKey]));

    if (item.page && typeof setPage === "function") {
      closeNotifications(true);
      setPage(item.page);
    }
  }

  return (
    <>
      <style>{`
        .gz-header-bell {
          position: relative;
          flex-shrink: 0;
        }

        .gz-header-count {
          position: absolute;
          top: -3px;
          right: -4px;
          display: grid;
          place-items: center;
          min-width: 18px;
          height: 18px;
          padding: 0 4px;
          border: 2px solid var(--panel, #fff);
          border-radius: 20px;
          background: #e64d69;
          color: #fff;
          font-size: 9px;
          font-weight: 700;
        }

        .gz-notifications {
          --nt-bg: #fff;
          --nt-text: #282238;
          --nt-muted: #82798f;
          --nt-line: #ece7f2;
          --nt-hover: #f6f1ff;

          position: fixed;
          z-index: 45;
          display: flex;
          flex-direction: column;
          width: min(390px, calc(100vw - 24px));
          overflow: hidden;
          border: 1px solid var(--nt-line);
          border-radius: 16px;
          background: var(--nt-bg);
          color: var(--nt-text);
          box-shadow: 0 18px 55px #24133826;
        }

        .gz-notifications.dark {
          --nt-bg: #282134;
          --nt-text: #f1eafa;
          --nt-muted: #b7aac8;
          --nt-line: #44374f;
          --nt-hover: #352b45;
        }

        .gz-notifications,
        .gz-notifications * {
          box-sizing: border-box;
        }

        .gz-notification-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 18px;
          flex-shrink: 0;
        }

        .gz-notification-heading h3 {
          margin: 0;
          font-size: 16px;
          color: var(--nt-text);
        }

        .gz-notification-heading p {
          margin: 5px 0 0;
          font-size: 11px;
          color: var(--nt-muted);
        }

        .gz-notification-close {
          display: grid;
          place-items: center;
          width: 30px;
          height: 30px;
          padding: 0;
          border: 0;
          border-radius: 8px;
          background: var(--nt-hover);
          color: var(--nt-text);
        }

        .gz-notification-tools {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 8px;
          padding: 0 14px 13px;
          border-bottom: 1px solid var(--nt-line);
          flex-shrink: 0;
        }

        .gz-notification-filters {
          display: flex;
          gap: 3px;
        }

        .gz-notification-filters button {
          padding: 7px 9px;
          border: 0;
          border-radius: 7px;
          background: transparent;
          color: var(--nt-muted);
          font-size: 11px;
        }

        .gz-notification-filters button[aria-pressed="true"] {
          background: var(--nt-hover);
          color: #9865ed;
          font-weight: 700;
        }

        .gz-notification-read {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 5px;
          border: 0;
          background: transparent;
          color: #9865ed;
          font-size: 10px;
        }

        .gz-notification-list {
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
        }

        .gz-notification-item {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 16px;
          border: 0;
          border-bottom: 1px solid var(--nt-line);
          background: var(--nt-bg);
          color: var(--nt-text);
          text-align: left;
        }

        .gz-notification-item.unread,
        .gz-notification-item:hover {
          background: var(--nt-hover);
        }

        .gz-notification-icon {
          display: grid;
          place-items: center;
          width: 36px;
          height: 36px;
          flex-shrink: 0;
          border-radius: 10px;
          background: #e6a3251a;
          color: #bd8520;
        }

        .gz-notification-icon.urgent {
          background: #e64d691a;
          color: #e64d69;
        }

        .gz-notification-icon.message {
          background: #9865ed1a;
          color: #9865ed;
        }

        .gz-notification-copy {
          flex: 1;
          min-width: 0;
          overflow-wrap: anywhere;
        }

        .gz-notification-copy strong {
          display: block;
          margin-bottom: 4px;
          font-size: 12px;
        }

        .gz-notification-copy > span {
          display: block;
          color: var(--nt-muted);
          font-size: 11px;
          line-height: 1.6;
        }

        .gz-notification-copy small {
          display: block;
          margin-top: 4px;
          font-size: 10px;
          color: var(--nt-muted);
        }

        .gz-notification-dot {
          width: 6px;
          height: 6px;
          flex-shrink: 0;
          border-radius: 50%;
          background: #9865ed;
        }

        .gz-notification-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          padding: 32px 20px;
          color: var(--nt-muted);
          text-align: center;
        }

        .gz-notification-empty strong {
          color: var(--nt-text);
          font-size: 13px;
        }

        .gz-notification-empty p {
          margin: 0;
          color: var(--nt-muted);
          font-size: 11px;
        }

        .gz-notification-footer {
          padding: 12px 16px;
          color: var(--nt-muted);
          font-size: 10px;
          flex-shrink: 0;
        }

        .gz-notifications button:hover {
          transform: none;
        }

        .gz-notifications button:focus-visible,
        .gz-header-bell:focus-visible {
          outline: 3px solid #ac83f0;
          outline-offset: -3px;
        }

        @media (max-width: 580px) {
          .gz-topbar {
            gap: 6px;
          }

          .gz-topbar .connection,
          .gz-topbar .small-avatar,
          .gz-topbar .search kbd {
            display: none;
          }

          .gz-topbar .search {
            min-width: 0;
            flex: 1;
          }
            
        }
          .profile-menu {
  position: relative;
  flex-shrink: 0;
}

.gz-profile-trigger {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text, #242038);
  cursor: pointer;
}

.gz-profile-avatar {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #e6d8ff;
  color: #6332a3;
  font-size: 12px;
  font-weight: 800;
}

.gz-chevron {
  transition: transform 0.2s;
}

.gz-chevron.rotated {
  transform: rotate(180deg);
}

.gz-profile-dropdown {
  position: absolute;
  top: calc(100% + 12px);
  right: 0;
  z-index: 60;
  width: min(210px, calc(100vw - 24px));
  padding: 7px;
  border: 1px solid var(--line, #ebe8f1);
  border-radius: 14px;
  background: var(--panel, #fff);
  color: var(--text, #242038);
  box-shadow: 0 12px 35px #21133224;
}

.gz-profile-heading {
  display: grid;
  gap: 4px;
  padding: 10px 11px 12px;
}

.gz-profile-heading strong {
  font-size: 13px;
}

.gz-profile-heading small {
  color: var(--muted, #8a8798);
  font-size: 10px;
}

.gz-profile-dropdown > button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 11px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  text-align: left;
  font-size: 12px;
  cursor: pointer;
}

.gz-profile-dropdown > button:hover,
.gz-profile-dropdown > button:focus-visible {
  background: var(--hover, #f4f0fd);
  transform: none;
}

.gz-profile-divider {
  height: 1px;
  margin: 5px 7px;
  background: var(--line, #ebe8f1);
}

.gz-profile-dropdown > .gz-profile-logout {
  color: #dc4560;
}
      `}</style>

      <header className="gz-topbar">
        <button
          type="button"
          className="icon mobile-menu"
          onClick={() => setSide(!side)}
          aria-label="Navigation"
        >
          <Menu />
        </button>

        <div className="search">
          <Search size={18} aria-hidden="true" />

          <input
            ref={searchRef}
            aria-label="Search this page"
            placeholder="Search this page…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />


        </div>

        <span className={`connection ${!online ? "offline" : ""}`}>
          {online ? <Wifi size={16} /> : <WifiOff size={16} />}
          {online ? "Internet available" : "Offline"}
        </span>

        <button
          ref={bellRef}
          type="button"
          className="icon gz-header-bell"
          aria-label={`Notifications, ${unreadCount} unread`}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <Bell size={21} aria-hidden="true" />

          {unreadCount > 0 && (
            <span className="gz-header-count" aria-hidden="true">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

        <button
          type="button"
          className="icon"
          aria-label="Switch theme"
          onClick={() =>
            setTheme(theme === "light" ? "dark" : "light")
          }
        >
          {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
        </button>
        <div className="profile-menu" ref={profileRef}>
          <button
            type="button"
            className="gz-profile-trigger"
            aria-label="Profile menu"
            aria-expanded={profileOpen}
            aria-controls="gz-profile-dropdown"
            onClick={() => {
              setOpen(false);
              setProfileOpen((value) => !value);
            }}
          >
            <span className="gz-profile-avatar">GZ</span>
            <ChevronDown
              size={14}
              className={profileOpen ? "gz-chevron rotated" : "gz-chevron"}
            />
          </button>

          {profileOpen && (
            <div id="gz-profile-dropdown" className="gz-profile-dropdown">
              <div className="gz-profile-heading">
                <strong>Gen Zi Corner</strong>
                <small>Store workspace</small>
              </div>

              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  setQuery("");
                  setPage("Settings & Printers");
                }}
              >
                <Settings size={17} />
                <span>Settings</span>
              </button>

              <div className="gz-profile-divider" />

              <button
                type="button"
                className="gz-profile-logout"
                onClick={() => {
                  setProfileOpen(false);
                  onLogout?.();
                }}
              >
                <LogOut size={17} />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {open &&
        createPortal(
          <section
            ref={panelRef}
            className={`gz-notifications ${theme === "dark" ? "dark" : ""
              }`}
            aria-label="Store notifications"
            style={position}
          >
            <div className="gz-notification-heading">
              <div>
                <h3>Notifications</h3>
                <p>{unreadCount} unread · Store updates</p>
              </div>

              <button
                ref={closeRef}
                type="button"
                className="gz-notification-close"
                aria-label="Close notifications"
                onClick={() => closeNotifications(true)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="gz-notification-tools">
              <div
                className="gz-notification-filters"
                role="group"
                aria-label="Filter notifications"
              >
                {[
                  ["all", "All"],
                  ["stock", "Stock"],
                  ["message", "Messages"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="gz-notification-read"
                disabled={!unreadCount}
                onClick={markAllRead}
              >
                <CheckCheck size={14} />
                Read all
              </button>
            </div>

            <div className="gz-notification-list">
              {stockLoading && (
                    <div
                      role="status"
                      style={{
                        padding: "10px 16px",
                        color: "var(--nt-muted)",
                        fontSize: 12
                      }}
                    >
                      Refreshing database stock alerts…
                    </div>
                  )}

                  {stockError && (
                    <div
                      role="alert"
                      style={{
                        padding: "12px 16px",
                        color: "var(--nt-text)",
                        background: "var(--nt-hover)",
                        fontSize: 12
                      }}
                    >
                      <p style={{ margin: "0 0 8px" }}>
                        {stockError}
                      </p>

                      <button
                        type="button"
                        className="secondary"
                        disabled={stockLoading}
                        onClick={refreshStockAlerts}
                      >
                        Retry
                      </button>
                    </div>
                  )}
              {visibleNotifications.length ? (
                visibleNotifications.map((item) => {
                  const unread = !read.has(item.readKey);

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`gz-notification-item ${unread ? "unread" : ""
                        }`}
                      onClick={() => openNotification(item)}
                    >
                      <span
                        className={`gz-notification-icon ${item.urgent ? "urgent" : ""
                          } ${item.type === "message" ? "message" : ""}`}
                      >
                        {item.type === "stock" ? (
                          <Package size={19} />
                        ) : (
                          <MessageSquare size={19} />
                        )}
                      </span>

                      <span className="gz-notification-copy">
                        <strong>{item.title}</strong>
                        <span>{item.message}</span>

                        {item.code && <small>Code: {item.code}</small>}
                      </span>

                      {unread && (
                        <span
                          className="gz-notification-dot"
                          aria-label="Unread"
                        />
                      )}
                    </button>
                  );
                })
              ) : (
               <div className="gz-notification-empty">
  <Bell size={28} />

  <strong>
    {filter === "message"
      ? "No store messages"
      : stockLoading
        ? "Checking stock"
        : stockError
          ? "Stock status unavailable"
          : "You're all caught up"}
  </strong>

  <p>
    {filter === "message"
      ? "No store messages yet."
      : stockLoading
        ? "Loading the latest product quantities."
        : stockError
          ? "Retry to confirm the current stock status."
          : filter === "stock"
            ? "No products are at or below their reorder minimum."
            : "No stock alerts or messages."}
  </p>
</div>
              )}
            </div>

            <div className="gz-notification-footer">
  Alerts appear when stock is at or below the product’s reorder
  minimum. Counts refresh every 30 seconds while this tab is visible.
</div>
          </section>,
          document.body
        )}
    </>
  );
}