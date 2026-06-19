import type { Metadata } from 'next';
import Link from 'next/link';
import ArticleLayout from '@/components/learn/ArticleLayout';
import { abs, type FaqItem } from '@/lib/seo/structuredData';

const PATH = '/learn/order-flow-imbalance';
const TITLE = 'Order Flow Imbalance Explained (Footprint)';
const INTRO =
  'An order flow imbalance is a price level where aggressive buyers or sellers overwhelm the other side. On a footprint chart, imbalances mark where conviction concentrates — and stacked imbalances reveal institutional momentum. Here is how to read them.';

const META =
  'How order flow imbalances are measured on a footprint, why stacked imbalances signal momentum, and how unfilled zones become magnets.';

export const metadata: Metadata = {
  title: TITLE,
  description: META,
  alternates: { canonical: abs(PATH) },
  openGraph: { title: TITLE, description: META, url: abs(PATH), type: 'article', images: ['/opengraph-image'] },
};

const FAQS: FaqItem[] = [
  {
    question: 'What is an order flow imbalance?',
    answer:
      'An imbalance is a footprint cell where one side strongly dominates the other — typically the ask at one level versus the bid at the level below (a diagonal comparison) exceeding a ratio like 3:1. It marks a level where aggressive buyers or sellers clearly took control.',
  },
  {
    question: 'What are stacked imbalances?',
    answer:
      'Stacked imbalances are several imbalances in the same direction at consecutive price levels. They signal sustained, one-sided aggression — usually institutional momentum rather than random noise.',
  },
  {
    question: 'Why is imbalance measured diagonally?',
    answer:
      'Aggressive buying at one price is best compared to aggressive selling at the price just below it (and vice versa), because that is where the two sides actually meet. Comparing the bid and ask on the same row understates real one-sided pressure.',
  },
];

export default function Page() {
  return (
    <ArticleLayout
      title={TITLE}
      intro={INTRO}
      updated="June 2026"
      datePublished="2026-06-17"
      dateModified="2026-06-17"
      path={PATH}
      breadcrumb={[
        { name: 'Home', path: '/' },
        { name: 'Learn', path: '/learn' },
        { name: 'Order flow imbalance', path: PATH },
      ]}
      faqs={FAQS}
    >
      <p>
        On a <Link href="/learn/how-to-read-a-footprint-chart">footprint chart</Link>, an{' '}
        <strong>imbalance</strong> is a cell where one side of the order flow clearly dominates the
        other. It is the footprint’s way of pointing at the prices where buyers or sellers were not
        just present, but <em>aggressive</em>.
      </p>

      <h2>How an imbalance is measured</h2>
      <p>
        The standard approach compares the two sides <strong>diagonally</strong>: the ask volume at
        one level against the bid volume at the level directly below it. When the ratio crosses a
        threshold — commonly <strong>3:1</strong> — the cell is flagged as a buy or sell imbalance.
      </p>
      <ul>
        <li>
          <strong>Buy imbalance</strong> — ask at a level overwhelms the bid below it. Aggressive
          buyers lifted offers far harder than sellers hit bids.
        </li>
        <li>
          <strong>Sell imbalance</strong> — bid at a level overwhelms the ask above it. Aggressive
          sellers dominated.
        </li>
      </ul>
      <p>
        A good imbalance rule also enforces a <strong>minimum volume</strong>. Without it, a level
        showing 0 versus 2 contracts looks like a 100% imbalance but means nothing — a classic way
        to drown in false signals.
      </p>

      <h2>Stacked imbalances = momentum</h2>
      <p>
        A single imbalance is a data point. Several imbalances <strong>stacked</strong> at
        consecutive levels in the same direction are a signal. Stacked buy imbalances running up a
        candle show buyers aggressively taking every offer on the way up — sustained, one-sided
        conviction that is hard to fake. This is one of the clearest footprint reads for
        institutional momentum.
      </p>

      <h2>Unfilled imbalances become magnets</h2>
      <p>
        Imbalances often act like <strong>unfinished business</strong>. A zone of strong one-sided
        aggression that price leaves behind tends to attract price back later, as the market
        revisits levels where liquidity was taken too quickly. Many traders mark unfilled
        imbalance zones as future targets or reaction areas.
      </p>

      <h2>Imbalance, absorption and delta together</h2>
      <p>
        Imbalances are strongest when read with the rest of the order flow picture:
      </p>
      <ul>
        <li>
          Stacked imbalances into a level, then{' '}
          <Link href="/learn/absorption-in-trading">absorption</Link> that stops price — momentum
          meeting a wall, a potential turn.
        </li>
        <li>
          Imbalances aligned with a rising{' '}
          <Link href="/learn/cumulative-delta-explained">cumulative delta</Link> — momentum
          confirmed by net pressure.
        </li>
      </ul>

      <h2>Common mistakes</h2>
      <ul>
        <li>Flagging imbalances on thin levels with no minimum-volume floor.</li>
        <li>Comparing same-row bid vs ask instead of the diagonal — it understates real pressure.</li>
        <li>Treating one isolated imbalance as a trade signal instead of looking for stacking and context.</li>
      </ul>

      <div className="callout">
        <p>
          <strong>Key takeaway:</strong> imbalances show where aggression concentrated; stacked
          imbalances show momentum; unfilled ones show where price may return. Always pair them
          with a volume floor and the broader order flow context.
        </p>
      </div>

      <h2>Spot imbalances automatically</h2>
      <p>
        Senzoukria flags diagonal imbalances and stacked imbalances directly on the{' '}
        <Link href="/footprint">native footprint</Link>, with a configurable ratio and minimum
        volume so you see real conviction, not noise. Connect NinjaTrader, Apex / Rithmic or a
        crypto feed and try it on a free preview.
      </p>
    </ArticleLayout>
  );
}
