import "./ComingSoonRoute.css";

type Props = {
  title: string;
  /** "DD/MM/YYYY" — shown verbatim. */
  availableOn: string;
  description?: string;
};

export function ComingSoonRoute({ title, availableOn, description }: Props) {
  return (
    <div className="cs-route">
      <div className="cs-card">
        <div className="cs-badge">Coming soon</div>
        <h1 className="cs-title">{title}</h1>
        {description && <p className="cs-desc">{description}</p>}
        <div className="cs-date-row">
          <span className="cs-date-label">Available on</span>
          <span className="cs-date-value">{availableOn}</span>
        </div>
        <div className="cs-footer">Stay tuned for the next update.</div>
      </div>
    </div>
  );
}
