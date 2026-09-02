import Link from 'next/link';

const LINKS = [
  { href: '/',        label: 'Home' },
  { href: '/draft',   label: 'Play' },
  { href: '/classic', label: 'Classic' },
  { href: '/editor',  label: 'Editor' },
];

export default function SiteNav() {
  return (
    <div className="flex justify-center gap-6 text-xs text-[#444] pt-2 pb-8">
      {LINKS.map(link => (
        <Link key={link.href} href={link.href} className="hover:text-white transition-colors">
          {link.label}
        </Link>
      ))}
    </div>
  );
}
