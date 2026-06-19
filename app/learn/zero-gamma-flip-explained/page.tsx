import type { Metadata } from 'next';
import Link from 'next/link';
import ArticleLayout from '@/components/learn/ArticleLayout';
import { abs, type FaqItem } from '@/lib/seo/structuredData';

const PATH = '/learn/zero-gamma-flip-explained';
const TITLE = 'Zero Gamma (Gamma Flip) Level Explained';
const INTRO =
  'The zero-gamma level — the gamma flip — is the price where dealer gamma exposure changes sign. Above it the market tends to be calm and mean-reverting; below it, volatile and trending. It is the single most important GEX level.';
const META =
  'The zero-gamma (gamma flip) level explained: the price where dealer gamma flips sign, splitting a calm mean-reverting regime from a volatile trending one.';

export const metadata: Metadata = {
  title: TITLE,
  description: META,
  keywords: ['zero gamma', 'gamma flip', 'gamma flip level', 'GEX flip', 'negative gamma regime'],
  alternates: { canonical: abs(PATH) },
  openGraph: { title: TITLE, description: META, url: abs(PATH), type: 'article', images: ['/opengraph-image'] },
};

const FAQS: FaqItem[] = [
  {
    question: 'What is the zero-gamma (gamma flip) level?',
    answer:
      'The zero-gamma level is the price at which total dealer gamma exposure (GEX) changes sign. Above it, dealers are net long gamma (stabilizing); below it, net short gamma (destabilizing). It is the pivot between a calm regime and a volatile one.',
  },
  {
    question: 'Why does the gamma flip matter?',
    answer:
      'Because dealer hedging behavior reverses at the flip. Above it, hedging dampens moves (mean-reversion). Below it, hedging amplifies moves (trending, higher volatility). Breaking the flip often marks a regime change, so traders watch it closely.',
  },
  {
    question: 'How do you trade around the gamma flip?',
    answer:
      'Above the flip, favor mean-reversion and fading extremes. Below it, favor momentum and respect that selloffs and rallies can accelerate. Right at the flip, expect a transition zone with elevated volatility and false moves.',
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
        { name: 'Zero gamma flip', path: PATH },
      ]}
      faqs={FAQS}
    >
      <p>
        Of all the <Link href="/learn/what-is-gex-gamma-exposure">gamma exposure</Link> levels, one
        matters more than the rest: the <strong>zero-gamma level</strong>, also called the{' '}
        <strong>gamma flip</strong>. It is the price where dealer gamma changes sign — and with it,
        the entire behavior of the market.
      </p>

      <h2>What the flip is</h2>
      <p>
        Dealer GEX is positive at some prices and negative at others. The price where it crosses
        zero is the flip:
      </p>
      <ul>
        <li><strong>Above the flip:</strong> net <em>positive</em> gamma → dealers stabilize → calm, mean-reverting.</li>
        <li><strong>Below the flip:</strong> net <em>negative</em> gamma → dealers amplify → volatile, trending.</li>
      </ul>
      <p>
        So the same market has two personalities, split by one line. That is why the flip is the
        first level many options-aware traders mark each day.
      </p>

      <h2>Why hedging reverses at the flip</h2>
      <p>
        Above the flip, dealers are long gamma: they buy dips and sell rallies, which pushes price
        back toward the high-gamma strikes (see{' '}
        <Link href="/learn/gamma-walls-explained">gamma walls</Link>). Below the flip, they are short
        gamma: they sell dips and buy rallies, so their hedging now <em>chases</em> price. A selloff
        that crosses below the flip can therefore feed on itself.
      </p>

      <h2>Trading the regimes</h2>
      <ul>
        <li>
          <strong>Above the flip (positive gamma):</strong> fade extremes, expect ranges, trade
          mean-reversion. Breakouts often fail.
        </li>
        <li>
          <strong>Below the flip (negative gamma):</strong> trade with momentum, size down, and be
          careful fading — moves can extend further than they &quot;should&quot;.
        </li>
        <li>
          <strong>At the flip:</strong> transition zone. Volatility rises, whipsaws are common; wait
          for the market to pick a side.
        </li>
      </ul>

      <h2>The flip as a regime signal</h2>
      <p>
        A clean break <em>below</em> the zero-gamma level is one of the cleaner regime signals in
        markets: it says &quot;the dampeners are off.&quot; Reclaiming it back to the upside often
        restores the calm, mean-reverting behavior. Watch how price behaves <strong>at</strong> the
        level — a decisive break with momentum is different from a brief poke that gets bought back.
      </p>

      <h2>Common mistakes</h2>
      <ul>
        <li>Buying dips the same way below the flip as above it — below, dips can keep going.</li>
        <li>Treating the flip as a fixed line — it moves as positioning and open interest change, and resets around expiry.</li>
        <li>Ignoring the tape. Confirm the break with order flow — a{' '}
          <Link href="/learn/cumulative-delta-explained">cumulative delta</Link> that supports the move adds conviction.</li>
      </ul>

      <div className="callout">
        <p>
          <strong>Key takeaway:</strong> the zero-gamma flip splits a calm, mean-reverting market
          (above) from a volatile, trending one (below). Know which side you are on before you pick
          a strategy.
        </p>
      </div>

      <h2>Watch the flip in real time</h2>
      <p>
        Senzoukria marks the zero-gamma level with the call and put walls, right next to your
        footprint — so you can see the regime and the tape together. Free preview, no card —{' '}
        <Link href="/auth/register">start here</Link>.
      </p>
    </ArticleLayout>
  );
}
