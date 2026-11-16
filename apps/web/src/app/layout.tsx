import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LiveIndicator } from '@/components/LiveIndicator.tsx';
import { ThemeSwitch } from '@/components/ThemeSwitch.tsx';
import { t } from '@/lib/texts.ts';
import { parseTheme, THEME_COOKIE } from '@/lib/theme.ts';
import './globals.css';

export const metadata: Metadata = { ...t.meta, robots: { index: false, follow: false } };

export default async function RootLayout({ children }: { readonly children: ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html lang="de" data-theme={theme}>
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            {t.shell.brand}
          </Link>
          <nav>
            <Link href="/">{t.shell.navYield}</Link>
            <Link href="/status">{t.shell.navOperations}</Link>
          </nav>
          <div className="site-tools">
            <LiveIndicator />
            <ThemeSwitch initial={theme} />
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">{t.shell.footer}</footer>
      </body>
    </html>
  );
}
