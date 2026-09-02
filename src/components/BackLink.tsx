import Link from 'next/link';

/**
 * Back navigation for the inner pages.
 *
 * The footer nav lists every page, which reads as a site map rather than a way
 * out of where you are, and it sits at the bottom of a screen or more of
 * content. This is the explicit "up one step" control, pinned to the top left
 * where a back button is expected.
 */
export default function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 px-3 py-2.5 -ml-3 rounded-lg text-xs font-bold
                 text-[#666] hover:text-white transition-colors touch-manipulation"
    >
      <span aria-hidden="true">←</span>
      {label}
    </Link>
  );
}
