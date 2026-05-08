import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getVersion } from "@tauri-apps/api/app";
import "./WelcomeRoute.css";

const ENTRIES = [
  {
    icon: "📊",
    to: "/footprint",
    title: "Footprint Live",
    desc: "Live order flow on CME futures via Rithmic R|Protocol.",
    cta: "Open footprint",
  },
  {
    icon: "🌐",
    to: "/live",
    title: "Web Mode",
    desc: "Full platform with crypto demo, AI agent, and community.",
    cta: "Open web mode",
  },
  {
    icon: "⚙️",
    to: "/account",
    title: "Account & Billing",
    desc: "Manage your subscription, devices, and license.",
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
      <header className="welcome-hero">
        <h1>OrderflowV2</h1>
        <p className="welcome-tagline">
          Native order-flow tooling for CME futures traders. Pick where you
          want to start.
        </p>
      </header>

      <section className="welcome-grid">
        {ENTRIES.map((e) => (
          <Link key={e.to} to={e.to} className="welcome-card">
            <div className="welcome-card-icon" aria-hidden>
              {e.icon}
            </div>
            <h2>{e.title}</h2>
            <p>{e.desc}</p>
            <span className="welcome-card-cta">{e.cta} →</span>
          </Link>
        ))}
      </section>

      <footer className="welcome-footer">
        <span>{version ? `v${version}` : ""}</span>
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
