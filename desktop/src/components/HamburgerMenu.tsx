// Hamburger menu — slides a left drawer with the route links.
//
// Used by AppNavbar in place of the inline horizontal links. Cleaner
// chrome, more space for the page content, and gives us room to grow
// the navigation tree without the horizontal bar overflowing.
//
// Behaviour:
//   • click hamburger → drawer slides in from the left (280px wide)
//   • click a link or the backdrop → drawer closes
//   • Esc key → drawer closes
//   • body scroll locked while open

import { useEffect, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";
import { SenzoukriaLogo } from "./SenzoukriaLogo";
import "./HamburgerMenu.css";

const NAV_LINKS: {
  to: string;
  label: string;
  end?: boolean;
  icon: () => ReactElement;
  comingSoon?: boolean;
}[] = [
  { to: "/", label: "Welcome", end: true, icon: IconHome },
  { to: "/footprint", label: "Footprint", icon: IconChart },
  { to: "/heatmap", label: "Heatmap", icon: IconGrid, comingSoon: true },
  { to: "/gex", label: "GEX", icon: IconBarChart },
  { to: "/flow", label: "Option Flow", icon: IconStream },
  { to: "/news", label: "News", icon: IconNewspaper },
  { to: "/journal", label: "Journal", icon: IconBook },
  { to: "/ai", label: "AI Agents", icon: IconSparkle },
  { to: "/replay", label: "Replay", icon: IconRewind, comingSoon: true },
  { to: "/account", label: "Account", icon: IconUser },
];

export function HamburgerMenu() {
  const [open, setOpen] = useState(false);

  // Esc closes the drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={`hbm-trigger ${open ? "hbm-trigger-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
      >
        <span className="hbm-bar" />
        <span className="hbm-bar" />
        <span className="hbm-bar" />
      </button>

      {/* Drawer + backdrop rendered through a portal so they escape the
          navbar's stacking context (the navbar has backdrop-filter which
          would otherwise contain `position: fixed` to its own bounds and
          the drawer would render BEHIND any sibling like the footprint
          canvas). Mounting on document.body sidesteps that entirely. */}
      {createPortal(
        <div
          className={`hbm-overlay ${open ? "hbm-overlay-open" : ""}`}
          aria-hidden={!open}
        >
          <div
            className="hbm-backdrop"
            onClick={() => setOpen(false)}
            role="presentation"
          />
          <aside className="hbm-drawer" aria-label="Main navigation">
            <header className="hbm-header">
              <SenzoukriaLogo size={32} showText={false} />
              <div className="hbm-header-text">
                <span className="hbm-header-title">
                  SENZOU<span className="hbm-header-tail">KRIA</span>
                </span>
                <span className="hbm-header-sub">Trading Intelligence</span>
              </div>
            </header>

            <nav className="hbm-nav">
              {NAV_LINKS.map((link, i) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    `hbm-link ${isActive ? "hbm-link-active" : ""}`
                  }
                  onClick={() => setOpen(false)}
                  style={{ animationDelay: `${60 + i * 35}ms` }}
                >
                  <span className="hbm-link-icon">
                    <link.icon />
                  </span>
                  <span className="hbm-link-label">{link.label}</span>
                  {link.comingSoon && (
                    <span className="hbm-link-soon">Soon</span>
                  )}
                  <svg
                    className="hbm-link-arrow"
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      d="M3 7H11M11 7L7 3M11 7L7 11"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </NavLink>
              ))}
            </nav>
          </aside>
        </div>,
        document.body,
      )}
    </>
  );
}

// ── Inline icons (24x24 viewBox) ──────────────────────────────────────────

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M3 12L12 4L21 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10V20H19V10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="3" y="13" width="3" height="8" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="8" y="9" width="3" height="12" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="13" y="5" width="3" height="16" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="18" y="11" width="3" height="10" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
function IconGrid() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
function IconBarChart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M4 20H20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M7 16V11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 16V7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M17 16V13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function IconRewind() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M11 6L4 12L11 18V6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M20 6L13 12L20 18V6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 21C4 17 7.6 14 12 14C16.4 14 20 17 20 21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function IconStream() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M3 7H17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3 12H21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3 17H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="20" cy="7" r="2" fill="currentColor" />
      <circle cx="17" cy="17" r="2" fill="currentColor" opacity="0.6" />
    </svg>
  );
}
function IconNewspaper() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 8H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M7 12H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M7 16H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function IconBook() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M4 5C4 4 5 3 6 3H19V19H6C5 19 4 20 4 21V5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M4 5V21H19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconSparkle() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M12 3V8M12 16V21M3 12H8M16 12H21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 8L14 12L12 16L10 12L12 8Z" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="#7ed321" />
    </svg>
  );
}
