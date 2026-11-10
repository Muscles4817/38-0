# Abilities — the specification

This is the target design for what a player can be good or bad at, and what
each of those things does in a match. It is a specification, not a description
of the code as it stands: the **Status** line on each ability says how far the
engine is from it today. [roles.md](roles.md) describes what exists now.

Read this before adding a trait, changing what a trait means, or making the
match engine read anything new about a player.

## Words used here

- **Trait** — a label a player carries in the editor: *Inside Forward*,
  *Dribbler*, *ShotStopper*. A trait is what a person picks. The match engine
  never reads a trait's name.
- **Ability** — one thing a player is good or bad at, with one meaning:
  *dribbling*, *channel runs*, *stamina*. The code calls these "qualities".
  The match engine reads abilities, and only abilities.
- **Recipe** — what a trait is made of: a list of abilities, each with a
  strength. *Dribbler* is dribbling +3. *Ball Carrier* is carrying +3 and
  press resistance +2.
- **Moment** — a point in a possession where the match makes a decision: can
  the side play out of the press, does the attack become a chance, who ends up
  shooting, does the keeper save it. Every ability is read by at least one
  moment.

So: a person tags a player with traits; each trait's recipe gives him
abilities; each moment of a match reads the abilities it cares about.

## The rules

1. **One meaning per ability.** If an ability is being used for two different
   things, it is two abilities. Today *creation* means both the pass that
   breaks the lines and the final ball, and *setPiece* means both open-play
   crossing and corners; both get split.
2. **Every ability is a signed scale from −3 to +3.** 0 means "what you would
   expect from his rating", not "has none of it". +1 notable, +2 strong, +3
   defining; −1 to −3 the same going down. A negative is a real, specific
   weakness — an ill-composed finisher, a centre-half who cannot defend wide —
   and it is what makes tagging a player a cost as well as a bonus.
3. **Skill or gift.** A skill (passing, finishing, tackling) improves with the
   rating: a 90-rated centre-back passes decently with no trait saying so. A
   gift (pace, height, stamina) does not: a 90-rated striker is not fast
   because he is 90-rated. Each ability is declared as one or the other.
4. **Nothing decorative.** An ability no moment reads does not exist. A test
   fails if one is declared and unread.
5. **A trait is only a recipe.** No match code mentions a trait. To make a trait
   do something, give its recipe an ability; to make an ability do something,
   make a moment read it.
6. **Opposites are one ability, not two.** *Holds his position* and *roams* are
   the two ends of positional discipline, not two separate things. The negative
   end does the opposite of the positive end, with a cost of its own.
7. **Abilities interact.** Some exist mainly as a counter to another: man
   marking against box movement, gamesmanship against temperament. Those
   pairings are listed with each ability and in
   [Counters](#counters-and-interactions).

## The moments of a possession

| Moment | What is decided | In the engine today |
| --- | --- | --- |
| Build-up | can the side keep the ball and play out against a press | yes (`build`, `press`) |
| Progression | does it get from its own half to the final third | partly, inside the attack/defence zone ratings |
| Chance creation | does the attack become a chance, and of what kind | yes (shot rate, `create`, chance type) |
| Transition | a counter-attack after winning the ball | yes (`break`, `cover`) |
| Who gets the chance | which player ends up shooting | yes (shooter selection, by role) |
| The shot | how good the chance is | yes (chance quality, finishing by rating and role) |
| The keeper | does he keep it out, or stop it becoming a shot | yes (all four keeper abilities) |
| Defending | the press, the block, the duel, covering behind | yes (`press`, `block`, `cover`, defensive credit) |
| Set pieces | delivery and the contest in the box | yes (`delivery`, aerial phases) |
| Over the match | what changes as the 90 minutes go on | only score effects; no fatigue |
| Over the season | what changes across 38 games | nothing |
| Temperament | fouls, cards, losing your head | fouls and cards only |

---

## Movement (off the ball)

Movement is what a player does when he does not have the ball. In a match it
decides three things: **who joins an attack**, **what kind of chance the
attack produces**, and **who is on the end of it**. Some movement also has a
defensive cost, because a man who has gone forward is not back.

### Showing for the ball
- **+** Always available. Finds the pocket, angles his body, makes the
  short pass on, so the side never has to force it. Busquets, Xavi, the
  deep-lying playmaker. The reason the best possession sides keep the ball is
  this, more than passing quality.
- **−** Hides. Stands behind a marker; the man on the ball has nobody to
  give it to.
- **Does:** build-up. Keeping the ball against a press, and possession share.
  A side full of it beats a press without needing anyone to dribble out.
- **Status:** new. Today press resistance does this job alone.

### Runs in behind
- **+** Plays on the last defender's shoulder and goes beyond him.
- **−** Wants it to feet, never threatens the space.
- **Does:** chance creation and transition. More balls over the top and
  through balls, worth most against a high line. Pace makes the run more
  dangerous, but it is a separate ability: a slow striker can still time a run.
- **Counter:** a high line's recovery and a sweeping keeper.
- **Status:** new. Today only pace stands in for it.

### Channel runs
- **+** Moves from wide into the gap between full-back and centre-back. The
  Inside Forward, who may or may not be a good dribbler.
- **Does:** chance creation. Turns an attack down the flank into a through ball
  or a shot from the inside channel rather than a cross.
- **Status:** new. Today *Inside Forward* is wrongly made of dribbling.

### Box movement
- **+** In the right place in the box: loses his marker, attacks the near post,
  reads where the cut-back will go. The Poacher.
- **−** Drifts out of the box; is never where the ball arrives.
- **Does:** who gets the chance. It does not create chances; it decides who is
  on the end of crosses, cut-backs and loose balls.
- **Counter:** man marking.
- **Status:** new. Today it is the Poacher's flat scoring bonus.

### Attacking the box
- **+** Commits to the box whenever the ball goes wide, from whatever position
  he is in. Fellaini: not a striker, but always there when the cross comes in.
  The target man who stays central and arrives.
- **−** Stays out. Will not commit numbers to a cross.
- **Does:** chance creation and who gets the chance. More bodies on a cross
  make crosses and headers more dangerous and draw a non-striker onto them.
- **Status:** new.

### Late runs from midfield
- **+** Arrives after the first wave, unmarked, for the cut-back or second
  ball. Lampard, the late runner, the box-to-box midfielder.
- **Does:** who gets the chance. Midfielders onto cut-backs and loose balls.
  Hard to track, so weak against nothing in particular, but it leaves midfield
  short if the attack breaks down.
- **Status:** new. Today *Late Runner* is made of long shooting.

### Dropping deep
- **+** A forward who comes short between the lines. The false nine, the
  deep-lying forward, the trequartista.
- **Does:** build-up and chance creation: an extra man in midfield, and it
  drags a centre-back out of the line, which opens space for runs in behind.
  The cost: fewer bodies in the box.
- **Status:** new.

### Holding width
- **+** Stays wide, touchline to touchline, to stretch the defence. The
  traditional winger.
- **−** Drifts inside; the side is narrow.
- **Does:** chance creation. More crosses, and a deep block finds it harder to
  stay compact. Pairs with switching play.
- **Status:** new. Today the flank logic infers width from position only.

### Overlapping
- **+** A full-back who goes outside or beyond the wide man. The attacking
  full-back.
- **Does:** chance creation and the flanks: he is the width when there is no
  winger ahead of him. The cost: space behind him for a counter.
- **Status:** new. Today *Attacking Full-back* has no abilities at all.

### Inverting
- **+** A full-back who moves into midfield when his side has the ball. The
  inverted wing-back.
- **Does:** build-up and defending in transition: an extra man to keep the ball
  and to stop counters through the middle. The cost: no width from him.
- **Status:** new.

### Positional discipline
- **+** Holds his position, always. The defensive midfielder who screens and
  never goes walkabout; the side's shape stays intact.
- **−** Roams. Leaves his post to get on the ball, which can create something
  and leaves a gap behind him.
- **Does:** defending (the block, protection in transition) against chance
  creation (a roamer finds pockets nobody else does).
- **Status:** new.

### Stepping out
- **+** A centre-back comfortable defending wide and stepping into midfield.
  Suits a back three, where the outside centre-backs have to.
- **−** Stays central. Needs a proper full-back outside him; in a back three he
  leaves the channel open.
- **Does:** defending, and how well a centre-back fits the formation. The match
  should punish a back three of men who will not step out.
- **Status:** new.

## On the ball

### Press resistance
- **+** Keeps the ball under pressure; turns out of trouble.
- **−** Panics; gives it away when pressed.
- **Does:** build-up against a press.
- **Status:** exists.

### Line-breaking passing
- **+** Passes through the lines to move the ball up the pitch. The regista,
  the ball-playing defender.
- **−** Limited range: only the safe, short, square pass.
- **Does:** progression.
- **Status:** new. Today it is folded into *creation*.

### Switching play
- **+** The long diagonal from one flank to the other.
- **Does:** build-up against a press (it escapes to where the press is not) and
  chance creation against a narrow block (it moves the ball faster than the
  block can shift, opening the far side). Most valuable with someone holding
  width on the far side.
- **Status:** new.

### Final ball
- **+** The pass that makes the chance; picks a deep block apart.
- **−** Wasteful in the final third.
- **Does:** chance creation, mainly against a block, and who gets the assist.
- **Status:** exists as *creation*, to be narrowed to this.

### Carrying
- **+** Drives through the lines with the ball: running into space, not
  beating a man in a tight space. The ball-carrying midfielder.
- **Does:** progression, and beating a press by running through it.
- **Status:** new. Today *Ball Carrier* is press resistance and dribbling.

### Dribbling
- **+** Beats a man one on one in tight spaces. The dribbler, the inverted
  winger, who by definition has to be one.
- **−** Cannot go past anyone; heavy touch.
- **Does:** chance creation (solo efforts) and fouls won. Multiplied by agility
  and balance.
- **Counter:** a defender's tackling and agility.
- **Status:** exists, but today it only draws a player into counter-attacks.

### Crossing
- **+** Open-play delivery from wide.
- **−** Cannot find a man.
- **Does:** chance creation from crosses.
- **Status:** new. Today it is lumped in with dead balls as *setPiece*.

### Dead-ball delivery
- **+** Corners and free kicks swung in.
- **Does:** set pieces.
- **Status:** exists as *setPiece*, to be narrowed to this.

## Shooting

### Finishing
- **+** Converts chances in the box: placement and composure in front of goal.
- **−** Snatches at it.
- **Does:** the shot, for chances inside the box.
- **Status:** new. Today it is the old flat scoring bonus.

### Long shots
- **+** Shoots from distance, and hits the target.
- **−** Never tries it, or should not.
- **Does:** who takes the long shots and how good they are.
- **Status:** the ability *longShot* exists and the *Long Shot* trait gives it,
  but **nothing in the match reads it**. Who shoots from range is decided by
  the older role affinity table and goal multiplier.

### Shot power
- **+** Hits it hard enough to beat a keeper who gets a hand to it.
- **Does:** the shot and the keeper: power reduces how much a keeper's
  shot-stopping saves, most from distance and from direct free kicks. Separate
  from finishing (placement in the box) and from long shots (willingness and
  accuracy from range), though it combines with both.
- **Status:** new.

### Penalties
- **+** Takes them and scores. **−** Misses them.
- **Does:** who takes a penalty and how often it goes in.
- **Status:** exists.

## Physical

### Pace
- **+** Genuine top speed. **−** Slow.
- **Does:** transition (runs in behind are more dangerous, counter-attacks
  faster) and recovering back to cover. A gift: not improved by rating.
- **Status:** exists.

### Agility
- **+** Changes direction instantly. **−** Turns like a lorry.
- **Does:** a multiplier on one-on-ones in both directions. An agile attacker
  wins more of his dribbles; an agile defender is turned less often. A slow,
  stiff centre-back is exposed by a dribbler even if he is quick in a straight
  line.
- **Status:** new.

### Balance
- **+** Rides a challenge and stays on his feet. Messi, not because he is
  strong.
- **Does:** a multiplier on dribbling and carrying for the man with the ball.
  It is how a small attacker survives contact. Strength is a different thing.
- **Status:** new.

### Strength
- **+** Holds the ball up, shields it, wins shoulder-to-shoulder duels.
  **−** Knocked off it.
- **Does:** hold-up play (keeping the ball as an outlet under a long ball) and
  physical duels in defence. The target man is strength and aerial.
- **Status:** new.

### Aerial
- **+** Wins the ball in the air, at both ends. **−** Loses headers.
- **Does:** crosses, headers and set pieces, attacking and defending.
- **Status:** exists.

### Work rate
- **+** Covers ground; joins the press and tracks back without being asked.
  **−** Walks.
- **Does:** how much of the press and the block a player takes part in.
- **Status:** new as its own ability. Today *pressing* doubles as work rate.

### Stamina
- **+** Lasts ninety minutes at full intensity, and a season of them.
- **−** Fades.
- **Does:** over the match and over the season. High-intensity football — the
  press, the counter-press, a high line — works, but it costs. A side's
  intensity drains its stamina; as the match goes on, a side whose stamina has
  gone presses less, covers less and concedes more late goals. Over a season,
  the same thing across congested fixtures. Stamina is what lets a side play
  that way without collapsing late.
- **Needs:** in-match fatigue, which the engine does not model (it tracks the
  match clock only for score effects). Season fatigue would also need squad
  rotation, which the game does not have: you pick an XI, not a squad. Until
  then, season stamina can only act as a drift in performance over the 38
  games.
- **Status:** new, and needs engine support first.

## Defending

### Pressing
- **+** Wins the ball back high, quickly and in a group.
- **Does:** the press and turnovers high up the pitch.
- **Status:** exists.

### Tackling
- **+** Wins duels and breaks up play. The ball winner.
- **−** Dives in, misses, gets turned.
- **Does:** defending in midfield and the duel against a dribbler or a carrier.
- **Status:** new. The engine already reads an empty *defending* slot in the
  block; this replaces it.

### Reading the game
- **+** Positioning and anticipation: intercepts the pass before it reaches the
  runner, is already where the attack is going.
- **−** Ball-watches.
- **Does:** stops chances before they become chances, against through balls and
  runs in behind in particular.
- **Status:** new.

### Box defending
- **+** Defends inside his own box: attacks the cross, blocks shots, clears the
  cut-back.
- **Does:** chances in the box: crosses, cut-backs, scrambles. Separate from
  aerial (height) and from tackling (out in the field).
- **Status:** new.

### Man marking
- **+** Tracks a runner wherever he goes.
- **−** Loses his man.
- **Does:** the counter to box movement, late runs and attacking the box. A
  side that marks well blunts the player who lives off his movement.
- **Status:** new.

### Recovery
- **+** Gets back to cover the space behind the defence.
- **Does:** transition and the high line's cover.
- **Status:** exists. On keepers it currently also does sweeping; that moves to
  its own ability below.

### Tracking back
- **+** A forward or winger who defends properly, not just runs back. Part of
  parking the bus.
- **−** Does not come back.
- **Does:** how much a forward contributes to the deep block, and to stopping
  the full-back behind him.
- **Status:** new. Today only pressing (as work rate) draws an attacker into
  the block.

## Goalkeeping

### Shot-stopping
- Positioning and handling: shots he sees coming, most from distance.
- **Status:** exists. See `SHOT_STOPPING_REACH`.

### Reflexes
- Reactions: the save from close range.
- **Status:** exists. See `REFLEXES_REACH`.

### Sweeping
- Coming off his line to get to the ball played in behind a high line.
- **Status:** works today, but through the keeper's *recovery*. To become its own
  ability.

### Claiming
- **+** Comes for crosses and takes them. **−** Flaps, and turns crosses into
  better chances.
- **Status:** exists. See `CLAIM_PER_POINT`.

### Distribution
- **+** Plays out from the back; starts attacks. **−** Cannot be trusted with
  the ball at his feet.
- **Does:** build-up.
- **Status:** works today, but through the keeper's *press resistance*. To
  become its own ability.

## Mental

### Composure
- **+** Laser-focused: ice-cold in front of goal and under pressure.
- **−** Ill-composed: rushes the chance, panics on the ball.
- **Does:** a multiplier on finishing and on press resistance, strongest when it
  matters most (a close game, late on).
- **Status:** new.

### Concentration
- **+** Switches on for ninety minutes.
- **−** Switches off: the lapse that lets a runner go, the error late on.
- **Does:** defending over the match: late goals conceded, individual errors.
- **Status:** new.

### Temperament
- **+** Unflappable; cannot be provoked.
- **−** Hot-headed: reacts, loses his head, gets sent off.
- **Does:** fouls and cards, and how much a provocation costs him.
- **Counter:** gamesmanship.
- **Status:** partly exists as *discipline*, which covers fouling; this is the
  mental side of it.

### Nerve
- **+** Brave: plays his game against anyone, wants the ball when it matters.
- **−** Meek: shrinks against stronger sides and in big matches.
- **Does:** how much a player's level holds up against a stronger opponent and
  when chasing a result.
- **Status:** new.

### Gamesmanship
- **+** The shithouse. Winds opponents up, wins fouls, wastes time when ahead,
  gets in the referee's ear.
- **Does:** preys on temperament. Against a hot-headed opponent it raises his
  fouls and cards and drags his level down. Also slows a game his side is
  winning. Of no use against a side with no temper to exploit.
- **Status:** new.

### Leadership
- **+** Organises the side: it is more drilled and steadier.
- **Does:** cohesion, which already decides how dependable a side is week to
  week.
- **Status:** new.

### Discipline
- **+** Stays on his feet. **−** Fouls and collects cards.
- **Does:** fouls and cards.
- **Status:** exists.

---

## Counters and interactions

An ability that only ever helps is a bonus. Most of the interesting ones are
interesting because something beats them.

| This | is countered by |
| --- | --- |
| Runs in behind | a defence's recovery and pace, a sweeping keeper, a deep line |
| Box movement, attacking the box, late runs | man marking, box defending |
| Dribbling | tackling, agility in the defender |
| A press | showing for the ball, press resistance, switching play, carrying |
| A narrow deep block | holding width, switching play, final ball, long shots |
| High intensity (press, high line) | its own stamina, as the match goes on |
| Temperament | gamesmanship |
| Overlapping | the space it leaves, for a side that counters |
| A back three | centre-backs who will not step out |

## Doing it

1. **Agree this document.** It is a draft until the owner of the game has been
   through it.
2. **Restructure without changing behaviour.** One list of abilities in code,
   each with its meaning, its scale and whether it is a skill or a gift; every
   moment declares which abilities it reads; a test fails on any ability no
   moment reads. Season results must come out identical, and the keeper
   abilities already built move into this structure unchanged.
3. **One family at a time.** Movement, on the ball, shooting, physical,
   defending, mental. Each family is designed as a whole, measured the way the
   goalkeeping abilities were (a controlled duel, then paired-seed leagues),
   and recorded in [roles.md](roles.md).
4. **Rewrite every trait's recipe** against the final list in one pass, with
   each recipe shown for review. Recipes live in `src/lib/db.ts` and reach the
   game through `npm run export:data`.
5. **Retire the old route.** Once finishing, box movement and long shots are
   read from abilities, the flat goal and assist multipliers on traits stop
   deciding who scores.

## Open questions

- **Stamina needs engine support first.** That means in-match fatigue, and
  something for a season with no rotation. Is in-match fatigue alone worth
  building first?
- **Which abilities should the editor show by name?** A person tags traits;
  abilities could stay underneath, or the editor could let a player carry an
  ability directly (Fellaini: attacking the box +3, aerial +2) when no trait
  fits.
- **How many abilities can one trait carry?** Inverted winger is dribbling and
  channel runs, plus a cut-inside preference; whether that preference is an
  ability or a property of the position is undecided.
