# Known issues

Recorded so they are not rediscovered. Ordered by value, highest first. Numbers
here were measured; the method is in [simulation.md](simulation.md).

## 1. The scoring coefficients are too gentle

`simulateScore` in `src/lib/simulation.ts` converts a 10-point strength edge
into only +0.38 expected goals, so the table is still flatter than a real
league: champions average 75.6 points against a real ~88, and the bottom club
29.0 against a real ~22.

Raising `0.38 → 0.62` and `0.30 → 0.52` gives a 81.5-point champion and four
distinct title winners across 30 seasons. That is tuning, not a defect, and
wants measuring against the resulting tables rather than applying blind.

Do not chase the last few points by inflating goal difference: real leagues are
spread partly by injuries, form and mid-season upheaval that this model does not
represent at all.

### The scoring rate is a separate knob, and it is the base constants

Measured over 40 seeded seasons with a drafted 1992/93 XI in the league, before
and after the rating curve fix:

|                      | before | after | real PL |
| -------------------- | -----: | ----: | ------: |
| champion's points    |   79.8 |  82.8 |     ~88 |
| bottom club's points |   38.6 |  32.4 |     ~22 |
| spread               |   41.2 |  50.4 |     ~66 |
| goals per game       |   2.48 |  2.51 |    ~2.80 |

The curve fix opened the table by nine points and left the scoring rate where it
was. That is not a shortcoming of the fix — the two are controlled by different
terms, and it is worth being explicit about which:

    homeLambda = (1.3 + (homeAtt + 3 - awayDef)/10 * 0.38) * midfieldMultiplier
    awayLambda = (1.0 + (awayAtt - homeDef)/10      * 0.30) * midfieldMultiplier

Set both sides equal and the formula still yields 1.41 + 1.00 = **2.41 goals**.
So the constants `1.3` and `1.0` supply almost the whole scoring rate, and every
rating in the database only redistributes what is left. `0.38`/`0.30` control
the *spread*; `1.3`/`1.0` control the *mean*.

Raising the coefficients alone therefore widens the table without moving 2.51
toward 2.80 — it would make good teams beat bad ones by more while the league
still scores too little. Both wants changing, and measuring together.

## 2. The draft pool is still lopsided

307 draftable club-seasons across five leagues, but 2025/26 is still the
densest single season and the English seasons dominate: PL 288, Serie A 7,
La Liga 6, Bundesliga 4, World Cup 2.

The non-English sides are all iconic ones, so the *quality* ceiling is fine —
Barcelona 2009/10 rates 88.0 and Sevilla 2009/10 78.0. What is thin is the
middle of those leagues, so a spin restricted to, say, the Bundesliga has four
possible answers.

This is the real ceiling on replay value. Every other improvement is bounded by
it.

## 3. Smaller things

- **Line ratings disagree with the simulation.** `LineRatings.tsx` counts LW/RW
  as midfield; `simulation.ts` counts them as attack. The bars do not describe
  the numbers being simulated.
- **The RNG is weak.** A linear congruential generator with modulus 233,280.
  Fine for a game, not fine for calibration work.
- **Match ratings are compressed.** A sample season had every defender on 6.8
  and the whole XI within 6.8–7.3, on a nominal 4.0–10.0 scale.
- **The draft pool includes the season you play in.** It has always included
  2025/26, so a drafted player could be his own opponent; now that the season
  is chosen on the pre-season screen, any of the fourteen playable seasons can
  be picked to face an XI drafted out of it. Classic mode still excludes the
  default season, and nothing excludes a chosen one. The pre-season screen now
  says so when the chosen season is one the XI was drafted from, which is the
  cheap half of the fix; the real one is to leave a drafted player out of his
  club's XI for that season.

## Fixed, for reference

Do not re-report these:

- **Pre-season odds promised more than the simulation delivered.** An 88-rated
  XI was told 1st on 83 points with a 60% title chance; it averaged 4.9th and 63
  points, won 23% of the time, and was then labelled UNDERPERFORMED. The odds
  were five straight lines in the squad's rating, fitted to nothing, and blind
  to the opposition — the same 86-rated XI is a 20% title shot against 2025/26
  and a 67% one against 1992/93, and the formula gave both the same answer.
  They are now a measured model of the simulation that reads the field, within
  about a point of measured expected points and 12 points of any probability,
  with `preSeasonOdds.calibration.test.ts` playing real seasons to keep it
  honest. See [simulation.md](simulation.md).

- **Two different "Projected" finishes.** The pre-season screen ranked the XI's
  overall against the field while the results screen used the odds formula, so
  one run reported two numbers on two screens. There is one projection now, and
  both screens read it.

- **Ten players were at two clubs at once in 2025/26** — Isak, Kerkez, Madueke,
  Nørgaard, Kepa, Elanga, Mbeumo, Wissa, Cunha, Brennan Johnson and Marc Guéhi,
  who was in Manchester City's squad without ever having played for them. Every
  one was a 2025 summer transfer entered at the destination without removing the
  origin. The selling club's entry is gone in each case, and 2025/26 is now
  backed by authored squad files for the four clubs whose FBref exports were
  refreshed, so `validateAcrossFiles` covers it like every other season.

- **Fifteen people existed as two `players` rows each** — the twelve seed
  duplicates plus Solskjær, Guðjohnsen and Strand Larsen. Merged: versions
  reparented, colliding lineup slots resolved, loser rows deleted. Jérémy Doku
  was in Manchester City's 2025/26 squad under both spellings and could have
  been fielded twice. Rows where *both* sides carry an FBref id were left alone
  — those are different men who share a name, and there are two Alan Smiths,
  two David Smiths and three Paul Robinsons.

- **`playerKey` did not fold ø, đ, ł or ß.** Stripping combining accents does
  nothing for letters that are their own codepoint, so "Jorgen" and "Jørgen"
  Strand Larsen were two people and he sat in both Wolves' and Palace's 2025/26
  squad without the cross-file check noticing. The key folds them now.

- **`aerialQuality` was backwards.** Role names multiplied a player's *weight*
  in a weighted mean of ratings, and the weight decides how much his rating
  counts toward the average — so an aerial specialist rated below his team-mates
  dragged his side's aerial number down. A 79-rated `AerialThreat` made a team
  worse in the air than a plain 79-rated striker. Position now sets how much of
  the contest a player is part of and the `aerial` quality scales his
  contribution, which also picks up `Lightweight` for free.

- **Nothing enforced a legal stored lineup.** Three separate passes found XIs
  naming a player who was not in the squad, or putting one in a slot
  `positionFit` rates `none`. `gameData.test.ts` now asserts over every stored
  lineup that it has eleven distinct slots of its own formation, fields only
  squad members, plays nobody somewhere he cannot play, and fields exactly one
  goalkeeper, in the goalkeeper slot. The next one fails the build.

- **Every 2025/26 opponent had no stored lineup, or a wrong one.** All nineteen
  now have a verified XI. Manchester City had left Rúben Dias out of the side
  entirely; Southampton played a left-winger in the right-midfield slot, which
  `positionFit` rates impossible.

- `scaledAvgRating` inverted `ratingScale` with the wrong constant — 0.032
  forward, 0.055 back — dragging every squad 58% of the way toward 80 and making
  the league close to a coin toss. Both now share one `RATING_CURVE` constant
  with a round-trip test guarding it. The champion's average went from 71.1 to
  75.6 points and an 88-rated XI from 4.9th to 2.6th.

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
