'use client';

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  type?: 'number' | 'datetime';
  step?: number;
  min?: number;
  max?: number;
  className?: string;
}

export function NumberInput({
  label,
  value,
  onChange,
  type = 'number',
  step = 0.01,
  min,
  max,
  className = '',
}: NumberInputProps) {
  if (type === 'datetime') {
    // Convert timestamp to datetime-local input format
    const dt = new Date(value).toISOString().slice(0, 16);

    return (
      <div className={className}>
        <label className="block text-xs text-white/60 mb-1">{label}</label>
        <input
          type="datetime-local"
          value={dt}
          onChange={(e) => {
            const timestamp = new Date(e.target.value).getTime();
            if (!isNaN(timestamp)) {
              onChange(timestamp);
            }
          }}
          className="w-full px-2 py-1.5 bg-black/20 border border-white/10 rounded text-sm text-white focus:border-blue-500 focus:outline-none transition-colors"
        />
      </div>
    );
  }

  return (
    <div className={className}>
      <label className="block text-xs text-white/60 mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const num = parseFloat(e.target.value);
          if (!isNaN(num)) {
            onChange(num);
          }
        }}
        step={step}
        min={min}
        max={max}
        className="w-full px-2 py-1.5 bg-black/20 border border-white/10 rounded text-sm text-white focus:border-blue-500 focus:outline-none transition-colors"
      />
    </div>
  );
}
