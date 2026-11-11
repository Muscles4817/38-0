import type { Metadata, Viewport } from 'next';
import { THEME_GROUND, THEME_SCRIPT } from '@/lib/theme';
import GameDataRoot from '@/components/GameDataRoot';
import './globals.css';

export const metadata: Metadata = {
  title: '38-0 · Draft your greatest XI',
  description: 'Draft an all-time XI and send it out for a 38-game league season',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Matches the page background, so browser chrome does not flash the other
  // colour. An explicit Light/Dark choice rewrites these; see src/lib/theme.ts.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEME_GROUND.light },
    { media: '(prefers-color-scheme: dark)',  color: THEME_GROUND.dark },
  ],
  colorScheme: 'dark light',
  // No maximumScale or userScalable: pinch-zoom stays available.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The head script sets data-theme before React hydrates, so the attribute
    // legitimately differs from the server render.
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full bg-ground text-fg antialiased">
        <GameDataRoot>{children}</GameDataRoot>
      </body>
    </html>
  );
}
