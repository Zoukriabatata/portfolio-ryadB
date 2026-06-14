/**
 * Deterministic next-best-action for the sales chat.
 * The LLM handles conversation; THIS handles actions + risky facts (links).
 * No ML — keyword/stage heuristics over the latest message (+ optional history).
 */
export type Temperature = 'cold' | 'warm' | 'hot';
export type CtaKind = 'download' | 'checkout' | 'email' | 'discord';

export interface Cta {
  kind: CtaKind;
  label: string;
  href?: string; // absent for 'email' (opens inline form)
}

export interface NextBestAction {
  temperature: Temperature;
  handoff: boolean;
  ctas: Cta[];
}

const DOWNLOAD_URL = process.env.NEXT_PUBLIC_DOWNLOAD_URL || '/download';
const PRICING_URL = process.env.NEXT_PUBLIC_PRICING_URL || '/pricing';
const DISCORD_URL = process.env.DISCORD_INVITE_URL || '';

const HOT_KW = ['abonn', 'acheter', 'achat', 'payer', 'prix', 'combien', 'tarif', 'plan pro', 'souscri', 'checkout', 'subscribe', 'buy', 'price'];
const WARM_KW = ['marche avec', 'compatible', 'apex', 'rithmic', 'ninjatrader', 'quantower', 'data réelle', 'vraie data', 'vs ', 'compar', 'différence', 'pas sûr', 'hésit', 'mais ', 'objection', 'sécur', 'mac', 'windows'];
const HANDOFF_KW = ['humain', 'parler à', 'quelqu\'un', 'support', 'cas particulier', 'entreprise', 'b2b', 'équipe', 'appel', 'call', 'rendez-vous'];

function downloadCta(): Cta { return { kind: 'download', label: "Télécharger l'app", href: DOWNLOAD_URL }; }
function checkoutCta(): Cta { return { kind: 'checkout', label: 'Voir les offres', href: PRICING_URL }; }
function emailCta(): Cta { return { kind: 'email', label: 'Rester informé' }; }
function discordCta(): Cta { return { kind: 'discord', label: "Parler à l'équipe", href: DISCORD_URL || undefined }; }

export function nextBestAction(
  message: string,
  _history: Array<{ role: string; content: string }> = [],
): NextBestAction {
  const m = (message || '').toLowerCase();

  const handoff = HANDOFF_KW.some(k => m.includes(k));
  const isHot = HOT_KW.some(k => m.includes(k));
  const isWarm = !isHot && WARM_KW.some(k => m.includes(k));

  let temperature: Temperature = 'cold';
  const ctas: Cta[] = [];

  if (isHot) {
    temperature = 'hot';
    ctas.push(checkoutCta(), emailCta());
  } else if (isWarm) {
    temperature = 'warm';
    ctas.push(emailCta(), downloadCta());
  } else {
    temperature = 'cold';
    ctas.push(downloadCta());
  }

  if (handoff) ctas.unshift(discordCta());

  return { temperature, handoff, ctas };
}
