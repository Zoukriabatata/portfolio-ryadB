import type { Metadata } from 'next';
import Link from 'next/link';
import ArticleLayout from '@/components/learn/ArticleLayout';
import { abs, type FaqItem } from '@/lib/seo/structuredData';

const PATH = '/learn/volatility-skew-explained';
const TITLE = 'Volatility Skew Explained (Put Skew & Call Skew)';
const INTRO =
  'Volatility skew is the asymmetry in implied volatility between puts and calls. It reveals where option demand — and fear or greed — concentrates, often shifting before price turns. Here is how to read it.';
const META =
  'Volatility skew explained: put skew vs call skew, the 25-delta risk reversal, and how skew reveals fear/greed and can flip before price turns.';

export const metadata: Metadata = {
  title: TITLE,
  description: META,
  keywords: ['volatility skew', 'put skew', 'call skew', 'risk reversal', '25 delta skew', 'implied volatility skew'],
  alternates: { canonical: abs(PATH) },
  openGraph: { title: TITLE, description: META, url: abs(PATH), type: 'article', images: ['/opengraph-image'] },
};

const FAQS: FaqItem[] = [
  {
    question: 'What is volatility skew?',
    answer:
      'Volatility skew is the difference in implied volatility (IV) between puts and calls across strikes. When OTM puts carry higher IV than OTM calls, you have put skew (fear); when OTM calls carry higher IV, you have call skew (greed).',
  },
  {
    question: 'What is the 25-delta risk reversal?',
    answer:
      'The 25-delta risk reversal (RR) measures skew as IV(25-delta call) minus IV(25-delta put). A negative RR means put skew dominates (bearish protection bias); a positive RR means call skew dominates (bullish bias). Roughly -2% to +2% is neutral.',
  },
  {
    question: 'Why does skew matter for traders?',
    answer:
      'Skew shows where option demand and hedging concentrate, and it often flips before price does. A skew that turns bearish while price still rises ("skew divergence") is an early warning; skew aligned with price confirms the trend.',
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
        { name: 'Volatility skew', path: PATH },
      ]}
      faqs={FAQS}
    >
      <p>
        Two options can be the same distance from the money and still cost very differently. That
        gap is the <strong>volatility skew</strong> — the asymmetry in implied volatility (IV)
        between puts and calls. It is a direct read on where the market is paying up for protection
        or for upside, and it pairs naturally with{' '}
        <Link href="/learn/what-is-gex-gamma-exposure">gamma exposure</Link>.
      </p>

      <h2>The three shapes of skew</h2>

      <h3>Put skew (fear skew)</h3>
      <p>
        OTM puts carry higher IV than OTM calls. Traders are paying a premium to hedge downside — a{' '}
        <strong>bearish protection bias</strong>. The market fears a drop more than it hopes for a
        rally. This is the &quot;normal&quot; state for equity indices.
      </p>

      <h3>Call skew (greed skew)</h3>
      <p>
        OTM calls carry higher IV than OTM puts. Demand is for upside — speculation or upside
        protection — a <strong>bullish bias</strong>. Less common; it often shows up in aggressive
        bull runs or short squeezes.
      </p>

      <h3>Flat skew</h3>
      <p>Symmetric IV — no strong directional bias. A balanced market waiting for a catalyst.</p>

      <h2>How skew is measured: the 25-delta risk reversal</h2>
      <p>
        The standard gauge is the <strong>25-delta risk reversal (RR)</strong>:
      </p>
      <p><code>RR = IV(25δ call) − IV(25δ put)</code></p>
      <ul>
        <li><strong>RR negative</strong> → put skew dominant → bearish protection bias.</li>
        <li><strong>RR positive</strong> → call skew dominant → bullish bias.</li>
        <li>Roughly <strong>−2% to +2%</strong> → neutral; beyond <strong>±5%</strong> → a strong skew.</li>
      </ul>
      <p>
        Skew also has a <strong>term structure</strong>: short-dated skew reflects the immediate
        mood, while 30–90 day skew reflects positioning and the macro backdrop.
      </p>

      <h2>Skew vs price — the early-warning signal</h2>
      <p>Skew often shifts <em>before</em> price does:</p>
      <ul>
        <li>
          <strong>Skew divergence:</strong> price makes new highs but skew turns more bearish
          (RR falling) → protection demand is rising into strength — a warning.
        </li>
        <li>
          <strong>Skew confirmation:</strong> price and skew move together → the trend has options
          positioning behind it.
        </li>
        <li>
          <strong>Extreme put skew at support</strong> + heavy hedging can mark capitulation —
          watch for{' '}
          <Link href="/learn/absorption-in-trading">absorption</Link> on the tape to confirm a turn.
        </li>
      </ul>

      <h2>Putting it together</h2>
      <ul>
        <li>High put skew + strong price → institutions hedging into strength (possible distribution).</li>
        <li>Call skew + weak price → contrarian bullish positioning → potential squeeze.</li>
        <li>Flat skew at a key level → no conviction → wait for confirmation.</li>
      </ul>

      <div className="callout">
        <p>
          <strong>Key takeaway:</strong> skew shows where fear and greed are priced in the options
          market, and it frequently turns before price. Read it alongside GEX and the footprint, not
          alone.
        </p>
      </div>

      <h2>See skew with your order flow</h2>
      <p>
        Senzoukria brings options context — skew, GEX, gamma walls — next to your{' '}
        <Link href="/learn/how-to-read-a-footprint-chart">footprint</Link>, so the positioning
        picture and the tape live on one screen. Free preview, no card —{' '}
        <Link href="/auth/register">start here</Link>.
      </p>
    </ArticleLayout>
  );
}
