import React from 'react';
import { Star } from 'lucide-react';

export function parseStarCount(raw?: string | number | null): number {
  if (raw === undefined || raw === null) return 0;
  const str = String(raw).trim();
  if (!str) return 0;
  const starMatches = str.match(/★|⭐/g);
  if (starMatches && starMatches.length > 0) {
    return Math.min(10, Math.max(0, starMatches.length));
  }
  const numMatch = str.match(/^\d{1,2}$/);
  if (numMatch) {
    return Math.min(10, Math.max(0, Number(numMatch[0])));
  }
  return 0;
}

export function formatStarValue(count: number): string {
  const clamped = Math.min(10, Math.max(0, Math.round(count)));
  return clamped > 0 ? '★'.repeat(clamped) : '';
}

interface StarRatingInputProps {
  value: string;
  onChange: (nextVal: string) => void;
  label?: string;
  compact?: boolean;
}

export const StarRatingInput: React.FC<StarRatingInputProps> = ({
  value,
  onChange,
  label = 'التقدير:',
  compact = false,
}) => {
  const count = parseStarCount(value);

  const handleNumberChange = (raw: string) => {
    const clean = raw.replace(/[^\d]/g, '');
    if (clean === '') {
      onChange('');
      return;
    }
    const parsed = Math.min(10, Math.max(0, Number(clean)));
    onChange(formatStarValue(parsed));
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? '' : 'w-full'}`}>
      {label && (
        <label className="text-xs font-extrabold text-slate-700 whitespace-nowrap shrink-0">
          {label}
        </label>
      )}
      <input
        type="number"
        min={0}
        max={10}
        inputMode="numeric"
        value={count}
        onChange={(e) => handleNumberChange(e.target.value)}
        aria-label="عدد النجوم من 0 إلى 10"
        className="w-14 px-2 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-mono font-extrabold text-slate-900 text-center tabular-nums focus:outline-hidden focus:border-amber-500 shrink-0"
      />
      <div className="flex items-center gap-0.5 flex-wrap" dir="ltr" role="group" aria-label="تقييم بالنجوم">
        {Array.from({ length: 10 }, (_, idx) => {
          const starNum = idx + 1;
          const active = starNum <= count;
          return (
            <button
              key={starNum}
              type="button"
              onClick={() => onChange(formatStarValue(count === starNum ? 0 : starNum))}
              title={`${starNum} / 10`}
              aria-label={`${starNum} من 10 نجوم`}
              className="p-0.5 rounded hover:scale-110 transition-transform cursor-pointer"
            >
              <Star
                className={`w-4 h-4 sm:w-4.5 sm:h-4.5 transition-colors ${
                  active ? 'fill-amber-400 text-amber-500' : 'text-slate-300 hover:text-amber-300'
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};
