import {
  ArrowDownRight,
  Download,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  Send,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type SkillCategory = {
  title: string;
  items: string[];
};

type Experience = {
  title: string;
  company: string;
  period: string;
  location: string;
  points: string[];
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
  { href: "#trading", label: "Trading & Outils" },
  { href: "#projects", label: "Projets" },
  { href: "#education", label: "Formation" },
  { href: "#contact", label: "Contact" },
];

const skills: SkillCategory[] = [
  {
    title: "Finance & Comptabilité",
    items: [
      "Analyse financière : suivi des performances, ratios, dashboards",
      "Notions de comptabilité : débit/crédit, immobilisations, amortissements",
      "Suivi des documents fiscaux (CFE, tableaux de suivi)",
    ],
  },
  {
    title: "Trading & Marchés financiers",
    items: [
      "Trading intraday (Futures/CFD, crypto, matières premières)",
      "Analyse technique et fondamentale",
      "Gestion du risque : R/R, winrate, sizing",
      "Psychologie du trading, discipline, journal de trades",
    ],
  },
  {
    title: "Outils & Bureautique",
    items: [
      "Excel / Google Sheets : tableaux, formules, suivi de performance",
      "Notions de CRM administratif, organisation documentaire",
      "Automatisation légère et mise en forme de rapports",
    ],
  },
];

const experiences: Experience[] = [
  {
    title: "Trader Indépendant — Intraday & Crypto",
    company: "Comptes financés (FTMO, Topstep, Apex)",
    period: "Sept. 2024 – Aujourd’hui",
    location: "Cergy / À distance",
    points: [
      "Trading en réel sur comptes financés jusqu’à 50K$.",
      "Stratégies intraday opportunistes (fondamental + technique).",
      "Expérience avancée sur crypto-monnaies et matières premières.",
      "Amélioration continue via journal de trading : winrate, R/R, drawdown.",
    ],
  },
  {
    title: "Assistant Administratif & Finance",
    company: "SC Formation / L3M / Green Cottage",
    period: "2023 – 2025",
    location: "Cergy / Hybride",
    points: [
      "Export et organisation des documents fiscaux (CFE, tableaux de suivi).",
      "Mise à jour de fichiers financiers et tableaux Excel.",
      "Gestion administrative courante (classement, suivi de dossiers).",
      "Appui facturation : envoi et archivage des factures.",
    ],
  },
];

const tradingTools = [
  "MT5",
  "Binance",
  "TradingView",
  "ATAS",
  "Heatmap",
  "Footprint Chart",
  "Order Flow",
  "Carnet d’ordres (DOM)",
];

const projects: Project[] = [
  {
    title: "Tableau de Suivi des Trades",
    description:
      "Fichier PDF avec winrate, risk/reward, equity curve, statistiques journalières et suivi des trades.",
    cta: "Ouvrir le PDF",
    imageAlt: "Dashboard trades",
  },
];

const education = [
  "Bachelor Finance & Business (B1) — Financia Business School — En cours",
  "CNED — Enseignement secondaire — Formation à distance",
  "Préparation TOEIC — Niveau actuel B1, visé B2",
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
    label: "LinkedIn",
    link: "https://www.linkedin.com/in/ryad-bouderga-2a44b0386/",
  },
];

const heroStats = [
  { value: "50K$", label: "Taille de compte financé" },
  { value: "Intraday", label: "Futures, CFD, Crypto" },
  { value: "Discipline", label: "Risk Management" },
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
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("in-view");
      });
    }, { threshold: 0.16 });
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const handleFormSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = data.get("Nom")?.toString() ?? "";
    const email = data.get("Email")?.toString() ?? "";
    const subject = data.get("Objet")?.toString() ?? "";
    const message = data.get("Message")?.toString() ?? "";

    const mailto = new URL("mailto:ryad.bouderga78@gmail.com");
    const body = [`Nom: ${name}`, `Email: ${email}`, "", message].join("%0D%0A");
    mailto.searchParams.set("subject", subject || "Contact portfolio");
    mailto.searchParams.set("body", body);

    window.location.href = mailto.toString();
  }, []);

  // Serve PDFs from the public/assets folder so they open directly
  const cvLinkWeb = "/assets/CV_Ryad_Bouderga_Finance.pdf";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="fixed inset-x-0 top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-sky-500 text-white shadow-card" />
            <div>
              <p className="text-sm font-semibold tracking-tight">Ryad Bouderga</p>
              <p className="text-xs text-slate-500">
                Étudiant finance · Trader intraday
              </p>
            </div>
          </div>
          <nav className="hidden gap-6 text-sm font-medium text-slate-600 md:flex">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="transition hover:text-slate-900"
              >
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
                Finance • Trading • Discipline
              </p>
              <div className="space-y-4">
                <h1 className="animate-fade-up text-3xl font-black leading-tight text-slate-900 sm:text-4xl lg:text-5xl">
                  Ryad Bouderga
                </h1>
                <p className="animate-fade-up delay-1 text-lg font-semibold text-slate-700 sm:text-xl">
                  Étudiant en Finance & Trader Intraday Indépendant
                </p>
                <p className="animate-fade-up delay-2 max-w-2xl text-base text-slate-600 sm:text-lg">
                  Je combine analyse technique, order flow et gestion du risque pour
                  développer une approche disciplinée des marchés financiers.
                </p>
              </div>
              <div className="animate-fade-up delay-3 flex flex-wrap gap-3">
                <a
                  href={cvLinkWeb}
                  onClick={(e) => {
                    // fallback local file if the hosted asset is missing
                    setTimeout(() => {
                      if (e.isDefaultPrevented()) return;
                      // no-op; we rely on browser
                    }, 0);
                  }}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:-translate-y-0.5 hover:bg-sky-600 active:scale-95"
                >
                  <Download className="h-4 w-4" />
                  Télécharger mon CV
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
                    <p className="text-sm uppercase tracking-widest text-slate-200">
                      Profil Trader
                    </p>
                    <h3 className="mt-2 text-2xl font-bold">Discipline & Risque</h3>
                    <p className="mt-2 text-sm text-slate-200">
                      Capture prévue pour la photo pro ou un visuel trading.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <p className="text-xs text-slate-200">
                      Placez ici une photo professionnelle ou un screenshot de votre
                      setup de trading.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowSetup(true)}
                      className="group inline-flex items-center gap-2 text-sm font-semibold text-white transition hover:translate-x-1"
                    >
                      <ArrowDownRight className="h-4 w-4 transition group-hover:translate-x-1" />
                      Voir mon setup (DOM, heatmap, footprint)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Section id="about" title="À propos">
          <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
            <div className="will-animate space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
              <p className="text-slate-700">
                Je suis étudiant en Bachelor Finance & Business (B1) à Financia
                Business School et trader intraday indépendant sur les marchés futures
                et crypto. Autodidacte, rigoureux et passionné, je travaille
                quotidiennement sur la compréhension de la dynamique des marchés, la
                gestion du risque et la psychologie du trading.
              </p>
              <p className="text-slate-700">
                J’ai également une expérience en gestion administrative et financière
                au sein d’entreprises familiales, où j’ai manipulé des documents
                fiscaux, des tableaux Excel et des tâches de facturation.
              </p>
            </div>
            <div className="will-animate delay-1 space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
              <p className="text-sm font-semibold text-primary">Objectif</p>
              <p className="text-slate-700">
                Rejoindre un poste de back-office financier ou opérationnel (banque,
                assurance, finance auto), tout en développant mes compétences de
                trading intraday.
              </p>
            </div>
          </div>
        </Section>

        <Section id="skills" title="Compétences">
          <div className="grid gap-6 md:grid-cols-3">
            {skills.map((block) => (
              <div
                key={block.title}
                className="will-animate rounded-2xl border border-slate-200 bg-white p-6 shadow-card"
              >
                <h3 className="text-lg font-semibold text-slate-900">{block.title}</h3>
                <ul className="mt-4 space-y-3 text-sm text-slate-700">
                  {block.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-1 h-2 w-2 rounded-full bg-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <Section id="experience" title="Expériences">
          <div className="grid gap-6 md:grid-cols-2">
            {experiences.map((exp) => (
              <div
                key={exp.title}
                className="will-animate flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-primary">{exp.company}</p>
                    <h3 className="text-lg font-semibold text-slate-900">{exp.title}</h3>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {exp.period}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">{exp.location}</p>
                <ul className="mt-4 space-y-3 text-sm text-slate-700">
                  {exp.points.map((point) => (
                    <li key={point} className="flex gap-2">
                      <span className="mt-1 h-2 w-2 rounded-full bg-primary" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <Section id="trading" title="Trading & Outils">
          <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
            <div className="will-animate rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
              <h3 className="text-lg font-semibold text-slate-900">Outils utilisés</h3>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {tradingTools.map((tool) => (
                  <div
                    key={tool}
                    className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5"
                  >
                    {tool}
                  </div>
                ))}
              </div>
              <div className="will-animate mt-6 rounded-2xl border border-transparent bg-gradient-to-r from-primary/10 via-white to-sky-50 p-[1px]">
                <div className="rounded-2xl bg-white p-4 shadow-card">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-primary">Certification</p>
                      <p className="text-xs text-slate-500">
                        Apex Trader Funding — compte financé 50K$
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCert(true)}
                      className="text-xs font-semibold text-primary underline decoration-primary/60 underline-offset-4 transition hover:text-sky-600"
                    >
                      Voir en grand
                    </button>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <img
                      src="/assets/cert-apex.png"
                      alt="Certification Apex Trader Funding"
                      className="h-28 w-auto rounded-xl border border-primary/40 bg-white object-contain shadow-card"
                    />
                    <div className="text-sm text-slate-700">
                      <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        Apex Trader Funding
                      </span>
                      <p className="mt-2 font-semibold text-slate-900">
                        Compte financé 50K$ — Certification
                      </p>
                      <p className="text-xs text-slate-500">
                        Placez votre image dans public/assets/cert-apex.png
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="will-animate overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
                <img
                  src="/assets/atas-dom.png"
                  alt="Order flow / DOM ATAS"
                  className="h-56 w-full object-cover"
                />
                <div className="p-3 text-sm text-slate-700">
                  Order Flow / DOM (ATAS) — remplacez l’image par votre capture :
                  public/assets/atas-dom.png
                </div>
              </div>
              <div className="will-animate overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
                <img
                  src="/assets/bookmap-heatmap.png"
                  alt="Heatmap Bookmap"
                  className="h-56 w-full object-cover"
                />
                <div className="p-3 text-sm text-slate-700">
                  Heatmap (Bookmap) — remplacez l’image par votre capture :
                  public/assets/bookmap-heatmap.png
                </div>
              </div>
              <div className="will-animate overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
                <img
                  src="/assets/setup-trading.png"
                  alt="Setup de trading (DOM + gestion position)"
                  className="h-56 w-full object-cover"
                />
                <div className="p-3 text-sm text-slate-700">
                  Setup de trading (DOM + gestion position). Placez votre capture ici :
                  public/assets/setup-trading.png
                </div>
              </div>
            </div>
          </div>
        </Section>

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
                    alt="Aperçu du tableau de suivi des trades"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-3 p-6">
                  <h3 className="text-lg font-semibold text-slate-900">
                    {project.title}
                  </h3>
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
                  <p className="text-xs text-slate-500">
                    Fichiers à placer : public/assets/Trades_Ryad_Filled_Stats_Clean.pdf et
                    public/assets/IMAGE SUIVIE DE TRADE.jpg
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section id="education" title="Formation & Certifications">
          <div className="grid gap-4">
            {education.map((item) => (
              <div
                key={item}
                className="will-animate flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-card"
              >
                <span className="h-2 w-2 rounded-full bg-primary" />
                <p className="text-sm text-slate-800">{item}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="contact" title="Contact">
          <div className="animate-scale-in space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
            <h3 className="text-lg font-semibold text-slate-900">Coordonnées</h3>
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
              Disponible pour des missions back-office ou opérations financières,
              avec une forte appétence pour le trading intraday.
            </div>
          </div>
        </Section>
      </main>

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
              alt="Setup complet trading (DOM, heatmap, footprint)"
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
              alt="Certification Apex Trader Funding"
              className="mx-auto block max-h-[90vh] w-auto rounded-2xl bg-slate-900 object-contain shadow-2xl"
            />
          </div>
        </div>
      )}

      <footer className="mt-16 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p>© {nowYear} Ryad Bouderga — Portfolio Finance & Trading.</p>
          <p className="text-slate-500">
            Design léger, responsive, prêt pour vos captures d’écran.
          </p>
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
            alt="Icône section"
            className="h-10 w-10 rounded-full border border-slate-200 object-cover shadow-card"
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Section
            </p>
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h2>
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}

