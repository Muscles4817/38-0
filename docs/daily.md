# The daily challenge

One draft a day that everyone plays: the same formation, the same spins in the
same order, the same league-season and the same 38 games. Two people who draft
the same XI and choose the same style get the same table, so sharing a result
is a comparison, not a boast. It is the game's reason to come back tomorrow.

All of it is in `src/lib/daily.ts`. It needs no server, because everything is
derived from the date.

## What a day fixes

`dailyChallenge(date, formations, competitions)` hashes `38-0 daily <date>`
(FNV-1a) into a seed and draws, in order:

| | Drawn from | Used by |
| --- | --- | --- |
| formation | `Object.keys(FORMATIONS)`, sorted | the draft |
| league-season | `listCompetitions()`, sorted | the pre-season screen, which does not offer a choice; the results page enforces it too |
| season seed | — | the results page, in place of a random seed |
| spin seed | — | `dailyOrder`, the order the spins walk the pool |

Everything else is the standard draft: Normal (one reroll), ratings shown,
squad first, career ratings, the whole era, no challenge filter. The point is
to compare drafting and tactics, not settings. The style and the half-time
change are still the player's.

The date is **UTC** (`dailyDate`), so the challenge changes at the same moment
everywhere and friends in different time zones are playing the same one.
Challenge #1 is `DAILY_EPOCH`, 2026-11-13.

The formation and season lists come from the shipped snapshot. A data release
that adds a playable season changes what later days draw; the same build always
gives the same answer for a date, so everyone on the current site agrees.

## Same spins

The ordinary draft picks a random usable squad. A daily draft cannot: which
squads are usable depends on the picks so far, so a random choice among them
would diverge after the first different pick and stay diverged.

Instead `dailyOrder(pool, spinSeed)` sorts the pool by club and season and
shuffles it once for the day. Each spin takes the **next squad in that order
that the XI can still use** (the same feasibility rule as any spin; see
[draft-pool.md](draft-pool.md)), and stores where it got to as `dailyCursor` in
`38-0-draft-state`. A reroll moves on to the next one. So two players who place
the same players see exactly the same spins, and two who do not differ only
where one of them had no use for a squad the other was offered. In an
unfiltered pool that is rare.

## Which season counts

The first season played with the day's draft. It is written to `38-0-daily`
as soon as it is played, like the run history, so leaving early cannot erase
it, and rewritten in place if the style is changed at half-time
(`withDailyResult` matches on `playedAt`). Any later season that day — another
style from the report's *Try another style*, a redraft from the home page — is
practice: it goes into the run history, the report says so, and the counted
result is unchanged. *Play it again* is hidden, since the same seed would play
the same 38 games.

## Sharing

`dailyShareText` is five lines: the challenge number and season, the finish,
the season as two rows of 🟩🟨🟥 (one per half, so the half-time decision shows
in the grid), and the XI's rating, style and top scorer. The report's Share
button sends it on a daily run, whichever season is on screen, and so does the
daily card on the home page once the day is played. The card also shows the
streak (`dailyStreak`: days in a row ending today, or yesterday when today is
still to play).
