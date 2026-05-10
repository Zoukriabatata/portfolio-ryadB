import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/core/**/*.ts", "src/render/**/*.ts"],
      exclude: [
        "src/core/**/*.test.ts",
        "src/render/**/*.test.ts",
        "src/core/index.ts",
        "src/core/types.ts",
        "src/render/Layer.ts",
        "src/render/LiquidityHeatmapLayer.ts",
        "src/render/gradient.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 75,
      },
    },
  },
});
