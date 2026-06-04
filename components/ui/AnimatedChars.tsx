'use client';

/**
 * AnimatedChars — per-character entrance for editorial headlines.
 *
 * Splits the input string into characters and renders each one as
 * an `inline-block` span with a staggered `animation-delay`. The
 * underlying `@keyframes charIn` lives in app/globals.css and
 * animates opacity + translateY + blur in a single GPU-friendly
 * declaration.
 *
 * Usage :
 *   <AnimatedChars text="WELCOME" baseDelay={200} />
 *
 * Notes :
 *   • Spaces are rendered with a non-breaking space so the layout
 *     doesn't collapse (`inline-block` spans drop leading whitespace).
 *   • For multi-line headlines, render two instances with a `<br />`
 *     in between and offset the second one's baseDelay so the lines
 *     read sequentially.
 *   • `aria-label` mirrors the original text so screen readers don't
 *     read each glyph as a separate word.
 *   • Respects `prefers-reduced-motion` — in that mode every glyph
 *     simply appears immediately (no animation).
 */
type AnimatedCharsProps = {
  text: string;
  baseDelay?: number;
  charDelay?: number;
  duration?: number;
};

export function AnimatedChars({
  text,
  baseDelay = 0,
  charDelay = 32,
  duration = 600,
}: AnimatedCharsProps) {
  return (
    <span aria-label={text} className="ac-root">
      {text.split('').map((c, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="ac-char"
          style={{
            display: 'inline-block',
            opacity: 0,
            whiteSpace: 'pre',
            animation: `charIn ${duration}ms cubic-bezier(.2,.7,.2,1) ${baseDelay + i * charDelay}ms forwards`,
          }}
        >
          {c === ' ' ? ' ' : c}
        </span>
      ))}
    </span>
  );
}
