'use client';

interface OptionCardProps {
  label: string;
  description?: string;
  selected?: boolean;
  onClick?: () => void;
  accent?: 'green' | 'amber' | 'purple';
  className?: string;
}

const ACCENT_STYLES = {
  green:  'border-[#00c896] text-[#00c896]',
  amber:  'border-amber-400 text-amber-400',
  purple: 'border-purple-400 text-purple-400',
};

export default function OptionCard({
  label, description, selected, onClick,
  accent = 'green', className = '',
}: OptionCardProps) {
  const borderStyle = selected
    ? ACCENT_STYLES[accent]
    : 'border-[#2a2a2a] text-white hover:border-[#444]';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        rounded-lg border-2 px-3 py-3 text-left transition-colors
        bg-[#111] cursor-pointer touch-manipulation
        ${borderStyle} ${className}
      `}
    >
      <div className="font-bold text-sm">{label}</div>
      {description && (
        <div className={`text-xs mt-0.5 ${selected ? 'opacity-80' : 'text-[#666]'}`}>
          {description}
        </div>
      )}
    </button>
  );
}
