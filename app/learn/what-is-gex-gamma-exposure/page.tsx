import type { Metadata } from 'next';
import Link from 'next/link';
import ArticleLayout from '@/components/learn/ArticleLayout';
import { abs, type FaqItem } from '@/lib/seo/structuredData';

const PATH = '/learn/what-is-gex-gamma-exposure';
const TITLE = 'What Is GEX (Gamma Exposure)? A Trader Guide';
const INTRO =
  'GEX — gamma exposure — measures how much option dealers must hedge as price moves. It is the single best read on whether the market will mean-revert or trend, because dealer hedging either dampens or amplifies every move.';
const META =
  'GEX (gamma exposure) explained: positive vs negative gamma, dealer hedging, the zero-gamma flip, and how it tells you to mean-revert or follow momentum.';

export const metadata: Metadata = {
  title: TITLE,
  description: META,
  keywords: ['GEX', 'gamma exposure', 'what is GEX', 'dealer gamma', 'positive gamma', 'negative gamma', 'gamma flip'],
  alternates: { canonical: abs(PATH) },
  openGraph: { title: TITLE, description: META, url: abs(PATH), type: 'article', images: ['/opengraph-image'] },
};

const FAQS: FaqItem[] = [
  {
    question: 'What is GEX (gamma exposure)?',
    answer:
      'GEX measures the total gamma that option dealers (market makers) are exposed to. Because dealers hedge that gamma by trading the underlying, GEX tells you whether their hedging will dampen price moves (positive gamma) or amplify them (negative gamma).',
  },
  {
    question: 'What is the difference between positive and negative gamma?',
    answer:
      'In positive gamma, dealers are long gamma: they buy dips and sell rallies, which compresses volatility and pins price near high-gamma strikes. In negative gamma, dealers are short gamma: they sell dips and buy rallies, which amplifies moves and produces trending, volatile conditions.',
  },
  {
    question: 'How do you use GEX to trade?',
    answer:
      'Use GEX to pick your playbook. In positive gamma, favor mean-reversion and fade extremes toward high-gamma strikes. In negative gamma, favor momentum and be careful fading. Around the zero-gamma flip, expect regime change and elevated volatility.',
  },
];

export default function Page() {
  return (
    <ArticleLayout
      title={TITLE}
      intro={INTRO}
      updated="June 2026"
      datePublished="2026-06-19"
      dateModified="2026-06-19"
      path={PATH}
      breadcrumb={[
        { name: 'Home', path: '/' },
        { name: 'Learn', path: '/learn' },
        { name: 'What is GEX', path: PATH },
      ]}
      faqs={FAQS}
    >
      <p>
        Most indicators describe price. <strong>GEX (gamma exposure)</strong> describes the people
        forced to <em>react</em> to price — the option dealers (market makers) who must hedge their
        books as the underlying moves. Their hedging either <strong>dampens</strong> moves or{' '}
        <strong>amplifies</strong> them, and GEX tells you which regime you are in.
      </p>

      <h2>What GEX actually measures</h2>
      <p>
        Dealers are on the other side of the options retail and institutions buy and sell. That
        leaves them with a net <strong>gamma</strong> position. To stay delta-neutral, they must
        re-hedge as price moves — and the <em>direction</em> of that hedging depends on the sign of
        their gamma. GEX aggregates that exposure across all strikes:
      </p>
      <p>
        <code>GEX ≈ Σ (gamma × open interest × contract size × spot²)</code>
      </p>
      <p>The sign is what matters most.</p>

      <h2>Positive gamma — the market gets pinned</h2>
      <p>When dealers are <strong>long gamma</strong> (positive GEX):</p>
      <ul>
        <li>They <strong>buy dips and sell rallies</strong> to re-hedge.</li>
        <li>That hedging <strong>compresses volatility</strong> — ranges, mean-reversion.</li>
        <li>Price gets &quot;magnetized&quot; toward the highest-gamma strikes.</li>
      </ul>
      <p>
        Practically: in positive gamma you <strong>fade extremes</strong> and expect the market to
        revert toward high-gamma levels rather than break out.
      </p>

      <h2>Negative gamma — moves get amplified</h2>
      <p>When dealers are <strong>short gamma</strong> (negative GEX):</p>
      <ul>
        <li>They <strong>sell dips and buy rallies</strong> (their hedging chases price).</li>
        <li>That <strong>amplifies</strong> moves — trending, high volatility.</li>
        <li>Directional moves can accelerate, and air pockets appear.</li>
      </ul>
      <p>
        Practically: in negative gamma you <strong>follow momentum</strong> and are careful fading,
        because the move can feed on itself.
      </p>

      <h2>The zero-gamma flip</h2>
      <p>
        The price where GEX changes sign is the <strong>zero-gamma (gamma flip) level</strong> —
        the pivot between the stable (positive) and volatile (negative) regimes. Breaking it often
        signals a regime change. Full breakdown in{' '}
        <Link href="/learn/zero-gamma-flip-explained">the zero-gamma flip guide</Link>.
      </p>

      <h2>Key strikes: walls and magnets</h2>
      <ul>
        <li>
          <strong>Highest-gamma strike</strong> — the strongest gravitational level; price tends to
          be pinned there into expiry.
        </li>
        <li>
          <strong>Call wall</strong> — heavy call open interest → natural <em>resistance</em>
          (dealers sell to hedge).
        </li>
        <li>
          <strong>Put wall</strong> — heavy put open interest → natural <em>support</em> (dealers
          buy to hedge).
        </li>
      </ul>
      <p>
        These levels are the practical, tradeable output of GEX — see{' '}
        <Link href="/learn/gamma-walls-explained">gamma walls explained</Link>. And the IV
        asymmetry behind put/call demand is the{' '}
        <Link href="/learn/volatility-skew-explained">volatility skew</Link>.
      </p>

      <h2>How to use GEX (regime-aware)</h2>
      <ul>
        <li><strong>Positive gamma:</strong> mean-revert, fade toward high-gamma strikes, avoid chasing breakouts.</li>
        <li><strong>Negative gamma:</strong> trade with momentum, respect that fades are dangerous.</li>
        <li><strong>Near the flip:</strong> transition zone — expect elevated volatility and false moves.</li>
      </ul>

      <h2>Common mistakes</h2>
      <ul>
        <li>Trading the same way in both regimes. GEX exists precisely to switch your playbook.</li>
        <li>Treating walls as hard floors/ceilings — they are strong levels, not guarantees, and they move as positioning changes (and reset at expiry).</li>
        <li>Ignoring expiry. Gamma concentrates into option expirations; the pin is strongest there.</li>
      </ul>

      <div className="callout">
        <p>
          <strong>Key takeaway:</strong> GEX tells you whether dealer hedging will <em>calm</em> the
          market (positive gamma → mean-revert) or <em>fuel</em> it (negative gamma → trend). Read
          the sign first, then the walls.
        </p>
      </div>

      <h2>See GEX on your screen</h2>
      <p>
        Senzoukria shows aggregated <Link href="/">gamma exposure</Link> with the key levels — zero
        gamma, call wall, put wall — next to your footprint and order flow, so the options context
        sits right beside the tape. Free preview, no card.
      </p>
    </ArticleLayout>
  );
}
