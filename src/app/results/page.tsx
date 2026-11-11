'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getFormation, canFillSlot, Formation } from '@/lib/formations';
import { describeCompetition, getTeamStrengths, runSeasonSimulation, type DataPlayer } from '@/lib/gameData';
import { useStoredJson, clearStored, readStored, writeStored } from '@/lib/clientStorage';
import {
  parseRunHistory, replaceRun, RUN_HISTORY_KEY, styleRecords, withRun, xiKey,
  type RunRecord, type StyleRecord,
} from '@/lib/runHistory';
import { PLAYSTYLES, type PlaystyleName } from '@/lib/matchEngine';
import { keyMoments, seasonStory, type KeyMoment } from '@/lib/keyMoments';
import { parseSeenSquads, resolveSeenSquads, SEEN_SQUADS_KEY, type SeenSquad } from '@/lib/seenSquads';
import { applyRules, type DraftFilter, type PoolRules } from '@/lib/draftPool';
import { getTacticEffect } from '@/lib/gameData';
import type { StoredPlan } from '@/app/squad/page';
import {
  SquadPick, SimulationResult, TeamStanding, LeagueEntry, FixtureResult, PlayerStats,
  computeOverall, preSeasonOdds,
} from '@/lib/simulation';
import PitchView from '@/components/PitchView';
import PositionBadge from '@/components/PositionBadge';
import LineRatings from '@/components/LineRatings';
import BackLink from '@/components/BackLink';
import { ratingColor } from '@/components/ratingColor';

// ── What Could Have Been ─────────────────────────────────────────────────────

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

function WhatCouldHaveBeen({ formation, actualPicks, rules }: {
  formation: Formation;
  actualPicks: SquadPick[];
  rules: Pick<PoolRules, 'playerRating' | 'filter'>;
}) {
  const [show, setShow] = useState(false);
  const stored = useStoredJson<unknown>(SEEN_SQUADS_KEY);
  const bestXI = useMemo(() => {
    // The same rules the draft applied, so the best XI is built from players
    // this run could have picked, at the ratings it offered them at: no
    // German in a France-only run, and Prime ratings in Prime mode.
    const seenSquads = resolveSeenSquads(parseSeenSquads(stored))
      .map(squad => ({ ...squad, players: applyRules(squad.players, rules) }))
      .filter(squad => squad.players.length > 0);
    return seenSquads.length ? computeBestXI(formation, seenSquads) : [];
  }, [formation, stored, rules]);
  if (!bestXI.length) return null;
  const bestOverall = computeOverall(bestXI);
  const actualOverall = computeOverall(actualPicks);
  const diff = bestOverall - actualOverall;
  const sortedBest = [...bestXI].sort((a, b) => b.slotIndex - a.slotIndex);
  const actualMap = new Map(actualPicks.map(p => [p.slotIndex, p]));
  return (
    <div className="bg-card rounded-2xl p-6">
      <button type="button" aria-expanded={show} onClick={() => setShow(s => !s)} className="w-full flex items-center justify-between touch-manipulation">
        <div className="text-left">
          <div className="text-xs text-muted uppercase tracking-widest font-bold mb-1">What Could Have Been</div>
          <div className="text-sm text-muted">
            Best possible XI from your spins —{' '}
            <span className={diff > 0 ? 'text-amber-400' : 'text-accent'}>Overall {bestOverall}</span>
            {diff > 0 && <span className="text-amber-400 ml-1">(+{diff} vs yours)</span>}
            {diff === 0 && <span className="text-accent ml-1">(you nailed it)</span>}
          </div>
        </div>
        <span className="text-subtle ml-4">{show ? '▲' : '▼'}</span>
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
                <span className={`font-bold text-sm flex-1 ${isPicked ? 'text-accent' : ''}`}>{p.playerName}</span>
                <span className="text-subtle text-xs">{p.clubName.slice(0, 3).toUpperCase()} {p.seasonLabel}</span>
                <span className="text-accent font-black text-sm w-6 text-right">{p.rating}</span>
                {!isPicked && rDiff > 0 && <span className="text-amber-400 text-[11px] w-8 text-right">+{rDiff}</span>}
                {isPicked && <span className="text-accent text-[11px] w-8 text-right">✓</span>}
              </div>
            );
          })}
          <p className="text-subtle text-[11px] mt-3 text-center">✓ = player you actually picked · numbers show rating advantage missed</p>
        </div>
      )}
    </div>
  );
}

// ── The season as it is written down ─────────────────────────────────────────

/** The style a stored name refers to, as the screen names it. */
function styleLabel(style: string): string {
  return PLAYSTYLES[style as PlaystyleName]?.label ?? 'Balanced';
}

/** The gameweek after which the player is asked whether to change style. */
function halfwayWeek(result: SimulationResult): number {
  return Math.floor(result.gameweeks.length / 2);
}

/** A played season, as `38-0-history` keeps it. */
function runRecord(
  result: SimulationResult, seed: number, playedAt: number, picks: SquadPick[], plan: StoredPlan | null,
): RunRecord | null {
  const competition = describeCompetition(plan?.seasonId, plan?.league);
  if (!competition) return null;
  const fieldOveralls = getTeamStrengths(plan?.seasonId, plan?.league).map(t => t.overall);
  const top = result.playerStats.reduce((a, b) => (b.goals > a.goals ? b : a));
  const changedTo = result.styles.length > 1 ? result.styles[result.styles.length - 1].style : undefined;
  return {
    xi: xiKey(picks),
    seasonId: competition.seasonId,
    seasonLabel: competition.seasonLabel,
    style: result.styles[0].style,
    ...(changedTo ? { changedTo } : {}),
    formation: readStored<{ formation?: string }>('38-0-setup')?.formation ?? '',
    overall: computeOverall(picks),
    position: result.finalPosition,
    points: result.points,
    wins: result.wins,
    draws: result.draws,
    losses: result.losses,
    goalsFor: result.goalsFor,
    goalsAgainst: result.goalsAgainst,
    expectedPoints: preSeasonOdds(computeOverall(picks), fieldOveralls).expectedPoints,
    topScorer: top.playerName,
    topScorerGoals: top.goals,
    seed,
    playedAt,
  };
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function ResultsPage() {
  const router = useRouter();

  // The drafted XI, the setup that produced it and the plan chosen before
  // kick-off are all handed over in localStorage.
  const picks     = useStoredJson<SquadPick[]>('38-0-squad') ?? NO_PICKS;
  const setup     = useStoredJson<{
    formation: string;
    draftMode?: string;
    playerRating?: 'career' | 'prime';
    filter?: DraftFilter | null;
  }>('38-0-setup');
  const plan      = useStoredJson<StoredPlan>('38-0-plan');
  const formation = useMemo(() => getFormation(setup?.formation ?? '4-4-2'), [setup]);
  const poolRules = useMemo(() => ({
    playerRating: setup?.playerRating === 'prime' ? 'prime' as const : 'career' as const,
    filter:       setup?.filter ?? null,
  }), [setup]);

  // The season and the seed it was played on, kept together so the report can
  // name the one that produced it. `decided` is whether the half-time choice
  // of style has been made; until it is, the live view stops at halfway.
  const [played, setPlayed] = useState<{
    result: SimulationResult;
    seed: number;
    playedAt: number;
    decided: boolean;
  } | null>(null);
  const simResult = played?.result ?? null;
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
  const field    = useMemo(
    () => getTeamStrengths(plan?.seasonId, plan?.league),
    [plan?.seasonId, plan?.league],
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
      const seed = Math.floor(Math.random() * 2_000_000_000);
      const result = runSeasonSimulation(picks, seed, {
        seasonId: plan?.seasonId,
        league:   plan?.league,
        style:    plan?.style,
      });
      if (cancelled) return;
      // Written down as it is played, here rather than in an effect on the
      // result, so that a season is recorded exactly once however often this
      // page re-renders, and so that leaving at halfway cannot erase a bad
      // one. A change of style at halfway rewrites this record rather than
      // adding one. The tactics board and the home page read it.
      const playedAt = Date.now();
      const record = runRecord(result, seed, playedAt, picks, plan);
      if (record) writeStored(RUN_HISTORY_KEY, withRun(parseRunHistory(readStored<unknown>(RUN_HISTORY_KEY)), record));
      setPlayed({ result, seed, playedAt, decided: false });
    }, 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [picks, plan, run]);

  const history = useStoredJson<unknown>(RUN_HISTORY_KEY);
  const records = useMemo(
    () => (opponent ? styleRecords(parseRunHistory(history), xiKey(picks), opponent.seasonId) : []),
    [history, picks, opponent],
  );

  /**
   * The half-time decision. Keeping the style changes nothing. Changing it
   * replays the season on the same seed with the new style from the next
   * gameweek: the first half comes out exactly as it was shown (see
   * `simulateSeason`), so only what has not been seen yet is new.
   */
  function handleHalfTime(style: PlaystyleName) {
    if (!played) return;
    if (style === played.result.styles[0].style) {
      setPlayed({ ...played, decided: true });
      return;
    }
    const result = runSeasonSimulation(picks, played.seed, {
      seasonId: plan?.seasonId,
      league:   plan?.league,
      style:    plan?.style,
      change:   { afterWeek: halfwayWeek(played.result), style },
    });
    const record = runRecord(result, played.seed, played.playedAt, picks, plan);
    if (record) writeStored(RUN_HISTORY_KEY, replaceRun(parseRunHistory(readStored<unknown>(RUN_HISTORY_KEY)), record));
    setPlayed({ ...played, result, decided: true });
  }

  function handleResim() {
    setShowFinal(false);
    setPlayed(null);
    setRun(n => n + 1);
  }

  if (!picks.length) {
    return <div className="min-h-screen bg-ground flex items-center justify-center text-fg">Loading…</div>;
  }

  const overall = computeOverall(picks);
  // The same projection the pre-season screen showed, against the same field —
  // it is what the final report judges the season against.
  const odds    = preSeasonOdds(overall, field.map(t => t.overall));

  // While the season is playing out, the live panel is the only thing changing.
  // On a phone the squad list above it is several screens tall, so the match
  // would animate off-screen; promote it to the top until the report is shown.
  const liveSim = simResult !== null && !showFinal;

  return (
    <main className="min-h-screen bg-ground text-fg">
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
          <div className="bg-card rounded-2xl p-6 text-center">
            <div className="text-sm font-black text-accent animate-pulse">Playing the season…</div>
            <div className="text-subtle text-xs mt-1">38 games against the {opponent?.seasonLabel ?? 'current'} field</div>
          </div>
        )}

        {/* Live GW simulation */}
        {liveSim && (
          <LiveSimulation
            simResult={simResult}
            decided={played?.decided ?? true}
            records={records}
            expectedPoints={odds.expectedPoints}
            onHalfTime={handleHalfTime}
            onDone={() => setShowFinal(true)}
          />
        )}

        {/* Final season report */}
        {played && showFinal && (
          <FinalSummary
            result={played.result}
            seed={played.seed}
            picks={picks}
            odds={odds}
            league={opponent ? `${opponent.leagueName} ${opponent.seasonLabel}` : 'Premier League'}
            records={records}
            onResim={handleResim}
          />
        )}

        {/* The plan this season is being played under. */}
        <div className="bg-card rounded-2xl px-5 py-4 flex items-center gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-[11px] text-subtle uppercase tracking-widest font-bold mb-1">Playing</div>
            <div className="font-black text-sm truncate">
              {opponent ? `${opponent.leagueName} ${opponent.seasonLabel}` : 'Premier League'}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-subtle uppercase tracking-widest font-bold mb-1">Tactic</div>
            <div className="font-black text-sm truncate">
              {simResult
                ? simResult.styles.map(st => styleLabel(st.style)).join(' → ')
                : tactic?.label ?? 'Balanced'}
            </div>
          </div>
          <Link
            href="/squad"
            className="ml-auto shrink-0 px-3 py-2.5 rounded-lg border border-line-strong text-muted text-xs font-bold hover:border-line-hover hover:text-fg transition-colors touch-manipulation"
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
        <WhatCouldHaveBeen formation={formation} actualPicks={picks} rules={poolRules} />

        <div className="text-center pb-8">
          <button
            type="button"
            onClick={() => {
              clearStored('38-0-draft', '38-0-draft-state', '38-0-squad', SEEN_SQUADS_KEY, '38-0-plan');
              router.push('/');
            }}
            className="text-subtle text-xs hover:text-fg transition-colors px-4 py-3 touch-manipulation"
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
    <details className="group bg-card rounded-2xl">
      <summary className="cursor-pointer list-none px-5 py-4 flex items-center gap-3 touch-manipulation">
        <span className="text-subtle transition-transform group-open:rotate-90">▶</span>
        <span className="text-[11px] text-subtle uppercase tracking-widest font-bold">Your XI</span>
        <span className="text-sm text-muted">{formation.name}</span>
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
                <span className="text-subtle text-xs shrink-0">{p.clubName.slice(0, 3).toUpperCase()} {p.seasonLabel}</span>
                <span className="text-accent font-black text-sm w-6 text-right shrink-0">{p.rating}</span>
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
  simResult, decided, records, expectedPoints, onHalfTime, onDone,
}: {
  simResult: SimulationResult;
  /** Whether the half-time choice of style has been made. */
  decided: boolean;
  records: StyleRecord[];
  expectedPoints: number;
  onHalfTime: (style: PlaystyleName) => void;
  onDone: () => void;
}) {
  const [gw, setGw]           = useState(1);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed]     = useState<'normal' | 'fast'>('normal');

  // The league is twenty teams, so a season is 38 rounds — but read it off the
  // result rather than assume it, so a shorter field cannot leave the controls
  // stuck one gameweek from the end.
  const lastGw = simResult.gameweeks.length;
  const half   = halfwayWeek(simResult);
  // The season stops at halfway until the player has decided whether to
  // change style, then runs to the end.
  const stopAt = decided ? lastGw : half;
  const atHalfTime = !decided && gw >= half;

  // Auto-advance. Stops at halfway for the decision, and at the last
  // gameweek, where the play/pause control is replaced by the report button.
  useEffect(() => {
    if (!playing || gw >= stopAt) return;
    const delay = speed === 'fast' ? 300 : 1100;
    const t = setTimeout(() => setGw(g => g + 1), delay);
    return () => clearTimeout(t);
  }, [playing, gw, speed, stopAt]);

  // Every moment so far, newest first. The first half's moments do not change
  // when the style does, because the first half does not.
  const moments = useMemo(() => keyMoments(simResult), [simResult]);
  const shown = useMemo(
    () => moments.filter(m => m.week <= gw).sort((a, b) => b.week - a.week || b.weight - a.weight).slice(0, 5),
    [moments, gw],
  );

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
  // The same hue, darkened on a light ground so the score stays legible.
  const rText         = result === 'W' ? 'var(--c-accent)' : result === 'D' ? 'var(--c-yellow)' : 'var(--c-red)';
  const seasonDone    = gw >= lastGw;

  return (
    <div className="space-y-4">
      {/* GW header bar */}
      <div className="bg-card rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-muted text-[11px] uppercase tracking-widest font-bold">
              <span className="sm:hidden" aria-hidden="true">GW</span>
              <span className="hidden sm:inline">Gameweek</span>
            </span>
            <span className="text-3xl font-black leading-none">{gw}</span>
            <span className="text-muted text-sm whitespace-nowrap">/ {lastGw}</span>
          </div>
          <div className="flex items-center gap-2">
            {atHalfTime ? (
              <span className="text-[11px] text-accent uppercase tracking-widest font-bold">Half-time</span>
            ) : !seasonDone ? (
              <>
                <button
                  onClick={() => setPlaying(p => !p)}
                  className="px-3 py-2.5 rounded-lg text-xs font-bold bg-raised text-muted hover:text-fg transition-colors touch-manipulation whitespace-nowrap"
                >
                  {playing ? '⏸ Pause' : '▶ Play'}
                </button>
                <button
                  aria-label={speed === 'fast' ? 'Playing at three times speed' : 'Playing at normal speed'}
                  aria-pressed={speed === 'fast'}
                  onClick={() => setSpeed(s => s === 'normal' ? 'fast' : 'normal')}
                  className={`px-3 py-2.5 rounded-lg text-xs font-bold transition-colors touch-manipulation ${speed === 'fast' ? 'bg-[#00c896] text-black' : 'bg-raised text-muted hover:text-fg'}`}
                >
                  {speed === 'fast' ? '3×' : '1×'}
                </button>
                <button
                  onClick={() => { setGw(stopAt); setPlaying(false); }}
                  className="px-3 py-2.5 rounded-lg text-xs font-bold bg-raised text-muted hover:text-fg transition-colors touch-manipulation whitespace-nowrap"
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
        <div className="w-full bg-raised rounded-full h-1.5">
          <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${(gw / lastGw) * 100}%`, background: '#00c896' }} />
        </div>
      </div>

      {atHalfTime && (
        <HalfTime
          table={simResult.gameweeks[half - 1].tableSnapshot}
          half={half}
          lastGw={lastGw}
          current={simResult.styles[0].style}
          records={records}
          expectedPoints={expectedPoints}
          onDecide={style => { onHalfTime(style); setPlaying(true); }}
        />
      )}

      {/* Body: fixtures + table.
          The table goes beside the match from 768px up, not 1024px: at 820px
          it was full width with a club name, six hundred pixels of nothing,
          and two numbers. */}
      <div className="grid gap-4 md:grid-cols-[1fr_240px] lg:grid-cols-[1fr_268px]">

        {/* Left: user fixture + other results */}
        <div className="space-y-3">

          {/* User's match – re-mounts each GW for the snap-in feel */}
          {userFixture && (
            <div key={gw} className="bg-card rounded-2xl p-5 border" style={{ borderColor: `${rCol}50` }}
              aria-live="polite" aria-label={`Gameweek ${gw}: ${isHome ? 'home to' : 'away at'} ${opponent}, ${userGoals} ${oppGoals}`}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-black px-2 py-0.5 rounded" style={{ background: rCol, color: result === 'L' ? 'white' : 'black' }}>
                  {result}
                </span>
                <span className="text-sm text-muted-2">{isHome ? 'Home' : 'Away'} · {opponent}</span>
              </div>
              <div className="flex items-center justify-center gap-4 py-2">
                <span className="text-5xl font-black" style={{ color: rText }}>{userGoals}</span>
                <span className="text-2xl text-subtle font-black">–</span>
                <span className={`text-5xl font-black ${result === 'L' ? 'text-fg' : 'text-muted'}`}>{oppGoals}</span>
              </div>
              <MatchDetail fixture={userFixture} />
            </div>
          )}

          {shown.length > 0 && <MomentsFeed moments={shown} week={gw} />}

          {/* Other fixtures */}
          <div className="bg-card rounded-2xl p-4">
            <div className="text-[11px] text-subtle uppercase tracking-widest font-bold mb-3">Other Results</div>
            <div className="space-y-1.5">
              {otherFixtures.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className="flex-1 text-right text-muted-2 truncate">{f.home}</span>
                  <span className="font-black text-fg w-10 text-center shrink-0">{f.homeGoals}–{f.awayGoals}</span>
                  <span className="flex-1 text-muted-2 truncate">{f.away}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Season complete: outcome banner (mobile / if no right panel) */}
          {seasonDone && (
            <div className="bg-card rounded-2xl p-5 text-center md:hidden">
              <div className="text-3xl mb-2">{simResult.finalPosition === 1 ? '🏆' : simResult.finalPosition <= 4 ? '🔵' : simResult.finalPosition >= 18 ? '🔴' : '📊'}</div>
              <div className="font-black text-lg mb-1">
                {simResult.finalPosition === 1 ? 'CHAMPIONS!' : `${ordinal(simResult.finalPosition)} Place`}
              </div>
              <div className="text-muted text-xs mb-4">{simResult.narrative}</div>
              <button onClick={onDone} className="w-full py-3 rounded-xl font-black bg-[#00c896] text-black hover:bg-[#00b385] transition-colors">
                Full Season Report →
              </button>
            </div>
          )}
        </div>

        {/* Right: live table */}
        <div className="bg-card rounded-2xl p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] text-subtle uppercase tracking-widest font-bold">Table</div>
            <div className="text-[11px] text-subtle uppercase tracking-widest">Pts</div>
          </div>
          <div className="flex-1 space-y-0.5">
            {table.map(row => {
              const dotCol = row.position === 1 ? '#fbbf24' : row.position <= 4 ? '#3b82f6' : row.position <= 6 ? '#8b5cf6' : row.position >= 18 ? '#ef4444' : 'var(--t-line-strong)';
              return (
                <div key={row.name} className={`flex items-center gap-1.5 px-1 py-1 rounded text-[11px] ${row.isUser ? 'bg-[#00c896]/10' : ''}`}>
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotCol }} />
                  <span className="text-muted w-4 text-right shrink-0 font-bold">{row.position}</span>
                  <span className={`flex-1 truncate ${row.isUser ? 'text-accent font-black' : 'text-muted'}`}>{row.name}</span>
                  <span className="text-muted w-4 text-center shrink-0">{row.played}</span>
                  <span className={`font-black w-6 text-right shrink-0 ${row.isUser ? 'text-accent' : 'text-fg'}`}>{row.points}</span>
                </div>
              );
            })}
          </div>
          <div className="flex gap-3 mt-3 flex-wrap border-t border-line pt-2">
            {[['#fbbf24','1st'],['#3b82f6','UCL'],['#8b5cf6','UEL'],['#ef4444','REL']].map(([c,l]) => (
              <div key={l} className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
                <span className="text-[11px] text-muted">{l}</span>
              </div>
            ))}
          </div>

          {/* Season done — desktop outcome card inline */}
          {seasonDone && (
            <div className="hidden md:block mt-4 pt-4 border-t border-line text-center">
              <div className="font-black text-base mb-1" style={{ color: simResult.finalPosition === 1 ? 'var(--c-accent)' : simResult.finalPosition <= 4 ? 'var(--c-blue)' : simResult.finalPosition >= 18 ? 'var(--c-red)' : 'var(--t-fg-soft)' }}>
                {simResult.finalPosition === 1 ? '🏆 CHAMPIONS!' : `${ordinal(simResult.finalPosition)} Place`}
              </div>
              <div className="text-[11px] text-muted mb-3">{simResult.points} pts · {simResult.wins}W {simResult.draws}D {simResult.losses}L</div>
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

// ── Half-time of the season ──────────────────────────────────────────────────

/**
 * The one decision made after kick-off. At halfway the season stops on the
 * table, and the player keeps their style or changes it for the second half.
 * The first half stands either way; the record each style has with this XI
 * comes from the tactics board's history.
 */
function HalfTime({ table, half, lastGw, current, records, expectedPoints, onDecide }: {
  table: TeamStanding[];
  half: number;
  lastGw: number;
  current: PlaystyleName;
  records: StyleRecord[];
  expectedPoints: number;
  onDecide: (style: PlaystyleName) => void;
}) {
  const [choice, setChoice] = useState<PlaystyleName>(current);
  const me = table.find(t => t.isUser);
  const byStyle = new Map(records.map(r => [r.style, r]));
  if (!me) return null;
  const pace = Math.round((me.points * lastGw) / Math.max(1, me.played));
  const keep = choice === current;
  return (
    <section className="bg-card rounded-2xl p-5 border border-[#00c896]/50" aria-labelledby="half-time-heading">
      <div className="text-[11px] text-accent uppercase tracking-widest font-bold mb-1">
        Halfway · {half} games played
      </div>
      <h2 id="half-time-heading" className="font-black text-2xl leading-tight">
        {ordinal(me.position)}, {me.points} pts
      </h2>
      <p className="text-sm text-muted mt-1 max-w-2xl">
        {me.won}-{me.drawn}-{me.lost}, {me.goalsFor} scored and {me.goalsAgainst} conceded. On this form the
        season ends on <span className="font-bold text-fg">{pace} points</span>; the bookmakers had you
        on {expectedPoints}.
      </p>
      <p className="text-xs text-muted mt-3 mb-3">
        Keep playing {styleLabel(current)}, or change how the side plays for the last {lastGw - half} games.
        The first half stands either way.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2" role="group" aria-label="Style for the second half">
        {(Object.keys(PLAYSTYLES) as PlaystyleName[]).map(style => {
          const record = byStyle.get(style);
          const selected = choice === style;
          return (
            <button
              key={style}
              type="button"
              aria-pressed={selected}
              onClick={() => setChoice(style)}
              className={`text-left rounded-xl px-3 py-2.5 border transition-colors touch-manipulation ${selected ? 'border-[#00c896] bg-[#00c896]/10' : 'border-line bg-raised hover:border-line-hover'}`}
            >
              <div className={`text-xs font-black truncate ${selected ? 'text-accent' : 'text-fg'}`}>{styleLabel(style)}</div>
              <div className="text-[11px] text-muted truncate">
                {style === current
                  ? 'Playing now'
                  : record
                    ? `Avg ${Math.round(record.averagePoints)} pts · ×${record.played}`
                    : 'Untried'}
              </div>
            </button>
          );
        })}
      </div>
      {/* Sticks to the bottom on a phone, where the fourteen styles run past it. */}
      <div className="sticky bottom-3 mt-4 sm:static">
        <button
          type="button"
          onClick={() => onDecide(choice)}
          className="w-full sm:w-auto px-6 py-3 rounded-xl font-black text-sm bg-[#00c896] text-black hover:bg-[#00b385] transition-colors touch-manipulation shadow-lg sm:shadow-none"
        >
          {keep ? `Keep ${styleLabel(current)} →` : `Switch to ${styleLabel(choice)} →`}
        </button>
      </div>
    </section>
  );
}

// ── Key moments ──────────────────────────────────────────────────────────────

const MOMENT_COLOUR: Record<KeyMoment['tone'], string> = {
  good: 'var(--c-accent)',
  bad: 'var(--c-red)',
  neutral: 'var(--t-muted)',
};

/** One moment: the gameweek, a mark for whether it was good news, and what happened. */
function MomentLine({ moment, now }: { moment: KeyMoment; now?: boolean }) {
  return (
    <li className="flex items-baseline gap-2.5 text-xs">
      <span className="w-9 shrink-0 text-right text-[11px] text-muted font-bold">GW{moment.week}</span>
      <span className="w-1.5 h-1.5 rounded-full shrink-0 self-center" style={{ background: MOMENT_COLOUR[moment.tone] }} aria-hidden="true" />
      <span className={`min-w-0 ${now ? 'font-bold text-fg' : 'text-fg-soft'}`}>{moment.text}</span>
    </li>
  );
}

/**
 * The season so far, in the moments that made it: the newest few, with this
 * gameweek's in bold. It sits under the XI's match, so a late winner is read
 * beside the score it produced.
 */
function MomentsFeed({ moments, week }: { moments: KeyMoment[]; week: number }) {
  return (
    <div className="bg-card rounded-2xl p-4">
      <div className="text-[11px] text-subtle uppercase tracking-widest font-bold mb-3">Key moments</div>
      <ul className="space-y-1.5">
        {moments.map((m, i) => <MomentLine key={`${m.week}-${m.kind}-${i}`} moment={m} now={m.week === week} />)}
      </ul>
    </div>
  );
}

/** The season told in its biggest moments, in order, on the final report. */
function SeasonStory({ result }: { result: SimulationResult }) {
  const story = useMemo(() => seasonStory(keyMoments(result), 8), [result]);
  if (story.length === 0) return null;
  return (
    <div className="bg-card rounded-2xl p-4 sm:p-6">
      <div className="text-xs text-muted uppercase tracking-widest font-bold mb-3">The season in moments</div>
      <ul className="space-y-2 max-w-xl">
        {story.map((m, i) => <MomentLine key={`${m.week}-${m.kind}-${i}`} moment={m} />)}
      </ul>
    </div>
  );
}

// ── Final Summary ─────────────────────────────────────────────────────────────

function FinalSummary({ result, seed, picks, odds, league, records, onResim }: {
  result: SimulationResult;
  seed: number;
  picks: SquadPick[];
  odds: ReturnType<typeof preSeasonOdds>;
  league: string;
  records: StyleRecord[];
  onResim: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const style = result.styles[0].style;
  const change = result.styles[1];
  // How the season was played: one style, or one and then another from
  // halfway.
  const playedAs = change
    ? `${styleLabel(style)}, then ${styleLabel(change.style)} from gameweek ${change.fromWeek},`
    : styleLabel(style);
  // The bookmakers priced this XI playing Balanced. The margin against their
  // line is what the season, and the style it was played in, was worth.
  const margin = result.points - odds.expectedPoints;
  const overall = computeOverall(picks);

  function share() {
    const text = [
      `38-0 · ${league}`,
      `${ordinal(result.finalPosition)} · ${result.points} pts · ${result.wins}-${result.draws}-${result.losses} · ${result.goalsFor} scored, ${result.goalsAgainst} conceded`,
      `XI rated ${overall}, playing ${change ? `${styleLabel(style)} then ${styleLabel(change.style)}` : styleLabel(style)} (${margin >= 0 ? '+' : ''}${margin} on the bookmakers' ${odds.expectedPoints})`,
      `Top scorer: ${result.awards.goldenBoot.name}, ${result.awards.goldenBoot.goals}`,
      `Season #${seed}`,
    ].join('\n');
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
    if (navigator.share) navigator.share({ text }).then(done, () => undefined);
    else navigator.clipboard?.writeText(text).then(done, () => undefined);
  }

  const perf =
    result.finalPosition < odds.projectedPosition ? 'OVERPERFORMED' :
    result.finalPosition > odds.projectedPosition ? 'UNDERPERFORMED' : 'AS EXPECTED';
  const perfColor = perf === 'OVERPERFORMED' ? 'text-accent border-[#00c896]' : perf === 'UNDERPERFORMED' ? 'text-red-400 border-red-400' : 'text-amber-400 border-amber-400';
  const resultBg =
    result.finalPosition === 1 ? 'from-[#00c896]/20 to-transparent' :
    result.finalPosition <= 4  ? 'from-blue-900/20 to-transparent' :
    result.finalPosition >= 18 ? 'from-red-900/20 to-transparent' :
    'from-raised to-transparent';
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
      <div className={`bg-gradient-to-b ${resultBg} bg-card rounded-2xl p-6 sm:p-8 text-center`}>
        <div className="text-5xl sm:text-6xl mb-3">{result.finalPosition === 1 ? '🏆' : '📋'}</div>
        <div className="font-black text-3xl sm:text-5xl tracking-tight mb-2">{outcomeLabel}</div>
        <div className="text-muted text-sm sm:text-base max-w-2xl mx-auto mb-6">{result.narrative}</div>

        <div className="grid grid-cols-2 gap-3 max-w-2xl mx-auto sm:grid-cols-4">
          <HeroStat label="Finished"  value={ordinal(result.finalPosition)} />
          <HeroStat label="Points"    value={String(result.points)} accent />
          <HeroStat label="Record"    value={`${result.wins}-${result.draws}-${result.losses}`} />
          <div className="bg-raised rounded-xl p-3 flex flex-col items-center justify-center gap-1">
            <div className={`text-[11px] font-black border rounded px-2 py-1 ${perfColor}`}>{perf}</div>
            <div className="text-[11px] text-muted uppercase tracking-widest">priced {ordinal(odds.projectedPosition)}</div>
          </div>
        </div>

        <p className="text-sm text-muted max-w-2xl mx-auto mt-5">
          The bookmakers had this XI on <span className="font-bold text-fg">{odds.expectedPoints} points</span> playing
          Balanced. Playing {playedAs} it took{' '}
          <span className={`font-black ${margin >= 0 ? 'text-accent' : 'text-red-400'}`}>
            {margin >= 0 ? '+' : ''}{margin}
          </span>{' '}
          on that line.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/squad"
            className="px-6 py-3 rounded-xl font-black text-sm bg-[#00c896] text-black hover:bg-[#00b385] transition-colors touch-manipulation"
          >
            Try another style →
          </Link>
          <button
            type="button"
            onClick={onResim}
            className="px-6 py-3 rounded-xl font-black text-sm bg-raised text-muted hover:bg-raised-max hover:text-fg transition-colors border border-line-strong touch-manipulation"
          >
            ↺ Play it again
          </button>
          <button
            type="button"
            onClick={share}
            className="px-6 py-3 rounded-xl font-black text-sm bg-raised text-muted hover:bg-raised-max hover:text-fg transition-colors border border-line-strong touch-manipulation"
          >
            {copied ? 'Copied ✓' : 'Share'}
          </button>
        </div>
        <div className="text-[11px] text-subtle mt-3">Season #{seed}</div>
      </div>

      <SeasonStory result={result} />

      <TacticsBoard records={records} current={change ? null : style} expected={odds.expectedPoints} />

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
          <div key={l} className="bg-card rounded-xl p-4 text-center">
            <div className="text-2xl font-black">{v}</div>
            <div className="text-[11px] text-subtle uppercase tracking-widest">{l}</div>
          </div>
        ))}
      </div>

      {/*
        Everything below the verdict is reference material, and reference
        material reads fine two columns wide. This roughly halves the page.
      */}
      <div className="grid gap-6 min-w-0 lg:grid-cols-2 lg:items-start [&>*]:min-w-0">

        <XiStats picks={picks} stats={result.playerStats} />

        <div className="space-y-6">
          {/*
            One awards block, not two. When the drafted XI sweeps the league —
            which happens often — the old League Awards and Your XI Awards
            panels printed the same four names one above the other. Each award
            names the league winner, and adds your own best only when they are
            not the same player.
          */}
          <div className="bg-card rounded-2xl p-6">
            <div className="text-xs text-muted uppercase tracking-widest mb-4 font-bold">Awards</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Award
                icon="🏅" title="Player of the Season"
                name={result.awards.leaguePlayerOfSeason.name}
                stat={`${result.awards.leaguePlayerOfSeason.rating.toFixed(2)} avg · ${result.awards.leaguePlayerOfSeason.goals}G · ${result.awards.leaguePlayerOfSeason.assists}A · ${result.awards.leaguePlayerOfSeason.isUser ? 'Your XI ★' : result.awards.leaguePlayerOfSeason.club}`}
                yours={result.awards.leaguePlayerOfSeason.isUser ? undefined
                  : `${result.awards.playerOfSeason.name} — ${result.awards.playerOfSeason.rating.toFixed(2)} avg · ${result.awards.playerOfSeason.goals}G · ${result.awards.playerOfSeason.assists}A`}
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
            <div className="bg-card rounded-xl p-4">
              <div className="text-xs text-muted mb-1">Longest Win Streak</div>
              <div className="text-2xl font-black">{result.longestWinStreak}</div>
            </div>
            <div className="bg-card rounded-xl p-4">
              <div className="text-xs text-muted mb-1">Biggest Win</div>
              <div className="text-sm font-black text-accent">{result.biggestWin}</div>
            </div>
          </div>
        </div>
      </div>

      <SeasonResults result={result} />

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

/**
 * What each style has done with this eleven in this league.
 *
 * The pre-season odds are priced for a Balanced side and never learn the
 * tactic, so this is where a player finds out what a style is worth to their
 * XI: by playing it, and seeing it against the others they have played. One
 * season is a noisy measure (about six points either way), which is why the
 * board shows how many seasons each average rests on.
 */
function TacticsBoard({ records, current, expected }: {
  records: StyleRecord[];
  /** The style this season was played in, or null when it changed at halfway. */
  current: string | null;
  expected: number;
}) {
  const total = Object.keys(PLAYSTYLES).length;
  const best = Math.max(expected, ...records.map(r => r.averagePoints));
  return (
    <div className="bg-card rounded-2xl p-4 sm:p-6">
      <div className="flex items-baseline gap-3 mb-1">
        <div className="text-xs text-muted uppercase tracking-widest font-bold">Tactics Board</div>
        <div className="text-[11px] text-muted">{records.length} of {total} styles tried with this XI</div>
      </div>
      <p className="text-xs text-muted mb-4 max-w-2xl">
        Average points by style, against the bookmakers&apos; Balanced line of {expected}. A single season can
        land six points either side of a style&apos;s true level, so play one again before trusting it.
        {current === null && ' This season changed style at halfway, so it measures neither and is not on the board.'}
      </p>
      <div className="space-y-2">
        {records.map(r => {
          const diff = Math.round(r.averagePoints) - expected;
          return (
            <div key={r.style} className="flex items-center gap-3 text-xs">
              <span className={`w-28 shrink-0 truncate font-bold ${r.style === current ? 'text-accent' : 'text-fg'}`}>
                {PLAYSTYLES[r.style as keyof typeof PLAYSTYLES]?.label ?? r.style}
              </span>
              <div className="flex-1 h-2 rounded-full bg-raised relative overflow-hidden">
                <div
                  className="h-2 rounded-full"
                  style={{ width: `${(r.averagePoints / best) * 100}%`, background: 'var(--c-accent)', opacity: r.style === current ? 1 : 0.55 }}
                />
                {/* The bookmakers' line. */}
                <div className="absolute inset-y-0 w-0.5 bg-fg" style={{ left: `${(expected / best) * 100}%` }} />
              </div>
              <span className="w-10 text-right font-black text-fg">{Math.round(r.averagePoints)}</span>
              <span className={`w-9 text-right font-bold ${diff >= 0 ? 'text-accent' : 'text-red-400'}`}>
                {diff >= 0 ? '+' : ''}{diff}
              </span>
              <span className="w-8 text-right text-muted">×{r.played}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── What happened in a match ─────────────────────────────────────────────────

const lastName = (name: string) => name.split(' ').pop() ?? name;

/**
 * Both sides of one of the XI's matches: who scored and who set it up, the
 * cards, and the numbers underneath the scoreline. The engine has always
 * recorded all of it; the screen used to show the XI's scorers and nothing
 * else, so a 1-2 defeat never said who had scored the two.
 */
function MatchDetail({ fixture }: { fixture: FixtureResult }) {
  const detail = fixture.detail;
  if (!detail) return null;
  const userIsHome = fixture.home === 'Your XI';
  const mine = userIsHome ? detail.home : detail.away;
  const theirs = userIsHome ? detail.away : detail.home;
  const line = (e: typeof detail.events[number]) => {
    const mark = e.type === 'goal' ? '⚽' : e.type === 'yellow' ? '🟨' : '🟥';
    const extra = e.type === 'goal' ? (e.penalty ? ' (pen)' : e.assist ? ` (${lastName(e.assist)})` : '') : '';
    return `${mark} ${lastName(e.name)} ${e.minute}′${extra}`;
  };
  const column = (user: boolean) => detail.events.filter(e => e.user === user);
  return (
    <div className="mt-3 space-y-3">
      {detail.events.length > 0 && (
        <div className="grid grid-cols-2 gap-4 text-xs">
          <ul className="space-y-0.5 text-right text-fg-soft" aria-label="Your XI">
            {column(true).map((e, i) => <li key={i}>{line(e)}</li>)}
          </ul>
          <ul className="space-y-0.5 text-muted" aria-label="Opponent">
            {column(false).map((e, i) => <li key={i}>{line(e)}</li>)}
          </ul>
        </div>
      )}
      <dl className="grid grid-cols-[1fr_auto_1fr] gap-x-3 gap-y-0.5 text-xs border-t border-line pt-3">
        {([
          ['Shots (on target)', `${mine.shots} (${mine.shotsOnTarget})`, `${theirs.shots} (${theirs.shotsOnTarget})`],
          ['Expected goals', mine.expectedGoals.toFixed(1), theirs.expectedGoals.toFixed(1)],
          ['Possession', `${Math.round(mine.possession)}%`, `${Math.round(theirs.possession)}%`],
        ] as const).map(([label, a, b]) => (
          <div key={label} className="contents">
            <dd className="text-right font-bold text-fg">{a}</dd>
            <dt className="text-center text-muted">{label}</dt>
            <dd className="font-bold text-muted">{b}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** All 38 of the XI's matches, each opening to what happened in it. */
function SeasonResults({ result }: { result: SimulationResult }) {
  const [open, setOpen] = useState<number | null>(null);
  const fixtures = result.gameweeks.flatMap(gw => gw.fixtures.filter(f => f.userInvolved).map(f => ({ week: gw.week, f })));
  return (
    <details className="group bg-card rounded-2xl">
      <summary className="cursor-pointer list-none px-6 py-4 flex items-center gap-3 touch-manipulation">
        <span className="text-subtle transition-transform group-open:rotate-90">▶</span>
        <span className="text-xs text-muted uppercase tracking-widest font-bold">Match by match</span>
        <span className="ml-auto flex gap-0.5" aria-hidden="true">
          {fixtures.map(({ week, f }) => {
            const home = f.home === 'Your XI';
            const gf = home ? f.homeGoals : f.awayGoals;
            const ga = home ? f.awayGoals : f.homeGoals;
            return (
              <span key={week} className="w-1 h-4 rounded-sm hidden sm:block"
                style={{ background: gf > ga ? '#00c896' : gf === ga ? '#f59e0b' : '#ef4444' }} />
            );
          })}
        </span>
      </summary>
      <div className="px-3 pb-4 sm:px-5 grid gap-x-6 lg:grid-cols-2">
        {fixtures.map(({ week, f }) => {
          const home = f.home === 'Your XI';
          const gf = home ? f.homeGoals : f.awayGoals;
          const ga = home ? f.awayGoals : f.homeGoals;
          const res = gf > ga ? 'W' : gf === ga ? 'D' : 'L';
          const col = res === 'W' ? '#00c896' : res === 'D' ? '#f59e0b' : '#ef4444';
          const isOpen = open === week;
          return (
            <div key={week} className="border-b border-line last:border-b-0">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : week)}
                aria-expanded={isOpen}
                className="w-full flex items-center gap-3 px-2 py-2.5 text-sm text-left touch-manipulation hover:bg-card-hi rounded"
              >
                <span className="w-6 text-xs text-muted text-right shrink-0">{week}</span>
                <span className="w-5 h-5 rounded text-[11px] font-black flex items-center justify-center shrink-0"
                  style={{ background: col, color: res === 'L' ? 'white' : 'black' }}>{res}</span>
                <span className="flex-1 min-w-0 truncate text-fg-soft">
                  <span className="text-muted">{home ? 'H' : 'A'}</span> {home ? f.away : f.home}
                </span>
                <span className="font-black shrink-0">{gf}–{ga}</span>
              </button>
              {isOpen && <div className="px-2 pb-3"><MatchDetail fixture={f} /></div>}
            </div>
          );
        })}
      </div>
    </details>
  );
}

// ── The XI's season, player by player ────────────────────────────────────────

type StatView = 'summary' | 'attack' | 'defence';

const STAT_VIEWS: { key: StatView; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'attack',  label: 'Attacking' },
  { key: 'defence', label: 'Defending' },
];

/** The columns of each view: a heading, what it means, and the number. */
const STAT_COLUMNS: Record<StatView, { head: string; title: string; value: (s: PlayerStats) => number | string }[]> = {
  summary: [
    { head: 'G',  title: 'Goals',        value: s => s.goals },
    { head: 'A',  title: 'Assists',      value: s => s.assists },
    { head: 'CS', title: 'Clean sheets', value: s => (['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB'].includes(s.position) ? s.cleanSheets : '-') },
  ],
  attack: [
    { head: 'Sh',  title: 'Shots',           value: s => s.shots },
    { head: 'SoT', title: 'Shots on target', value: s => s.shotsOnTarget },
    { head: 'KP',  title: 'Key passes',      value: s => s.chancesCreated },
  ],
  defence: [
    { head: 'Tkl', title: 'Tackles',                value: s => s.tackles },
    { head: 'Int', title: 'Interceptions',          value: s => s.interceptions },
    { head: 'Clr', title: 'Clearances',             value: s => s.clearances },
    { head: 'Sv',  title: 'Saves (goalkeeper)',     value: s => (s.position === 'GK' ? s.saves : '-') },
  ],
};

/**
 * The XI's season in numbers. Three views of the same eleven rows, because a
 * phone has room for three or four number columns beside a name and the
 * engine records a dozen: the tackles, key passes and saves were always
 * counted and never shown.
 */
function XiStats({ picks, stats }: { picks: SquadPick[]; stats: PlayerStats[] }) {
  const [view, setView] = useState<StatView>('summary');
  const columns = STAT_COLUMNS[view];
  return (
    <div className="bg-card rounded-2xl p-4 sm:p-6 min-w-0">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="text-xs text-muted uppercase tracking-widest font-bold flex-1 min-w-0">Your XI</div>
        <div className="flex gap-1" role="group" aria-label="Which statistics to show">
          {STAT_VIEWS.map(v => (
            <button key={v.key} type="button" onClick={() => setView(v.key)} aria-pressed={view === v.key}
              className={`px-2.5 py-2 rounded-lg text-[11px] font-bold transition-colors touch-manipulation ${view === v.key ? 'bg-[#00c896] text-black' : 'bg-raised text-muted hover:text-fg'}`}>
              {v.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 mb-2 text-[11px] text-muted">
        <span className="flex-1" />
        {columns.map(c => <abbr key={c.head} title={c.title} className="w-7 text-center no-underline">{c.head}</abbr>)}
        <abbr title="Overall rating" className="w-6 text-right no-underline">OVR</abbr>
        <abbr title="Average match rating" className="w-7 text-right no-underline">RTG</abbr>
      </div>
      <div className="space-y-2">
        {[...picks].sort((a, b) => b.slotIndex - a.slotIndex).map(p => {
          const stat = stats.find(s => s.playerId === p.playerId && s.position === p.position)
            ?? stats.find(s => s.playerId === p.playerId);
          const rtg  = stat?.avgMatchRating ?? 0;
          // Bands from the match engine's measured spread of season
          // averages (660 player-seasons across 60 real XIs): about the
          // top 5%, the top quarter, above the median, and the rest.
          const rtgColor = rtg >= 6.7 ? 'text-accent' : rtg >= 6.5 ? 'text-sky' : rtg >= 6.4 ? 'text-fg' : 'text-muted';
          return (
            <div key={p.slotIndex} className="flex items-center gap-2 sm:gap-3">
              <PositionBadge pos={p.position} size="xs" />
              <span className="font-bold text-sm flex-1 min-w-0 truncate">{p.playerName}</span>
              {columns.map(c => (
                <span key={c.head} className="text-muted text-xs font-bold w-7 text-center">{stat ? c.value(stat) : 0}</span>
              ))}
              <span className="font-black text-sm w-6 text-right" style={{ color: ratingColor(p.rating) }}>{p.rating}</span>
              <span className={`font-black text-xs w-7 text-right ${rtgColor}`}>{rtg > 0 ? rtg.toFixed(1) : '-'}</span>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted mt-3">
        {columns.map(c => `${c.head} ${c.title.toLowerCase()}`).join(' · ')} · RTG average match rating, 6.5 is an ordinary game
      </p>
    </div>
  );
}

function HeroStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-raised rounded-xl p-3 text-center">
      <div className={`text-2xl font-black ${accent ? 'text-accent' : ''}`}>{value}</div>
      <div className="text-[11px] text-subtle uppercase tracking-widest">{label}</div>
    </div>
  );
}

// ── League Table ──────────────────────────────────────────────────────────────

function LeagueTable({ table }: { table: TeamStanding[] }) {
  const [show, setShow] = useState(true); // open by default in final summary
  const posColor = (pos: number) =>
    pos === 1 ? 'var(--c-amber)' : pos <= 4 ? 'var(--c-blue)' : pos <= 6 ? 'var(--c-violet)' : pos >= 18 ? 'var(--c-red)' : undefined;

  return (
    <div className="bg-card rounded-2xl overflow-hidden">
      <button type="button" aria-expanded={show} onClick={() => setShow(s => !s)} className="w-full flex items-center justify-between px-6 py-4 hover:bg-card-hi transition-colors touch-manipulation">
        <div className="text-xs text-muted uppercase tracking-widest font-bold">Final League Table</div>
        <span className="text-subtle text-xs">{show ? '▲' : '▼'}</span>
      </button>
      {show && (
        <div className="px-4 pb-4">
          {/*
            Below sm there is not room for ten number columns and a club name:
            the name column was squeezed to nothing at 360px. P (always 38 in a
            final table) and GF/GA (GD carries them) are the ones a phone drops.
          */}
          <div className="flex items-center gap-1.5 sm:gap-2 px-2 pb-1 text-[11px] text-subtle uppercase tracking-widest border-b border-line">
            <span className="shrink-0 w-5 text-center">#</span>
            <span className="flex-1 min-w-0">Club</span>
            <span className="shrink-0 w-5 text-center hidden sm:block">P</span>
            <span className="shrink-0 w-5 text-center">W</span>
            <span className="shrink-0 w-5 text-center">D</span>
            <span className="shrink-0 w-5 text-center">L</span>
            <span className="shrink-0 w-7 text-center hidden sm:block">GF</span>
            <span className="shrink-0 w-7 text-center hidden sm:block">GA</span>
            <span className="shrink-0 w-7 text-center">GD</span>
            <span className="shrink-0 w-7 text-right">Pts</span>
            <span className="shrink-0 w-8 text-center text-accent/70 hidden sm:block">OVR</span>
            <span className="shrink-0 w-8 text-center text-orange-400/70 hidden md:block">ATT</span>
            <span className="shrink-0 w-8 text-center text-purple-400/70 hidden md:block">MID</span>
            <span className="shrink-0 w-8 text-center text-blue-400/70 hidden md:block">DEF</span>
          </div>
          {table.map(row => (
            <div key={row.name} className={`flex items-center gap-1.5 sm:gap-2 px-2 py-1.5 text-xs rounded ${row.isUser ? 'bg-[#00c896]/10' : ''}`}>
              <span className="shrink-0 w-5 text-center font-black" style={{ color: posColor(row.position) ?? 'var(--t-muted)' }}>{row.position}</span>
              <span className={`flex-1 min-w-0 font-bold truncate ${row.isUser ? 'text-accent' : 'text-fg-soft'}`}>{row.name}</span>
              <span className="shrink-0 w-5 text-center text-subtle hidden sm:block">{row.played}</span>
              <span className="shrink-0 w-5 text-center text-muted">{row.won}</span>
              <span className="shrink-0 w-5 text-center text-subtle">{row.drawn}</span>
              <span className="shrink-0 w-5 text-center text-subtle">{row.lost}</span>
              <span className="shrink-0 w-7 text-center text-muted hidden sm:block">{row.goalsFor}</span>
              <span className="shrink-0 w-7 text-center text-subtle hidden sm:block">{row.goalsAgainst}</span>
              <span className={`shrink-0 w-7 text-center ${row.gd > 0 ? 'text-accent' : row.gd < 0 ? 'text-red-400' : 'text-muted'}`}>
                {row.gd > 0 ? '+' : ''}{row.gd}
              </span>
              <span className="shrink-0 w-7 text-right font-black text-fg">{row.points}</span>
              <span className="shrink-0 w-8 text-center font-bold text-accent hidden sm:block">{row.ovr}</span>
              <span className="shrink-0 w-8 text-center text-orange-400 hidden md:block">{row.att}</span>
              <span className="shrink-0 w-8 text-center text-purple-400 hidden md:block">{row.mid}</span>
              <span className="shrink-0 w-8 text-center text-blue-400 hidden md:block">{row.def}</span>
            </div>
          ))}
          <div className="flex gap-3 mt-3 flex-wrap">
            {[['#fbbf24','Champions'],['#3b82f6','Top 4 (UCL)'],['#8b5cf6','6th (UEL)'],['#ef4444','Relegation']].map(([c,l]) => (
              <div key={l} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: c }} />
                <span className="text-[11px] text-subtle">{l}</span>
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
    <div className="bg-card rounded-2xl p-6">
      <div className="text-xs text-muted uppercase tracking-widest font-bold mb-4">League Leaderboards</div>
      <div className="flex gap-2 mb-4 flex-wrap lg:hidden">
        {BOARDS.map(b => (
          <button key={b.key} type="button" aria-pressed={tab === b.key} onClick={() => setTab(b.key)}
            className={`px-3 py-2.5 rounded-lg text-xs font-bold transition-colors touch-manipulation ${tab === b.key ? 'bg-[#00c896] text-black' : 'bg-raised text-muted hover:text-fg'}`}>
            {b.tab}
          </button>
        ))}
      </div>
      <div className="lg:grid lg:grid-cols-3 lg:gap-6">
        {BOARDS.map(b => (
          <div key={b.key} className={`${tab === b.key ? 'block' : 'hidden'} lg:block`}>
            <div className="hidden lg:block text-[11px] text-muted uppercase tracking-widest font-bold mb-2">{b.title}</div>
            <div className="flex items-center gap-3 px-2 pb-1.5 text-[11px] text-subtle uppercase tracking-widest border-b border-line">
              <span className="w-5 text-center">#</span>
              <span className="flex-1">Player</span>
              <span className="w-24 text-right text-[11px] lg:hidden xl:block">Club</span>
              <span className="w-8 text-right">{b.unit}</span>
            </div>
            <div className="space-y-0.5 mt-1">
              {data[b.key].slice(0, 20).map((e, i) => (
                <div key={i} className={`flex items-center gap-3 px-2 py-1.5 rounded text-xs ${e.isUser ? 'bg-[#00c896]/10' : ''}`}>
                  <span className="w-5 text-center text-subtle font-bold">{i + 1}</span>
                  <span className={`flex-1 min-w-0 truncate font-bold ${e.isUser ? 'text-accent' : 'text-fg-soft'}`}>{e.playerName}</span>
                  <span className={`w-24 text-right text-[11px] truncate lg:hidden xl:block ${e.isUser ? 'text-accent/60' : 'text-subtle'}`}>{e.clubName}</span>
                  <span className={`w-8 text-right font-black ${e.isUser ? 'text-accent' : 'text-fg'}`}>{e.value}</span>
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
    <div className="bg-raised rounded-xl p-3">
      <div className="text-xs text-muted mb-1">{icon} {title}</div>
      <div className="font-black text-sm">{name}</div>
      <div className="text-accent text-xs">{stat}</div>
      {yours && (
        <div className="text-subtle text-[11px] mt-1.5 pt-1.5 border-t border-line-hi truncate">
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
