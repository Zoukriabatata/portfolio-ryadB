import type { Metadata } from 'next';
import Link from 'next/link';
import ArticleLayout from '@/components/learn/ArticleLayout';
import { abs, type FaqItem } from '@/lib/seo/structuredData';

const PATH = '/learn/cumulative-delta-explained';
const TITLE = 'Cumulative Delta (CVD) Explained for Order Flow';
const INTRO =
  'Cumulative delta — CVD — is the running total of buy minus sell aggression across a session. It is one of the most useful order flow signals because it shows pressure that price alone hides. Here is how to read it.';

export const metadata: Metadata = {
  title: TITLE,
  description: INTRO,
  alternates: { canonical: abs(PATH) },
  openGraph: { title: TITLE, description: INTRO, url: abs(PATH), type: 'article' },
};

const FAQS: FaqItem[] = [
  {
    question: 'What is the difference between delta and cumulative delta?',
    answer:
      'Delta is the net aggressive volume of a single candle or price level (ask minus bid). Cumulative delta is the running sum of every candle’s delta across the session, so it shows the net buying or selling pressure built up over time.',
  },
  {
    question: 'What is a CVD divergence?',
    answer:
      'A CVD divergence is when price makes a new high or low but cumulative delta does not follow — price up while CVD is flat or falling, for example. It signals that the move is not backed by aggressive flow and may be running out of fuel.',
  },
  {
    question: 'Does cumulative delta reset?',
    answer:
      'By convention CVD is anchored to the session open and resets each session, so the absolute value is comparable day to day. What matters most for trading is the shape and the divergences, not the raw number.',
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
        { name: 'Cumulative delta explained', path: PATH },
      ]}
      faqs={FAQS}
    >
      <p>
        If you have read our guide on{' '}
        <Link href="/learn/how-to-read-a-footprint-chart">how to read a footprint chart</Link>,
        you already know <strong>delta = ask volume − bid volume</strong> — the net aggression of
        a single candle or level. <strong>Cumulative delta (CVD)</strong> takes it one step
        further: it sums that delta bar after bar across the whole session.
      </p>

      <h2>How cumulative delta is built</h2>
      <p>
        Start the session at zero. For every candle, add its delta to the running total. A
        sequence of buyer-dominated candles pushes CVD up; seller-dominated candles drag it down.
        The result is a single line that represents the <strong>net pressure</strong> traders have
        applied since the open — information you simply cannot see on price alone.
      </p>
      <ul>
        <li>
          <strong>Rising CVD</strong> — aggressive buyers are in control.
        </li>
        <li>
          <strong>Falling CVD</strong> — aggressive sellers are in control.
        </li>
        <li>
          <strong>Flat CVD</strong> — balanced flow, no directional bias.
        </li>
      </ul>

      <h2>The signal that matters: divergence</h2>
      <p>
        CVD is most powerful when it <em>disagrees</em> with price. Two classic setups:
      </p>
      <ul>
        <li>
          <strong>Bearish divergence</strong> — price prints a higher high while CVD makes a lower
          high. Buyers are paying up, but with less aggression than before. The rally is thinning.
        </li>
        <li>
          <strong>Bullish divergence</strong> — price prints a lower low while CVD holds or rises.
          Sellers are pushing, but the aggressive selling is drying up.
        </li>
      </ul>
      <p>
        A divergence at a meaningful level — paired with{' '}
        <Link href="/learn/absorption-in-trading">absorption</Link> on the footprint — is a far
        stronger read than either signal alone.
      </p>

      <h2>CVD and absorption</h2>
      <p>
        When CVD keeps rising but <strong>price stalls</strong>, someone is absorbing the buying
        with passive limit orders. Rising delta + flat price is one of the cleanest absorption
        tells, and it often precedes a sharp move once the aggressor gives up.
      </p>

      <h2>Common mistakes with CVD</h2>
      <ul>
        <li>
          <strong>Trading the raw number.</strong> The absolute CVD value is far less useful than
          its slope and its divergences from price.
        </li>
        <li>
          <strong>Ignoring the session anchor.</strong> Compare CVD within the same session; a
          number scrolled in from yesterday is not comparable.
        </li>
        <li>
          <strong>Forgetting volatility context.</strong> A divergence in quiet conditions is a
          cleaner signal than the same divergence in a violent, news-driven tape.
        </li>
      </ul>

      <div className="callout">
        <p>
          <strong>Key takeaway:</strong> price tells you where the market is; cumulative delta
          tells you how hard traders are pushing to keep it there. Watch for the two to disagree.
        </p>
      </div>

      <h2>Track CVD in real time</h2>
      <p>
        Senzoukria plots cumulative delta alongside the{' '}
        <Link href="/footprint">native footprint</Link>, anchored to the session and matched to
        the broker-side volume — so the CVD you read is the CVD your broker would show. Connect a
        NinjaTrader, Apex / Rithmic or crypto feed and watch it build live.
      </p>
    </ArticleLayout>
  );
}
