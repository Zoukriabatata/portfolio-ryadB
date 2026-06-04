/**
 * Lightweight className joiner — filters out `false / null / undefined`
 * so callers can pass conditional fragments cleanly. We deliberately
 * skip `clsx + tailwind-merge` to avoid two new runtime deps for a
 * single util; the dashboard widgets don't compose Tailwind classes
 * deeply enough to justify the merge cost.
 */
export function cn(
  ...inputs: Array<string | false | null | undefined>
): string {
  return inputs.filter(Boolean).join(" ");
}
