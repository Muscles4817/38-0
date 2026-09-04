# Roles and traits

A role says two different kinds of thing about a player, and it is worth
keeping them apart.

**What he produces** — `goalMult`, `assistMult`, `attContrib`, `midContrib`,
`defContrib`. These decide who gets on the end of a chance and what a player
adds to a team-strength number.

**What he is good at** — `qualities`. These describe ability rather than output.

Until the qualities existed, a role could only speak the first language. That is
why `AerialThreat` is a **3.5× goal multiplier** rather than "wins headers":
there was no other slot, so an ability had to be expressed as a scoring bonus.
It is also why nothing in the data expressed pace, which is the entire basis of
counter-attacking and of punishing a high line.

## The vocabulary

| quality | means |
| --- | --- |
| `aerial` | Wins the ball in the air |
| `pace` | Genuine speed; runs in behind |
| `recovery` | Gets back and covers the space behind the defence |
| `pressing` | Presses from the front or through midfield |
| `pressResist` | Keeps the ball under pressure |
| `creation` | Unlocks a set defence |
| `dribble` | Beats a man one on one |
| `shotStopping` | Goalkeeping reflexes |
| `claiming` | Commands his box; claims crosses |
| `setPiece` | Dead-ball delivery |
| `penalty` | Takes penalties |
| `longShot` | Shoots from distance |

Values are **1 notable, 2 strong, 3 defining**. A role claiming 9 for something
would quietly dominate whichever interaction reads it, so the scale is asserted
in `roleQualities.test.ts`.

Qualities are stored as JSON on `role_config`, so adding a quality needs no
migration.

## The traits added for the playstyle work

The five qualities the playstyle interactions read were previously inferred from
proxies — running threat from whether a man was a poacher, pressing intensity
from a set of roles containing no forward at all.

| trait | qualities | why it exists |
| --- | --- | --- |
| `Pacey` | pace 3, recovery 1 | The largest single gap. Nothing expressed speed. |
| `Sweeper` | recovery 3, pressResist 2 | Makes a high line survivable; needed for catenaccio |
| `Stopper` | aerial 2, pressing 2 | Steps out; strong against a target man, exposed by runners |
| `PressingForward` | pressing 3, pace 1 | Pressing is led from the front, and no role said so |
| `Workhorse` | pressing 2, pressResist 1 | Covers ground |
| `Carrier` | pressResist 3, dribble 2 | Beats a press by running through it |
| `Dribbler` | dribble 3, pace 1 | Beats his man, as distinct from a winger who crosses |
| `ShotStopper` | shotStopping 3 | There was exactly one goalkeeping role |
| `CommandingKeeper` | claiming 3, aerial 1 | Claims crosses — meaningful now set pieces exist |
| `PenaltyTaker` | penalty 3 | A penalty is 0.78 xG and anyone was taking them |
| `LongShot` | longShot 3 | The engine has a long-shot chance type with almost nothing attached |

Their goal and assist multipliers are deliberately modest. **A trait that exists
to describe an ability must not also be a free scoring bonus**; its effect
belongs in the qualities. That is asserted too.

## Assigning them

The same rules as before. Set a role only where the fit is obvious, leave it
empty where a player straddles two, and keep a player's roles consistent across
his seasons unless his game genuinely changed. Roughly half of players having no
role at all is a healthy outcome.

Be careful with the heavy multipliers. `AerialThreat` at 3.5× decides who scores
as much as the rating does; the match engine damps role multipliers by a square
root when choosing who gets on the end of a chance, but it is still the single
strongest claim available.

## A failure worth remembering

`NoNonsenseDefender` and `SweeperKeeper` existed **only in the database**. They
had been added at some point without being written back into the code defaults,
so a database rebuilt from scratch would have silently lost them — and
`NoNonsenseDefender` is the most used role in the whole dataset, on 152 players.

The seeding made it possible: roles were only inserted when the table was
*empty*, so anything added later never reached a database that already existed.
That is the same shape as the batch planners, which carried work forward only if
the thing it belonged to was considered finished. Roles are now inserted every
time with `INSERT OR IGNORE`, which leaves editor changes alone, and a test
asserts that no player carries a role the code does not define.
