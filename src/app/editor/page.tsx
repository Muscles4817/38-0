import Link from 'next/link';

export default function EditorHome() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-black">Data Editor</h1>
      <p className="text-[#555] text-sm">Manage clubs, players, and squad entries for the draft pool.</p>

      <div className="grid grid-cols-4 gap-4">
        {[
          { href: '/editor/clubs',   icon: '🏟️', title: 'Clubs',   desc: 'Add and edit clubs' },
          { href: '/editor/players', icon: '👤', title: 'Players', desc: 'Manage the player database' },
          { href: '/editor/squads',  icon: '📋', title: 'Squads',  desc: 'Assign players to club-seasons' },
          { href: '/editor/lineups', icon: '📐', title: 'Lineups', desc: 'Set formation & starting XI per club' },
        ].map(item => (
          <Link
            key={item.href}
            href={item.href}
            className="bg-[#111] rounded-xl p-5 border border-[#1a1a1a] hover:border-[#00c896] transition-colors block"
          >
            <div className="text-3xl mb-2">{item.icon}</div>
            <div className="font-bold">{item.title}</div>
            <div className="text-[#555] text-xs mt-1">{item.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
