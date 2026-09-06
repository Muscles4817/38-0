'use client';

/**
 * A selectable setting tile.
 *
 * There used to be an `accent` prop offering green, amber or purple for the
 * selected state, and the setup screen used all three at once — three colours
 * meaning "selected" on one screen, with no rule a player could learn. Selected
 * is green, the same green as everywhere else in the game. See
 * docs/desktop-ux.md, principle 8.
 */
interface OptionCardProps {
  label: string;
  description?: string;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

export default function OptionCard({
  label, description, selected, onClick, className = '',
}: OptionCardProps) {
  const borderStyle = selected
    ? 'border-[#00c896] text-[#00c896] bg-[#00c896]/5'
    : 'border-[#2a2a2a] text-white hover:border-[#444]';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`
        rounded-lg border-2 px-3 py-3 text-left transition-colors
        bg-[#111] cursor-pointer touch-manipulation
        ${borderStyle} ${className}
      `}
    >
      <div className="font-bold text-sm">{label}</div>
      {description && (
        <div className={`text-xs mt-0.5 ${selected ? 'opacity-80' : 'text-[#888]'}`}>
          {description}
        </div>
      )}
    </button>
  );
}
