'use client';

import { useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TfRow {
  tool: string;
  color: string;
  scalping: TfCell;
  intraday: TfCell;
  swing: TfCell;
  ideal: string;
  why: string;
}

interface TfCell {
  tf: string;
  rating: 1 | 2 | 3; // 1=ok, 2=good, 3=best
  note: string;
}

interface IdeaCard {
  tool: string;
  color: string;
  ideas: string[];
}

/* ------------------------------------------------------------------ */
/*  Data — Timeframe matrix                                            */
/* ------------------------------------------------------------------ */

const TF_ROWS: TfRow[] = [
  {
    tool: 'CVD',
    color: 'var(--accent)',
    scalping: {
      tf: '1s–15s tick chart',
      rating: 3,
      note: 'Le CVD tick-level capture les cascades Hawkes en temps réel. L\'info se dissipe en ~10ms (Jonuzaj) — c\'est le timeframe natif du CVD.',
    },
    intraday: {
      tf: '1min–5min',
      rating: 2,
      note: 'Les divergences CVD/prix sur 5min sont les plus actionables. Le ratio signal/bruit est optimal car les child orders Hawkes (ρ≈0.5) ont le temps de se manifester.',
    },
    swing: {
      tf: '15min–1h',
      rating: 1,
      note: 'Le CVD agrégé perd de la granularité. Utilisez le CVD session cumulé plutôt que le CVD par bougie. Le delta cumulé sur 4h+ montre le biais institutionnel.',
    },
    ideal: '1min–5min (intraday) / Tick (scalp)',
    why: 'L\'OFI est linéairement prédictif à haute fréquence (Cont et al.). Au-delà de 15min, le signal Hawkes est dilué par le mean-reversion naturel du flow (Nutz-Webster-Zhao).',
  },
  {
    tool: 'Volume Profile',
    color: '#a78bfa',
    scalping: {
      tf: '30s–1min bins',
      rating: 1,
      note: 'Trop peu de volume par bin pour former un profil fiable. Utilisez le profil de la session en cours comme overlay plutôt qu\'un profil par bougie.',
    },
    intraday: {
      tf: '5min–30min composites',
      rating: 3,
      note: 'Le profil composite 30min capture le POC/VAH/VAL intraday avec assez de données. Le pattern en U du volume (Harris, Schlie) est visible et exploitable.',
    },
    swing: {
      tf: 'Daily / Weekly composites',
      rating: 2,
      note: 'Le profil weekly identifie les zones de fair value multi-jours. Le POC hebdo = niveau institutionnel clé. Recalibrez le λ mensuellement (Coxon).',
    },
    ideal: '30min composite (intraday) / Daily (swing)',
    why: 'Le volume profile nécessite un échantillon suffisant pour la convergence statistique. Les distributions stationnaires de Markov (Luwang) montrent que 30min est le minimum pour un profil significatif sur les futures.',
  },
  {
    tool: 'Absorption',
    color: '#f59e0b',
    scalping: {
      tf: '5s–30s',
      rating: 3,
      note: 'L\'absorption est un phénomène ultra-court terme. Le decay d\'impact est de 5-15min (propagator). Détectez au tick, agissez sur 30s-1min.',
    },
    intraday: {
      tf: '1min–5min',
      rating: 2,
      note: 'L\'absorption sur 5min confirme les niveaux de support/résistance. Croisez avec le λ intraday : absorption aux heures de fort volume (open/close) = plus fiable.',
    },
    swing: {
      tf: '15min–1h',
      rating: 1,
      note: 'L\'absorption se dilue dans le volume agrégé. Sur 1h, le signal est noyé. Utilisez plutôt le volume profile pour identifier les zones d\'intérêt swing.',
    },
    ideal: '5s–1min (détection) → 5min (confirmation)',
    why: 'Le propagator kernel G(τ) = G₀·e^{-τ/τ₀} avec τ₀ ≈ 5-15min (Coxon, Veldman). L\'absorption doit être détectée dans cette fenêtre sinon le signal est expiré.',
  },
  {
    tool: 'DOM / Depth',
    color: '#06b6d4',
    scalping: {
      tf: 'Tick / 1s refresh',
      rating: 3,
      note: 'Le DOM est natif au tick. La matrice de transition Markov (Luwang) montre que l\'inertie du prix change à chaque transition — le DOM tick est le seul qui capture ça.',
    },
    intraday: {
      tf: '1min snapshots',
      rating: 2,
      note: 'Les snapshots 1min du DOM montrent l\'évolution des murs. Le taux d\'annulation de 60-90% (Prenzel) rend le DOM instantané trompeur — les snapshots moyennés sont plus stables.',
    },
    swing: {
      tf: 'Agrégé / Inutile',
      rating: 1,
      note: 'Le DOM est un outil temps réel. Son contenu informationnel diminue avec le temps (Jonuzaj). Sur 15min+, le DOM n\'a plus de valeur prédictive — utilisez le volume profile.',
    },
    ideal: 'Tick / 1s (lecture temps réel)',
    why: 'Le DOM est le carnet d\'ordres instantané. Son information se dissipe en ~10ms sur actions (Jonuzaj). Il est intrinsèquement un outil de scalping/tape reading.',
  },
  {
    tool: 'Heatmap',
    color: '#ef4444',
    scalping: {
      tf: '1s–5s refresh',
      rating: 2,
      note: 'La heatmap rafraîchie rapidement montre les pulls/adds de liquidité en temps réel. Mais les patterns de spoofing apparaissent/disparaissent trop vite pour être confirmés.',
    },
    intraday: {
      tf: '1min–5min accumulation',
      rating: 3,
      note: 'La heatmap 5min accumule assez de données pour voir les vrais clusters de liquidité. L\'effet Samuelson (Chatziandreou) est visible : densité croissante vers la clôture.',
    },
    swing: {
      tf: '15min–1h composites',
      rating: 2,
      note: 'La heatmap composite montre les zones de liquidité structurelles. Les murs persistants sur plusieurs heures = vrais niveaux institutionnels (pas du spoofing).',
    },
    ideal: '5min accumulation (intraday) / 1s (scalp confirm)',
    why: 'La heatmap est l\'overlay visuel du DOM dans le temps. Le decay du propagator (τ₀ ≈ 5-15min) dicte la fenêtre utile. Sur 5min, les clusters qui persistent sont statistiquement significatifs.',
  },
  {
    tool: 'TWAP / VWAP',
    color: '#10b981',
    scalping: {
      tf: 'Session VWAP',
      rating: 2,
      note: 'Le VWAP de session est un benchmark de scalp. Le prix vs VWAP indique si les acheteurs agressifs ou les vendeurs dominent la session.',
    },
    intraday: {
      tf: 'Session VWAP + developing VWAP',
      rating: 3,
      note: 'Le VWAP en développement est le benchmark institutionnel par excellence (de Witt). Les reclaims/rejets du VWAP sont les signaux les plus fiables intraday.',
    },
    swing: {
      tf: 'Weekly/Monthly VWAP anchored',
      rating: 2,
      note: 'Le VWAP ancré au début de semaine/mois montre le coût moyen des positions récentes. Un prix sous le monthly VWAP = la majorité des positions récentes sont en perte.',
    },
    ideal: 'Session VWAP developing (intraday)',
    why: 'Le VWAP est le benchmark d\'exécution universel (Almgren-Chriss, de Witt). L\'Implementation Shortfall est mesuré vs VWAP/arrival price. Les institutions tradent VERS le VWAP — il attire le prix.',
  },
];

/* ------------------------------------------------------------------ */
/*  Data — Ideas per tool                                              */
/* ------------------------------------------------------------------ */

const IDEAS: IdeaCard[] = [
  {
    tool: 'CVD',
    color: 'var(--accent)',
    ideas: [
      'Filtrer le CVD par taille de lot : CVD "gros lots" (>50 contracts) vs CVD "petits lots" (<5). La divergence entre les deux révèle le flow institutionnel vs retail.',
      'CVD velocity : la dérivée du CVD (vitesse de changement) est plus prédictive que le CVD brut. Un CVD qui accélère = cascade Hawkes en cours, un CVD qui décélère = fin de cascade.',
      'CVD multi-timeframe : comparer le CVD 1min vs CVD 15min. Si les deux divergent du prix = forte conviction. Si seul le 1min diverge = bruit de court terme.',
      'Reset du CVD aux sessions : ne pas accumuler le CVD sur 24h. Le reset à chaque session (Asia, London, NY) donne un signal plus propre car les participants changent.',
      'CVD + options OFI : croiser le CVD futures avec l\'imbalance d\'ordres options. +1σ d\'OFI options = +1% rendement lendemain (Muravyev). Double confirmation.',
      'Alert CVD : déclencher une alerte quand le CVD dévie de >2σ de sa moyenne mobile 30min. Statistiquement, 95% des reversals majeurs sont précédés d\'une divergence CVD >2σ.',
    ],
  },
  {
    tool: 'Volume Profile',
    color: '#a78bfa',
    ideas: [
      'Profil composite "developing" : afficher le profil qui se construit en temps réel pendant la session. Le POC qui migre = le marché cherche un nouveau fair value.',
      'Naked POC scanner : marquer les POC des jours précédents qui n\'ont PAS été retestés. Ce sont des "aimants" statistiques — les prix y reviennent avec une probabilité élevée.',
      'Volume Profile + temps : colorier le profil selon QUAND le volume a été tradé (début vs fin de session). Le volume de clôture a plus de poids (Luwang : clôture = phase distincte).',
      'VAH/VAL comme zones, pas comme lignes : utiliser ±1 tick autour du VAH/VAL. La distribution stationnaire de Markov montre que les prix "oscillent" autour de ces niveaux.',
      'Profil de volume par jour de la semaine : certains patterns de volume sont récurrents (vendredi = positioning, lundi = gap fill). Facteur de commonality (Cucuringu).',
      'Delta Profile : au lieu du volume total, afficher le delta (buy-sell) par niveau de prix. Les niveaux à delta extrême = zones d\'agression unidirectionnelle passée.',
    ],
  },
  {
    tool: 'Absorption',
    color: '#f59e0b',
    ideas: [
      'Score d\'absorption en temps réel : ratio (volume échangé sur le niveau) / (mouvement de prix). Un ratio >5x la normale = absorption active. Basé sur la square-root law (δ≈0.5).',
      'Absorption timer : une fois détectée, afficher un countdown basé sur le decay du propagator (τ₀ ≈ 10min). L\'absorption perd sa pertinence après τ₀ — trade avant ou passe.',
      'Absorption vs exhaustion : différencier absorption (passifs qui achètent) d\'exhaustion (agressifs qui s\'épuisent). Clé : l\'absorption a un CVD qui diverge, l\'exhaustion a un CVD qui s\'aplatit.',
      'Heatmap d\'absorption : superposer un layer "absorption zones" sur la heatmap standard. Colorer en doré les niveaux où le ratio volume/mouvement est >3σ au-dessus de la moyenne.',
      'Absorption multi-niveaux : une absorption sur 1 niveau = faible. Sur 3+ niveaux consécutifs = forte (institution avec un range de prix cible). Correspond au TWAP iceberg.',
      'Absorption + spread : monitorer le spread pendant l\'absorption. Spread stable + absorption = market maker confiant. Spread qui s\'élargit + absorption = flow toxique (Doshi et al.).',
    ],
  },
  {
    tool: 'DOM / Depth',
    color: '#06b6d4',
    ideas: [
      'DOM imbalance ratio glissant : (bid depth - ask depth) / (bid depth + ask depth) sur les 5 meilleurs niveaux. Mettre à jour au tick. Un ratio >0.3 ou <-0.3 = fort déséquilibre.',
      'DOM persistence score : tracker combien de temps un mur reste en place. Les murs qui persistent >2 min sont "vrais" (60-90% des ordres sont annulés en <1min — Prenzel).',
      'DOM velocity : la vitesse à laquelle les ordres sont ajoutés/retirés du DOM. Un DOM "rapide" (haute vitesse de modifications) = market makers nerveux = volatilité imminente.',
      'DOM asymétrie par heure : le côté ask entre en phase Pre-Close AVANT le bid (Luwang). Afficher un indicateur "bid-ask temporal asymmetry" qui alerte sur ce phénomène.',
      'DOM + trade size filter : les ordres <5 lots dans le DOM sont du bruit HFT. Filtrer pour ne montrer que les ordres >20 lots donne un DOM "institutionnel" plus lisible.',
      'Reconstruction d\'iceberg : quand un niveau bid est consommé mais se recharge immédiatement au même prix = probable iceberg order. Compter les "reloads" comme indicateur de taille cachée.',
    ],
  },
  {
    tool: 'Heatmap',
    color: '#ef4444',
    ideas: [
      'Heatmap "delta" : au lieu de montrer le volume total par cellule (prix × temps), montrer le delta (bid-ask). Les zones rouges = sellers dominent, vertes = buyers dominent.',
      'Liquidity flow arrows : ajouter des flèches directionnelles sur la heatmap montrant la migration des murs de liquidité. Si les murs ask descendent = pression vendeuse progressive.',
      'Heatmap decay overlay : superposer le kernel de decay exponentiel G(τ) sur la heatmap. Les zones récentes pèsent plus que les zones anciennes — weighted heatmap temporelle.',
      'Heatmap + VWAP line : tracer le VWAP de session sur la heatmap. Les clusters de liquidité AUTOUR du VWAP = fair value confirmé. Les clusters LOIN du VWAP = target prices.',
      'Alert "wall pull" : déclencher une alerte quand un mur de >500 lots disparaît en <500ms. C\'est un signal de spoofing/repositionnement avec une fenêtre d\'action de ~5-10 min.',
      'Heatmap "memory" mode : permettre de voir les murs qui ÉTAIENT là mais ont été retirés (ghost liquidity). Les niveaux fréquemment "ghosted" = niveaux de spoofing récurrents.',
    ],
  },
  {
    tool: 'TWAP / VWAP',
    color: '#10b981',
    ideas: [
      'VWAP bands : tracer les bandes ±1σ et ±2σ autour du VWAP. Prix à ±2σ = extrême statistique, haute probabilité de mean-reversion vers le VWAP.',
      'TWAP detector : scanner le tape pour des patterns d\'exécution réguliers (volume constant toutes les X secondes). Les TWAP sont détectables par FFT (Chen-Horst-Tran).',
      'VWAP slope : la pente du VWAP indique le biais institutionnel. VWAP qui monte = les achats sont pondérés vers les prix hauts. VWAP plat = distribution neutre.',
      'VWAP de session multiple : afficher les VWAP Asia, London, NY simultanément. La convergence de 2+ VWAP = niveau ultra-fort. La divergence = regime change.',
      'VWAP reclaim/reject counter : compter le nombre de fois que le prix croise le VWAP dans la session. <3 croisements = trend fort. >8 croisements = range/chop.',
      'Implementation Shortfall tracker : calculer en temps réel votre IS vs le VWAP. Montrer si votre exécution est meilleure ou pire que le benchmark institutionnel.',
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Rating display                                                     */
/* ------------------------------------------------------------------ */

const RATING_LABELS = ['', '○ Utilisable', '◉ Bon', '★ Optimal'] as const;
const RATING_COLORS = ['', 'var(--text-tertiary)', '#a78bfa', '#22c55e'] as const;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function TimeframeMatrix() {
  const [expandedIdea, setExpandedIdea] = useState<string | null>(null);

  return (
    <>
      {/* ── Timeframe Matrix ── */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Timeframe Idéal par Outil & Confluence
          </h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Basé sur les propriétés statistiques de chaque outil (decay Hawkes, convergence Markov, propagator kernel, etc.)
          </p>
        </div>

        <div className="space-y-4">
          {TF_ROWS.map((row) => (
            <div
              key={row.tool}
              className="overflow-hidden rounded-xl border"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              {/* Tool header */}
              <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: row.color }} />
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{row.tool}</span>
                </div>
                <span className="rounded px-2 py-0.5 text-[10px] font-bold" style={{ background: `${row.color}22`, color: row.color }}>
                  IDÉAL : {row.ideal}
                </span>
              </div>

              {/* 3 columns: scalping / intraday / swing */}
              <div className="grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0" style={{ borderColor: 'var(--border)' }}>
                {(['scalping', 'intraday', 'swing'] as const).map((style) => {
                  const cell = row[style];
                  return (
                    <div key={style} className="px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
                          {style}
                        </span>
                        <span className="text-[10px] font-bold" style={{ color: RATING_COLORS[cell.rating] }}>
                          {RATING_LABELS[cell.rating]}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-xs font-semibold" style={{ color: row.color }}>
                        {cell.tf}
                      </p>
                      <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        {cell.note}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Why */}
              <div className="border-t px-5 py-3" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                  <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>Pourquoi : </span>
                  {row.why}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Ideas per tool ── */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Idées d&apos;Implémentation par Outil
          </h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            36 idées concrètes extraites des papers pour améliorer chaque outil de ta plateforme.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {IDEAS.map((card) => {
            const isOpen = expandedIdea === card.tool;
            return (
              <div
                key={card.tool}
                className="overflow-hidden rounded-xl border transition-all"
                style={{
                  borderColor: isOpen ? card.color : 'var(--border)',
                  background: 'var(--surface)',
                }}
              >
                <button
                  onClick={() => setExpandedIdea(isOpen ? null : card.tool)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: card.color }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {card.tool}
                    </span>
                    <span className="rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ background: 'var(--border)', color: 'var(--text-tertiary)' }}>
                      {card.ideas.length} idées
                    </span>
                  </div>
                  <svg
                    width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{ color: 'var(--text-tertiary)', transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {isOpen && (
                  <div className="space-y-2 border-t px-4 pb-4 pt-3" style={{ borderColor: 'var(--border)' }}>
                    {card.ideas.map((idea, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold" style={{ background: `${card.color}22`, color: card.color }}>
                          {i + 1}
                        </span>
                        <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          {idea}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
