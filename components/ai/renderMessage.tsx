/**
 * Renders a chat message string with clickable URLs.
 * Splits on http(s) URLs and wraps them in <a> tags.
 */

const URL_RE = /(https?:\/\/[^\s]+)/g;

export function renderMessage(text: string, isUser: boolean) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) =>
        URL_RE.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: isUser ? '#000' : 'var(--primary)',
              textDecoration: 'underline',
              fontWeight: 600,
              wordBreak: 'break-all',
            }}
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
