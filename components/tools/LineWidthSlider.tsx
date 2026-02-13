'use client';

const LINE_WIDTHS = [1, 2, 3, 4, 5];

interface LineWidthSliderProps {
  value: number;
  onChange: (width: number) => void;
  label?: string;
  className?: string;
}

export function LineWidthSlider({
  value,
  onChange,
  label = 'Line Width',
  className = '',
}: LineWidthSliderProps) {
  return (
    <div className={className}>
      <label className="block text-xs text-white/60 mb-1.5">{label}</label>

      <div className="flex items-center gap-2">
        {LINE_WIDTHS.map((width) => (
          <button
            key={width}
            onClick={() => onChange(width)}
            className={`flex-1 h-8 rounded flex items-center justify-center transition-all ${
              value === width
                ? 'bg-blue-500 text-white'
                : 'bg-white/10 text-white/60 hover:bg-white/20'
            }`}
            title={`${width}px`}
          >
            <div
              className="bg-current rounded-full"
              style={{
                width: `${Math.max(12, width * 3)}px`,
                height: `${width}px`,
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
