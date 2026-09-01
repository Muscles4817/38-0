import Link from 'next/link';

export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <header className="border-b border-[#1a1a1a] px-6 py-4 flex items-center gap-6">
        <Link href="/" className="text-xl font-black">
          <span className="text-white">38</span>
          <span className="text-[#00c896]">-0</span>
          <span className="text-[#444] text-sm font-normal ml-3">Editor</span>
        </Link>
        <nav className="flex gap-4 text-sm">
          <Link href="/editor" className="text-[#888] hover:text-white transition-colors">Dashboard</Link>
          <Link href="/editor/clubs" className="text-[#888] hover:text-white transition-colors">Clubs</Link>
          <Link href="/editor/players" className="text-[#888] hover:text-white transition-colors">Players</Link>
          <Link href="/editor/squads" className="text-[#888] hover:text-white transition-colors">Squads</Link>
          <Link href="/editor/lineups" className="text-[#888] hover:text-white transition-colors">Lineups</Link>
          <Link href="/editor/roles" className="text-[#888] hover:text-white transition-colors">Roles</Link>
        </nav>
        <div className="ml-auto">
          <Link href="/" className="text-xs text-[#444] hover:text-white transition-colors">← Back to game</Link>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
