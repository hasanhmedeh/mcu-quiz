import type { Metadata, Viewport } from 'next';
import { Inter, Orbitron } from 'next/font/google';
import './globals.css';

const bodyFont = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const displayFont = Orbitron({
  subsets: ['latin'],
  weight: ['500', '700', '900'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'MCU Endgame Preparation Quiz',
  description:
    'Forty questions on the Marvel Cinematic Universe, from Iron Man (2008) to Captain Marvel (2019). Score 25 to prove you are ready.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#04050e',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${displayFont.variable}`}>
      <body className="relative antialiased">
        <div className="starfield" aria-hidden="true" />
        <div className="relative z-10 flex min-h-dvh flex-col">{children}</div>
      </body>
    </html>
  );
}
