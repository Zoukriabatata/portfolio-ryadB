interface LoadingOverlayProps {
  loadingPhase: 'fetching' | 'rendering' | 'connecting' | null;
  backgroundColor: string;
  theme: {
    colors: {
      toolActive: string;
      textSecondary: string;
      border: string;
    };
  };
}

export default function LoadingOverlay({ loadingPhase, backgroundColor, theme }: LoadingOverlayProps) {
  if (!loadingPhase) return null;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center z-10 fade-in"
      style={{
        backgroundColor: `${backgroundColor}f0`,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div className="flex flex-col items-center gap-3 w-48 chart-panel-enter">
        <div
          className="w-7 h-7 border-2 border-t-transparent rounded-full spinner"
          style={{ borderColor: theme.colors.toolActive }}
        />

        <span className="text-xs font-medium animate-pulse" style={{ color: theme.colors.textSecondary }}>
          {loadingPhase === 'fetching' && 'Fetching history...'}
          {loadingPhase === 'rendering' && 'Rendering chart...'}
          {loadingPhase === 'connecting' && 'Connecting live feed...'}
        </span>

        <div className="flex items-center gap-2">
          {(['fetching', 'rendering', 'connecting'] as const).map((phase, i) => {
            const phases = ['fetching', 'rendering', 'connecting'];
            const currentIdx = phases.indexOf(loadingPhase);
            const isDone = i < currentIdx;
            const isActive = i === currentIdx;
            return (
              <div key={phase} className="flex items-center gap-2">
                {i > 0 && (
                  <div
                    className={`w-6 h-px transition-all duration-500 ${isDone ? 'progress-bar' : ''}`}
                    style={{ backgroundColor: isDone ? theme.colors.toolActive : theme.colors.border }}
                  />
                )}
                <div
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${isActive ? 'glow-pulse' : ''} ${isDone ? 'scale-bounce' : ''}`}
                  style={{
                    backgroundColor: isDone || isActive ? theme.colors.toolActive : theme.colors.border,
                    transform: isActive ? 'scale(1.3)' : 'scale(1)',
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
