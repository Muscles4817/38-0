'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { FORMATIONS } from '@/lib/formations';
import { describeCompetition, listCompetitions } from '@/lib/gameData';
import { PLAYSTYLES, type PlaystyleName } from '@/lib/matchEngine';
import { clearStored, readStored, useStoredJson, writeStored } from '@/lib/clientStorage';
import { SEEN_SQUADS_KEY } from '@/lib/seenSquads';
import {
  DAILY_KEY, dailyChallenge, dailyDate, dailyShareText, dailyStreak, parseDailyResults,
  type DailyChallenge,
} from '@/lib/daily';

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function styleLabel(style: string): string {
  return PLAYSTYLES[style as PlaystyleName]?.label ?? style;
}

const noSubscribe = () => () => {};

/**
 * Today's date on the client, null while prerendering: the page is built
 * once, ahead of time, and the build's date is not the player's.
 */
function useToday(): string | null {
  return useSyncExternalStore(noSubscribe, () => dailyDate(), () => null);
}

const SQUARE: Record<string, string> = { W: '#00c896', D: '#f59e0b', L: '#ef4444' };

/**
 * The daily challenge, on the home page: what today's is, and once it has
 * been played, how it went and a way to share it. See src/lib/daily.ts.
 */
export default function DailyCard() {
  const router = useRouter();
  const today = useToday();
  const stored = useStoredJson<unknown>(DAILY_KEY);
  const setup = useStoredJson<{ daily?: DailyChallenge }>('38-0-setup');
  const [copied, setCopied] = useState(false);

  const challenge = useMemo(
    () => (today ? dailyChallenge(today, Object.keys(FORMATIONS), listCompetitions()) : null),
    [today],
  );
  const results = useMemo(() => parseDailyResults(stored), [stored]);
  if (!today || !challenge) return null;

  const competition = describeCompetition(challenge.seasonId, challenge.league);
  const counted = results.find(r => r.date === today) ?? null;
  const streak = dailyStreak(results, today);
  const inProgress = !counted && setup?.daily?.date === today;

  function start() {
    if (!challenge) return;
    // Everything but the formation and the season is the standard draft, so a
    // result is a comparison of drafting and tactics, not of settings.
    const dailySetup = {
      formation: challenge.formation, difficulty: 'normal', showRatings: true, draftMode: 'squad-first',
      playerRating: 'career', yearStart: 1992, yearEnd: 2026, challenge: 'none', filter: null,
      daily: challenge,
    };
    // The previous run goes first, as on Start Draft, so a full storage quota
    // frees space before the one write that has to succeed.
    clearStored('38-0-draft', '38-0-draft-state', '38-0-squad', '38-0-plan', SEEN_SQUADS_KEY);
    writeStored('38-0-setup', dailySetup);
    router.push('/draft');
  }

  function resume() {
    router.push(readStored('38-0-squad') ? '/squad' : '/draft');
  }

  function share() {
    if (!counted) return;
    const text = dailyShareText(counted, styleLabel);
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
    if (navigator.share) navigator.share({ text }).then(done, () => undefined);
    else navigator.clipboard?.writeText(text).then(done, () => undefined);
  }

  const half = counted ? Math.floor(counted.form.length / 2) : 0;

  return (
    <section className="bg-card rounded-2xl p-5 border border-[#00c896]/40" aria-labelledby="daily-heading">
      <div className="flex items-baseline gap-3 mb-1">
        <h2 id="daily-heading" className="text-[11px] font-bold tracking-widest text-accent uppercase">
          Daily #{challenge.number}
        </h2>
        {streak > 1 && <span className="text-[11px] text-muted">🔥 {streak} days in a row</span>}
      </div>
      <p className="text-sm text-muted">
        <span className="font-bold text-fg">{challenge.formation}</span> into{' '}
        <span className="font-bold text-fg">{competition ? `${competition.leagueName} ${competition.seasonLabel}` : 'the league'}</span>.
        Same spins and same 38 games for everyone today.
      </p>

      {counted ? (
        <div className="mt-3">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-2xl font-black">{ordinal(counted.position)}</span>
            <span className="text-sm font-bold text-fg">{counted.points} pts</span>
            <span className="text-xs text-muted">{counted.wins}-{counted.draws}-{counted.losses} · XI {counted.overall}</span>
          </div>
          {/* The season in two rows, one per half, as the share text has it. */}
          <div className="mt-2 space-y-0.5" aria-label={`Results: ${counted.wins} won, ${counted.draws} drawn, ${counted.losses} lost`}>
            {[counted.form.slice(0, half), counted.form.slice(half)].map((row, i) => (
              <div key={i} className="flex gap-0.5">
                {[...row].map((c, j) => (
                  <span key={j} className="w-1.5 h-3 rounded-sm" style={{ background: SQUARE[c] }} />
                ))}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={share}
              className="px-5 py-2.5 rounded-xl font-black text-sm bg-[#00c896] text-black hover:bg-[#00b385] transition-colors touch-manipulation"
            >
              {copied ? 'Copied ✓' : 'Share result'}
            </button>
            <span className="text-[11px] text-muted">A new challenge at midnight UTC</span>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={inProgress ? resume : start}
          className="mt-3 w-full py-3 rounded-xl font-black text-sm bg-[#00c896] text-black hover:bg-[#00b385] transition-colors touch-manipulation"
        >
          {inProgress ? `Continue Daily #${challenge.number} →` : `Play Daily #${challenge.number} →`}
        </button>
      )}
    </section>
  );
}
