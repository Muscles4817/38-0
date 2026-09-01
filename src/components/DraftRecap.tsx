'use client';

import { SquadPick } from '@/lib/simulation';

interface Props {
  picks: SquadPick[];
}

export default function DraftRecap({ picks }: Props) {
  if (picks.length === 0) return null;

  // Clubs
  const clubCounts = new Map<string, number>();
  for (const p of picks) clubCounts.set(p.clubName, (clubCounts.get(p.clubName) ?? 0) + 1);
  const clubs = [...clubCounts.entries()].sort((a, b) => b[1] - a[1]);

  // Nations
  const natCounts = new Map<string, number>();
  for (const p of picks) {
    const nat = (p as { nationality?: string }).nationality ?? 'Unknown';
    natCounts.set(nat, (natCounts.get(nat) ?? 0) + 1);
  }
  const nations = [...natCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);

  // Era (decade)
  const eraCounts = new Map<string, number>();
  for (const p of picks) {
    const year = parseInt(p.seasonLabel.slice(0, 4));
    const decade = year < 2000 ? '90s' : year < 2010 ? '00s' : year < 2020 ? '10s' : '20s';
    eraCounts.set(decade, (eraCounts.get(decade) ?? 0) + 1);
  }
  const decades = ['90s', '00s', '10s', '20s'].filter(d => eraCounts.has(d));

  return (
    <div className="w-full space-y-3 pt-3 border-t border-[#1a1a1a]">
      <div className="text-[10px] font-bold tracking-widest text-[#444] uppercase">Squad Story</div>

      {/* Clubs */}
      <div>
        <div className="text-[9px] text-[#333] uppercase tracking-widest mb-1">Clubs</div>
        <div className="flex flex-col gap-0.5">
          {clubs.map(([name, count]) => (
            <div key={name} className="flex items-center gap-2">
              <span className="text-[10px] text-[#888] flex-1 truncate">{name}</span>
              <div className="flex gap-0.5">
                {Array.from({ length: count }).map((_, i) => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#00c896] inline-block" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Eras */}
      {decades.length > 0 && (
        <div>
          <div className="text-[9px] text-[#333] uppercase tracking-widest mb-1">Era</div>
          <div className="flex gap-1.5 flex-wrap">
            {decades.map(d => (
              <span key={d} className="text-[9px] px-1.5 py-0.5 rounded bg-[#1a1a1a] text-[#666]">
                {d} ×{eraCounts.get(d)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Nations */}
      {nations.length > 0 && (
        <div>
          <div className="text-[9px] text-[#333] uppercase tracking-widest mb-1">Nations</div>
          <div className="flex flex-wrap gap-1">
            {nations.map(([nat, count]) => (
              <span key={nat} className="text-[9px] px-1.5 py-0.5 rounded bg-[#1a1a1a] text-[#666]">
                {nat}{count > 1 ? ` ×${count}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
