import type { Metadata } from 'next';
import Link from 'next/link';
import ArticleLayout from '@/components/learn/ArticleLayout';
import { abs, type FaqItem } from '@/lib/seo/structuredData';

const PATH = '/learn/liquidity-heatmap-explained';
const TITLE = 'Liquidity Heatmap Explained (How to Read It)';
const INTRO =
  'A liquidity heatmap turns the order book into a picture: it paints the resting limit orders sitting at every price over time, so you can see the walls of liquidity the market is leaning on — before they get hit. Here is how to read one.';

const META =
  'Learn to read a liquidity heatmap — resting order-book liquidity over time, walls, spoofing pulls and absorption — and how it differs from a footprint.';

export const metadata: Metadata = {
  title: TITLE,
  description: META,
  alternates: { canonical: abs(PATH) },
  openGraph: { title: TITLE, description: META, url: abs(PATH), type: 'article', images: ['/opengraph-image'] },
};

const FAQS: FaqItem[] = [
  {
    question: 'What is a liquidity heatmap?',
    answer:
      'A liquidity heatmap is a time-based visualization of the order book (DOM). For every price level it colors how much resting limit-order size is waiting there — brighter or hotter means more liquidity. It shows passive intentions, unlike a footprint, which shows executed aggressive volume.',
  },
  {
    question: 'What is the difference between a heatmap and a footprint chart?',
    answer:
      'A footprint shows what already traded — aggressive market orders that executed. A heatmap shows what is resting and waiting — passive limit orders that have not been hit yet. One is action, the other is intention. Reading them together tells you where big orders sit and whether aggressors are eating through them.',
  },
  {
    question: 'What does a bright wall on the heatmap mean?',
    answer:
      'A bright horizontal band is a large block of resting limit orders at one price — a liquidity wall. If it sits below price it often acts as support; above price, resistance. The key question is whether it holds and absorbs incoming aggression, or gets pulled (cancelled) as price approaches.',
  },
  {
    question: 'Can you trust liquidity walls — what about spoofing?',
    answer:
      'Not blindly. A wall that vanishes the moment price gets close is likely spoofing or repositioning, not real intent. A wall that stays and absorbs heavy aggressive volume without price moving through it is real liquidity defending a level. Watch how the band behaves as price tests it.',
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
        { name: 'Liquidity heatmap explained', path: PATH },
      ]}
      faqs={FAQS}
    >
      <p>
        Most charts show you <em>price</em>. A <strong>liquidity heatmap</strong> shows you the{' '}
        <em>orders behind the price</em> — the resting limit orders stacked at each level, painted
        as a heat-coloured map that scrolls through time. Where a{' '}
        <Link href="/learn/how-to-read-a-footprint-chart">footprint chart</Link> tells you what
        aggressive traders already <strong>did</strong>, the heatmap tells you what passive traders
        are <strong>waiting</strong> to do.
      </p>

      <h2>What the colours mean</h2>
      <p>
        Each horizontal row is a price level; the colour at any point is the amount of resting
        limit-order size sitting there at that moment:
      </p>
      <ul>
        <li>
          <strong>Hot / bright cells</strong> — a lot of resting liquidity. A bright horizontal
          streak is a <strong>liquidity wall</strong>: a large block of limit orders.
        </li>
        <li>
          <strong>Cool / dark cells</strong> — thin liquidity. Price tends to travel fast through
          empty zones because there is little to slow it down.
        </li>
      </ul>
      <p>
        Because it scrolls with time, you do not just see the wall — you see how long it has been
        there and how it reacts when price approaches.
      </p>

      <h2>The three behaviours to read</h2>

      <h3>1. Walls that hold (real liquidity)</h3>
      <p>
        Price drives into a bright band, heavy aggression hits it, and the band <em>stays lit</em>{' '}
        while price stalls. That is a large passive player <strong>absorbing</strong> the flow — the
        same event you would see as heavy volume with no progress on the footprint. These levels
        become meaningful support or resistance. See{' '}
        <Link href="/learn/absorption-in-trading">absorption in trading</Link> for how to confirm
        it.
      </p>

      <h3>2. Walls that pull (spoofing / repositioning)</h3>
      <p>
        A wall that <strong>disappears</strong> the instant price gets close was never going to be
        filled — it was either a spoof meant to scare flow, or liquidity being repositioned. Pulled
        liquidity ahead of price often <em>accelerates</em> the move, because the brake everyone was
        watching just vanished.
      </p>

      <h3>3. Icebergs (hidden refills)</h3>
      <p>
        Sometimes a modest-looking band keeps <strong>refilling</strong> as it is hit — every time
        aggressors eat it, more size reappears. That is an <strong>iceberg</strong>: a large order
        sliced so only a fraction shows at once. Icebergs mark levels a serious player is defending
        quietly, and they rarely break on the first test.
      </p>

      <h2>Heatmap + footprint: intention vs action</h2>
      <p>
        The two views answer different questions, which is exactly why they pair well:
      </p>
      <ul>
        <li>
          <strong>Heatmap</strong> = resting, passive, <em>intention</em>. Where is the size
          waiting?
        </li>
        <li>
          <strong>Footprint</strong> = executed, aggressive, <em>action</em>. Who is hitting that
          size, and is it holding?
        </li>
      </ul>
      <p>
        A wall on the heatmap plus heavy bid volume and stalling delta on the footprint at the same
        price is a high-confidence absorption read — far stronger than either signal alone.
      </p>

      <div className="callout">
        <p>
          <strong>Key takeaway:</strong> a liquidity heatmap is a map of where the market keeps its
          fuel. Bright walls are decisions waiting to be made — your job is to watch whether they{' '}
          <em>defend</em> (absorb), <em>pull</em> (spoof), or <em>refill</em> (iceberg) when price
          finally tests them.
        </p>
      </div>

      <h2>Common mistakes</h2>
      <ul>
        <li>Trading a wall the moment you see it, before price has tested how it behaves.</li>
        <li>Ignoring pulled liquidity — a vanished wall is a signal, not a non-event.</li>
        <li>
          Reading the heatmap without the tape. Resting size only matters once aggression meets it.
        </li>
      </ul>

      <h2>See it on live data</h2>
      <p>
        Senzoukria renders a <Link href="/footprint">native liquidity heatmap</Link> next to the
        footprint from your NinjaTrader, Apex / Rithmic or crypto feed, so you can watch walls form,
        hold and pull in real time on the market you actually trade. Start with a{' '}
        <Link href="/auth/register">free preview</Link>.
      </p>
    </ArticleLayout>
  );
}
