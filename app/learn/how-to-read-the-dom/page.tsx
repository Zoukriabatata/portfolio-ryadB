import type { Metadata } from 'next';
import Link from 'next/link';
import ArticleLayout from '@/components/learn/ArticleLayout';
import { abs, type FaqItem } from '@/lib/seo/structuredData';

const PATH = '/learn/how-to-read-the-dom';
const TITLE = 'How to Read the DOM (Depth of Market)';
const INTRO =
  'The DOM is the live order book — the ladder of bids and offers resting around the current price. Read correctly, it shows where liquidity is stacked, where it is fake, and where aggressors are absorbing it. Here is how to read the ladder.';

const META =
  'How to read the DOM (Depth of Market): the bid/ask ladder, stacked liquidity, spoofing and pulled orders, icebergs and absorption — a practical guide.';

export const metadata: Metadata = {
  title: TITLE,
  description: META,
  alternates: { canonical: abs(PATH) },
  openGraph: { title: TITLE, description: META, url: abs(PATH), type: 'article', images: ['/opengraph-image'] },
};

const FAQS: FaqItem[] = [
  {
    question: 'What is the DOM in trading?',
    answer:
      'The DOM (Depth of Market), also called the order book or ladder, is a live list of the resting limit orders around the current price. It shows how many contracts are bid at each price below the market and offered at each price above it — the liquidity waiting to be filled.',
  },
  {
    question: 'What is the difference between the DOM and a footprint chart?',
    answer:
      'The DOM shows resting, passive limit orders — liquidity that has not traded yet. A footprint shows executed, aggressive market orders — what already traded. The DOM is intention; the footprint is action. They are two sides of the same order flow.',
  },
  {
    question: 'What is spoofing on the DOM?',
    answer:
      'Spoofing is placing large resting orders with no intention of filling them, to create a false impression of supply or demand and push other traders around. The tell is that the order is pulled (cancelled) the moment price approaches it, rather than getting hit and holding.',
  },
  {
    question: 'What is an iceberg order?',
    answer:
      'An iceberg is a large order split so only a small piece is visible on the DOM at a time. As aggressors hit the visible size it keeps refilling from the hidden reserve. Icebergs reveal a serious player quietly defending a level — the price keeps absorbing flow without the displayed size matching how much trades.',
  },
];

export default function Page() {
  return (
    <ArticleLayout
      title={TITLE}
      intro={INTRO}
      updated="June 2026"
      datePublished="2026-06-20"
      dateModified="2026-06-20"
      path={PATH}
      breadcrumb={[
        { name: 'Home', path: '/' },
        { name: 'Learn', path: '/learn' },
        { name: 'How to read the DOM', path: PATH },
      ]}
      faqs={FAQS}
    >
      <p>
        The <strong>DOM</strong> — Depth of Market, also called the order book or the ladder — is
        the rawest view of order flow there is. It is a live column of prices with the resting{' '}
        <strong>bids</strong> stacked below the market and the resting <strong>offers</strong>{' '}
        stacked above it. Everything else — the{' '}
        <Link href="/learn/liquidity-heatmap-explained">liquidity heatmap</Link>, the{' '}
        <Link href="/learn/how-to-read-a-footprint-chart">footprint</Link> — is a way of making the
        ladder readable over time.
      </p>

      <h2>Anatomy of the ladder</h2>
      <ul>
        <li>
          <strong>Price column (centre)</strong> — each row is one price level, best bid and best
          offer in the middle, where the spread sits.
        </li>
        <li>
          <strong>Bid size (below)</strong> — resting buy limit orders waiting under the market.
        </li>
        <li>
          <strong>Ask size (above)</strong> — resting sell limit orders waiting over the market.
        </li>
        <li>
          <strong>Volume / last trade columns</strong> — what is actually executing at each level
          right now, so you can see aggression meeting the resting size.
        </li>
      </ul>

      <h2>What the resting size tells you</h2>
      <h3>Stacked liquidity</h3>
      <p>
        Several large levels lined up on one side is a <strong>liquidity shelf</strong> — a zone the
        market would have to chew through to continue. Stacked bids below price can hold a pullback;
        stacked offers above can cap a rally. Whether they actually hold is the next question.
      </p>
      <h3>Pulling and spoofing</h3>
      <p>
        A large order that <strong>vanishes</strong> as price approaches it was not real intent —
        classic <strong>spoofing</strong> or repositioning. Watch the behaviour, not the snapshot: a
        wall only means something if it stays to get hit. Pulled liquidity ahead of price tends to{' '}
        <em>accelerate</em> the move.
      </p>
      <h3>Absorption and icebergs</h3>
      <p>
        When aggressive market orders pour into a level and it <strong>holds</strong> — the price
        does not move even though size is trading — a large passive player is{' '}
        <Link href="/learn/absorption-in-trading">absorbing</Link> the flow. If the displayed size
        keeps refilling as it is hit, that is an <strong>iceberg</strong>: far more is hidden than
        the ladder shows. Both mark levels worth respecting.
      </p>

      <h2>The DOM&rsquo;s big limitation (and the fix)</h2>
      <p>
        The raw DOM only shows you <em>now</em> — it flickers and resets every tick, so it is hard
        to see how a level behaved over the last few minutes. That is exactly what a{' '}
        <Link href="/learn/liquidity-heatmap-explained">liquidity heatmap</Link> solves: it records
        the DOM through time so walls, pulls and refills become visible as patterns instead of a
        blur. Read the ladder for the instant, the heatmap for the history.
      </p>

      <div className="callout">
        <p>
          <strong>Key takeaway:</strong> the DOM shows resting intention — where liquidity waits.
          Never trade a wall on sight; watch whether it <em>holds</em> (absorption), <em>pulls</em>{' '}
          (spoof) or <em>refills</em> (iceberg) when aggression finally reaches it.
        </p>
      </div>

      <h2>See it on live data</h2>
      <p>
        Senzoukria pairs the DOM with a{' '}
        <Link href="/footprint">liquidity heatmap and native footprint</Link> from your
        NinjaTrader, Apex / Rithmic or crypto feed — so you read resting liquidity, its history and
        the aggression hitting it in one place. Start with a{' '}
        <Link href="/auth/register">free preview</Link>.
      </p>
    </ArticleLayout>
  );
}
