import { describe, it, expect, vi, beforeEach } from 'vitest';

const create = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: { chatEvent: { create: (...a: unknown[]) => create(...a) } },
  isPrismaAvailable: () => true,
}));
vi.mock('@/lib/auth/rate-limiter', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  tooManyRequests: () => new Response('rate', { status: 429 }),
}));

import { POST } from '@/app/api/events/route';

function req(body: unknown) {
  return new Request('http://localhost/api/events', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('POST /api/events', () => {
  beforeEach(() => { create.mockReset().mockResolvedValue({ id: 'e1' }); });

  it('records a valid event', async () => {
    const res = await POST(req({ sessionId: 's1', type: 'cta_clicked', ctaType: 'download', page: '/' }) as never);
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledOnce();
  });

  it('rejects an unknown event type', async () => {
    const res = await POST(req({ sessionId: 's1', type: 'bogus' }) as never);
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('never throws on DB failure (best-effort)', async () => {
    create.mockRejectedValueOnce(new Error('db down'));
    const res = await POST(req({ sessionId: 's1', type: 'opened' }) as never);
    expect(res.status).toBe(200);
  });
});
