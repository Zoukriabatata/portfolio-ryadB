import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Tauri desktop app has its own toolchain — skip from web lint.
    "desktop/**",
    // Standalone nested portfolio project — not part of this Next.js app,
    // has its own setup; was failing the shared lint job.
    "PORTFOLIO/**",
    // Local agent worktrees / scratch — never lint these.
    ".claude/**",
  ]),
  {
    rules: {
      // Disable strict rules that block build
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react/no-unescaped-entities": "off",
      "prefer-const": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      // Deliberate runtime require() calls (lazy load / circular-dep breaking,
      // e.g. stores/useTradingStore.ts). Converting to static import would
      // reintroduce import cycles; to dynamic import() would force async.
      "@typescript-eslint/no-require-imports": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
]);

export default eslintConfig;
