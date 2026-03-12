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
                <a href="/assets/CV_Ryad_Bouderga_PrivateEquity.pdf" target="_blank" rel="noreferrer" className="btn-primary">
                  <Download className="h-4 w-4" />
                  CV Private Equity
                </a>
                <a href="/assets/CV_Ryad_Bouderga_Negoce.pdf" target="_blank" rel="noreferrer" className="btn-outline">
                  <Download className="h-4 w-4" />
                  CV Maison de Négoce
                </a>
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

      {/* ═══════════════════════════════ PROJECTS ═══════════════════════════════ */}
      <SectionWrapper id="projects" label="Projets" title="Réalisations">
        <div className="reveal card overflow-hidden max-w-2xl">
          <div className="h-48 overflow-hidden">
            <img
              src="/assets/IMAGE%20SUIVIE%20DE%20TRADE.jpg"
              alt="Dashboard de suivi des trades"
              className="h-full w-full object-cover transition duration-500 hover:scale-105"
            />
          </div>
          <div className="p-6">
            <span className="tag mb-3 inline-block">Excel · Finance</span>
            <h3 className="text-[16px] font-bold text-slate-900">Dashboard de Suivi des Trades</h3>
            <p className="mt-2 text-[13.5px] text-slate-600 leading-relaxed">
              Fichier Excel structuré : winrate, risk/reward, equity curve, statistiques
              journalières et hebdomadaires. Même logique qu'un reporting de fonds.
            </p>
            <a
              href="/assets/Trades_Ryad_Filled_Stats_Clean.pdf"
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 text-[13.5px] font-semibold text-blue-600 hover:text-blue-700"
            >
              Ouvrir le PDF
              <ExternalLink className="h-4 w-4" />
            </a>
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
              <a href="/assets/CV_Ryad_Bouderga_PrivateEquity.pdf" target="_blank" rel="noreferrer" className="btn-primary" style={{ fontSize: "12.5px", padding: "8px 16px" }}>
                <Download className="h-3.5 w-3.5" /> CV Private Equity
              </a>
              <a href="/assets/CV_Ryad_Bouderga_Negoce.pdf" target="_blank" rel="noreferrer" className="btn-outline" style={{ fontSize: "12.5px", padding: "8px 16px" }}>
                <Download className="h-3.5 w-3.5" /> CV Négoce
              </a>
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
