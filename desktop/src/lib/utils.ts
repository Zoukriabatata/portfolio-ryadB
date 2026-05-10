import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Tailwind class merger — combines clsx (conditional class building)
 * with tailwind-merge (de-duplicates conflicting utility classes so
 * that e.g. `cn("px-2", "px-4")` resolves to `"px-4"` instead of both).
 *
 * Idiomatic shadcn/Senzoukria pattern; reused across components.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
