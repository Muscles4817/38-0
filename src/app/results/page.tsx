'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getFormation, canFillSlot, Formation } from '@/lib/formations';
import { describeCompetition, runSeasonSimulation, type DataPlayer } from '@/lib/gameData';
import { useStoredJson, clearStored } from '@/lib/clientStorage';
import { getTacticEffect } from '@/lib/gameData';
import type { StoredPlan } from '@/app/squad/page';
import {
  SquadPick, SimulationResult, TeamStanding, LeagueEntry,
  computeOverall, preSeasonOdds,
} from '@/lib/simulation';
import PitchView from '@/components/PitchView';
import PositionBadge from '@/components/PositionBadge';
import LineRatings from '@/components/LineRatings';
import BackLink from '@/components/BackLink';
import { ratingColor } from '@/components/ratingColor';

// ── What Could Have Been ─────────────────────────────────────────────────────

/** A squad the draft offered, as recorded by the draft page. */
interface SeenSquad {
  clubName: string;
  seasonLabel: string;
  players: DataPlayer[];
}

type SeenPlayer = DataPlayer & { clubName: string; seasonLabel: string };

// Stable empty array so a missing squad does not hand out a new reference
// on every render.
const NO_PICKS: SquadPick[] = [];

/**
 * The strongest legal XI that could have been assembled from every player the
 * draft ever showed. Slots with the fewest eligible players are filled first,
 * so a scarce position is not left empty by a greedy earlier pick.
 */
function computeBestXI(formation: Formation, seenSquads: SeenSquad[]): SquadPick[] {
  const byId = new Map<number, SeenPlayer>();
  for (const squad of seenSquads) {
    for (const p of squad.players) {
      const existing = byId.get(p.playerId);
      if (!existing || p.rating > existing.rating) {
        byId.set(p.playerId, { ...p, clubName: squad.clubName, seasonLabel: squad.seasonLabel });
      }
    }
  }
  const pool = [...byId.values()];
  const result: SquadPick[] = [];
  const usedIds = new Set<number>();

  const slotOrder = formation.slots
    .map((slot, index) => ({ slot, index }))
    .sort((a, b) =>
      pool.filter(p => canFillSlot(p.positions, a.slot.position)).length -
      pool.filter(p => canFillSlot(p.positions, b.slot.position)).length);

  for (const { slot, index } of slotOrder) {
    const candidates = pool
      .filter(p => !usedIds.has(p.playerId) && canFillSlot(p.positions, slot.position))
      .sort((a, b) => b.rating - a.rating);
    const best = candidates[0];
    if (!best) continue;
    usedIds.add(best.playerId);
    result.push({
      slotIndex: index,
      position: slot.position,
      playerId: best.playerId,
      playerName: best.name,
      nationality: best.nationality,
      rating: best.rating,
      clubName: best.clubName,
      seasonLabel: best.seasonLabel,
      positions: best.positions,
    });
  }
  return result;
}

function WhatCouldHaveBeen({ formation, actualPicks }: { formation: Formation; actualPicks: SquadPick[] }) {
  const [show, setShow] = useState(false);
  const seenSquads = useStoredJson<SeenSquad[]>('38-0-seen-squads');
  const bestXI = useMemo(
    () => (seenSquads?.length ? computeBestXI(formation, seenSquads) : []),
    [formation, seenSquads],
  );
  if (!bestXI.length) return null;
  const bestOverall = computeOverall(bestXI);
  const actualOverall = computeOverall(actualPicks);
  const diff = bestOverall - actualOverall;
  const sortedBest = [...bestXI].sort((a, b) => b.slotIndex - a.slotIndex);
  const actualMap = new Map(actualPicks.map(p => [p.slotIndex, p]));
  return (
    <div className="bg-[#111] rounded-2xl p-6">
      <button onClick={() => setShow(s => !s)} className="w-full flex items-center justify-between">
        <div className="text-left">
          <div className="text-xs text-[#888] uppercase tracking-widest font-bold mb-1">What Could Have Been</div>
          <div className="text-sm text-[#888]">
            Best possible XI from your spins —{' '}
            <span className={diff > 0 ? 'text-amber-400' : 'text-[#00c896]'}>Overall {bestOverall}</span>
            {diff > 0 && <span className="text-amber-400 ml-1">(+{diff} vs yours)</span>}
            {diff === 0 && <span className="text-[#00c896] ml-1">(you nailed it)</span>}
          </div>
        </div>
        <span className="text-[#666] ml-4">{show ? '▲' : '▼'}</span>
      </button>
      {show && (
        <div className="mt-4 space-y-1.5">
          {sortedBest.map((p, i) => {
            const actual = actualMap.get(p.slotIndex);
            const isPicked = actual?.playerId === p.playerId;
            const rDiff = actual ? p.rating - actual.rating : 0;
            return (
              <div key={i} className={`flex items-center gap-3 py-1 rounded-lg px-2 ${isPicked ? 'bg-[#00c89611]' : ''}`}>
                <PositionBadge pos={p.position} size="xs" />
                <span className={`font-bold text-sm flex-1 ${isPicked ? 'text-[#00c896]' : ''}`}>{p.playerName}</span>
                <span className="text-[#666] text-xs">{p.clubName.slice(0, 3).toUpperCase()} {p.seasonLabel}</span>
                <span className="text-[#00c896] font-black text-sm w-6 text-right">{p.rating}</span>
                {!isPicked && rDiff > 0 && <span className="text-amber-400 text-[10px] w-8 text-right">+{rDiff}</span>}
                {isPicked && <span className="text-[#00c896] text-[10px] w-8 text-right">✓</span>}
              </div>
            );
          })}
          <p className="text-[#666] text-[10px] mt-3 text-center">✓ = player you actually picked · numbers show rating advantage missed</p>
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function ResultsPage() {
  const router = useRouter();

  // The drafted XI, the setup that produced it and the plan chosen before
  // kick-off are all handed over in localStorage.
  const picks     = useStoredJson<SquadPick[]>('38-0-squad') ?? NO_PICKS;
  const setup     = useStoredJson<{ formation: string; draftMode?: string }>('38-0-setup');
  const plan      = useStoredJson<StoredPlan>('38-0-plan');
  const formation = useMemo(() => getFormation(setup?.formation ?? '4-4-2'), [setup]);

  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [showFinal, setShowFinal] = useState(false);
  // Bumping this re-runs the season with the same squad and plan.
  const [run, setRun]             = useState(0);

  const opponent = useMemo(
    () => describeCompetition(plan?.seasonId, plan?.league),
    [plan?.seasonId, plan?.league],
  );
  const tactic   = useMemo(
    () => (picks.length ? getTacticEffect(picks, plan?.style ?? 'balanced') : null),
    [picks, plan?.style],
  );

  // Nothing to report on without a squad.
  useEffect(() => {
    if (localStorage.getItem('38-0-squad') === null) router.push('/');
  }, [router]);

  // The season plays as soon as the player arrives: everything it needs was
  // decided on the pre-season screen, so a second button here would only be a
  // step between them and the result. It runs in a timeout because the
  // simulation blocks this thread, and the placeholder below should paint
  // first.
  useEffect(() => {
    if (!picks.length) return;
    let cancelled = false;
    const t = setTimeout(() => {
      const result = runSeasonSimulation(picks, undefined, {
        seasonId: plan?.seasonId,
        league:   plan?.league,
        style:    plan?.style,
      });
      if (!cancelled) setSimResult(result);
    }, 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [picks, plan?.seasonId, plan?.league, plan?.style, run]);

  function handleResim() {
    setShowFinal(false);
    setSimResult(null);
    setRun(n => n + 1);
  }

  if (!picks.length) {
    return <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-white">Loading…</div>;
  }

  const overall = computeOverall(picks);
  const odds    = preSeasonOdds(overall);

  // While the season is playing out, the live panel is the only thing changing.
  // On a phone the squad list above it is several screens tall, so the match
  // would animate off-screen; promote it to the top until the report is shown.
  const liveSim = simResult !== null && !showFinal;

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      {/*
        Source order is the order: the thing that is changing comes first at
        every width. This page used to reverse itself at `lg:`, which put a
        610px squad list back on top and pushed the animating scoreline to the
        bottom edge of a 1440x900 window — see docs/desktop-ux.md, problem 1.
      */}
      <div className="max-w-6xl mx-auto py-6 px-4 flex flex-col gap-6">

        {/* Back to the pre-season screen, where the plan can be changed. */}
        <div>
          <BackLink href="/squad" label="Team Talk" />
        </div>

        {/* The season is running: nothing to show yet but what it is running. */}
        {!simResult && (
          <div className="bg-[#111] rounded-2xl p-6 text-center">
            <div className="text-sm font-black text-[#00c896] animate-pulse">Playing the season…</div>
            <div className="text-[#666] text-xs mt-1">38 games against the {opponent?.seasonLabel ?? 'current'} field</div>
          </div>
        )}

        {/* Live GW simulation */}
        {liveSim && (
          <LiveSimulation simResult={simResult} onDone={() => setShowFinal(true)} />
        )}

        {/* Final season report */}
        {simResult && showFinal && (
          <FinalSummary result={simResult} picks={picks} odds={odds} onResim={handleResim} />
        )}

        {/* The plan this season is being played under. */}
        <div className="bg-[#111] rounded-2xl px-5 py-4 flex items-center gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-[10px] text-[#666] uppercase tracking-widest font-bold mb-1">Playing</div>
            <div className="font-black text-sm truncate">
              {opponent ? `${opponent.leagueName} ${opponent.seasonLabel}` : 'Premier League'}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-[#666] uppercase tracking-widest font-bold mb-1">Tactic</div>
            <div className="font-black text-sm truncate">
              {tactic?.label ?? 'Balanced'}
              {tactic && <span className="text-[#888] font-bold ml-2">fit {Math.round(tactic.fit * 100)}%</span>}
            </div>
          </div>
          <Link
            href="/squad"
            className="ml-auto shrink-0 px-3 py-2.5 rounded-lg border border-[#2a2a2a] text-[#888] text-xs font-bold hover:border-[#444] hover:text-white transition-colors touch-manipulation"
          >
            Change
          </Link>
        </div>

        {/*
          The XI, folded. By the time this page is reached the player has built
          it and looked it over on the pre-season screen; while the season plays
          it is not something they can act on, so it is a summary they can open
          rather than a screen of list they have to scroll past.
        */}
        <SquadPanel formation={formation} picks={picks} overall={overall} />

        {/* What Could Have Been */}
        <WhatCouldHaveBeen formation={formation} actualPicks={picks} />

        <div className="text-center pb-8">
          <button
            type="button"
            onClick={() => {
              clearStored('38-0-draft', '38-0-squad', '38-0-seen-squads', '38-0-plan');
              router.push('/');
            }}
            className="text-[#666] text-xs hover:text-white transition-colors px-4 py-3 touch-manipulation"
          >
            ↩ Start a new run
          </button>
        </div>
      </div>
    </main>
  );
}

// ── The XI, folded away ──────────────────────────────────────────────────────

function SquadPanel({ formation, picks, overall }: {
  formation: Formation;
  picks: SquadPick[];
  overall: number;
}) {
  const sorted = [...picks].sort((a, b) => b.slotIndex - a.slotIndex);
  return (
    <details className="group bg-[#111] rounded-2xl">
      <summary className="cursor-pointer list-none px-5 py-4 flex items-center gap-3 touch-manipulation">
        <span className="text-[#666] transition-transform group-open:rotate-90">▶</span>
        <span className="text-[10px] text-[#666] uppercase tracking-widest font-bold">Your XI</span>
        <span className="text-sm text-[#888]">{formation.name}</span>
        <span className="ml-auto font-black text-xl leading-none" style={{ color: ratingColor(overall) }}>
          {overall}
        </span>
      </summary>
      <div className="px-5 pb-5 flex flex-col lg:flex-row gap-6">
        <div className="flex-shrink-0 flex justify-center">
          <PitchView formation={formation} picks={picks} compact />
        </div>
        {/*
          Capped rather than stretched: a row of a name and a number reads as
          two facts with a gap between them once it passes about 480px.
        */}
        <div className="flex-1 space-y-4 max-w-xl">
          <div className="space-y-1.5">
            {sorted.map(p => (
              <div key={p.slotIndex} className="flex items-center gap-3 py-1.5">
                <PositionBadge pos={p.position} size="xs" />
                <span className="font-bold text-sm flex-1 min-w-0 truncate">{p.playerName}</span>
                <span className="text-[#666] text-xs shrink-0">{p.clubName.slice(0, 3).toUpperCase()} {p.seasonLabel}</span>
                <span className="text-[#00c896] font-black text-sm w-6 text-right shrink-0">{p.rating}</span>
              </div>
            ))}
          </div>
          <LineRatings formation={formation} picks={picks} />
        </div>
      </div>
    </details>
  );
}

// ── Live GW Animation ────────────────────────────────────────────────────────

function LiveSimulation({
  simResult, onDone,
}: {
  simResult: SimulationResult;
  onDone: () => void;
}) {
  const [gw, setGw]           = useState(1);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed]     = useState<'normal' | 'fast'>('normal');

  // The league is twenty teams, so a season is 38 rounds — but read it off the
  // result rather than assume it, so a shorter field cannot leave the controls
  // stuck one gameweek from the end.
  const lastGw = simResult.gameweeks.length;

  // Auto-advance. Stops at the last gameweek, at which point the play/pause
  // control is replaced by the season report button.
  useEffect(() => {
    if (!playing || gw >= lastGw) return;
    const delay = speed === 'fast' ? 300 : 1100;
    const t = setTimeout(() => setGw(g => g + 1), delay);
    return () => clearTimeout(t);
  }, [playing, gw, speed, lastGw]);

  const gwData        = simResult.gameweeks[gw - 1];
  const table         = gwData?.tableSnapshot ?? [];
  const userFixture   = gwData?.fixtures.find(f => f.userInvolved);
  const otherFixtures = (gwData?.fixtures ?? []).filter(f => !f.userInvolved);
  const isHome        = userFixture?.home === 'Your XI';
  const userGoals     = userFixture ? (isHome ? userFixture.homeGoals : userFixture.awayGoals) : 0;
  const oppGoals      = userFixture ? (isHome ? userFixture.awayGoals : userFixture.homeGoals) : 0;
  const opponent      = userFixture ? (isHome ? userFixture.away : userFixture.home) : '';
  const result        = userGoals > oppGoals ? 'W' : userGoals === oppGoals ? 'D' : 'L';
  const rCol          = result === 'W' ? '#00c896' : result === 'D' ? '#f59e0b' : '#ef4444';
  const seasonDone    = gw >= lastGw;

  return (
    <div className="space-y-4">
      {/* GW header bar */}
      <div className="bg-[#111] rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-[#888] text-[10px] uppercase tracking-widest font-bold">Gameweek</span>
            <span className="text-3xl font-black leading-none">{gw}</span>
            <span className="text-[#888] text-sm">/ {lastGw}</span>
          </div>
          <div className="flex items-center gap-2">
            {!seasonDone ? (
              <>
                <button
                  onClick={() => setPlaying(p => !p)}
                  className="px-3 py-2.5 rounded-lg text-xs font-bold bg-[#1a1a1a] text-[#888] hover:text-white transition-colors touch-manipulation"
                >
                  {playing ? '⏸ Pause' : '▶ Play'}
                </button>
                <button
                  onClick={() => setSpeed(s => s === 'normal' ? 'fast' : 'normal')}
                  className={`px-3 py-2.5 rounded-lg text-xs font-bold transition-colors touch-manipulation ${speed === 'fast' ? 'bg-[#00c896] text-black' : 'bg-[#1a1a1a] text-[#888] hover:text-white'}`}
                >
                  {speed === 'fast' ? '3×' : '1×'}
                </button>
                <button
                  onClick={() => { setGw(lastGw); setPlaying(false); }}
                  className="px-3 py-2.5 rounded-lg text-xs font-bold bg-[#1a1a1a] text-[#888] hover:text-white transition-colors touch-manipulation"
                >
                  Skip ⏭
                </button>
              </>
            ) : (
              <button
                onClick={onDone}
                className="px-4 py-2 rounded-xl text-sm font-black bg-[#00c896] text-black hover:bg-[#00b385] transition-colors"
              >
                Full Season Report →
              </button>
            )}
          </div>
        </div>
        <div className="w-full bg-[#1a1a1a] rounded-full h-1.5">
          <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${(gw / lastGw) * 100}%`, background: '#00c896' }} />
        </div>
      </div>

      {/* Body: fixtures + table.
          The table goes beside the match from 768px up, not 1024px: at 820px
          it was full width with a club name, six hundred pixels of nothing,
          and two numbers. */}
      <div className="grid gap-4 md:grid-cols-[1fr_240px] lg:grid-cols-[1fr_268px]">

        {/* Left: user fixture + other results */}
        <div className="space-y-3">

          {/* User's match – re-mounts each GW for the snap-in feel */}
          {userFixture && (
            <div key={gw} className="bg-[#111] rounded-2xl p-5 border" style={{ borderColor: `${rCol}50` }}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-black px-2 py-0.5 rounded" style={{ background: rCol, color: result === 'L' ? 'white' : 'black' }}>
                  {result}
                </span>
                <span className="text-sm text-[#777]">{isHome ? 'Home' : 'Away'} · {opponent}</span>
              </div>
              <div className="flex items-center justify-center gap-4 py-2">
                <span className="text-5xl font-black" style={{ color: rCol }}>{userGoals}</span>
                <span className="text-2xl text-[#666] font-black">–</span>
                <span className={`text-5xl font-black ${result === 'L' ? 'text-white' : 'text-[#888]'}`}>{oppGoals}</span>
              </div>
              {userFixture.scorers.length > 0 && (
                <div className="text-[11px] text-[#888] text-center mt-1">
                  {userFixture.scorers.map(s => `${s.name} ${s.minute}′`).join(' · ')}
                </div>
              )}
            </div>
          )}

          {/* Other fixtures */}
          <div className="bg-[#111] rounded-2xl p-4">
            <div className="text-[9px] text-[#666] uppercase tracking-widest font-bold mb-3">Other Results</div>
            <div className="space-y-1.5">
              {otherFixtures.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className="flex-1 text-right text-[#777] truncate">{f.home}</span>
                  <span className="font-black text-white w-10 text-center shrink-0">{f.homeGoals}–{f.awayGoals}</span>
                  <span className="flex-1 text-[#777] truncate">{f.away}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Season complete: outcome banner (mobile / if no right panel) */}
          {seasonDone && (
            <div className="bg-[#111] rounded-2xl p-5 text-center md:hidden">
              <div className="text-3xl mb-2">{simResult.finalPosition === 1 ? '🏆' : simResult.finalPosition <= 4 ? '🔵' : simResult.finalPosition >= 18 ? '🔴' : '📊'}</div>
              <div className="font-black text-lg mb-1">
                {simResult.finalPosition === 1 ? 'CHAMPIONS!' : `${ordinal(simResult.finalPosition)} Place`}
              </div>
              <div className="text-[#888] text-xs mb-4">{simResult.narrative}</div>
              <button onClick={onDone} className="w-full py-3 rounded-xl font-black bg-[#00c896] text-black hover:bg-[#00b385] transition-colors">
                Full Season Report →
              </button>
            </div>
          )}
        </div>

        {/* Right: live table */}
        <div className="bg-[#111] rounded-2xl p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[9px] text-[#666] uppercase tracking-widest font-bold">Table</div>
            <div className="text-[9px] text-[#666] uppercase tracking-widest">Pts</div>
          </div>
          <div className="flex-1 space-y-0.5">
            {table.map(row => {
              const dotCol = row.position === 1 ? '#fbbf24' : row.position <= 4 ? '#3b82f6' : row.position <= 6 ? '#8b5cf6' : row.position >= 18 ? '#ef4444' : '#2a2a2a';
              return (
                <div key={row.name} className={`flex items-center gap-1.5 px-1 py-1 rounded text-[11px] ${row.isUser ? 'bg-[#00c896]/10' : ''}`}>
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotCol }} />
                  <span className="text-[#888] w-4 text-right shrink-0 font-bold">{row.position}</span>
                  <span className={`flex-1 truncate ${row.isUser ? 'text-[#00c896] font-black' : 'text-[#888]'}`}>{row.name}</span>
                  <span className="text-[#888] w-4 text-center shrink-0">{row.played}</span>
                  <span className={`font-black w-6 text-right shrink-0 ${row.isUser ? 'text-[#00c896]' : 'text-white'}`}>{row.points}</span>
                </div>
              );
            })}
          </div>
          <div className="flex gap-3 mt-3 flex-wrap border-t border-[#1a1a1a] pt-2">
            {[['#fbbf24','1st'],['#3b82f6','UCL'],['#8b5cf6','UEL'],['#ef4444','REL']].map(([c,l]) => (
              <div key={l} className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
                <span className="text-[9px] text-[#888]">{l}</span>
              </div>
            ))}
          </div>

          {/* Season done — desktop outcome card inline */}
          {seasonDone && (
            <div className="hidden md:block mt-4 pt-4 border-t border-[#1a1a1a] text-center">
              <div className="font-black text-base mb-1" style={{ color: simResult.finalPosition === 1 ? '#00c896' : simResult.finalPosition <= 4 ? '#3b82f6' : simResult.finalPosition >= 18 ? '#ef4444' : '#ccc' }}>
                {simResult.finalPosition === 1 ? '🏆 CHAMPIONS!' : `${ordinal(simResult.finalPosition)} Place`}
              </div>
              <div className="text-[10px] text-[#888] mb-3">{simResult.points} pts · {simResult.wins}W {simResult.draws}D {simResult.losses}L</div>
              <button onClick={onDone} className="w-full py-2.5 rounded-xl text-sm font-black bg-[#00c896] text-black hover:bg-[#00b385] transition-colors">
                Full Report →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Final Summary ─────────────────────────────────────────────────────────────

function FinalSummary({ result, picks, odds, onResim }: {
  result: SimulationResult;
  picks: SquadPick[];
  odds: ReturnType<typeof preSeasonOdds>;
  onResim: () => void;
}) {
  const perf =
    result.finalPosition < odds.projectedPosition ? 'OVERPERFORMED' :
    result.finalPosition > odds.projectedPosition ? 'UNDERPERFORMED' : 'AS EXPECTED';
  const perfColor = perf === 'OVERPERFORMED' ? 'text-[#00c896] border-[#00c896]' : perf === 'UNDERPERFORMED' ? 'text-red-400 border-red-400' : 'text-amber-400 border-amber-400';
  const resultBg =
    result.finalPosition === 1 ? 'from-[#00c896]/20 to-transparent' :
    result.finalPosition <= 4  ? 'from-blue-900/20 to-transparent' :
    result.finalPosition >= 18 ? 'from-red-900/20 to-transparent' :
    'from-[#1a1a1a] to-transparent';
  const outcomeLabel =
    result.finalPosition === 1 ? '🏆 CHAMPIONS' :
    result.finalPosition <= 4  ? '✅ CHAMPIONS LEAGUE' :
    result.finalPosition <= 6  ? '🟢 EUROPA LEAGUE' :
    result.finalPosition >= 18 ? '🔴 RELEGATED' : `${ordinal(result.finalPosition)} PLACE`;

  return (
    <div className="space-y-6">

      {/*
        The verdict owns the first screen. This is the moment the whole run
        exists for, and it used to be a 2xl heading 350px down a 4,600px page
        between a squad list and a grey button.
      */}
      <div className={`bg-gradient-to-b ${resultBg} bg-[#111] rounded-2xl p-6 sm:p-8 text-center`}>
        <div className="text-5xl sm:text-6xl mb-3">{result.finalPosition === 1 ? '🏆' : '📋'}</div>
        <div className="font-black text-3xl sm:text-5xl tracking-tight mb-2">{outcomeLabel}</div>
        <div className="text-[#888] text-sm sm:text-base max-w-2xl mx-auto mb-6">{result.narrative}</div>

        <div className="grid grid-cols-2 gap-3 max-w-2xl mx-auto sm:grid-cols-4">
          <HeroStat label="Finished"  value={ordinal(result.finalPosition)} />
          <HeroStat label="Points"    value={String(result.points)} accent />
          <HeroStat label="Record"    value={`${result.wins}-${result.draws}-${result.losses}`} />
          <div className="bg-[#1a1a1a] rounded-xl p-3 flex flex-col items-center justify-center gap-1">
            <div className={`text-[10px] font-black border rounded px-2 py-1 ${perfColor}`}>{perf}</div>
            <div className="text-[10px] text-[#666] uppercase tracking-widest">vs {ordinal(odds.projectedPosition)}</div>
          </div>
        </div>

        <button
          onClick={onResim}
          className="mt-6 px-6 py-3 rounded-xl font-black text-sm bg-[#1a1a1a] text-[#888] hover:bg-[#222] hover:text-white transition-colors border border-[#2a2a2a] touch-manipulation"
        >
          ↺ Play it again
        </button>
      </div>

      {/* Season stats. Six numbers on one row once there is room for them. */}
      <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
        {([
          [result.wins,   'Wins'],
          [result.draws,  'Draws'],
          [result.losses, 'Losses'],
          [result.points, 'Points'],
          [result.goalsFor, 'Goals For'],
          [result.goalsAgainst, 'Against'],
        ] as [number, string][]).map(([v, l]) => (
          <div key={l} className="bg-[#111] rounded-xl p-4 text-center">
            <div className="text-2xl font-black">{v}</div>
            <div className="text-[10px] text-[#666] uppercase tracking-widest">{l}</div>
          </div>
        ))}
      </div>

      {/*
        Everything below the verdict is reference material, and reference
        material reads fine two columns wide. This roughly halves the page.
      */}
      <div className="grid gap-6 min-w-0 lg:grid-cols-2 lg:items-start [&>*]:min-w-0">

        {/* Your XI stats */}
        <div className="bg-[#111] rounded-2xl p-4 sm:p-6 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 mb-3">
            <div className="text-xs text-[#888] uppercase tracking-widest font-bold flex-1 min-w-0">Your XI</div>
            <span className="text-[10px] text-[#666] w-4 text-center">G</span>
            <span className="text-[10px] text-[#666] w-4 text-center">A</span>
            <span className="text-[10px] text-[#666] w-4 text-center">CS</span>
            <span className="text-[10px] text-[#666] w-6 text-right">OVR</span>
            <span className="text-[10px] text-[#666] w-7 text-right">RTG</span>
          </div>
          <div className="space-y-2">
            {[...picks].sort((a, b) => b.slotIndex - a.slotIndex).map((p, i) => {
              const stat = result.playerStats.find(s => s.playerId === p.playerId);
              const rtg  = stat?.avgMatchRating ?? 0;
              const rtgColor = rtg >= 8.0 ? 'text-[#00c896]' : rtg >= 7.0 ? 'text-[#60a5fa]' : rtg >= 6.5 ? 'text-white' : 'text-[#888]';
              const isDefender = p.position === 'GK' || ['CB','LB','RB','LWB','RWB'].includes(p.position);
              return (
                <div key={i} className="flex items-center gap-2 sm:gap-3">
                  <PositionBadge pos={p.position} size="xs" />
                  <span className="font-bold text-sm flex-1 min-w-0 truncate">{p.playerName}</span>
                  <span className="text-[#666] text-xs shrink-0 hidden sm:inline">{p.clubName.slice(0, 3).toUpperCase()}</span>
                  <span className="text-[#888] text-xs font-bold w-4 text-center">{stat?.goals ?? 0}</span>
                  <span className="text-[#888] text-xs font-bold w-4 text-center">{stat?.assists ?? 0}</span>
                  <span className="text-[#888] text-xs font-bold w-4 text-center">{isDefender ? (stat?.cleanSheets ?? 0) : '-'}</span>
                  <span className="font-black text-sm w-6 text-right" style={{ color: ratingColor(p.rating) }}>{p.rating}</span>
                  <span className={`font-black text-xs w-7 text-right ${rtgColor}`}>{rtg > 0 ? rtg.toFixed(1) : '-'}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          {/*
            One awards block, not two. When the drafted XI sweeps the league —
            which happens often — the old League Awards and Your XI Awards
            panels printed the same four names one above the other. Each award
            names the league winner, and adds your own best only when they are
            not the same player.
          */}
          <div className="bg-[#111] rounded-2xl p-6">
            <div className="text-xs text-[#888] uppercase tracking-widest mb-4 font-bold">Awards</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Award
                icon="🏅" title="Player of the Season"
                name={result.awards.leaguePlayerOfSeason.name}
                stat={`${result.awards.leaguePlayerOfSeason.goals}G · ${result.awards.leaguePlayerOfSeason.assists}A · ${result.awards.leaguePlayerOfSeason.isUser ? 'Your XI ★' : result.awards.leaguePlayerOfSeason.club}`}
                yours={result.awards.leaguePlayerOfSeason.isUser ? undefined
                  : `${result.awards.playerOfSeason.name} — ${result.awards.playerOfSeason.goals}G · ${result.awards.playerOfSeason.assists}A`}
              />
              {result.topScorers?.[0] && (
                <Award
                  icon="⚽" title="Golden Boot"
                  name={result.topScorers[0].playerName}
                  stat={`${result.topScorers[0].value} goals · ${result.topScorers[0].isUser ? 'Your XI ★' : result.topScorers[0].clubName}`}
                  yours={result.topScorers[0].isUser ? undefined
                    : `${result.awards.goldenBoot.name} — ${result.awards.goldenBoot.goals} goals`}
                />
              )}
              {result.topAssisters?.[0] && (
                <Award
                  icon="🎯" title="Top Assister"
                  name={result.topAssisters[0].playerName}
                  stat={`${result.topAssisters[0].value} assists · ${result.topAssisters[0].isUser ? 'Your XI ★' : result.topAssisters[0].clubName}`}
                  yours={result.topAssisters[0].isUser ? undefined
                    : `${result.awards.playmaker.name} — ${result.awards.playmaker.assists} assists`}
                />
              )}
              {result.topKeepers?.[0] && (
                <Award
                  icon="🧤" title="Golden Glove"
                  name={result.topKeepers[0].playerName}
                  stat={`${result.topKeepers[0].value} clean sheets · ${result.topKeepers[0].isUser ? 'Your XI ★' : result.topKeepers[0].clubName}`}
                  yours={result.topKeepers[0].isUser ? undefined
                    : `${result.awards.goldenGlove.name} — ${result.awards.goldenGlove.cleanSheets} clean sheets`}
                />
              )}
            </div>
          </div>

          {/* Extra records */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#111] rounded-xl p-4">
              <div className="text-xs text-[#888] mb-1">Longest Win Streak</div>
              <div className="text-2xl font-black">{result.longestWinStreak}</div>
            </div>
            <div className="bg-[#111] rounded-xl p-4">
              <div className="text-xs text-[#888] mb-1">Biggest Win</div>
              <div className="text-sm font-black text-[#00c896]">{result.biggestWin}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Full league table. Fourteen columns: it earns the full width. */}
      {result.finalTable?.length > 0 && (
        <LeagueTable table={result.finalTable} />
      )}

      {/* League leaderboards */}
      {(result.topScorers?.length > 0 || result.topAssisters?.length > 0 || result.topKeepers?.length > 0) && (
        <LeagueLeaderboards
          scorers={result.topScorers ?? []}
          assisters={result.topAssisters ?? []}
          keepers={result.topKeepers ?? []}
        />
      )}
    </div>
  );
}

function HeroStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-[#1a1a1a] rounded-xl p-3 text-center">
      <div className={`text-2xl font-black ${accent ? 'text-[#00c896]' : ''}`}>{value}</div>
      <div className="text-[10px] text-[#666] uppercase tracking-widest">{label}</div>
    </div>
  );
}

// ── League Table ──────────────────────────────────────────────────────────────

function LeagueTable({ table }: { table: TeamStanding[] }) {
  const [show, setShow] = useState(true); // open by default in final summary
  const posColor = (pos: number) =>
    pos === 1 ? '#fbbf24' : pos <= 4 ? '#3b82f6' : pos <= 6 ? '#8b5cf6' : pos >= 18 ? '#ef4444' : undefined;

  return (
    <div className="bg-[#111] rounded-2xl overflow-hidden">
      <button onClick={() => setShow(s => !s)} className="w-full flex items-center justify-between px-6 py-4 hover:bg-[#151515] transition-colors">
        <div className="text-xs text-[#888] uppercase tracking-widest font-bold">Final League Table</div>
        <span className="text-[#666] text-xs">{show ? '▲' : '▼'}</span>
      </button>
      {show && (
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 px-2 pb-1 text-[9px] text-[#666] uppercase tracking-widest border-b border-[#1a1a1a]">
            <span className="w-5 text-center">#</span>
            <span className="flex-1 min-w-0">Club</span>
            <span className="w-5 text-center">P</span>
            <span className="w-5 text-center">W</span>
            <span className="w-5 text-center">D</span>
            <span className="w-5 text-center">L</span>
            <span className="w-7 text-center">GF</span>
            <span className="w-7 text-center">GA</span>
            <span className="w-7 text-center">GD</span>
            <span className="w-7 text-right">Pts</span>
            <span className="w-8 text-center text-[#00c896]/70 hidden sm:block">OVR</span>
            <span className="w-8 text-center text-orange-400/70 hidden md:block">ATT</span>
            <span className="w-8 text-center text-purple-400/70 hidden md:block">MID</span>
            <span className="w-8 text-center text-blue-400/70 hidden md:block">DEF</span>
          </div>
          {table.map(row => (
            <div key={row.name} className={`flex items-center gap-2 px-2 py-1.5 text-xs rounded ${row.isUser ? 'bg-[#00c896]/10' : ''}`}>
              <span className="w-5 text-center font-black" style={{ color: posColor(row.position) ?? '#888' }}>{row.position}</span>
              <span className={`flex-1 min-w-0 font-bold truncate ${row.isUser ? 'text-[#00c896]' : 'text-[#ccc]'}`}>{row.name}</span>
              <span className="w-5 text-center text-[#666]">{row.played}</span>
              <span className="w-5 text-center text-[#888]">{row.won}</span>
              <span className="w-5 text-center text-[#666]">{row.drawn}</span>
              <span className="w-5 text-center text-[#666]">{row.lost}</span>
              <span className="w-7 text-center text-[#888]">{row.goalsFor}</span>
              <span className="w-7 text-center text-[#666]">{row.goalsAgainst}</span>
              <span className={`w-7 text-center ${row.gd > 0 ? 'text-[#00c896]' : row.gd < 0 ? 'text-red-400' : 'text-[#888]'}`}>
                {row.gd > 0 ? '+' : ''}{row.gd}
              </span>
              <span className="w-7 text-right font-black text-white">{row.points}</span>
              <span className="w-8 text-center font-bold text-[#00c896] hidden sm:block">{row.ovr}</span>
              <span className="w-8 text-center text-orange-400 hidden md:block">{row.att}</span>
              <span className="w-8 text-center text-purple-400 hidden md:block">{row.mid}</span>
              <span className="w-8 text-center text-blue-400 hidden md:block">{row.def}</span>
            </div>
          ))}
          <div className="flex gap-3 mt-3 flex-wrap">
            {[['#fbbf24','Champions'],['#3b82f6','Top 4 (UCL)'],['#8b5cf6','6th (UEL)'],['#ef4444','Relegation']].map(([c,l]) => (
              <div key={l} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: c }} />
                <span className="text-[9px] text-[#666]">{l}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── League Leaderboards ───────────────────────────────────────────────────────

const BOARDS = [
  { key: 'scorers',   tab: '⚽ Top Scorers',   title: 'Top Scorers',   unit: 'Goals' },
  { key: 'assisters', tab: '🎯 Top Assisters', title: 'Top Assisters', unit: 'Assists' },
  { key: 'keepers',   tab: '🧤 Golden Glove',  title: 'Golden Glove',  unit: 'CS' },
] as const;

/**
 * Three ranked lists.
 *
 * Tabs below `lg:`, because a phone has room for one list. Above it all three
 * sit side by side and the tabs go away — a tab that exists only because the
 * screen was small is a phone affordance, and there is room here for the thing
 * itself.
 */
function LeagueLeaderboards({ scorers, assisters, keepers }: { scorers: LeagueEntry[]; assisters: LeagueEntry[]; keepers: LeagueEntry[] }) {
  const [tab, setTab] = useState<'scorers' | 'assisters' | 'keepers'>('scorers');
  const data = { scorers, assisters, keepers };

  return (
    <div className="bg-[#111] rounded-2xl p-6">
      <div className="text-xs text-[#888] uppercase tracking-widest font-bold mb-4">League Leaderboards</div>
      <div className="flex gap-2 mb-4 flex-wrap lg:hidden">
        {BOARDS.map(b => (
          <button key={b.key} type="button" onClick={() => setTab(b.key)}
            className={`px-3 py-2.5 rounded-lg text-xs font-bold transition-colors touch-manipulation ${tab === b.key ? 'bg-[#00c896] text-black' : 'bg-[#1a1a1a] text-[#888] hover:text-white'}`}>
            {b.tab}
          </button>
        ))}
      </div>
      <div className="lg:grid lg:grid-cols-3 lg:gap-6">
        {BOARDS.map(b => (
          <div key={b.key} className={`${tab === b.key ? 'block' : 'hidden'} lg:block`}>
            <div className="hidden lg:block text-[10px] text-[#888] uppercase tracking-widest font-bold mb-2">{b.title}</div>
            <div className="flex items-center gap-3 px-2 pb-1.5 text-[9px] text-[#666] uppercase tracking-widest border-b border-[#1a1a1a]">
              <span className="w-5 text-center">#</span>
              <span className="flex-1">Player</span>
              <span className="w-24 text-right text-[10px] lg:hidden xl:block">Club</span>
              <span className="w-8 text-right">{b.unit}</span>
            </div>
            <div className="space-y-0.5 mt-1">
              {data[b.key].slice(0, 20).map((e, i) => (
                <div key={i} className={`flex items-center gap-3 px-2 py-1.5 rounded text-xs ${e.isUser ? 'bg-[#00c896]/10' : ''}`}>
                  <span className="w-5 text-center text-[#666] font-bold">{i + 1}</span>
                  <span className={`flex-1 min-w-0 truncate font-bold ${e.isUser ? 'text-[#00c896]' : 'text-[#ccc]'}`}>{e.playerName}</span>
                  <span className={`w-24 text-right text-[10px] truncate lg:hidden xl:block ${e.isUser ? 'text-[#00c896]/60' : 'text-[#666]'}`}>{e.clubName}</span>
                  <span className={`w-8 text-right font-black ${e.isUser ? 'text-[#00c896]' : 'text-white'}`}>{e.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Helper components ─────────────────────────────────────────────────────────

function Award({ icon, title, name, stat, yours }: {
  icon: string; title: string; name: string; stat: string;
  /** Your XI's best in this category, when the league winner is not one of them. */
  yours?: string;
}) {
  return (
    <div className="bg-[#1a1a1a] rounded-xl p-3">
      <div className="text-xs text-[#888] mb-1">{icon} {title}</div>
      <div className="font-black text-sm">{name}</div>
      <div className="text-[#00c896] text-xs">{stat}</div>
      {yours && (
        <div className="text-[#666] text-[11px] mt-1.5 pt-1.5 border-t border-[#222] truncate">
          Yours: {yours}
        </div>
      )}
    </div>
  );
}

function ordinal(n: number): string {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
