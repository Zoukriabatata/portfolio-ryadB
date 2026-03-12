import {
  Download,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  Send,
  X,
  TrendingUp,
  BarChart3,
  BookOpen,
  Briefcase,
  GraduationCap,
  ChevronRight,
  ArrowUpRight,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { CVPrivateEquity } from "./CVPrivateEquity";
import { CVNegoce } from "./CVNegoce";

/* ─────────────────────────────────────────────
   TOOL LOGO SVGs (brand colors)
───────────────────────────────────────────── */

function LogoATAS() {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-full w-full">
      <rect width="48" height="48" rx="10" fill="#0a1628"/>
      <rect width="48" height="48" rx="10" fill="url(#atas-g)"/>
      <text x="24" y="20" textAnchor="middle" fill="#4fc3f7" fontSize="9" fontWeight="700" fontFamily="Inter,Arial,sans-serif" letterSpacing="1">ADVANCED</text>
      <text x="24" y="33" textAnchor="middle" fill="white" fontSize="13" fontWeight="900" fontFamily="Inter,Arial,sans-serif" letterSpacing="1.5">ATAS</text>
      <defs>
        <linearGradient id="atas-g" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0d2140"/>
          <stop offset="1" stopColor="#0a1628"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

function LogoGEXStream() {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-full w-full">
      <rect width="48" height="48" rx="10" fill="#1a0533"/>
      <rect x="6" y="30" width="5" height="12" rx="1.5" fill="#a855f7"/>
      <rect x="14" y="22" width="5" height="20" rx="1.5" fill="#c084fc"/>
      <rect x="22" y="14" width="5" height="28" rx="1.5" fill="#e879f9"/>
      <rect x="30" y="18" width="5" height="24" rx="1.5" fill="#c084fc"/>
      <rect x="38" y="10" width="5" height="32" rx="1.5" fill="#a855f7"/>
      <text x="24" y="10" textAnchor="middle" fill="#e879f9" fontSize="8" fontWeight="800" fontFamily="Inter,Arial,sans-serif" letterSpacing="1">GEXstream</text>
    </svg>
  );
}

function LogoTradingView() {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-full w-full">
      <rect width="48" height="48" rx="10" fill="#131722"/>
      <rect x="5" y="28" width="6" height="14" rx="1.5" fill="#2962ff"/>
      <rect x="14" y="20" width="6" height="22" rx="1.5" fill="#2962ff"/>
      <rect x="23" y="12" width="6" height="30" rx="1.5" fill="#2962ff"/>
      <rect x="32" y="17" width="6" height="25" rx="1.5" fill="#2962ff"/>
      <polyline points="8,22 17,14 26,8 35,13" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <circle cx="35" cy="13" r="2.5" fill="white"/>
    </svg>
  );
}

function LogoApex() {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-full w-full">
      <rect width="48" height="48" rx="10" fill="#0f172a"/>
      <polygon points="24,6 44,38 4,38" fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinejoin="round"/>
      <polygon points="24,14 38,36 10,36" fill="#f97316" fillOpacity="0.12"/>
      <text x="24" y="35" textAnchor="middle" fill="white" fontSize="7.5" fontWeight="800" fontFamily="Inter,Arial,sans-serif" letterSpacing="1.5">APEX</text>
    </svg>
  );
}

function LogoTradovate() {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-full w-full">
      <rect width="48" height="48" rx="10" fill="#0052cc"/>
      <rect width="48" height="48" rx="10" fill="url(#trad-g)"/>
      <text x="24" y="31" textAnchor="middle" fill="white" fontSize="24" fontWeight="900" fontFamily="Inter,Arial,sans-serif">T</text>
      <text x="24" y="42" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="7" fontWeight="600" fontFamily="Inter,Arial,sans-serif" letterSpacing="0.5">TRADOVATE</text>
      <defs>
        <linearGradient id="trad-g" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1a6ef5"/>
          <stop offset="1" stopColor="#0044bb"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

function LogoExcel() {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-full w-full">
      <rect width="48" height="48" rx="10" fill="#185c37"/>
      <rect x="22" y="4" width="22" height="40" rx="3" fill="#21a366"/>
      <rect x="22" y="4" width="22" height="40" rx="3" fill="url(#xl-g)" fillOpacity="0.3"/>
      <line x1="22" y1="16" x2="44" y2="16" stroke="#185c37" strokeWidth="0.8" opacity="0.4"/>
      <line x1="22" y1="24" x2="44" y2="24" stroke="#185c37" strokeWidth="0.8" opacity="0.4"/>
      <line x1="22" y1="32" x2="44" y2="32" stroke="#185c37" strokeWidth="0.8" opacity="0.4"/>
      <line x1="33" y1="4" x2="33" y2="44" stroke="#185c37" strokeWidth="0.8" opacity="0.4"/>
      <path d="M3 10 L19 10 L19 38 L3 38 Z" rx="2" fill="#107c41"/>
      <text x="11" y="29" textAnchor="middle" fill="white" fontSize="16" fontWeight="900" fontFamily="Inter,Arial,sans-serif">X</text>
      <defs>
        <linearGradient id="xl-g" x1="22" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="white"/>
          <stop offset="1" stopColor="white" stopOpacity="0"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

function LogoNotion() {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-full w-full">
      <rect width="48" height="48" rx="10" fill="#ffffff" stroke="#e5e7eb" strokeWidth="1"/>
      <path d="M13 10 C13 10 16 9.5 18.5 11 L35 22 C36.5 23 37 24 37 25.5 L37 38 C37 39.5 35.8 40.5 34.5 40 L14 37 C12.5 36.5 11 35 11 33.5 L11 12 C11 10.8 12 10 13 10 Z" fill="#1a1a1a"/>
      <path d="M18 15 L18 34 M18 15 L30 30 M30 15 L30 34" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/* ─────────────────────────────────────────────
   DATA
───────────────────────────────────────────── */

const skills = [
  {
    icon: <BarChart3 className="h-5 w-5" />,
    title: "Analyse financière",
    subtitle: "Entreprises & Investissement",
    color: "blue",
    tags: [
      "Financial Analysis",
      "Business Valuation",
      "Ratios financiers",
      "Bilans & P&L",
      "Due Diligence",
      "Market Research",
      "Benchmarking sectoriel",
      "Rapports annuels",
    ],
  },
  {
    icon: <BookOpen className="h-5 w-5" />,
    title: "Excel & Modélisation",
    subtitle: "Dashboards & Reporting",
    color: "green",
    tags: [
      "Excel avancé",
      "Tableaux croisés dynamiques",
      "Excel Modeling",
      "Dashboards financiers",
      "KPIs & Reporting",
      "Google Sheets",
      "Equity Curve",
      "Automatisation",
    ],
  },
  {
    icon: <TrendingUp className="h-5 w-5" />,
    title: "Trading & Marchés",
    subtitle: "Order Flow & Risque",
    color: "purple",
    tags: [
      "Order Flow",
      "DOM / Footprint",
      "GEX / Skew",
      "Volatilité",
      "Risk Management",
      "Microstructure",
      "Futures & Commodities",
    ],
  },
];

const experiences = [
  {
    icon: <TrendingUp className="h-4 w-4 text-blue-400" />,
    title: "Trader Indépendant — Intraday Futures & Crypto",
    company: "Apex Trader Funding",
    badge: "6 challenges réussis · 50K$",
    period: "Sept. 2024 – Présent",
    location: "À distance",
    points: [
      "Trading en réel sur comptes financés jusqu'à 50K$ — 6 challenges Apex Trader Funding validés.",
      "Maîtrise des outils professionnels : Order Flow, DOM, Footprint Chart, GEX, Skew, Volatilité.",
      "Gestion du risque disciplinée : R/R, sizing, contrôle strict du drawdown.",
      "Suivi de performance via dashboards Excel : winrate, equity curve, analyse hebdomadaire.",
    ],
  },
  {
    icon: <Briefcase className="h-4 w-4 text-blue-400" />,
    title: "Assistant Administratif & Finance",
    company: "SC Formation / L3M / Green Cottage",
    badge: "Finance & Admin",
    period: "2023 – 2025",
    location: "Cergy, France · Hybride",
    points: [
      "Gestion et organisation de documents fiscaux et administratifs.",
      "Mise à jour et suivi de tableaux financiers sur Excel — dashboards de reporting.",
      "Participation au suivi de facturation et archivage comptable.",
      "Support administratif dans la gestion financière courante.",
    ],
  },
];

const tradingTools = [
  { name: "Order Flow", desc: "Flux d'ordres" },
  { name: "DOM", desc: "Carnet d'ordres" },
  { name: "Footprint", desc: "Volume à prix" },
  { name: "GEX / Skew", desc: "Dérivés options" },
  { name: "Volatilité", desc: "Implied vol" },
  { name: "ATAS", desc: "Plateforme pro" },
  { name: "TradingView", desc: "Charting" },
  { name: "MT5", desc: "Exécution" },
];

const stackTools = [
  {
    Logo: LogoATAS,
    name: "ATAS",
    fullName: "Advanced Time & Sales",
    category: "Order Flow",
    desc: "Plateforme professionnelle d'analyse Order Flow, Footprint Chart et DOM.",
    tags: ["Order Flow", "Footprint", "DOM"],
    color: "#4fc3f7",
    bg: "#0a1628",
  },
  {
    Logo: LogoGEXStream,
    name: "GEXstream",
    fullName: "Gamma Exposure Stream",
    category: "Options Flow",
    desc: "Outil de visualisation du GEX, Skew et flux de volatilité sur les options.",
    tags: ["GEX", "Skew", "Vol implicite"],
    color: "#e879f9",
    bg: "#1a0533",
  },
  {
    Logo: LogoTradingView,
    name: "TradingView",
    fullName: "TradingView Charts",
    category: "Charting",
    desc: "Analyse technique avancée, indicateurs personnalisés et suivi des marchés.",
    tags: ["Analyse technique", "Screener", "Alertes"],
    color: "#2962ff",
    bg: "#131722",
  },
  {
    Logo: LogoApex,
    name: "Apex",
    fullName: "Apex Trader Funding",
    category: "Prop Trading",
    desc: "6 challenges réussis — comptes financés jusqu'à 50K$ en conditions réelles.",
    tags: ["Funded 50K$", "6× réussis", "Prop firm"],
    color: "#f97316",
    bg: "#0f172a",
  },
  {
    Logo: LogoTradovate,
    name: "Tradovate",
    fullName: "Tradovate Futures",
    category: "Exécution",
    desc: "Broker Futures — exécution rapide sur MNQ, ES, NQ et autres contrats.",
    tags: ["Futures", "MNQ / NQ", "Exécution"],
    color: "#60a5fa",
    bg: "#0052cc",
  },
  {
    Logo: LogoExcel,
    name: "Excel",
    fullName: "Microsoft Excel",
    category: "Modélisation",
    desc: "Maîtrise avancée : dashboards financiers, TCD, formules complexes, equity curve.",
    tags: ["Dashboards", "TCD", "Modélisation"],
    color: "#21a366",
    bg: "#185c37",
  },
  {
    Logo: LogoNotion,
    name: "Notion",
    fullName: "Notion Workspace",
    category: "Organisation",
    desc: "Journal de trading structuré, base de connaissances et suivi des objectifs.",
    tags: ["Journal trading", "Notes", "Planification"],
    color: "#1a1a1a",
    bg: "#f5f5f5",
  },
];

const education = [
  {
    degree: "Bachelor Finance & Business — B1",
    school: "Financia Business School",
    year: "2024 – Présent",
    icon: <GraduationCap className="h-4 w-4" />,
  },
  {
    degree: "Enseignement secondaire",
    school: "CNED — Formation à distance",
    year: "Complété",
    icon: <BookOpen className="h-4 w-4" />,
  },
  {
    degree: "Préparation TOEIC — Objectif B2",
    school: "Niveau actuel B1 · En progression",
    year: "En cours",
    icon: <GraduationCap className="h-4 w-4" />,
  },
];

const navLinks = [
  { href: "#about", label: "À propos" },
  { href: "#skills", label: "Compétences" },
  { href: "#experience", label: "Expériences" },
  { href: "#trading", label: "Order Flow" },
  { href: "#stack", label: "Stack" },
  { href: "#education", label: "Formation" },
  { href: "#contact", label: "Contact" },
];

/* ─────────────────────────────────────────────
   SCROLL REVEAL HOOK
───────────────────────────────────────────── */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".reveal");
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("visible"); }),
      { threshold: 0.1 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/* ─────────────────────────────────────────────
   MAIN APP
───────────────────────────────────────────── */
export default function App() {
  const nowYear = useMemo(() => new Date().getFullYear(), []);
  const [showCert, setShowCert] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useReveal();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const body = [`Nom: ${d.get("nom")}`, ``, d.get("message")].join("%0D%0A");
    const url = new URL("mailto:ryad.bouderga78@gmail.com");
    url.searchParams.set("subject", d.get("sujet")?.toString() || "Contact portfolio");
    url.searchParams.set("body", body);
    window.location.href = url.toString();
  }, []);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900">

      {/* ═══════════════════════════════ NAV ═══════════════════════════════ */}
      <header
        className={`fixed inset-x-0 top-0 z-40 transition-all duration-300 ${
          scrolled
            ? "bg-white/95 backdrop-blur-sm border-b border-slate-200/80 shadow-sm"
            : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <a href="#" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 shadow" />
            <div>
              <p className="text-sm font-bold leading-tight text-slate-900">Ryad Bouderga</p>
              <p className="text-[11px] text-slate-500 leading-tight">Finance · Analyse · Trading</p>
            </div>
          </a>
          <nav className="hidden items-center gap-6 lg:flex">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} className="nav-link">{l.label}</a>
            ))}
          </nav>
          <a href="#contact" className="btn-primary hidden text-sm md:inline-flex" style={{ padding: "8px 18px" }}>
            Me contacter
          </a>
        </div>
      </header>

      {/* ═══════════════════════════════ HERO ═══════════════════════════════ */}
      <section className="hero-bg relative overflow-hidden pt-24 pb-20 lg:pt-32 lg:pb-28">
        {/* Grid pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
          }}
        />

        <div className="relative mx-auto max-w-6xl px-5">
          <div className="flex flex-col gap-12 lg:flex-row lg:items-center">

            {/* Left */}
            <div className="flex-1 space-y-7">
              <div className="anim-1 flex flex-wrap gap-2">
                <span className="tag tag-dark">Finance & Business</span>
                <span className="tag tag-dark">Private Equity</span>
                <span className="tag tag-gold">Stage recherché</span>
              </div>

              <div className="anim-2 space-y-3">
                <h1 className="text-4xl font-black leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
                  <span className="gradient-text">Ryad</span>{" "}
                  <span className="text-white">Bouderga</span>
                </h1>
                <p className="text-lg font-semibold text-blue-300 sm:text-xl">
                  Analyste Finance · Trader Intraday Indépendant
                </p>
              </div>

              <p className="anim-3 max-w-xl text-[15px] leading-relaxed text-slate-300">
                Étudiant en Finance & Business, je combine rigueur analytique, maîtrise
                d'Excel et compréhension des marchés financiers pour viser des postes en
                <strong className="text-white"> Private Equity</strong>,{" "}
                <strong className="text-white">fonds small cap</strong> ou{" "}
                <strong className="text-white">maisons de négoce</strong>.
              </p>

              <div className="anim-4 flex flex-wrap gap-3">
                <PDFDownloadLink
                  document={<CVPrivateEquity />}
                  fileName="CV_Ryad_Bouderga_PrivateEquity.pdf"
                  className="btn-primary"
                >
                  {({ loading }) => (
                    <>
                      <Download className="h-4 w-4" />
                      {loading ? "Génération..." : "CV Private Equity"}
                    </>
                  )}
                </PDFDownloadLink>
                <PDFDownloadLink
                  document={<CVNegoce />}
                  fileName="CV_Ryad_Bouderga_Negoce.pdf"
                  className="btn-outline"
                >
                  {({ loading }) => (
                    <>
                      <Download className="h-4 w-4" />
                      {loading ? "Génération..." : "CV Maison de Négoce"}
                    </>
                  )}
                </PDFDownloadLink>
                <a href="#contact" className="btn-outline">
                  <Send className="h-4 w-4" />
                  Me contacter
                </a>
              </div>

              {/* Stats */}
              <div className="anim-5 grid grid-cols-3 gap-3">
                {[
                  { v: "Analyse", l: "Financière & Entreprise" },
                  { v: "Excel", l: "Modélisation & KPIs" },
                  { v: "6×", l: "Apex 50K$ réussis" },
                ].map((s) => (
                  <div key={s.v} className="stat-card">
                    <p className="text-lg font-bold text-white">{s.v}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400 leading-tight">{s.l}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — Terminal card */}
            <div className="anim-3 flex-1 max-w-md mx-auto w-full">
              <div className="card-dark overflow-hidden">
                {/* Terminal bar */}
                <div className="flex items-center gap-1.5 border-b border-white/5 px-4 py-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
                  <span className="ml-3 text-[11px] text-slate-500">profil.finance — Ryad Bouderga</span>
                </div>
                <div className="p-5 space-y-4">
                  {/* Profile line */}
                  <div>
                    <p className="text-[11px] text-blue-400 font-mono mb-1">// Profil</p>
                    <div className="space-y-1.5">
                      {[
                        ["formation", "Bachelor Finance & Business · B1"],
                        ["école", "Financia Business School"],
                        ["localisation", "Cergy, France"],
                        ["disponibilité", "Stage — rémunéré / non rémunéré"],
                      ].map(([k, v]) => (
                        <div key={k} className="flex gap-2 text-[12px]">
                          <span className="text-slate-500 font-mono shrink-0">{k}:</span>
                          <span className="text-slate-200">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Targets */}
                  <div>
                    <p className="text-[11px] text-blue-400 font-mono mb-2">// Cibles</p>
                    <div className="flex flex-wrap gap-1.5">
                      {["Private Equity", "Small Cap Funds", "Trading Firms", "Commodities Houses"].map((t) => (
                        <span key={t} className="tag tag-dark text-[11px]">{t}</span>
                      ))}
                    </div>
                  </div>
                  {/* Skills snap */}
                  <div>
                    <p className="text-[11px] text-blue-400 font-mono mb-2">// Stack</p>
                    <div className="flex flex-wrap gap-1.5">
                      {["Excel", "Analyse financière", "Order Flow", "GEX/Skew", "Risk Management"].map((t) => (
                        <span key={t} className="tag tag-dark text-[11px]">{t}</span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => setShowSetup(true)}
                    className="flex w-full items-center justify-between rounded-xl bg-blue-500/10 border border-blue-500/20 px-4 py-3 text-[12.5px] font-semibold text-blue-300 transition hover:bg-blue-500/15"
                  >
                    Voir mon setup Order Flow
                    <ArrowUpRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ═══════════════════════════════ ABOUT ═══════════════════════════════ */}
      <SectionWrapper id="about" label="À propos" title="Finance, Analyse & Marchés">
        <div className="grid gap-6 lg:grid-cols-[1fr,360px]">
          <div className="card p-7 reveal space-y-4">
            <p className="text-[15px] leading-relaxed text-slate-600">
              Étudiant en Bachelor Finance & Business à Financia Business School, je développe
              une approche rigoureuse de l'<strong className="text-slate-900">analyse financière</strong> et
              de l'<strong className="text-slate-900">évaluation d'entreprises</strong>. Autodidacte et
              analytique, j'étudie les bilans, les dynamiques sectorielles et les modèles
              d'investissement avec une vraie rigueur de praticien.
            </p>
            <p className="text-[15px] leading-relaxed text-slate-600">
              Trader intraday indépendant sur les marchés Futures et crypto, j'applique
              quotidiennement la gestion du risque, le suivi de performance via Excel et
              l'analyse des flux de marché — compétences directement transférables à
              l'analyse d'investissement.
            </p>
            <p className="text-[15px] leading-relaxed text-slate-600">
              Expérience concrète en gestion administrative et financière : documents fiscaux,
              tableaux Excel, facturation et archivage comptable.
            </p>
          </div>
          <div className="card p-6 reveal reveal-delay-1 space-y-5">
            <div>
              <p className="section-label mb-3">Objectif de stage</p>
              <ul className="space-y-2.5">
                {[
                  "Private Equity / Capital investissement",
                  "Fonds small cap & growth",
                  "Analyse financière & due diligence",
                  "Trading firms / Commodities houses",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-[13.5px] text-slate-700">
                    <ChevronRight className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
              <p className="text-[12px] font-semibold text-blue-600 mb-1">Disponibilité</p>
              <p className="text-[13px] text-slate-700">
                Stage rémunéré ou <strong>non rémunéré</strong> — disponible rapidement.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="tag">Français — Natif</span>
              <span className="tag">Anglais — B1/B2 TOEIC</span>
            </div>
          </div>
        </div>
      </SectionWrapper>

      {/* ═══════════════════════════════ SKILLS ═══════════════════════════════ */}
      <SectionWrapper id="skills" label="Compétences" title="Expertise & Outils" dark>
        <div className="grid gap-5 md:grid-cols-3">
          {skills.map((s, i) => (
            <div
              key={s.title}
              className={`reveal reveal-delay-${i + 1} rounded-2xl p-6`}
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
                  {s.icon}
                </div>
                <div>
                  <p className="font-semibold text-white text-[14px]">{s.title}</p>
                  <p className="text-[11px] text-slate-400">{s.subtitle}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {s.tags.map((tag) => (
                  <span key={tag} className="tag tag-dark cursor-default">{tag}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionWrapper>

      {/* ═══════════════════════════════ EXPERIENCE ═══════════════════════════════ */}
      <SectionWrapper id="experience" label="Expériences" title="Parcours professionnel">
        <div className="timeline-line max-w-3xl space-y-6">
          {experiences.map((exp, i) => (
            <div key={exp.title} className={`reveal reveal-delay-${i + 1} flex gap-5`}>
              <div className="timeline-dot shrink-0 mt-1">{exp.icon}</div>
              <div className="card flex-1 p-6">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="tag">{exp.badge}</span>
                    </div>
                    <h3 className="text-[15px] font-bold text-slate-900">{exp.title}</h3>
                    <p className="text-[13px] font-semibold text-blue-600 mt-0.5">{exp.company}</p>
                    <p className="text-[12px] text-slate-400 mt-0.5">{exp.location}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-[12px] font-semibold text-slate-600">
                    {exp.period}
                  </span>
                </div>
                <ul className="space-y-2">
                  {exp.points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 text-[13.5px] text-slate-600">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </SectionWrapper>

      {/* ═══════════════════════════════ TRADING & ORDER FLOW ═══════════════════════════════ */}
      <SectionWrapper id="trading" label="Trading & Order Flow" title="Outils & Certification" dark>
        <div className="grid gap-6 lg:grid-cols-[1.3fr,1fr]">

          {/* Tools */}
          <div className="space-y-5">
            <div
              className="reveal rounded-2xl p-6"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <p className="text-[13px] font-semibold text-slate-400 mb-4 uppercase tracking-wider">Outils maîtrisés</p>
              <div className="grid grid-cols-2 gap-3">
                {tradingTools.map((t) => (
                  <div
                    key={t.name}
                    className="flex flex-col rounded-xl bg-white/5 border border-white/8 p-3 transition hover:bg-white/8"
                  >
                    <span className="text-[13.5px] font-bold text-white">{t.name}</span>
                    <span className="text-[11px] text-slate-400 mt-0.5">{t.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Apex cert */}
            <div
              className="reveal reveal-delay-1 rounded-2xl p-6"
              style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.18)" }}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider mb-1">Certification</p>
                  <p className="text-[15px] font-bold text-white">Apex Trader Funding</p>
                  <p className="text-[13px] text-blue-300 mt-0.5">6 challenges réussis — Comptes 50K$</p>
                </div>
                <button
                  onClick={() => setShowCert(true)}
                  className="shrink-0 rounded-lg bg-blue-500/15 px-3 py-1.5 text-[12px] font-semibold text-blue-300 transition hover:bg-blue-500/25"
                >
                  Voir
                </button>
              </div>
              <p className="text-[13px] text-slate-400 leading-relaxed">
                Validation de la discipline, de la gestion du risque et de la régularité
                des performances en conditions réelles sur 6 challenges consécutifs.
              </p>
            </div>
          </div>

          {/* Screenshots */}
          <div className="space-y-4">
            <div className="reveal overflow-hidden rounded-2xl" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
              <img
                src="/assets/atas-dom.png"
                alt="Order Flow / DOM — ATAS"
                className="h-52 w-full object-cover"
              />
              <div className="bg-[#0f2240] p-4">
                <p className="text-[13px] font-semibold text-white">Order Flow / DOM</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Microstructure de marché — ATAS</p>
              </div>
            </div>
            <div className="reveal reveal-delay-1 overflow-hidden rounded-2xl" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
              <img
                src="/assets/bookmap-heatmap.png"
                alt="Heatmap — Liquidité"
                className="h-52 w-full object-cover"
              />
              <div className="bg-[#0f2240] p-4">
                <p className="text-[13px] font-semibold text-white">Heatmap / Footprint</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Liquidité & profil de volume</p>
              </div>
            </div>
          </div>
        </div>
      </SectionWrapper>

      {/* ═══════════════════════════════ STACK & OUTILS ═══════════════════════════════ */}
      <SectionWrapper id="stack" label="Stack & Outils" title="Plateformes maîtrisées">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {stackTools.map((tool, i) => (
            <div
              key={tool.name}
              className={`reveal reveal-delay-${(i % 4) + 1} card group flex flex-col gap-4 p-5 cursor-default`}
            >
              {/* Logo + header */}
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 shrink-0 rounded-xl overflow-hidden shadow-sm">
                  <tool.Logo />
                </div>
                <div>
                  <p className="font-bold text-[14px] text-slate-900 leading-tight">{tool.name}</p>
                  <span
                    className="inline-block mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ background: `${tool.color}18`, color: tool.color }}
                  >
                    {tool.category}
                  </span>
                </div>
              </div>
              {/* Description */}
              <p className="text-[12.5px] text-slate-500 leading-relaxed flex-1">
                {tool.desc}
              </p>
              {/* Tags */}
              <div className="flex flex-wrap gap-1.5">
                {tool.tags.map((tag) => (
                  <span key={tag} className="tag text-[10.5px]">{tag}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionWrapper>

      {/* ═══════════════════════════════ PROJECTS ═══════════════════════════════ */}
      <SectionWrapper id="projects" label="Projets" title="Réalisations">
        <div className="grid gap-6 md:grid-cols-2 max-w-4xl">

          {/* Card 1 — Dashboard trades */}
          <div className="reveal card overflow-hidden flex flex-col">
            <div className="h-44 overflow-hidden bg-slate-100 relative">
              <img
                src="/assets/IMAGE%20SUIVIE%20DE%20TRADE.jpg"
                alt="Dashboard de suivi des trades"
                className="h-full w-full object-cover transition duration-500 hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <span className="absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-slate-800">
                Excel · Finance
              </span>
            </div>
            <div className="flex flex-col flex-1 p-5 gap-3">
              <div>
                <h3 className="text-[15px] font-bold text-slate-900">Dashboard Suivi des Trades</h3>
                <p className="mt-1.5 text-[13px] text-slate-500 leading-relaxed">
                  Tableau de bord complet construit sur Excel : winrate, risk/reward,
                  equity curve, statistiques journalières et hebdomadaires.
                  Structure identique à un reporting de fonds.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-auto pt-2">
                {["Winrate", "Risk/Reward", "Equity Curve", "Drawdown", "Stats hebdo"].map((t) => (
                  <span key={t} className="tag text-[10.5px]">{t}</span>
                ))}
              </div>
              <a
                href="/assets/Trades_Ryad_Filled_Stats_Clean.pdf"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-[13px] font-semibold text-blue-600 hover:text-blue-700 transition"
              >
                Voir le rapport PDF
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Card 2 — Apex Track record */}
          <div className="reveal reveal-delay-1 rounded-2xl overflow-hidden flex flex-col" style={{ background: "#0b1426", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="p-5 flex-1 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/15">
                  <TrendingUp className="h-5 w-5 text-orange-400" />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-white">Track Record — Apex Funding</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Prop Trading · Futures</p>
                </div>
              </div>
              <p className="text-[13px] text-slate-400 leading-relaxed">
                Réussite de <strong className="text-white">6 challenges consécutifs</strong> sur
                comptes financés jusqu'à 50K$. Validation de la discipline, de la gestion du
                risque et de la régularité en conditions réelles.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { v: "6×", l: "Challenges" },
                  { v: "50K$", l: "Compte max" },
                  { v: "MNQ/NQ", l: "Marchés" },
                ].map((s) => (
                  <div key={s.l} className="rounded-xl bg-white/5 p-3 text-center">
                    <p className="text-[15px] font-bold text-white">{s.v}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{s.l}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-auto">
                {["Discipline", "Risk Management", "Order Flow", "Consistency"].map((t) => (
                  <span key={t} className="tag tag-dark text-[10.5px]">{t}</span>
                ))}
              </div>
              <button
                onClick={() => {}}
                className="inline-flex items-center gap-2 text-[13px] font-semibold text-blue-300 hover:text-blue-200 transition"
              >
                Voir la certification
                <ExternalLink className="h-4 w-4" />
              </button>
            </div>
          </div>

        </div>
      </SectionWrapper>

      {/* ═══════════════════════════════ EDUCATION ═══════════════════════════════ */}
      <SectionWrapper id="education" label="Formation" title="Parcours académique">
        <div className="grid gap-4 max-w-2xl">
          {education.map((e, i) => (
            <div key={e.degree} className={`reveal reveal-delay-${i + 1} card flex items-center gap-5 p-5`}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
                {e.icon}
              </div>
              <div className="flex-1">
                <p className="text-[14px] font-semibold text-slate-900">{e.degree}</p>
                <p className="text-[13px] text-slate-500 mt-0.5">{e.school}</p>
              </div>
              <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-[12px] font-semibold text-slate-500">
                {e.year}
              </span>
            </div>
          ))}
        </div>
      </SectionWrapper>

      {/* ═══════════════════════════════ CONTACT ═══════════════════════════════ */}
      <SectionWrapper id="contact" label="Contact" title="Travaillons ensemble" dark>
        <div className="grid gap-6 lg:grid-cols-[1fr,1.4fr]">

          {/* Info */}
          <div className="reveal space-y-5">
            <div
              className="rounded-2xl p-6 space-y-4"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              {[
                { icon: <MapPin className="h-4 w-4" />, label: "Cergy, France" },
                { icon: <Phone className="h-4 w-4" />, label: "06 01 77 72 35", href: "tel:0601777235" },
                { icon: <Mail className="h-4 w-4" />, label: "ryad.bouderga78@gmail.com", href: "mailto:ryad.bouderga78@gmail.com" },
                { icon: <ExternalLink className="h-4 w-4" />, label: "LinkedIn — Ryad Bouderga", href: "https://linkedin.com/in/ryad-bouderga" },
              ].map((item) => (
                <a
                  key={item.label}
                  href={item.href ?? "#"}
                  className={`flex items-center gap-3 text-[13.5px] transition ${
                    item.href ? "font-semibold text-blue-300 hover:text-blue-200" : "text-slate-300 cursor-default"
                  }`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/8 text-slate-300">
                    {item.icon}
                  </span>
                  {item.label}
                </a>
              ))}
            </div>
            <div
              className="rounded-2xl p-5"
              style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)" }}
            >
              <p className="text-[13px] font-semibold text-blue-300 mb-1">Disponible pour un stage</p>
              <p className="text-[13px] text-slate-400 leading-relaxed">
                Private Equity · Small Cap Funds · Trading Firms · Commodities Houses<br />
                Rémunéré <strong className="text-slate-300">ou non rémunéré</strong>.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <PDFDownloadLink
                document={<CVPrivateEquity />}
                fileName="CV_Ryad_Bouderga_PrivateEquity.pdf"
                className="btn-primary"
                style={{ fontSize: "12.5px", padding: "8px 16px" }}
              >
                {({ loading }) => (
                  <><Download className="h-3.5 w-3.5" /> {loading ? "..." : "CV Private Equity"}</>
                )}
              </PDFDownloadLink>
              <PDFDownloadLink
                document={<CVNegoce />}
                fileName="CV_Ryad_Bouderga_Negoce.pdf"
                className="btn-outline"
                style={{ fontSize: "12.5px", padding: "8px 16px" }}
              >
                {({ loading }) => (
                  <><Download className="h-3.5 w-3.5" /> {loading ? "..." : "CV Négoce"}</>
                )}
              </PDFDownloadLink>
            </div>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="reveal reveal-delay-1 rounded-2xl p-6 space-y-4"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <p className="text-[15px] font-bold text-white">Envoyer un message</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <input name="nom" placeholder="Nom / Société" required className="form-input" style={{ background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.1)", color: "#e2e8f0" }} />
              <input name="email" type="email" placeholder="Email" required className="form-input" style={{ background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.1)", color: "#e2e8f0" }} />
            </div>
            <input name="sujet" placeholder="Objet" className="form-input" style={{ background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.1)", color: "#e2e8f0" }} />
            <textarea name="message" placeholder="Votre message..." rows={5} required className="form-input resize-none" style={{ background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.1)", color: "#e2e8f0" }} />
            <button type="submit" className="btn-primary w-full justify-center">
              <Send className="h-4 w-4" />
              Envoyer le message
            </button>
          </form>

        </div>
      </SectionWrapper>

      {/* ═══════════════════════════════ FOOTER ═══════════════════════════════ */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-6 text-[13px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {nowYear} Ryad Bouderga — Finance · Analyse · Trading.</p>
          <div className="flex gap-4">
            <a href="/cv-private-equity.html" target="_blank" rel="noreferrer" className="hover:text-blue-600 transition">CV Private Equity</a>
            <a href="/cv-maison-negoce.html" target="_blank" rel="noreferrer" className="hover:text-blue-600 transition">CV Maison de Négoce</a>
            <a href="https://linkedin.com/in/ryad-bouderga" target="_blank" rel="noreferrer" className="hover:text-blue-600 transition">LinkedIn</a>
          </div>
        </div>
      </footer>

      {/* ═══════════════════════════════ MODALS ═══════════════════════════════ */}
      {showSetup && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="modal-card relative max-h-[90vh] max-w-[90vw]">
            <button onClick={() => setShowSetup(false)} className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-black/90">
              <X className="h-3.5 w-3.5" /> Fermer
            </button>
            <img src="/assets/setup-trading.png" alt="Setup Order Flow" className="max-h-[90vh] w-auto rounded-2xl object-contain shadow-2xl" />
          </div>
        </div>
      )}
      {showCert && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="modal-card relative max-h-[90vh] max-w-[90vw]">
            <button onClick={() => setShowCert(false)} className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-black/90">
              <X className="h-3.5 w-3.5" /> Fermer
            </button>
            <img src="/assets/cert-apex.png" alt="Certification Apex" className="max-h-[90vh] w-auto rounded-2xl object-contain shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   SECTION WRAPPER
───────────────────────────────────────────── */
function SectionWrapper({
  id, label, title, children, dark = false,
}: {
  id: string;
  label: string;
  title: string;
  children: React.ReactNode;
  dark?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);

  return (
    <section
      id={id}
      ref={ref}
      className={`px-5 py-16 sm:py-20 ${dark ? "bg-[#0b1426]" : ""}`}
    >
      <div className="mx-auto max-w-6xl space-y-10">
        <div className="reveal">
          <p className={`section-label mb-2 ${dark ? "text-blue-400" : ""}`}>{label}</p>
          <h2 className={`text-2xl font-black tracking-tight sm:text-3xl ${dark ? "text-white" : "text-slate-900"}`}>
            {title}
          </h2>
        </div>
        {children}
      </div>
    </section>
  );
}
