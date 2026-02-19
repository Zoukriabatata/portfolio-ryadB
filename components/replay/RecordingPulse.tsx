'use client';

interface RecordingPulseProps {
  symbol: string;
}

export default function RecordingPulse({ symbol }: RecordingPulseProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative w-5 h-5">
        {/* Center dot */}
        <div className="absolute inset-[5px] rounded-full" style={{ background: 'var(--error)' }} />
        {/* Ring 1 */}
        <div
          className="absolute inset-0 rounded-full pulse-ring"
          style={{ borderColor: 'var(--error)' }}
        />
        {/* Ring 2 (delayed) */}
        <div
          className="absolute inset-0 rounded-full pulse-ring"
          style={{ borderColor: 'var(--error)', animationDelay: '0.5s' }}
        />
      </div>
      <span
        className="text-sm font-semibold tracking-wider"
        style={{ color: 'var(--error)' }}
      >
        REC {symbol}
      </span>
    </div>
  );
}
