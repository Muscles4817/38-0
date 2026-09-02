'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getFormation, canFillSlot, Formation, Position } from '@/lib/formations';
import { SquadPick, computeOverall } from '@/lib/simulation';
import { useStoredJson, readStored, writeStored } from '@/lib/clientStorage';
import PitchView from '@/components/PitchView';
import PositionBadge from '@/components/PositionBadge';
import LineRatings from '@/components/LineRatings';
import DraftRecap from '@/components/DraftRecap';

interface Setup {
  formation: string;
  difficulty: 'easy' | 'normal' | 'hard';
  showRatings: boolean;
  draftMode: 'squad-first' | 'position-first';
  playerRating: 'career' | 'prime';
  yearStart: number;
  yearEnd: number;
}

interface SpunPlayer {
  entry_id: number;
  player_id: number;
  player_name: string;
  nationality: string | null;
  rating: number;
  positions: string;
}

interface SpinResult {
  clubId: number;
  clubName: string;
  color: string;
  seasonId: number;
  seasonLabel: string;
  players: SpunPlayer[];
}

// Stored so "what could have been" can read all seen players
interface StoredSquad {
  clubName: string;
  seasonLabel: string;
  players: SpunPlayer[];
}

type SpinPhase = 'idle' | 'fast' | 'slowing' | 'reveal';

const REROLLS_BY_DIFFICULTY = { easy: 3, normal: 1, hard: 0 };
// Stable empty array so an unstarted draft does not hand out a new reference
// on every render.
const NO_PICKS: SquadPick[] = [];
const SPIN_CLUBS = [
  'Arsenal','Chelsea','Liverpool','Man City','Man Utd','Tottenham',
  'Leicester','Newcastle','Blackburn','Aston Villa','Everton','Leeds',
];

export default function DraftPage() {
  const router = useRouter();

  // The run in progress lives in localStorage so a refresh resumes it.
  const setup     = useStoredJson<Setup>('38-0-setup');
  const picks     = useStoredJson<SquadPick[]>('38-0-draft') ?? NO_PICKS;
  const formation = useMemo(() => (setup ? getFormation(setup.formation) : null), [setup]);

  // Counting rerolls used rather than remaining keeps this independent of when
  // setup finishes loading.
  const [rerollsUsed, setRerollsUsed] = useState(0);
  const rerollsTotal = setup ? REROLLS_BY_DIFFICULTY[setup.difficulty] ?? 1 : 0;
  const rerollsLeft  = Math.max(0, rerollsTotal - rerollsUsed);

  // Spin animation state
  const [spinPhase, setSpinPhase]     = useState<SpinPhase>('idle');
  const [spinDisplay, setSpinDisplay] = useState('');
  const [spinSeason, setSpinSeason]   = useState('');
  const [spinFlash, setSpinFlash]     = useState(false);
  const pendingResult                 = useRef<SpinResult | null>(null);
  const spinTimer                     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skippedIds                    = useRef<string[]>([]);

  const [spinResult, setSpinResult]   = useState<SpinResult | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<SpunPlayer | null>(null);
  const [highlightSlot, setHighlightSlot]   = useState<number | undefined>();
  const [positionFirst, setPositionFirst]   = useState<number | null>(null);

  // Rating reveal toast (when showRatings is off)
  const [reveal, setReveal]           = useState<{ name: string; rating: number } | null>(null);
  const revealTimer                   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Setup is written by the home page; without it there is nothing to draft.
  useEffect(() => {
    if (localStorage.getItem('38-0-setup') === null) router.push('/');
  }, [router]);

  // Clean up timers on unmount
  useEffect(() => () => {
    if (spinTimer.current) clearTimeout(spinTimer.current);
    if (revealTimer.current) clearTimeout(revealTimer.current);
  }, []);

  function saveDraft(next: SquadPick[]) {
    writeStored('38-0-draft', next);
  }

  // ── Spin animation ─────────────────────────────────────────────────────────

  function runSpinAnimation(result: SpinResult) {
    pendingResult.current = result;

    // Phase 1: fast cycling (already running from fetchSpin)
    // Phase 2: slowing — show a few more random clubs at increasing intervals
    const slowFrames = [120, 180, 260, 360, 480];
    setSpinPhase('slowing');

    function showSlowFrame(idx: number) {
      if (idx < slowFrames.length) {
        setSpinDisplay(SPIN_CLUBS[Math.floor(Math.random() * SPIN_CLUBS.length)]);
        spinTimer.current = setTimeout(() => showSlowFrame(idx + 1), slowFrames[idx]);
      } else {
        // Land on the actual result
        setSpinPhase('reveal');
        setSpinDisplay(result.clubName);
        setSpinSeason(result.seasonLabel);
        setSpinFlash(true);
        spinTimer.current = setTimeout(() => {
          setSpinFlash(false);
          setSpinResult(result);
          setSpinPhase('idle');
        }, 700);
      }
    }
    showSlowFrame(0);
  }

  async function spin(reroll = false) {
    if (!setup || !formation) return;
    if (reroll) {
      if (rerollsLeft <= 0) return;
      setRerollsUsed(n => n + 1);
    }

    setSpinResult(null);
    setSelectedPlayer(null);
    setSpinPhase('fast');

    // Fast cycling while waiting for API
    let fastIdx = 0;
    function fastTick() {
      if (pendingResult.current) return;
      setSpinDisplay(SPIN_CLUBS[fastIdx % SPIN_CLUBS.length]);
      fastIdx++;
      spinTimer.current = setTimeout(fastTick, 65);
    }
    fastTick();

    const pickedPlayerIds = new Set(picks.map(p => p.playerId));
    const filledSlotSet   = new Set(picks.map(p => p.slotIndex));
    const pickedSquadIds  = picks
      .filter(p => p.clubId && p.seasonId)
      .map(p => `${p.clubId}-${p.seasonId}`)
      .filter((v, i, a) => a.indexOf(v) === i);

    try {
      let found: SpinResult | null = null;
      for (let attempt = 0; attempt < 20; attempt++) {
        const excludeIds = [
          ...(reroll ? pickedSquadIds : []),
          ...skippedIds.current,
        ];
        const res = await fetch('/api/spin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            yearStart: setup.yearStart,
            yearEnd: setup.yearEnd,
            excludeIds,
          }),
        });
        if (!res.ok) break;
        const candidate: SpinResult = await res.json();

        const hasValid = candidate.players.some(p => {
          if (pickedPlayerIds.has(p.player_id)) return false;
          const pp: Position[] = JSON.parse(p.positions);
          return formation.slots.some((slot, i) => !filledSlotSet.has(i) && canFillSlot(pp, slot.position));
        });

        if (hasValid) { found = candidate; break; }
        skippedIds.current.push(`${candidate.clubId}-${candidate.seasonId}`);
      }

      if (!found) {
        pendingResult.current = { clubId: 0, clubName: '—', color: '#fff', seasonId: 0, seasonLabel: '—', players: [] };
        setSpinPhase('idle');
        return;
      }

      // Store this squad for "what could have been"
      const stored = readStored<StoredSquad[]>('38-0-seen-squads') ?? [];
      stored.push({ clubName: found.clubName, seasonLabel: found.seasonLabel, players: found.players });
      writeStored('38-0-seen-squads', stored);

      runSpinAnimation(found);
    } catch {
      pendingResult.current = { clubId: 0, clubName: '—', color: '#fff', seasonId: 0, seasonLabel: '—', players: [] };
      setSpinPhase('idle');
    }
  }

  function selectPlayer(player: SpunPlayer) {
    if (!spinResult) return;
    setSelectedPlayer(prev => prev?.player_id === player.player_id ? null : player);
  }

  function placePlayer(slotIndex: number) {
    if (!selectedPlayer || !spinResult || !formation) return;
    const slot = formation.slots[slotIndex];
    const playerPositions: Position[] = JSON.parse(selectedPlayer.positions);
    if (!canFillSlot(playerPositions, slot.position)) return;

    const pick: SquadPick = {
      slotIndex,
      position: slot.position,
      playerId: selectedPlayer.player_id,
      playerName: selectedPlayer.player_name,
      nationality: selectedPlayer.nationality,
      rating: selectedPlayer.rating,
      clubName: spinResult.clubName,
      seasonLabel: spinResult.seasonLabel,
      clubId: spinResult.clubId,
      seasonId: spinResult.seasonId,
      positions: playerPositions,
    };

    // Rating reveal toast (only when ratings are hidden)
    const showRatings = (setup?.showRatings ?? false) && setup?.difficulty !== 'hard';
    if (!showRatings) {
      if (revealTimer.current) clearTimeout(revealTimer.current);
      setReveal({ name: selectedPlayer.player_name, rating: selectedPlayer.rating });
      revealTimer.current = setTimeout(() => setReveal(null), 2500);
    }

    const next = [...picks, pick];
    skippedIds.current = [];
    saveDraft(next);
    setSelectedPlayer(null);
    setSpinResult(null);
    setHighlightSlot(undefined);
    setPositionFirst(null);
    pendingResult.current = null;

    if (next.length === 11) {
      writeStored('38-0-squad', next);
      router.push('/results');
    }
  }

  function handleSlotClick(slotIndex: number) {
    const filledSlots = new Set(picks.map(p => p.slotIndex));
    if (filledSlots.has(slotIndex)) return;
    if (selectedPlayer) {
      placePlayer(slotIndex);
    } else if (setup?.draftMode === 'position-first') {
      setPositionFirst(slotIndex);
      setHighlightSlot(slotIndex);
      spin();
    }
  }

  if (!setup || !formation) {
    return <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-white">Loading…</div>;
  }

  const filledSlots = new Set(picks.map(p => p.slotIndex));
  const openSlots = formation.slots.filter((_, i) => !filledSlots.has(i));
  const positionFirstSlot = positionFirst !== null ? formation.slots[positionFirst] : null;
  const overall = computeOverall(picks);
  const showRatings = setup.showRatings && setup.difficulty !== 'hard';
  const isSpinning = spinPhase !== 'idle';

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white flex flex-col lg:flex-row">
      {/* Left — pitch + recap */}
      <aside className="lg:w-[320px] flex-shrink-0 flex flex-col items-center py-8 px-4 border-r border-[#1a1a1a] overflow-y-auto">
        <div className="text-xs font-bold tracking-widest text-[#555] uppercase mb-1">Formation</div>
        <div className="text-xl font-black mb-3">{setup.formation}</div>
        <div className="text-xs text-[#555] mb-3 flex items-center gap-2">
          <span>Rerolls:</span>
          {Array.from({ length: rerollsTotal }).map((_, i) => (
            <span key={i} className={`inline-block w-2 h-2 rounded-full ${i < rerollsLeft ? 'bg-amber-400' : 'bg-[#333]'}`} />
          ))}
          <span className="ml-1">{picks.length}/11</span>
        </div>

        <PitchView formation={formation} picks={picks} onSlotClick={handleSlotClick} highlightSlot={highlightSlot} />

        {/* Rating reveal toast */}
        <div className={`w-full mt-3 px-3 py-2 rounded-xl transition-all duration-300 overflow-hidden
          ${reveal ? 'opacity-100 max-h-16 bg-[#00c896]' : 'opacity-0 max-h-0'}`}>
          <div className="text-black text-xs font-bold">{reveal?.name}</div>
          <div className="text-black text-xl font-black">{reveal?.rating} revealed</div>
        </div>

        <div className="mt-4 w-full px-1 space-y-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-[#444] uppercase tracking-widest font-bold">Line Ratings</span>
            {picks.length > 0 && (
              <span className="text-[10px] text-[#555]">Overall <span className="text-white font-bold">{overall}</span></span>
            )}
          </div>
          <LineRatings formation={formation} picks={picks} />
        </div>

        <div className="w-full px-1 mt-2">
          <DraftRecap picks={picks} />
        </div>
      </aside>

      {/* Right — spin panel */}
      <section className="flex-1 flex flex-col items-center justify-start py-8 px-6">

        {/* Idle — show spin button */}
        {!spinResult && !isSpinning && (
          <div className="flex flex-col items-center gap-6 mt-8">
            <div className="text-[#555] text-sm uppercase tracking-widest font-bold">Spin for a Squad</div>
            <div className="text-3xl font-black text-[#333]">
              {openSlots.length} position{openSlots.length !== 1 ? 's' : ''} left to fill
            </div>
            {setup.draftMode === 'position-first' && (
              <div className="text-[#555] text-sm">Click a slot on the pitch to begin</div>
            )}
            {setup.draftMode === 'squad-first' && (
              <button
                onClick={() => spin()}
                className="flex items-center gap-2 px-8 py-4 rounded-xl bg-[#00c896] text-black font-black text-lg hover:bg-[#00b385] transition-colors"
              >
                🎰 Spin the Wheel
              </button>
            )}
            <div className="text-[#333] text-xs">or tap anywhere to spin</div>
          </div>
        )}

        {/* Spin animation */}
        {isSpinning && (
          <div className="flex flex-col items-center gap-6 mt-16 select-none">
            <div className="text-[#555] text-xs uppercase tracking-widest font-bold">
              {spinPhase === 'reveal' ? 'Squad Landed' : 'Spinning…'}
            </div>

            {/* Slot window */}
            <div className="relative w-72 h-20 overflow-hidden rounded-2xl bg-[#111] border border-[#2a2a2a] flex items-center justify-center">
              {/* Side fade overlays */}
              <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[#111] to-transparent z-10 pointer-events-none" />
              <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#111] to-transparent z-10 pointer-events-none" />

              <div key={spinDisplay} className="flex flex-col items-center leading-tight">
                <div
                  className="text-2xl font-black transition-all duration-150"
                  style={{
                    color: spinPhase === 'reveal' ? '#00c896' : '#fff',
                    transform: spinPhase === 'reveal' ? 'scale(1.1)' : 'scale(1)',
                    textShadow: spinFlash ? '0 0 20px #00c896, 0 0 40px #00c896' : undefined,
                  }}
                >
                  {spinDisplay}
                </div>
                {spinPhase === 'reveal' && spinSeason && (
                  <div className="text-sm font-bold text-[#00c896]/70 mt-0.5">
                    {spinSeason}
                  </div>
                )}
              </div>
            </div>

            {spinPhase === 'reveal' && (
              <div className="text-[#00c896] text-sm font-bold animate-pulse">Loading squad…</div>
            )}
          </div>
        )}

        {/* Squad list */}
        {spinResult && !isSpinning && (
          <SpinPanel
            result={spinResult}
            formation={formation}
            picks={picks}
            selectedPlayer={selectedPlayer}
            onSelectPlayer={selectPlayer}
            onPlacePlayer={placePlayer}
            onReroll={rerollsLeft > 0 ? () => spin(true) : undefined}
            rerollsLeft={rerollsLeft}
            showRatings={showRatings}
            positionFilter={positionFirstSlot?.position}
          />
        )}
      </section>
    </main>
  );
}

// ── Spin Panel ──────────────────────────────────────────────────────────────

function SpinPanel({
  result, formation, picks, selectedPlayer,
  onSelectPlayer, onPlacePlayer, onReroll, rerollsLeft, showRatings, positionFilter,
}: {
  result: SpinResult;
  formation: Formation;
  picks: SquadPick[];
  selectedPlayer: SpunPlayer | null;
  onSelectPlayer: (p: SpunPlayer) => void;
  onPlacePlayer: (slotIdx: number) => void;
  onReroll?: () => void;
  rerollsLeft: number;
  showRatings: boolean;
  positionFilter?: Position;
}) {
  const filledSlots = new Set(picks.map(p => p.slotIndex));
  const pickedPlayerIds = new Set(picks.map(p => p.playerId));
  const players = result.players.filter(p => !pickedPlayerIds.has(p.player_id));

  function slotStatus(i: number, slot: { position: Position }): 'available' | 'filled' | 'unavailable' {
    if (filledSlots.has(i)) return 'filled';
    if (!selectedPlayer) return 'unavailable';
    return canFillSlot(JSON.parse(selectedPlayer.positions), slot.position) ? 'available' : 'unavailable';
  }

  return (
    <div className="w-full max-w-xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs text-[#555] uppercase tracking-widest mb-1">Squad Spun</div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: result.color }} />
            <span className="font-black text-lg">{result.clubName}</span>
            <span className="text-[#00c896] font-bold">{result.seasonLabel}</span>
          </div>
          <div className="text-xs text-[#555] mt-1">Pick any player, then choose which open position to slot them into.</div>
        </div>
        {onReroll && (
          <button onClick={onReroll}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#00c896] text-[#00c896] text-xs font-bold hover:bg-[#00c89622] transition-colors">
            🔄 Reroll ({rerollsLeft})
          </button>
        )}
      </div>

      {/* Position assignment panel */}
      {selectedPlayer && (
        <div className="bg-[#111] border border-[#00c896] rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-[#00c896]">Place {selectedPlayer.player_name.split(' ').pop()}</div>
            <button onClick={() => onSelectPlayer(selectedPlayer)} className="text-[#555] text-xs hover:text-white">Cancel</button>
          </div>
          <div className="text-[10px] text-[#555] uppercase tracking-widest mb-2">Available</div>
          <div className="flex flex-wrap gap-2 mb-3">
            {formation.slots.map((slot, i) => slotStatus(i, slot) === 'available' ? (
              <button key={i} onClick={() => onPlacePlayer(i)}
                className="px-3 py-1.5 rounded-lg bg-[#00c896] text-black text-xs font-bold hover:bg-[#00b385] transition-colors">
                {slot.label} ({slot.position})
              </button>
            ) : null)}
          </div>
          <div className="text-[10px] text-[#555] uppercase tracking-widest mb-2">Unavailable</div>
          <div className="flex flex-wrap gap-1.5">
            {formation.slots.map((slot, i) => slotStatus(i, slot) === 'unavailable' ? (
              <span key={i} className="px-2 py-1 rounded bg-[#1a1a1a] text-[#444] text-[10px]">
                {slot.position} · N/A
              </span>
            ) : null)}
          </div>
        </div>
      )}

      {/* Player list */}
      <div className="space-y-1.5">
        {players.map(player => {
          const pp: Position[] = JSON.parse(player.positions);
          const isSelected = selectedPlayer?.player_id === player.player_id;
          const canFillAny = formation.slots.some((slot, i) => !filledSlots.has(i) && canFillSlot(pp, slot.position));
          const matchesFilter = !positionFilter || canFillSlot(pp, positionFilter);

          return (
            <button
              key={player.player_id}
              onClick={() => canFillAny && onSelectPlayer(player)}
              disabled={!canFillAny}
              className={`
                w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left
                ${!canFillAny
                  ? 'border-[#1a1a1a] bg-[#0a0a0a] opacity-30 cursor-not-allowed'
                  : isSelected
                    ? 'border-[#00c896] bg-[#00c89611]'
                    : matchesFilter
                      ? 'border-[#2a2a2a] bg-[#111] hover:border-[#444]'
                      : 'border-[#1a1a1a] bg-[#0d0d0d] opacity-50'
                }
              `}
            >
              <div className="w-9 h-9 rounded-lg bg-[#222] flex items-center justify-center text-sm font-bold text-[#00c896] flex-shrink-0">
                ?
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{player.player_name}</div>
                <div className="text-[#555] text-xs">{player.nationality}</div>
              </div>
              <div className="flex gap-1 flex-wrap justify-end">
                {pp.map(pos => <PositionBadge key={pos} pos={pos} size="xs" />)}
              </div>
              {showRatings
                ? <div className="text-[#00c896] font-black text-sm ml-2 w-6 text-right">{player.rating}</div>
                : <div className="text-[#333] font-black text-sm ml-2 w-6 text-right">?</div>
              }
            </button>
          );
        })}
      </div>
    </div>
  );
}
