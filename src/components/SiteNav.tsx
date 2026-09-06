import Link from 'next/link';

const LINKS = [
  { href: '/',        label: 'Home' },
  { href: '/draft',   label: 'Play' },
  { href: '/classic', label: 'Classic' },
];

// The editor is not part of the static build, so only offer it while
// developing. Next inlines NODE_ENV, so the link is stripped from production.
const EDITOR_LINK = { href: '/editor', label: 'Editor' };

export default function SiteNav() {
  const links = process.env.NODE_ENV === 'development' ? [...LINKS, EDITOR_LINK] : LINKS;

  return (
    <nav className="flex justify-center gap-2 text-xs text-[#888] pt-2 pb-8">
      {links.map(link => (
        <Link
          key={link.href}
          href={link.href}
          // px/py give a finger-sized target around the small label.
          className="px-4 py-3 rounded-lg hover:text-white transition-colors touch-manipulation"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
