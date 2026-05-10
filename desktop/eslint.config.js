import tseslint from "typescript-eslint";

// REFONTE-1 : la config ne lint QUE le code de la refonte (src/core,
// src/render, src/adapters). Le code pré-existant (footprint, routes
// historiques, stores, etc.) sera lintée dans une PR dédiée — hors scope
// de la refonte heatmap.
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "rithmic-sdk/**",
      "src-tauri/**",
      "src/_legacy/**",
      "src/App.tsx",
      "src/main.tsx",
      "src/config.ts",
      "src/UpdateChecker.tsx",
      "src/WelcomeScreen.tsx",
      "src/vite-env.d.ts",
      "src/components/**",
      "src/lib/**",
      "src/routes/**",
      "src/stores/**",
      "src/styles/**",
      "src/types/**",
      "src/assets/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // REFONTE-5 : bloque tout retour silencieux d'imports legacy.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/_legacy/*", "**/_legacy"],
              message:
                "Imports depuis _legacy/ interdits (REFONTE-5 cleanup). Code archivé dans une commit antérieure si besoin de référence.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/render/**/*.{ts,tsx}", "src/adapters/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message:
            "Date.now() interdit dans render/ et adapters/ (cf. ANTI-PATTERNS du brief refonte). Utilise ClockSource + GridSystem.",
        },
        {
          selector:
            "CallExpression[callee.object.name='performance'][callee.property.name='now']",
          message:
            "performance.now() interdit pour timestamper de la data dans render/ et adapters/.",
        },
      ],
    },
  },
);
