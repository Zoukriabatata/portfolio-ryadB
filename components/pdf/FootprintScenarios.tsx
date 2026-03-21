'use client';

import { useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface FootprintRow {
  price: string;
  bidVol: number;
  askVol: number;
  delta: number;
  highlight?: 'absorption' | 'imbalance' | 'poc' | 'entry' | 'target' | 'stop';
}

interface Scenario {
  id: string;
  name: string;
  type: 'long' | 'short';
  timeframe: string;
  confluence: string[];
  description: string;
  setup: string;
  entry: string;
  target: string;
  stop: string;
  rows: FootprintRow[];
  annotations: string[];
  sources: SourceRef[];
}

interface SourceRef {
  paper: string;
  page: string;
  figure?: string;
  insight: string;
}

/* ------------------------------------------------------------------ */
/*  Scenario data                                                      */
/* ------------------------------------------------------------------ */

const SCENARIOS: Scenario[] = [
  {
    id: 'absorption-long',
    name: 'Absorption Long — Bid Absorption at Support',
    type: 'long',
    timeframe: '5min footprint + 1min DOM',
    confluence: ['Absorption', 'CVD', 'Volume Profile', 'Heatmap'],
    description:
      'Gros volume vendeur absorbé par des ordres limites passifs au bid. Le prix ne descend pas malgré la pression. Le CVD diverge (descend puis se stabilise). La heatmap montre un mur bid qui tient.',
    setup:
      'Le prix touche un niveau de fort volume (POC ou VAL du profil). La heatmap montre une zone dense au bid. Le CVD cesse de baisser malgré des market sells agressifs.',
    entry: 'Quand le delta footprint passe positif sur la bougie APRÈS l\'absorption (confirmation). Entrée au-dessus du high de la bougie d\'absorption.',
    target: 'POC de la session ou VAH du profil (premier niveau de résistance volume). Typiquement 1:2 ou 1:3 R:R.',
    stop: 'Sous le low de la zone d\'absorption (là où les passifs tenaient). Si le mur cède, le setup est invalidé.',
    rows: [
      { price: '45,250', bidVol: 120, askVol: 340, delta: -220, highlight: 'target' },
      { price: '45,245', bidVol: 180, askVol: 280, delta: -100 },
      { price: '45,240', bidVol: 250, askVol: 310, delta: -60 },
      { price: '45,235', bidVol: 420, askVol: 290, delta: 130, highlight: 'entry' },
      { price: '45,230', bidVol: 890, askVol: 850, delta: 40, highlight: 'poc' },
      { price: '45,225', bidVol: 1240, askVol: 380, delta: 860, highlight: 'absorption' },
      { price: '45,220', bidVol: 1580, askVol: 420, delta: 1160, highlight: 'absorption' },
      { price: '45,215', bidVol: 980, askVol: 350, delta: 630, highlight: 'stop' },
    ],
    annotations: [
      'Les lignes 45,220-45,225 montrent l\'absorption : bid vol >> ask vol malgré la pression vendeuse.',
      'Le delta cumulé sur ces niveaux est fortement positif = les passifs achètent massivement.',
      'Impact concave (√V law) : 1580+1240 = 2820 lots absorbés mais prix bouge de seulement 2 ticks.',
      'Hawkes decay : l\'impact de cette absorption se dissipe en ~10 min — agir dans cette fenêtre.',
    ],
    sources: [
      { paper: 'Coxon (2023)', page: 'Ch.5 p.36-44', figure: 'Fig 5.6', insight: 'Optimal execution avec λ intraday variable — les zones d\'absorption correspondent aux creux de λ (haute liquidité).' },
      { paper: 'Veldman (2024)', page: 'Ch.4 p.27-33', figure: 'Fig 4.2', insight: 'Two-stage impact decay : rapide (secondes) puis lent (minutes). Le "trou" dans la heatmap après absorption se remplit en 2 phases.' },
      { paper: 'Chen-Horst-Tran (2023)', page: 'Section 2, p.4-6', insight: 'Le ratio ρ = 0.3-0.7 signifie que 30-70% du volume visible est des "child orders" déclenchés par l\'absorption — le vrai volume passif est encore plus important.' },
      { paper: 'Nutz-Webster-Zhao (2025)', page: 'Section 3, p.8-12', insight: 'Internalization : 40-60% du flow est netté en interne (CRB). L\'absorption visible sur le tape sous-estime le vrai intérêt institutionnel.' },
    ],
  },
  {
    id: 'imbalance-short',
    name: 'Selling Imbalance Short — Ask Stacking',
    type: 'short',
    timeframe: '3min footprint + 15s DOM',
    confluence: ['CVD', 'DOM', 'Absorption', 'TWAP detection'],
    description:
      'Le footprint montre un déséquilibre massif côté ask (sellers agressifs) tandis que le CVD plonge. Le DOM montre des ordres ask qui se "stackent" (s\'empilent) sans être consommés. La heatmap montre les murs ask qui descendent progressivement.',
    setup:
      'Après un rally, le prix atteint le VAH du profil. Le CVD commence à diverger (prix monte, CVD plat/baisse). Le footprint montre des imbalances sell de 300%+ sur plusieurs niveaux.',
    entry: 'Sous le low de la bougie qui montre 3+ niveaux consécutifs d\'imbalance sell. Confirmation par CVD négatif croissant.',
    target: 'POC de la session en cours. Si momentum fort, étendre au VAL. Le decay d\'impact (τ₀ ≈ 10min) donne le timing.',
    stop: 'Au-dessus du high de la zone d\'imbalance. Invalidation si le CVD repasse positif.',
    rows: [
      { price: '45,280', bidVol: 150, askVol: 120, delta: 30, highlight: 'stop' },
      { price: '45,275', bidVol: 90, askVol: 680, delta: -590, highlight: 'imbalance' },
      { price: '45,270', bidVol: 110, askVol: 720, delta: -610, highlight: 'imbalance' },
      { price: '45,265', bidVol: 80, askVol: 950, delta: -870, highlight: 'imbalance' },
      { price: '45,260', bidVol: 200, askVol: 580, delta: -380, highlight: 'entry' },
      { price: '45,255', bidVol: 350, askVol: 400, delta: -50 },
      { price: '45,250', bidVol: 480, askVol: 380, delta: 100, highlight: 'poc' },
      { price: '45,240', bidVol: 300, askVol: 250, delta: 50, highlight: 'target' },
    ],
    annotations: [
      'Niveaux 45,265-45,275 : ask vol 7-10x le bid vol = imbalance sell massive.',
      'Le delta cumulé est -2070 sur 3 niveaux — pression vendeuse extrême.',
      'Le CVD sur la session montre une divergence : prix au même niveau qu\'il y a 20min mais CVD -3000.',
      'Cross-excitation Hawkes : ces sells agressifs vont déclencher d\'autres sells (ρ ≈ 0.5) — cascade probable.',
    ],
    sources: [
      { paper: 'Anantha & Jain (2024)', page: 'Section 4, p.7-9', insight: 'Le kernel Hawkes bivarié montre que les sells agressifs ont une excitation croisée plus forte que les buys. Les cascades baissières sont statistiquement plus violentes.' },
      { paper: 'Luwang et al. (2026)', page: 'Section 4.3, Table 4', insight: 'États S1-S3 (aggressive sell) : temps de récurrence moyen 15-30 transitions. Quand ça arrive, c\'est rare mais impactful.' },
      { paper: 'Jonuzaj et al. (2024)', page: 'Section 5, p.12-15', insight: 'L\'information du trade flow persiste plus longtemps que celle du book. Le signal d\'imbalance sell du footprint est plus fiable que le DOM seul.' },
      { paper: 'Doshi et al. (2025)', page: 'Section 4, p.18-22', insight: 'La volatilité du flow (pas le flow lui-même) prédit l\'élargissement des spreads. Un spike de sell imbalance = vol du flow élevée = spreads vont s\'élargir.' },
    ],
  },
  {
    id: 'cvd-divergence-long',
    name: 'CVD Divergence Long — Hidden Accumulation',
    type: 'long',
    timeframe: '15min footprint + 5min CVD',
    confluence: ['CVD', 'Volume Profile', 'Heatmap', 'TWAP/VWAP'],
    description:
      'Le prix fait des lower lows mais le CVD fait des higher lows. Quelqu\'un accumule discrètement (probablement via TWAP/iceberg). La heatmap montre que les murs ask sont consommés sans que le prix ne monte — les buys sont absorbés par des sellers qui reculent progressivement.',
    setup:
      'Sur 15min : le prix descend lentement en "staircase" tandis que le CVD reste flat ou monte. Le volume profile montre un POC qui se forme au bas du range. La heatmap montre les murs ask qui se déplacent vers le haut.',
    entry: 'Break du range haut + CVD qui accélère. Confirmation : le footprint 5min montre un flip de delta (négatif → positif). Entrée au retest du breakout.',
    target: 'Extension 1.5x-2x de la hauteur du range d\'accumulation. Le VWAP de la session comme niveau intermédiaire.',
    stop: 'Sous le POC de la zone d\'accumulation. Si le prix retourne sous le POC = l\'accumulation a échoué.',
    rows: [
      { price: '45,200', bidVol: 450, askVol: 380, delta: 70, highlight: 'target' },
      { price: '45,195', bidVol: 520, askVol: 410, delta: 110 },
      { price: '45,190', bidVol: 380, askVol: 350, delta: 30, highlight: 'entry' },
      { price: '45,185', bidVol: 610, askVol: 590, delta: 20 },
      { price: '45,180', bidVol: 780, askVol: 750, delta: 30, highlight: 'poc' },
      { price: '45,175', bidVol: 650, askVol: 680, delta: -30 },
      { price: '45,170', bidVol: 580, askVol: 620, delta: -40 },
      { price: '45,165', bidVol: 520, askVol: 540, delta: -20, highlight: 'stop' },
    ],
    annotations: [
      'Delta quasi-neutre sur chaque niveau (±30) malgré du volume élevé = accumulation TWAP/iceberg.',
      'Le POC se forme en bas (45,180) = "acceptance" du prix — le marché trouve un fair value.',
      'CVD session : +2400 malgré des prix en baisse = divergence bullish classique.',
      'Chen-Horst-Tran : les patterns TWAP sont détectables par FFT. Ce flow "trop régulier" est un institutionnel.',
    ],
    sources: [
      { paper: 'Chen-Horst-Tran (2023)', page: 'Section 1, p.3', insight: 'Les patterns TWAP/VWAP laissent une signature détectable par FFT (blips constants dans le volume). Un CVD qui monte régulièrement sur une descente de prix = TWAP buy.' },
      { paper: 'Cucuringu et al. (2025)', page: 'Section 4, p.12-18', figure: 'Fig 3-5', insight: 'La commonality du volume (facteur cross-stock) aide à distinguer le volume "naturel" du volume d\'exécution algorithmique. Volume anormal sur un seul instrument = probable institutional execution.' },
      { paper: 'de Witt & Pakkanen (2026)', page: 'Section 2.1.2, p.4-5', figure: 'Fig 2', insight: 'Le propagator kernel montre que l\'accumulation TWAP crée un impact transient faible mais permanent cumulatif. La divergence CVD mesure exactement ce permanent impact caché.' },
      { paper: 'Tiwari (2025)', page: 'Section 3, p.8-12', insight: 'Le Hawkes-LQ controller décompose la stratégie en baseline + trend-following + dynamic. Le flow TWAP correspond au "baseline" — les spikes CVD au "dynamic" component.' },
    ],
  },
  {
    id: 'dom-trap-short',
    name: 'DOM Spoofing Trap — Fake Wall Short',
    type: 'short',
    timeframe: '1min footprint + tick DOM',
    confluence: ['DOM', 'Heatmap', 'CVD', 'Absorption'],
    description:
      'Un mur bid massif apparaît dans le DOM/heatmap, attirant les longs. Mais le mur est retiré (spoof) dès que le prix s\'en approche. Le CVD montre que les vrais market buys ne suivent pas. Le footprint montre que l\'activité bid est passive (non agressive).',
    setup:
      'Mur bid de 2000+ lots visible sur 2-3 niveaux. La heatmap s\'allume en vert dense. MAIS : le CVD ne monte pas proportionnellement et les deltas footprint restent faibles/négatifs sur les bougies montantes.',
    entry: 'Quand le mur disparaît (pull) + footprint montre un delta flip négatif. Short au market avec le momentum.',
    target: 'Niveau de volume profile le plus proche en dessous (POC ou VAL). Le decay de l\'impact du pull = fenêtre d\'opportunité de ~5 min.',
    stop: 'Au-dessus du prix où le mur était positionné. Si le mur revient et le CVD confirme = invalidation.',
    rows: [
      { price: '45,270', bidVol: 60, askVol: 180, delta: -120, highlight: 'stop' },
      { price: '45,265', bidVol: 150, askVol: 350, delta: -200, highlight: 'entry' },
      { price: '45,260', bidVol: 280, askVol: 300, delta: -20 },
      { price: '45,255', bidVol: 180, askVol: 220, delta: -40 },
      { price: '45,250', bidVol: 350, askVol: 280, delta: 70, highlight: 'poc' },
      { price: '45,245', bidVol: 200, askVol: 190, delta: 10 },
      { price: '45,240', bidVol: 170, askVol: 150, delta: 20, highlight: 'target' },
    ],
    annotations: [
      'Le mur bid (2000 lots) était visible sur heatmap mais le footprint ne montrait PAS de gros deltas positifs.',
      'Rappel Bouchaud-Bonart : seuls 1-3% du volume quotidien sont dans le LOB. Un mur = 0.1% du daily — il peut disparaître en ms.',
      'Le CVD pendant la "montée" vers le mur était plat = pas de vrais market buys, juste du repositionnement passif.',
      'Après le pull du mur : cascade Hawkes baissière. ρ ≈ 0.5 → chaque sell déclenche 0.5 child sells.',
    ],
    sources: [
      { paper: 'Coxon (2023)', page: 'Ch.1 p.8-9', figure: 'Fig 1.1', insight: 'Le LOB schéma montre que le volume visible est une fraction du volume réel. Les "murs" sont souvent des ordres qui seront retirés avant exécution.' },
      { paper: 'Prenzel (2023)', page: 'Ch.2-3', insight: 'La simulation statistique du LOB montre que les ordres limites ont un taux d\'annulation de 60-90%. La majorité des ordres visibles dans le DOM ne seront JAMAIS exécutés.' },
      { paper: 'Luwang et al. (2026)', page: 'Section 4.1, Tables 5-7', insight: 'La matrice de transition Markov montre que les états "aggressive" ont la plus faible probabilité d\'auto-transition. Un faux mur crée un état artificiel qui ne se maintient pas.' },
      { paper: 'Muravyev (2012)', page: 'Section 3, p.8-12', insight: 'L\'inventory risk des market makers est le driver principal. Quand un market maker spoof, il gère son inventaire — le vrai signal est dans le flow, pas dans le book.' },
    ],
  },
  {
    id: 'vwap-reclaim-long',
    name: 'VWAP Reclaim Long — Institutional Re-entry',
    type: 'long',
    timeframe: '5min footprint + session VWAP',
    confluence: ['TWAP/VWAP', 'Volume Profile', 'CVD', 'Absorption'],
    description:
      'Le prix passe sous le VWAP de session puis le reprend avec du delta positif massif. Les institutions qui avaient accumulé sous le VWAP profitent du breakout. Le volume profile montre un POC au niveau du VWAP = fair value accepté.',
    setup:
      'Prix sous le VWAP depuis 30+ min. Le CVD descend lentement (flow vendeur modéré — pas de panique). Le volume s\'accumule au VWAP (POC qui se forme). La heatmap montre de la liquidité qui se construit au-dessus du VWAP.',
    entry: 'Bougie 5min qui CLOSE au-dessus du VWAP avec un delta >2x la moyenne. Le footprint montre un flip bid/ask (les bids deviennent agressifs).',
    target: 'VAH du profil ou high de session. Le VWAP agit comme support après le reclaim.',
    stop: 'Sous le VWAP - 1 ATR. Un re-rejet du VWAP invalide le setup.',
    rows: [
      { price: '45,260', bidVol: 280, askVol: 200, delta: 80, highlight: 'target' },
      { price: '45,255', bidVol: 520, askVol: 310, delta: 210, highlight: 'entry' },
      { price: '45,250', bidVol: 890, askVol: 720, delta: 170, highlight: 'poc' },
      { price: '45,245', bidVol: 650, askVol: 580, delta: 70 },
      { price: '45,240', bidVol: 480, askVol: 520, delta: -40 },
      { price: '45,235', bidVol: 350, askVol: 410, delta: -60 },
      { price: '45,230', bidVol: 290, askVol: 380, delta: -90, highlight: 'stop' },
    ],
    annotations: [
      'Le POC (890 lots) se forme exactement au VWAP (45,250) = le marché accepte ce prix comme fair value.',
      'Au-dessus du VWAP : bid vol > ask vol (delta positif) = les acheteurs sont agressifs.',
      'En dessous : ask vol > bid vol (delta négatif) = les vendeurs controlaient. Le VWAP est le "pivot" exact.',
      'Veldman : l\'exécution optimale front-loads quand λ est bas (heures liquides). Le reclaim VWAP pendant les heures de volume = signal fort.',
    ],
    sources: [
      { paper: 'Cucuringu et al. (2025)', page: 'Section 5, p.18-22', insight: 'Le VWAP optimisé par ML réduit le slippage significativement. Le VWAP comme niveau de référence est validé par la recherche — c\'est le benchmark d\'exécution institutionnel par excellence.' },
      { paper: 'Veldman (2024)', page: 'Ch.5 p.34-38', insight: 'L\'exécution optimale avec alpha signal (short-term alpha) autour du VWAP. Le reclaim VWAP est un alpha signal que les algos institutionnels intègrent.' },
      { paper: 'de Witt & Pakkanen (2026)', page: 'Section 2.1.1, p.4', insight: 'L\'Implementation Shortfall est mesuré vs le prix d\'arrivée. Le VWAP reclaim aligne votre trade avec la minimisation du IS — vous tradez dans le sens de la réduction du coût.' },
      { paper: 'Schlie (2025)', page: 'Ch.2-3', insight: 'Les patterns intraday de prix montrent que le VWAP est un attracteur statistique significatif. Le prix "mean-reverts" vers le VWAP avec une demi-vie mesurable.' },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const HIGHLIGHT_STYLES: Record<string, { bg: string; label: string; labelColor: string }> = {
  absorption: { bg: 'rgba(34,197,94,0.12)', label: 'ABSORPTION', labelColor: '#22c55e' },
  imbalance: { bg: 'rgba(239,68,68,0.12)', label: 'IMBALANCE', labelColor: '#ef4444' },
  poc: { bg: 'rgba(167,139,250,0.15)', label: 'POC', labelColor: '#a78bfa' },
  entry: { bg: 'rgba(99,102,241,0.15)', label: 'ENTRY', labelColor: 'var(--accent)' },
  target: { bg: 'rgba(16,185,129,0.12)', label: 'TARGET', labelColor: '#10b981' },
  stop: { bg: 'rgba(239,68,68,0.10)', label: 'STOP', labelColor: '#ef4444' },
};

function DeltaBar({ delta, max }: { delta: number; max: number }) {
  const pct = Math.min(Math.abs(delta) / max * 100, 100);
  const color = delta > 0 ? '#22c55e' : '#ef4444';
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color, marginLeft: delta < 0 ? 'auto' : undefined }}
        />
      </div>
      <span className="w-14 text-right font-mono text-xs" style={{ color }}>
        {delta > 0 ? '+' : ''}{delta}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Source Panel (expandable)                                           */
/* ------------------------------------------------------------------ */

function SourcePanel({ sources }: { sources: SourceRef[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="mt-4 rounded-lg border"
      style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
          </svg>
          Sources & Pages ({sources.length} refs)
        </span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className="transition-transform" style={{ transform: open ? 'rotate(180deg)' : undefined }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="space-y-3 border-t px-4 pb-4 pt-3" style={{ borderColor: 'var(--border)' }}>
          {sources.map((s, i) => (
            <div key={i} className="rounded-lg border px-4 py-3" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-400">
                  {s.paper}
                </span>
                <span className="rounded px-2 py-0.5 text-[10px] font-mono" style={{ background: 'var(--border)', color: 'var(--text-secondary)' }}>
                  {s.page}
                </span>
                {s.figure && (
                  <span className="rounded px-2 py-0.5 text-[10px] font-mono" style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>
                    {s.figure}
                  </span>
                )}
              </div>
              <p className="mt-2 text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {s.insight}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function FootprintScenarios() {
  const [activeId, setActiveId] = useState<string>(SCENARIOS[0].id);
  const active = SCENARIOS.find((s) => s.id === activeId) ?? SCENARIOS[0];
  const maxDelta = Math.max(...active.rows.map((r) => Math.abs(r.delta)));

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Footprint Scenarios — Entry / Target / Stop
        </h2>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          5 setups réels avec footprint schématisé, confluences, et sources académiques exactes (paper + page + figure).
        </p>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex flex-wrap gap-2">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveId(s.id)}
            className="rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
            style={{
              borderColor: activeId === s.id ? 'var(--accent)' : 'var(--border)',
              background: activeId === s.id ? 'var(--accent)' : 'var(--surface)',
              color: activeId === s.id ? '#fff' : 'var(--text-secondary)',
            }}
          >
            <span className={`mr-1 inline-block h-2 w-2 rounded-full ${s.type === 'long' ? 'bg-green-500' : 'bg-red-500'}`} />
            {s.name.split('—')[0].trim()}
          </button>
        ))}
      </div>

      {/* ── Active scenario ── */}
      <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        {/* Header */}
        <div className="border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${active.type === 'long' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              {active.type}
            </span>
            <span className="rounded px-2 py-0.5 text-[10px] font-mono" style={{ background: 'var(--border)', color: 'var(--text-secondary)' }}>
              {active.timeframe}
            </span>
            {active.confluence.map((c) => (
              <span key={c} className="rounded px-2 py-0.5 text-[10px]" style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent)' }}>
                {c}
              </span>
            ))}
          </div>
          <h3 className="mt-2 text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            {active.name}
          </h3>
          <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {active.description}
          </p>
        </div>

        <div className="grid gap-0 lg:grid-cols-2">
          {/* Left: Footprint grid */}
          <div className="border-b px-5 py-4 lg:border-b-0 lg:border-r" style={{ borderColor: 'var(--border)' }}>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
              Footprint Schema
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: 'var(--text-tertiary)' }}>
                    <th className="pb-2 text-left font-medium">Price</th>
                    <th className="pb-2 text-right font-medium">Bid Vol</th>
                    <th className="pb-2 text-right font-medium">Ask Vol</th>
                    <th className="pb-2 text-right font-medium">Delta</th>
                    <th className="pb-2 text-left font-medium pl-3">Visual</th>
                    <th className="pb-2 text-right font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {active.rows.map((r, i) => {
                    const hl = r.highlight ? HIGHLIGHT_STYLES[r.highlight] : null;
                    return (
                      <tr key={i} style={{ background: hl?.bg }}>
                        <td className="py-1.5 font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {r.price}
                        </td>
                        <td className="py-1.5 text-right font-mono" style={{ color: '#22c55e' }}>
                          {r.bidVol.toLocaleString()}
                        </td>
                        <td className="py-1.5 text-right font-mono" style={{ color: '#ef4444' }}>
                          {r.askVol.toLocaleString()}
                        </td>
                        <td className="py-1.5 text-right">
                          <DeltaBar delta={r.delta} max={maxDelta} />
                        </td>
                        <td className="py-1.5 pl-3">
                          {hl && (
                            <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: hl.labelColor }}>
                              {hl.label}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Annotations */}
            <div className="mt-4 space-y-2">
              {active.annotations.map((a, i) => (
                <p key={i} className="flex items-start gap-2 text-[11px] leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                  <span className="mt-0.5 text-[10px]" style={{ color: 'var(--accent)' }}>{i + 1}.</span>
                  {a}
                </p>
              ))}
            </div>
          </div>

          {/* Right: Setup / Entry / Target / Stop */}
          <div className="space-y-4 px-5 py-4">
            {[
              { label: 'Setup', text: active.setup, color: 'var(--text-secondary)', icon: '🔍' },
              { label: 'Entry', text: active.entry, color: 'var(--accent)', icon: '→' },
              { label: 'Target', text: active.target, color: '#10b981', icon: '◎' },
              { label: 'Stop', text: active.stop, color: '#ef4444', icon: '✕' },
            ].map((item) => (
              <div key={item.label}>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: item.color }}>
                  <span className="text-[10px]">{item.icon}</span>
                  {item.label}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Source panel */}
        <div className="px-5 pb-5">
          <SourcePanel sources={active.sources} />
        </div>
      </div>
    </section>
  );
}
