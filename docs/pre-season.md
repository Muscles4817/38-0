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
was decided here, so a second confirmation between the decision and the result
would only be a step to click through.

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

`fit` is `fitForStyle`, the 0–1 measure of whether the eleven has the qualities
a style asks for. The engine scales what the style's demands buy — how hard its
press bites, how dangerous its runners are in behind — by it.

`tacticEffect` in `src/lib/simulation.ts` only describes a style for this
screen: its line, build-up, tempo, possession bias and fit. Tempo is a property
of the match, the geometric mean of both sides' styles, so the screen says a
style moves the number of chances by about half its own tempo against an
ordinary side.

### Measured

For Liverpool 2019/20 in the 2025/26 field, 40 seasons each on the same seeds:
Park the bus 67.5 points, Total football 74.6; title odds from 18% to 60%. For a
flat 74-rated XI in 1992/93, 20 seasons each: Catenaccio 56.6, Gegenpress 47.8,
Balanced 51.1. The best style differs by squad and by field, and a weak side is
better off slowing the game down — a 68-rated XI takes 36 points parking the
bus and 29 pressing, where an 88 is about level between the two.

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
