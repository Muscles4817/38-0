# Roles and traits

> This describes what exists today. The target design — the full list of
> abilities, their meanings and what each should do in a match — is
> [abilities.md](abilities.md). Where the two disagree, this one is the code and
> that one is the plan. The list of abilities itself is `src/lib/abilities.ts`.

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
| `shotStopping` | Saves shots: positioning and handling, most against shots from distance |
| `reflexes` | Saves from close range: the one-on-one, the cut-back, the header from six yards |
| `claiming` | Commands his box; claims crosses |
| `setPiece` | Dead-ball delivery |
| `penalty` | Takes penalties |
| `longShot` | Shoots from distance |
| `discipline` | Stays on his feet. Negative means he does not. |

Values run **−3 to 3**: 1 notable, 2 strong, 3 defining, and the same going
down. Negative means a weakness. A role claiming 9 for something
would quietly dominate whichever interaction reads it, so the scale is asserted
in `roleQualities.test.ts`.

Qualities are stored as JSON on `role_config`, so adding a quality needs no
migration.

## What the engine reads

A quality does something only where the match engine reads it. Where it is not
read yet, the trait is decorative in a match, whatever it says.

| quality | read by | effect |
| --- | --- | --- |
| `aerial` | aerial phases, headed chances, set pieces | who wins headers at both ends |
| `pace` | the `break` phase | runs in behind against a high line |
| `recovery` | the `cover` phase; on a keeper, sweeping (`SWEEP_PER_POINT`) | covering the space behind. On a keeper it is also coming off his line: he cuts out a share of balls played in behind, per point and in proportion to his own side's line, however quick the runner. A `SweeperKeeper` (recovery 3) against a quick counter-attacking side concedes 10.4% fewer behind a gegenpress line, 4.7% behind a balanced one, 1.6% behind a parked bus; against a possession side with no pace, 5.1%, 2.3% and 0.4% (20,000 matches each). In the real leagues, about 1.9 goals a season fewer on 11 club-seasons with paired seeds, from Liverpool 2025/26 behind a gegenpress line (6.1) to Liverpool 2008/09 in a low block (0.2). Covering alone was worth 0.1: few opponents in the data carry pace traits that beat these sides' cover |
| `pressing` | the `press` phase; work rate in the `block` | winning the ball high; a working wide man defends |
| `pressResist` | the `build` phase | playing through a press |
| `creation` | the `create` phase; through-ball creators | unpicking a deep block |
| `setPiece` | the `delivery` phase; crossers and set-piece takers | who delivers, and how well |
| `penalty` | who takes penalties | |
| `discipline` | fouls and cards | |
| `shotStopping` | the keeper's saving, by the kind of shot (`SHOT_STOPPING_REACH`) | positioning and handling, so most against shots he sees coming: with a ShotStopper (3), long shots −19%, individual efforts −10%, headers −3.9%, crosses −2.7%, set pieces −2.1%, through balls −1.2%, penalties unchanged; −5% in all (40,000 matches). About 2.6 goals a season fewer, measured on 17 club-seasons with paired seeds (Bournemouth 2025/26, who face many shots, 8.5), and more against sides that shoot from distance. Close-range saves are `reflexes` |
| `reflexes` | the keeper's saving, by the kind of shot (`REFLEXES_REACH`) | reactions, so most against shots from close in: with Reflexes (3), through balls −8.7%, crosses −8%, headers −7.5%, individual efforts −5%, set pieces −4.6%, long shots −1.2%, penalties unchanged; −5.3% in all (40,000 matches). About 2.7 goals a season fewer, measured by giving the 17 ShotStopper keepers Reflexes instead, with paired seeds — as much as a ShotStopper, from the other end of the shot mix. No keeper in the data has it yet |
| `dribble` | draws a player into the `break` phase only | not yet an ability of its own |
| `claiming` | the keeper coming for the ball in the air (`CLAIM_PER_POINT`, `CLAIM_REACH`) | before a cross, a header or a set piece becomes a shot, a keeper with claiming takes a share of them (none of a through ball, a long shot or an individual effort). A keeper who flaps does not face more crosses; he turns the ones he faces into better chances. A CommandingKeeper (3) concedes crosses −9.4%, headers −8.5%, set pieces −6.7%, −3.3% in all (1.8 goals a season) against an ordinary side, 2.6 against a crossing side with target men; FlapsAtCrosses (−2) +1.9% in all (1.0 a season), 2.5 against a crossing side (20,000 matches). In the real leagues, pooled over five seeds: FlapsAtCrosses +1.6 goals a season on all 6 club-seasons that have it; CommandingKeeper −1.2 on the only one (Aston Villa 2025/26); a SweeperKeeper's claiming 1 is lost in the noise |
| `longShot` | nothing yet (long shots go by role affinity) | |
| `defending` | the `block` phase | no trait grants it yet |

## The traits added for the playstyle work

The five qualities the playstyle interactions read were previously inferred from
proxies — running threat from whether a man was a poacher, pressing intensity
from a set of roles containing no forward at all.

| trait | qualities | why it exists |
| --- | --- | --- |
| `Pacey` | pace 3, recovery 1 | The largest single gap. Nothing expressed speed. |
| `Sweeper` | recovery 3, pressResist 2 | Makes a high line survivable; needed for catenaccio |
| `Stopper` | aerial 2, pressing 2, discipline −1 | Steps out; strong against a target man, exposed by runners |
| `PressingForward` | pressing 3 | Pressing is led from the front, and no role said so |
| `Workhorse` | pressing 2 | Covers ground |
| `Carrier` | pressResist 3, dribble 2 | Beats a press by running through it |
| `Dribbler` | dribble 3 | Beats his man, as distinct from a winger who crosses |
| `ShotStopper` | shotStopping 3 | There was exactly one goalkeeping role |
| `Reflexes` | reflexes 3 | Saving is two abilities: a ShotStopper sees it coming, a keeper with reflexes reacts to what he does not |
| `CommandingKeeper` | claiming 3, aerial 1 | Claims crosses — meaningful now set pieces exist |
| `PenaltyTaker` | penalty 3 | A penalty is 0.78 xG and anyone was taking them |
| `LongShot` | longShot 3 | The engine has a long-shot chance type with almost nothing attached |

Their goal and assist multipliers are deliberately modest. **A trait that exists
to describe an ability must not also be a free scoring bonus**; its effect
belongs in the qualities. That is asserted too.

## The rule for what goes on a trait

**A quality belongs on a trait only if you cannot be that trait without it.**

Correlation is not definition, and an earlier version of this map got that wrong
three times in a row. Poachers are not quick — Inzaghi, Muller, van Nistelrooy.
Aerial threats are not slow — Ronaldo, Haaland. Target men are not slow —
Drogba, Adebayor. All three claims were removed, along with pace on Winger,
LateRunner, BoxToBox, Mezzala and Dribbler, none of which imply speed either.
Zidane and Iniesta beat men without any.

What survives are traits whose name asserts the quality. `CompleteForward` is
the one that legitimately claims everything, because that is what complete
means. `NoNonsenseDefender` is the clearest negative: it literally says he does
not attempt anything on the ball.

## Weaknesses

Without negatives, every trait is a bonus, tagging a player is never a cost, and
the rating is the only thing that can be bad about him. That is wrong about
football and it flattens drafting: a 78-rated centre-half who is `Ponderous` is
a specific liability against a counter-attacking side, and nothing else in the
data could say so. It cuts both ways — an opponent's weaknesses become targets.

| trait | qualities |
| --- | --- |
| `Ponderous` | pace −2, recovery −2 |
| `Lightweight` | aerial −2 |
| `LooseInPossession` | pressResist −2 |
| `Immobile` | pressing −2, recovery −1 |
| `FlapsAtCrosses` | claiming −2 (goalkeeper) |
| `PoorDistribution` | pressResist −2 (goalkeeper) |
| `RashInTheTackle` | discipline −2 |

These are allowed to be wholly negative because the weakness *is* the trait.
A trait that was merely bad at everything would not be a trait — it would be a
worse player, and the rating already says that.

## Where fouls come from

Who commits them used to be a hardcoded list of role names inside
`matchEngine.ts` — the trait system reimplemented in the wrong place, where
adding a rash defender meant editing the simulator. It is now the `discipline`
quality. Note it changes **who** fouls, not how many: the weights select among
eleven players, so the cards-per-team rate is untouched.

## Assigning them

The same rules as before. Set a role only where the fit is obvious, leave it
empty where a player straddles two, and keep a player's roles consistent across
his seasons unless his game genuinely changed. Roughly half of players having no
role at all is a healthy outcome.

Be careful with the heavy multipliers. `AerialThreat` at 3.5× decides who scores
as much as the rating does; the match engine damps role multipliers by a square
root when choosing who gets on the end of a chance, but it is still the single
strongest claim available.

## AerialThreat does not go on a striker

`AerialThreat` is a **3.5x goal multiplier**, the largest in the database. On a
centre-back that is harmless, because a centre-back is not where chances go —
which is how the rest of the data uses it: Van Dijk, Gabriel, Sergio Ramos,
Ivanović, and Fellaini arriving late from midfield.

Put it on a striker and it decides the golden boot by itself. Barcelona 2009/10
simulated with Ibrahimović, rated 87, scoring **66 of the side's 97 goals** while
Messi, eight rating points better, scored 12. Stacked with another scoring role
it gets worse: `Poacher` + `AerialThreat` is 7.7x.

**A forward who is strong in the air gets `TargetMan`** — 1.3x, `aerial` 2. That
says the same thing about the player without handing him the whole season. Ibra
went to 48 goals and 49%, in line with Henry's 45% for Arsenal 2003/04.

The general form: **a forward should carry at most one big scoring role.** The
multipliers compound, and the engine's square-root damping is not enough to
absorb two of them on the player who already receives most of the chances.

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

It happened again with whole squads. Eighteen club-seasons are seeded by
`db.ts` from code rather than imported from `data/squads/` — among them
Chelsea 2013/14, 2014/15 and 2016/17, Manchester City 2011/12 and 2017/18,
Liverpool 2013/14, 2019/20 and 2024/25, Tottenham 2018/19, Newcastle 2022/23,
and the 2024/25 Arsenal, Chelsea and Aston Villa sides — and the seed wrote
every player with no traits. Their traits, and five ratings and position
lists, were added in the editor and existed in one local database only. They
are now in `src/lib/seedRoles.ts` and the seed. A database rebuilt from scratch
(`getDb()`, `npm run import:squads -- --prune`, `npm run derive:lineups`,
`npm run export:data`) reproduces the traits, rating and positions of every
player in the shipped snapshot that it holds.

**A trait added to a code-seeded side goes in two places**: the snapshot (or
the editor) and `SEED_ROLES`. The seed only runs for a squad a database does
not have yet, so an existing database never sees a new entry in `SEED_ROLES`;
`npm run sync:seed-roles` writes them into it, and reports each change.

What a rebuild still cannot reproduce:

- the 66 club-season style records (cohesion, playstyle, focus), which have no
  file;
- five squads that exist only in the database — AC Milan 2006/07 and the four
  stubs of one player each (Liverpool 2017/18, AC Milan 1994/95, 2002/03 and
  2004/05);
- two players added to code-seeded squads in the editor, Nigel de Jong
  (Manchester City 2011/12) and Moussa Dembélé (Tottenham 2018/19);
- the accented spellings the editor gave about forty players: a rebuild calls
  him Robert Pires, the game Robert Pirès.
