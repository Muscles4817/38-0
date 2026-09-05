'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getFormation } from '@/lib/formations';
import {
  describeCompetition, getTacticOptions, getTeamStrengths, listCompetitions,
  type Competition,
} from '@/lib/gameData';
import { computeOverall, preSeasonOdds, type SquadPick, type TacticEffect } from '@/lib/simulation';
import type { PlaystyleName } from '@/lib/matchEngine';
import { useStoredJson, writeStored } from '@/lib/clientStorage';
import PitchView from '@/components/PitchView';
import PositionBadge from '@/components/PositionBadge';
import LineRatings from '@/components/LineRatings';
import BackLink from '@/components/BackLink';

/**
 * What the player settles on between drafting and kick-off.
 *
 * Kept in localStorage like the rest of a run, so that changing a tactic,
 * simulating, coming back and changing it again is the loop — and so a refresh
 * on this screen does not silently reset the decision.
 */
export interface StoredPlan {
  style: PlaystyleName;
  seasonId: number;
  /** Carried alongside the season because a season can hold several leagues. */
  league?: string;
}

interface Setup {
  formation: string;
  draftMode?: string;
}

// Stable empty array so a run that has not loaded yet does not hand out a new
// reference on every render.
const NO_PICKS: SquadPick[] = [];

export default function SquadPage() {
  const router = useRouter();

  const picks     = useStoredJson<SquadPick[]>('38-0-squad') ?? NO_PICKS;
  const setup     = useStoredJson<Setup>('38-0-setup');
  const stored    = useStoredJson<StoredPlan>('38-0-plan');
  const formation = useMemo(() => getFormation(setup?.formation ?? '4-4-2'), [setup]);

  const competitions = useMemo(() => listCompetitions(), []);
  const defaultSeasonId = useMemo(() => describeCompetition()?.seasonId ?? null, []);

  // Nothing to look over without an XI.
  useEffect(() => {
    if (localStorage.getItem('38-0-squad') === null) router.push('/');
  }, [router]);

  // The plan is derived from what is stored rather than mirrored into state,
  // so there is one source of truth and a write from anywhere re-renders.
  const style: PlaystyleName = stored?.style ?? 'balanced';
  const seasonId = stored?.seasonId ?? defaultSeasonId ?? competitions[0]?.seasonId ?? 0;
  const league   = stored?.league ?? competitions.find(c => c.seasonId === seasonId)?.league;

  const tactics  = useMemo(() => getTacticOptions(picks), [picks]);
  const chosen   = tactics.find(t => t.style === style) ?? tactics[0];
  const opponent = useMemo(() => describeCompetition(seasonId, league), [seasonId, league]);

  // Seasons this XI was drafted out of, so the screen can say when a player is
  // about to face his own club-season. See known-issues.md.
  const draftedFrom = useMemo(
    () => new Set(picks.map(p => p.seasonId).filter((id): id is number => id != null)),
    [picks],
  );

  const overall = computeOverall(picks);
  const odds    = preSeasonOdds(overall);
  const field   = useMemo(() => getTeamStrengths(seasonId, league), [seasonId, league]);
  // Where this XI would rank in the season it has chosen, on overall alone.
  const projectedPosition = field.length > 0
    ? field.filter(t => t.overall > overall).length + 1
    : odds.projectedPosition;

  function choose(next: Partial<StoredPlan>) {
    writeStored('38-0-plan', { style, seasonId, league, ...next });
  }

  if (!picks.length) {
    return <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-white">Loading…</div>;
  }

  const cameFromClassic = setup?.draftMode === 'classic';

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-3xl mx-auto py-6 px-4 space-y-8">

        <div>
          <BackLink href={cameFromClassic ? '/classic' : '/draft'} label={cameFromClassic ? 'Classic' : 'Draft'} />
          <h1 className="text-3xl font-black tracking-tight mt-2">Team Talk</h1>
          <p className="text-[#666] text-sm mt-1">
            Your XI is picked. Decide how they play and whose league they are walking into.
          </p>
        </div>

        {/* ── The XI ─────────────────────────────────────────────────────── */}
        <section className="flex flex-col lg:flex-row gap-6">
          <div className="flex justify-center shrink-0">
            <PitchView formation={formation} picks={picks} compact />
          </div>
          <div className="flex-1 space-y-4 min-w-0">
            <div className="flex items-end gap-4">
              <div>
                <Label>Your XI</Label>
                <div className="text-sm text-[#555]">{formation.name}</div>
              </div>
              <div className="ml-auto text-right">
                <Label>Overall</Label>
                <div
                  className="text-5xl font-black leading-none"
                  style={{ color: overall >= 90 ? '#00c896' : overall >= 85 ? '#3b82f6' : overall >= 80 ? '#f59e0b' : '#ef4444' }}
                >
                  {overall}
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              {[...picks].sort((a, b) => b.slotIndex - a.slotIndex).map(p => (
                <div key={p.slotIndex} className="flex items-center gap-3 py-1.5">
                  <PositionBadge pos={p.position} size="xs" />
                  <span className="font-bold text-sm flex-1 min-w-0 truncate">{p.playerName}</span>
                  <span className="text-[#555] text-xs shrink-0">{p.clubName.slice(0, 3).toUpperCase()} {p.seasonLabel}</span>
                  <span className="text-[#00c896] font-black text-sm w-6 text-right shrink-0">{p.rating}</span>
                </div>
              ))}
            </div>
            <LineRatings formation={formation} picks={picks} />
          </div>
        </section>

        {/* ── Tactic ─────────────────────────────────────────────────────── */}
        <section>
          <Label>Tactic</Label>
          <p className="text-[#555] text-[11px] mb-3">
            A style costs you the same whoever is playing it; what it wins back depends on whether
            your XI can carry it out. Fit is how much of the benefit these eleven collect.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {tactics.map(tactic => (
              <TacticCard
                key={tactic.style}
                tactic={tactic}
                selected={tactic.style === style}
                onClick={() => choose({ style: tactic.style })}
              />
            ))}
          </div>
          {chosen && <TacticSummary tactic={chosen} />}
        </section>

        {/* ── Opponents ──────────────────────────────────────────────────── */}
        <section>
          <Label>Season</Label>
          <p className="text-[#555] text-[11px] mb-3">
            The league your XI is dropped into for all 38 games.
          </p>
          <CompetitionPicker
            competitions={competitions}
            seasonId={seasonId}
            onChoose={c => choose({ seasonId: c.seasonId, league: c.league })}
          />
          {opponent && (
            <CompetitionSummary
              competition={opponent}
              draftedFrom={draftedFrom.has(opponent.seasonId)}
            />
          )}
        </section>

        {/* ── Odds ───────────────────────────────────────────────────────── */}
        <section className="bg-[#111] rounded-2xl p-6 space-y-4">
          <div>
            <Label>Pre-Season Odds</Label>
            <div className="text-xs text-[#444]">
              Your squad&apos;s overall against {opponent ? `the ${opponent.seasonLabel} field` : 'the field'}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-[#555]">Projected Finish</div>
              <div className="text-3xl font-black">{ordinal(projectedPosition)}</div>
            </div>
            <div>
              <div className="text-xs text-[#555]">Expected Points</div>
              <div className="text-3xl font-black text-[#00c896]">{odds.expectedPoints}</div>
            </div>
          </div>
          <div className="space-y-2">
            <OddsBar label="Win the league" pct={odds.winLeague}   color="#00c896" />
            <OddsBar label="Top 4"          pct={odds.top4}        color="#3b82f6" />
            <OddsBar label="Top 6"          pct={odds.top6}        color="#8b5cf6" />
            <OddsBar label="Top 10"         pct={odds.top10}       color="#f59e0b" />
            <OddsBar label="Relegation"     pct={odds.relegation}  color="#ef4444" />
          </div>
        </section>

        {/*
          Kick-off sticks to the bottom of the phone viewport: the two decisions
          above it are a screen each, and the button that acts on them should
          not be a scroll away from either.
        */}
        <div className="sticky bottom-0 z-30 py-3 bg-[#0a0a0a]/95 backdrop-blur-sm sm:static sm:py-0 sm:bg-transparent sm:backdrop-blur-none">
          <button
            type="button"
            onClick={() => { choose({}); router.push('/results'); }}
            className="w-full py-4 rounded-xl font-black text-lg bg-[#00c896] text-black hover:bg-[#00b385] transition-colors touch-manipulation"
          >
            Simulate Season →
          </button>
        </div>
      </div>
    </main>
  );
}

// ── Tactics ──────────────────────────────────────────────────────────────────

function TacticCard({ tactic, selected, onClick }: {
  tactic: TacticEffect;
  selected: boolean;
  onClick: () => void;
}) {
  const pct = Math.round(tactic.fit * 100);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border-2 px-3 py-3 text-left transition-colors bg-[#111] touch-manipulation
        ${selected ? 'border-[#00c896] text-[#00c896]' : 'border-[#2a2a2a] text-white hover:border-[#444]'}`}
    >
      <div className="font-bold text-sm truncate">{tactic.label}</div>
      <div className="text-[10px] text-[#666] mt-0.5">{shapeOf(tactic)}</div>
      <div className="flex items-center gap-2 mt-2">
        <div className="flex-1 h-1 rounded-full bg-[#1f1f1f] overflow-hidden">
          <div className="h-1 rounded-full" style={{ width: `${pct}%`, background: fitColor(tactic.fit) }} />
        </div>
        <span className="text-[10px] font-bold shrink-0" style={{ color: fitColor(tactic.fit) }}>{pct}%</span>
      </div>
    </button>
  );
}

/**
 * What the chosen style is actually worth, in the units the simulation uses.
 *
 * Showing the numbers rather than an adjective is the point: a tactic that
 * cannot be checked against the result is a label, and this game has been
 * careful not to add any of those.
 */
function TacticSummary({ tactic }: { tactic: TacticEffect }) {
  const tempoPct = Math.round((tactic.tempo - 1) * 100);
  return (
    <div className="mt-3 rounded-xl border border-[#1a1a1a] bg-[#0d0d0d] px-4 py-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-black text-sm text-[#00c896]">{tactic.label}</span>
        <span className="text-[11px] text-[#666]">fit {Math.round(tactic.fit * 100)}%</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 sm:grid-cols-4">
        <Delta label="Attack"   value={tactic.att} />
        <Delta label="Midfield" value={tactic.mid} />
        <Delta label="Defence"  value={tactic.def} />
        <Delta label="Chances"  value={tempoPct} suffix="%" />
      </div>
      <p className="text-[#555] text-[11px] mt-2">
        {tempoPct === 0
          ? 'Your matches are played at the league\'s usual rate.'
          : tempoPct > 0
            ? `Your matches produce about ${tempoPct}% more chances — for both sides. Speeding a game up suits the better team.`
            : `Your matches produce about ${-tempoPct}% fewer chances — for both sides. Slowing a game down is how an underdog gets a result.`}
      </p>
    </div>
  );
}

function Delta({ label, value, suffix = '' }: { label: string; value: number; suffix?: string }) {
  const rounded = suffix === '%' ? Math.round(value) : Math.round(value * 10) / 10;
  const color = rounded > 0 ? '#00c896' : rounded < 0 ? '#ef4444' : '#555';
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] text-[#555] uppercase tracking-widest">{label}</span>
      <span className="text-sm font-black" style={{ color }}>
        {rounded > 0 ? '+' : ''}{rounded}{suffix}
      </span>
    </div>
  );
}

/**
 * The style's own axes, said in words.
 *
 * Read off the style rather than off the effect: the effect is scaled by fit,
 * so a side with nobody to play a deep block would otherwise see it described
 * as a mid block.
 */
function shapeOf(tactic: TacticEffect): string {
  const line  = tactic.line > 0.65 ? 'high line' : tactic.line < 0.35 ? 'deep block' : 'mid block';
  const build = tactic.buildUp > 0.65 ? 'patient' : tactic.buildUp < 0.35 ? 'direct' : 'mixed';
  return `${line} · ${build}`;
}

function fitColor(fit: number): string {
  return fit >= 0.66 ? '#00c896' : fit >= 0.33 ? '#f59e0b' : '#ef4444';
}

// ── Season ───────────────────────────────────────────────────────────────────

function CompetitionPicker({ competitions, seasonId, onChoose }: {
  competitions: Competition[];
  seasonId: number;
  onChoose: (competition: Competition) => void;
}) {
  // Grouped by league so that a second competition, once the snapshot holds a
  // full field for one, needs nothing here but its own data.
  const byLeague = new Map<string, Competition[]>();
  for (const c of competitions) {
    const list = byLeague.get(c.leagueName) ?? [];
    list.push(c);
    byLeague.set(c.leagueName, list);
  }

  return (
    <div className="space-y-4">
      {[...byLeague].map(([league, seasons]) => (
        <div key={league}>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="font-bold text-sm">{league}</span>
            <span className="text-[#444] text-[11px]">{seasons.length} seasons</span>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {seasons.map(season => (
              <button
                key={season.seasonId}
                type="button"
                onClick={() => onChoose(season)}
                className={`rounded-lg border-2 px-2 py-2.5 transition-colors bg-[#111] touch-manipulation
                  ${season.seasonId === seasonId
                    ? 'border-[#00c896] text-[#00c896]'
                    : 'border-[#2a2a2a] text-white hover:border-[#444]'}`}
              >
                <div className="font-bold text-sm">{season.seasonLabel}</div>
                <div className="text-[10px] text-[#666]">avg {season.averageRating}</div>
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="text-[#555] text-[11px]">
        Only leagues the snapshot can field a full season for are listed. Serie A, La Liga and the
        Bundesliga are in the draft pool but have a handful of clubs each, so there is no season to
        play in them yet.
      </p>
    </div>
  );
}

function CompetitionSummary({ competition, draftedFrom }: {
  competition: Competition;
  draftedFrom: boolean;
}) {
  return (
    <div className="mt-3 rounded-xl border border-[#1a1a1a] bg-[#0d0d0d] px-4 py-3">
      <div className="font-black text-sm text-[#00c896]">
        {competition.leagueName} {competition.seasonLabel}
      </div>
      <div className="text-[11px] text-[#666] mt-1">
        {competition.opponentCount} opponents · average XI {competition.averageRating} · 38 games
      </div>
      {draftedFrom && (
        <p className="text-amber-400/80 text-[11px] mt-2">
          You drafted from this season. Anyone you took is still in his club&apos;s squad, so you
          may end up playing against yourself.
        </p>
      )}
      {competition.displaced.length > 0 && (
        <p className="text-[#555] text-[11px] mt-2">
          That season had {competition.clubCount} clubs. The league here is twenty, so{' '}
          {competition.displaced.length === 1 ? 'the weakest side makes' : `the ${competition.displaced.length} weakest sides make`}{' '}
          way for you: {competition.displaced.join(', ')}.
        </p>
      )}
    </div>
  );
}

// ── Bits ─────────────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-bold tracking-widest text-[#555] uppercase mb-2">{children}</div>;
}

// Moved here with the odds themselves, from the results page.
function OddsBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-xs text-[#666] w-28 flex-shrink-0">{label}</div>
      <div className="flex-1 bg-[#1a1a1a] rounded-full h-1.5">
        <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
      <div className="text-xs text-[#888] w-10 text-right">{pct.toFixed(1)}%</div>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
