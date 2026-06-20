import type { Metadata } from 'next';
import Link from 'next/link';
import ArticleLayout from '@/components/learn/ArticleLayout';
import { abs, type FaqItem } from '@/lib/seo/structuredData';

const PATH = '/learn/volume-profile-explained';
const TITLE = 'Volume Profile Explained: POC, VAH & VAL';
const INTRO =
  'A volume profile flips the chart on its side and shows where volume actually traded by price, not by time. That reveals the levels the market agreed were fair — the POC, the value area, and the thin gaps price rips through. Here is how to read it.';

const META =
  'Volume profile explained: POC, value area (VAH/VAL), high and low volume nodes, profile shapes, and how to trade them — for futures and crypto.';

export const metadata: Metadata = {
  title: TITLE,
  description: META,
  alternates: { canonical: abs(PATH) },
  openGraph: { title: TITLE, description: META, url: abs(PATH), type: 'article', images: ['/opengraph-image'] },
};

const FAQS: FaqItem[] = [
  {
    question: 'What is a volume profile?',
    answer:
      'A volume profile is a histogram that shows how much volume traded at each price level over a chosen period, plotted horizontally. Instead of volume per time bar, you see volume per price — which exposes the levels the market spent the most effort defending.',
  },
  {
    question: 'What is the POC (Point of Control)?',
    answer:
      'The Point of Control is the single price level with the most traded volume in the profile. It is the fairest-priced level of the session and acts as a magnet — price tends to return to it. A move away from the POC that fails often snaps back to it.',
  },
  {
    question: 'What are VAH and VAL?',
    answer:
      'The value area is the price range where roughly 70% of the volume traded. VAH (Value Area High) is its upper edge and VAL (Value Area Low) is its lower edge. Trading inside the value area is balance; accepting price outside it (with volume) signals a move to a new range.',
  },
  {
    question: 'What is the difference between an HVN and an LVN?',
    answer:
      'A High Volume Node (HVN) is a price that traded a lot — a zone of agreement that attracts and holds price. A Low Volume Node (LVN) is a price that traded very little — a zone of rejection that price moves through quickly, which is why LVNs make good targets and breakout levels.',
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
        { name: 'Volume profile explained', path: PATH },
      ]}
      faqs={FAQS}
    >
      <p>
        A standard chart plots volume by <em>time</em> — one bar per candle. A{' '}
        <strong>volume profile</strong> plots volume by <em>price</em> — a horizontal histogram
        showing how much traded at every level. That single change answers a different question: not
        &ldquo;when was it busy?&rdquo; but <strong>&ldquo;which prices did the market agree
        on?&rdquo;</strong>
      </p>

      <h2>The four numbers that matter</h2>
      <ul>
        <li>
          <strong>POC (Point of Control)</strong> — the price with the most volume. The session&rsquo;s
          centre of gravity; price gravitates back to it.
        </li>
        <li>
          <strong>Value Area</strong> — the band holding ~70% of the volume. Where the market
          considered price fair.
        </li>
        <li>
          <strong>VAH (Value Area High)</strong> — the top of value. Resistance while the market is
          balanced.
        </li>
        <li>
          <strong>VAL (Value Area Low)</strong> — the bottom of value. Support while the market is
          balanced.
        </li>
      </ul>

      <h2>High vs low volume nodes</h2>
      <p>
        Inside the profile, the shape itself is information:
      </p>
      <ul>
        <li>
          <strong>HVN (High Volume Node)</strong> — a fat bulge of volume. A zone of acceptance that
          attracts price and slows it down. Great for fading extremes back toward.
        </li>
        <li>
          <strong>LVN (Low Volume Node)</strong> — a thin notch. A zone of rejection price crosses
          fast. LVNs make clean breakout triggers and quick targets — once price leaves an HVN, the
          next LVN is often where it accelerates to.
        </li>
      </ul>

      <h2>How to actually trade it</h2>
      <h3>Balance: fade the edges</h3>
      <p>
        When price is rotating inside the value area, the edges work as a range:{' '}
        <strong>VAL is support, VAH is resistance, and the POC is the mean</strong>. A poke outside
        value that gets rejected back in is a classic fade back toward the POC.
      </p>
      <h3>Imbalance: trade the acceptance</h3>
      <p>
        When price breaks out of value <em>and the breakout trades real volume</em> (acceptance, not
        a one-tick spike), the old VAH/VAL flips into support/resistance and the market is searching
        for a new value area. A break of VAL on volume is downside continuation; a break of VAH on
        volume is upside continuation. Confirm the break with{' '}
        <Link href="/learn/order-flow-imbalance">order flow imbalance</Link> rather than price
        alone.
      </p>

      <h2>Profile shapes</h2>
      <ul>
        <li>
          <strong>D-shape (bell)</strong> — balanced, fat middle. Rotational, mean-reverting; trade
          the edges.
        </li>
        <li>
          <strong>P-shape</strong> — volume bulge at the top, thin tail below. Short covering /
          trend up that found acceptance high.
        </li>
        <li>
          <strong>b-shape</strong> — bulge at the bottom, thin tail above. Long liquidation /
          acceptance low.
        </li>
        <li>
          <strong>Double distribution</strong> — two bulges with an LVN between. The market built
          two separate value areas; the LVN between them is a decision line.
        </li>
      </ul>

      <div className="callout">
        <p>
          <strong>Key takeaway:</strong> volume profile shows you where the market <em>agreed</em>{' '}
          (HVNs, the POC, the value area) and where it <em>rejected</em> price (LVNs). Trade toward
          agreement when balanced, and trade through rejection when value is breaking — confirmed by
          volume, not just a candle.
        </p>
      </div>

      <h2>Volume profile vs footprint</h2>
      <p>
        A volume profile is the <em>map</em> — the structural levels (POC, value area) you mark
        before the session. A <Link href="/learn/how-to-read-a-footprint-chart">footprint</Link> is
        the <em>microscope</em> — how aggressors behave when price arrives at those levels. Use the
        profile to find <strong>where</strong> to watch and the footprint to read{' '}
        <strong>what happens</strong> when price gets there.
      </p>

      <h2>See it on live data</h2>
      <p>
        Senzoukria plots the volume profile with the live{' '}
        <Link href="/footprint">footprint and liquidity heatmap</Link> on your NinjaTrader, Apex /
        Rithmic or crypto feed — POC, VAH and VAL marked automatically. Try it with a{' '}
        <Link href="/auth/register">free preview</Link>.
      </p>
    </ArticleLayout>
  );
}
