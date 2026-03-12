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
  navyLight: "#0f2240",
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
  greenBg:   "#f0fdf4",
  greenText: "#166534",
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
    fontFamily: "Helvetica",
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
  },

  /* Body */
  body: {
    flexDirection: "row",
    flex: 1,
  },

  /* Left sidebar */
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

  /* Section */
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

  /* Skill group */
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

  /* Tag pills */
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

  /* Experience */
  expItem: {
    marginBottom: 14,
  },
  expHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 2,
  },
  expLeft: {
    flex: 1,
  },
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

  /* Education */
  eduItem: {
    marginBottom: 10,
  },
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

  /* Highlight box */
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

  /* Language */
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

export function CVPrivateEquity() {
  return (
    <Document title="CV — Ryad Bouderga — Private Equity">
      <Page size="A4" style={s.page}>

        {/* ── HEADER ── */}
        <View style={s.header}>
          <View style={s.headerTop}>
            <View>
              <Text style={s.headerName}>Ryad Bouderga</Text>
              <Text style={s.headerTitle}>Finance · Analyse d'investissement · Évaluation d'entreprises</Text>
              <Text style={s.headerBadge}>STAGE — PRIVATE EQUITY / ANALYSE FINANCIÈRE</Text>
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

            {/* Profil */}
            <Text style={s.sectionLabelFirst}>Profil</Text>
            <Text style={s.profileText}>
              Étudiant en Bachelor Finance & Business à Financia Business School, avec un fort
              intérêt pour l'analyse financière et l'investissement. Rigoureux et analytique,
              je développe des compétences en analyse de performance, modélisation sur Excel
              et compréhension des dynamiques d'entreprise.{"\n\n"}
              Je recherche un stage en <Text style={{ fontFamily: "Helvetica-Bold", color: C.text }}>Private Equity</Text> afin
              d'approfondir mes compétences en analyse d'investissement et évaluation d'entreprises.
              Disponible rémunéré ou non rémunéré.
            </Text>

            {/* Compétences */}
            <Text style={s.sectionLabel}>Compétences</Text>

            <Text style={s.skillGroupTitleFirst}>Analyse financière</Text>
            {[
              "Financial analysis & business valuation",
              "Analyse de bilans et comptes de résultat",
              "Ratios : rentabilité, liquidité, solvabilité",
              "Market research & benchmarking sectoriel",
              "Lecture de rapports annuels",
              "Investment analysis & due diligence",
            ].map((item) => (
              <View key={item} style={s.skillRow}>
                <View style={s.skillDot} />
                <Text style={s.skillText}>{item}</Text>
              </View>
            ))}

            <Text style={s.skillGroupTitle}>Excel & Modélisation</Text>
            {[
              "Maîtrise Excel : formules avancées, TCD",
              "Excel modeling : dashboards financiers",
              "KPIs, equity curve, reporting",
              "Google Sheets — automatisation",
            ].map((item) => (
              <View key={item} style={s.skillRow}>
                <View style={s.skillDot} />
                <Text style={s.skillText}>{item}</Text>
              </View>
            ))}

            <Text style={s.skillGroupTitle}>Marchés & Risque</Text>
            {[
              "Compréhension des marchés financiers",
              "Risk management : R/R, sizing",
              "Suivi de performance statistique",
            ].map((item) => (
              <View key={item} style={s.skillRow}>
                <View style={s.skillDot} />
                <Text style={s.skillText}>{item}</Text>
              </View>
            ))}

            {/* Outils */}
            <Text style={s.sectionLabel}>Outils</Text>
            <View style={s.tagRow}>
              {["Excel", "Google Sheets", "TradingView", "MT5", "Notion"].map((t) => (
                <Text key={t} style={s.tag}>{t}</Text>
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
              {["Finance d'entreprise", "Analyse économique", "Marchés financiers", "Technologies"].map((t) => (
                <Text key={t} style={s.tag}>{t}</Text>
              ))}
            </View>

          </View>

          {/* ── MAIN ── */}
          <View style={s.main}>

            {/* Expériences */}
            <Text style={s.sectionLabelFirst}>Expériences professionnelles</Text>

            {/* Exp 1 */}
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
                "Gestion et organisation de documents fiscaux et administratifs",
                "Mise à jour et suivi de tableaux financiers sur Excel — dashboards de reporting",
                "Participation au suivi de facturation et archivage comptable",
                "Support administratif dans la gestion financière courante des structures",
              ].map((p) => (
                <View key={p} style={s.expPointRow}>
                  <View style={s.expDot} />
                  <Text style={s.expPoint}>{p}</Text>
                </View>
              ))}
            </View>

            {/* Exp 2 */}
            <View style={s.expItem}>
              <View style={s.expHeader}>
                <View style={s.expLeft}>
                  <Text style={s.expTitle}>Trader Indépendant — Marchés financiers</Text>
                  <Text style={s.expCompany}>Comptes financés — Apex Trader Funding</Text>
                  <Text style={s.expMeta}>Intraday · Futures · Crypto · À distance</Text>
                </View>
                <Text style={s.expPeriod}>2024 – Présent</Text>
              </View>
              {[
                "Analyse de données de marché et suivi des performances en conditions réelles (comptes jusqu'à 50K$)",
                "Gestion du risque et analyse statistique des résultats — 6 challenges Apex réussis",
                "Suivi de performance via tableaux Excel : winrate, R/R, equity curve",
              ].map((p) => (
                <View key={p} style={s.expPointRow}>
                  <View style={s.expDot} />
                  <Text style={s.expPoint}>{p}</Text>
                </View>
              ))}
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

            {/* Mots-clés PE */}
            <Text style={s.sectionLabel}>Mots-clés Finance</Text>
            <View style={s.tagRow}>
              {[
                "Financial Analysis", "Excel Modeling", "Business Valuation",
                "Due Diligence", "Market Research", "Risk Management",
                "KPIs & Reporting", "P&L Analysis", "Capital Investissement",
                "Small Cap", "Investment Analysis",
              ].map((t) => (
                <Text key={t} style={s.tag}>{t}</Text>
              ))}
            </View>

            {/* Valeur ajoutée */}
            <View style={s.highlightBox}>
              <Text style={s.highlightTitle}>Pourquoi Private Equity ?</Text>
              <Text style={s.highlightText}>
                L'analyse d'entreprises constitue le cœur de mon intérêt pour la finance.
                Ma pratique du trading m'a formé à la rigueur analytique, la gestion du risque
                et la prise de décision sur données — compétences directement applicables en
                Private Equity, due diligence et financial modeling.
                Cible également : fonds small cap et growth.
              </Text>
            </View>

          </View>
        </View>
      </Page>
    </Document>
  );
}
