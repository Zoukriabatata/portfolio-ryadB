/* ─── Landing "order filled" voice cue ──────────────────────────────
 *
 * Reuses the desktop "order filled" clip (Sarah recording — see
 * `public/sounds/order_filled.mp3`) for the hero SCROLL micro-interaction.
 *
 * The clip is mastered quiet, so playback is routed through a Web Audio
 * GainNode (+8 dB ≈ 2.5×) to bring it up. `HTMLAudioElement.volume` is
 * capped at 1.0 by the browser and would be too soft. Same rationale as
 * the desktop hook `desktop/src/lib/sim/useSimVoice.ts`.
 *
 * We decode the clip into an AudioBuffer up-front (`prefetchOrderFilled`,
 * call it on hover/mount — `decodeAudioData` needs no user gesture). Only
 * `resume()` + playback need a gesture, which the SCROLL click provides.
 */

const SOUND_FILLED = "/sounds/order_filled.mp3";

/** Gain applied via Web Audio. 2.5 ≈ +8 dB — the Sarah clip is mixed low
 *  relative to system sounds; safe headroom for a single voice clip. */
const VOICE_GAIN = 2.5;

let sharedCtx: AudioContext | null = null;
let buffer: AudioBuffer | null = null;
let decoding: Promise<void> | null = null;

/** Lazy shared AudioContext. Browsers may create it suspended before a
 *  gesture; we resume it on the click in `playOrderFilled`. */
function getAudioContext(): AudioContext | null {
  if (sharedCtx) return sharedCtx;
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  try {
    sharedCtx = new Ctor();
    return sharedCtx;
  } catch {
    return null;
  }
}

function startSource(ctx: AudioContext): void {
  if (!buffer) return;
  try {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = VOICE_GAIN;
    src.connect(gain).connect(ctx.destination);
    src.start(0);
  } catch {
    /* silent — we prefer no sound over a broken/robotic cue */
  }
}

/** Fetch + decode the clip once. Safe before any user gesture. Call on
 *  hover/mount to remove first-click latency. Idempotent. */
export function prefetchOrderFilled(): void {
  if (buffer || decoding) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  decoding = (async () => {
    try {
      const res = await fetch(SOUND_FILLED);
      if (!res.ok) return;
      const arr = await res.arrayBuffer();
      buffer = await ctx.decodeAudioData(arr);
    } catch {
      /* silent — clip missing/undecodable → no fallback */
    }
  })();
}

/** Play the "order filled" cue, amplified. Call from a user gesture (the
 *  SCROLL click) so the AudioContext can resume. If the clip isn't decoded
 *  yet, kicks off the decode and plays as soon as it's ready. */
export function playOrderFilled(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  if (buffer) {
    startSource(ctx);
    return;
  }
  prefetchOrderFilled();
  decoding?.then(() => startSource(ctx)).catch(() => {});
}
