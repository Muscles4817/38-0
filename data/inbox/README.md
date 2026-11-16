# Inbox — drop an FBref export here, then run one command

1. On FBref, open a league season's **Standard Stats** page, e.g.
   <https://fbref.com/en/comps/11/1997-1998/stats/1997-1998-Serie-A-Stats>
   (competition page → *Player Stats* → *Standard Stats*).
2. Scroll to the big **Player Standard Stats** table — every player in the
   league, with a `Squad` column. *Share & Export* → *Get table as CSV*, copy.
3. Save it here, named for what it is:

   ```
   serie-a-1997-98.csv
   premier-league-2003-04.csv
   la-liga-2001-02.csv
   bundesliga-1998-99.csv
   world-cup-2006.csv
   ```

4. Run **Data: import everything in the inbox** from VS Code
   (*Terminal → Run Task*), or:

   ```bash
   npm run data:import
   ```

That splits it into club files, works out who is new, has Claude assign
positions and ratings for only those players, adds any new club to
`data/clubs.json`, imports, derives lineups, exports the snapshot and runs the
four CI checks. When it all passes the file moves to `done/`; then review and
commit (`git status`). If anything stops it, the message says what to fix, and
running the same command again picks up where it left off.

Nothing in this folder except this README is committed. Claude's raw answers
are kept in `logs/` so any rating can be traced back to what was said.

Details: [docs/squad-data-pipeline.md](../../docs/squad-data-pipeline.md#one-command).
