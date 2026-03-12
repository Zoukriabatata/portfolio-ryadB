import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Link,
} from "@react-pdf/renderer";

/* ─── Colors ─── */
const C = {
  navy:      "#0b1426",
  blue:      "#2563eb",
  blueSoft:  "#eff6ff",
  blueText:  "#1d4ed8",
  white:     "#ffffff",
  bg:        "#f8fafc",
  border:    "#e2e8f0",
  text:      "#1e293b",
  muted:     "#64748b",
  mutedLight:"#94a3b8",
  accent:    "#3b82f6",
  darkCard:  "#0f2240",
  tagDarkBg: "rgba(59,130,246,0.12)",
  tagDarkText:"#1d4ed8",
};

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: C.text,
    backgroundColor: C.white,
  },

  /* Header */
  header: {
    backgroundColor: C.navy,
    padding: "22 28 18 28",
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerName: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    letterSpacing: 0.3,
  },
  headerTitle: {
    fontSize: 10,
    color: "#93c5fd",
    marginTop: 3,
  },
  headerBadge: {
    backgroundColor: C.blue,
    color: C.white,
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 6,
    alignSelf: "flex-start",
    letterSpacing: 0.5,
  },
  headerContact: {
    alignItems: "flex-end",
  },
  headerContactLine: {
    fontSize: 8.5,
    color: "#cbd5e1",
    marginBottom: 2,
  },
  headerContactLink: {
    fontSize: 8.5,
    color: "#7dd3fc",
    textDecoration: "none",
    marginBottom: 2,
  },

  /* Body */
  body: {
    flexDirection: "row",
    flex: 1,
  },

  /* Sidebar */
  sidebar: {
    width: "34%",
    backgroundColor: C.bg,
    borderRightWidth: 1,
    borderRightColor: C.border,
    padding: "18 14",
  },

  /* Main */
  main: {
    flex: 1,
    padding: "18 20",
  },

  /* Section label */
  sectionLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: C.blueText,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    borderBottomWidth: 1.5,
    borderBottomColor: "#dbeafe",
    paddingBottom: 3,
    marginBottom: 8,
    marginTop: 14,
  },
  sectionLabelFirst: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: C.blueText,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    borderBottomWidth: 1.5,
    borderBottomColor: "#dbeafe",
    paddingBottom: 3,
    marginBottom: 8,
    marginTop: 0,
  },

  /* Profile */
  profileText: {
    fontSize: 8.5,
    color: C.muted,
    lineHeight: 1.6,
  },

  /* Skill */
  skillGroupTitle: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: C.text,
    marginBottom: 5,
    marginTop: 10,
  },
  skillGroupTitleFirst: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: C.text,
    marginBottom: 5,
    marginTop: 0,
  },
  skillRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 3.5,
  },
  skillDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.blue,
    marginTop: 2.5,
    marginRight: 5,
  },
  skillText: {
    fontSize: 8,
    color: C.muted,
    flex: 1,
    lineHeight: 1.4,
  },

  /* Tags */
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
  },
  tag: {
    backgroundColor: C.blueSoft,
    color: C.blueText,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  tagDark: {
    backgroundColor: "#0f172a",
    color: "#93c5fd",
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },

  /* Exp */
  expItem: { marginBottom: 14 },
  expHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 2,
  },
  expLeft: { flex: 1 },
  expTitle: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: C.text,
    lineHeight: 1.3,
  },
  expCompany: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.blue,
    marginTop: 1.5,
  },
  expMeta: {
    fontSize: 7.5,
    color: C.mutedLight,
    marginTop: 1,
  },
  expPeriod: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: C.muted,
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 8,
    marginLeft: 8,
    flexShrink: 0,
  },
  expPointRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 3.5,
  },
  expDot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 2,
    backgroundColor: C.accent,
    marginTop: 3,
    marginRight: 5,
    flexShrink: 0,
  },
  expPoint: {
    fontSize: 8,
    color: "#475569",
    flex: 1,
    lineHeight: 1.5,
  },

  /* Cert badge */
  certBox: {
    backgroundColor: "#0f172a",
    borderRadius: 6,
    padding: "10 12",
    marginTop: 6,
  },
  certTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#7dd3fc",
    marginBottom: 3,
  },
  certBody: {
    fontSize: 8,
    color: "#cbd5e1",
    lineHeight: 1.5,
  },

  /* Education */
  eduItem: { marginBottom: 10 },
  eduDegree: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: C.text,
  },
  eduSchool: {
    fontSize: 8,
    color: C.muted,
    marginTop: 1,
  },
  eduYear: {
    fontSize: 7.5,
    color: C.mutedLight,
    marginTop: 1,
  },

  /* Highlight */
  highlightBox: {
    backgroundColor: "#eff6ff",
    borderLeftWidth: 3,
    borderLeftColor: C.blue,
    padding: "8 10",
    borderRadius: 2,
    marginTop: 6,
  },
  highlightTitle: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: C.blueText,
    marginBottom: 3,
  },
  highlightText: {
    fontSize: 7.5,
    color: "#475569",
    lineHeight: 1.6,
  },

  /* Lang */
  langRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  langName: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.text,
  },
  langLevel: {
    fontSize: 8,
    color: C.muted,
  },
});

export function CVNegoce() {
  return (
    <Document title="CV — Ryad Bouderga — Maison de Négoce">
      <Page size="A4" style={s.page}>

        {/* ── HEADER ── */}
        <View style={s.header}>
          <View style={s.headerTop}>
            <View>
              <Text style={s.headerName}>Ryad Bouderga</Text>
              <Text style={s.headerTitle}>Trader Intraday · Order Flow · Futures & Commodities</Text>
              <Text style={s.headerBadge}>STAGE — MAISON DE NÉGOCE / TRADING FIRM</Text>
            </View>
            <View style={s.headerContact}>
              <Text style={s.headerContactLine}>Cergy, France</Text>
              <Text style={s.headerContactLine}>06 01 77 72 35</Text>
              <Link src="mailto:ryad.bouderga78@gmail.com" style={s.headerContactLink}>
                ryad.bouderga78@gmail.com
              </Link>
              <Link src="https://linkedin.com/in/ryad-bouderga" style={s.headerContactLink}>
                linkedin.com/in/ryad-bouderga
              </Link>
            </View>
          </View>
        </View>

        {/* ── BODY ── */}
        <View style={s.body}>

          {/* ── SIDEBAR ── */}
          <View style={s.sidebar}>

            <Text style={s.sectionLabelFirst}>Profil</Text>
            <Text style={s.profileText}>
              Étudiant en Bachelor Finance & Business et trader intraday indépendant spécialisé
              dans les marchés Futures et crypto. Expérience pratique dans l'analyse des flux
              de marché, la gestion du risque et l'utilisation d'outils avancés (Order Flow,
              DOM, Footprint, GEX, Skew, Volatilité).{"\n\n"}
              Je souhaite rejoindre une{" "}
              <Text style={{ fontFamily: "Helvetica-Bold", color: C.text }}>maison de négoce</Text>
              {" "}afin de développer une compréhension professionnelle du trading et des marchés
              de matières premières. Rémunéré ou non rémunéré.
            </Text>

            <Text style={s.sectionLabel}>Compétences</Text>

            <Text style={s.skillGroupTitleFirst}>Order Flow & Microstructure</Text>
            {[
              "Order Flow analysis (ATAS)",
              "DOM — Depth of Market",
              "Footprint Chart & profil de volume",
              "GEX / Skew / Volatilité implicite",
              "Heatmap — lecture de liquidité",
            ].map((item) => (
              <View key={item} style={s.skillRow}>
                <View style={s.skillDot} />
                <Text style={s.skillText}>{item}</Text>
              </View>
            ))}

            <Text style={s.skillGroupTitle}>Analyse & Risque</Text>
            {[
              "Risk management : R/R, sizing, drawdown",
              "Analyse technique & microstructure",
              "Suivi statistique des performances",
              "Journal de trading structuré",
            ].map((item) => (
              <View key={item} style={s.skillRow}>
                <View style={s.skillDot} />
                <Text style={s.skillText}>{item}</Text>
              </View>
            ))}

            <Text style={s.skillGroupTitle}>Excel & Reporting</Text>
            {[
              "Maîtrise Excel : formules avancées, TCD",
              "Dashboards : equity curve, winrate, R/R",
              "Google Sheets — automatisation",
            ].map((item) => (
              <View key={item} style={s.skillRow}>
                <View style={s.skillDot} />
                <Text style={s.skillText}>{item}</Text>
              </View>
            ))}

            {/* Outils */}
            <Text style={s.sectionLabel}>Outils professionnels</Text>
            <View style={s.tagRow}>
              {["ATAS", "GEXstream", "TradingView", "Tradovate", "MT5", "Excel", "Notion"].map((t) => (
                <Text key={t} style={s.tagDark}>{t}</Text>
              ))}
            </View>

            {/* Langues */}
            <Text style={s.sectionLabel}>Langues</Text>
            <View style={s.langRow}>
              <Text style={s.langName}>Français</Text>
              <Text style={s.langLevel}>Natif</Text>
            </View>
            <View style={{ ...s.langRow, borderBottomWidth: 0 }}>
              <Text style={s.langName}>Anglais</Text>
              <Text style={s.langLevel}>B1/B2 — TOEIC</Text>
            </View>
            <Text style={{ fontSize: 7, color: C.mutedLight, marginTop: 3 }}>
              Préparation TOEIC en cours (objectif B2)
            </Text>

            {/* Centres d'intérêt */}
            <Text style={s.sectionLabel}>Centres d'intérêt</Text>
            <View style={s.tagRow}>
              {["Marchés financiers", "Commodities", "Analyse économique", "Technologies"].map((t) => (
                <Text key={t} style={s.tag}>{t}</Text>
              ))}
            </View>

          </View>

          {/* ── MAIN ── */}
          <View style={s.main}>

            <Text style={s.sectionLabelFirst}>Expériences professionnelles</Text>

            {/* Exp 1 — Trading FIRST */}
            <View style={s.expItem}>
              <View style={s.expHeader}>
                <View style={s.expLeft}>
                  <Text style={s.expTitle}>Trader Indépendant — Intraday Futures & Crypto</Text>
                  <Text style={s.expCompany}>Comptes financés — Apex Trader Funding</Text>
                  <Text style={s.expMeta}>MNQ · ES · NQ · BTC · ETH · Commodities · À distance</Text>
                </View>
                <Text style={s.expPeriod}>2024 – Présent</Text>
              </View>
              {[
                "Trading en réel sur comptes financés jusqu'à 50K$ — 6 challenges Apex Trader Funding réussis",
                "Analyse des flux de marché et lecture de la liquidité via Order Flow, DOM, Footprint Chart",
                "Maîtrise des outils professionnels : ATAS, GEXstream, GEX, Skew, Volatilité implicite",
                "Gestion du risque disciplinée : R/R, sizing, contrôle strict du drawdown",
                "Suivi de performance via dashboards Excel : winrate, equity curve, analyse hebdomadaire",
              ].map((p) => (
                <View key={p} style={s.expPointRow}>
                  <View style={s.expDot} />
                  <Text style={s.expPoint}>{p}</Text>
                </View>
              ))}
            </View>

            {/* Exp 2 — Admin */}
            <View style={s.expItem}>
              <View style={s.expHeader}>
                <View style={s.expLeft}>
                  <Text style={s.expTitle}>Assistant Administratif & Finance</Text>
                  <Text style={s.expCompany}>SC Formation / L3M / Green Cottage</Text>
                  <Text style={s.expMeta}>Cergy, France · Hybride</Text>
                </View>
                <Text style={s.expPeriod}>2023 – 2025</Text>
              </View>
              {[
                "Organisation et gestion de documents financiers et fiscaux",
                "Suivi et mise à jour de données financières sur Excel — tableaux de reporting",
                "Gestion administrative et suivi de facturation",
              ].map((p) => (
                <View key={p} style={s.expPointRow}>
                  <View style={s.expDot} />
                  <Text style={s.expPoint}>{p}</Text>
                </View>
              ))}
            </View>

            {/* Certification */}
            <Text style={s.sectionLabel}>Certification & Track Record</Text>
            <View style={s.certBox}>
              <Text style={s.certTitle}>Apex Trader Funding — 6 challenges réussis</Text>
              <Text style={s.certBody}>
                Réussite de 6 challenges de trading en conditions réelles sur comptes financés
                jusqu'à 50K$. Validation de la discipline, de la gestion du risque et de la
                régularité des performances en environnement professionnel simulé.
              </Text>
            </View>

            {/* Formation */}
            <Text style={s.sectionLabel}>Formation</Text>
            <View style={s.eduItem}>
              <Text style={s.eduDegree}>Bachelor Finance & Business — B1</Text>
              <Text style={s.eduSchool}>Financia Business School, Paris</Text>
              <Text style={s.eduYear}>2024 – Présent</Text>
            </View>
            <View style={s.eduItem}>
              <Text style={s.eduDegree}>Enseignement secondaire</Text>
              <Text style={s.eduSchool}>CNED — Formation à distance</Text>
            </View>
            <View style={s.eduItem}>
              <Text style={s.eduDegree}>Préparation TOEIC — Objectif B2</Text>
              <Text style={s.eduSchool}>Niveau actuel B1 · En progression</Text>
            </View>

            {/* Mots-clés */}
            <Text style={s.sectionLabel}>Mots-clés</Text>
            <View style={s.tagRow}>
              {[
                "Order Flow", "Market Microstructure", "Risk Management",
                "Futures Trading", "Commodities", "GEX / Skew",
                "Volatility Analysis", "Excel Modeling", "Intraday Trading",
                "Funded Accounts", "Performance Tracking",
              ].map((t) => (
                <Text key={t} style={s.tag}>{t}</Text>
              ))}
            </View>

            {/* Valeur ajoutée */}
            <View style={s.highlightBox}>
              <Text style={s.highlightTitle}>Pourquoi une maison de négoce ?</Text>
              <Text style={s.highlightText}>
                Ma pratique intensive du trading intraday sur Futures et crypto m'a formé
                à la lecture des marchés en temps réel, à la gestion du risque et à
                l'utilisation d'outils professionnels de flux d'ordres. Je souhaite appliquer
                ces compétences dans un environnement structuré et apprendre les dynamiques
                des commodities avec une équipe professionnelle.
              </Text>
            </View>

          </View>
        </View>
      </Page>
    </Document>
  );
}
