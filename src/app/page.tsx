'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FORMATIONS, getFormation } from '@/lib/formations';
import PitchView from '@/components/PitchView';
import OptionCard from '@/components/OptionCard';
import SiteNav from '@/components/SiteNav';
import { clubChoices, nationChoices, poolCanFieldXI, type DraftFilter } from '@/lib/draftPool';
import { BUDGET_MAX_RATING, CHALLENGE_ERAS, CHALLENGES, type ChallengeId } from '@/lib/challenges';

const ERA_PRESETS = [
  { label: 'All-time',       start: 1992, end: 2026 },
  { label: '2000s+',         start: 2000, end: 2026 },
  { label: '2010s+',         start: 2010, end: 2026 },
  { label: 'Modern (2016+)', start: 2016, end: 2026 },
];

export default function SetupPage() {
  const router = useRouter();
  const [formation,    setFormation]    = useState('4-4-2');
  const [difficulty,   setDifficulty]   = useState('normal');
  const [showRatings,  setShowRatings]  = useState(false);
  const [draftMode,    setDraftMode]    = useState('squad-first');
  const [playerRating, setPlayerRating] = useState('career');
  const [eraPreset,    setEraPreset]    = useState('All-time');
  const [yearStart,    setYearStart]    = useState(1992);
  const [yearEnd,      setYearEnd]      = useState(2026);
  const [challenge,    setChallenge]    = useState<ChallengeId>('none');
  const [clubId,       setClubId]       = useState<number | null>(null);
  const [nation,       setNation]       = useState<string | null>(null);

  // Golden Era, Modern Masters and Pure Chaos are shortcuts for settings on
  // this page. Changing the setting they made afterwards means the player has
  // left the challenge, so these handlers drop back to None rather than leave
  // a label claiming something that is no longer true.
  function leaveChallengeIf(ids: ChallengeId[]) {
    if (ids.includes(challenge)) setChallenge('none');
  }

  function handleEraPreset(label: string) {
    const p = ERA_PRESETS.find(e => e.label === label)!;
    setEraPreset(label);
    setYearStart(p.start);
    setYearEnd(p.end);
    leaveChallengeIf(['golden-era', 'modern-masters']);
  }

  function chooseFormation(f: string) {
    setFormation(f);
    leaveChallengeIf(['pure-chaos']);
  }

  function chooseDifficulty(d: string) {
    setDifficulty(d);
    if (d !== 'hard') leaveChallengeIf(['pure-chaos']);
  }

  function chooseChallenge(id: ChallengeId) {
    setChallenge(id);
    const era = CHALLENGE_ERAS[id];
    if (era) {
      setEraPreset('');
      setYearStart(era.start);
      setYearEnd(era.end);
    }
    if (id === 'pure-chaos') {
      setDifficulty('hard');
      setShowRatings(false);
    }
  }

  // Only choices that can field the formation within the era are offered, so
  // a challenge cannot start a draft that has no way to finish. Worked out only
  // while that challenge is selected: the nation list is a few thousand
  // feasibility checks.
  const rating = playerRating === 'prime' ? 'prime' : 'career';
  const clubs = useMemo(
    () => (challenge === 'one-club' ? clubChoices({ yearStart, yearEnd, playerRating: rating }, getFormation(formation)) : []),
    [challenge, yearStart, yearEnd, rating, formation],
  );
  const nations = useMemo(
    () => (challenge === 'one-nation' ? nationChoices({ yearStart, yearEnd, playerRating: rating }, getFormation(formation)) : []),
    [challenge, yearStart, yearEnd, rating, formation],
  );
  const budgetFits = useMemo(
    () => challenge !== 'budget' || poolCanFieldXI(
      { yearStart, yearEnd, playerRating: rating, filter: { kind: 'max-rating', maxRating: BUDGET_MAX_RATING } },
      getFormation(formation),
    ),
    [challenge, yearStart, yearEnd, rating, formation],
  );

  const chosenClub   = clubs.find(c => c.value === clubId) ?? null;
  const chosenNation = nations.find(n => n.value === nation) ?? null;

  let filter: DraftFilter | null = null;
  let blocked: string | null = null;
  if (challenge === 'one-club') {
    if (chosenClub) filter = { kind: 'club', clubId: chosenClub.value };
    else blocked = clubs.length === 0 ? 'No club can field this formation in this era.' : 'Choose a club for One Club.';
  } else if (challenge === 'one-nation') {
    if (chosenNation) filter = { kind: 'nation', nation: chosenNation.value };
    else blocked = nations.length === 0 ? 'No nation can field this formation in this era.' : 'Choose a nation for One Nation.';
  } else if (challenge === 'budget') {
    filter = { kind: 'max-rating', maxRating: BUDGET_MAX_RATING };
    if (!budgetFits) blocked = `No XI rated ${BUDGET_MAX_RATING} or below fits this formation in this era.`;
  }

  const challengeSummary =
    challenge === 'one-club'   ? `One Club · ${chosenClub?.label ?? '—'}` :
    challenge === 'one-nation' ? `One Nation · ${chosenNation?.label ?? '—'}` :
    CHALLENGES.find(c => c.id === challenge)?.label.replace(/^\S+\s/, '') ?? 'None';

  function startDraft() {
    if (blocked) return;
    // Pure Chaos picks the formation now, so not even the setup page knows it.
    const keys = Object.keys(FORMATIONS);
    const chosenFormation = challenge === 'pure-chaos' ? keys[Math.floor(Math.random() * keys.length)] : formation;
    const setup = {
      formation: chosenFormation, difficulty, showRatings, draftMode, playerRating, yearStart, yearEnd,
      challenge, filter,
    };
    // Clear the previous run before saving this one, so a browser whose storage
    // is full frees space before the one write that has to succeed.
    localStorage.removeItem('38-0-draft');
    // A tactic and a season chosen for a previous XI mean nothing to this one.
    localStorage.removeItem('38-0-plan');
    // Nor do the squads it was offered. Without this the list outlived every
    // run started from here; see src/lib/seenSquads.ts.
    localStorage.removeItem('38-0-seen-squads');
    localStorage.setItem('38-0-setup', JSON.stringify(setup));
    router.push('/draft');
  }

  const fmt = getFormation(formation);
  const totalSeasons = yearEnd - yearStart;

  return (
    <main className="min-h-screen bg-ground text-fg py-8 px-4 sm:py-12">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-8 lg:mb-10">
          <h1 className="text-5xl sm:text-6xl font-black mb-2 tracking-tight">
            <span className="text-fg">38</span>
            <span className="text-accent">-0</span>
          </h1>
          <p className="text-muted text-sm">Draft your greatest all-time English top-flight XI</p>
        </header>

        {/*
          Settings on the left, the consequence of the first one on the right.
          The pitch is not decoration here — it is what the formation tile you
          just pressed does — so putting the two beside each other is the whole
          reason this screen earns a second column. See docs/desktop-ux.md.
        */}
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
        <div className="w-full max-w-xl mx-auto space-y-8 lg:mx-0 lg:flex-1">

        {/* Formation */}
        <section>
          <Label>Formation</Label>
          <div className="grid grid-cols-2 gap-2 mb-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Object.keys(FORMATIONS).map(f => (
              <OptionCard key={f} label={f} selected={formation === f} onClick={() => chooseFormation(f)} />
            ))}
          </div>
          <p className="text-muted text-xs text-center mt-1 lg:hidden">{FORMATIONS[formation]?.description}</p>
        </section>

        {/* The pitch lives in the side panel from lg: up. */}
        <div className="flex justify-center lg:hidden">
          <PitchView formation={fmt} picks={[]} compact />
        </div>

        {/* Difficulty */}
        <section>
          <Label>Difficulty</Label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <OptionCard label="Easy"   description="3 rerolls available"          selected={difficulty === 'easy'}   onClick={() => chooseDifficulty('easy')} />
            <OptionCard label="Normal" description="1 reroll available"            selected={difficulty === 'normal'} onClick={() => chooseDifficulty('normal')} />
            <OptionCard label="Hard"   description="No rerolls · ratings hidden"   selected={difficulty === 'hard'}   onClick={() => chooseDifficulty('hard')} />
          </div>
        </section>

        {/*
          Three two-option settings, all of them "how much does the game tell
          you and how much do you choose". Stacked four deep they were most of
          this page's height; side by side they are one band of it.
        */}
        <div className="grid gap-8 md:grid-cols-2 md:gap-6">
          <section>
            <Label>Show Ratings</Label>
            <div className="grid grid-cols-2 gap-3">
              <OptionCard label="On"  description="Player overalls visible"      selected={showRatings}  onClick={() => setShowRatings(true)} />
              <OptionCard label="Off" description="Blind mode — trust your gut"  selected={!showRatings} onClick={() => setShowRatings(false)} />
            </div>
          </section>

          <section>
            <Label>Player Ratings</Label>
            <div className="grid grid-cols-2 gap-3">
              <OptionCard
                label="Career Seasons"
                description="Rated as they were that season"
                selected={playerRating === 'career'}
                onClick={() => setPlayerRating('career')}
              />
              <OptionCard
                label="Prime Mode"
                description="Everyone at their career best"
                selected={playerRating === 'prime'}
                onClick={() => setPlayerRating('prime')}
              />
            </div>
          </section>
        </div>

        {/* Draft Mode */}
        <section>
          <Label>Draft Mode</Label>
          <div className="grid grid-cols-2 gap-3">
            <OptionCard
              label="Squad First"
              description="Spin a club, then pick any player"
              selected={draftMode === 'squad-first'}
              onClick={() => setDraftMode('squad-first')}
            />
            <OptionCard
              label="Position First"
              description="Pick a slot, then spin to fill it"
              selected={draftMode === 'position-first'}
              onClick={() => setDraftMode('position-first')}
            />
          </div>
        </section>

        {/* Era */}
        <section>
          <Label>Era</Label>
          <div className="grid grid-cols-2 gap-2 mb-4 sm:grid-cols-4">
            {ERA_PRESETS.map(e => (
              <OptionCard key={e.label} label={e.label} selected={eraPreset === e.label} onClick={() => handleEraPreset(e.label)} />
            ))}
          </div>
          <div className="space-y-3">
            <div className="flex gap-4">
              <div className="flex-1">
                <div className="text-[10px] text-muted mb-1">From</div>
                <input type="range" min={1992} max={2025} value={yearStart}
                  onChange={e => { setYearStart(+e.target.value); setEraPreset(''); leaveChallengeIf(['golden-era', 'modern-masters']); }}
                  className="w-full h-8 accent-[#00c896] touch-manipulation" />
              </div>
              <div className="flex-1">
                <div className="text-[10px] text-muted mb-1">To</div>
                <input type="range" min={1993} max={2026} value={yearEnd}
                  onChange={e => { setYearEnd(+e.target.value); setEraPreset(''); leaveChallengeIf(['golden-era', 'modern-masters']); }}
                  className="w-full h-8 accent-[#00c896] touch-manipulation" />
              </div>
            </div>
            <div className="flex justify-between text-xs text-muted">
              <span>{yearStart}/{String(yearStart + 1).slice(-2)}</span>
              <span className="text-accent">{totalSeasons} of 34 seasons</span>
              <span>{yearEnd - 1}/{String(yearEnd).slice(-2)}</span>
            </div>
            <p className="text-muted text-[11px] text-center">
              Only club-seasons in this range can be spun — narrow it to draft from an era you know.
            </p>
          </div>
        </section>

        {/* Draft Pool */}
        <section>
          <Label>Draft Pool</Label>
          <div className="rounded-lg border border-[#00c896]/30 bg-inset px-4 py-3 flex items-center gap-3 select-none">
            <span className="text-lg">🏴󠁧󠁢󠁥󠁮󠁧󠁿</span>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-fg">Premier League</div>
              <div className="text-muted text-[11px]">English top flight</div>
            </div>
            <span className="text-[9px] text-accent font-bold uppercase tracking-widest bg-[#00c896]/10 px-1.5 py-0.5 rounded shrink-0">
              Active
            </span>
          </div>
          <ComingSoon summary="More leagues coming soon">
            {[
              { flag: '🇮🇹', name: 'Serie A',    desc: 'Italian top flight' },
              { flag: '🇪🇸', name: 'La Liga',    desc: 'Spanish top flight' },
              { flag: '🇩🇪', name: 'Bundesliga', desc: 'German top flight' },
              { flag: '🌍', name: 'Multi-League', desc: 'Mix all four leagues' },
              { flag: '🏆', name: 'Champions League', desc: 'European elite only' },
            ].map(l => (
              <div key={l.name}
                className="relative rounded-lg border border-line bg-inset px-3 py-3 opacity-40 cursor-not-allowed select-none overflow-hidden">
                <div className="absolute top-2 right-2 text-[9px] text-fainter font-bold uppercase tracking-widest bg-raised px-1.5 py-0.5 rounded">
                  Soon
                </div>
                <div className="text-lg mb-1">{l.flag}</div>
                <div className="font-bold text-sm text-subtle">{l.name}</div>
                <div className="text-fainter text-[11px] mt-0.5">{l.desc}</div>
              </div>
            ))}
          </ComingSoon>
        </section>

        {/* Challenge Modes */}
        <section>
          <Label>Challenge Modes</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CHALLENGES.map(c => (
              <OptionCard key={c.id} label={c.label} description={c.description}
                selected={challenge === c.id} onClick={() => chooseChallenge(c.id)} />
            ))}
          </div>
          {challenge === 'one-club' && (
            <ChoiceSelect
              label="Club"
              placeholder="Choose a club"
              value={chosenClub ? String(chosenClub.value) : ''}
              options={clubs.map(c => ({ value: String(c.value), label: `${c.label} · ${c.seasons} season${c.seasons === 1 ? '' : 's'}` }))}
              onChange={v => setClubId(v ? Number(v) : null)}
            />
          )}
          {challenge === 'one-nation' && (
            <ChoiceSelect
              label="Nation"
              placeholder="Choose a nation"
              value={chosenNation?.value ?? ''}
              options={nations.map(n => ({ value: n.value, label: n.label }))}
              onChange={v => setNation(v || null)}
            />
          )}
          {(challenge === 'one-club' || challenge === 'one-nation') && (
            <p className="text-muted text-[11px] mt-2">
              Only {challenge === 'one-club' ? 'clubs' : 'nations'} that can field a {formation} within the era are listed.
            </p>
          )}
          {blocked && <p className="text-(--c-yellow) text-xs mt-2">{blocked}</p>}
        </section>

        {/*
          Start sticks to the bottom of the viewport at every width where the
          page still scrolls. Every setting has a sensible default, so the
          primary action should never be several screens away — that was true
          on a phone and it was just as true in a 1440x900 window, where this
          button used to sit 2,000px down. Above lg: it lives in the side
          panel instead, which does not scroll at all.
        */}
        <div className="sticky bottom-0 z-30 py-3 bg-ground/95 backdrop-blur-sm lg:hidden">
          {blocked && <p className="text-center text-xs text-muted mb-2">{blocked}</p>}
          <button
            type="button"
            onClick={startDraft}
            disabled={blocked !== null}
            className="w-full py-4 rounded-xl font-black text-lg bg-[#00c896] text-black hover:bg-[#00b385] transition-colors touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Start Draft →
          </button>
        </div>

        <Link
          href="/classic"
          className="block w-full py-3 rounded-xl font-bold text-base border border-line text-muted hover:border-line-max hover:text-fg transition-colors text-center"
        >
          Classic Mode — pick a legendary side
        </Link>

        <div className="lg:hidden">
          <SiteNav />
        </div>
        </div>

        {/*
          The side panel: what the settings add up to, and the way out of the
          screen. `sticky top-8` keeps both in view however far the settings
          column scrolls.
        */}
        <aside className="hidden lg:block lg:w-[340px] lg:shrink-0">
          <div className="sticky top-8 space-y-5">
            <div className="bg-card rounded-2xl p-5 flex flex-col items-center">
              <PitchView formation={fmt} picks={[]} compact />
              <div className="mt-4 text-center">
                <div className="text-2xl font-black tracking-tight">{challenge === 'pure-chaos' ? 'Random formation' : formation}</div>
                <p className="text-muted text-xs mt-1">
                  {challenge === 'pure-chaos' ? 'Drawn when the draft starts.' : FORMATIONS[formation]?.description}
                </p>
              </div>
            </div>

            <div className="bg-card rounded-2xl px-5 py-4 space-y-2">
              <Summary label="Difficulty" value={difficulty === 'easy' ? 'Easy' : difficulty === 'hard' ? 'Hard' : 'Normal'} />
              <Summary label="Ratings"    value={showRatings ? 'Visible' : 'Blind'} />
              <Summary label="Draft"      value={draftMode === 'squad-first' ? 'Squad first' : 'Position first'} />
              <Summary label="Players"    value={playerRating === 'prime' ? 'Prime mode' : 'Career seasons'} />
              <Summary label="Era"        value={`${yearStart}–${yearEnd - 1}`} />
              <Summary label="Challenge"  value={challengeSummary} />
            </div>

            {blocked && <p className="text-center text-xs text-muted -mb-2">{blocked}</p>}
            <button
              type="button"
              onClick={startDraft}
              disabled={blocked !== null}
              className="w-full py-4 rounded-xl font-black text-lg bg-[#00c896] text-black hover:bg-[#00b385] transition-colors touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Start Draft →
            </button>

            <Link
              href="/classic"
              className="block w-full py-3 rounded-xl font-bold text-sm border border-line text-muted hover:border-line-max hover:text-fg transition-colors text-center"
            >
              Classic Mode
            </Link>

            <SiteNav />
          </div>
        </aside>
        </div>
      </div>
    </main>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-bold tracking-widest text-muted uppercase mb-2">{children}</div>;
}

/** One line of the side panel's read-back of the current settings. */
function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3 text-xs">
      <span className="text-subtle uppercase tracking-widest text-[10px] w-20 shrink-0">{label}</span>
      <span className="font-bold text-fg truncate">{value}</span>
    </div>
  );
}

/** A native picker for a challenge's club or nation: one tap on a phone, typeahead on a desktop. */
function ChoiceSelect({ label, placeholder, value, options, onChange }: {
  label: string;
  placeholder: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block mt-3">
      <span className="block text-[10px] text-muted mb-1 uppercase tracking-widest font-bold">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full min-h-11 rounded-lg border-2 border-line-strong bg-card px-3 py-2.5 text-sm font-bold text-fg
                   focus:border-[#00c896] focus:outline-none touch-manipulation"
      >
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

/**
 * Folds away a grid of not-yet-available options. Twelve disabled tiles were
 * roughly a third of the page on a phone, pushing "Start Draft" far out of
 * reach; collapsed by default they stay discoverable without the scroll.
 */
function ComingSoon({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border border-line bg-inset/50 mt-2">
      <summary className="cursor-pointer list-none px-4 py-3 flex items-center gap-2 text-xs text-muted hover:text-fg transition-colors touch-manipulation">
        <span className="text-fainter transition-transform group-open:rotate-90">▶</span>
        <span className="flex-1">{summary}</span>
        <span className="text-[9px] font-bold uppercase tracking-widest text-fainter bg-raised px-1.5 py-0.5 rounded">Soon</span>
      </summary>
      <div className="grid grid-cols-1 gap-2 px-3 pb-3 sm:grid-cols-2">
        {children}
      </div>
    </details>
  );
}
