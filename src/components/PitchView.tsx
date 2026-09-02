'use client';

import { Formation, playerInitials } from '@/lib/formations';
import { SquadPick } from '@/lib/simulation';

interface PitchViewProps {
  formation: Formation;
  picks: SquadPick[];
  onSlotClick?: (slotIndex: number) => void;
  highlightSlot?: number;
  compact?: boolean;
}

const PLAYER_COLORS = [
  '#00c896', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#6366f1', '#ef4444', '#14b8a6', '#f97316',
];

function hashColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return PLAYER_COLORS[h % PLAYER_COLORS.length];
}

export default function PitchView({
  formation, picks, onSlotClick, highlightSlot, compact = false,
}: PitchViewProps) {
  const picksMap = new Map(picks.map(p => [p.slotIndex, p]));

  // The pitch shrinks to fit a narrow screen rather than forcing the page to
  // scroll sideways: slots are positioned as percentages and the container
  // holds its shape with aspect-ratio. Badges keep a fixed pixel size so the
  // text inside them stays legible.
  const maxWidth = compact ? 210 : 300;
  const aspectRatio = compact ? '210 / 280' : '300 / 420';
  const r = compact ? 18 : 24;
  const fontSize = compact ? 8 : 10;

  return (
    <div
      className="relative rounded-xl overflow-hidden"
      style={{
        // A preferred pixel width that is allowed to shrink. Using w-full here
        // instead would collapse to nothing inside the shrink-to-fit flex
        // parents this sits in (items-center / items-start).
        width: maxWidth,
        maxWidth: '100%',
        aspectRatio,
        background: 'linear-gradient(180deg, #1a5c2e 0%, #1e6e35 50%, #1a5c2e 100%)',
      }}
    >
      {/* Pitch markings, drawn in percentage units and stretched to fit. */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full opacity-30"
        style={{ pointerEvents: 'none' }}
      >
        <g fill="none" stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke">
          {/* Centre circle and halfway line */}
          <ellipse cx={50} cy={50} rx={22} ry={10} />
          <line x1={0} y1={50} x2={100} y2={50} />
          {/* Goal areas, top and bottom */}
          <rect x={28} y={0} width={44} height={12} />
          <rect x={36} y={0} width={28} height={6} />
          <rect x={28} y={88} width={44} height={12} />
          <rect x={36} y={94} width={28} height={6} />
        </g>
      </svg>

      {/* Slots */}
      {formation.slots.map((slot, i) => {
        const pick = picksMap.get(i);
        const isHighlight = highlightSlot === i;
        const color = pick ? hashColor(pick.playerName) : undefined;
        const initials = pick ? playerInitials(pick.playerName) : slot.position;

        return (
          <button
            key={i}
            type="button"
            onClick={() => onSlotClick?.(i)}
            className="touch-manipulation"
            style={{
              position: 'absolute',
              left: `${slot.x}%`,
              top: `${slot.y}%`,
              transform: 'translate(-50%, -50%)',
              width: r * 2,
              height: r * 2,
              borderRadius: '50%',
              border: `2px solid ${pick ? color : isHighlight ? '#fff' : '#00c896'}`,
              background: pick ? `${color}22` : 'rgba(0,0,0,0.35)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: onSlotClick ? 'pointer' : 'default',
              transition: 'all 0.2s',
              boxShadow: isHighlight ? '0 0 0 3px rgba(255,255,255,0.4)' : undefined,
            }}
          >
            <span style={{ fontSize, fontWeight: 700, color: pick ? color : '#00c896', lineHeight: 1 }}>
              {initials}
            </span>
          </button>
        );
      })}

      {/* Labels below slots */}
      {!compact && formation.slots.map((slot, i) => {
        const pick = picksMap.get(i);
        return (
          <div
            key={`lbl-${i}`}
            style={{
              position: 'absolute',
              left: `${slot.x}%`,
              top: `calc(${slot.y}% + ${r + 3}px)`,
              transform: 'translateX(-50%)',
              fontSize: 9,
              color: 'rgba(255,255,255,0.7)',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            {pick ? pick.playerName.split(' ').pop() : slot.label}
          </div>
        );
      })}
    </div>
  );
}
