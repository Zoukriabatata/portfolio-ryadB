import type { Metadata } from 'next';
import Link from 'next/link';
import ArticleLayout from '@/components/learn/ArticleLayout';
import { abs, type FaqItem } from '@/lib/seo/structuredData';

const PATH = '/learn/how-to-read-a-footprint-chart';
const TITLE = 'How to Read a Footprint Chart (Beginner Guide)';
const INTRO =
  'A footprint chart shows the exact bid and ask volume traded at every price inside each candle — so you can see who is actually buying and selling, not just where price closed. Here is how to read one, level by level.';

const META =
  'Learn to read a footprint chart level by level — bid/ask volume, delta, imbalances and absorption — and tell a healthy candle from a trap.';

export const metadata: Metadata = {
  title: TITLE,
  description: META,
  alternates: { canonical: abs(PATH) },
  openGraph: { title: TITLE, description: META, url: abs(PATH), type: 'article', images: ['/opengraph-image'] },
};

const FAQS: FaqItem[] = [
  {
    question: 'What is a footprint chart?',
    answer:
      'A footprint chart (also called an order flow chart) breaks each candle down by price level and shows the bid volume and ask volume traded at each level. Instead of one candle body, you see exactly where aggressive buyers and sellers transacted.',
  },
  {
    question: 'What does bid and ask mean on a footprint?',
    answer:
      'Ask volume is trades executed at the ask price — aggressive buyers lifting the offer. Bid volume is trades executed at the bid — aggressive sellers hitting the bid. Delta is ask minus bid: positive means buyers were more aggressive, negative means sellers were.',
  },
  {
    question: 'Do I need a special data feed for footprint charts?',
    answer:
      'You need tick-by-tick trade data with the aggressor side. Senzoukria reads it from a NinjaTrader feed (Apex / Rithmic accounts), from Rithmic directly, or from crypto exchanges (Binance, Bybit, Deribit) — no proxy and no separate subscription.',
  },
  {
    question: 'What timeframe is best for reading footprint?',
    answer:
      'Footprint is most useful on lower timeframes and tick/volume bars where individual prints matter — many futures traders use 1-5 minute or tick-based candles. Higher timeframes hide the level-by-level detail that makes the footprint worth reading.',
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
        { name: 'How to read a footprint chart', path: PATH },
      ]}
      faqs={FAQS}
    >
      <p>
        A normal candlestick tells you four numbers: open, high, low, close. A{' '}
        <strong>footprint chart</strong> tells you what actually happened <em>inside</em> that
        candle — the bid and ask volume traded at every single price level. That is the
        difference between knowing the bar closed up three points and knowing{' '}
        <strong>where</strong> buyers stepped in, <strong>where</strong> sellers absorbed them,
        and <strong>where</strong> the delta flipped.
      </p>

      <h2>Anatomy of a footprint cell</h2>
      <p>
        Each candle is split into rows, one per price level. Every row is a cell showing two
        numbers, usually written <code>bid&nbsp;×&nbsp;ask</code>:
      </p>
      <ul>
        <li>
          <strong>Bid volume</strong> (left) — trades executed at the bid price. These are
          aggressive sellers hitting the bid (market sells).
        </li>
        <li>
          <strong>Ask volume</strong> (right) — trades executed at the ask price. These are
          aggressive buyers lifting the offer (market buys).
        </li>
      </ul>
      <p>
        The single most important derived number is <strong>delta = ask − bid</strong>. Positive
        delta means buyers were the aggressors at that level; negative delta means sellers were.
        Read more in our guide to{' '}
        <Link href="/learn/cumulative-delta-explained">cumulative delta</Link>.
      </p>

      <h2>The four things to read on every footprint</h2>

      <h3>1. Delta — who is in control</h3>
      <p>
        Scan whether each level (and the candle as a whole) is buyer- or seller-dominated. A
        healthy up candle shows progressively positive delta. The warning sign is{' '}
        <strong>delta divergence</strong>: a candle that closes green while delta is negative.
        That means price rose <em>despite</em> net selling — often a sign of hidden absorption by
        sellers and a potential reversal.
      </p>

      <h3>2. Imbalances — where aggression concentrates</h3>
      <p>
        An <strong>imbalance</strong> is a cell where one side dwarfs the other — a common rule of
        thumb is a 3:1 ratio or more between the ask at one level and the bid at the level below
        (a diagonal comparison). Imbalances mark zones of directional aggression. When several
        stack in the same direction (<strong>stacked imbalances</strong>), that is institutional
        momentum, not noise. Full breakdown in{' '}
        <Link href="/learn/order-flow-imbalance">order flow imbalance explained</Link>.
      </p>

      <h3>3. Absorption — where big players defend</h3>
      <p>
        <strong>Absorption</strong> is heavy aggressive volume at a price that <em>fails to move
        price</em>. If thousands of contracts hit the bid at a level and price holds, a large
        passive buyer is absorbing the selling. Those levels become meaningful support or
        resistance. See{' '}
        <Link href="/learn/absorption-in-trading">absorption in trading</Link> for how to confirm
        it.
      </p>

      <h3>4. Footprint POC and stopping volume</h3>
      <p>
        The <strong>footprint POC</strong> is the price level with the largest volume inside the
        candle — it is frequently revisited on the next bar. <strong>Stopping volume</strong> is a
        burst of volume at the extreme of a move: buyers or sellers exhausting themselves, a
        common precursor to a turn.
      </p>

      <h2>Reading a healthy candle vs a trap</h2>
      <p>A clean <strong>bullish</strong> candle usually looks like this:</p>
      <ul>
        <li>Delta builds progressively positive.</li>
        <li>The heaviest volume sits in the middle/lower part of the bar (the initiation).</li>
        <li>Light volume at the top — little resistance into the close.</li>
      </ul>
      <p>A <strong>bull trap</strong> candle looks superficially similar but reads differently:</p>
      <ul>
        <li>Delta is negative even though the candle closed higher (divergence).</li>
        <li>Large bid volume near the highs — sellers absorbing buyers into strength.</li>
        <li>This is a textbook potential-reversal setup.</li>
      </ul>

      <h2>Display modes</h2>
      <p>Most platforms, including Senzoukria, let you switch how the cells render:</p>
      <ul>
        <li>
          <strong>Bid/Ask</strong> — the raw bid and ask volume at each level (the default).
        </li>
        <li>
          <strong>Delta</strong> — the net delta per level, colored green/red.
        </li>
        <li>
          <strong>Volume</strong> — total volume per level, no bid/ask split.
        </li>
      </ul>
      <p>
        A <strong>minimum-volume filter</strong> hides thin cells so the picture is not buried in
        noise, and the <strong>cell size</strong> (in ticks) controls how granular the breakdown
        is — smaller cells, more detail.
      </p>

      <h2>Common beginner mistakes</h2>
      <ul>
        <li>
          Treating delta in isolation. Delta confirms or contradicts price — read them{' '}
          <em>together</em>.
        </li>
        <li>
          Calling every 2:1 cell an imbalance. Use a real ratio threshold and a minimum volume,
          or you will flag noise on thin levels.
        </li>
        <li>
          Ignoring context. The same divergence means different things in high vs low volatility,
          and at a key level vs mid-range.
        </li>
        <li>
          Reading footprint on a timeframe too high to show individual prints.
        </li>
      </ul>

      <div className="callout">
        <p>
          <strong>Key takeaway:</strong> a footprint is a microscope on the tape. Price tells you{' '}
          <em>what</em> happened; the footprint tells you <em>who</em> did it and{' '}
          <em>whether they will hold</em>. Combine delta, imbalances and absorption rather than
          trading any one in isolation.
        </p>
      </div>

      <h2>See it on live data</h2>
      <p>
        The fastest way to learn footprint is to watch one build tick-by-tick on a market you
        trade. Senzoukria draws <Link href="/footprint">native footprint charts</Link> from your
        NinjaTrader, Apex / Rithmic or crypto feed, with the broker-side session volume sitting
        next to your own count so the numbers match what your broker shows.
      </p>
    </ArticleLayout>
  );
}
