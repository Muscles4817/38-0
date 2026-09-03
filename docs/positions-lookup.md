# Looking up positions

FBref records a player as `DF`. The game needs `LB`, `CB`, `RB`, `LWB` or
`RWB`. Closing that gap is lookup work — there is no
programmatic shortcut, and the data has been checked for one.

## Why there is no shortcut

- **Output does not classify.** Goals and assists per 90 order roles roughly and
  overlap heavily. In Liverpool 2025/26, van Dijk (CB) posts a higher G+A/90
  than Robertson (LB); Gravenberch (CDM) and Wirtz (CAM) are separated by 0.06.
  Useless as a classifier.
- **11v11 names the side for only 13%** of players; the rest are a bare
  "Defender".
- **Squad numbers are a weak prior.** #1 is a goalkeeper 100% of the time, but
  only 8 of 14 named left-backs wore #3, and right-backs showed no pattern.
- **FBref has no left/right split anywhere** — touches and tackles are broken
  down by pitch third, never by flank.

So it is looked up, per player.

## Per player, not per club-season

Recurrence between consecutive seasons is about **70%**: of 451 players in
1993/94, 320 had already appeared in 1992/93. Across 34 seasons that is roughly
**4,400 distinct players**, against about 13,700 club-season assignments. One
lookup for a twenty-season career serves all twenty, and keeps that career
consistent for free.

```bash
node scripts/plan-position-batches.mjs           # create the batch stubs
node scripts/plan-position-batches.mjs --status  # how many are done
```

Each `data/raw/positions/batch-NNN.json` holds up to 25 players, ordered by
minutes played so the ones that matter most to the game are resolved first.

## What a stub gives you

```jsonc
{
  "name": "Robbie Earle",
  "nation": "JAM",
  "fbrefPosition": "MF",
  "allowed": ["CDM", "CM", "CAM", "LM", "RM"],
  "primaryMustBeOneOf": ["CDM", "CM", "CAM", "LM", "RM"],
  "totalMinutes": 7549,
  "seasons": [ { "season": "1992/93", "club": "Wimbledon", "minutes": 3769,
                 "starts": 42, "goals": 7, "assists": 5 } ],
  "positions": [],        // <- fill this in, most natural first
  "confidence": null,     // <- high | medium | low
  "note": null
}
```

Fill in `positions`, `confidence` and, if useful, `note`. Change nothing else.

## Rules

1. **Only values from `allowed`.** The FBref label is a fact and the assignment
   may not contradict it. A `DF` never becomes a winger.
2. **The first position must come from `primaryMustBeOneOf`.** FBref orders a
   combined label by primacy: `DFMF` is a defender who also played midfield,
   `MFDF` the reverse.
3. **Be as specific as the evidence supports, and no more.** A player who
   covers an adjacent position is handled automatically — a `CM` can fill a
   `CDM` or `CAM` slot, an `LB` can fill `LWB` — at a small rating penalty. So
   there is no need to force a precise call you are not confident in. Do
   distinguish a genuine holding midfielder from a genuine number ten, because
   the simulation weights them very differently, but `CM` is a perfectly good
   answer for a player who was simply a central midfielder.
4. **List both flanks when a player genuinely played both**, as `["LB", "RB"]`.
   That is honest, and the simulation treats left and right identically, so it
   costs nothing. Never invent a side to look precise.
5. **Two or three positions is normal.** More than four is guesswork and is
   rejected.
6. **Set `confidence` truthfully.** `low` is a useful answer; it tells the
   verification pass where to spend its effort. A wrong `high` is worse than an
   honest `low`.
7. **`perSeason` only for a genuine role change** — a full-back who converted to
   centre-back, say. It must differ from the default, or it is rejected as
   noise.

## What matters most

The simulation weights positions very differently along the depth axis and not
at all along the lateral one:

| | attack | defence | goal weight | assist weight |
| --- | --- | --- | --- | --- |
| `CDM` | 0.30 | 0.70 | 2 | 5 |
| `CM` | 0.50 | 0.50 | 4 | 12 |
| `CAM` | 0.70 | 0.30 | 12 | 25 |
| `LM` / `RM` | 0.60 | 0.40 | 6 | 18 |

`CDM` versus `CAM` is a sixfold difference in how often that player scores.
`LB` versus `RB` is no difference whatsoever. Spend the care accordingly: get
the depth right, and do not agonise over the flank.

## The check

```bash
npx vitest run src/lib/positionCoherence.test.ts
```

Runs in CI. It asserts that no assignment contradicts its FBref label, and —
more usefully — that the players who actually played the most in each
club-season can be arranged into a formation the game knows.

That second check is what makes per-player lookup safe. Every individual answer
can be defensible while the eleven is impossible: assign six centre-backs and no
full-backs and the best fit drops to 6/11, and CI says so.
