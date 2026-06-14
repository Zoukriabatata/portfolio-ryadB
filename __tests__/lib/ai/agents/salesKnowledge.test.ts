import { describe, it, expect } from 'vitest';
import { loadSalesKnowledge } from '@/lib/ai/agents/salesKnowledge';

describe('loadSalesKnowledge', () => {
  it('loads the curated sales markdown with key sections', () => {
    const kb = loadSalesKnowledge();
    expect(kb).toContain('PITCH & POSITIONNEMENT');
    expect(kb).toContain('COMPATIBILITÉ BROKERS');
    expect(kb).toContain('OBJECTIONS FRÉQUENTES');
  });

  it('caches the result (same reference on second call)', () => {
    expect(loadSalesKnowledge()).toBe(loadSalesKnowledge());
  });
});
