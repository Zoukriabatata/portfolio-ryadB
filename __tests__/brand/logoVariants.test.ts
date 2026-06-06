import { describe, it, expect } from 'vitest';
import { resolveMarkColors } from '@/components/ui/brand/logoVariants';

describe('resolveMarkColors', () => {
  it('default = jeton sombre, accent lime', () => {
    const c = resolveMarkColors('default');
    expect(c.symbol).toBe('#e8eaf6');
    expect(c.electron).toBe('#4ade80');
    expect(c.fill).toBe('url(#szFill)');
  });
  it('mono = tout blanc cassé, pas de lime', () => {
    const c = resolveMarkColors('mono');
    expect(c.symbol).toBe('#e8eaf6');
    expect(c.electron).toBe('#e8eaf6');
  });
  it('light = symbole sombre sur fond clair', () => {
    expect(resolveMarkColors('light').symbol).toBe('#0a0c16');
  });
  it('stone = gris pierre', () => {
    expect(resolveMarkColors('stone').symbol).toBe('#cfd2df');
  });
});
