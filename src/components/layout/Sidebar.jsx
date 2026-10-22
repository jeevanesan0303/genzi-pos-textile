import React from "react";
import { Menu, LogOut } from "lucide-react";

export default function Sidebar({
  side,
  pages,
  page,
  setPage,
  setQuery,
  setSide,
  pending = [],
  setUser,
}) {
  return (
    <>
      <button
        type="button"
        className="gz-nav-toggle"
        aria-label={side ? "Hide sidebar" : "Show sidebar"}
        aria-expanded={side}
        aria-controls="gz-sidebar"
        onClick={() => setSide((current) => !current)}
      >
        <Menu size={22} />
      </button>

      <aside
        id="gz-sidebar"
        className={`sidebar gz-sidebar ${side ? "is-expanded" : "is-collapsed"}`}
        inert={!side}
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
          {pages.map(([name, Icon]) => (
            <button
              type="button"
              key={name}
              className={page === name ? "active" : ""}
              aria-current={page === name ? "page" : undefined}
              onClick={() => {
                setPage(name);
                setQuery("");
              }}
            >
              <Icon size={18} />
              <span>{name}</span>

              {name === "Offline Sync Center" &&
                pending.length > 0 && <em>{pending.length}</em>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="avatar">SM</div>

          <div>
            <b>Store Manager</b>
            <small>Store administrator</small>
          </div>

          <button
            type="button"
            className="icon"
            aria-label="Log out"
            onClick={() => {
              sessionStorage.removeItem("genzi_demo_user");
              sessionStorage.removeItem("genzi_api_token");
              setUser(null);
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
    </>
  );
}