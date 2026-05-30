// Geist Sans + Mono font setup (matches the orderflow-v2 web codebase).
//
// Variable woff2 files are copied at build-prep time from
// `node_modules/geist/dist/fonts/{geist-sans,geist-mono}/` into
// `public/fonts/`, which Vite serves at `/fonts/*` in dev and bundles
// in production. The `geist` npm package guards its `dist/` directory
// behind `exports`, so a direct `?url` import is rejected — copying
// the files into `public/` is the official Vite escape hatch.

export function injectGeistFonts(): void {
  if (document.getElementById("senzoukria-geist-fonts")) return;
  const style = document.createElement("style");
  style.id = "senzoukria-geist-fonts";
  style.textContent = `
    @font-face {
      font-family: 'Geist';
      src: url('/fonts/Geist-Variable.woff2') format('woff2-variations');
      font-weight: 100 900;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'Geist Mono';
      src: url('/fonts/GeistMono-Variable.woff2') format('woff2-variations');
      font-weight: 100 900;
      font-style: normal;
      font-display: swap;
    }
    :root {
      --font-sans: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      --font-mono: 'Geist Mono', ui-monospace, 'SF Mono', 'Consolas', 'Courier New', monospace;
    }
    html, body, button, input, select, textarea {
      font-family: var(--font-sans);
      font-feature-settings: 'cv11', 'ss01', 'ss03';
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    code, pre, kbd, samp {
      font-family: var(--font-mono);
    }
  `;
  document.head.appendChild(style);
}
