# Known issues

Recorded so they are not rediscovered. Ordered by value, highest first. Numbers
here were measured; the method is in [simulation.md](simulation.md).

## 0. What the match engine still gets wrong

The season has been played by `matchEngine.ts` since the change recorded in
[simulation.md](simulation.md#moving-the-season-onto-the-engine), which fixed
the goal and assist charts (see *Fixed* below). Measured since with
`npm run sim:report`: Liverpool 2019/20 in the 2025/26 field and Liverpool
2008/09 in its own, 40 seasons each.

### Ratings: defenders are credited now, and the award leans their way

Defenders have events of their own (see
[simulation.md](simulation.md#defending-credited)), so a centre-back averages
6.28 against a striker's 6.44 and the better of two centre-backs out-rates the
other 70% of the time. What is left:

- **The league award now leans to defenders**: 48% of seasons in the 2025/26
  field, 65% in 2008/09, from 0%. Nemanja Vidić, the real winner in 2008/09,
  wins it most often there, but so do Gary Cahill (Bolton) and Abdoulaye Faye
  (Stoke): a defender in a side under siege gets more to do. Real per-event
  rating systems have exactly this bias. Midfielders almost never win (3–5%).
- **The event weights are chosen, not derived.** A tackle is +0.07 because it
  gave a sensible spread, not because it is worth 0.07 of anything. Valuing an
  event by the goals it prevents (what an attack in that zone is worth) is the
  principled version, and it would come out much smaller than these.
- **Per-position levels still differ**, 6.11 for a full-back to 6.44 for a
  striker; recentring each position on its own average is the step after this.
- **The scale is still narrow**: p10 6.05, p50 6.28, p95 6.61.

### Centre-backs score too often, full-backs create too little

| | engine | real |
| --- | ---: | ---: |
| Van Dijk goals, 2019/20 | 12.2 | 5 |
| Alexander-Arnold / Robertson assists | 4.9 / 5.9 | 13 / 12 |
| Carragher goals, 2008/09 | 4.7 | 0 |
| Top-20 assisters' assists by defenders, 2008/09 | 1% | 19% |

Set pieces go to centre-backs, which is right in kind and too much in degree,
and the assister for a cross is picked by attacking weight, where a full-back
counts for little.

Key passes make this visible: Alexander-Arnold and Robertson make 43 and 45 a
season, close to the real rate, but their assists stay near 5 because the
assister is picked by attacking weight. Firmino makes 85.

### The top of the table is flat

Liverpool 2019/20 averages 74.8 points and 69 goals; the real side took 99 and
scored 85. A flat 90-rated XI averages 73 points against the 2025/26 field. The
on-ball contests (see simulation.md) moved the champion from 76.4 to 80.5
points; it is still well short of a real ~88. The
engine's quality constants (`EDGE_TO_CHANCES`, `FINISHING_EXPONENT`,
`KEEPING_EXPONENT`) are deliberately gentle, per its own comments; the
pre-season curve re-fitted to it is 60% as steep as the Poisson model's.

### Counter-attack may be too strong

In 2025/26 the five clubs that most outperform their rating all play
Counter-attack (Aston Villa by 6.5 points), and Ollie Watkins wins the Golden
Boot more often than Haaland (17 to 6 in 40 seasons). A flat 74-rated XI in
1992/93 takes 55.7 points countering and 51.1 playing Balanced. It may be the
matchup working as designed — counter punishes a high line — or it may be too
strong; it wants measuring on its own. It is also why the pre-season odds carry
a second recorded exception in their calibration test: they cannot see styles.

### Tactics: fit is absolute, and one quality is missing

**Fit is absolute, so elite sides fit almost everything.** Barcelona 2009/10 is
100% for Tiki-taka and also for Route one and Park the bus. It is not general
saturation: across all 423 stored XIs only about 7% reach 100% for any one
style. A side with many highly rated, heavily traited players clears a sparse
demand (Park the bus asks only for `aerial`) without being built for it.
Measuring "fully meets" against real sides, the 90th percentile of each quality
instead of the fixed 0.45, barely changes this. Fit would have to describe a
side's profile rather than its total.

**`recovery` is 0 for 90% of stored XIs** (at most 0.59), and Counter-attack,
Catenaccio and Low block all demand it, so almost nothing can fit them. That is
the trait data, which lives in the authoring database. Fit and pace are still
read from traits alone, averaged over all eleven; the press and the deep block
were moved to a rating baseline and phase positions, and the same treatment
would suit them.

## 1. The draft pool is still lopsided

307 draftable club-seasons across five leagues, but 2025/26 is still the
densest single season and the English seasons dominate: PL 288, Serie A 7,
La Liga 6, Bundesliga 4, World Cup 2.

The non-English sides are all iconic ones, so the *quality* ceiling is fine —
Barcelona 2009/10 rates 88.0 and Sevilla 2009/10 78.0. What is thin is the
middle of those leagues, so a spin restricted to, say, the Bundesliga has four
possible answers.

This is the real ceiling on replay value. Every other improvement is bounded by
it.

## 2. A club's strength is a flat mean; the engine reads it on a curve, by zone

`getOpponentSquads` gives every club a `strength` that is the arithmetic mean of
its XI's ratings. The match engine does not read a team that way: it takes
attack, midfield and defence separately, each through `scaledAvgRating`. The two
agree for a balanced XI and disagree for a lopsided one.

That used to be hidden, because clubs without a stored lineup were represented
by `bestXI`, which picks the best-shaped eleven available. Now that every
club-season has a **minutes-based** XI — who actually played, not who was best —
the elevens are more lopsided and the gap shows.

What it costs, measured on 1992/93:

| | strength | model expects | actually plays |
| --- | ---: | ---: | ---: |
| an 82-rated XI | 82 | 76.0 | 77.0 |
| Manchester United | 83 | 78.3 | 76.9 |
| Arsenal | 80 | 69.5 | 63.3 |

The model has United 2.3 points clear when the simulation has them level, so an
82-rated XI is told it wins the title 32% of the time and wins it 53%. Points
and finishing position stay accurate — 76 against 76.8, 2nd against 1.9th — and
every other field and rating in `preSeasonOdds.calibration.test.ts` is inside
its 15-point bound. It is specifically the top of a compressed field that breaks.

The fix is to make `strength` line-based, the way the engine reads it. It is not
a constant to re-fit: `strength` also decides which clubs make way when a season
had more than twenty, and it is the number the pre-season screen shows, so
changing it moves three things at once and wants measuring on its own.

## 3. Smaller things

- **Four club-seasons ship with a single player.** 2017/18 Liverpool holds only
  Adam Lallana, and AC Milan 1994/95, 2002/03 and 2004/05 hold one man each
  (Maldini, Seedorf, Maldini). They are leftovers from seeding a player without
  the squad around him, they reach `game-data.json`, and none of them can field
  an eleven — `derive-lineups.mjs` reports them and skips them. Either collect
  the squad or delete the club-season; a one-man club-season is not something
  the game should offer.
- **Line ratings disagree with the simulation.** `LineRatings.tsx` counts LW/RW
  as midfield; `simulation.ts` counts them as attack. The bars do not describe
  the numbers being simulated.
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

- **The season was a scoreline and a lottery, not a match.** `simulateSeason`
  drew two Poisson goal counts and then a weighted draw for scorer and
  assister, with position × role × rating multiplied and nothing damping it.
  The Golden Boot averaged 38.5 and the goal record fell in 68% of seasons; the
  assist record fell in every one, Ødegaard leading 38 seasons of 40; Torres
  took half of Liverpool 2008/09's goals; Player of the Season was
  goals + 0.7 × assists. The season now plays every fixture through
  `matchEngine.ts`: Golden Boot 24.9, top assister 14.8, neither record broken
  in 80 seasons. See [simulation.md](simulation.md#moving-the-season-onto-the-engine).
- **The RNG repeated within a season.** A linear congruential generator with a
  period of 233,280, about what a season through the engine draws. Now
  mulberry32.
- **The pre-season screen showed 0% fit for every style but Balanced.** The
  saved XI carries no roles and the tactic screen did not look them up; the
  season did. Both go through `withSeasonRoles` now.
- **Every squad file in a season was stamped with a Premier League source
  URL.** `build-squad-files.mjs` built one URL from the season and applied it to
  every club it wrote. That was invisible for as long as a season directory held
  only Premier League clubs, and wrong the moment one did not: 2006/07 also
  holds Internazionale and Roma, 2009/10 four La Liga sides. Regenerating either
  season relabelled them. The URL is now built from the roster's own
  competition, and `--competition` limits which clubs a rebuild writes at all —
  those iconic sides have squad files but no rows in the rating batches, so a
  wholesale rebuild would have re-rated finished, shipped squads.

- **One character in a header cost four club-seasons.** FBref writes its
  sort-direction arrow into the header cell of the column the table is sorted
  by, so an export copied while sorted by name reads `Player▲`. The parser
  matched `Player` exactly and rejected the file, with every data row underneath
  it intact. Header cells are normalised before matching now, and the parser has
  a test — it had none at all before.

- **`AerialThreat` was on two forwards.** It is a 3.5x goal multiplier and
  `docs/roles.md` is explicit that a forward strong in the air gets `TargetMan`
  instead, because on someone who already receives most of the chances it
  decides the golden boot by itself. Tim Cahill and Brian McBride both carried
  it; both are recorded with a forward as their primary position. Both now carry
  `TargetMan`. Two independent rating agents flagged it in the same pass, which
  is the argument for the phase 5 check existing at all.

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
