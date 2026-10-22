import { isOfflineSession } from "../../offline/access";
import React, { useEffect, useState } from "react";
import { myQueue, exportOfflineBackup } from "../../offline/store";
import { syncOfflineOrders } from "../../api/pos";
export default function OfflineView({ title, online, backup }) {
  const [rows, setRows] = useState([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const refresh = () =>
    myQueue()
      .then(setRows)
      .catch((e) => setMessage(e.message));
  useEffect(() => {
    refresh();
    window.addEventListener("genzi-offline-changed", refresh);
    return () => window.removeEventListener("genzi-offline-changed", refresh);
  }, []);
  async function sync() {
    setBusy(true);
    try {
      const n = await syncOfflineOrders();
      setMessage(
        `${n} bills confirmed by database. Conflicts remain queued for review.`,
      );
      await refresh();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {title(
        "Offline Sync Center",
        "Cash bills remain on this device until the database confirms them.",
      )}
      <div className="stats">
        <div className="stat">
          <span>Device network</span>
          <strong>{online ? "Online" : "Offline"}</strong>
          <small>Network status does not confirm database availability.</small>
        </div>
        <div className="stat">
          <span>Pending cash bills</span>
          <strong>{rows.length}</strong>
          <small>Current cashier · IndexedDB storage</small>
        </div>
        <div className="stat">
          <span>Automatic sync</span>
          <strong>
            {isOfflineSession() ? "Online sign-in needed" : "Every 30 seconds"}
          </strong>
          <small>
            {isOfflineSession()
              ? "Bills stay saved; reconnect and sign in online to sync."
              : "While signed in, app open and server reachable."}
          </small>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head">
          <h3>Pending database confirmation</h3>
          <button className="primary" disabled={busy || !online} onClick={sync}>
            {busy ? "Syncing…" : "Sync now"}
          </button>
        </div>
        {message && <p role="status">{message}</p>}
        {rows.map((q) => (
          <div className="list-item" key={q.key}>
            <div>
              <b>{q.order.number}</b>
              <p>
                {q.order.total} · {new Date(q.createdAt).toLocaleString()}
              </p>
              <p>
                {q.order.customerName || "Walk-in customer"}
                {q.order.customerPhone ? ` - ${q.order.customerPhone}` : ""}
              </p>
              <ul>
                {(q.order.items || []).map((item, index) => (
                  <li key={item.productId || index}>
                    {item.name} - SKU {item.sku} - Qty {item.quantity} - LKR{" "}
                    {Number(item.price).toFixed(2)} each
                  </li>
                ))}
              </ul>
              <p>{q.error || "Waiting for database confirmation"}</p>
            </div>
          </div>
        ))}
        {!rows.length && <p>No pending cash bills for this cashier.</p>}
        <p>
          Offline: new cash bills for walk-in or downloaded customers. Open POS
          online first; cached catalogue expires after 12 hours. Offline sign-in
          is available after this device was prepared online. Reconnect and sign
          in online as the same cashier to sync. Price/stock conflicts require
          administrator reconciliation; never recreate a queued bill.
        </p>
        <p>
          Do not clear browser data. Device loss can destroy unsynced bills.
          Backup exports contain sales information; store them securely.
        </p>
        <button
          className="secondary"
          onClick={() =>
            exportOfflineBackup().catch((e) => setMessage(e.message))
          }
        >
          Export offline queue backup
        </button>{" "}
        <button className="secondary" onClick={backup}>
          Export existing device data
        </button>
      </div>
    </>
  );
}
