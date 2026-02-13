'use client';

interface OpacitySliderProps {
  value: number;
  onChange: (opacity: number) => void;
  label?: string;
  className?: string;
}

export function OpacitySlider({
  value,
  onChange,
  label = 'Opacity',
  className = '',
}: OpacitySliderProps) {
  const percentage = Math.round(value * 100);

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs text-white/60">{label}</label>
        <span className="text-xs text-white/80">{percentage}%</span>
      </div>

      <input
        type="range"
        min="0"
        max="100"
        value={percentage}
        onChange={(e) => onChange(parseInt(e.target.value) / 100)}
        className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
        style={{
          background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${percentage}%, rgba(255,255,255,0.1) ${percentage}%, rgba(255,255,255,0.1) 100%)`,
        }}
      />
    </div>
  );
}
