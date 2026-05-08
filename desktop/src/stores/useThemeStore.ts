import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Theme variant store. The web supports multiple visual presets
 * (default Senzoukria dark, plus a few experimental ones). The
 * desktop V1 shell only ships the default for M1 — extra presets
 * arrive when M3/M4 demands swap-able heatmap themes.
 *
 * The actual color values live as CSS variables in
 * desktop/src/styles/globals.css; this store only tracks which
 * preset is active so a future ThemePicker can flip a class on
 * <html> and have the variables resolve differently.
 */

export type ThemeVariant = "senzoukria-dark";

type ThemeState = {
  variant: ThemeVariant;
  setVariant: (v: ThemeVariant) => void;
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      variant: "senzoukria-dark",
      setVariant: (variant) => set({ variant }),
    }),
    {
      name: "senzoukria-theme-v1",
    },
  ),
);
