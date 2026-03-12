import {
  Download,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  Send,
  X,
  ArrowDownRight,
  TrendingUp,
  BarChart3,
  BookOpen,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type SkillCategory = {
  title: string;
  icon: React.ReactNode;
  items: string[];
};

type Experience = {
  title: string;
  company: string;
  period: string;
  location: string;
  points: string[];
  tag?: string;
};

type Project = {
  title: string;
  description: string;
  cta: string;
  imageAlt: string;
};

const navItems = [
  { href: "#hero", label: "Accueil" },
  { href: "#about", label: "À propos" },
  { href: "#skills", label: "Compétences" },
  { href: "#experience", label: "Expériences" },
  { href: "#trading", label: "Trading & Order Flow" },
  { href: "#projects", label: "Projets" },
  { href: "#education", label: "Formation" },
  { href: "#contact", label: "Contact" },
];

const skills: SkillCategory[] = [
  {
    title: "Analyse financière & Entreprise",
    icon: <BarChart3 className="h-5 w-5 text-primary" />,
    items: [
      "Analyse de performance : revenus, marges, ratios financiers clés",
      "Lecture de bilans, comptes de résultat et flux de trésorerie",
      "Compréhension des dynamiques sectorielles et des cycles d'investissement",
      "Recherche financière : rapports annuels, données publiques, benchmarks",
      "Évaluation qualitative et quantitative d'entreprises (small cap / growth)",
    ],
  },
  {
    title: "Excel & Modélisation financière",
    icon: <BookOpen className="h-5 w-5 text-primary" />,
    items: [
      "Maîtrise Excel : formules avancées, tableaux croisés dynamiques, dashboards",
      "Modélisation financière : suivi de performance, tableaux de bord, KPIs",
      "Construction de trackers : equity curve, winrate, R/R, drawdown",
      "Google Sheets : automatisation de rapports, collaboration en temps réel",
      "Mise en forme de données financières pour la prise de décision",
    ],
  },
  {
    title: "Trading & Marchés financiers",
    icon: <TrendingUp className="h-5 w-5 text-primary" />,
    items: [
      "Analyse technique et microstructure de marché (Futures, Crypto, Commodities)",
      "Gestion du risque : R/R, sizing, contrôle du drawdown",
      "Lecture des dynamiques de marché et des flux de liquidité",
    ],
  },
];

const experiences: Experience[] = [
  {
    title: "Trader Indépendant — Intraday Futures & Crypto",
    company: "Apex Trader Funding — 6 challenges réussis",
    period: "Sept. 2024 – Présent",
    location: "Cergy / À distance",
    tag: "Trading",
    points: [
      "Trading en réel sur comptes financés jusqu'à 50K$ — 6 challenges Apex Trader Funding réussis.",
      "Maîtrise des outils professionnels : Order Flow, DOM, Footprint Chart, GEX, Skew, Volatilité.",
      "Gestion du risque disciplinée : R/R, sizing, suivi statistique hebdomadaire.",
      "Suivi de performance via dashboards Excel : winrate, equity curve, analyse des résultats.",
    ],
  },
  {
    title: "Assistant Administratif & Finance",
    company: "SC Formation / L3M / Green Cottage",
    period: "2023 – 2025",
    location: "Cergy / Hybride",
    tag: "Finance",
    points: [
      "Gestion et organisation de documents fiscaux et administratifs.",
      "Mise à jour et suivi de tableaux financiers sur Excel.",
      "Participation au suivi de facturation et archivage comptable.",
      "Support administratif dans la gestion financière courante.",
    ],
  },
];

const tradingTools = [
  "Order Flow",
  "DOM / Footprint",
  "GEX / Skew",
  "Volatilité",
  "ATAS",
  "TradingView",
  "MT5",
  "Heatmap",
];

const projects: Project[] = [
  {
    title: "Dashboard de Suivi des Trades — Excel",
    description:
      "Tableau de bord complet sur Excel : winrate, risk/reward, equity curve, statistiques journalières et hebdomadaires. Structure identique à un reporting de fonds.",
    cta: "Ouvrir le PDF",
    imageAlt: "Dashboard trades Excel",
  },
];

const education = [
  "Bachelor Finance & Business (B1) — Financia Business School — En cours",
  "CNED — Enseignement secondaire — Formation à distance",
  "Préparation TOEIC — Niveau actuel B1, objectif B2",
];

const contactInfo = [
  { icon: <MapPin className="h-4 w-4" />, label: "Cergy, France" },
  { icon: <Phone className="h-4 w-4" />, label: "06 01 77 72 35" },
  {
    icon: <Mail className="h-4 w-4" />,
    label: "ryad.bouderga78@gmail.com",
    link: "mailto:ryad.bouderga78@gmail.com",
  },
  {
    icon: <ExternalLink className="h-4 w-4" />,
    label: "LinkedIn — Ryad Bouderga",
    link: "https://www.linkedin.com/in/ryad-bouderga-2a44b0386/",
  },
];

const heroStats = [
  { value: "Analyse", label: "Financière & Entreprise" },
  { value: "Excel", label: "Modélisation & Dashboards" },
  { value: "Order Flow", label: "Marchés & Risque" },
];

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export default function App() {
  const nowYear = useMemo(() => new Date().getFullYear(), []);
  const [showSetup, setShowSetup] = useState(false);
  const [showCert, setShowCert] = useState(false);

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(".will-animate"));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("in-view");
        });
      },
      { threshold: 0.12 }
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const handleFormSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = data.get("Nom")?.toString() ?? "";
    const subject = data.get("Objet")?.toString() ?? "";
    const message = data.get("Message")?.toString() ?? "";
    const body = [`Nom: ${name}`, "", message].join("%0D%0A");
    const mailto = new URL("mailto:ryad.bouderga78@gmail.com");
    mailto.searchParams.set("subject", subject || "Contact portfolio");
    mailto.searchParams.set("body", body);
    window.location.href = mailto.toString();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* ── Header ── */}
      <header className="fixed inset-x-0 top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-sky-500 text-white shadow-card" />
            <div>
              <p className="text-sm font-semibold tracking-tight">Ryad Bouderga</p>
              <p className="text-xs text-slate-500">Analyse financière · Finance & Trading</p>
            </div>
          </div>
          <nav className="hidden gap-5 text-sm font-medium text-slate-600 lg:flex">
            {navItems.map((item) => (
              <a key={item.href} href={item.href} className="transition hover:text-slate-900">
                {item.label}
              </a>
            ))}
          </nav>
          <a
            href="#contact"
            className="hidden rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-sky-600 md:inline-flex"
          >
            Me contacter
          </a>
        </div>
      </header>

      <main className="pt-24">
        {/* ── Hero ── */}
        <section
          id="hero"
          className="relative overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100"
        >
          <div className="absolute inset-x-0 top-10 flex justify-center opacity-30 blur-3xl">
            <div className="h-44 w-[28rem] rounded-full bg-primary/30" />
          </div>
          <div className="relative mx-auto flex max-w-6xl flex-col gap-10 px-4 py-16 lg:flex-row lg:items-center lg:py-20">
            <div className="flex-1 space-y-6">
              <p className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary shadow-card">
                Finance · Analyse d'entreprise · Trading
              </p>
              <div className="space-y-4">
                <h1 className="animate-fade-up text-3xl font-black leading-tight text-slate-900 sm:text-4xl lg:text-5xl">
                  Ryad Bouderga
                </h1>
                <p className="animate-fade-up delay-1 text-lg font-semibold text-slate-700 sm:text-xl">
                  Étudiant en Finance — Analyste & Trader Intraday
                </p>
                <p className="animate-fade-up delay-2 max-w-2xl text-base text-slate-600 sm:text-lg">
                  Passionné par l'analyse financière, l'évaluation d'entreprises et les marchés
                  financiers. Je combine rigueur analytique, maîtrise d'Excel et compréhension
                  approfondie des dynamiques de marché pour développer une vision complète de
                  la finance.
                </p>
                <p className="animate-fade-up delay-3 text-sm font-semibold text-primary">
                  Recherche stage — Private Equity · Small Cap Funds · Trading Firms · Commodities Houses
                </p>
              </div>
              <div className="animate-fade-up delay-3 flex flex-wrap gap-3">
                <a
                  href="/assets/CV_Ryad_Bouderga_PrivateEquity.pdf"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:-translate-y-0.5 hover:bg-sky-600 active:scale-95"
                >
                  <Download className="h-4 w-4" />
                  CV Private Equity
                </a>
                <a
                  href="/assets/CV_Ryad_Bouderga_Negoce.pdf"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-primary bg-white px-4 py-2 text-sm font-semibold text-primary shadow-card transition hover:-translate-y-0.5 hover:bg-primary hover:text-white active:scale-95"
                >
                  <Download className="h-4 w-4" />
                  CV Maison de Négoce
                </a>
                <a
                  href="#contact"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:text-primary active:scale-95"
                >
                  <Send className="h-4 w-4" />
                  Me contacter
                </a>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {heroStats.map((stat) => (
                  <div
                    key={stat.label}
                    className="will-animate rounded-2xl border border-slate-200 bg-white/80 px-4 py-4 shadow-card"
                  >
                    <p className="text-xl font-bold text-slate-900">{stat.value}</p>
                    <p className="text-sm text-slate-500">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-1 will-animate">
              <div className="relative mx-auto h-[340px] max-w-md overflow-hidden rounded-3xl bg-slate-900 shadow-card">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/70 via-slate-900 to-slate-900" />
                <div className="relative flex h-full flex-col justify-between p-6 text-white">
                  <div>
                    <p className="text-sm uppercase tracking-widest text-slate-300">
                      Profil Finance & Marchés
                    </p>
                    <h3 className="mt-2 text-2xl font-bold">Analyse · Excel · Order Flow</h3>
                    <p className="mt-3 text-sm text-slate-300">
                      Finance d'entreprise, modélisation Excel, lecture des marchés financiers
                      et gestion du risque en conditions réelles.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {["Private Equity", "Small Cap", "Futures", "Commodities"].map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowSetup(true)}
                      className="group inline-flex items-center gap-2 text-sm font-semibold text-white transition hover:translate-x-1"
                    >
                      <ArrowDownRight className="h-4 w-4 transition group-hover:translate-x-1" />
                      Voir mon setup Order Flow
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── About ── */}
        <Section id="about" title="À propos">
          <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
            <div className="will-animate space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
              <p className="text-slate-700">
                Étudiant en Bachelor Finance & Business (B1) à Financia Business School, je
                développe une approche rigoureuse de l'analyse financière et de l'évaluation
                d'entreprises. Autodidacte et analytique, je consacre une part importante de
                mon temps à comprendre les bilans, les dynamiques sectorielles et les modèles
                d'investissement.
              </p>
              <p className="text-slate-700">
                Trader intraday indépendant sur les marchés Futures et crypto, j'applique
                quotidiennement les principes de gestion du risque, de suivi de performance
                (via Excel) et d'analyse de flux de marché — des compétences directement
                transférables à l'analyse d'investissement.
              </p>
              <p className="text-slate-700">
                J'ai également une expérience concrète en gestion administrative et financière,
                où j'ai manipulé des documents fiscaux, mis à jour des tableaux Excel et
                participé au suivi de facturation.
              </p>
            </div>
            <div className="will-animate delay-1 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
              <p className="text-sm font-semibold text-primary">Objectif de stage</p>
              <ul className="space-y-2 text-sm text-slate-700">
                {[
                  "Private Equity / Capital investissement",
                  "Fonds small cap / growth",
                  "Analyse financière & due diligence",
                  "Trading firms / Commodities houses",
                  "Rémunéré ou non rémunéré",
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        {/* ── Skills ── */}
        <Section id="skills" title="Compétences">
          <div className="grid gap-6 md:grid-cols-3">
            {skills.map((block) => (
              <div
                key={block.title}
                className="will-animate rounded-2xl border border-slate-200 bg-white p-6 shadow-card"
              >
                <div className="flex items-center gap-2">
                  {block.icon}
                  <h3 className="text-base font-semibold text-slate-900">{block.title}</h3>
                </div>
                <ul className="mt-4 space-y-3 text-sm text-slate-700">
                  {block.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Experience ── */}
        <Section id="experience" title="Expériences">
          <div className="grid gap-6 md:grid-cols-2">
            {experiences.map((exp) => (
              <div
                key={exp.title}
                className="will-animate flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    {exp.tag && (
                      <span className="mb-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        {exp.tag}
                      </span>
                    )}
                    <p className="text-sm font-semibold text-primary">{exp.company}</p>
                    <h3 className="text-base font-semibold text-slate-900">{exp.title}</h3>
                  </div>
                  <span className="whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {exp.period}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">{exp.location}</p>
                <ul className="mt-4 space-y-3 text-sm text-slate-700">
                  {exp.points.map((point) => (
                    <li key={point} className="flex gap-2">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Trading & Order Flow ── */}
        <Section id="trading" title="Trading & Order Flow">
          <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
            <div className="space-y-6">
              {/* Tools grid */}
              <div className="will-animate rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
                <h3 className="text-base font-semibold text-slate-900">Outils maîtrisés</h3>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {tradingTools.map((tool) => (
                    <div
                      key={tool}
                      className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5"
                    >
                      {tool}
                    </div>
                  ))}
                </div>
              </div>

              {/* Certification Apex */}
              <div className="will-animate rounded-2xl border border-transparent bg-gradient-to-r from-primary/10 via-white to-sky-50 p-[1px]">
                <div className="rounded-2xl bg-white p-5 shadow-card">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        Apex Trader Funding
                      </span>
                      <p className="mt-2 font-semibold text-slate-900">
                        6 challenges réussis — Comptes financés 50K$
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Passage et réussite de 6 challenges de trading en conditions réelles.
                        Démonstration de discipline, gestion du risque et régularité.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCert(true)}
                      className="shrink-0 text-xs font-semibold text-primary underline decoration-primary/60 underline-offset-4 transition hover:text-sky-600"
                    >
                      Voir
                    </button>
                  </div>
                  <div className="mt-4">
                    <img
                      src="/assets/cert-apex.png"
                      alt="Certification Apex Trader Funding"
                      className="h-24 w-auto rounded-xl border border-primary/40 bg-white object-contain shadow-card"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Screenshots */}
            <div className="space-y-4">
              <div className="will-animate overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
                <img
                  src="/assets/atas-dom.png"
                  alt="Order Flow / DOM — ATAS"
                  className="h-48 w-full object-cover"
                />
                <div className="p-3">
                  <p className="text-sm font-semibold text-slate-700">Order Flow / DOM (ATAS)</p>
                  <p className="text-xs text-slate-400">Lecture de la microstructure de marché</p>
                </div>
              </div>
              <div className="will-animate overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
                <img
                  src="/assets/bookmap-heatmap.png"
                  alt="Heatmap — Liquidité"
                  className="h-48 w-full object-cover"
                />
                <div className="p-3">
                  <p className="text-sm font-semibold text-slate-700">Heatmap / Footprint</p>
                  <p className="text-xs text-slate-400">Flux de liquidité et profil de volume</p>
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* ── Projects ── */}
        <Section id="projects" title="Projets">
          <div className="grid gap-6 md:grid-cols-1">
            {projects.map((project) => (
              <div
                key={project.title}
                className="will-animate flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card"
              >
                <div className="h-40 overflow-hidden">
                  <img
                    src="/assets/IMAGE%20SUIVIE%20DE%20TRADE.jpg"
                    alt="Aperçu du dashboard de suivi des trades"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-3 p-6">
                  <h3 className="text-base font-semibold text-slate-900">{project.title}</h3>
                  <p className="text-sm text-slate-700">{project.description}</p>
                  <a
                    href="/assets/Trades_Ryad_Filled_Stats_Clean.pdf"
                    className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-sky-600"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {project.cta}
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Education ── */}
        <Section id="education" title="Formation & Certifications">
          <div className="grid gap-4">
            {education.map((item) => (
              <div
                key={item}
                className="will-animate flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-card"
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                <p className="text-sm text-slate-800">{item}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Contact ── */}
        <Section id="contact" title="Contact">
          <div className="grid gap-6 md:grid-cols-[1fr,1.4fr]">
            <div className="animate-scale-in space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
              <h3 className="text-base font-semibold text-slate-900">Coordonnées</h3>
              <div className="space-y-3">
                {contactInfo.map((item) => (
                  <a
                    key={item.label}
                    href={item.link ?? "#"}
                    className={classNames(
                      "flex items-center gap-3 text-sm",
                      item.link
                        ? "font-semibold text-primary hover:text-sky-600"
                        : "text-slate-700"
                    )}
                  >
                    <span className="rounded-lg bg-slate-100 p-2 text-slate-700">
                      {item.icon}
                    </span>
                    {item.label}
                  </a>
                ))}
              </div>
              <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
                Disponible pour un stage en Private Equity, fonds small cap, trading firm ou
                maison de négoce — rémunéré ou non rémunéré.
              </div>
            </div>
            <form
              onSubmit={handleFormSubmit}
              className="will-animate space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-card"
            >
              <h3 className="text-base font-semibold text-slate-900">Envoyer un message</h3>
              {["Nom", "Email", "Objet"].map((field) => (
                <input
                  key={field}
                  name={field}
                  placeholder={field}
                  required={field !== "Objet"}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                />
              ))}
              <textarea
                name="Message"
                placeholder="Message"
                rows={4}
                required
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-sky-600"
              >
                <Send className="h-4 w-4" />
                Envoyer
              </button>
            </form>
          </div>
        </Section>
      </main>

      {/* ── Modals ── */}
      {showSetup && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur">
          <div className="modal-card relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl bg-transparent shadow-2xl">
            <button
              type="button"
              onClick={() => setShowSetup(false)}
              className="absolute right-2 top-2 inline-flex items-center gap-2 rounded-full bg-slate-900/90 px-3 py-1 text-xs font-semibold text-white shadow-card transition hover:bg-slate-700"
            >
              <X className="h-4 w-4" />
              Fermer
            </button>
            <img
              src="/assets/setup-trading.png"
              alt="Setup complet — Order Flow, DOM, Footprint"
              className="mx-auto block max-h-[90vh] w-auto rounded-2xl bg-slate-900 object-contain shadow-2xl"
            />
          </div>
        </div>
      )}

      {showCert && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur">
          <div className="modal-card relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl bg-transparent shadow-2xl">
            <button
              type="button"
              onClick={() => setShowCert(false)}
              className="absolute right-2 top-2 inline-flex items-center gap-2 rounded-full bg-slate-900/90 px-3 py-1 text-xs font-semibold text-white shadow-card transition hover:bg-slate-700"
            >
              <X className="h-4 w-4" />
              Fermer
            </button>
            <img
              src="/assets/cert-apex.png"
              alt="Certification Apex Trader Funding — 6 challenges"
              className="mx-auto block max-h-[90vh] w-auto rounded-2xl bg-slate-900 object-contain shadow-2xl"
            />
          </div>
        </div>
      )}

      <footer className="mt-16 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p>© {nowYear} Ryad Bouderga — Finance · Analyse · Trading.</p>
          <div className="flex gap-4 text-slate-500">
            <a href="/assets/CV_Ryad_Bouderga_PrivateEquity.pdf" target="_blank" rel="noreferrer" className="hover:text-primary">
              CV Private Equity
            </a>
            <a href="/assets/CV_Ryad_Bouderga_Negoce.pdf" target="_blank" rel="noreferrer" className="hover:text-primary">
              CV Maison de Négoce
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

type SectionProps = {
  id: string;
  title: string;
  children: React.ReactNode;
};

function Section({ id, title, children }: SectionProps) {
  return (
    <section id={id} className="will-animate px-4 py-12 sm:py-14">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex items-center gap-3">
          <img
            src="/assets/PDP%20ORDERFLOW.jpg"
            alt="Ryad Bouderga"
            className="h-10 w-10 rounded-full border border-slate-200 object-cover shadow-card"
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Portfolio
            </p>
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h2>
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}
