import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '38-0 · Draft your greatest XI',
  description: 'Draft your greatest all-time English top-flight XI',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Matches the page background, so browser chrome does not flash white.
  themeColor: '#0a0a0a',
  colorScheme: 'dark',
  // No maximumScale or userScalable: pinch-zoom stays available.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-[#0a0a0a] text-white antialiased">{children}</body>
    </html>
  );
}
