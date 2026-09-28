'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getFormation, canFillSlot, Formation, Position } from '@/lib/formations';
import { SquadPick, computeOverall } from '@/lib/simulation';
import { listDraftableSquads, type DataPlayer, type SpunSquad } from '@/lib/gameData';
import { useStoredJson, readStored, writeStored } from '@/lib/clientStorage';
import { parseSeenSquads, SEEN_SQUADS_KEY, withSeenSquad } from '@/lib/seenSquads';
import PitchView from '@/components/PitchView';
import PositionBadge from '@/components/PositionBadge';
import LineRatings from '@/components/LineRatings';
import DraftRecap from '@/components/DraftRecap';
import BackLink from '@/components/BackLink';

interface Setup {
  formation: string;
  difficulty: 'easy' | 'normal' | 'hard';
  showRatings: boolean;
  draftMode: 'squad-first' | 'position-first';
  playerRating: 'career' | 'prime';
  yearStart: number;
  yearEnd: number;
}

type SpinPhase = 'idle' | 'spinning' | 'reveal';

const REROLLS_BY_DIFFICULTY = { easy: 3, normal: 1, hard: 0 };
// Stable empty array so an unstarted draft does not hand out a new reference
// on every render.
const NO_PICKS: SquadPick[] = [];
// Names flashed up by the wheel while it spins — flavour only, unrelated to
// the squad that is actually landed on.
const SPIN_CLUBS = [
  'Arsenal','Chelsea','Liverpool','Man City','Man Utd','Tottenham',
  'Leicester','Newcastle','Blackburn','Aston Villa','Everton','Leeds',
];
const FAST_FRAMES = 8;
const FAST_INTERVAL = 65;
const SLOW_INTERVALS = [120, 180, 260, 360, 480];
const REVEAL_HOLD = 700;

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
  const spinTimer                     = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [spinResult, setSpinResult]   = useState<SpunSquad | null>(null);
  const [spinNotice, setSpinNotice]   = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<DataPlayer | null>(null);
  const [highlightSlot, setHighlightSlot]   = useState<number | undefined>();
  const [positionFirst, setPositionFirst]   = useState<number | null>(null);

  // Rating reveal toast (when showRatings is off)
  const [reveal, setReveal]           = useState<{ name: string; rating: number } | null>(null);
  const revealTimer                   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Setup is written by the home page; without it there is nothing to draft.
  useEffect(() => {
    if (localStorage.getItem('38-0-setup') === null) router.push('/');
  }, [router]);

  // A browser that drafted before seen-squads stored references can still be
  // holding megabytes of full squad copies, enough to fill the quota. Rewriting
  // the key keeps this run's references and drops the rest. See seenSquads.ts.
  useEffect(() => {
    const stored = readStored<unknown>(SEEN_SQUADS_KEY);
    if (stored === null) return;
    const refs = parseSeenSquads(stored);
    if (!Array.isArray(stored) || refs.length !== stored.length) writeStored(SEEN_SQUADS_KEY, refs);
  }, []);

  // Clean up timers on unmount
  useEffect(() => () => {
    if (spinTimer.current) clearTimeout(spinTimer.current);
    if (revealTimer.current) clearTimeout(revealTimer.current);
  }, []);

  function saveDraft(next: SquadPick[]) {
    writeStored('38-0-draft', next);
  }

  // ── Spinning ───────────────────────────────────────────────────────────────

  /**
   * Picks a squad at random from the era that still has a player the current
   * formation can use. Returns null when the era has nothing left to offer,
   * which lets the caller report it without burning a reroll.
   */
  function findSquad(excludeDrafted: boolean): SpunSquad | null {
    if (!setup || !formation) return null;
    const takenPlayers = new Set(picks.map(p => p.playerId));
    const filledSlots  = new Set(picks.map(p => p.slotIndex));
    const openSlots    = formation.slots.filter((_, i) => !filledSlots.has(i));
    const draftedFrom  = new Set(
      picks.filter(p => p.clubId != null && p.seasonId != null)
        .map(p => `${p.clubId}-${p.seasonId}`),
    );

    const candidates = listDraftableSquads(setup.yearStart, setup.yearEnd).filter(squad => {
      if (excludeDrafted && draftedFrom.has(`${squad.clubId}-${squad.seasonId}`)) return false;
      return squad.players.some(p =>
        !takenPlayers.has(p.playerId) &&
        openSlots.some(slot => canFillSlot(p.positions, slot.position)));
    });

    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function runSpinAnimation(result: SpunSquad) {
    let frame = 0;
    setSpinPhase('spinning');

    function tick() {
      if (frame < FAST_FRAMES) {
        setSpinDisplay(SPIN_CLUBS[frame % SPIN_CLUBS.length]);
        spinTimer.current = setTimeout(tick, FAST_INTERVAL);
        frame++;
        return;
      }
      const slowIndex = frame - FAST_FRAMES;
      if (slowIndex < SLOW_INTERVALS.length) {
        setSpinDisplay(SPIN_CLUBS[Math.floor(Math.random() * SPIN_CLUBS.length)]);
        spinTimer.current = setTimeout(tick, SLOW_INTERVALS[slowIndex]);
        frame++;
        return;
      }
      // Land on the squad that was chosen before the animation started.
      setSpinPhase('reveal');
      setSpinDisplay(result.clubName);
      setSpinSeason(result.seasonLabel);
      setSpinFlash(true);
      spinTimer.current = setTimeout(() => {
        setSpinFlash(false);
        setSpinResult(result);
        setSpinPhase('idle');
      }, REVEAL_HOLD);
    }

    tick();
  }

  function spin(reroll = false) {
    if (!setup || !formation) return;
    if (reroll && rerollsLeft <= 0) return;

    // Resolve the squad first, so a reroll is only spent when it buys something.
    const found = findSquad(reroll);
    if (!found) {
      setSpinNotice(reroll
        ? 'No other club-season in this era can fill an open position.'
        : 'No club-season in this era can fill an open position. Widen the era and start again.');
      return;
    }
    if (reroll) setRerollsUsed(n => n + 1);

    setSpinNotice(null);
    setSpinResult(null);
    setSelectedPlayer(null);

    runSpinAnimation(found);

    // Record the squad for "what could have been", whether or not it is used.
    // After the animation has started: history is a nice-to-have, the spin is not.
    const seen = parseSeenSquads(readStored<unknown>(SEEN_SQUADS_KEY));
    writeStored(SEEN_SQUADS_KEY, withSeenSquad(seen, found));
  }

  function selectPlayer(player: DataPlayer) {
    if (!spinResult) return;
    // Selecting is not a toggle. Tapping an already-selected row used to clear
    // the selection and close the placement panel, which looked like the tap
    // had been ignored; Cancel in the panel is the way to back out.
    setSelectedPlayer(player);
  }

  function placePlayer(slotIndex: number) {
    if (!selectedPlayer || !spinResult || !formation) return;
    const slot = formation.slots[slotIndex];
    if (!canFillSlot(selectedPlayer.positions, slot.position)) return;

    const pick: SquadPick = {
      slotIndex,
      position: slot.position,
      playerId: selectedPlayer.playerId,
      playerName: selectedPlayer.name,
      nationality: selectedPlayer.nationality,
      rating: selectedPlayer.rating,
      clubName: spinResult.clubName,
      seasonLabel: spinResult.seasonLabel,
      clubId: spinResult.clubId,
      seasonId: spinResult.seasonId,
      positions: selectedPlayer.positions,
    };

    // Rating reveal toast (only when ratings are hidden)
    const showRatings = (setup?.showRatings ?? false) && setup?.difficulty !== 'hard';
    if (!showRatings) {
      if (revealTimer.current) clearTimeout(revealTimer.current);
      setReveal({ name: selectedPlayer.name, rating: selectedPlayer.rating });
      revealTimer.current = setTimeout(() => setReveal(null), 2500);
    }

    const next = [...picks, pick];
    saveDraft(next);
    setSelectedPlayer(null);
    setSpinResult(null);
    setHighlightSlot(undefined);
    setPositionFirst(null);

    if (next.length === 11) {
      writeStored('38-0-squad', next);
      // The XI is complete, but the run is not: the tactic and the season to
      // play it in are still to be chosen. See src/app/squad.
      router.push('/squad');
    }
  }

  // The slots the selected player could fill, so the pitch shows the targets
  // rather than leaving the position buttons as the only discoverable route.
  const eligibleSlots = useMemo(() => {
    if (!selectedPlayer || !formation) return undefined;
    const filled = new Set(picks.map(p => p.slotIndex));
    return formation.slots
      .map((slot, i) => ({ slot, i }))
      .filter(({ slot, i }) => !filled.has(i) && canFillSlot(selectedPlayer.positions, slot.position))
      .map(({ i }) => i);
  }, [selectedPlayer, formation, picks]);

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
    return <div className="min-h-screen bg-ground flex items-center justify-center text-fg">Loading…</div>;
  }

  const filledSlots = new Set(picks.map(p => p.slotIndex));
  const openSlots = formation.slots.filter((_, i) => !filledSlots.has(i));
  const positionFirstSlot = positionFirst !== null ? formation.slots[positionFirst] : null;
  const overall = computeOverall(picks);
  const showRatings = setup.showRatings && setup.difficulty !== 'hard';
  const isSpinning = spinPhase !== 'idle';

  return (
    <main className="min-h-screen bg-ground text-fg flex flex-col md:flex-row md:items-start">
      {/*
        Left rail — pitch and recap.
        The split starts at 768px, not 1024px: on an iPad in portrait this was
        the phone stack, so the squad you had just spun for began about 1,000px
        down an 1,180px viewport and pressing spin looked like nothing had
        happened.

        `sticky top-0` with its own `max-h-screen overflow-y-auto` is what makes
        this a rail. It used to be `lg:overflow-y-auto` with no height to scroll
        inside, so the whole page scrolled instead and the pitch — the feedback
        for the pick just made — left the viewport.
      */}
      <aside className="md:w-[300px] lg:w-[320px] flex-shrink-0 flex flex-col items-center py-6 px-4
                        border-b md:border-b-0 md:border-r border-line
                        md:sticky md:top-0 md:max-h-screen md:overflow-y-auto">
        <div className="w-full mb-2">
          <BackLink href="/" label="Setup" />
        </div>
        <div className="text-xs font-bold tracking-widest text-muted uppercase mb-1">Formation</div>
        <div className="text-xl font-black mb-3">{setup.formation}</div>
        <div className="text-xs text-muted mb-3 flex items-center gap-2">
          <span>Rerolls:</span>
          {Array.from({ length: rerollsTotal }).map((_, i) => (
            <span key={i} className={`inline-block w-2 h-2 rounded-full ${i < rerollsLeft ? 'bg-amber-400' : 'bg-track'}`} />
          ))}
          <span className="ml-1">{picks.length}/11</span>
        </div>

        <PitchView
          formation={formation}
          picks={picks}
          onSlotClick={handleSlotClick}
          highlightSlot={highlightSlot}
          eligibleSlots={eligibleSlots}
        />

        {/* Rating reveal toast */}
        <div className={`w-full mt-3 px-3 py-2 rounded-xl transition-all duration-300 overflow-hidden
          ${reveal ? 'opacity-100 max-h-16 bg-[#00c896]' : 'opacity-0 max-h-0'}`}>
          <div className="text-black text-xs font-bold">{reveal?.name}</div>
          <div className="text-black text-xl font-black">{reveal?.rating} revealed</div>
        </div>

        <div className="mt-4 w-full px-1 space-y-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-muted uppercase tracking-widest font-bold">Line Ratings</span>
            {picks.length > 0 && (
              <span className="text-[10px] text-muted">Overall <span className="text-fg font-bold">{overall}</span></span>
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
            <div className="text-muted text-sm uppercase tracking-widest font-bold">Spin for a Squad</div>
            <div className="text-3xl font-black text-subtle">
              {openSlots.length} position{openSlots.length !== 1 ? 's' : ''} left to fill
            </div>
            {setup.draftMode === 'position-first' && (
              <div className="text-muted text-sm">Click a slot on the pitch to begin</div>
            )}
            {setup.draftMode === 'squad-first' && (
              <button
                onClick={() => spin()}
                className="flex items-center gap-2 px-8 py-4 rounded-xl bg-[#00c896] text-black font-black text-lg hover:bg-[#00b385] transition-colors"
              >
                🎰 Spin the Wheel
              </button>
            )}
            <div className="text-muted text-xs">or tap anywhere to spin</div>
            {spinNotice && (
              <div className="max-w-sm text-center rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-300 text-sm">
                {spinNotice}
              </div>
            )}
          </div>
        )}

        {/* Spin animation */}
        {isSpinning && (
          <div className="flex flex-col items-center gap-6 mt-16 select-none">
            <div className="text-muted text-xs uppercase tracking-widest font-bold">
              {spinPhase === 'reveal' ? 'Squad Landed' : 'Spinning…'}
            </div>

            {/* Slot window */}
            <div className="relative w-72 h-20 overflow-hidden rounded-2xl bg-card border border-line-strong flex items-center justify-center">
              {/* Side fade overlays */}
              <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-card to-transparent z-10 pointer-events-none" />
              <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-card to-transparent z-10 pointer-events-none" />

              <div key={spinDisplay} className="flex flex-col items-center leading-tight">
                <div
                  className="text-2xl font-black transition-all duration-150"
                  style={{
                    color: spinPhase === 'reveal' ? 'var(--c-accent)' : 'var(--t-fg)',
                    transform: spinPhase === 'reveal' ? 'scale(1.1)' : 'scale(1)',
                    textShadow: spinFlash ? '0 0 20px #00c896, 0 0 40px #00c896' : undefined,
                  }}
                >
                  {spinDisplay}
                </div>
                {spinPhase === 'reveal' && spinSeason && (
                  <div className="text-sm font-bold text-accent/70 mt-0.5">
                    {spinSeason}
                  </div>
                )}
              </div>
            </div>

            {spinPhase === 'reveal' && (
              <div className="text-accent text-sm font-bold animate-pulse">Opening the squad…</div>
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
            onCancelSelection={() => setSelectedPlayer(null)}
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
  onSelectPlayer, onCancelSelection, onPlacePlayer, onReroll, rerollsLeft, showRatings, positionFilter,
}: {
  result: SpunSquad;
  formation: Formation;
  picks: SquadPick[];
  selectedPlayer: DataPlayer | null;
  onSelectPlayer: (p: DataPlayer) => void;
  onCancelSelection: () => void;
  onPlacePlayer: (slotIdx: number) => void;
  onReroll?: () => void;
  rerollsLeft: number;
  showRatings: boolean;
  positionFilter?: Position;
}) {
  const filledSlots = new Set(picks.map(p => p.slotIndex));
  const pickedPlayerIds = new Set(picks.map(p => p.playerId));
  const players = result.players.filter(p => !pickedPlayerIds.has(p.playerId));

  function slotStatus(i: number, slot: { position: Position }): 'available' | 'filled' | 'unavailable' {
    if (filledSlots.has(i)) return 'filled';
    if (!selectedPlayer) return 'unavailable';
    return canFillSlot(selectedPlayer.positions, slot.position) ? 'available' : 'unavailable';
  }

  return (
    <div className="w-full max-w-xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="text-xs text-muted uppercase tracking-widest mb-1">Squad Spun</div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ background: result.color }} />
            <span className="font-black text-lg">{result.clubName}</span>
            <span className="text-accent font-bold">{result.seasonLabel}</span>
          </div>
          <div className="text-xs text-muted mt-1">Pick any player, then choose which open position to slot them into.</div>
        </div>
        {onReroll && (
          <button type="button" onClick={onReroll}
            className="shrink-0 whitespace-nowrap flex items-center gap-1 px-3 py-2.5 rounded-lg border border-[#00c896] text-accent text-xs font-bold hover:bg-[#00c89622] transition-colors touch-manipulation">
            🔄 Reroll ({rerollsLeft})
          </button>
        )}
      </div>

      {/*
        Placement panel. It sticks to the top of the viewport because the squad
        list below runs to twenty-odd rows: choose someone near the bottom on a
        phone and the destination buttons would otherwise be off-screen above.
      */}
      {selectedPlayer && (
        <div className="sticky top-2 z-20 bg-card border border-[#00c896] rounded-xl p-4 mb-4 shadow-lg shadow-black/60">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="font-bold text-accent truncate">Place {selectedPlayer.name.split(' ').pop()}</div>
            <button
              type="button"
              onClick={onCancelSelection}
              className="shrink-0 text-muted text-xs hover:text-fg px-3 py-2 -mr-2 touch-manipulation"
            >
              Cancel
            </button>
          </div>
          <div className="text-[10px] text-muted uppercase tracking-widest mb-2">
            Where they can play
          </div>
          <div className="flex flex-wrap gap-2">
            {formation.slots.map((slot, i) => slotStatus(i, slot) === 'available' ? (
              <button key={i} type="button" onClick={() => onPlacePlayer(i)}
                className="px-3 py-2.5 rounded-lg bg-[#00c896] text-black text-xs font-bold hover:bg-[#00b385] transition-colors touch-manipulation">
                {slot.label} ({slot.position})
              </button>
            ) : null)}
          </div>
          <div className="text-[11px] text-muted mt-3">
            Tap a position above, or one of the highlighted spots on the pitch.
          </div>
        </div>
      )}

      {/* Player list */}
      <div className="space-y-1.5">
        {players.map(player => {
          const pp: Position[] = player.positions;
          const isSelected = selectedPlayer?.playerId === player.playerId;
          const canFillAny = formation.slots.some((slot, i) => !filledSlots.has(i) && canFillSlot(pp, slot.position));
          const matchesFilter = !positionFilter || canFillSlot(pp, positionFilter);

          return (
            <button
              key={player.playerId}
              onClick={() => canFillAny && onSelectPlayer(player)}
              disabled={!canFillAny}
              className={`
                w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left
                ${!canFillAny
                  ? 'border-line bg-ground opacity-30 cursor-not-allowed'
                  : isSelected
                    ? 'border-[#00c896] bg-[#00c89611]'
                    : matchesFilter
                      ? 'border-line-strong bg-card hover:border-line-hover'
                      : 'border-line bg-inset opacity-50'
                }
              `}
            >
              <div className="w-9 h-9 rounded-lg bg-raised-max flex items-center justify-center text-sm font-bold text-accent flex-shrink-0">
                ?
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{player.name}</div>
                <div className="text-muted text-xs">{player.nationality}</div>
              </div>
              <div className="flex gap-1 flex-wrap justify-end">
                {pp.map(pos => <PositionBadge key={pos} pos={pos} size="xs" />)}
              </div>
              {showRatings
                ? <div className="text-accent font-black text-sm ml-2 w-6 text-right">{player.rating}</div>
                : <div className="text-subtle font-black text-sm ml-2 w-6 text-right">?</div>
              }
            </button>
          );
        })}
      </div>
    </div>
  );
}
