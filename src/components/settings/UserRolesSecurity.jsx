import React, {
  useEffect,
  useState,
  useCallback
} from "react";

import {
  ShieldCheck,
  UserRound,
  LockKeyhole,
  Users,
  Save,
  RefreshCw,
  Eye,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertCircle,
  LoaderCircle
} from "lucide-react";

import Swal from "sweetalert2";

import {
  getMyPermissions,
  getPermissionModules,
  getPermissionUsers,
  getUserPermissions,
  updateUserPermissions
} from "../../api/permissions";

import {
  updateMyPassword
} from "../../api/account";

import "./UserRolesSecurity.css";

const MODULE_LABELS = {
  dashboard: "Dashboard",
  pos: "POS Checkout",
  products: "Products & Variants",
  categories: "Categories",
  inventory: "Stock & Transfers",
  purchases: "Purchase Orders",
  customers: "Customers & Loyalty",
  suppliers: "Suppliers",
  sales: "Sales & Exchanges",
  barcodes: "Barcode Studio",
  reports: "Reports & Insights",
  expenses: "Expenses",
  staff: "Staff & Permissions",
  offline_sync: "Offline Sync Center",
  settings: "Settings & Printers"
};

const ACTIONS = [
  { key: "view", label: "Access", Icon: Eye }
];

const EMPTY_PASSWORD = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: ""
};

export default function UserRolesSecurity() {
  const [account, setAccount] = useState(null);

  const [modules, setModules] = useState([]);

  const [users, setUsers] = useState([]);

  const [selectedId, setSelectedId] = useState("");

  const [selectedUser, setSelectedUser] = useState(null);

  const [permissions, setPermissions] = useState({});

  const [password, setPassword] = useState(EMPTY_PASSWORD);

  const [loading, setLoading] = useState(true);

  const [loadingUser, setLoadingUser] = useState(false);

  const [saving, setSaving] = useState(false);

  const [passwordBusy, setPasswordBusy] = useState(false);

  const [error, setError] = useState("");

  const isAdmin = account?.role === "Admin";

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [me, moduleResult] = await Promise.all([
        getMyPermissions(),
        getPermissionModules()
      ]);

      setAccount(me.user);
      setModules(moduleResult.modules || []);

      if (me.user?.role === "Admin") {
        const result = await getPermissionUsers();

        setUsers(result.users || []);
      } else {
        setUsers([]);
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    if (!selectedId || !isAdmin) {
      setSelectedUser(null);
      setPermissions({});
      return;
    }

    let cancelled = false;

    async function loadSelected() {
      setLoadingUser(true);
      setError("");
      setSelectedUser(null);
      setPermissions({});

      try {
        const result = await getUserPermissions(selectedId);

        if (cancelled) return;

        setSelectedUser(result.user);
        setPermissions(result.permissions || {});

      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoadingUser(false);
      }
    }

    loadSelected();

    return () => {
      cancelled = true;
    };
  }, [selectedId, isAdmin]);

  function togglePermission(module) {
  if (!selectedUser || selectedUser.role === "Admin") {
    return;
  }

  setPermissions(current => {
    const enabled = !Boolean(current[module]?.view);

    return {
      ...current,
      [module]: {
        view: enabled,
        create: enabled,
        edit: enabled,
        delete: enabled
      }
    };
  });
}

  async function savePermissions() {
    if (!selectedId || !selectedUser || saving) return;

    if (selectedUser.role === "Admin") {
      await Swal.fire({
        icon: "warning",
        title: "Administrator protected",
        text: "Administrator permissions cannot be modified."
      });
      return;
    }

    const confirmation = await Swal.fire({
      icon: "question",
      title: "Update user permissions?",
      text: `Apply these permissions to ${selectedUser.name}?`,
      showCancelButton: true,
      confirmButtonText: "Update Permissions",
      confirmButtonColor: "#7c3aed"
    });

    if (!confirmation.isConfirmed) return;

    setSaving(true);

    try {
      await updateUserPermissions(selectedId, permissions);

      await Swal.fire({
        icon: "success",
        title: "Permissions updated",
        text: "The user's access permissions were saved."
      });

      const result = await getUserPermissions(selectedId);

      setSelectedUser(result.user);
      setPermissions(result.permissions || {});

    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "Unable to update permissions",
        text: err.message
      });
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();

    if (passwordBusy) return;

    if (password.newPassword !== password.confirmPassword) {
      await Swal.fire({
        icon: "error",
        title: "Passwords do not match"
      });
      return;
    }

    if (
      password.newPassword.length < 12 ||
      new TextEncoder().encode(password.newPassword).length > 72
    ) {
      await Swal.fire({
        icon: "warning",
        title: "Invalid password",
        text: "Use at least 12 characters and no more than 72 UTF-8 bytes."
      });
      return;
    }

    setPasswordBusy(true);

    try {
      await updateMyPassword(
        password.currentPassword,
        password.newPassword
      );

      setPassword(EMPTY_PASSWORD);

      await Swal.fire({
        icon: "success",
        title: "Password updated",
        text: "Please sign in again with your new password."
      });

      sessionStorage.removeItem("genzi_api_token");
      sessionStorage.removeItem("genzi_demo_user");

      window.dispatchEvent(
        new Event("genzi-session-expired")
      );

    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "Password update failed",
        text: err.message
      });
    } finally {
      setPasswordBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="urs-loading">
        <LoaderCircle className="urs-spin" />
        Loading security settings...
      </div>
    );
  }

  return (
    <div className="urs-container">

      <div className="urs-heading">
        <div>
          <span className="urs-eyebrow">
            ACCOUNT PROTECTION
          </span>

          <h2>
            <ShieldCheck size={27} />
            User Roles & Security
          </h2>

          <p>
            Manage your account and control access
            to the Gen Zi Corner workspace.
          </p>
        </div>

        <button
          className="urs-refresh"
          onClick={loadInitial}
          type="button"
        >
          <RefreshCw size={17} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="urs-error" role="alert">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {/* MY ACCOUNT */}

      <section className="urs-card">

        <div className="urs-card-heading">
          <div className="urs-card-icon">
            <UserRound size={21} />
          </div>

          <div>
            <h3>My Account</h3>
            <p>Your personal POS account information.</p>
          </div>
        </div>

        <div className="urs-account-grid">

          <div>
            <label>Full Name</label>
            <strong>{account?.name || "—"}</strong>
          </div>

          <div>
            <label>Email Address</label>
            <strong>{account?.email || "—"}</strong>
          </div>

          <div>
            <label>Account Role</label>
            <span className="urs-role">
              {account?.role || "—"}
            </span>
          </div>

          <div>
            <label>Account Status</label>
            <span className="urs-status">
              <CheckCircle2 size={15} />
              Active
            </span>
          </div>

        </div>

      </section>

      {/* PASSWORD */}

      <section className="urs-card">

        <div className="urs-card-heading">
          <div className="urs-card-icon">
            <LockKeyhole size={21} />
          </div>

          <div>
            <h3>Change Password</h3>
            <p>
              Update your password to keep your
              account secure.
            </p>
          </div>
        </div>

        <form
          className="urs-password-form"
          onSubmit={changePassword}
        >

          <label>
            Current Password

            <input
              type="password"
              autoComplete="current-password"
              value={password.currentPassword}
              required
              onChange={event =>
                setPassword(current => ({
                  ...current,
                  currentPassword: event.target.value
                }))
              }
            />
          </label>

          <label>
            New Password

            <input
              type="password"
              autoComplete="new-password"
              value={password.newPassword}
              required
              minLength={12}
              onChange={event =>
                setPassword(current => ({
                  ...current,
                  newPassword: event.target.value
                }))
              }
            />
          </label>

          <label>
            Confirm New Password

            <input
              type="password"
              autoComplete="new-password"
              value={password.confirmPassword}
              required
              onChange={event =>
                setPassword(current => ({
                  ...current,
                  confirmPassword: event.target.value
                }))
              }
            />
          </label>

          <button
            type="submit"
            className="urs-primary"
            disabled={passwordBusy}
          >
            {passwordBusy
              ? <LoaderCircle className="urs-spin" size={18} />
              : <LockKeyhole size={18} />
            }

            Update Password
          </button>

        </form>

      </section>

      {/* ADMIN PERMISSIONS */}

      {isAdmin && (
        <section className="urs-card">

          <div className="urs-card-heading">
            <div className="urs-card-icon">
              <Users size={21} />
            </div>

            <div>
              <h3>Staff Access Permissions</h3>
              <p>
                Select an employee and configure
                their POS module access.
              </p>
            </div>
          </div>

          <div className="urs-user-selector">

            <label htmlFor="urs-staff">
              Select Staff Account
            </label>

            <select
              id="urs-staff"
              value={selectedId}
              onChange={event =>
                setSelectedId(event.target.value)
              }
            >
              <option value="">
                Select a staff member
              </option>

              {users.map(user => (
                <option
                  key={user.id}
                  value={user.id}
                >
                  {user.name} — {user.role} ({user.status})
                </option>
              ))}
            </select>

          </div>

          {loadingUser && (
            <div className="urs-loading">
              <LoaderCircle className="urs-spin" />
              Loading permissions...
            </div>
          )}

          {selectedUser && !loadingUser && (
            <>

              <div className="urs-selected-user">

                <div className="urs-avatar">
                  {selectedUser.name?.charAt(0)?.toUpperCase()}
                </div>

                <div>
                  <strong>{selectedUser.name}</strong>

                  <p>
                    {selectedUser.email} · {selectedUser.role}
                  </p>
                </div>

                <span className="urs-role">
                  {selectedUser.status}
                </span>

              </div>

              <div className="urs-table-wrap">

                <table className="urs-table">

                  <thead>
                    <tr>
                      <th>POS Module</th>

                      {ACTIONS.map(action => (
                        <th key={action.key}>
                          <action.Icon size={15} />
                          {action.label}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>

                    {modules.map(module => (
                      <tr key={module}>

                        <td>
                          <strong>
                            {MODULE_LABELS[module] || module}
                          </strong>
                        </td>

                        {ACTIONS.map(action => (
                          <td key={action.key}>

                            <label className="urs-switch">

                              <input
                                type="checkbox"
                                checked={Boolean(
                                  permissions[module]?.[action.key]
                                )}
                                disabled={
                                  selectedUser.role === "Admin" ||
                                  saving
                                }
                                onChange={() =>
                                  togglePermission(
                                    module,
                                    action.key
                                  )
                                }
                                aria-label={`${MODULE_LABELS[module] || module}: ${action.label}`}
                              />

                              <span className="urs-slider" />

                            </label>

                          </td>
                        ))}

                      </tr>
                    ))}

                  </tbody>

                </table>

              </div>

              <div className="urs-actions">

                {selectedUser.role === "Admin" ? (
                  <span className="urs-protected">
                    <ShieldCheck size={17} />
                    Administrator has full access.
                  </span>
                ) : (
                  <button
                    className="urs-primary"
                    type="button"
                    disabled={saving}
                    onClick={savePermissions}
                  >
                    {saving
                      ? <LoaderCircle className="urs-spin" size={18} />
                      : <Save size={18} />
                    }

                    Update Permissions
                  </button>
                )}

              </div>

            </>
          )}

        </section>
      )}

    </div>
  );
}