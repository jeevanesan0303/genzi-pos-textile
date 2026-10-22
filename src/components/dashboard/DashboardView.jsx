import DataTable from '../common/DataTable';
import React, {
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  ShoppingCart,
  Receipt,
  Users,
  Package,
  ChevronRight,
  Download,
  Boxes,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import {
  getDashboard,
  downloadDashboardSales,
} from "../../api/dashboard";
// import { refundTotal, returnedQty } from "../../returns";
import "./DashboardView.css";

const COLOURS = [
  "#11966b",
  "#75c9a0",
  "#ffc35b",
  "#ff9e42",
  "#f16d94",
  "#9673df",
  "#8b96aa",
];

function defaultMoney(value) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function dateText(value) {
  return new Date(value).toLocaleDateString("en-GB", {
    timeZone: "Asia/Colombo",
    day: "2-digit",
    month: "short",
  });
}

function dateTimeText(value) {
  return new Date(value).toLocaleString("en-GB", {
    timeZone: "Asia/Colombo",
  });
}

function EmptyState({ text }) {
  return <div className="empty">{text}</div>;
}

function SalesOverview({ days, money }) {
  const gradientId = `sales-${useId().replace(/:/g, "")}`;

  const peak = Math.max(0, ...days.map((day) => day.value));

  const magnitude = Math.max(
    1,
    10 ** Math.floor(Math.log10(Math.max(peak, 1)))
  );

  const ceiling = peak
    ? Math.ceil(peak / magnitude) * magnitude
    : 100;

  const left = 66;
  const right = 690;
  const top = 24;
  const bottom = 210;

  const points = days.map((day, index) => ({
    ...day,
    x:
      days.length === 1
        ? (left + right) / 2
        : left + (index * (right - left)) / (days.length - 1),
    y:
      bottom -
      (Math.max(0, day.value) / ceiling) * (bottom - top),
  }));

  const line = points
    .map((point) => `${point.x},${point.y}`)
    .join(" ");

  const tickIndexes = [
    ...new Set(
      days.length
        ? [0, Math.floor((days.length - 1) / 2), days.length - 1]
        : []
    ),
  ];

  const total = days.reduce((sum, day) => sum + day.value, 0);

  const compactNumber = new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  });

  return (
    <section
      className="gz-dash-panel gz-dash-chart"
      style={{ minWidth: 0, overflow: "hidden" }}
    >
      <div
        className="gz-dash-head"
        style={{
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h3>Sales overview</h3>

          <p
            style={{
              margin: "7px 0 0",
              fontSize: 11,
              color: "var(--muted, #6a7786)",
            }}
          >
            Daily sales · after bill discounts
          </p>
        </div>

        <strong
          style={{
            color: "#10966b",
            fontSize: 19,
            whiteSpace: "nowrap",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {money(total)}
        </strong>
      </div>

      <div
        className="gz-chart-legend"
        style={{ flexWrap: "wrap", alignItems: "center" }}
      >
        <span>● Net sales (LKR)</span>
        <small>Hover a point for daily details</small>
      </div>

      <div style={{ width: "100%", minWidth: 0, marginTop: 16 }}>
        <svg
          viewBox="0 0 720 256"
          role="img"
          aria-label="Daily net sales in the selected period"
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            overflow: "hidden",
          }}
        >
          <defs>
            <linearGradient
              id={gradientId}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor="#10966b"
                stopOpacity="0.24"
              />

              <stop
                offset="100%"
                stopColor="#10966b"
                stopOpacity="0.02"
              />
            </linearGradient>
          </defs>

          {[0, 1, 2, 3, 4].map((index) => {
            const y = top + (index * (bottom - top)) / 4;

            return (
              <g key={index}>
                <line
                  x1={left}
                  x2={right}
                  y1={y}
                  y2={y}
                  stroke="var(--line, #e4eaf0)"
                  strokeWidth="1"
                />

                <text
                  x={left - 14}
                  y={y + 4}
                  textAnchor="end"
                  fill="var(--muted, #6a7786)"
                  fontSize="12"
                  fontFamily="inherit"
                >
                  {compactNumber.format(
                    (ceiling * (4 - index)) / 4
                  )}
                </text>
              </g>
            );
          })}

          {points.length > 1 && (
            <polygon
              points={`${left},${bottom} ${line} ${right},${bottom}`}
              fill={`url(#${gradientId})`}
            />
          )}

          {points.length > 1 && (
            <polyline
              points={line}
              fill="none"
              stroke="#10966b"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {points.map((point, index) => (
            <g key={index}>
              <title>
                {`${dateText(point.date)} · ${money(
                  point.value
                )} · ${point.orders} orders`}
              </title>

              <circle
                cx={point.x}
                cy={point.y}
                r="12"
                fill="transparent"
              />

              <circle
                cx={point.x}
                cy={point.y}
                r={point.value > 0 ? 4.5 : 3}
                fill={
                  point.value > 0
                    ? "#10966b"
                    : "var(--panel, #ffffff)"
                }
                stroke="#10966b"
                strokeWidth="2"
              />
            </g>
          ))}

          {tickIndexes.map((index) => (
            <text
              key={index}
              x={points[index].x}
              y="243"
              textAnchor={
                points.length === 1
                  ? "middle"
                  : index === 0
                    ? "start"
                    : index === points.length - 1
                      ? "end"
                      : "middle"
              }
              fill="var(--muted, #6a7786)"
              fontSize="12"
              fontFamily="inherit"
            >
              {dateText(points[index].date)}
            </text>
          ))}
        </svg>
      </div>

      {peak === 0 && (
        <p
          style={{
            textAlign: "center",
            color: "var(--muted, #6a7786)",
            fontSize: 12,
            margin: "8px 0 0",
          }}
        >
          No sales recorded in this period.
        </p>
      )}
    </section>
  );
}

export default function DashboardView({
  data,
  money = defaultMoney,
  setPage = () => {},
  Empty = EmptyState,
}) {
  const [period, setPeriod] = useState("month");
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [exporting, setExporting] = useState(false);

  const exportLock = useRef(false);

  const settings = data?.settings || {};

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setSnapshot(null);
    setError("");

    getDashboard(period, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setSnapshot(result);
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          setError(failure.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [period, refreshKey]);

  // Refresh after database bill edits/deletions.
  useEffect(() => {
    const refresh = () => {
      setRefreshKey((value) => value + 1);
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    window.addEventListener("genzi-sales-changed", refresh);
    window.addEventListener("online", refresh);

    document.addEventListener(
      "visibilitychange",
      refreshWhenVisible
    );

    // Refresh while this dashboard is visible.
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    }, 60000);

    return () => {
      window.removeEventListener("genzi-sales-changed", refresh);
      window.removeEventListener("online", refresh);

      document.removeEventListener(
        "visibilitychange",
        refreshWhenVisible
      );

      window.clearInterval(timer);
    };
  }, []);

  async function exportSales() {
    if (exportLock.current) return;

    exportLock.current = true;
    setExporting(true);
    setError("");

    try {
      await downloadDashboardSales(period);
    } catch (failure) {
      setError(failure.message);
    } finally {
      exportLock.current = false;
      setExporting(false);
    }
  }

  const revenue = Number(snapshot?.totals.totalSales || 0);

  const start = snapshot
    ? `${snapshot.from}T00:00:00+05:30`
    : new Date();

  const now = snapshot
    ? `${snapshot.to}T00:00:00+05:30`
    : new Date();

  const days = (snapshot?.days || []).map((day) => ({
    ...day,
    value: Number(day.value),
    orders: Number(day.orders),
  }));

  const bestProducts = (snapshot?.bestProducts || []).map(
    (product) => ({
      ...product,
      sold: Number(product.sold),
      revenue: Number(product.revenue),
    })
  );

  const categoryRows = (snapshot?.categorySales || []).map(
    (category) => [
      category.name,
      Number(category.revenue),
    ]
  );

  const categoryTotal = categoryRows.reduce(
    (sum, [, value]) => sum + value,
    0
  );

  let angle = 0;

  const categoryGradient = categoryRows
    .map(([, value], index) => {
      const from = angle;

      angle += categoryTotal
        ? (value / categoryTotal) * 100
        : 0;

      return `${
        COLOURS[index % COLOURS.length]
      } ${from}% ${angle}%`;
    })
    .join(",");

  const recentSales = snapshot?.recentSales || [];

  // Preserve your existing .slice(-5).reverse() purchase rendering.
  const purchases = [
    ...(snapshot?.latestPurchases || []),
  ].reverse();

  const stockProducts = snapshot?.lowStockProducts || [];

  const outOfStock = stockProducts.filter(
    (product) => Number(product.stock) <= 0
  );

  const lowStock = stockProducts.filter(
    (product) => Number(product.stock) > 0
  );

  const net = (sale) => Number(sale.total || 0);

  const activities = (snapshot?.activities || []).map(
    (activity) => ({
      ...activity,
      detail:
        activity.amount === null ||
        activity.amount === undefined
          ? activity.detail
          : `${money(activity.amount)} · ${activity.detail}`,
    })
  );

  const statistics = [
    {
      label: "Total sales",
      value: money(revenue),
      note: "Completed sales after bill discounts",
      Icon: ShoppingCart,
      tone: "green",
      page: "Reports & Insights",
    },
    {
      label: "Total orders",
      value: snapshot?.totals.totalOrders || 0,
      note: "Completed receipts in selected period",
      Icon: Receipt,
      tone: "blue",
      page: "Sales & Exchanges",
    },
    {
      label: "Total customers",
      value: snapshot?.totals.totalCustomers || 0,
      note: "Registered customers · current total",
      Icon: Users,
      tone: "orange",
      page: "Customers & Loyalty",
    },
    {
      label: "Total products",
      value: snapshot?.totals.totalProducts || 0,
      note: "Size / colour variants · current total",
      Icon: Package,
      tone: "purple",
      page: "Products & Variants",
    },
  ];

  const stockStatuses = [
    {
      label: "In stock",
      count: snapshot?.stock.good || 0,
      Icon: Boxes,
      tone: "green",
    },
    {
      label: "Low stock",
      count: snapshot?.stock.low || 0,
      Icon: AlertTriangle,
      tone: "orange",
    },
    {
      label: "Out of stock",
      count: snapshot?.stock.out || 0,
      Icon: XCircle,
      tone: "red",
    },
  ];

  function sectionHead(name, page) {
    return (
      <div className="gz-dash-head">
        <h3>{name}</h3>

        {page && (
          <button type="button" onClick={() => setPage(page)}>
            View all <ChevronRight size={14} />
          </button>
        )}
      </div>
    );
  }

  if (loading && !snapshot) {
  return (
    <div className="gz-dashboard">
      <section className="gz-dash-panel" role="status">
        Loading business overview…
      </section>
    </div>
  );
}

if (!snapshot) {
  return (
    <div className="gz-dashboard">
      <section className="gz-dash-panel">
        <p role="alert">
          {error || "Unable to load the dashboard."}
        </p>

        <button
          type="button"
          className="secondary"
          onClick={() => setRefreshKey((value) => value + 1)}
        >
          Try again
        </button>
      </section>
    </div>
  );
}

  return (
    <div className="gz-dashboard">
      <div className="gz-dash-welcome">
        {error && (
  <p role="alert" style={{ color: "#b4233d" }}>
    {error}
  </p>
)}
        <div>
          <h1>Welcome back, {snapshot.actorName}!</h1>

          <p>
            Here's your business overview for{" "}
            <b>{settings.store || "Gen Zi Corner"}</b>
          </p>
        </div>

        <div className="gz-dash-period">
          <span>
            {dateText(start)} – {dateText(now)}
          </span>

          <select
            aria-label="Dashboard date range"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          >
            <option value="month">This month</option>
            <option value="week">Last 7 days</option>
          </select>
        </div>
      </div>

      <div className="gz-dash-stats">
        {statistics.map(
          ({ label, value, note, Icon, tone, page }) => (
            <button
              type="button"
              key={label}
              className={`gz-dash-stat ${tone}`}
              onClick={() => setPage(page)}
            >
              <span className="gz-dash-stat-icon">
                <Icon size={27} />
              </span>

              <div>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{note}</small>
              </div>

              <span className="gz-dash-mini" aria-hidden="true">
                {[12, 19, 26, 34, 43].map((height) => (
                  <i key={height} style={{ height }} />
                ))}
              </span>
            </button>
          )
        )}
      </div>

      <div className="gz-dash-upper">
        <SalesOverview days={days} money={money} />

        <section className="gz-dash-panel">
          {sectionHead("Category wise sales")}

          <div className="gz-category-content">
            <div
              className="gz-donut"
              style={{
                background: categoryGradient
                  ? `conic-gradient(${categoryGradient})`
                  : "var(--line, #e7ecef)",
              }}
            >
              <div>
                <strong>{money(revenue)}</strong>
                <small>Net sales</small>
              </div>
            </div>

            <div className="gz-category-legend">
              {categoryRows.length ? (
                categoryRows.map(([name, value], index) => (
                  <div key={name}>
                    <i
                      style={{
                        background:
                          COLOURS[index % COLOURS.length],
                      }}
                    />
                    <span>{name}</span>
                    <b>
                      {Math.round((value / categoryTotal) * 100)}%
                    </b>
                  </div>
                ))
              ) : (
                <p>No sales in this period.</p>
              )}
            </div>
          </div>
        </section>

        <section className="gz-dash-panel">
          {sectionHead("Stock status", "Stock & Transfers")}

          {stockStatuses.map(({ label, count, Icon, tone }) => (
            <button
              type="button"
              key={label}
              className={`gz-stock-status ${tone}`}
              onClick={() => setPage("Stock & Transfers")}
            >
              <Icon size={27} />

              <div>
                <small>{label}</small>
                <strong>{count} variants</strong>
              </div>

              <ChevronRight size={17} />
            </button>
          ))}
        </section>
      </div>

      <div className="gz-dash-middle">
        <section className="gz-dash-panel">
          {sectionHead("Recent sales", "Sales & Exchanges")}

          <div className="gz-dash-scroll">
            <DataTable>
              <thead>
                <tr>
                  {[
                    "Receipt",
                    "Date & time",
                    "Customer",
                    "Items",
                    "Net amount",
                    "Payment",
                    "Status",
                  ].map((heading) => (
                    <th key={heading}>{heading}</th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {recentSales.map((sale) => (
                  <tr key={sale.id}>
                    <td>
                      <b>{sale.number}</b>
                    </td>

                    <td>
                      {dateTimeText(sale.date)}
                    </td>

                    <td>{sale.customer || "Walk-in"}</td>

                    <td>
                      {sale.units}
                    </td>

                    <td>{money(net(sale))}</td>

                    <td>
                      <span className="gz-dash-badge">
                        {sale.payment}
                      </span>
                    </td>

                    <td>
                      <span className="gz-dash-badge">
                        {sale.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>

            {!recentSales.length && (
              <Empty text="Your first sale will appear here." />
            )}
          </div>

          <button
              type="button"
              className="gz-dash-export"
              disabled={exporting}
              onClick={exportSales}
            >
              <Download size={14} />
              {exporting ? "Exporting…" : "Export sales CSV"}
            </button>
        </section>

        <section className="gz-dash-panel">
          {sectionHead(
            "Best selling products",
            "Products & Variants"
          )}

          <div className="gz-dash-scroll">
            <DataTable>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Sold</th>
                  <th>Net revenue*</th>
                </tr>
              </thead>

              <tbody>
                {bestProducts.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <div className="gz-dash-product">
                        {product.image && (
                          <img src={product.image} alt="" />
                        )}

                        <span>
                          {product.name}
                          <small>
                            {product.size} · {product.colour}
                          </small>
                        </span>
                      </div>
                    </td>

                    <td>{product.sold}</td>
                    <td>{money(product.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>

            {!bestProducts.length && (
              <Empty text="No products sold in this period." />
            )}
          </div>

          <small className="gz-dash-footnote">
            *Discount allocated proportionally; rounding may vary.
          </small>
        </section>
      </div>

      <div className="gz-dash-bottom">
        <section className="gz-dash-panel">
          {sectionHead("Low stock products", "Stock & Transfers")}

          <div className="gz-dash-scroll">
            <DataTable>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Stock</th>
                  <th>Minimum</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {[...outOfStock, ...lowStock]
                  .slice(0, 5)
                  .map((product) => (
                    <tr key={product.id}>
                      <td>{product.name}</td>
                      <td>{product.sku}</td>

                      <td>
                        <b>{product.stock}</b>
                      </td>

                      <td>{product.reorderLevel ?? 8}</td>

                      <td>
                        <span className="gz-dash-badge warning">
                          {Number(product.stock) <= 0
                            ? "Out of stock"
                            : "Low stock"}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </DataTable>

            {!lowStock.length && !outOfStock.length && (
              <p>
                All variants are above their reorder minimum.
              </p>
            )}
          </div>
        </section>

        <section className="gz-dash-panel">
          {sectionHead("Latest purchases", "Purchase Orders")}

          <div className="gz-dash-scroll">
            <DataTable>
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Units</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {[...purchases]
                  .slice(-5)
                  .reverse()
                  .map((purchase) => (
                    <tr key={purchase.id}>
                      <td>{purchase.supplier}</td>
                      <td>{purchase.quantity}</td>
                      <td>{money(purchase.total)}</td>

                      <td>
                        <span className="gz-dash-badge">
                          {purchase.status}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </DataTable>

            {!purchases.length && (
              <Empty text="No purchase orders yet." />
            )}
          </div>
        </section>

        <section className="gz-dash-panel">
          {sectionHead("Recent activities")}

          <div className="gz-dash-activities">
            {activities.map((activity) => (
              <div key={activity.id}>
                <span>
                  <Receipt size={16} />
                </span>

                <div>
                  <b>{activity.text}</b>
                  <small>{activity.detail}</small>

                  <time>
                    {dateTimeText(activity.date)}
                  </time>
                </div>
              </div>
            ))}

            {!activities.length && (
              <Empty text="Store activity will appear here." />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}