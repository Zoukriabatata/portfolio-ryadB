/**
 * Structured-data (JSON-LD) builders for SEO content pages.
 *
 * Canonical origin matches `app/sitemap.ts` exactly (NEXT_PUBLIC_APP_URL →
 * NEXTAUTH_URL → the Vercel production URL). It deliberately does NOT fall
 * back to localhost like `lib/config/app-url.ts` does — a canonical URL must
 * always be an absolute, reachable production origin. Once senzoukria.com is
 * registered and `NEXT_PUBLIC_APP_URL` is set on Vercel, every canonical and
 * JSON-LD URL switches over with no code change.
 */

export const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXTAUTH_URL ||
  'https://orderflow-v2.vercel.app';

export const SITE_NAME = 'Senzoukria';

/** Absolute URL for an in-site path (`/learn/...` → `https://…/learn/...`). */
export function abs(path: string): string {
  return `${SITE_URL}${path}`;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface BreadcrumbCrumb {
  name: string;
  path: string;
}

/** schema.org Article — the page itself. */
export function articleJsonLd(opts: {
  title: string;
  description: string;
  path: string;
  datePublished: string; // ISO date (YYYY-MM-DD)
  dateModified: string; // ISO date (YYYY-MM-DD)
}): Record<string, unknown> {
  const url = abs(opts.path);
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: opts.title,
    description: opts.description,
    datePublished: opts.datePublished,
    dateModified: opts.dateModified,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    author: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
    },
  };
}

/** schema.org BreadcrumbList — the trail shown above the title. */
export function breadcrumbJsonLd(crumbs: BreadcrumbCrumb[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: abs(c.path),
    })),
  };
}

/** schema.org FAQPage — eligible for FAQ rich results. */
export function faqJsonLd(items: FaqItem[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}

/** schema.org ItemList — used on the hub to enumerate the cluster. */
export function itemListJsonLd(
  items: { name: string; path: string }[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      url: abs(it.path),
    })),
  };
}
