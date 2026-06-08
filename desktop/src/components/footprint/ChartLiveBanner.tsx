import "./ChartLiveBanner.css";

interface ChartLiveBannerProps {
  isLive: boolean;
  onGoLive: () => void;
  onResetScale: () => void;
}

export function ChartLiveBanner({ isLive, onGoLive, onResetScale }: ChartLiveBannerProps) {
  return (
    <div className={`chart-live-banner${isLive ? " hidden" : ""}`}>
      <div className="chart-live-banner__dot" />
      <span className="chart-live-banner__label">Historique</span>
      <button
        className="chart-live-banner__btn chart-live-banner__btn--live"
        onClick={onGoLive}
        title="Retour à la dernière barre"
      >
        → Live
      </button>
      <button
        className="chart-live-banner__btn"
        onClick={onResetScale}
        title="Réinitialiser le zoom"
      >
        ↺ Scale
      </button>
    </div>
  );
}
