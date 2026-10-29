import type { Metadata, Viewport } from 'next';
import { siteUrl } from '@/lib/site';
import './globals.css';

const TITLE = 'Echo Heist — outrun your past runs';
const DESCRIPTION =
  'A top-down stealth-puzzle game where every failed run becomes a ghost. Bank three runs, press plates, dodge guards and crack the vault.';

const SOCIAL_IMAGE = {
  url: '/opengraph-image',
  width: 1200,
  height: 630,
  alt: 'Echo Heist — a ghost-replay stealth puzzle',
};

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: TITLE,
    template: '%s — Echo Heist',
  },
  description: DESCRIPTION,
  applicationName: 'Echo Heist',
  category: 'game',
  keywords: [
    'Echo Heist',
    'stealth puzzle game',
    'browser game',
    'ghost replay',
    'deterministic game',
    'pixel art',
  ],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'Echo Heist',
    title: TITLE,
    description: DESCRIPTION,
    images: [SOCIAL_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/twitter-image'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: '#0f1020',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-ink text-bone antialiased">{children}</body>
    </html>
  );
}
