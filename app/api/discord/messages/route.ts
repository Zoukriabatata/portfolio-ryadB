import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireTier } from '@/lib/auth/api-middleware';

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

export const runtime = 'nodejs';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req);
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: authResult.headers });
  }
  const tierCheck = await requireTier('PRO', authResult.user.tier);
  if (tierCheck) {
    return NextResponse.json({ error: tierCheck.error }, { status: tierCheck.status });
  }

  if (!DISCORD_BOT_TOKEN || !DISCORD_CHANNEL_ID) {
    return NextResponse.json(
      { error: 'DISCORD_BOT_TOKEN or DISCORD_CHANNEL_ID not configured' },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '25'), 50);

  try {
    const res = await fetch(
      `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages?limit=${limit}`,
      {
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        // fresh every call — the dashboard polls
        cache: 'no-store',
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Discord API error ${res.status}`, detail: text },
        { status: res.status }
      );
    }

    interface DiscordMessage {
      id: string;
      content: string;
      timestamp: string;
      author: {
        id: string;
        username: string;
        discriminator: string;
        avatar: string | null;
        global_name: string | null;
      };
      reactions?: Array<{ emoji: { name: string }; count: number }>;
      attachments?: Array<{ url: string; content_type?: string }>;
    }

    const raw: DiscordMessage[] = await res.json();

    const messages = raw.map(m => ({
      id: m.id,
      user: m.author.global_name ?? m.author.username,
      // first two initials of the display name
      avatar: (m.author.global_name ?? m.author.username)
        .slice(0, 2)
        .toUpperCase(),
      // stable deterministic hue from user id
      color: idToColor(m.author.id),
      message: m.content,
      timestamp: m.timestamp,
      reactions: (m.reactions ?? []).map(r => ({
        emoji: r.emoji.name,
        count: r.count,
      })),
      hasImage:
        m.attachments?.some(a =>
          a.content_type?.startsWith('image/') ?? a.url.match(/\.(png|jpg|jpeg|gif|webp)$/i)
        ) ?? false,
    }));

    return NextResponse.json(messages);
  } catch (err) {
    console.error('[discord/messages]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/** Map a Discord snowflake ID to a deterministic CSS color string */
function idToColor(id: string): string {
  // hash last 6 chars of the 64-bit snowflake
  const seed = parseInt(id.slice(-6), 10) || 0;
  const hues = [210, 160, 280, 30, 340, 190, 50, 120];
  const hue = hues[seed % hues.length];
  return `hsl(${hue}, 70%, 65%)`;
}
