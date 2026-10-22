import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Download, RefreshCw } from "lucide-react";

import DataTable from "../common/DataTable";
import { getReport } from "../../api/reports";

import {
  money,
  localDay,
  formatCell,
  exportReport,
} from "./reportExport";

import "./ReportsView.css";

const REPORTS = [
  ["sales", "Sales"],
  ["product", "Products"],
  ["inventory", "Inventory & Stock"],
  ["customer", "Customers"],
  ["supplier", "Suppliers"],
  ["purchase", "Purchases"],
  ["expense", "Expenses"],
  ["employee", "Employees"],
];

export default function ReportsView({ title }) {
  const [tab, setTab] = useState("sales");
  const [period, setPeriod] = useState("All time");

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  const exportLock = useRef(false);

  const invalidRange = Boolean(from && to && from > to);

  useEffect(() => {
    const controller = new AbortController();

    if (invalidRange) {
      setReport(null);
      setLoading(false);
      setError("From date cannot be after To date.");
      return () => controller.abort();
    }

    setLoading(true);
    setReport(null);
    setError("");

    getReport(tab, {
      from,
      to,
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setReport(result);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          setError(failure.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [tab, from, to, refresh, invalidRange]);

  const rows = useMemo(() => {
    if (!report) return [];

    const query = search.trim().toLowerCase();

    if (!query) return report.rows;

    return report.rows.filter((row) =>
      report.columns.some((column) => {
        const raw = String(row[column.key] ?? "").toLowerCase();
        const formatted = formatCell(
          row[column.key],
          column.type
        ).toLowerCase();

        return raw.includes(query) || formatted.includes(query);
      })
    );
  }, [report, search]);

  function choosePeriod(value) {
    const today = localDay();

    setPeriod(value);

    if (value === "All time") {
      setFrom("");
      setTo("");
    }

    if (value === "Today") {
      setFrom(today);
      setTo(today);
    }

    if (value === "This month") {
      setFrom(`${today.slice(0, 7)}-01`);
      setTo(today);
    }
  }

  function changeTab(value) {
    setTab(value);
    setSearch("");
  }

  async function download(format) {
    if (!report || exportLock.current || !rows.length) return;

    exportLock.current = true;
    setExporting(true);
    setError("");

    try {
      await exportReport(format, report, rows, search);
    } catch (failure) {
      setError(failure.message || "Unable to export this report.");
    } finally {
      exportLock.current = false;
      setExporting(false);
    }
  }

  const summary = report?.summary;

  return (
    <div className="gz-reports">
      {typeof title === "function" ? (
        title(
          "Analytics & Business Reports",
          "Database reports for sales, products, stock and store operations."
        )
      ) : (
        <div className="gz-reports-heading">
          <small>GEN ZI CORNER / WORKSPACE</small>
          <h1>Analytics & Business Reports</h1>
          <p>Database reports for your store.</p>
        </div>
      )}

      <div className="gz-report-controls">
        <div className="gz-report-presets">
          {["All time", "Today", "This month"].map((value) => (
            <button
              type="button"
              key={value}
              className={period === value ? "selected" : ""}
              onClick={() => choosePeriod(value)}
            >
              {value}
            </button>
          ))}
        </div>

        <label>
          From date
          <input
            type="date"
            value={from}
            onChange={(event) => {
              setPeriod("Custom");
              setFrom(event.target.value);
            }}
          />
        </label>

        <label>
          To date
          <input
            type="date"
            value={to}
            onChange={(event) => {
              setPeriod("Custom");
              setTo(event.target.value);
            }}
          />
        </label>

        <button
          type="button"
          className="secondary"
          disabled={loading || invalidRange}
          onClick={() => setRefresh((value) => value + 1)}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="gz-report-stats">
        <div>
          <span>Sales revenue · {period}</span>
          <strong>{summary ? money(summary.revenue) : "—"}</strong>
          <small>Completed bills, after bill discounts</small>
        </div>

        <div>
          <span>Gross profit · {period}</span>
          <strong>{summary ? money(summary.grossProfit) : "—"}</strong>
          <small>Sales revenue less saved sold-item cost</small>
        </div>

        <div>
          <span>Recorded expenses · {period}</span>
          <strong>{summary ? money(summary.expenses) : "—"}</strong>
          <small>Expense records in the selected period</small>
        </div>

        <div>
          <span>Current report records</span>
          <strong>{loading ? "…" : rows.length}</strong>
          <small>After report and search filters</small>
        </div>
      </div>

      <p className="gz-report-scope">
        Financial cards use the selected date range across all completed
        sales and recorded expenses. The table search does not change
        these financial cards.
      </p>

      {report?.summaryMessage && (
        <div className="gz-report-error" role="alert">
          Summary unavailable: {report.summaryMessage}
        </div>
      )}

      {error && (
        <div className="gz-report-error" role="alert">
          {error}
        </div>
      )}

      <section className="gz-report-panel">
        <div className="gz-report-tabs">
          {REPORTS.map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={tab === value ? "selected" : ""}
              onClick={() => changeTab(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="gz-report-panel-heading">
          <div>
            <h2>
              {report?.title ||
                `${REPORTS.find(([value]) => value === tab)?.[1]} Report`}
            </h2>

            {report?.note && <p>{report.note}</p>}
          </div>

          <span className="gz-report-count">
            {rows.length} records
          </span>
        </div>

        <div className="gz-report-table-controls">
          <label className="gz-report-search">
            Search this report
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search receipt, name, SKU or another field"
            />
          </label>

          <div className="gz-report-export">
            {[
              ["csv", "CSV"],
              ["pdf", "PDF"],
              ["xlsx", "Excel"],
            ].map(([format, label]) => (
              <button
                key={format}
                type="button"
                className="secondary"
                disabled={loading || exporting || !rows.length}
                onClick={() => download(format)}
              >
                <Download size={15} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {exporting && (
          <p className="gz-report-scope" role="status">
            Preparing export…
          </p>
        )}

        {loading ? (
          <div className="gz-report-empty" role="status">
            Loading report from database…
          </div>
        ) : report ? (
          <>
            <div className="gz-report-table-wrap">
              <DataTable
                key={`${tab}-${from}-${to}-${search}-${refresh}`}
                aria-label={report.title}
              >
                <thead>
                  <tr>
                    {report.columns.map((column) => (
                      <th
                        key={column.key}
                        className={
                          ["money", "number"].includes(column.type)
                            ? "gz-report-number"
                            : ""
                        }
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      {report.columns.map((column) => (
                        <td
                          key={column.key}
                          className={
                            ["money", "number"].includes(column.type)
                              ? "gz-report-number"
                              : ""
                          }
                        >
                          {formatCell(
                            row[column.key],
                            column.type
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>

            {!rows.length && (
              <div className="gz-report-empty">
                No records match the selected report, dates and search.
              </div>
            )}

            <p className="gz-report-scope">
              Exports include all {rows.length} matching records,
              including other table pages.
            </p>
          </>
        ) : (
          <div className="gz-report-empty">
            Report unavailable. Review the message above.
          </div>
        )}
      </section>
    </div>
  );
}