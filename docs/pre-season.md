# Pre-season

Between the eleventh pick and kick-off there is a screen, `/squad`, where the
player looks the XI over and makes the two decisions the draft does not make
for them: **how the side plays**, and **which season it plays in**. Both are
stored, both reach the simulation, and both change the table at the end.

```
  /draft ──── eleventh pick ────►  /squad  ──── Simulate ────►  /results
  /classic ── an XI chosen ─────►    │                             │
                                     │  38-0-plan                  │  runs on
                                     └── { style, seasonId } ──────┘  arrival
```

The results page no longer has a button of its own. Everything the season needs
to kick off was decided here, so a second confirmation between the decision and
the result would only be a step to click through. One more decision comes later,
at halfway: see [After kick-off](#after-kick-off).

## The tactic

Fourteen styles, defined once in `src/lib/matchEngine.ts` and described in
[playstyles.md](playstyles.md). Each is three numbers: how high the line sits
(`line`), how patiently the ball is moved (`buildUp`), and how fast the game is
played (`tempo`).

The style is played by the match engine. Its line, build-up and tempo decide
who has the ball, how chances arise and how many a match produces, and the
engine's four interaction rules decide how it meets the opponent's style: a
press against a side playing out, a deep block against a patient one, runners
against a high line, recovery pace covering the space. Nobody writes down that a
counter-attacking side punishes a possession side; it falls out of those rules.

### Finding the style

The screen does not say which style is best, because nothing short of playing
the seasons can: see *Fit is not a forecast* in
[playstyles.md](playstyles.md#fit-is-not-a-forecast). That is the design, not a
gap in it. The loop is:

1. **The odds are priced for a Balanced side.** `preSeasonOdds` never sees the
   tactic, and the screen says so: it is the bookmakers' line for this XI.
2. **The screen describes, it does not forecast.** *What your XI is good at*
   lists the engine's nine phases in words (`getXiProfile`; Strong from 0.6
   trait points above an ordinary side, Good from 0.2, Weak below −0.2). Each
   style card lists the phases it leans on (`TacticEffect.needs`), coloured by
   the XI's level in them.
3. **Every season played is written down.** The results page records it in
   `38-0-history` (`src/lib/runHistory.ts`) against the XI (`xiKey`: who plays
   in which slot) and the league-season. A season whose style was changed at
   halfway is recorded with `changedTo` and left off the board, since half a
   season of each style measures neither.
4. **The record comes back.** A style card reads *Untried* or
   *Best 2nd · 78 pts · ×3*; the final report says what the season took on the
   bookmakers' line and shows a tactics board of every style tried with this
   XI, with a *Try another style* button back to this screen.

A season lands about six points either side of a style's true level
(`SEASON_SD`), so the board shows how many seasons each average rests on.

`tacticEffect` in `src/lib/simulation.ts` only describes a style for this
screen: its line, build-up, tempo, possession bias, fit and needs. `fit` is no
longer displayed. Tempo is a property
of the match, the geometric mean of both sides' styles, so the screen says a
style moves the number of chances by about half its own tempo against an
ordinary side.

### Measured

For Liverpool 2019/20 in the 2025/26 field, 40 seasons each on the same seeds:
Park the bus 74.6 points, Gegenpress 88.9 (101 goals); title odds from 20% to
85%. Who you
face matters as much as how you play: against a league that presses, two
ball-playing centre-backs are worth six points a season to an 80-rated XI, and
against a league that sits deep they are worth nothing — see *On the ball, by
phase* in [simulation.md](simulation.md). For a
flat 74-rated XI in 1992/93, 20 seasons each: Catenaccio 52.0, Counter-attack
50.6, Balanced 49.7, Gegenpress 47.9, Park the bus 47.6. The best style differs
by squad and by field, and a weak side is better off slowing the game down — a
68-rated XI takes 29.5 points parking the bus and 25.6 pressing, where an 88
takes 98.2 pressing and 85.8 parking it.

Run `npm run sim:report -- --club <club> --season <season> --tactic all` to
measure any XI.

## The season

`listCompetitions()` in `src/lib/gameData.ts` returns every league-season the
snapshot can field a full league for, which today is fourteen Premier League
seasons: 1992/93 to 2004/05, and 2025/26. It is generic in the league, so a
Serie A season imported later becomes selectable with no code change here or on
the screen.

A league is twenty teams, because the game is called 38-0. Nineteen opponents
plus the drafted XI is 38 games, and the double round robin in
`buildSchedule` needs an even field, so `getOpponentSquads` trims to exactly
nineteen: **the weakest sides make way**, as though the player's XI had come up
and they had gone down. It costs three clubs in 1992/93, 1993/94 and 1994/95,
when the division had 22, and one in every 20-club season. The screen says
which, by name.

## The odds

The panel at the bottom of the screen is not a consequence of either decision on
it. `preSeasonOdds` reads the squad's overall and the field it has been pointed
at, so it answers the season choice; it does not see the tactic — neither the
player's nor the opponents' — and under the match engine a style is worth
points. The model itself, and the measurements it
was fitted to, are in [simulation.md](simulation.md).

The projection it returns is the only one in the game. Both this screen and the
final report read `odds.projectedPosition`, which is what the season is judged
against when the report calls a run over- or underperforming.

## What is not decided here

- **Focus** (how much of the attack goes down each side) is inferred from the
  XI's shape and not offered. The engine plays it, so offering it is now a
  screen, not a model change.
- **Cohesion** belongs to a club-season in the data, not to a drafted XI.
- **Competitions other than a league.** The rule is deliberately about fielding
  a full league; a cup would be a different schedule, not a different opponent
  list.

## After kick-off

The results page plays the season back a gameweek at a time. Two things make
that more than a list of scorelines.

### Half-time of the season

After gameweek 19 (`halfwayWeek`: half the rounds, rounded down) the live view
stops on the table and asks once: keep the style, or change it for the second
half. The panel shows the position, the record, the points pace against the
bookmakers' line, and for each style what it has averaged with this XI in this
league (the same history the style cards read). Keeping it is one tap.

The season was already played in full on arrival, so a change replays it:
`runSeasonSimulation` with `change: { afterWeek: 19, style }` on the **same
seed**. `simulateSeason` swaps the XI's style at the top of round 20 and touches
nothing else, and the matches draw from one random stream in order, so the
first nineteen gameweeks come out identical to the ones already shown; only the
unseen half is new. `seasonEndToEnd.test.ts` holds that to the byte. A full
season takes about 200ms in Node, so the replay is done on the click.

`SimulationResult.styles` lists what was played and from when. The final report
says "Balanced, then Gegenpress from gameweek 20", the share text names both,
and the season is recorded once: written on arrival as before, so leaving at
halfway cannot erase a bad first half, then rewritten in place by `replaceRun`
(matched on seed and `playedAt`) if the style changes. Skip goes to halfway
first, then to the end.

### Key moments

`keyMoments` in `src/lib/keyMoments.ts` reads a finished result — the events of
the XI's 38 matches and the table after every round — and picks out what a
commentator would mention: late winners and equalisers either way (from the
85th minute, `LATE_MINUTE`), comebacks, hat-tricks, the XI's red cards, wins and
defeats by four or more, going top and being knocked off it (not before round
4), dropping into and out of the bottom three (not before round 7), the week
the title is mathematically settled, relegation or safety confirmed, winning
streaks and players' 10/20/30-goal marks, and a perfect or unbeaten season.

Each kind has a weight. The live view shows the newest five under the XI's
match, this gameweek's in bold; the final report shows the eight heaviest in
order as *The season in moments* (`seasonStory`). It is pure and reads only the
result, so it cannot change one.

Measured on fifteen seasons of a strong 1992/93 XI in the 2025/26 field: about
13 moments a season, landing in 11 of the 38 gameweeks. Comebacks from a goal
down came up more than twice a season and crowded out everything else in the
story, so they carry a lower weight than a comeback from two down, and a win by
four or more is told as a thrashing, not a comeback.
