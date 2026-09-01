'use client';

import { Formation, FormationSlot, playerInitials } from '@/lib/formations';
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
  const h = compact ? 280 : 420;
  const w = compact ? 210 : 300;
  const r = compact ? 18 : 24;
  const fontSize = compact ? 8 : 10;

  return (
    <div
      className="relative rounded-xl overflow-hidden"
      style={{ width: w, height: h, background: 'linear-gradient(180deg, #1a5c2e 0%, #1e6e35 50%, #1a5c2e 100%)' }}
    >
      {/* Pitch markings */}
      <svg width={w} height={h} className="absolute inset-0 opacity-30" style={{ pointerEvents: 'none' }}>
        {/* Centre circle */}
        <ellipse cx={w / 2} cy={h * 0.5} rx={w * 0.22} ry={h * 0.1} fill="none" stroke="white" strokeWidth={1} />
        {/* Centre line */}
        <line x1={0} y1={h * 0.5} x2={w} y2={h * 0.5} stroke="white" strokeWidth={1} />
        {/* Top goal area */}
        <rect x={w * 0.28} y={0} width={w * 0.44} height={h * 0.12} fill="none" stroke="white" strokeWidth={1} />
        <rect x={w * 0.36} y={0} width={w * 0.28} height={h * 0.06} fill="none" stroke="white" strokeWidth={1} />
        {/* Bottom goal area */}
        <rect x={w * 0.28} y={h * 0.88} width={w * 0.44} height={h * 0.12} fill="none" stroke="white" strokeWidth={1} />
        <rect x={w * 0.36} y={h * 0.94} width={w * 0.28} height={h * 0.06} fill="none" stroke="white" strokeWidth={1} />
      </svg>

      {/* Slots */}
      {formation.slots.map((slot, i) => {
        const pick = picksMap.get(i);
        const cx = (slot.x / 100) * w;
        const cy = (slot.y / 100) * h;
        const isHighlight = highlightSlot === i;
        const color = pick ? hashColor(pick.playerName) : undefined;
        const initials = pick ? playerInitials(pick.playerName) : slot.position;

        return (
          <button
            key={i}
            onClick={() => onSlotClick?.(i)}
            style={{
              position: 'absolute',
              left: cx - r,
              top: cy - r,
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
        const cx = (slot.x / 100) * w;
        const cy = (slot.y / 100) * h;
        return (
          <div
            key={`lbl-${i}`}
            style={{
              position: 'absolute',
              left: cx,
              top: cy + r + 3,
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
