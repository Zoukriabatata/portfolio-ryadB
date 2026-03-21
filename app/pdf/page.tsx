import type { Metadata } from 'next';
import AtasChartExamples from '@/components/pdf/AtasChartExamples';
import FootprintScenarios from '@/components/pdf/FootprintScenarios';
import ResearchPaywall from '@/components/pdf/ResearchPaywall';
import TimeframeMatrix from '@/components/pdf/TimeframeMatrix';

export const metadata: Metadata = {
  title: 'Research Library',
  description:
    'Academic research synthesis on order flow, CVD, volume profile, absorption, DOM and heatmap — applied to trading.',
};

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Finding {
  title: string;
  body: string;
}

interface PaperCard {
  id: string;
  tag: string;
  tagColor: string;
  title: string;
  authors: string;
  year: string;
  oneLiner: string;
  findings: Finding[];
}

interface ToolSection {
  tool: string;
  icon: string;
  color: string;
  intro: string;
  insights: string[];
}

/* ------------------------------------------------------------------ */
/*  Data – Tool-specific insights extracted from all 17 papers         */
/* ------------------------------------------------------------------ */

const TOOL_SECTIONS: ToolSection[] = [
  {
    tool: 'CVD — Cumulative Volume Delta',
    icon: 'M3 17l6-6 4 4 8-8',
    color: 'var(--accent)',
    intro:
      'Le CVD mesure la pression nette achat/vente cumulée. La littérature confirme que l\'Order Flow Imbalance (OFI) — la base mathématique du CVD — est le prédicteur le plus puissant des mouvements de prix à court terme.',
    insights: [
      'L\'OFI prédit linéairement les variations de prix à haute fréquence avec un R² significatif (Cont et al., confirmé par Coxon, Veldman, Prenzel). Le CVD est donc un proxy direct de la pression informationnelle.',
      'Les flux d\'ordres buy/sell exhibent un "self-excitement" (processus de Hawkes) : un gros achat déclenche des achats enfants. Cela signifie qu\'une divergence CVD/prix n\'est PAS du bruit — c\'est un signal de cascade en formation (Tiwari, Chen-Horst-Tran, Anantha-Jain).',
      'L\'excitation croisée buy↔sell est asymétrique : les ventes agressives déclenchent plus de réactions que les achats. Surveillez les divergences CVD baissières plus attentivement (Anantha-Jain, Hawkes bivarié).',
      'L\'information du CVD se dissipe en ~10 millisecondes sur les actions NASDAQ (Jonuzaj et al.). Pour les futures crypto, la fenêtre est plus large mais toujours courte — agir vite est crucial.',
      'Le CVD par taille de trade révèle les acteurs : les hedge funds prennent des positions 3-4x plus grosses que le retail sur les surprises macro. Un spike CVD sur gros lots = flow institutionnel (Wang 2025).',
      'Le flow martingale (CVD plat) = absence de biais directionnel. Seul le flow martingale se dénoue de façon myope. Tout autocorrélation dans le CVD implique un ajustement optimal de la stratégie (Nutz-Webster-Zhao).',
    ],
  },
  {
    tool: 'Volume Profile',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6m6 0h6m-6 0V9a2 2 0 012-2h2a2 2 0 012 2v10m6-4v4m0 0h-6',
    color: '#a78bfa',
    intro:
      'Le Volume Profile identifie les niveaux de prix où le volume a été échangé. La recherche montre que les patterns de volume intraday sont hautement prévisibles et que la liquidité varie systématiquement au cours de la journée.',
    insights: [
      'Le volume intraday suit un pattern en U persistant : élevé à l\'ouverture, creux en milieu de journée, remontée vers la clôture. Ce pattern est stable cross-sectoriel et exploitable pour timer les entrées (Harris, Schlie, Luwang et al.).',
      'Le ML (XGBoost, LSTM) prédit le volume intraday avec une précision 30-50% supérieure aux modèles classiques. La "commonality" (facteur commun de volume entre stocks) améliore encore les prédictions (Cucuringu-Li-Zhang).',
      'Le coefficient d\'impact λ varie intraday : il est plus élevé en milieu de journée (moins de liquidité) et plus bas à l\'ouverture/clôture. Trader dans les zones de fort volume réduit le slippage de 20-80% vs TWAP (Coxon, Veldman).',
      'Les niveaux de prix à fort volume agissent comme des "attracteurs" : les prix stationnaires du profil (POC, VAH, VAL) correspondent aux distributions stationnaires des chaînes de Markov des prix limites — les prix y reviennent avec le temps de récurrence le plus court (Luwang et al.).',
      'Pour les futures crypto : le volume profile doit être recalibré fréquemment. Le coefficient d\'impact change significativement pendant les crises (COVID crash, hausses de taux) — recalibrer mensuellement au minimum (Coxon).',
      'La participation rate optimale suit le profil de volume : trader proportionnellement au volume attendu (VWAP) est sous-optimal. L\'exécution optimale front-load ou back-load selon la concavité de l\'impact (Veldman, de Witt).',
    ],
  },
  {
    tool: 'Absorption (Bid/Ask)',
    icon: 'M12 3v18m-9-9h18',
    color: '#f59e0b',
    intro:
      'L\'absorption se produit quand de gros volumes agressifs sont absorbés par des ordres limites passifs sans que le prix ne bouge. C\'est un signal clé de présence institutionnelle.',
    insights: [
      'L\'absorption est formalisée par l\'impact transient : chaque trade aggressif impacte le prix, mais cet impact décroît exponentiellement (demi-vie ~5-15 min sur futures). Si le prix ne bouge pas malgré du volume = quelqu\'un absorbe (Bouchaud propagator, Coxon, Veldman).',
      'Le ratio d\'auto-excitation ρ = α/(β−α) mesure combien de "child orders" un trade génère. Un ρ élevé + prix stable = absorption massive. Les stocks NASDAQ ont ρ entre 0.3 et 0.7 (Chen-Horst-Tran).',
      'L\'impact concave (square-root law) signifie que doubler le volume ne double pas l\'impact. δ ≈ 0.4-0.7 empiriquement. Quand vous voyez 10x le volume normal avec seulement 2x le mouvement de prix = absorption active (Coxon, Veldman, Almgren).',
      'Le spread bid-ask s\'élargit AVANT l\'absorption : les market makers augmentent leurs spreads quand ils anticipent du flow toxique. Un spread qui s\'élargit + gros volume = set up d\'absorption en cours (Doshi-Pederzoli-Sert, Muravyev).',
      'La "resilience" du LOB (vitesse à laquelle le carnet se recharge après un market order) est le proxy mesurable de l\'absorption. Haute résilience = forte absorption. Le modèle Obizhaeva-Wang formalise ce concept.',
      'Les ordres d\'internalization dans le Central Risk Book (CRB) sont de l\'absorption invisible : les banques nettent les flux opposés en interne avant d\'externaliser. 40-60% du flow peut être internalisé — ce que vous ne voyez pas sur le tape (Nutz-Webster-Zhao).',
    ],
  },
  {
    tool: 'DOM — Depth of Market',
    icon: 'M4 6h16M4 10h16M4 14h16M4 18h16',
    color: '#06b6d4',
    intro:
      'Le DOM (carnet d\'ordres) montre la profondeur des ordres limites à chaque niveau de prix. La recherche révèle des dynamiques complexes de révision des prix et des patterns exploitables.',
    insights: [
      'Les transitions de prix dans le DOM suivent des chaînes de Markov avec 9 états (de "Very Aggressive Sell" à "Very Aggressive Buy"). L\'inertie des prix (auto-transition) est maximale à l\'ouverture et à la clôture, minimale en milieu de journée (Luwang et al.).',
      'Les large-caps ont une inertie de prix 2-3x supérieure aux small-caps dans le DOM. Pour le trading crypto, cela implique que BTC/ETH auront des niveaux DOM plus "sticky" que les altcoins (Luwang et al.).',
      'L\'asymétrie bid/ask est réelle et mesurable : les vendeurs commencent leur repositionnement de fin de journée AVANT les acheteurs (phase "Pre-Close" sur l\'ask vs pas sur le bid). Surveillez le côté ask du DOM en fin de session (Luwang et al.).',
      'Le contenu informationnel du DOM diminue avec le temps : la valeur prédictive des données du carnet d\'ordres a baissé progressivement, probablement à cause de la compétition algo croissante (Jonuzaj-Sancetta-Taranenko).',
      'L\'adverse selection sur le DOM peut être détectée : quand l\'OFI (déséquilibre du flow) augmente d\'un écart-type, le rendement du jour suivant augmente de ~1% sur les options. Le DOM prédit donc aussi les returns futurs (Muravyev).',
      'La volatilité du flow d\'ordres (et non le flow lui-même) est le driver principal des spreads. Une volatilité du flow qui augmente = spreads qui s\'élargissent = moins de liquidité visible dans le DOM (Doshi et al.).',
    ],
  },
  {
    tool: 'Heatmap de Liquidité',
    icon: 'M4 4h16v16H4z',
    color: '#ef4444',
    intro:
      'La heatmap visualise la densité des ordres limites dans le temps et le prix. Les modèles académiques fournissent le cadre théorique pour interpréter ce que vous voyez.',
    insights: [
      'L\'intensité des ordres suit un processus de Hawkes à baseline variable dans le temps : la densité des ordres augmente exponentiellement à l\'approche de la clôture (effet Samuelson). La heatmap "s\'allume" naturellement en fin de session — ne confondez pas avec un signal (Chatziandreou-Karbach).',
      'Les zones denses de la heatmap correspondent aux distributions stationnaires de Markov : les prix "neutres" et "mild" dominent (>70% de la masse stationnaire). Les zones vides (prix agressifs) ont un temps de récurrence 5-10x plus long (Luwang et al.).',
      'Le market impact se propage dans la heatmap avec un kernel exponentiel décroissant : G(τ) = G₀·e^{-τ/τ₀}. Quand un gros trade "troue" la heatmap, la liquidité se reconstitue avec cette dynamique. τ₀ ≈ 5-15 min pour les futures (Bouchaud, Coxon, de Witt).',
      'La concavité de l\'impact (δ ≈ 0.5) signifie que les "murs" de liquidité dans la heatmap ne sont pas linéairement proportionnels à leur capacité d\'absorption. Un mur de 1000 lots n\'absorbe pas 10x un mur de 100 — il absorbe ~3x seulement (square-root law).',
      'Les clusters de liquidité dans la heatmap reflètent le "spoofing naturel" : seuls 1-3% du volume quotidien est réellement visible dans le LOB à un instant t (Bouchaud-Bonart, Coxon). Les murs apparents peuvent disparaître en millisecondes.',
      'Approche ML pour la heatmap : les modèles de deep learning (ConvLSTM, transformers) sur les snapshots LOB prédisent les mouvements de prix à très court terme. L\'architecture CNN de de Witt (2026) atteint 2.13 bps de slippage vs 5.23 bps pour VWAP — la structure spatiale de la heatmap contient de l\'information exploitable.',
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Data – Key papers with applied takeaways                           */
/* ------------------------------------------------------------------ */

const KEY_PAPERS: PaperCard[] = [
  {
    id: 'hawkes-ofi',
    tag: 'CVD / OFI',
    tagColor: 'var(--accent)',
    title: 'Forecasting High Frequency Order Flow Imbalance',
    authors: 'Anantha & Jain (2024)',
    year: '2024',
    oneLiner:
      'Utilise des processus de Hawkes bivariés pour prédire la distribution du déséquilibre buy/sell.',
    findings: [
      {
        title: 'Cross-excitation buy↔sell',
        body: 'Les trades buy passés affectent les trades sell futurs (et vice versa). Le kernel "Sum of Exponentials" donne les meilleures prévisions. Implication : votre CVD capture déjà cette dynamique — les divergences CVD/prix signalent un changement de régime d\'excitation croisée.',
      },
      {
        title: 'OFI en temps réel',
        body: 'L\'OFI peut être mis à jour tick par tick sans algorithme de classification (grâce aux IDs d\'ordres). L\'OFI normalisé = (Sells - Buys) / (Sells + Buys) sur une fenêtre glissante — c\'est exactement votre CVD normalisé.',
      },
    ],
  },
  {
    id: 'lob-markov',
    tag: 'DOM',
    tagColor: '#06b6d4',
    title: 'Intraday Limit Order Price Change Dynamics via Markov Chains',
    authors: 'Luwang, Mukhia et al. (2026)',
    year: '2026',
    oneLiner:
      'Modélise les transitions de prix limites comme chaînes de Markov sur NASDAQ-100.',
    findings: [
      {
        title: '9 états de prix',
        body: 'Les changements de prix limites sont catégorisés de "Very Aggressive Sell" (>-5%) à "Very Aggressive Buy" (>+5%). La distribution stationnaire montre que ~70%+ des révisions sont neutres ou légères. Implication : les niveaux extrêmes dans votre DOM sont rares mais informatifs.',
      },
      {
        title: 'Capitalization gradient',
        body: 'Large-caps : forte inertie, transitions prévisibles. Small-caps : dynamiques, spreads larges. Appliquez cette logique : BTC ≈ large-cap (DOM sticky), altcoins ≈ small-cap (DOM volatile).',
      },
      {
        title: 'Asymétrie bid/ask à la clôture',
        body: 'Le côté ask entre en phase "Pre-Close" AVANT le bid. Les vendeurs repositionnent leurs ordres limites plus tôt que les acheteurs en fin de session.',
      },
    ],
  },
  {
    id: 'propagator',
    tag: 'Heatmap / Absorption',
    tagColor: '#ef4444',
    title: 'Market Impact Modeling & Optimal Execution (Veldman + Coxon)',
    authors: 'Veldman (2024) & Coxon (2023)',
    year: '2023-24',
    oneLiner:
      'Calibrent le modèle de propagateur discret (DPM) sur données réelles de futures et actions.',
    findings: [
      {
        title: 'Impact decay en 2 phases',
        body: 'L\'impact décroît en 2 temps : rapide (secondes) puis lent (minutes). Sur votre heatmap, un "trou" de liquidité se remplit d\'abord vite puis lentement. La demi-vie du decay exponentiel ≈ 5-15 min sur futures.',
      },
      {
        title: 'Intraday λ variable',
        body: 'Le coefficient d\'impact λ varie intraday — plus élevé à midi (illiquide), plus bas open/close. Vos zones denses de heatmap aux heures liquides = meilleure absorption. Économie de coût : 20-80% vs TWAP en exploitant ces patterns.',
      },
      {
        title: 'Square-root law',
        body: 'Impact ∝ √(volume/ADV). Implication directe pour la heatmap : un mur de 1000 lots n\'est pas 10x plus fort qu\'un mur de 100 lots — il est ~3.2x. Les "icebergs" sont donc plus dangereux que les murs visibles.',
      },
    ],
  },
  {
    id: 'volume-ml',
    tag: 'Volume Profile',
    tagColor: '#a78bfa',
    title: 'Forecasting Intraday Volume with Machine Learning',
    authors: 'Cucuringu, Li & Zhang (2025)',
    year: '2025',
    oneLiner:
      'ML models (XGBoost, LSTM) prédisent le volume intraday avec commonality cross-stock.',
    findings: [
      {
        title: 'Commonality factor',
        body: 'Le volume d\'un stock est prévisible en partie grâce au volume des AUTRES stocks (facteur commun). Pour le crypto : le volume de BTC prédit celui des altcoins. Intégrez un "market volume index" dans votre volume profile.',
      },
      {
        title: 'VWAP optimal',
        body: 'Avec des prévisions précises du volume intraday, la stratégie VWAP optimale réduit le slippage significativement. Votre volume profile fournit exactement cette donnée — utilisez-le pour anticiper les zones de forte participation.',
      },
    ],
  },
  {
    id: 'rl-execution',
    tag: 'Execution',
    tagColor: '#10b981',
    title: 'RL Optimal Execution with Transient Impact (MAP-Elites)',
    authors: 'de Witt & Pakkanen (2026)',
    year: '2026',
    oneLiner:
      'PPO-CNN atteint 2.13 bps de slippage vs 5.23 bps VWAP sur $21B de volume.',
    findings: [
      {
        title: 'CNN sur market state',
        body: 'L\'architecture CNN capture la structure spatiale des données de marché (prix, volumes, volatilité, imbalance). L\'état du DOM et de la heatmap contient de l\'information exploitable par deep learning. Implication : votre heatmap n\'est pas juste visuelle — elle encode un avantage quantifiable.',
      },
      {
        title: 'Régimes de marché',
        body: 'Les spécialistes par régime (liquidité × volatilité) améliorent de 8-10% dans leurs niches. Adaptez votre lecture des outils au régime courant : un CVD divergent en basse volatilité ≠ le même signal en haute volatilité.',
      },
    ],
  },
  {
    id: 'flow-info',
    tag: 'CVD / DOM',
    tagColor: 'var(--accent)',
    title: 'Information Content of Book and Trade Order Flow',
    authors: 'Jonuzaj, Sancetta & Taranenko (2024)',
    year: '2024',
    oneLiner:
      'L\'information du trade flow est la plus persistante ; la prédictibilité disparaît en ~10ms.',
    findings: [
      {
        title: 'Trade flow > Book flow',
        body: 'Le flux de trades (tape, CVD) contient plus d\'information persistante que les données du carnet d\'ordres (DOM). Implication : priorisez votre CVD et tape reading sur la lecture pure du DOM pour les décisions directionnelles.',
      },
      {
        title: 'Valeur décroissante du flow',
        body: 'Au fil du temps, la valeur prédictive du flow a diminué (efficience croissante). Combinez plusieurs signaux (CVD + heatmap + volume profile) plutôt que de compter sur un seul.',
      },
    ],
  },
  {
    id: 'options-flow',
    tag: 'Absorption / Options',
    tagColor: '#f59e0b',
    title: 'Order Flow & Expected Option Returns + Risky Intraday Order Flow',
    authors: 'Muravyev (2012) & Doshi, Pederzoli, Sert (2025)',
    year: '2012-25',
    oneLiner:
      'Le déséquilibre du flow d\'ordres prédit les rendements des options ; la volatilité du flow drive les spreads.',
    findings: [
      {
        title: 'Flow → Returns prédictifs',
        body: '+1 σ d\'imbalance = +1% de rendement le jour suivant sur options. L\'absorption visible sur le futures prédit aussi les mouvements options. Cross-market signal : CVD futures + spreads options = combo puissant.',
      },
      {
        title: 'Volatilité du flow > Flow',
        body: 'Ce n\'est pas le niveau du flow mais sa VOLATILITÉ qui drive les spreads. Un CVD erratique (haute vol du flow) = spreads larges = conditions dangereuses. Surveillez la stabilité de votre CVD, pas juste sa direction.',
      },
    ],
  },
  {
    id: 'hawkes-execution',
    tag: 'Execution / CVD',
    tagColor: '#10b981',
    title: 'Optimal Execution under Endogenous & Self-Exciting Order Flow',
    authors: 'Chen-Horst-Tran (2023) & Tiwari (2025)',
    year: '2023-25',
    oneLiner:
      'L\'endogénéité du flow (vos trades déclenchent des réactions) coûte 12-24% de plus qu\'attendu.',
    findings: [
      {
        title: 'Child orders & feedback',
        body: 'Chaque trade génère ρ child orders en moyenne (ρ = 0.3-0.7). Quand vous voyez un spike CVD, une partie est "organique" et une partie est réaction en chaîne. Le flow n\'est jamais 100% informatif — il y a toujours une composante mécanique.',
      },
      {
        title: 'Coût de la détectabilité',
        body: 'Les patterns TWAP/VWAP sont détectables par FFT. Les algos HFT exploitent ces patterns. Un CVD trop "régulier" (constant) = signature d\'exécution algorithmique que les prédateurs ciblent.',
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Data – Practical framework                                         */
/* ------------------------------------------------------------------ */

const FRAMEWORK_STEPS = [
  {
    step: '1',
    label: 'Contexte macro',
    desc: 'Identifiez le régime (vol haute/basse, liquidité) via le volume profile intraday et la volatilité du flow.',
  },
  {
    step: '2',
    label: 'Lecture de la heatmap',
    desc: 'Repérez les clusters de liquidité (murs). Rappelez-vous : seuls 1-3% du volume quotidien est visible. Les murs suivent la square-root law.',
  },
  {
    step: '3',
    label: 'Signal CVD',
    desc: 'Cherchez les divergences CVD/prix. Un CVD montant + prix plat = absorption. Un CVD divergent en basse vol = signal fort (car moins de bruit Hawkes).',
  },
  {
    step: '4',
    label: 'Confirmation DOM',
    desc: 'Vérifiez l\'asymétrie bid/ask. L\'inertie du DOM donne la conviction : forte inertie = continuation probable. Surveillez l\'ask en pré-clôture.',
  },
  {
    step: '5',
    label: 'Timing via Volume Profile',
    desc: 'Exécutez dans les zones de fort volume (open, close) pour minimiser le slippage. Évitez les heures creuses où λ est élevé.',
  },
  {
    step: '6',
    label: 'Gestion du risque',
    desc: 'Surveillez la volatilité du flow (pas juste le CVD). Un flow erratique = conditions dangereuses, réduisez la taille. L\'information se dissipe en <10ms — ne hesitez pas.',
  },
];

/* ------------------------------------------------------------------ */
/*  Reusable sub-components (server components — no 'use client')      */
/* ------------------------------------------------------------------ */

function SvgIcon({ d, color }: { d: string; color: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
      style={{ background: color, color: '#fff', opacity: 0.9 }}
    >
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function PdfResearchPage() {
  /* ── Preview content (visible to everyone) ── */
  const previewContent = (
    <div className="space-y-16">
      <header className="space-y-4">
        <h1
          className="text-3xl font-bold tracking-tight sm:text-4xl"
          style={{ color: 'var(--text-primary)' }}
        >
          Research Library
        </h1>
        <p
          className="max-w-3xl text-base leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
        >
          Synthèse de <strong>17 publications académiques</strong> (2012–2026)
          sur l&apos;order flow, la microstructure des marchés et l&apos;exécution optimale
          — filtrées et appliquées à tes 5 outils :{' '}
          <strong>CVD, Volume Profile, Absorption, DOM, Heatmap</strong>.
        </p>
        <p
          className="text-sm italic"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Sources : Tiwari (2025), Chen-Horst-Tran (2023), Nutz-Webster-Zhao
          (2025), Anantha-Jain (2024), Chatziandreou-Karbach (2025),
          Wang (2025), Cucuringu-Li-Zhang (2025), Luwang et al. (2026),
          de Witt-Pakkanen (2026), Coxon (2023), Schlie (2025), Ayyar (2025),
          Veldman (2024), Prenzel (2023), Muravyev (2012), Jonuzaj et al.
          (2024), Doshi-Pederzoli-Sert (2025).
        </p>
      </header>

      {/* ── Chiffres clés (teaser visible) ── */}
      <section className="space-y-6">
        <h2
          className="text-2xl font-bold tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          Chiffres clés à retenir
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { stat: '17', label: 'Papers académiques analysés', src: '2012–2026' },
            { stat: '5', label: 'Outils couverts en détail', src: 'CVD, VP, Absorption, DOM, Heatmap' },
            { stat: '36', label: 'Idées d\'implémentation', src: '6 par outil' },
            { stat: '5', label: 'Schémas ATAS avec Entry/Target/Stop', src: 'MNQ 300T' },
          ].map((item, i) => (
            <div
              key={i}
              className="rounded-xl border px-5 py-4 text-center"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              <p className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>{item.stat}</p>
              <p className="mt-1 text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>{item.label}</p>
              <p className="mt-1 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{item.src}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  /* ── Gated content (behind paywall) ── */
  const gatedContent = (
    <div className="space-y-16">
      {/* ── Tool-by-tool insights ── */}
      <section className="space-y-10">
        <h2
          className="text-2xl font-bold tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          Insights par outil
        </h2>

        {TOOL_SECTIONS.map((ts) => (
          <div
            key={ts.tool}
            className="overflow-hidden rounded-xl border"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--surface)',
            }}
          >
            {/* card header */}
            <div
              className="flex items-center gap-3 border-b px-5 py-4"
              style={{ borderColor: 'var(--border)' }}
            >
              <SvgIcon d={ts.icon} color={ts.color} />
              <h3
                className="text-lg font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                {ts.tool}
              </h3>
            </div>

            <div className="space-y-4 px-5 py-5">
              <p
                className="text-sm leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                {ts.intro}
              </p>
              <ul className="space-y-3">
                {ts.insights.map((ins, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <span
                      className="mt-1.5 block h-1.5 w-1.5 flex-shrink-0 rounded-full"
                      style={{ background: ts.color }}
                    />
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {ins}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </section>

      {/* ── Key papers with applied findings ────────────── */}
      <section className="space-y-8">
        <h2
          className="text-2xl font-bold tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          Papers clés — Findings appliqués
        </h2>

        <div className="grid gap-6 md:grid-cols-2">
          {KEY_PAPERS.map((p) => (
            <article
              key={p.id}
              className="flex flex-col overflow-hidden rounded-xl border"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--surface)',
              }}
            >
              <div className="space-y-2 px-5 pt-5">
                <Badge label={p.tag} color={p.tagColor} />
                <h3
                  className="text-[15px] font-semibold leading-snug"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {p.title}
                </h3>
                <p
                  className="text-xs"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {p.authors}
                </p>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {p.oneLiner}
                </p>
              </div>

              <div className="mt-auto space-y-3 px-5 pb-5 pt-4">
                {p.findings.map((f, i) => (
                  <div
                    key={i}
                    className="rounded-lg border px-4 py-3"
                    style={{
                      borderColor: 'var(--border)',
                      background: 'var(--bg)',
                    }}
                  >
                    <p
                      className="text-xs font-semibold uppercase tracking-wider"
                      style={{ color: p.tagColor }}
                    >
                      {f.title}
                    </p>
                    <p
                      className="mt-1 text-[13px] leading-relaxed"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {f.body}
                    </p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ── ATAS-style Chart Examples ─────────────────── */}
      <AtasChartExamples />

      {/* ── Footprint Scenarios ──────────────────────── */}
      <FootprintScenarios />

      {/* ── Timeframe Matrix + Ideas ─────────────────── */}
      <TimeframeMatrix />

      {/* ── Practical framework ────────────────────────── */}
      <section className="space-y-6">
        <h2
          className="text-2xl font-bold tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          Framework pratique — Comment combiner les 5 outils
        </h2>
        <p
          className="max-w-3xl text-sm"
          style={{ color: 'var(--text-secondary)' }}
        >
          Basé sur les findings des 17 papers, voici un workflow séquentiel
          pour utiliser CVD + Volume Profile + Absorption + DOM + Heatmap
          ensemble.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FRAMEWORK_STEPS.map((fs) => (
            <div
              key={fs.step}
              className="rounded-xl border px-5 py-4"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--surface)',
              }}
            >
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
                  style={{
                    background: 'var(--accent)',
                    color: '#fff',
                  }}
                >
                  {fs.step}
                </span>
                <span
                  className="text-sm font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {fs.label}
                </span>
              </div>
              <p
                className="text-[13px] leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                {fs.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Formulas reference ─────────────────────────── */}
      <section className="space-y-6">
        <h2
          className="text-2xl font-bold tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          Formules essentielles
        </h2>

        <div className="space-y-4">
          {[
            {
              name: 'Order Flow Imbalance (CVD normalisé)',
              formula:
                'OFI(T, h) = (N_sell − N_buy) / (N_sell + N_buy)  sur la fenêtre [T−h, T]',
              source: 'Anantha & Jain (2024)',
            },
            {
              name: 'Intensité Hawkes (self-exciting flow)',
              formula:
                'λ(t) = μ + ∫₀ᵗ α·e^{−β(t−s)} dN(s)   avec ρ = α/(β−α)',
              source: 'Chen-Horst-Tran, Tiwari',
            },
            {
              name: 'Transient Impact (propagator)',
              formula:
                'I(t) = Σ G₀·e^{−τ/τ₀} · σ·√(q/V) · ε(t−τ)',
              source: 'Bouchaud, de Witt, Coxon',
            },
            {
              name: 'Square-root law (impact instantané)',
              formula: 'ΔP = σ · (Q/V)^δ   avec δ ≈ 0.4–0.7',
              source: 'Almgren, Coxon, Veldman',
            },
            {
              name: 'Implementation Shortfall',
              formula:
                'IS = side · (Σ pᵢ·|qᵢ|/Q₀ − p₀)  = VWAP exécuté − prix d\'arrivée',
              source: 'Perold, de Witt',
            },
            {
              name: 'Probabilité de transition DOM (Markov)',
              formula:
                'P(X_{n+1} = Sⱼ | Xₙ = Sᵢ) = pᵢⱼ   avec Σⱼ pᵢⱼ = 1',
              source: 'Luwang et al.',
            },
          ].map((f) => (
            <div
              key={f.name}
              className="rounded-lg border px-5 py-4"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--surface)',
              }}
            >
              <div className="flex items-baseline justify-between gap-4">
                <p
                  className="text-sm font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {f.name}
                </p>
                <span
                  className="flex-shrink-0 text-[10px]"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {f.source}
                </span>
              </div>
              <p
                className="mt-2 font-mono text-sm"
                style={{ color: 'var(--accent)' }}
              >
                {f.formula}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────── */}
      <footer
        className="border-t pt-8 text-center text-xs"
        style={{
          borderColor: 'var(--border)',
          color: 'var(--text-tertiary)',
        }}
      >
        17 papers analysés — Dernière mise à jour : Mars 2026
      </footer>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <ResearchPaywall preview={previewContent}>
        {gatedContent}
      </ResearchPaywall>
    </div>
  );
}
