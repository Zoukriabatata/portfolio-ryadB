import { describe, it, expect } from 'vitest';
import { nextBestAction } from '@/lib/ai/sales/nextBestAction';

describe('nextBestAction', () => {
  it('cold discovery → download CTA', () => {
    const r = nextBestAction("c'est quoi le footprint ?");
    expect(r.temperature).toBe('cold');
    expect(r.ctas.map(c => c.kind)).toContain('download');
  });

  it('hot buying intent → checkout CTA', () => {
    const r = nextBestAction('comment je m\'abonne, c\'est combien le plan pro ?');
    expect(r.temperature).toBe('hot');
    expect(r.ctas.map(c => c.kind)).toContain('checkout');
  });

  it('warm objection → email capture offered', () => {
    const r = nextBestAction('ça marche avec mon compte Apex ? je suis pas sûr');
    expect(r.temperature).toBe('warm');
    expect(r.ctas.map(c => c.kind)).toContain('email');
  });

  it('handoff signal → discord CTA', () => {
    const r = nextBestAction('je veux parler à un humain, j\'ai un cas particulier');
    expect(r.ctas.map(c => c.kind)).toContain('discord');
  });

  it('empty message → safe default (cold, download)', () => {
    const r = nextBestAction('');
    expect(r.temperature).toBe('cold');
    expect(r.ctas.length).toBeGreaterThan(0);
  });

  it('resolves hrefs for link CTAs (download/checkout/discord)', () => {
    const r = nextBestAction('je veux acheter');
    const checkout = r.ctas.find(c => c.kind === 'checkout');
    expect(checkout?.href).toBeTruthy();
  });
});
