import { useEffect } from "react";
import { useSimAccountStore } from "./useSimAccountStore";

/* ─── Module-level dedup ──────────────────────────────────────
 *
 * `useSimVoice` may be mounted by several React components at the
 * same time (parent shell + child SimTradePanel, for example). Per-
 * instance `useRef` would make each instance fire its own clip for
 * the same fill — double-trigger.
 *
 * We hold the last played `fill.ts` / `error.ts` at module scope so
 * the first hook instance to react wins, and the rest see the ts
 * already-played and short-circuit. Safe because there's exactly
 * one `useSimAccountStore` in the app — every instance sees the
 * same `lastFill` value at the same time.
 */
let lastPlayedFillTs: number | null = null;
let lastPlayedErrorTs: number | null = null;

/* ─── Audio strategy ────────────────────────────────────────────
 *
 * Pre-recorded MP3s in `public/sounds/` — preloaded once on mount so
 * playback is instantaneous and human-sounding.
 *
 *   order_filled.mp3   → opens + manual flatten + reverse + TP hit
 *   stop_filled.mp3    → stop-loss hit (auto)
 *   order_rejected.mp3 → any rejected order
 *
 * If a clip is missing, the event is silent (no robotic TTS fallback —
 * we'd rather have silence than a low-quality machine voice).
 */

const SOUND_FILLED = "/sounds/order_filled.mp3";
const SOUND_STOP = "/sounds/stop_filled.mp3";
const SOUND_REJECTED = "/sounds/order_rejected.mp3";

/** Native playback. Set to 1.0 to keep the recorded clip's original
 *  pitch. Drop below 1.0 (e.g. 0.92) for a deeper, slightly slower
 *  delivery. The Sarah recordings sound right at 1.0 so we keep them
 *  un-shifted. */
const PLAYBACK_RATE = 1.0;

/** Gain multiplier applied via Web Audio API. HTMLAudioElement.volume
 *  is capped at 1.0 by the browser, so when the source MP3 is mastered
 *  low (the Sarah clips are mixed quiet relative to system sounds) we
 *  need a real amplifier downstream to bring them up. 2.5 = +8 dB,
 *  well within safe headroom for a voice clip that won't clip on
 *  typical desktop output. Bump higher if Sarah is still soft. */
const VOICE_GAIN = 2.5;

/** Lazy-initialized shared AudioContext. We can't create it at module
 *  load time because browsers block AudioContext creation until a
 *  user gesture — the first Buy/Sell click is that gesture. */
let sharedCtx: AudioContext | null = null;
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

type AudioBank = {
  filled: HTMLAudioElement | null;
  stop: HTMLAudioElement | null;
  rejected: HTMLAudioElement | null;
};

function preloadAudio(src: string): Promise<HTMLAudioElement | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(null);
    const audio = new Audio(src);
    audio.preload = "auto";
    audio.volume = 1.0;
    const onReady = () => {
      audio.removeEventListener("canplaythrough", onReady);
      audio.removeEventListener("error", onErr);
      resolve(audio);
    };
    const onErr = () => {
      audio.removeEventListener("canplaythrough", onReady);
      audio.removeEventListener("error", onErr);
      resolve(null);
    };
    audio.addEventListener("canplaythrough", onReady, { once: true });
    audio.addEventListener("error", onErr, { once: true });
    audio.load();
  });
}

/** Play the cached audio element. Clones it so back-to-back fills
 *  overlap cleanly, then routes the clone through a Web Audio
 *  GainNode so we can amplify beyond the 1.0 ceiling enforced on
 *  HTMLAudioElement.volume. */
function playClip(audio: HTMLAudioElement | null): boolean {
  if (!audio) return false;
  try {
    const clone = audio.cloneNode(true) as HTMLAudioElement;
    clone.volume = 1.0;
    if (PLAYBACK_RATE !== 1.0) {
      type AudioWithPitch = HTMLAudioElement & {
        preservesPitch?: boolean;
        webkitPreservesPitch?: boolean;
        mozPreservesPitch?: boolean;
      };
      const cloneExt = clone as AudioWithPitch;
      cloneExt.preservesPitch = false;
      cloneExt.webkitPreservesPitch = false;
      cloneExt.mozPreservesPitch = false;
      clone.playbackRate = PLAYBACK_RATE;
    }
    // Route through Web Audio so we can amplify > 1.0. The
    // MediaElementSourceNode redirects the element's audio away
    // from the default speakers and into our gain → destination
    // chain. If the context isn't available (rare — only on very
    // old browsers) we fall back to native playback at unity gain.
    const ctx = getAudioContext();
    if (ctx) {
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      const src = ctx.createMediaElementSource(clone);
      const gain = ctx.createGain();
      gain.gain.value = VOICE_GAIN;
      src.connect(gain).connect(ctx.destination);
    }
    const p = clone.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}

/** Audio bank shared across every hook instance. Preload runs at
 *  module load (browser environment only); subsequent mounts reuse
 *  the same `HTMLAudioElement` references. */
const sharedBank: AudioBank = {
  filled: null,
  stop: null,
  rejected: null,
};
let bankInit = false;
async function ensureBankLoaded(): Promise<void> {
  if (bankInit) return;
  bankInit = true;
  const [filled, stop, rejected] = await Promise.all([
    preloadAudio(SOUND_FILLED),
    preloadAudio(SOUND_STOP),
    preloadAudio(SOUND_REJECTED),
  ]);
  sharedBank.filled = filled;
  sharedBank.stop = stop;
  sharedBank.rejected = rejected;
  if (!filled && !stop && !rejected) {
    console.info(
      "[sim/voice] No audio clips found. Drop MP3s in " +
        "public/sounds/ to enable voice feedback:\n" +
        "  public/sounds/order_filled.mp3\n" +
        "  public/sounds/stop_filled.mp3\n" +
        "  public/sounds/order_rejected.mp3",
    );
  }
}

export function useSimVoice() {
  const voiceEnabled = useSimAccountStore((s) => s.voiceEnabled);
  const lastFill = useSimAccountStore((s) => s.lastFill);
  const lastError = useSimAccountStore((s) => s.lastError);

  // Pre-load audio bank exactly once (shared across instances).
  useEffect(() => {
    void ensureBankLoaded();
  }, []);

  // Fills — pick the clip based on the fill reason. The module-
  // level `lastPlayedFillTs` guard means concurrent mounts of this
  // hook can't double-trigger on the same fill.
  useEffect(() => {
    if (!voiceEnabled || !lastFill) return;
    if (lastPlayedFillTs === lastFill.ts) return;
    lastPlayedFillTs = lastFill.ts;
    const isStop =
      lastFill.kind === "close" && lastFill.reason === "stop";
    const clip = isStop ? sharedBank.stop : sharedBank.filled;
    playClip(clip);
  }, [voiceEnabled, lastFill]);

  // Errors.
  useEffect(() => {
    if (!voiceEnabled || !lastError) return;
    if (lastPlayedErrorTs === lastError.ts) return;
    lastPlayedErrorTs = lastError.ts;
    playClip(sharedBank.rejected);
  }, [voiceEnabled, lastError]);
}
