'use client';

import { useState } from 'react';
import { t } from '@/lib/texts.ts';
import { THEME_COOKIE, THEMES, type Theme } from '@/lib/theme.ts';

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

function storeTheme(theme: Theme): void {
  if ('cookieStore' in window) {
    void cookieStore.set({
      name: THEME_COOKIE,
      value: theme,
      path: '/',
      sameSite: 'lax',
      expires: Date.now() + ONE_YEAR_MS,
    });
  }
}

export function ThemeSwitch({ initial }: { readonly initial: Theme }) {
  const [theme, setTheme] = useState(initial);

  function choose(next: Theme): void {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    setTheme(next);
    storeTheme(next);

    if (reducedMotion || !('startViewTransition' in document)) {
      applyTheme(next);

      return;
    }

    document.startViewTransition(() => applyTheme(next));
  }

  return (
    <fieldset className="switch" aria-label={t.shell.themeLabel}>
      {THEMES.map((option) => (
        <button
          key={option}
          type="button"
          className={option === theme ? 'switch-option switch-option-active' : 'switch-option'}
          aria-pressed={option === theme}
          onClick={() => choose(option)}
        >
          {t.shell.themes[option]}
        </button>
      ))}
    </fieldset>
  );
}
