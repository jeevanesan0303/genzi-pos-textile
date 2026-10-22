import React, { useEffect, useRef, useState } from "react";

import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  UserX,
  UserCheck
} from "lucide-react";

import Swal from "sweetalert2";

import Modal from "../common/Modal";
import DataTable from "../common/DataTable";

import "./EmployeesView.css";

import {
  getStaff,
  saveStaff,
  deleteStaff
} from "../../api/staff";

const ROLES = ["Worker", "Cashier", "Manager", "Admin"];

const GENDERS = [
  "Male",
  "Female",
  "Other",
  "Prefer not to say"
];

function today() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const get = type =>
    parts.find(part => part.type === type).value;

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function StaffForm({ record, onSave, onClose }) {
  const [form, setForm] = useState({
    staffId: record?.staffId || "",
    name: record?.name || "",
    salary: String(record?.salary ?? ""),
    dob: record?.dob || "",
    joiningDate: record?.joiningDate || today(),
    address: record?.address || "",
    userType: record?.userType || "Normal Staff",
    gender: record?.gender || "Male",
    email: record?.email || "",
    password: "",
    phone: record?.phone || "",
    role: record?.role || "Worker",
    status: record?.status ?? "Active"
  });

  const [photo, setPhoto] = useState(record?.photo || "");
  const [photoData, setPhotoData] = useState(undefined);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);

  const saving = useRef(false);
  const reading = useRef(false);

  const posAccess = form.userType === "POS Access";

  const phoneInvalid =
    (phoneTouched || form.phone.length > 0) &&
    !/^[0-9]{10}$/.test(form.phone);

  const needsPassword =
    posAccess &&
    (
      !record ||
      record.userType !== "POS Access" ||
      form.email.trim().toLowerCase() !== record.email
    );

  function change(key, value) {
    if (key === "phone" && !/^[0-9]{0,10}$/.test(value)) {
      return;
    }

    setForm(current => ({
      ...current,
      [key]: value,
      ...(key === "userType" && value === "Normal Staff"
        ? { email: "", password: "" }
        : {})
    }));

    setError("");
  }

  function close() {
    if (!saving.current && !reading.current) onClose();
  }

  function pickPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 1500000
    ) {
      setError("Choose a JPEG, PNG or WebP photo below 1.5 MB.");
      return;
    }

    reading.current = true;
    setPhotoBusy(true);
    setError("");

    const reader = new FileReader();

    reader.onload = () => {
      setPhoto(String(reader.result));
      setPhotoData(String(reader.result));
    };

    reader.onerror = () => setError("Unable to read the photo.");

    reader.onloadend = () => {
      reading.current = false;
      setPhotoBusy(false);
    };

    reader.readAsDataURL(file);
  }

  async function submit(event) {
    event.preventDefault();

    if (saving.current || reading.current) return;

    setPhoneTouched(true);
    setError("");

    if (!/^[0-9]{10}$/.test(form.phone)) {
      setError("Phone number must contain exactly 10 digits.");
      return;
    }

    if (form.dob > today()) {
      setError("Date of birth cannot be in the future.");
      return;
    }

    if (form.joiningDate < form.dob) {
      setError("Joining date cannot be before date of birth.");
      return;
    }

    if (!/^\d{1,10}(\.\d{1,2})?$/.test(form.salary)) {
      setError("Enter a non-negative salary with up to two decimals.");
      return;
    }

    if (
      posAccess &&
      (
        (needsPassword && !form.password) ||
        (
          form.password &&
          (
            form.password.length < 12 ||
            new TextEncoder().encode(form.password).length > 72
          )
        )
      )
    ) {
      setError(
        "Enter a password of at least 12 characters, up to 72 UTF-8 bytes."
      );
      return;
    }

    saving.current = true;
    setBusy(true);

    try {
      await onSave(
        {
          ...form,
          ...(record ? { version: Number(record.version) } : {}),
          ...(photoData !== undefined ? { photoData } : {})
        },
        record?.id
      );
    } catch (err) {
      setError(err.message || "Unable to save staff.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  const fields = [
    ["staffId", "Staff ID", "text", 30],
    ["name", "Staff name", "text", 100],
    ["salary", "Monthly salary (LKR)", "number"],
    ["dob", "Date of birth", "date"],
    ["joiningDate", "Joining date", "date"]
  ];

  return (
    <Modal
      title={record ? "Edit staff" : "Add staff"}
      close={close}
    >
      <form className="gz-staff-form" onSubmit={submit}>
        {error && (
          <p role="alert" style={{ color: "#b42318" }}>
            {error}
          </p>
        )}

        <fieldset
          disabled={busy || photoBusy}
          style={{ padding: 0, margin: 0, border: 0 }}
        >
          <label>
            Staff photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={pickPhoto}
            />
          </label>

          {photo && (
            <div
              style={{
                display: "flex",
                gap: 12,
                margin: "12px 0"
              }}
            >
              <img
                src={photo}
                alt="Staff preview"
                style={{
                  width: 80,
                  height: 80,
                  objectFit: "cover",
                  borderRadius: 12
                }}
              />

              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setPhoto("");
                  setPhotoData(null);
                }}
              >
                Remove photo
              </button>
            </div>
          )}

          <div className="form-grid">
            {fields.map(([key, label, type, maximum]) => (
              <label key={key}>
                {label} *
                <input
                  required
                  type={type}
                  value={form[key]}
                  maxLength={maximum}
                  min={
                    type === "date"
                      ? "1900-01-01"
                      : key === "salary"
                        ? "0"
                        : undefined
                  }
                  max={
                    key === "dob"
                      ? today()
                      : key === "salary"
                        ? "9999999999.99"
                        : type === "date"
                          ? "9999-12-31"
                          : undefined
                  }
                  step={key === "salary" ? "0.01" : undefined}
                  pattern={
                    key === "staffId"
                      ? "[A-Za-z0-9_-]+"
                      : undefined
                  }
                  onChange={event => change(key, event.target.value)}
                />
              </label>
            ))}

            <label>
              Phone number *
              <input
                required
                type="tel"
                inputMode="numeric"
                maxLength={10}
                pattern="[0-9]{10}"
                value={form.phone}
                placeholder="0771234567"
                aria-invalid={phoneInvalid}
                onBlur={() => setPhoneTouched(true)}
                onChange={event => change("phone", event.target.value)}
                style={
                  phoneInvalid
                    ? { borderColor: "#dc2626" }
                    : undefined
                }
              />

              <small
                style={{
                  color: phoneInvalid ? "#b42318" : undefined
                }}
              >
                {phoneInvalid
                  ? `Exactly 10 digits required (${form.phone.length}/10).`
                  : `${form.phone.length}/10 digits`}
              </small>
            </label>

            <label>
              Gender *
              <select
                value={form.gender}
                onChange={event => change("gender", event.target.value)}
              >
                {GENDERS.map(value => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>

            <label>
              User type *
              <select
                value={form.userType}
                onChange={event => change("userType", event.target.value)}
              >
                <option>Normal Staff</option>
                <option>POS Access</option>
              </select>
            </label>

            <label>
              Role *
              <select
                value={form.role}
                onChange={event => change("role", event.target.value)}
              >
                {ROLES.map(value => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>

            <label>
              Account Status *
              <select
                value={form.status}
                onChange={event => change("status", event.target.value)}
                required
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </label>

            <label style={{ gridColumn: "1 / -1" }}>
              Address *
              <textarea
                required
                rows={3}
                maxLength={500}
                value={form.address}
                onChange={event => change("address", event.target.value)}
              />
            </label>

            {posAccess && (
              <>
                <label>
                  Email *
                  <input
                    required
                    type="email"
                    maxLength={254}
                    autoComplete="off"
                    value={form.email}
                    onChange={event => change("email", event.target.value)}
                  />
                </label>

                <label>
                  {record ? "New password" : "Password"}
                  {needsPassword ? " *" : ""}
                  <input
                    required={needsPassword}
                    type="password"
                    minLength={12}
                    maxLength={72}
                    autoComplete="new-password"
                    value={form.password}
                    placeholder={
                      needsPassword
                        ? "At least 12 characters"
                        : "Leave blank to keep current password"
                    }
                    onChange={event =>
                      change("password", event.target.value)
                    }
                  />
                </label>

                <p style={{ gridColumn: "1 / -1" }}>
                  Creating access or setting a new password emails the
                  credentials to this staff member.
                </p>
              </>
            )}
          </div>

          <div className="gz-staff-form-actions">
            <button type="submit">
              {busy
                ? "Saving..."
                : photoBusy
                  ? "Reading photo..."
                  : "Save staff"}
            </button>

            <button
              type="button"
              className="secondary"
              onClick={close}
            >
              Cancel
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}

export default function EmployeesView({ title, query = "" }) {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(null);

  const mounted = useRef(false);
  const sequence = useRef(0);
  const deleting = useRef(false);

  async function refresh() {
    const version = ++sequence.current;

    setLoading(true);
    setError("");

    try {
      const rows = await getStaff();

      if (mounted.current && version === sequence.current) {
        setStaff(rows);
      }
    } catch (err) {
      if (mounted.current && version === sequence.current) {
        setError(err.message);
      }
    } finally {
      if (mounted.current && version === sequence.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    mounted.current = true;
    refresh();

    return () => {
      mounted.current = false;
      sequence.current += 1;
    };
  }, []);

  async function save(values, id) {
    const result = await saveStaff(values, id);

    if (!mounted.current) return;

    sequence.current += 1;

    setStaff(current =>
      [
        result.user,
        ...current.filter(item => item.id !== result.user.id)
      ].sort((a, b) => a.name.localeCompare(b.name))
    );

    setEditor(null);
    setError("");

    const warning = result.emailStatus === "unconfirmed";

    void Swal.fire({
      icon: warning ? "warning" : "success",
      title: warning
        ? "Staff saved; email unconfirmed"
        : id
          ? "Staff updated"
          : "Staff created",
      text: warning
        ? "Do not create the account again. Check SMTP settings. To send new credentials, edit this account and set a new password."
        : result.emailStatus === "accepted"
          ? "The database save succeeded and the email server accepted the credentials email."
          : "The database save succeeded."
    });
  }

  async function remove(item) {
    if (deleting.current) return;

    deleting.current = true;
    setBusy(true);

    try {
      const result = await Swal.fire({
        icon: "warning",
        title: "Delete staff member?",
        text: `${item.name} (${item.staffId}) will be removed and POS access revoked.`,
        showCancelButton: true,
        confirmButtonText: "Delete",
        confirmButtonColor: "#dc2626"
      });

      if (!result.isConfirmed || !mounted.current) return;

      await deleteStaff(item.id, Number(item.version));

      if (!mounted.current) return;

      sequence.current += 1;
      setStaff(current => current.filter(row => row.id !== item.id));
      setError("");
    } catch (err) {
      if (mounted.current) setError(err.message);
    } finally {
      deleting.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function toggleAccountStatus(item) {
    if (busy) return;

    const currentStatus = item.status ?? item.status;
    const isActive = currentStatus === "Active";

    const newStatus = isActive
      ? "Inactive"
      : "Active";

    if (item.role === "Admin") {
      await Swal.fire({
        icon: "warning",
        title: "Admin account protected",
        text: "Admin account status cannot be changed here."
      });
      return;
    }

    const confirmation = await Swal.fire({
      icon: "warning",
      title: isActive
        ? "Deactivate staff account?"
        : "Activate staff account?",
      text: isActive
        ? `${item.name} will lose POS access immediately.`
        : `${item.name} will be allowed to access the POS again.`,
      showCancelButton: true,
      confirmButtonText: isActive
        ? "Deactivate"
        : "Activate",
      confirmButtonColor: isActive
        ? "#dc2626"
        : "#16a34a"
    });

    if (!confirmation.isConfirmed) return;

    setBusy(true);

    try {
      const result = await saveStaff(
        {
          ...item,
          status: newStatus,
          password: "",
          version: Number(item.version)
        },
        item.id
      );

      setStaff(current =>
        current.map(staffMember =>
          staffMember.id === item.id
            ? result.user
            : staffMember
        )
      );

      await Swal.fire({
        icon: "success",
        title: isActive
          ? "Account deactivated"
          : "Account activated",
        text: `${item.name} is now ${newStatus}.`
      });
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: "Unable to update status",
        text: error.message
      });
    } finally {
      setBusy(false);
    }
  }

  const search = String(query).trim().toLowerCase();

  const visible = staff.filter(item =>
    [
      item.name,
      item.staffId,
      item.phone,
      item.email,
      item.role,
      item.userType
    ]
      .join(" ")
      .toLowerCase()
      .includes(search)
  );

  const money = value =>
    new Intl.NumberFormat("en-LK", {
      style: "currency",
      currency: "LKR"
    }).format(Number(value) || 0);

  return (
    <section className="gz-staff">
      {title(
        "Staff & Permissions",
        "Manage staff profiles and POS accounts."
      )}

      <div className="inventory-summary">
        <div className="panel">
          <small>Total staff</small>
          <h2>{staff.length}</h2>
        </div>

        <div className="panel">
          <small>POS-access accounts</small>
          <h2>
            {staff.filter(item => item.userType === "POS Access").length}
          </h2>
        </div>

        <div className="panel">
          <small>Monthly salaries</small>
          <h2>
            {money(
              staff.reduce(
                (sum, item) => sum + Number(item.salary),
                0
              )
            )}
          </h2>
        </div>
      </div>

      <div className="gz-staff-toolbar">
        <button
          disabled={loading || busy}
          onClick={() => setEditor({ record: null })}
        >
          <Plus size={17} />
          Add staff
        </button>

        <button
          className="secondary"
          disabled={loading || busy}
          onClick={refresh}
        >
          <RefreshCw size={17} />
          Refresh
        </button>
      </div>

      {error && (
        <p role="alert" style={{ color: "#b42318" }}>
          {error}
        </p>
      )}

      <div className="panel table-wrap">
        {loading ? (
          <p>Loading staff...</p>
        ) : (
          <>
            <DataTable>
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Phone / Email</th>
                  <th>Type / Role</th>
                  <th>Account Status</th>
                  <th>Salary</th>
                  <th>Joining date</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {visible.map(item => (
                  <tr key={item.id}>
                    <td>
                      {item.photo && (
                        <img
                          src={item.photo}
                          alt=""
                          style={{
                            width: 42,
                            height: 42,
                            objectFit: "cover",
                            borderRadius: 10,
                            marginRight: 8
                          }}
                        />
                      )}

                      <strong>{item.name}</strong>

                      <small style={{ display: "block" }}>
                        {item.staffId}
                      </small>
                    </td>

                    <td>
                      {item.phone}
                      <small style={{ display: "block" }}>
                        {item.email || "—"}
                      </small>
                    </td>

                    <td>
                      {item.userType}
                      <small style={{ display: "block" }}>
                        {item.role}
                      </small>
                    </td>

                    <td>
                      <span
                        className="badge"
                        style={{
                          background:
                            item.status === "Active"
                              ? "#dcfce7"
                              : "#fee2e2",
                          color:
                            item.status === "Active"
                              ? "#166534"
                              : "#991b1b",
                          padding: "6px 12px",
                          borderRadius: "20px",
                          fontWeight: 600
                        }}
                      >
                        {item.status || "Unknown"}
                      </span>
                    </td>

                    <td>{money(item.salary)}</td>
                    <td>{item.joiningDate}</td>

                    <td>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          className="small secondary"
                          disabled={busy}
                          onClick={() => setEditor({ record: item })}
                        >
                          <Pencil size={15} />
                          Edit
                        </button>

                        <button
                          className="small secondary"
                          disabled={busy}
                          onClick={() => remove(item)}
                        >
                          <Trash2 size={15} />
                          Delete
                        </button>

                        <button
                          type="button"
                          className="small secondary"
                          disabled={busy || item.role === "Admin"}
                          onClick={() => toggleAccountStatus(item)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            color:
                              (item.status ?? item.status) === "Active"
                                ? "#dc2626"
                                : "#16a34a",
                            borderColor:
                              (item.status ?? item.status) === "Active"
                                ? "#fecaca"
                                : "#bbf7d0",
                            borderRadius: 9,
                            fontWeight: 600
                          }}
                        >
                          {(item.status ?? item.status) === "Active" ? (
                            <>
                              <UserX size={15} />
                              Deactivate
                            </>
                          ) : (
                            <>
                              <UserCheck size={15} />
                              Activate
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>

            {!visible.length && !error && (
              <p>No staff records found.</p>
            )}
          </>
        )}
      </div>

      {editor && (
        <StaffForm
          key={editor.record?.id || "new"}
          record={editor.record}
          onSave={save}
          onClose={() => setEditor(null)}
        />
      )}
    </section>
  );
}