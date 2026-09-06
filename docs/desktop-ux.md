# Desktop and tablet

The phone layout has had a careful pass and is good. Nothing above 640px had
one. This document says what a big screen is *for* in a game like this, names
what was wrong, and records what was done about it.

The principles are the durable part — apply them to a screen that does not
exist yet. The problems below are kept because the measurements are the
argument, and because knowing why a layout is the shape it is stops the next
change undoing it.

Read [conventions.md](conventions.md) first. Its Mobile section is not a phone
section — every rule in it (nothing scrolls sideways, every control ≥32px, keep
the acted-on thing in view, fold away what is not actionable, nothing inert may
look interactive) is true at 1920 as well, and two of the problems below are
cases of a desktop breakpoint quietly switching one of those rules off.

## Where it stands

Measured from full-page screenshots at each viewport, before the work and
after it. At 1440×900:

| Screen | Width unused | Screens of scroll |
| --- | ---: | ---: |
| Setup | 60% → **11%** | 2.5 → **1.8** |
| Draft | 22% → 22% | 1.6 → 1.7 |
| Pre-season | 47% → **20%** | 2.7 → **2.3** |
| Results, live | 29% → **20%** | 2.0 → **1.4** |
| Results, final | 29% → **20%** | 4.6 → **3.2** |
| Classic | 53% → **20%** | 13.1 → **1.4** |

Before the work, at 1920 the unused figures were 70%, 17%, 60%, 47%, 47% and
65%. Nothing overflowed sideways at any width, which was worth saying: the
phone discipline held. What did not hold was everything else.

Two of the targets set out below were not reached. The pre-season screen is
2.3 screens against a target of 1.5, and the final report 3.2 against 2.5 —
both roughly halved, neither at target. Getting further would mean cutting
content rather than laying it out better, which is a separate decision.

The phone is unchanged in behaviour and measured clean at 360 and 390: no
horizontal scroll on any screen, no control under 32px. One genuine phone bug
turned up while checking and was fixed — the final report overflowed sideways
by 57px at 360px, because the fourteen-column league table and the six-column
squad-stat rows had no width to give.

## What a big screen is for

### 1. Width buys fewer scrolls, not bigger things

A phone is a column and a desktop is a page. The value of the extra 800px is
that things which were stacked can sit beside each other, so the player scrolls
less and sees more of one decision at once. It is not that the type gets
bigger, the pitch gets bigger, or the reading column gets wider.

A line of body text stops being readable somewhere past 75 characters, and a
list row stops being readable long before that — at 1024px wide, a row with a
name on the left and a rating on the right is two facts separated by 800px of
nothing, and the eye has to travel the gap to pair them. The pre-season XI list
already does this. Widening a column is the one thing a desktop pass must not
do by default.

**In practice:** a column that reads well at 640px still reads well at 1920.
Give the leftover width to a *second* column, or give it back as margin.

### 2. Width is for adjacency, and only between things that answer each other

Two columns are only worth having when the right one changes because of the
left one, or explains it. Tactic and the effect of that tactic. The season and
who is in it. The live match and the table it moves you up. Formation tiles and
the pitch they draw.

Two unrelated blocks side by side are worse than stacked: the player now has
two places to look and no reason to look at either first.

**In practice:** before splitting a screen, name the question the second column
answers. If there isn't one, don't split it.

### 3. The primary action stays reachable at every width

Setup and pre-season both pin their primary button to the bottom of the phone
viewport and then release it at `sm:` — `sticky bottom-0 … sm:static`. The
comments say why it is pinned ("every setting here has a sensible default, so
the primary action should not be several screens of scrolling away") and that
reasoning does not stop being true at 640px. It gets worse: at 1440 the setup
page is 2,291px tall and Start Draft sits about 2,000px down it, past six
sections of optional settings, on a screen with 864 empty pixels either side of
the column.

**In practice:** the reason to unpin a button is that the page fits on one
screen, not that the window is wide. If the page still scrolls, the button
still pins — or it moves into a column that does not scroll.

### 4. The eye follows what is changing

The conventions already state this ("order content by what is changing") and
the results page already implements it — then reverses it at `lg:`. During the
live season the squad header is `order-2 lg:order-1` and the match panel is
`order-1 lg:order-2`, so above 1024px the 610px-tall squad list goes back on
top and the scoreline lands about 880px down the page: at the bottom edge of a
1440×900 window, and below it once browser chrome is counted. The player starts
a simulation and watches a progress bar.

This is the clearest case in the codebase of a desktop breakpoint undoing a
mobile fix for no reason. Extra width was never the problem the ordering solved.

**In practice:** ordering is decided by what is happening, not by viewport.
Where desktop differs it should be *because* two things can now be side by side
— not because one of them can be pushed off-screen.

### 5. What is fixed stays fixed

`PitchView` sizes its badges in pixels on purpose, so the initials stay legible
when the pitch shrinks. Tap targets are ≥32px because a finger is the same size
on an iPad as on a phone. Body copy is 12–14px because that is a comfortable
reading size, not because the screen was small.

Scaling those up on desktop makes the game look like a website that was
stretched. A pitch can grow *some* when it becomes a genuine focal point (the
pre-season screen is the case), but a 600px pitch with 18px badges is not twice
as informative as a 300px one — it is the same eleven circles, further apart.

**In practice:** at a new breakpoint, change what is *beside* what. Change sizes
only where you can say what extra information the extra pixels carry.

### 6. Density is set by viewing distance, not by pixels

A phone is 30cm from the eye; a laptop is 60cm and a desktop monitor further.
The same grey that reads as "quiet" on a phone reads as "absent" across a desk.
Against the `#0a0a0a` ground the palette's greys measure:

| Colour | Contrast on `#0a0a0a` | Verdict |
| --- | ---: | --- |
| `#888` | 5.6:1 | fine |
| `#666` | 3.8:1 | large text only |
| `#555` | 2.7:1 | fails for anything readable |
| `#444` | 2.0:1 | decorative only |
| `#333` | 1.6:1 | invisible |

`#555` currently carries section labels, most helper text and half the numbers
on the pre-season screen. `#333` carries "or tap anywhere to spin" — an
instruction the player is meant to act on.

**In practice:** `#888` is the floor for anything a player has to read;
`#666` for a label they only have to notice. Below that is decoration. This is
a phone improvement too — it is only *more* obvious on a big screen.

### 7. Every breakpoint is somebody's layout

The app has two layouts: below `lg:` and above it. That makes 768–1023px — iPad
portrait, a half-screen browser window, most Surface-class devices — a phone
layout at double width. At 820px the draft page is the phone stack, so the spun
squad starts about 1,000px down an 1,180px-tall viewport: the player spins and
the result lands off-screen, under a pitch and a squad-story panel that are not
what they are being asked to act on. The same width gives the live results page
a full-width league table whose rows are a club name, then 600px of nothing,
then two numbers.

`md:` (768px) exists and this is what it is for. The rule is not "add more
breakpoints"; it is that a layout must be checked at the width where it changes
*and* at the width just below the next change.

**In practice:** check 360, 820 and 1440. If 820 looks like 360 with wider
margins, the middle has not been designed.

### 8. One meaning per colour, per screen

`#00c896` is the game's identity and it is doing too many jobs. On the setup
screen it means "selected" — except where amber means selected (Normal
difficulty, Prime Mode) and purple means selected (ratings Off). Three accent
colours for one state, on one screen, with no rule the player can learn. Green
also means "the primary action" (Start Draft) and "available" (the Premier
League pool badge).

Worse, two rating scales disagree. `ratingColor` in classic mode is amber ≥88,
green ≥83, blue ≥78. The Overall figure on the pre-season and results screens
is green ≥90, blue ≥85, amber ≥80. Amber is the top band in one and the third
band in the other, and both can be on screen within one run.

The pre-season odds bars are a fourth pattern: green / blue / purple / amber for
Win the league / Top 4 / Top 6 / Top 10. That is a single quantity — how good an
outcome is — encoded as four unrelated hues.

**In practice:** on any one screen, green means one thing. A ranked quantity
(rating band, odds ladder) gets one hue at varying intensity, not four hues.
`LineRatings` is the legitimate categorical use — GK/DEF/MID/ATT are four
different things, not four levels of one thing — and should stay as it is.

## How to tell you got it right

The conventions' verification section already gives two measurements to take at
360px. Take these at 1440×900 and 820×1180 as well:

- `document.scrollWidth === window.innerWidth`, still, at every width.
- No control under 32px tall, still.
- **The primary action of a screen is visible without scrolling.** Setup,
  pre-season, and the draft's spin control.
- **The thing that is currently changing is in the top half of the viewport.**
  Live results is the case that fails today.
- **Screens of scroll**, from `measurements.json`. Targets: setup ≤1.5,
  pre-season ≤1.5, live results ≤1.0, final report ≤2.5, classic ≤3 before a
  filter is applied. Draft is already fine at 1.6 and only needs its rail fixed.
- No text below `#666` that the player is expected to read.

## The problems, worst first

### 1. The live season plays out below the fold

*Every screen ≥1024px.*

**What the player gets.** They press Simulate, arrive at `/results`, and see the
XI they have already looked at twice. The gameweek counter is at the bottom of
the window; the scoreline that ticks over every second or two is under it. They
either sit watching a progress bar or scroll down and hold position manually for
thirty-eight gameweeks. At 820px this works correctly, which makes it plainly a
desktop regression rather than a missing feature.

**Why it is wrong.** Principle 4, directly, and it is the game's payoff moment.

**What the fix should achieve.** During the live simulation the gameweek bar,
the match card and the table are the whole screen. The squad the player already
approved is collapsed or below. Width is spent putting the table beside the
match — that is a real adjacency (the score is the reason the table moved), and
it also fixes the 820px table whose rows are mostly gap.

```
  ┌────────────────────────── ≥1024 ───────────────────────────┐
  │ ← Team Talk                                                │
  │ GAMEWEEK 12 / 38            [∎ Pause] [1×] [Skip ⇥]        │
  │ ▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░     │
  │ ┌─────────────── 1fr ───────────────┐ ┌──── 268px ─────┐   │
  │ │  W   Home · Queens Park Rangers   │ │ TABLE      PTS │   │
  │ │            4 — 0                  │ │  1 Your XI  28 │   │
  │ │  Nistelrooy 25' 47' · Henry 54'   │ │  2 Man Utd  26 │   │
  │ └───────────────────────────────────┘ │  3 Spurs    24 │   │
  │ ┌───────────────────────────────────┐ │  …             │   │
  │ │ OTHER RESULTS                     │ │                │   │
  │ └───────────────────────────────────┘ └────────────────┘   │
  │ Playing · Tactic · [Change]                                │
  │ ▸ Your XI — 4-4-2 · 88            (folded while running)   │
  └────────────────────────────────────────────────────────────┘
```

**At phone width:** unchanged. This is the order 820px already has; the two
columns collapse back to one. Folding the squad away while the season runs is
also a phone improvement — it is not actionable during the simulation.

**Effort:** small. The `lg:order-*` reversals come out, and the match/table pair
becomes a two-column grid at `lg:`.

**Done.** The `order-*` juggling is gone entirely — source order is the order,
and the changing thing is first at every width. The table sits beside the match
from `md:` up, not `lg:`, which also fixes the 820px table. The XI is a
`<details>` summary bar under the plan strip. 2.0 screens → 1.4.

### 2. Setup is a 576px ribbon down the middle of an empty screen

*1440: 60% of the width unused, 2.5 screens tall. 1920: 70%.*

**What the player gets.** The first screen of the game, and the one they see on
every run. Twenty-one formation tiles in a 4-wide grid, then a pitch preview
sitting alone in a 1,440px-wide band, then six more settings sections each
formatted identically, then Start Draft about 2,000px down. There is no visual
hierarchy: Formation (the decision that changes the game most) and Challenge
Modes (a folded list of things that do not exist yet) are given the same label
treatment, the same spacing and the same weight. Nothing on the screen says
"you can press Start now" — which is true, because every setting has a default.

**Why it is wrong.** Principles 1 and 3. The column is right; leaving it alone
in the middle of the screen with the primary action two screens down is not.

**What the fix should achieve.** At `lg:` the screen becomes settings on the
left and a fixed panel on the right holding the pitch preview, the formation
name and Start Draft. The pitch stops being a decoration floating in a band and
becomes the live consequence of the tile you just pressed — a real adjacency
(principle 2) and the reason this particular split earns its keep. Start Draft
never leaves the viewport. The settings column stays the width it is now.

```
  ┌───────────────────────────── ≥1024 ──────────────────────────────┐
  │                    38-0                                          │
  │ ┌────────────── 1fr (≈640) ───────────┐ ┌───── ≈340 ─────┐       │
  │ │ FORMATION   21 tiles, 4 across      │ │                │       │
  │ │ “The classic. Balanced, compact.”   │ │   [  pitch  ]  │ stays │
  │ │ DIFFICULTY  3 across                │ │     4-4-2      │  put  │
  │ │ SHOW RATINGS   │   DRAFT MODE       │ │                │       │
  │ │ PLAYER RATINGS │   ERA presets      │ │ ┌────────────┐ │       │
  │ │ ERA sliders + range readout         │ │ │Start Draft→│ │       │
  │ │ ▸ Draft pool   ▸ Challenge modes    │ │ └────────────┘ │       │
  │ └─────────────────────────────────────┘ └────────────────┘       │
  └──────────────────────────────────────────────────────────────────┘
```

Two things beyond the split are worth doing here and are cheap. Pair the
four two-option settings (Show Ratings, Draft Mode, Player Ratings, plus
Difficulty) into two rows rather than four stacked sections — they are all
"how hard / how much do you want told to you", and stacking them four deep is
most of the page height. And decide the accent question from principle 8: one
colour for "selected".

**At phone width:** unchanged, including the sticky Start Draft. The right-hand
panel is the existing pitch block and the existing button, moved by a
breakpoint, not new UI.

**Effort:** medium. Payoff is large because this screen is on the path of every
single run.

**Done.** Settings left, a `sticky top-8` panel right holding the pitch, the
formation name and description, a read-back of the five settings, and Start
Draft. The sticky button below `lg:` no longer releases at `sm:`. Show Ratings
and Player Ratings are paired into one band, and the three accent colours are
one — `OptionCard`'s `accent` prop is gone rather than merely unused. 60% of
the width unused → 11%, 2.5 screens → 1.8.

### 3. Pre-season decides two things and shows neither of their consequences

*768px content in 1440, 47% unused, 2.7 screens tall.*

**What the player gets.** The XI, then fourteen tactic cards in a 3×5 grid, then
the summary of the tactic they chose, then fourteen season tiles, then the
summary of the season they chose, then the pre-season odds, then Simulate — at
the bottom of a 2,418px page, unpinned. Choosing a tactic scrolls its own
summary in and out of view; comparing two tactics means comparing two numbers
the player cannot see at the same time. The XI list, at 768px, is a name on the
left and a rating on the right with a wide gap between them.

**Why it is wrong.** Principles 2 and 3. This screen is *made of* pairs — choice
and consequence, choice and consequence — laid out one after the other so no
pair is ever together.

**What the fix should achieve.** At `lg:` the tactic grid keeps a column and its
summary sits beside it, in view while the player moves through the styles. Same
for the season list and its "19 opponents, average XI 75, these three make way"
card. Simulate stays pinned. Total height should come down to about 1.5 screens.

The pre-season odds panel is a partial exception and worth understanding before
moving it. At the time this was written `preSeasonOdds` was a function of
overall alone: it responded to neither decision on the screen and promised what
the simulation did not deliver. It has since been refitted and now reads the
field, so it does answer the season choice — but still not the tactic, which is
worth a few rating points the odds cannot see. Half a consequence is not a
consequence, so it stays where it is, at the end. Do not promote it to a hero
panel on the strength of extra space.

**At phone width:** unchanged; the pairs re-stack in the order they already
have.

**Effort:** medium.

**Done.** Both grids are `lg:grid-cols-[1fr_320px]` with the summary in a
`lg:sticky` rail beside them, so the numbers stay in view while the player
moves through the styles. Simulate stays pinned at every width, as a
right-aligned button above `lg:` rather than a full-width bar across a desktop
window. The XI list is capped at `max-w-xl` instead of stretching. The odds
panel stayed where it is, for the reason above. 47% unused → 20%, 2.7 screens
→ 2.3.

### 4. The 768–1023px band is a phone layout at double size

*820×1180 — iPad portrait, and any half-width desktop window.*

**What the player gets.** On the draft screen, the pitch, the line ratings and
the squad story fill the first screen and the squad that was just spun begins
about 1,000px down. The player presses spin and nothing appears to happen. On
live results the league table is full width with two data columns. On classic
the card grid is three-across in a 672px column with 148px of margin either side.

**Why it is wrong.** Principle 7. `lg:` was treated as "desktop" and everything
below it as "phone", and a 1,180px-tall tablet is neither.

**What the fix should achieve.** The draft's two-column split should start at
`md:` rather than `lg:` — 768px is enough for a 320px rail and a 400px list, and
what matters is that the spun squad is on the first screen. Where the split
cannot come down that far, the phone rule applies instead: fold the non-actionable
panel (squad story, line ratings) behind a summary so the list is what the player
lands on.

**At phone width:** unchanged. Everything here happens at `md:` and up.

**Effort:** small to medium, spread across three screens.

**Done.** The draft splits at `md:`, and its rail is a real rail:
`md:sticky md:top-0 md:max-h-screen md:overflow-y-auto`, so the pitch stays put
while the list scrolls. At 820px the spun squad is now the first thing on the
screen and the draft is 1.2 screens rather than 2.0. The live table moved to
`md:` with it.

### 5. Classic mode is 326 cards and thirteen screens

*11,741px tall at every width; 53% of 1440 unused; 8.6 screens even on an iPad.*

**What the player gets.** A search box, a sort control, an Icons toggle, and then
326 identical small cards in three columns of a 672px column, ordered by rating.
There is no grouping, no era, no league. The controls scroll away after the
first screen, so narrowing the list means scrolling back to the top. A player
who does not already know which side they want has no way in.

**Why it is wrong.** Principles 1 and 7 — but mostly this is the conventions'
own rule about folding away what is not actionable, applied to a list large
enough that browsing it *is* the task and it still needs structure.

**What the fix should achieve.** Three things, in order of value:

1. The controls stay in view while the list scrolls. Nothing else matters if
   the filter is a scroll away from the results.
2. Structure the list rather than lengthening it. 27 of the 326 sides are marked
   iconic; those are the ones a player can name. Lead with them, and put the
   rest behind a decade or a club. The Icons toggle already exists — it is a
   toggle nobody finds, at the top of a thirteen-screen page.
3. More columns at `lg:`/`xl:`, but only after 1 and 2. Four or five columns of
   a thirteen-screen list is still an eight-screen list.

**At phone width:** the sticky control bar is a phone improvement. More columns
happen only at `lg:` and up.

**Effort:** medium. This is the screen where a desktop-only fix ("more columns")
would look like progress and change nothing.

**Done.** All three, in that order. The controls are a `sticky top-0` bar and
gained era chips; the 27 iconic sides lead under their own heading; the other
280 are folded into a `<details>`; and the grid goes to four columns at `lg:`
and five at `xl:`. 13.1 screens → 1.4, and the first screen is now 27 sides a
player can actually name.

### 6. The final report is a 4,600px receipt

*4,106px at 1440, 4.6 screens; 1,024px content.*

**What the player gets.** The XI again, the plan again, then the result banner,
then a Resim button, six stat tiles, the XI's season stats, League Awards, Your
XI Awards, two records, the full table, the leaderboards. Everything is one
column at one weight. The moment the whole game exists for — CHAMPIONS, 105
points — is a 2xl heading about 350px down, between a squad list the player has
now seen four times and a grey Resim button.

Two content problems show up here as well. When the drafted XI sweeps the
league, League Awards and Your XI Awards are the same four names twice, one
above the other. And the 1,024px-wide `Your XI` stat rows put five numeric
columns at the far right of a very wide row, so the name and its goals total are
a screen-width apart.

**Why it is wrong.** Principles 1 and 2, and an absent hierarchy: a report where
everything is equally important reads as nothing being important.

**What the fix should achieve.** The verdict owns the first screen — outcome,
final position, points, and the over/underperformed judgement, large. Everything
after it is reference material and can go two columns wide at `lg:` (table
beside leaderboards; awards beside records), which roughly halves the page. Fold
the repeated squad header away on the final view. Merge the two award blocks
when they name the same players.

**At phone width:** unchanged single column. The verdict-first ordering is an
improvement there too.

**Effort:** medium. Lower priority than it looks — the player reaches this
screen once per run and is willing to scroll it.

**Done.** The verdict is the first screen: outcome, finish, points, record and
the over/underperformed judgement, with Play it again under them. Everything
after it is a two-column grid at `lg:`, the leaderboards drop their tabs at
`lg:` and show all three boards side by side, and the two award blocks are one
— each award names the league winner and adds your own best only when it is a
different player. 4.6 screens → 3.2. The odds themselves were left alone.

### 7. Contrast and accent overload

Cross-cutting, described in principles 6 and 8. Not a layout change and not a
rebrand: raise the grey floor, pick one "selected" colour, and reconcile the two
rating scales. Small, mechanical, and it makes every screen above easier to read
while you are working on it.

**Done.** `#555`, `#444` and `#333` no longer carry text anywhere in the game;
`#888` is the floor for anything read and `#666` for a label only noticed.
Selected is green, once. The two rating scales are one — `src/components/ratingColor.ts`,
green at the top because green is what this game means by good everywhere else.
The odds ladder is one hue at four intensities, with relegation the only
separate colour, because it is the only one that means something else.

## What not to do

**Do not remove the sticky bars.** They are the right pattern; `sm:static` is
the mistake. The fix removes a breakpoint, it does not remove the behaviour.

**Do not widen a reading column to fill the screen.** The XI list at 768 and
1,024 already suffers from this. Anything with a label on the left and a number
on the right stops working past roughly 480px. Cap it and put something beside it.

**Do not scale the pitch or its badges up.** `PitchView`'s fixed-pixel badges
and preferred-width-with-`maxWidth` sizing are load-bearing (they are the worked
example in the conventions for not overflowing at 360px). A modest size bump
where the pitch becomes the focal point is fine; rewriting its sizing is not.

**Do not turn the draft's player list into a multi-column grid.** It is sorted
by rating and the player scans it top to bottom. Two columns break that scan for
no gain — the list is already comfortable, and the draft screen's real problem
is its dead gutter and its rail, not its list.

**Do not add a horizontal scroller for the league table.** Nothing scrolls
sideways is a hard rule. If the final table does not fit, drop columns.

**Do not add a desktop navigation chrome.** `SiteNav` is a footer site map and
`BackLink` is the way out of a screen; that is the whole navigation model and it
is correct. A persistent header would take vertical space from screens that need
it and would give the player a second way to leave a run half-finished.

**Do not build a separate desktop layout or route.** One tree, breakpoints on it.
The static export and the eventual move to a phone-shaped runtime both assume
there is one screen definition per screen.

**Do not add hover-dependent affordances.** A tooltip on hover for the tactic
numbers, a row that only reveals its action on hover — none of it exists on a
touch device, and the tablet band is a touch device with a desktop-width layout.

**Leave these alone.** They are right and a desktop pass will be tempted by all
of them: `PitchView`'s sizing model; the draft's `sticky top-2` placement panel;
`BackLink` on every screen; the `ComingSoon` folding on setup; `LineRatings`'
four categorical colours; the spin animation; the phone stacking order on every
screen. The draft screen as a whole is the closest to right — at 1440 it is 22%
unused and 1.6 screens — and needs a gutter fixed and a rail pinned, not a
redesign.

One genuine bug in that area, worth doing with #4: the draft's rail is
`lg:overflow-y-auto` with no height to scroll inside, so it cannot scroll
independently and the whole page scrolls instead. The pitch — the feedback for
the pick just made — leaves the viewport when the player scrolls to a low-rated
player. The target is a rail that stays put while the list scrolls past it.

## Priority

All seven were done in one pass, in this order.

| # | Change | Result |
| --- | --- | --- |
| 1 | Live results: drop the `lg:order` reversal, table beside the match, fold the squad | Done — 2.0 → 1.4 screens |
| 2 | Setup: two columns at `lg:`, pitch + Start Draft in a fixed panel, button pinned at all widths | Done — 60% → 11% unused |
| 3 | Pre-season: pair each choice with its summary at `lg:`, keep Simulate pinned | Done — 2.7 → 2.3 screens |
| 4 | Tablet band: draft split at `md:`, rail actually pinned, live table not full-width at 820 | Done — draft 2.0 → 1.2 screens at 820 |
| 5 | Contrast floor, one "selected" accent, one rating scale | Done |
| 6 | Classic: sticky controls, iconic sides first, then more columns | Done — 13.1 → 1.4 screens |
| 7 | Final report: verdict first, two columns, merge duplicated awards | Done — 4.6 → 3.2 screens |

What is left, and deliberately: the pre-season and final-report heights are
above the targets in this document. (The odds panel's numbers, listed here as a
reason not to promote it, have since been refitted — it now reads the field it
is playing, though still not the tactic.)
