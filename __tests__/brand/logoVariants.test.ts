import { describe, it, expect } from 'vitest';
import { resolveMarkColors } from '@/components/ui/brand/logoVariants';

// Les couleurs sont tokenisées sur le thème → on vérifie qu'elles pointent
// vers les bonnes variables CSS (pas des hex codés en dur).
describe('resolveMarkColors', () => {
  it('default = jeton thème, accent primary', () => {
    const c = resolveMarkColors('default');
    expect(c.symbol).toBe('var(--text-primary)');
    expect(c.electron).toBe('var(--primary)');
    expect(c.fill).toBe('url(#szFill)');
  });
  it('mono = texte primaire, pas d’accent', () => {
    const c = resolveMarkColors('mono');
    expect(c.symbol).toBe('var(--text-primary)');
    expect(c.electron).toBe('var(--text-primary)');
  });
  it('light = symbole sombre sur fond clair', () => {
    expect(resolveMarkColors('light').symbol).toBe('#0a0c16');
    expect(resolveMarkColors('light').electron).toBe('var(--primary-dark)');
  });
  it('stone = neutre pierre (var --stone)', () => {
    expect(resolveMarkColors('stone').symbol).toBe('var(--stone)');
  });
});
