import type { Metadata } from 'next';
import Link from 'next/link';
import ArticleLayout from '@/components/learn/ArticleLayout';
import { abs, type FaqItem } from '@/lib/seo/structuredData';

const PATH = '/learn/absorption-in-trading';
const TITLE = 'Absorption in Trading: How to Spot It on Footprint';
const INTRO =
  'Absorption is when heavy aggressive volume hits a price level and price refuses to move — a large passive player is soaking up the orders. It is one of the strongest tells of institutional presence. Here is how to read it on a footprint chart.';

export const metadata: Metadata = {
  title: TITLE,
  description: INTRO,
  alternates: { canonical: abs(PATH) },
  openGraph: { title: TITLE, description: INTRO, url: abs(PATH), type: 'article' },
};

const FAQS: FaqItem[] = [
  {
    question: 'What is absorption in order flow?',
    answer:
      'Absorption is heavy aggressive volume at a price level that fails to move price. Aggressive sellers (or buyers) keep hitting the level, but a large passive limit order soaks up every contract, so price holds. It signals a big player defending that price.',
  },
  {
    question: 'How is absorption different from an imbalance?',
    answer:
      'An imbalance is one side aggressively dominating and pushing price. Absorption is one side being aggressive but failing to move price because the passive side absorbs it. Imbalance is momentum; absorption is a wall stopping momentum.',
  },
  {
    question: 'Is absorption a reversal signal?',
    answer:
      'Often, yes. When aggressive selling is absorbed at a level and price holds, it can mark support and precede a bounce — especially with a delta divergence. But absorption confirms a level is defended; you still want price confirmation before acting.',
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
        { name: 'Absorption in trading', path: PATH },
      ]}
      faqs={FAQS}
    >
      <p>
        Most order flow signals are about <em>movement</em> — who pushed price and how far.{' '}
        <strong>Absorption</strong> is the opposite: it is about volume that <em>should</em> have
        moved price but didn’t. That stillness, under heavy fire, is what makes it such a strong
        signal of a large hidden player.
      </p>

      <h2>What absorption looks like</h2>
      <p>
        Picture a level getting hammered by aggressive sellers — large bid volume printing cell
        after cell on the{' '}
        <Link href="/learn/how-to-read-a-footprint-chart">footprint</Link> — and yet price barely
        ticks down. Someone is sitting there with a large passive limit order, buying everything
        that is thrown at them. The selling is being <strong>absorbed</strong>.
      </p>
      <p>
        A simple illustration: thousands of contracts trade into a single level and price holds
        flat. That is not a market in balance — that is one side getting everything they want at a
        price the other side is determined to defend.
      </p>

      <h2>How to confirm absorption</h2>
      <p>Three things separate real absorption from a random pause:</p>
      <ul>
        <li>
          <strong>Heavy volume.</strong> The level should show clearly above-average aggressive
          volume — a real fight, not a quiet tick.
        </li>
        <li>
          <strong>Price holds.</strong> Despite the volume, the candle’s extreme does not push
          past the level. That failure-to-move is the signal.
        </li>
        <li>
          <strong>Delta divergence.</strong> Strong one-sided{' '}
          <Link href="/learn/cumulative-delta-explained">delta</Link> with no price follow-through
          is the fingerprint of absorption.
        </li>
      </ul>

      <h2>Why absorption marks support and resistance</h2>
      <p>
        A level where aggressive selling was absorbed and price held becomes meaningful{' '}
        <strong>support</strong> — a large buyer has shown they will defend it. The same in
        reverse (aggressive buying absorbed, price capped) marks <strong>resistance</strong>. When
        a later candle bounces off that level, you have confirmation.
      </p>

      <h2>Absorption vs stopping volume</h2>
      <p>
        Closely related is <strong>stopping volume</strong> — a burst of volume at the extreme of a
        move where the aggressor exhausts themselves. Absorption is the passive side soaking up
        flow; stopping volume is the aggressive side running out of fuel. Both show up at turns,
        and both are stronger when they appear together with an{' '}
        <Link href="/learn/order-flow-imbalance">imbalance</Link> running into the level.
      </p>

      <h2>Common mistakes</h2>
      <ul>
        <li>Calling any pause absorption. Without heavy volume, it is just a quiet level.</li>
        <li>Acting on absorption alone. It confirms a level is defended — wait for price to react.</li>
        <li>Ignoring the bigger picture: absorption against the dominant trend can simply get run over.</li>
      </ul>

      <div className="callout">
        <p>
          <strong>Key takeaway:</strong> absorption is heavy aggression met by a wall of passive
          orders, with price refusing to move. It marks the levels big players are defending — and
          where the next move often begins once the aggressor gives up.
        </p>
      </div>

      <h2>Watch absorption build live</h2>
      <p>
        Senzoukria highlights absorption and stopping volume on the{' '}
        <Link href="/footprint">native footprint</Link>, tick-by-tick, with broker-matched volume
        so the numbers are real. Connect NinjaTrader, Apex / Rithmic or a crypto feed and see it on
        a market you trade — free preview, no card.
      </p>
    </ArticleLayout>
  );
}
