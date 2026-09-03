# Known issues

Recorded so they are not rediscovered. Ordered by value, highest first. Numbers
here were measured; the method is in [simulation.md](simulation.md).

## 1. The league is flatter than it should be

`scaledAvgRating` in `src/lib/simulation.ts` inverts an exponential with the
wrong constant (`0.055` where `ratingScale` uses `0.032`), compressing every
rating difference to 58% of its size. The result is a league where an 88-rated
side finishes sixth and eight different clubs win the title in twenty seasons.

Changing the constant moves the champion's average from 72 to 77 points and
concentrates titles among four clubs. Full measurements in
[simulation.md](simulation.md#1-scaledavgrating-inverts-with-the-wrong-constant).

Real Premier League champions average about 88 points, so the coefficients in
`simulateScore` want widening afterwards. Do that as a second, measured step.

## 2. Pre-season odds promise more than the simulation delivers

An 88-rated XI is told it will finish 1st on 83 points with a 60% title chance.
It actually averages 4.9th and 63 points, wins 23% of the time, and is then
labelled UNDERPERFORMED. `preSeasonOdds` needs refitting against measured output
once issue 1 is fixed.

## 3. Two different "Projected" finishes

`src/app/results/page.tsx` shows an OVR-ranked projection on the pre-season card
and the formula's `odds.projectedPosition` on the final banner and in the
over/underperformed verdict. The same run reports two different numbers on two
screens. Pick one.

## 4. Five players are at two clubs at once

In 2025/26: Alexander Isak (Newcastle *and* Liverpool), Milos Kerkez, Noni
Madueke, Christian Nørgaard, Kepa Arrizabalaga. All real 2025 transfers entered
at the destination without removing the origin. They can appear twice on the
same league leaderboard.

`Kieran Trippier` also exists as two separate rows in `players`.

Fix in `/editor/squads`, then `npm run export:data`.

## 5. Five 2025/26 opponents have no stored lineup

Bournemouth, Brentford, Brighton, West Ham and Wolves fall back to "best keeper
plus the ten highest-rated outfielders", which ignores shape. West Ham field
four centre-backs and no full-backs. Since attack, midfield and defence strength
are derived from the positions actually fielded, those clubs get systematically
wrong ratings.

Fix by storing lineups at `/editor/lineups`, or by making the fallback
formation-aware.

Related: four lineup slots pointed at players no longer in their squad (Onana,
Eze, Guéhi, Ashley Cole). The export now drops them and warns, which leaves
those XIs short — they want refilling in the editor. The schema weakness that
allows it is described in [data-model.md](data-model.md#known-schema-weakness).

## 6. The draft pool is small

52 club-seasons, and 2025/26 is about 43% of all squad entries. Nine seasons
have a single club and 2002/03 has one player. Eleven spins therefore repeat
squads often.

This is the real ceiling on replay value. Every other improvement is bounded by
it.

## 7. Twelve players exist as two rows each

Found while importing 1992/93. In the seed data that predates the FBref
pipeline, twelve people each have two `players` rows:

    Kieran Trippier   120 (2018/19, 2025/26)  and 134 (2022/23)
    Vladimir Smicer   604 (2004/05)           and 686 (2000/01, "Vladimír Šmicer")
    Ilkay Gundogan    447 (no squad entry)    and 521 (2017/18)
    Davinson Sanchez, Fabian Schar, Bruno Guimaraes, Miguel Almiron,
    Emiliano Martinez, Jhon Duran, Jeremy Doku, Caoimhin Kelleher, Igor Biscan

`playerKey` strips accents precisely so `Šmicer` and `Smicer` are one person,
and it does. The rows survive anyway because `import-squads.mjs` builds its
lookup map once and keeps only the **first** row per key, so a duplicate already
in the database is never seen. The import cannot create these — it just cannot
heal them either.

It matters because the draft pool is built from players, so a duplicated person
can be drafted twice, as two footballers.

Not fixed yet because it is a merge rather than a delete: the versions have to
be reparented, and 11 `lineup_slots` rows point at versions belonging to a
player row that would go away. Done carelessly it breaks the classic lineups.

Going forward `fbref_id` prevents the opposite error too. 1992/93 had a David
Smith at Coventry and a different David Smith at Norwich; they correctly got two
rows, and only the id could tell them apart.

## 8. Smaller things

- **Line ratings disagree with the simulation.** `LineRatings.tsx` counts LW/RW
  as midfield; `simulation.ts` counts them as attack. The bars do not describe
  the numbers being simulated.
- **The RNG is weak.** A linear congruential generator with modulus 233,280.
  Fine for a game, not fine for calibration work.
- **Match ratings are compressed.** A sample season had every defender on 6.8
  and the whole XI within 6.8–7.3, on a nominal 4.0–10.0 scale.
- **The draft pool includes 2025/26**, so you can draft players who are
  simultaneously your opponents. Classic mode deliberately excludes that season;
  the draft does not.

## Fixed, for reference

Do not re-report these:

- `canFillSlot` required an exact string match, so a left-back could not cover
  left wing-back and a central midfielder could not fill a holding role. Seven
  of the formations were unfillable in practice, and it forced position data to
  be more precise than football is. Positions now carry a lane and a depth, and
  cover an adjacent slot at a four-point rating penalty. The formation list grew
  from 15 to 21 at the same time.

- The draft's placement panel listed one or two green "Available" buttons above
  ten grey `ST · N/A` chips that looked identical but were inert `<span>`s.
  Clicking one did nothing at all, which read as the game ignoring the click.
  The chips are gone and the eligible slots are highlighted on the pitch.
- Position badges on a player row swallowed taps. They look like where you pick
  a position, but they sat inside the row button, so tapping one toggled the
  row off and closed the panel. They are `pointer-events-none`, and selecting a
  player is no longer a toggle — Cancel is the way to back out.
- There was no way back from the draft, results or classic pages except the
  footer site map. All three have a back control now.
- A failed reroll used to consume a reroll and fail silently. The candidate is
  now resolved before the reroll is spent, and an empty era is reported.
- Spinning sampled 50 random club-seasons and filtered afterwards, so exclusions
  were dropped once the pool passed 50. Selection is now exact.
- The spin reveal caption read a ref during render.
- Run state was loaded from `localStorage` in on-mount effects, leaving the
  store and component state as two sources of truth. It now goes through
  `useSyncExternalStore` in `src/lib/clientStorage.ts`.
- The editor cleared selection-dependent state inside effects, which could show
  a previous club's squad while a new request was in flight.
