import type { Metadata } from 'next';
import Link from 'next/link';
import ArticleLayout from '@/components/learn/ArticleLayout';
import { abs, type FaqItem } from '@/lib/seo/structuredData';

const PATH = '/learn/vwap-explained';
const TITLE = 'VWAP Explained for Day Traders';
const INTRO =
  'VWAP is the volume-weighted average price — the single line that tells you, at a glance, whether buyers or sellers are winning the session, and the level institutions use as their benchmark. Here is what it is and how to trade around it.';

const META =
  'VWAP explained: what the volume-weighted average price is, how to read above vs below, VWAP bands and anchored VWAP — a practical day-trading guide.';

export const metadata: Metadata = {
  title: TITLE,
  description: META,
  alternates: { canonical: abs(PATH) },
  openGraph: { title: TITLE, description: META, url: abs(PATH), type: 'article', images: ['/opengraph-image'] },
};

const FAQS: FaqItem[] = [
  {
    question: 'What is VWAP?',
    answer:
      'VWAP (Volume Weighted Average Price) is the average price of a session weighted by volume: the sum of price times volume divided by total volume. It resets each session and represents the average price every contract actually traded at — the session’s fair value.',
  },
  {
    question: 'What does it mean when price is above or below VWAP?',
    answer:
      'Price above VWAP means the average buyer this session is in profit and buyers are in control — an intraday uptrend bias. Price below VWAP means sellers are in control. Price sitting on VWAP is equilibrium and often mean-reverts.',
  },
  {
    question: 'What are VWAP bands?',
    answer:
      'VWAP bands are standard-deviation envelopes (typically ±1 and ±2 SD) drawn around VWAP. They mark over-extension: price tagging the +2 SD band is stretched to the upside, the −2 SD band stretched to the downside. In balanced markets, extremes fade back toward VWAP.',
  },
  {
    question: 'What is anchored VWAP?',
    answer:
      'Anchored VWAP starts the calculation from a specific event you choose — a swing high/low, an earnings release, the open of a big move — instead of the session start. It shows the average price of everyone who traded since that event, which often becomes a precise support or resistance line.',
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
        { name: 'VWAP explained', path: PATH },
      ]}
      faqs={FAQS}
    >
      <p>
        <strong>VWAP</strong> answers one question better than any moving average:{' '}
        <em>what price did the average contract actually trade at today?</em> Because it is weighted
        by volume and resets each session, it is the line large desks measure their own execution
        against — which is exactly why it works as a level.
      </p>

      <h2>How it is calculated</h2>
      <p>
        VWAP is the running sum of <code>price × volume</code> divided by the running sum of{' '}
        <code>volume</code>, from the session open:
      </p>
      <ul>
        <li>Every trade nudges the line toward its price, in proportion to its size.</li>
        <li>A big print moves VWAP more than a small one — volume is the weight.</li>
        <li>It resets at the session start, so it always describes <em>today&rsquo;s</em> fair value.</li>
      </ul>

      <h2>The core read: above vs below</h2>
      <ul>
        <li>
          <strong>Price above VWAP</strong> — the average buyer is in profit; buyers control the
          session. Pullbacks into VWAP that hold are buy-the-dip spots.
        </li>
        <li>
          <strong>Price below VWAP</strong> — sellers control the session. Rallies into VWAP that
          fail are sell-the-rip spots.
        </li>
        <li>
          <strong>Price on VWAP</strong> — equilibrium. Often a coin-flip / mean-reversion zone
          until one side wins it.
        </li>
      </ul>
      <p>
        A clean break of VWAP <em>with volume</em> is an intraday regime change — the session bias
        flips. The reclaim or rejection of VWAP after a test is one of the most reliable intraday
        tells.
      </p>

      <h2>VWAP bands: spotting over-extension</h2>
      <p>
        Standard-deviation bands (±1 SD, ±2 SD) wrap VWAP and measure how stretched price is:
      </p>
      <ul>
        <li>
          <strong>±1 SD</strong> — normal rotation. Price spends most of a balanced day inside it.
        </li>
        <li>
          <strong>±2 SD</strong> — over-extension. In a range, tags of the outer band fade back
          toward VWAP; in a strong trend, price can <em>ride</em> the band, which is itself a
          momentum signal.
        </li>
      </ul>

      <h2>Anchored VWAP</h2>
      <p>
        Instead of anchoring to the session open, drop the VWAP&rsquo;s start on a meaningful event —
        a major swing high, a breakout bar, a news release. <strong>Anchored VWAP</strong> then
        shows the average price of everyone who has traded since that moment, which frequently acts
        as a clean line of support or resistance. Anchoring to the low of a big rally, for example,
        marks the level longs are defending.
      </p>

      <div className="callout">
        <p>
          <strong>Key takeaway:</strong> VWAP is the session&rsquo;s fair value and the
          institutional benchmark. Trade <em>with</em> the side that owns VWAP, use the bands to
          gauge over-extension, and treat a volume-backed break of VWAP as a change of intraday
          control.
        </p>
      </div>

      <h2>VWAP + order flow</h2>
      <p>
        VWAP tells you <strong>where</strong> the fair-value fight is; order flow tells you{' '}
        <strong>who is winning it</strong>. A test of VWAP with strong{' '}
        <Link href="/learn/absorption-in-trading">absorption</Link> or a{' '}
        <Link href="/learn/cumulative-delta-explained">cumulative delta</Link> divergence is far
        more actionable than the line being touched on its own. Use VWAP to find the level and the{' '}
        <Link href="/learn/how-to-read-a-footprint-chart">footprint</Link> to read the reaction.
      </p>

      <h2>See it on live data</h2>
      <p>
        Senzoukria overlays VWAP and its bands on the live{' '}
        <Link href="/footprint">footprint</Link> from your NinjaTrader, Apex / Rithmic or crypto
        feed, so you can watch price fight fair value tick by tick. Start with a{' '}
        <Link href="/auth/register">free preview</Link>.
      </p>
    </ArticleLayout>
  );
}
