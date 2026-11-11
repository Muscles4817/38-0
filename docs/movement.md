# Movement — how it works in the match

The design for the movement family of [abilities.md](abilities.md): for each
movement ability, where it enters a match, what it changes, what beats it,
which traits get it, and how we will know it works. Nothing here is built
yet beyond step 1; the [build order](#build-order) says what is done and what
comes next.

## What the engine can and cannot see

The match engine does not move players around a pitch. It knows each player's
position (a striker, a left-back) and which third of the pitch's width that
puts him in (left, centre or right). A match is 200 possessions, and each one
asks a series of questions:

1. **Who has the ball?** Decided by midfield strength and style.
2. **Does a press win it back?** The pressing side's line against the other
   side's build-up.
3. **Which flank does the attack go down?** The side's chosen focus.
4. **Does it become a shot?** Attacking strength against defending strength in
   that zone, adjusted by the style matchups (press, deep block, space in
   behind).
5. **What kind of chance is it?** A through ball, a cross, a header, a long
   shot or a solo effort. That depends on the zone, the style, and how high
   the other side's line is.
6. **Who shoots, and who made it?** Weighted by position, zone, rating, and
   today the traits' flat scoring bonuses.
7. **How good is the chance, and does the keeper keep it out?**

So movement cannot be "he runs here, then there". It has to be **who takes
part in which question, and how they change the answer**. Every movement
ability below is written that way. The table at the end of each says which of
the seven questions it changes.

## The abilities

### Box movement — getting on the end of it

- **What it is.** In the right place in the box: loses his marker, attacks the
  near post, reads where the ball will drop. The Poacher.
- **Where it enters.** Question 6, *who shoots*, for chances that arrive in the
  box: crosses, headers, through balls and the scrambles after a set piece.
  It makes him likelier to be the one on the end of them. It does not make
  more chances, and it does not make the chance better.
- **The negative end.** Drifts out of the box; less likely to be on the end of
  anything, whatever his position.
- **What beats it.** Man marking (not built yet).
- **Replaces.** Most of the Poacher's flat scoring bonus. Today a Poacher
  scores more because his trait says "2.2 times the goals". After this, he
  scores more because he gets on the end of more chances in the box, and not
  of long shots or solo runs.

### Attacking the box — committing numbers to the cross

- **What it is.** Gets into the box whenever the ball goes wide, from whatever
  position. Fellaini; the target man who stays central and arrives.
- **Where it enters.**
  - Question 6: likelier to be the one on the end of crosses and headers, even
    from midfield.
  - Question 5: a side with men attacking the box gets more of its wide attacks
    away as crosses, because there is someone to aim at.
- **The negative end.** Stays out. A side that will not commit to the box gets
  fewer crosses away.
- **What beats it.** Man marking, box defending and a keeper who claims (built).

### Late runs — arriving after the first wave

- **What it is.** The midfielder who arrives unmarked for the cut-back or the
  second ball. Lampard, the late runner, the box-to-box midfielder.
- **Where it enters.** Question 6, for crosses (the engine's cut-backs are
  crosses) and set-piece scrambles. It draws a midfielder onto chances his
  position would rarely give him.
- **The cost.** A midfielder who has arrived in the box is not back. When the
  attack breaks down, the other side's counter is a little more dangerous.

### Runs in behind — on the last defender's shoulder

- **What it is.** Times the run beyond the last defender.
- **Where it enters.**
  - The break phase (question 4's "space in behind" rule). Today that phase
    reads pace alone; it will read runs in behind and pace together. A slow
    striker who times his run still threatens the space, and a quick one who
    never runs does not.
  - Question 5: a side with runners gets more through balls against a high
    line.
  - Question 6: the runner is likelier to be on the end of the through ball.
- **What beats it.** A high line's recovery, and a sweeping keeper (built).
  Against a deep line there is no space to run into.

### Channel runs — from wide into the gap

- **What it is.** Moves from wide into the gap between full-back and
  centre-back. The Inside Forward.
- **Where it enters.**
  - Question 5, for attacks down his flank: some of what would have been
    crosses become through balls into the channel and shots from the inside
    channel.
  - Question 6: he is likelier to be on the end of those.
- **What beats it.** A full-back and centre-back who defend the channel
  together; a back three with a centre-back who steps out (see *Stepping
  out*).

### Holding width — stretching the defence

- **What it is.** Stays wide to stretch the defence. The traditional winger.
- **Where it enters.**
  - Question 5, for attacks down his flank: more crosses.
  - Question 4: a deep block is harder to keep compact against a side that is
    wide on both flanks, so the "deep block" rule bites less.
- **The negative end.** Drifts inside: the side is narrow, fewer crosses, and
  the deep block bites more.
- **Pairs with.** Switching play (on the ball, not built yet).

### Overlapping — the full-back as the width

- **What it is.** A full-back who goes outside or beyond the wide man. The
  attacking full-back.
- **Where it enters.**
  - The attacking phases: he takes part in attacks down his flank, more so
    with no winger ahead of him. The engine already hands an empty flank to the
    full-back; this decides how much he takes on.
  - Question 6: he is likelier to supply the cross.
- **The cost.** The space behind him. When his side loses the ball, a counter
  down his flank is more dangerous.

### Inverting — the full-back into midfield

- **What it is.** A full-back who moves into midfield when his side has it.
  The inverted wing-back.
- **Where it enters.**
  - Question 1: he adds to midfield, so a little more of the ball.
  - Question 2: he helps the side play out of a press.
  - When the ball is lost, he is already central, so a counter through the
    middle is less dangerous.
- **The cost.** No width from him. His flank gets fewer crosses, and the engine
  stops treating him as the width when there is no winger ahead.

### Dropping deep — the forward between the lines

- **What it is.** A forward who comes short. The false nine, the deep-lying
  forward.
- **Where it enters.**
  - Question 1: he adds to midfield.
  - The creation phase, which picks a deep block apart.
  - Question 4: he drags a centre-back out of the line, which opens space in
    behind for a team-mate's run. So it makes runs in behind more dangerous,
    and only matters if someone is running.
- **The cost.** Fewer bodies in the box. He is less likely to be on the end of
  a cross himself, and the side gets fewer crosses away.

### Showing for the ball — always an option

- **What it is.** Always available to the man on the ball. Busquets, Xavi, the
  deep-lying playmaker.
- **Where it enters.**
  - Question 2: playing out of a press, alongside press resistance. Press
    resistance is keeping it when the press arrives; showing for the ball means
    the pass is on before it does.
  - Question 1: possession share. A side that is always available keeps the
    ball longer.
- **The negative end.** Hides. The side is easier to press and keeps less of
  the ball.
- **What beats it.** A press with the numbers to cover the options; little
  else. It is the possession side's main weapon.

### Positional discipline — holding the shape

- **What it is.** Holds his position, always. The screening midfielder.
- **Where it enters.**
  - **+** He takes a bigger part in the deep block and in covering when the
    ball is lost, so his zone is harder to attack, above all on the counter.
  - **−** The roamer takes a bigger part in creation: he finds pockets nobody
    else does. He takes a smaller part in the block, and when the ball is lost
    his zone is exposed.
- **What beats it.** It is a trade, not a bonus. Discipline gives up creation,
  and roaming gives up shape.

### Stepping out — the centre-back who defends wide

- **What it is.** A centre-back comfortable defending wide and stepping into
  midfield.
- **Where it enters.** Question 4, for attacks down a flank. In a back three,
  the outside centre-backs defend the channels. A centre-back who steps out
  makes his flank harder to attack. One who will not leaves the channel open,
  and channel runs and overlaps punish it.
- **The negative end.** Stays central. Fine in a back four with a proper
  full-back outside him; a liability in a back three.
- **In a back four.** A small effect either way, because the full-back does
  that job.

## Which traits get which movement

These are proposals for review. They follow the rule in [roles.md](roles.md):
an ability belongs on a trait only if you cannot be that trait without it.

| Trait | Movement it gets | Instead of |
| --- | --- | --- |
| Poacher | box movement +3 | most of its flat scoring bonus |
| Inside Forward | channel runs +3 | dribbling +2 (wrong, see abilities.md) |
| Late Runner | late runs +3 | long shots +1 |
| Box-to-Box | late runs +1 | |
| Target Man | attacking the box +2 | |
| Mezzala | channel runs +1, late runs +1 | |
| Complete Forward | runs in behind +1, box movement +1, dropping deep +1 | |
| False Nine | dropping deep +3 | |
| Deep-Lying Forward | dropping deep +2 | |
| Trequartista | positional discipline −2 (roams) | |
| Winger | holding width +3 | |
| Attacking Full-back | overlapping +3 | |
| Inverted Wingback | inverting +3 | |
| Deep-Lying Playmaker | showing for the ball +2 | |
| Regista | showing for the ball +2 | |
| Anchor | positional discipline +3 | |
| Ball-Playing Defender | stepping out +2 | |
| Stopper | stepping out +2 | |
| No-Nonsense Defender | stepping out −2 (stays central) | |

Two movements have no trait that means them. Two new traits are proposed:

- **Plays on the Shoulder** (runs in behind +3), for any forward. It is
  deliberately separate from *Pacey*: pace is not movement.
- **Box Crasher** (attacking the box +3), for any position. Fellaini.

*Aerial Threat* stays as it is. It can be any position, including a
centre-back, who does not attack the box in open play.

## Step 1, as built: who gets the chance

Box movement, attacking the box and late runs are read in shooter selection
(`MOVEMENT_REACH`, `MOVEMENT_TO_SHOTS` in `matchEngine.ts`). Each point makes a
player likelier to be the one on the end of the chances it reaches. Attacking
the box also turns more of a side's wide attacks into crosses
(`BOX_COMMIT_TO_CROSSES`).

**Recipes.**
- Poacher: box movement +3.
- Late Runner: late runs +3, instead of long shots +1.
- Target Man: attacking the box +2.
- Box-to-Box and Mezzala: late runs +1.
- Complete Forward: box movement +1.
- Box Crasher (new): attacking the box +3.
- Plays on the Shoulder (new): runs in behind +3, which nothing reads until
  step 2.

**What was retired.** The flat goal multipliers on Poacher (2.2), Late Runner
(1.8), Target Man (1.3) and Box-to-Box (1.3) are now 1. So are the Poacher's,
Late Runner's and Target Man's affinities for crosses and through balls. What
they meant is now movement.

**Controlled duel** (20,000 matches, identical sides, one player different):
- a striker with box movement +3 scores 30% of his side's goals against 19% for
  the other striker. The difference is all through balls, crosses, headers and
  set-piece scrambles; their long shots and solo efforts are level;
- a central midfielder attacking the box +3 scores twice the crosses and
  headers of the other, and his side gets slightly more of them;
- a central midfielder with late runs +3 scores twice the crosses and more
  set-piece scrambles.

Box movement and late runs leave the side's total goals exactly where they
were: they decide whose chance it is, not how many there are.

**Against the real scorers.** Each trait's share of its club's non-penalty
goals, per full season, against FBref over 19 seasons:

| Trait | Before | After | Real |
| --- | --- | --- | --- |
| Poacher | 31.5% | 32.0% | 35.1% |
| Late Runner | 14.9% | 14.6% | 16.2% |
| Box-to-Box | 9.7% | 9.3% | 7.7% |
| Target Man | 25.7% | 27.6% | 26.5% |
| Complete Forward | 27.9% | 31.0% | 31.0% |

They now score more of it from the right places. A Poacher's goals:

| | from distance | solo efforts | headers |
| --- | --- | --- | --- |
| Before | 11.0% | 12.3% | 12.7% |
| After | 8.8% | 9.6% | 15.0% |

**League calibration unchanged.** +3.36 points per strength point (real +3.41),
draws 25.6% (real 26.5%).

**Golden Boot up about two goals.** Averaged over four seasons, 31.9, from 30.1
(real 29.3). A club's top scorer's share of its goals is unchanged.

**Still to do in this family.**
- The cost of late runs (midfield short when the attack breaks down) waits for
  step 5.
- Man marking, the counter to all three, belongs to the defending family.

## Step 2, as built: running

**Runs in behind** enters in three places:
- **The break phase.** It is now pace plus runs in behind, added together
  rather than averaged (`combine: 'sum'`). A side with pace and no runners is
  exactly where it was. A slow man who times his run now threatens the space,
  and one who is quick and runs counts for both.
- **How many through balls.** A side with runners plays more through balls,
  scaled by how high the other side's line is (`RUNS_TO_THROUGH_BALLS`).
  Against a deep block there is nowhere to run, and it does nothing.
- **Who gets them.** The runner is likelier to be on the end of the through
  ball (`MOVEMENT_REACH`).

**Channel runs** enter in two places:
- **How the attack ends.** On an attack down his flank, some of what would
  have been crosses become a through ball into the channel or a cut inside and
  a shot (`CHANNEL_TO_INSIDE`).
- **Who gets them.** He is likelier to be on the end of those.

**Recipes.**
- Inside Forward: channel runs +3, instead of dribbling +2. Its flat goal
  multiplier (1.8) and its affinities for through balls and solo efforts are
  retired.
- Mezzala: channel runs +1.
- Complete Forward: runs in behind +1.

**Controlled duel** (20,000 matches, identical sides, one striker different):

| Against | Plays on the shoulder | Quick | Both |
| --- | --- | --- | --- |
| a gegenpress line | +6.7% goals | +5.2% | +15.9% |
| a balanced line | +3.4% | +2.9% | +7.5% |
| a parked bus | +0.9% | +1.1% | +1.3% |

Channel runs (+3) on both wide midfielders, against a balanced side:
- crosses fall from 12.7% of the side's goals to 8.9%;
- through balls rise from 19.0% to 21.4%, and solo efforts from 13.3% to 15.9%;
- the wide men's share of the goals rises from 21.5% to 27.3%;
- the side scores 2.4% more, because a ball into the channel is a better
  chance than a cross. Nothing defends the channel yet: that is *stepping out*,
  in step 5.

**Against the real scorers.**
- Inside Forward: 17.0% of his club's goals against a real 17.7%, as before,
  now without the flat bonus.
- Complete Forward: 32.1% against 31.0% (was 31.0%).
- The goal mix moves by less than 0.3 points in every category.

**League calibration unchanged.** +3.37 points per strength point (real
+3.41), draws 25.7% (real 26.5%).

**The Golden Boot.** Averaged over four seasons it is 32.5 (31.9 after step 1,
30.1 before; real 29.3). Nearly all of the rise is Henry in 2003/04. His share
of Arsenal's goals is now 33.5% against a real 34.2%, which is closer than
before (29.7%). The sim's top sides score about six goals a season more than
the real ones did, and that is what puts the Golden Boot high, not his share.

**Speed.** Each player's movement is now worked out once per match
(`movementFactors`), not on every shot. A season simulates slightly faster
than before the movement work began.

## Step 3, as built: width

A flank's **width** is what its players give it, summed:
- a winger's holding width;
- half of a full-back's overlapping, because he arrives rather than stays;
- minus a full-back's inverting.

**Holding width** enters in two places:
- **Crosses.** More of the attacks down that flank become crosses
  (`WIDTH_TO_CROSSES`). It works against channel runs, which take crosses away.
- **The deep block.** Width on both flanks makes a deep block harder to keep
  compact (`WIDTH_STRETCHES_BLOCK`, in `congestionFactor`). A narrow side,
  with negative width, is congested more.

**Overlapping** enters in three places:
- **Width**, at half value.
- **The cross.** He is likelier to be the one who puts it in
  (`OVERLAP_TO_CROSSER`).
- **The cost.** When the side loses the ball to a press and is countered, his
  flank defends worse, because he is up the pitch (`OVERLAP_EXPOSURE`).

**Inverting** enters in four places:
- **Midfield numbers.** An extra man in midfield, which gives a little more of
  the ball (`MIDFIELD_NUMBERS_TO_POSSESSION`) and makes it easier to play out
  of a press (`MIDFIELD_NUMBERS_TO_PRESS`).
- **The counter.** The middle defends a counter better, because he is
  already there (`INVERT_PROTECTS_CENTRE`).
- **The cost.** His flank loses width, and with no winger ahead of him he no
  longer takes on the flank's attacking duty.

**Recipes.**
- Winger: holding width +3.
- Attacking Full-back: overlapping +3.
- Inverted Wingback: inverting +3.

**Controlled duel** (20,000 matches, identical 4-4-2s; both wide midfielders or
both full-backs different):

| | vs balanced | vs a parked bus | vs a gegenpress |
| --- | --- | --- | --- |
| Wingers holding width | +2.7% goals | +4.0% | +0.5% |
| Wingers narrow (−2) | −1.1% | −2.3% | −0.7% |
| Full-backs overlapping | +1.3% goals, +1.1% conceded | +2.5%, −1.1% | +0.5%, +0.9% (a possession side: +2.2% conceded) |
| Full-backs inverting | −1.1% goals, −4.0% conceded, +2.2 pts of the ball | −2.6%, −2.4% | +1.2%, −4.1% |

So width pays most against a deep block, an overlap is paid for on the
counter, and inverting trades crosses for control. Overlapping full-backs
supply 15.9% of their side's goals instead of 13.7%.

**Against the real numbers** (FBref, 19 seasons):
- Crosses and headers go from 24.7% of all goals to 25.0%.
- Wingers' goals and assists are unchanged; they already crossed through
  their delivery.
- Attacking Full-backs' assists rise from 7.9% of their club's goals to 9.5%
  (real 7.6%). Every full-back is over-credited with assists already: plain
  full-backs get 7.3% against a real 4.5%. That is a crossing calibration
  issue, not this step. What this step changes is the gap between an
  attacking full-back and a plain one. It was 1.1 times; it is now 1.3 times,
  against a real 1.7.

**League calibration unchanged.**
- +3.34 points per strength point (real +3.41); draws 25.6% (real 26.5%).
- Possession by style is unchanged to the tenth of a point.
- The Golden Boot holds at about 32.

**Still to do in this family.** A counter is still started only by a press
winning the ball. "When his side loses the ball, a counter down his flank" is
modelled for that case alone; an attack that simply breaks down does not start
a counter in this engine.

## Step 4, as built: between the lines

**Showing for the ball** enters in two places:
- **The build phase.** It is added to press resistance, at 0.4 of its weight
  (`combine: 'sum'`). Keeping the ball when the press arrives still counts for
  more than being on offer before it does. A side without it is where it was.
- **Possession** (`SHOWING_TO_POSSESSION`).

The negative end, hiding, works the other way in both.

**Dropping deep** enters in five places:
- **Midfield numbers.** It joins inverting as an extra man in midfield, for
  possession and the press.
- **The creation phase.** He takes his part in unpicking a block.
- **Space in behind.** He opens it for a runner (`DROP_OPENS_SPACE`). It
  multiplies the space, so with nobody running it opens none.
- **The through ball.** He is likelier to be the one who plays it
  (`DROP_TO_PASSER`): the forward who drops in and plays the runner through.
- **The cost.** He is less often on the end of a cross himself, and his side
  puts fewer in, because he is not in the box to aim at.

**Recipes.**
- Deep-Lying Playmaker and Regista: showing for the ball +2.
- False Nine: dropping deep +3.
- Deep-Lying Forward: dropping deep +2.
- Complete Forward: dropping deep +1.

**Controlled duel** (20,000 matches, identical 4-4-2s):
- **Both central midfielders showing for the ball (+3):**
  - about 2.2 points more of the ball, and a third fewer lost to a press,
    against any opponent;
  - +1.5% to +2.9% goals, and 1.5% to 7% fewer conceded, most against a
    gegenpress.
- **Hiding (−2):** 1.5 points less of the ball, 12% more lost to a press, and
  more conceded.
- **A striker dropping deep (+3), on his own:** a point more of the ball and a
  little less conceded. His own share of the goals falls, as do the side's
  crosses.
- **The same, with a runner (runs in behind +3) beside him:**

| Against | The runner alone | Runner with a man dropping deep |
| --- | --- | --- |
| a balanced side | +3.4% goals | +5.4% |
| a gegenpress (possession side) | +4.1% | +6.0% |
| a gegenpress (direct side) | +10.9% | +14.6% |
| a parked bus | +0.9% | +1.1% |

**Against the real numbers** (FBref, 19 seasons):
- Deep-Lying Forward: 21.6% of his club's goals (was 22.4%, real 24.1%), and
  9.1% assists (was 8.1%, real 16.6%).
- Complete Forward: 31.6% (real 31.0%).
- Strikers are under-credited with assists generally (6.2% against a real
  10.5% for plain strikers). That is not this step, and the through-ball
  passer only narrows it for the forward who drops.

**League calibration unchanged.**
- +3.35 points per strength point (real +3.41); draws 25.5% (real 26.5%).
- Possession by style moves by half a point at most.
- The Golden Boot averages 31.5.

## Build order

One step at a time. Each step is measured, committed, and reviewed before the
next.

1. **Who gets the chance:** box movement, attacking the box, late runs. This
   retires most of the flat scoring bonus on Poacher and Late Runner.
   **Done** — see above.
   *Measured by:* each player's share of his side's goals, against the real
   scorers ([FBref](https://fbref.com), which `sim:spread` already compares);
   a controlled duel for each ability; league calibration unchanged.
2. **Running:** runs in behind and channel runs. *Measured by:* the mix of
   chance types against the real one ([simulation.md](simulation.md)); the
   space-in-behind rule re-measured, because the break phase changes; a duel
   against a high line and a deep one. **Done** — see above.
3. **Width:** holding width, overlapping, inverting. *Measured by:* the share of
   chances that are crosses, and assists by full-backs and wingers against
   FBref. **Done** — see above.
4. **Between the lines:** dropping deep and showing for the ball. *Measured
   by:* possession share by style, and how often a press wins the ball.
   **Done** — see above.
5. **Shape:** positional discipline and stepping out. *Measured by:* goals
   conceded on the counter, and back-three sides against back-four sides with
   the same players.

## Open questions

- ~~The two new traits.~~ Decided: both added.
- **How much of the flat scoring bonus to retire in step 1.** The aim is all of
  the part that means "gets on the end of things". The rest — a striker who is
  simply a better finisher — waits for the finishing ability in the shooting
  family.
