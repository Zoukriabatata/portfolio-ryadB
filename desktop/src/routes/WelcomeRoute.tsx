import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getVersion } from "@tauri-apps/api/app";
import { SenzoukriaLogo } from "../components/SenzoukriaLogo";
import { BlackHoleBackground } from "../components/BlackHoleBackground";
import "./WelcomeRoute.css";

// Inline SVG icons — sharper than emojis, theme-aware via currentColor.
function IconChart() {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="3" y="18" width="4" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10" y="12" width="4" height="16" rx="1" stroke="currentColor" strokeWidth="1.5" fill="rgba(126, 211, 33, 0.15)" />
      <rect x="17" y="6" width="4" height="22" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="24" y="14" width="4" height="14" rx="1" stroke="currentColor" strokeWidth="1.5" fill="rgba(126, 211, 33, 0.15)" />
      <path d="M3 6L12 11L19 4L29 9" stroke="#7ed321" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="29" cy="9" r="2" fill="#7ed321" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <circle cx="16" cy="16" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M16 4V7M16 25V28M28 16H25M7 16H4M24.5 7.5L22.5 9.5M9.5 22.5L7.5 24.5M24.5 24.5L22.5 22.5M9.5 9.5L7.5 7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="4" y="4" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.6" fill="rgba(126, 211, 33, 0.08)" />
      <rect x="18" y="4" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="4" y="18" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="18" y="18" width="10" height="10" rx="1.5" stroke="#7ed321" strokeWidth="1.6" fill="rgba(126, 211, 33, 0.2)" />
    </svg>
  );
}

function IconBars() {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="4" y="20" width="4" height="8" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="14" width="4" height="14" rx="0.5" stroke="#7ed321" strokeWidth="1.5" fill="rgba(126, 211, 33, 0.2)" />
      <rect x="18" y="8" width="4" height="20" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="25" y="16" width="4" height="12" rx="0.5" stroke="currentColor" strokeWidth="1.5" fill="rgba(126, 211, 33, 0.12)" />
    </svg>
  );
}

function IconRewind() {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M14 8L6 16L14 24V8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" fill="rgba(126, 211, 33, 0.18)" />
      <path d="M26 8L18 16L26 24V8Z" stroke="#7ed321" strokeWidth="1.6" strokeLinejoin="round" fill="rgba(126, 211, 33, 0.28)" />
    </svg>
  );
}

function IconStream() {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M4 9H22" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 16H28" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 23H17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="26" cy="9" r="2.5" fill="#7ed321" />
      <circle cx="22" cy="23" r="2" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

function IconSparkle() {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M16 4V10M16 22V28M4 16H10M22 16H28" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16 10L19 16L16 22L13 16L16 10Z" fill="#7ed321" />
      <circle cx="16" cy="16" r="2" fill="#a3e635" />
    </svg>
  );
}

function IconBook() {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M5 6C5 5 6 4 7 4H26V26H7C6 26 5 27 5 28V6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" fill="rgba(126, 211, 33, 0.08)" />
      <path d="M5 6V28H26" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 12H20M11 17H17" stroke="#7ed321" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconNewspaper() {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="4" y="6" width="24" height="20" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 11H22" stroke="#7ed321" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 16H22" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />
      <path d="M8 21H17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

type Entry = {
  Icon: () => React.ReactElement;
  to: string;
  title: string;
  desc: string;
  cta: string;
  comingSoon?: boolean;
};

const ENTRIES: readonly Entry[] = [
  {
    Icon: IconChart,
    to: "/footprint",
    title: "Footprint Live",
    desc: "Native order flow on CME futures via Rithmic R|Protocol.",
    cta: "Open footprint",
  },
  {
    Icon: IconGrid,
    to: "/heatmap",
    title: "Heatmap",
    desc: "Liquidity heatmap of the DOM over time.",
    cta: "Open heatmap",
  },
  {
    Icon: IconBars,
    to: "/gex",
    title: "GEX",
    desc: "Gamma exposure dashboard for SPY, QQQ and 30+ tickers.",
    cta: "Open GEX",
  },
  {
    Icon: IconStream,
    to: "/flow",
    title: "Option Flow",
    desc: "Live options block & sweep feed with side detection.",
    cta: "Open flow",
  },
  {
    Icon: IconNewspaper,
    to: "/news",
    title: "News",
    desc: "Live macro + market news feed with economic calendar.",
    cta: "Open news",
  },
  {
    Icon: IconBook,
    to: "/journal",
    title: "Journal",
    desc: "Log trades, tag setups, review P&L analytics.",
    cta: "Open journal",
  },
  {
    Icon: IconSparkle,
    to: "/ai",
    title: "AI Agents",
    desc: "Co-pilot for setups, journaling, and analysis.",
    cta: "Open AI",
  },
  {
    Icon: IconRewind,
    to: "/replay",
    title: "Replay",
    desc: "Bar-by-bar replay of past sessions.",
    cta: "Preview",
    comingSoon: true,
  },
  {
    Icon: IconSettings,
    to: "/account",
    title: "Account",
    desc: "Manage subscription, devices, and license.",
    cta: "Open account",
  },
];

export function WelcomeRoute() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    void getVersion()
      .then(setVersion)
      .catch((e) => console.warn("getVersion failed:", e));
  }, []);

  return (
    <div className="welcome-route">
      {/* Animated black hole canvas — ported from the website. */}
      <BlackHoleBackground />

      <header className="welcome-hero">
        <div className="welcome-logo-wrap">
          <SenzoukriaLogo size={64} showText={false} />
        </div>
        <h1 className="welcome-title">
          SENZOU<span className="welcome-title-tail">KRIA</span>
        </h1>
        <p className="welcome-eyebrow">Trading Intelligence</p>
        <p className="welcome-tagline">
          Native order-flow tooling for futures traders. Built for speed,
          designed for clarity.
        </p>
      </header>

      <section className="welcome-grid">
        {ENTRIES.map((e, i) => (
          <Link
            key={e.to}
            to={e.to}
            className={`welcome-card ${e.comingSoon ? "welcome-card-soon" : ""}`}
            style={{ animationDelay: `${120 + i * 90}ms` }}
          >
            {e.comingSoon && (
              <span className="welcome-card-soon-badge">Soon</span>
            )}
            <div className="welcome-card-icon">
              <e.Icon />
            </div>
            <h2>{e.title}</h2>
            <p>{e.desc}</p>
            <span className="welcome-card-cta">
              {e.cta}
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path
                  d="M3 7H11M11 7L7 3M11 7L7 11"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </Link>
        ))}
      </section>

      <footer className="welcome-footer">
        {version && <span className="welcome-version">v{version}</span>}
        <a
          href="https://github.com/Zoukriabatata/portfolio-ryadB/releases"
          target="_blank"
          rel="noreferrer"
        >
          What&apos;s new
        </a>
      </footer>
    </div>
  );
}
