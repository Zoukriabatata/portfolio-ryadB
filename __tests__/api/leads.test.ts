import { describe, it, expect, vi, beforeEach } from 'vitest';

const create = vi.fn();
const update = vi.fn();
const sendEmail = vi.fn().mockResolvedValue(true);

vi.mock('@/lib/db', () => ({
  prisma: { lead: { create: (...a: unknown[]) => create(...a), update: (...a: unknown[]) => update(...a) } },
  isPrismaAvailable: () => true,
}));
vi.mock('@/lib/auth/email-verification', () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
vi.mock('@/lib/auth/rate-limiter', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  tooManyRequests: () => new Response('rate', { status: 429 }),
}));

import { POST } from '@/app/api/leads/route';

function req(body: unknown) {
  return new Request('http://localhost/api/leads', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('POST /api/leads', () => {
  beforeEach(() => { create.mockReset().mockResolvedValue({ id: 'lead_1' }); update.mockReset(); sendEmail.mockClear(); });

  it('rejects an invalid email', async () => {
    const res = await POST(req({ email: 'not-an-email' }) as never);
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a lead and notifies admin', async () => {
    const res = await POST(req({ email: 'trader@example.com', temperature: 'hot', topic: 'apex', page: '/' }) as never);
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it('still succeeds (lead kept) when the admin email fails', async () => {
    sendEmail.mockResolvedValueOnce(false);
    const res = await POST(req({ email: 'trader@example.com' }) as never);
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledOnce();
  });
});
