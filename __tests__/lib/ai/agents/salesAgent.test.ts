import { describe, it, expect } from 'vitest';
import { buildSalesMessages } from '@/lib/ai/agents/salesAgent';

describe('buildSalesMessages', () => {
  it('puts a soft-sell system prompt first, with the KB and anti-hallucination rules', () => {
    const msgs = buildSalesMessages('ça marche avec Apex ?');
    expect(msgs[0].role).toBe('system');
    const sys = msgs[0].content;
    expect(sys).toContain('PITCH & POSITIONNEMENT'); // KB injected
    expect(sys.toLowerCase()).toContain('conseil'); // soft-sell expert tone
    expect(sys.toLowerCase()).toContain("n'invente"); // anti-hallucination
  });

  it('appends trimmed history then the new user message last', () => {
    const history = Array.from({ length: 20 }, (_, i) => ({ role: 'user' as const, content: `m${i}` }));
    const msgs = buildSalesMessages('dernière question', history);
    expect(msgs[msgs.length - 1]).toEqual({ role: 'user', content: 'dernière question' });
    // system + at most 16 history + 1 new = <= 18
    expect(msgs.length).toBeLessThanOrEqual(18);
  });
});
