import type { Metadata } from 'next';
import Link from 'next/link';
import ArticleLayout from '@/components/learn/ArticleLayout';
import { abs, type FaqItem } from '@/lib/seo/structuredData';

const PATH = '/learn/gamma-walls-explained';
const TITLE = 'Gamma Walls: Call Wall & Put Wall Explained';
const INTRO =
  'Gamma walls are the price levels where heavy option open interest forces dealers to hedge — turning a call wall into resistance and a put wall into support. They are the tradeable output of gamma exposure (GEX).';
const META =
  'Gamma walls explained: how the call wall becomes resistance, the put wall becomes support, and how dealer hedging pins price near high-gamma strikes.';

export const metadata: Metadata = {
  title: TITLE,
  description: META,
  keywords: ['gamma wall', 'call wall', 'put wall', 'gamma levels', 'GEX levels', 'options support resistance'],
  alternates: { canonical: abs(PATH) },
  openGraph: { title: TITLE, description: META, url: abs(PATH), type: 'article', images: ['/opengraph-image'] },
};

const FAQS: FaqItem[] = [
  {
    question: 'What is a call wall?',
    answer:
      'A call wall is a strike with heavy call open interest. As price approaches it, dealers who are short those calls sell the underlying to hedge, which acts as natural resistance. It often caps rallies until positioning shifts.',
  },
  {
    question: 'What is a put wall?',
    answer:
      'A put wall is a strike with heavy put open interest. As price falls toward it, dealers buy the underlying to hedge, which acts as natural support. It frequently halts or slows declines.',
  },
  {
    question: 'Do gamma walls always hold?',
    answer:
      'No. Walls are strong levels, not guarantees. They work best in a positive-gamma regime; in negative gamma a wall can break and the move accelerate. Walls also move as positioning changes and reset around option expiry.',
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
        { name: 'Gamma walls', path: PATH },
      ]}
      faqs={FAQS}
    >
      <p>
        If <Link href="/learn/what-is-gex-gamma-exposure">GEX</Link> tells you the <em>regime</em>,
        gamma walls tell you the <em>levels</em>. They are the strikes where so much option open
        interest sits that dealer hedging turns them into support and resistance you can trade
        around.
      </p>

      <h2>Why walls exist</h2>
      <p>
        Dealers hold the other side of the options crowd. At strikes with heavy open interest, the
        gamma is concentrated — so as price nears that strike, dealers must hedge hard, and their
        hedging pushes back against price. Two walls matter most:
      </p>

      <h3>Call wall = resistance</h3>
      <p>
        At a <strong>call wall</strong> (heavy call open interest), dealers who are short those
        calls <strong>sell the underlying</strong> as price rises toward the strike. That selling is
        natural resistance — rallies often stall at the call wall.
      </p>

      <h3>Put wall = support</h3>
      <p>
        At a <strong>put wall</strong> (heavy put open interest), dealers <strong>buy the
        underlying</strong> as price falls toward the strike. That buying is natural support —
        declines often slow or stop at the put wall.
      </p>

      <h2>The high-gamma magnet</h2>
      <p>
        The single <strong>highest-gamma strike</strong> acts as a gravitational center. In a
        positive-gamma regime, price tends to get <strong>pinned</strong> toward it, especially into
        option expiry when gamma is most concentrated. Many range days are simply price oscillating
        between the put wall and the call wall around that magnet.
      </p>

      <h2>Walls + regime: the crucial caveat</h2>
      <p>
        Walls are only reliable when you respect the gamma regime:
      </p>
      <ul>
        <li>
          <strong>Positive gamma:</strong> walls hold well — fade toward them, expect the range.
        </li>
        <li>
          <strong>Negative gamma:</strong> a broken wall can turn into an accelerant — once price
          pushes through, dealer hedging now <em>chases</em> the move. See{' '}
          <Link href="/learn/zero-gamma-flip-explained">the zero-gamma flip</Link>.
        </li>
      </ul>

      <h2>How to trade gamma walls</h2>
      <ul>
        <li>Mark the call wall, put wall and highest-gamma strike at the start of the session.</li>
        <li>In positive gamma, fade moves into a wall back toward the magnet.</li>
        <li>Treat a clean break of a wall (with momentum) as a regime signal, not a dip to buy.</li>
        <li>Confirm with order flow at the level — heavy{' '}
          <Link href="/learn/absorption-in-trading">absorption</Link> at a put wall is a strong support tell.</li>
      </ul>

      <div className="callout">
        <p>
          <strong>Key takeaway:</strong> call wall = resistance, put wall = support, highest-gamma
          strike = magnet — but only as strong as the gamma regime behind them. Combine the wall
          with the footprint at that price for confirmation.
        </p>
      </div>

      <h2>See the walls live</h2>
      <p>
        Senzoukria plots the call wall, put wall and zero-gamma level alongside your footprint, so
        you can watch how price and order flow behave exactly at the gamma levels. Free preview, no
        card — <Link href="/auth/register">start here</Link>.
      </p>
    </ArticleLayout>
  );
}
