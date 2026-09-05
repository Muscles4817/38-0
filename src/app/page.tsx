'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FORMATIONS, getFormation } from '@/lib/formations';
import PitchView from '@/components/PitchView';
import OptionCard from '@/components/OptionCard';
import SiteNav from '@/components/SiteNav';

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

  function handleEraPreset(label: string) {
    const p = ERA_PRESETS.find(e => e.label === label)!;
    setEraPreset(label);
    setYearStart(p.start);
    setYearEnd(p.end);
  }

  function startDraft() {
    const setup = { formation, difficulty, showRatings, draftMode, playerRating, yearStart, yearEnd };
    localStorage.setItem('38-0-setup', JSON.stringify(setup));
    localStorage.removeItem('38-0-draft');
    // A tactic and a season chosen for a previous XI mean nothing to this one.
    localStorage.removeItem('38-0-plan');
    router.push('/draft');
  }

  const fmt = getFormation(formation);
  const totalSeasons = yearEnd - yearStart;

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center py-12 px-4">
      <h1 className="text-6xl font-black mb-2 tracking-tight">
        <span className="text-white">38</span>
        <span className="text-[#00c896]">-0</span>
      </h1>
      <p className="text-[#888] text-sm mb-10">Draft your greatest all-time English top-flight XI</p>

      <div className="w-full max-w-xl space-y-8">

        {/* Formation */}
        <section>
          <Label>Formation</Label>
          <div className="grid grid-cols-2 gap-2 mb-2 sm:grid-cols-3 lg:grid-cols-4">
            {Object.keys(FORMATIONS).map(f => (
              <OptionCard key={f} label={f} selected={formation === f} onClick={() => setFormation(f)} />
            ))}
          </div>
          <p className="text-[#666] text-xs text-center mt-1">{FORMATIONS[formation]?.description}</p>
        </section>

        {/* Pitch preview */}
        <div className="flex justify-center">
          <PitchView formation={fmt} picks={[]} compact />
        </div>

        {/* Difficulty */}
        <section>
          <Label>Difficulty</Label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <OptionCard label="Easy"   description="3 rerolls available"          selected={difficulty === 'easy'}   onClick={() => setDifficulty('easy')} />
            <OptionCard label="Normal" description="1 reroll available"            selected={difficulty === 'normal'} onClick={() => setDifficulty('normal')} accent="amber" />
            <OptionCard label="Hard"   description="No rerolls · ratings hidden"   selected={difficulty === 'hard'}   onClick={() => setDifficulty('hard')} />
          </div>
        </section>

        {/* Show Ratings */}
        <section>
          <Label>Show Ratings</Label>
          <div className="grid grid-cols-2 gap-3">
            <OptionCard label="On"  description="Player overalls visible"      selected={showRatings}  onClick={() => setShowRatings(true)} />
            <OptionCard label="Off" description="Blind mode — trust your gut"  selected={!showRatings} onClick={() => setShowRatings(false)} accent="purple" />
          </div>
        </section>

        {/* Draft Mode */}
        <section>
          <Label>Draft Mode</Label>
          <div className="grid grid-cols-2 gap-3">
            <OptionCard
              label="Squad First"
              description="Spin a club, pick any player, choose their position"
              selected={draftMode === 'squad-first'}
              onClick={() => setDraftMode('squad-first')}
            />
            <OptionCard
              label="Position First"
              description="Pick a slot, then spin for a club to fill it"
              selected={draftMode === 'position-first'}
              onClick={() => setDraftMode('position-first')}
            />
          </div>
        </section>

        {/* Player Ratings */}
        <section>
          <Label>Player Ratings</Label>
          <div className="grid grid-cols-2 gap-3">
            <OptionCard
              label="Career Seasons"
              description="Players rated as they were that exact season"
              selected={playerRating === 'career'}
              onClick={() => setPlayerRating('career')}
            />
            <OptionCard
              label="Prime Mode"
              description="Every player at their career-best rating"
              selected={playerRating === 'prime'}
              onClick={() => setPlayerRating('prime')}
              accent="amber"
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
                <div className="text-[10px] text-[#555] mb-1">From</div>
                <input type="range" min={1992} max={2025} value={yearStart}
                  onChange={e => { setYearStart(+e.target.value); setEraPreset(''); }}
                  className="w-full h-8 accent-[#00c896] touch-manipulation" />
              </div>
              <div className="flex-1">
                <div className="text-[10px] text-[#555] mb-1">To</div>
                <input type="range" min={1993} max={2026} value={yearEnd}
                  onChange={e => { setYearEnd(+e.target.value); setEraPreset(''); }}
                  className="w-full h-8 accent-[#00c896] touch-manipulation" />
              </div>
            </div>
            <div className="flex justify-between text-xs text-[#888]">
              <span>{yearStart}/{String(yearStart + 1).slice(-2)}</span>
              <span className="text-[#00c896]">{totalSeasons} of 34 seasons</span>
              <span>{yearEnd - 1}/{String(yearEnd).slice(-2)}</span>
            </div>
            <p className="text-[#555] text-[11px] text-center">
              Only club-seasons in this range can be spun — narrow it to draft from an era you know.
            </p>
          </div>
        </section>

        {/* Draft Pool */}
        <section>
          <Label>Draft Pool</Label>
          <div className="rounded-lg border border-[#00c896]/30 bg-[#0d0d0d] px-4 py-3 flex items-center gap-3 select-none">
            <span className="text-lg">🏴󠁧󠁢󠁥󠁮󠁧󠁿</span>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-white">Premier League</div>
              <div className="text-[#555] text-[11px]">English top flight</div>
            </div>
            <span className="text-[9px] text-[#00c896] font-bold uppercase tracking-widest bg-[#00c896]/10 px-1.5 py-0.5 rounded shrink-0">
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
                className="relative rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] px-3 py-3 opacity-40 cursor-not-allowed select-none overflow-hidden">
                <div className="absolute top-2 right-2 text-[9px] text-[#444] font-bold uppercase tracking-widest bg-[#1a1a1a] px-1.5 py-0.5 rounded">
                  Soon
                </div>
                <div className="text-lg mb-1">{l.flag}</div>
                <div className="font-bold text-sm text-[#666]">{l.name}</div>
                <div className="text-[#444] text-[11px] mt-0.5">{l.desc}</div>
              </div>
            ))}
          </ComingSoon>
        </section>

        {/* Challenge Modes */}
        <section>
          <Label>Challenge Modes</Label>
          <ComingSoon summary="Extra constraints for a harder draft">
            {[
              { label: '🏟️ One Club',        desc: 'All 11 players from the same club-season' },
              { label: '🌍 One Nation',       desc: 'Full XI from a single nationality' },
              { label: '⏳ Golden Era',        desc: 'Only players from 1992–2004' },
              { label: '⚡ Modern Masters',   desc: 'Only players from 2015 onwards' },
              { label: '💰 Budget XI',         desc: 'Every player rated 78 or below' },
              { label: '🎲 Pure Chaos',        desc: 'No rerolls, ratings hidden, random formation' },
            ].map(c => (
              <div key={c.label}
                className="relative rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] px-4 py-3 opacity-50 cursor-not-allowed select-none overflow-hidden">
                <div className="absolute top-2 right-2 text-[9px] text-[#444] font-bold uppercase tracking-widest bg-[#1a1a1a] px-1.5 py-0.5 rounded">
                  Soon
                </div>
                <div className="font-bold text-sm text-[#666]">{c.label}</div>
                <div className="text-[#444] text-xs mt-0.5">{c.desc}</div>
              </div>
            ))}
          </ComingSoon>
        </section>

        {/*
          Start sticks to the bottom of the phone viewport. Every setting here
          has a sensible default, so the primary action should not be several
          screens of scrolling away.
        */}
        <div className="sticky bottom-0 z-30 py-3 bg-[#0a0a0a]/95 backdrop-blur-sm sm:static sm:py-0 sm:bg-transparent sm:backdrop-blur-none">
          <button
            type="button"
            onClick={startDraft}
            className="w-full py-4 rounded-xl font-black text-lg bg-[#00c896] text-black hover:bg-[#00b385] transition-colors touch-manipulation"
          >
            Start Draft →
          </button>
        </div>

        <Link
          href="/classic"
          className="block w-full py-3 rounded-xl font-bold text-base border border-[#1a1a1a] text-[#888] hover:border-[#333] hover:text-white transition-colors text-center"
        >
          Classic Mode — pick a legendary side
        </Link>

        <SiteNav />
      </div>
    </main>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-bold tracking-widest text-[#555] uppercase mb-2">{children}</div>;
}

/**
 * Folds away a grid of not-yet-available options. Twelve disabled tiles were
 * roughly a third of the page on a phone, pushing "Start Draft" far out of
 * reach; collapsed by default they stay discoverable without the scroll.
 */
function ComingSoon({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border border-[#1a1a1a] bg-[#0d0d0d]/50 mt-2">
      <summary className="cursor-pointer list-none px-4 py-3 flex items-center gap-2 text-xs text-[#555] hover:text-[#888] transition-colors touch-manipulation">
        <span className="text-[#444] transition-transform group-open:rotate-90">▶</span>
        <span className="flex-1">{summary}</span>
        <span className="text-[9px] font-bold uppercase tracking-widest text-[#444] bg-[#1a1a1a] px-1.5 py-0.5 rounded">Soon</span>
      </summary>
      <div className="grid grid-cols-1 gap-2 px-3 pb-3 sm:grid-cols-2">
        {children}
      </div>
    </details>
  );
}
