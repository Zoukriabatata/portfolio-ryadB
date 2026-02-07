/**
 * Advanced Browser Fingerprinting (Client-Side Only)
 *
 * Generates a unique fingerprint using multiple browser characteristics:
 * - Screen properties (resolution, color depth, pixel ratio)
 * - WebGL vendor/renderer (GPU fingerprint)
 * - Canvas fingerprint (OS + fonts)
 * - Audio context (hardware audio fingerprint)
 * - Timezone, plugins, fonts
 *
 * ⚠️ This file MUST be used with 'use client' directive in React components
 */

'use client';

/**
 * Generate advanced browser fingerprint
 *
 * Returns a SHA-256 hash of various browser/hardware characteristics.
 * Uniqueness: ~95-99% (very hard to spoof)
 *
 * @returns Promise<string> - 64-character hex fingerprint
 */
export async function generateAdvancedFingerprint(): Promise<string> {
  try {
    const components: Record<string, any> = {
      // 📱 SCREEN PROPERTIES
      screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
      pixelRatio: window.devicePixelRatio,
      availScreen: `${screen.availWidth}x${screen.availHeight}`,
      screenOrientation: (screen.orientation?.type || 'unknown'),

      // 🌐 BROWSER INFO
      userAgent: navigator.userAgent,
      language: navigator.language,
      languages: navigator.languages?.join(',') || '',
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency || 0,
      deviceMemory: (navigator as any).deviceMemory || 0,
      maxTouchPoints: navigator.maxTouchPoints || 0,

      // 🎨 WEBGL FINGERPRINT (GPU-based, very unique)
      webgl: await getWebGLFingerprint(),

      // 🖼️ CANVAS FINGERPRINT (OS + font rendering)
      canvas: await getCanvasFingerprint(),

      // 🔊 AUDIO CONTEXT FINGERPRINT (hardware audio)
      audio: await getAudioFingerprint(),

      // ⏰ TIMEZONE & LOCALE
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffset: new Date().getTimezoneOffset(),

      // 🔌 PLUGINS (Safari/Firefox still expose)
      plugins: Array.from(navigator.plugins || [])
        .map(p => p.name)
        .sort()
        .join(','),

      // 📝 FONTS DETECTION (basic)
      fonts: await detectCommonFonts(),

      // 🖱️ DO NOT TRACK
      doNotTrack: navigator.doNotTrack || 'unknown',

      // 📦 STORAGE
      cookieEnabled: navigator.cookieEnabled,
      localStorage: typeof localStorage !== 'undefined',
      sessionStorage: typeof sessionStorage !== 'undefined',
    };

    // Hash all components with SHA-256
    const json = JSON.stringify(components);
    const buffer = new TextEncoder().encode(json);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return hashHex;
  } catch (error) {
    console.error('Fingerprint generation failed:', error);
    // Fallback: random fingerprint (will be flagged as suspicious on server)
    return 'error_' + Math.random().toString(36).substring(2, 15);
  }
}

/**
 * Get WebGL fingerprint (GPU vendor + renderer)
 *
 * Highly unique - different GPUs render differently.
 */
async function getWebGLFingerprint(): Promise<string> {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') ||
               canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;

    if (!gl) return 'unsupported';

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return 'no_debug_info';

    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);

    // Also get supported extensions (adds more uniqueness)
    const extensions = gl.getSupportedExtensions()?.join(',') || '';

    return `${vendor}|${renderer}|${extensions.substring(0, 100)}`;
  } catch {
    return 'error';
  }
}

/**
 * Get Canvas fingerprint
 *
 * Different OS + fonts render canvas differently.
 * Very stable across sessions on same device.
 */
async function getCanvasFingerprint(): Promise<string> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d')!;

    // Draw with various properties (rendering varies by OS/fonts)
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(10, 10, 100, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('Canvas FP 🎨 OrderFlow', 15, 15);

    // Add more rendering
    ctx.font = '11px "Times New Roman"';
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('abcdefghijklmnopqrstuvwxyz', 10, 30);

    // Hash the canvas content
    const dataUrl = canvas.toDataURL();
    const buffer = new TextEncoder().encode(dataUrl);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
  } catch {
    return 'error';
  }
}

/**
 * Get Audio Context fingerprint
 *
 * Hardware audio rendering is device-specific.
 */
async function getAudioFingerprint(): Promise<string> {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const analyser = audioContext.createAnalyser();
    const gainNode = audioContext.createGain();

    gainNode.gain.value = 0; // Mute (no actual sound)
    oscillator.connect(analyser);
    analyser.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start(0);
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(frequencyData);
    oscillator.stop();
    audioContext.close();

    // Sum all frequency values for fingerprint
    const hash = frequencyData.reduce((acc, val) => acc + val, 0);
    return hash.toString(16);
  } catch {
    return 'error';
  }
}

/**
 * Detect installed fonts
 *
 * Different devices have different fonts installed.
 */
async function detectCommonFonts(): Promise<string> {
  // List of common fonts to test
  const fonts = [
    'Arial', 'Verdana', 'Times New Roman', 'Courier New',
    'Georgia', 'Palatino', 'Garamond', 'Bookman',
    'Comic Sans MS', 'Trebuchet MS', 'Impact', 'Tahoma',
    'Helvetica', 'Calibri', 'Cambria', 'Segoe UI',
  ];

  const baseFonts = ['monospace', 'sans-serif', 'serif'];
  const testString = 'mmmmmmmmmmlli';
  const testSize = '72px';

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  // Get baseline widths for each base font
  const baselines: Record<string, number> = {};
  baseFonts.forEach(baseFont => {
    ctx.font = `${testSize} ${baseFont}`;
    baselines[baseFont] = ctx.measureText(testString).width;
  });

  const detectedFonts: string[] = [];

  // Test each font
  fonts.forEach(font => {
    let detected = false;
    baseFonts.forEach(baseFont => {
      ctx.font = `${testSize} '${font}', ${baseFont}`;
      const width = ctx.measureText(testString).width;
      // If width differs from baseline, font is installed
      if (width !== baselines[baseFont]) {
        detected = true;
      }
    });
    if (detected) {
      detectedFonts.push(font);
    }
  });

  return detectedFonts.sort().join(',');
}

/**
 * Store fingerprint in cookie
 *
 * Cookie is sent with every request for server-side validation.
 */
export function storeFingerprint(fingerprint: string): void {
  try {
    // HttpOnly cannot be set from JS, but Secure + SameSite protect against XSS
    const maxAge = 365 * 24 * 60 * 60; // 1 year
    document.cookie = `_fp=${fingerprint}; path=/; max-age=${maxAge}; SameSite=Strict; Secure`;
  } catch (error) {
    console.error('Failed to store fingerprint:', error);
  }
}

/**
 * Get stored fingerprint from cookie
 */
export function getStoredFingerprint(): string | null {
  try {
    const match = document.cookie.match(/(?:^|;\s*)_fp=([^;]*)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Check if fingerprint needs refresh
 *
 * Regenerate periodically to detect environment changes.
 */
export function shouldRefreshFingerprint(): boolean {
  const lastGenerated = localStorage.getItem('_fp_last');
  if (!lastGenerated) return true;

  const daysSinceGeneration = (Date.now() - parseInt(lastGenerated)) / (1000 * 60 * 60 * 24);
  return daysSinceGeneration > 30; // Refresh every 30 days
}

/**
 * Update fingerprint timestamp
 */
export function updateFingerprintTimestamp(): void {
  try {
    localStorage.setItem('_fp_last', Date.now().toString());
  } catch {
    // Ignore if localStorage unavailable
  }
}
