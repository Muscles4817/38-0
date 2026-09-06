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

`tacticEffect` in `src/lib/simulation.ts` turns those into what the season
model actually uses — rating points on attack, midfield and defence, plus a
multiplier on the chances the player's own matches produce. Two rules do the
work:

1. **The cost is paid in full; the benefit is collected × fit.** A high line
   concedes space behind whoever is playing it, and only pays back pressure to
   a side that can press. `fit` is `fitForStyle`, the same 0–1 measure the
   match engine applies to a side it has already been given, computed from the
   qualities on a player's roles. Tiki-taka without technicians buys the low
   tempo and none of the control.
2. **Tempo scales both sides' chances**, and is not scaled by fit — nobody
   needs talent to slow a game down. Signal grows with the number of chances in
   a match and noise with its square root, so a fast game suits the better side
   and a slow one is an underdog's best friend. That is arithmetic, not a thumb
   on the scale.

Balanced sits at the origin of all three axes: fit 1, no rating change, tempo 1.
Choosing it reproduces exactly the season this model played before tactics
existed, which is why none of the calibration work in
[simulation.md](simulation.md) had to be redone.

### Measured

Average points over 30 seeded seasons against the 2025/26 field, for three
drafted XIs, with every style played by each:

| | best style | worst style | spread |
| --- | --- | --- | ---: |
| 89 OVR (2003/04 Arsenal, Man Utd, Chelsea) | gegenpress 69.6 | park the bus 60.6 | 9.0 |
| 77 OVR (1999/00 Leicester, Southampton, Everton) | balanced 27.8 | gegenpress 23.1 | 4.8 |
| 74 OVR (1997/98 Barnsley, Palace, Bolton) | possession 25.2 | gegenpress 19.2 | 6.0 |

Two things matter in that table and neither is a single number. The best style
is **different for each squad**, and the two extremes swap ends: gegenpress is
worth nine points to the strong XI and costs the weak one two. And the spread
is about 1.3–2.4 points per ten games, against the 9.1-point ladder the old six
styles produced — picking a style is worth a place or two, not a title.

The constants those trade-offs are made of (`LINE_ATT`, `LINE_DEF`,
`BUILD_MID`, `BUILD_ATT`, `TEMPO_WEIGHT`) are at the top of the tactics section
in `simulation.ts`. If you move one, re-measure this table rather than
reasoning about it.

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
at, so it answers the season choice; it does not see the tactic, which is worth
a few rating points either way on top. The model itself, and the measurements it
was fitted to, are in [simulation.md](simulation.md).

The projection it returns is the only one in the game. Both this screen and the
final report read `odds.projectedPosition`, which is what the season is judged
against when the report calls a run over- or underperforming.

## What is not decided here

- **Focus** (how much of the attack goes down each side) exists on a
  `TeamSetup` in the match engine and is not offered. The season model has no
  zones, so there would be nothing for it to do.
- **Cohesion** belongs to a club-season in the data, not to a drafted XI.
- **Competitions other than a league.** The rule is deliberately about fielding
  a full league; a cup would be a different schedule, not a different opponent
  list.
