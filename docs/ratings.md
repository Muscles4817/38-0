# Rating players

Every rating in this project is on **one absolute scale**. A 78 means the same
thing in 1994 as in 2025. What differs between eras is not the meaning of the
number but **how many players fall where**.

This document is the reference for anyone — person or agent — adding squad data.
Read it fully before rating anybody.

## The core idea: the floor moved, the ceiling did not

The Premier League's talent is far more concentrated than it was. A lower-table
side today fields players who would have started comfortably for a mid-table
club in 1996. The best players of each era, however, are much closer together:
peak Shearer, peak Henry and peak Haaland are all genuinely elite footballers.

So:

- **Do not flatten eras.** A 2025 lower-table centre-back is a better footballer
  than a 1995 lower-table centre-back, and should rate higher.
- **Do not deflate the greats.** The top of 1995 was still world class. A weaker
  supporting cast does not make a great player mediocre.

The result is that older squads have a longer tail of ordinary players while
still producing genuine stars. That is realistic, and it makes the era choice in
the draft a real risk/reward decision rather than a wasted spin.

## The bands

| Rating | Meaning |
| --- | --- |
| **95–99** | All-time great for the position. Among the best to ever play there. Vanishingly rare — expect a handful across the entire database, not per season. |
| **90–94** | World class. In the conversation for best in the world in their position that season. |
| **85–89** | Elite. A clear starter for a title-challenging side; established international. |
| **80–84** | Good. Solid starter for a side chasing Europe. |
| **75–79** | Average modern Premier League starter. A regular for a lower-table club today. |
| **70–74** | Below modern Premier League standard. Squad filler today; a regular starter for a mid or lower-table side in the 1990s. |
| **65–69** | Well below modern standard. A common starter in the 1990s lower half; would not play today. |
| **60–64** | Fringe or lower-division quality. Use sparingly. |

Below 60 is effectively unused. The scale allows down to 40 so that nothing has
to be clamped, but a top-flight player who genuinely belongs there is rare
enough that a rating under 60 should carry a note.

## Never rate a player relative to their teammates

A player's rating depends on the player, not the company they keep. If a squad
contains seven players who were genuinely world class, it gets seven ratings in
the 90s. Peak Manchester City fielded Aguero, De Bruyne, David Silva, Kompany,
Fernandinho, Bernardo Silva and Walker at the same time; the 2003/04 Arsenal
side was similarly stacked. Both are correct as they stand.

There is no quota, no cap, and no expected average. Nothing in the validation
enforces a distribution, and nothing should.

The table below is **descriptive** — what squads of a given calibre have
typically looked like — and is there to help you notice that you have drifted
off the absolute scale. It is not a target to hit, and a squad that departs
from it because the players really were that good is right, not wrong.

## What squads have typically looked like

| Squad | Typical range | Best player |
| --- | --- | --- |
| 2025 title winner | 80–92 | 92–95 |
| 2025 mid-table | 76–84 | 85–87 |
| 2025 relegation | 73–80 | 81–84 |
| 2005 title winner | 78–92 | 92–95 |
| 2005 mid-table | 72–81 | 83–85 |
| 1995 title winner | 75–90 | 90–93 |
| 1995 mid-table | 68–78 | 80–84 |
| 1995 relegation | 64–74 | 76–79 |

Use these to catch drift, not to force a shape. If a 1996 relegation side comes
out with five players in the 80s, that is worth re-checking against the anchors
— but if the players really were that good, leave them there. If a 2025
mid-table side has half its XI in the 60s, you have almost certainly slipped
into rating them against their own era instead of the absolute scale.

## How to decide a number

**Rate the player's ability in that specific season.** Not their career, not
their peak, not their reputation.

1. **Ability, not output.** Goals and assists are evidence, not the verdict. A
   striker scoring 25 in a weak league against weak defences is not automatically
   world class. A defender with no statistics may be excellent.
2. **Ability, not narrative.** Longevity, trophies, folklore and pundit
   affection are not ability. A player remembered fondly for a decade of service
   is not thereby elite.
3. **Ability, not transfer fee.** Price reflects market, age and hype.
4. **That season, not their peak.** A 34-year-old great in decline rates lower
   than they did at 27. A 19-year-old who became world class later rates as the
   player they were then.
5. **Compare to the band definitions, not to teammates.** Do not rate someone
   85 because they were "their team's best player" if that team was relegated.

### The output trap, worked

Alan Shearer, 1995/96: 31 league goals, dominant in the air, elite finishing,
genuine physical presence. But the league he did it in was weaker, and his
all-round profile is not that of a modern complete forward.

- 95+ would say he is an all-time great striker in absolute terms. Too high.
- 85 would say he is merely a good top-four starter. Too low.
- **91** — world class, clearly, without conflating his longevity and goal
  record with an all-time ceiling.

That reasoning pattern is what to apply everywhere.

### The bottom of the scale, worked

Most ratings live between 66 and 78, so that is where drift does the most
damage — and where "he was a decent player" is least useful as a guide. What
separates a 68 from a 74?

**68 — David Linighan, Ipswich, 1993/94.** An honest centre-half, an
ever-present for a struggling side, competent in the air and organised. Nothing
about his game is above the standard of the division's lower half. Put him in a
2025 squad and he is not in the eighteen.

**74 — Kevin Davies, Bolton, 2009/10.** Also a lower-half regular, also nobody's
idea of elite. But there is a genuine top-flight skill there — the physical hold
and aerial dominance that got him an England cap. He would be a squad player in
a modern side rather than absent from it.

The line is roughly: **could this player be in a modern Premier League squad at
all?** A 74 could, as a rotation option. A 68 could not; he was a starter only
because the 1990s floor was lower. A 71 is the honest middle — a solid starter
for a mid-table side of his era with one usable top-flight attribute.

Do not let "he played 38 games" push someone up. Being an ever-present for a bad
side is evidence about the side, not the player.

## Anchors

Every anchor below names a real player-season that is **already rated in
`data/raw/ratings/`**, and quotes the number actually recorded there. That is
not decoration. An anchor that disagrees with the data is worse than no anchor
at all, because every agent calibrates to it: two of these were wrong for a
while — Gunn quoted at 76 against a recorded 73, and Flowers attributed to a
season that had never been rated — and mid-tier goalkeepers were being pulled
up three points by it. `ratingsAnchors.test.ts` now checks them.

Calibrate against these. If your number for a comparable player is far from the
nearest anchor, re-check it.

### Forwards
| Player, season | Rating | Why |
| --- | --- | --- |
| Thierry Henry, 2003/04 | 97 | All-time great; pace, finishing and creation combined |
| Alan Shearer, 1995/96 | 91 | World class finisher, weaker league, less complete profile |
| Ruud van Nistelrooy, 2002/03 | 90 | Elite penalty-box finisher, narrower game |
| Andy Cole, 1993/94 | 86 | Elite output, less complete than the tier above |
| Kevin Davies, 2009/10 | 74 | Effective, physical, plainly below modern PL starter standard |

### Midfielders
| Player, season | Rating | Why |
| --- | --- | --- |
| Kevin De Bruyne, 2019/20 | 95 | All-time great creator at peak |
| Roy Keane, 1999/00 | 91 | World class driving midfielder |
| Frank Lampard, 2004/05 | 90 | World class, goals from midfield |
| Gareth Barry, 2006/07 | 81 | Good, dependable, not elite |
| Lee Bowyer, 1996/97 | 72 | Regular 90s starter, below modern standard |

### Defenders and goalkeepers
| Player, season | Rating | Why |
| --- | --- | --- |
| Virgil van Dijk, 2018/19 | 96 | All-time great centre-back season |
| Rio Ferdinand, 2007/08 | 91 | World class |
| Tony Adams, 1997/98 | 88 | Elite leader and defender, era-appropriate |
| Peter Schmeichel, 1995/96 | 93 | World class goalkeeper, at his peak |
| David Seaman, 1993/94 | 86 | Elite, England's first choice, a rung below the very best |
| Tim Flowers, 1993/94 | 81 | Good; the keeper Blackburn bought to win a title, not himself elite |
| Bryan Gunn, 1993/94 | 73 | A dependable ever-present for a mid-table side |
| Steve Ogrizovic, 1993/94 | 72 | Long-serving lower-half keeper; below modern standard |
| Gary Pallister, 1993/94 | 84 | Good, occasionally elite |
| Colin Hendry, 1994/95 | 79 | Solid title-winning starter, absolutely ordinary |

## Players who never played in England

The bands are written in Premier League terms because that is where most of the
data is, but the scale is absolute, not English. A Serie A defender is rated
against the band definitions, not against Serie A.

Two things follow, and both are easy to get wrong:

- **Do not translate.** There is no Serie A discount and no La Liga bonus.
  Koulibaly in 2015/16 was an elite centre-back by the definition of the band,
  so he is 84, and nothing about the league he did it in changes that.
- **A player who appears in both is one player.** Ibrahimović is 88 at Inter in
  2006/07 and 87 at Barcelona in 2009/10; Cafú is 88 for Brazil in 2002 and 87
  at Milan in 2006/07. If a rating goes *up* as a player passes thirty, that is
  a mistake — check it against his other rows before writing it. Cafú was
  briefly rated 86 at his peak and 87 at thirty-six, which is how this rule got
  written down.

The whole database is one scale, so cross-check anyone who already exists in it
before rating them again.

## Positions are already decided

Positions are assigned in a separate, earlier pass — see
[positions-lookup.md](positions-lookup.md). They arrive pre-filled in the
rating files and are **not** for the rating pass to change.

They are there as context: a rating is easier to judge when you can see whether
the player was a holding midfielder or a number ten. Use them, do not edit them.

For reference, the fifteen the game knows are
`GK LB CB RB LWB RWB CDM CM CAM LM RM LW RW ST CF`, and a player may cover an
adjacent one at a small penalty.

## A player who moved mid-season

A rating is a property of the **player in that season**, not of the club. Eric
Cantona was the same footballer in November at Leeds and in December at
Manchester United. So when a player has two club rows for one season, **give
both rows the same rating**, unless something genuinely changed — an injury, a
sudden loss of form — in which case say so in `note`.

The rating files carry both rows because the appearance data does. Which club
the player ends up attached to in the game is decided at import: the one he
played more for. That is a separate concern and not something to resolve by
rating him differently at each.

This matters for the simulation, where a player appearing in two clubs' XIs
would be scoring against himself and appearing twice on the same leaderboard.

## Roles

A role is a claim about **how** a player played, not a bonus to hand out. They
carry real weight — the multipliers reach 2.2x for goals and higher for aerial
threat — so they change who scores in a simulated season.

- Set one only where the fit is obvious. A player who straddles two roles gets
  neither; omitting is always safe.
- Keep a player's role consistent across their seasons unless their game
  genuinely changed.
- Valid names live in the database, exposed in `src/data/game-data.json` under
  `roles`. Do not invent one.

Roughly half of players having no role at all is a healthy outcome, not a gap.

## Who to include

Anyone who made **three or more league appearances** for that club that season.
Record the appearance count; the importer enforces the threshold.

Prefer completeness over neatness: a squad of 22 with three fringe players at 68
is more useful than a tidy 16.
