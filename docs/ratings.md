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

Below 60 should be rare enough to need a reason.

## Expected shape of a squad

Use these as a sanity check after rating a squad. They are guides, not quotas.

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

If a 1996 relegation side comes out with five players in the 80s, it is wrong.
If a 2025 mid-table side has half its XI in the 60s, it is also wrong.

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

## Anchors

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
| Peter Schmeichel, 1995/96 | 93 | World class goalkeeper |
| Gary Pallister, 1993/94 | 84 | Good, occasionally elite |
| Colin Hendry, 1994/95 | 79 | Solid title-winning starter, absolutely ordinary |

## Positions

Positions are matched **literally** by `canFillSlot` — an `LB` cannot fill an
`LWB` slot. Sloppy positions silently break drafting.

- Use only: `GK LB CB RB LWB RWB CDM CM CAM LM RM LW RW ST CF`.
- List the positions the player **actually played that season**, most natural
  first. Two or three is normal; more than four means you are guessing.
- A player who filled in once at right-back is not an `RB`.

## One club per season

A player belongs to exactly **one** club-season: the club they made the most
league appearances for that season. A January transfer goes to whichever side
they played more for, with the other noted in `note`.

This keeps the simulation honest — a player appearing in two clubs' XIs would
be scoring against himself and appearing twice on the same leaderboard.

## Who to include

Anyone who made **three or more league appearances** for that club that season.
Record the appearance count; the importer enforces the threshold.

Prefer completeness over neatness: a squad of 22 with three fringe players at 68
is more useful than a tidy 16.
