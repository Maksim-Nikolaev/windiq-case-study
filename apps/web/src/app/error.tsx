'use client';

import { useEffect } from 'react';
import { t } from '@/lib/texts.ts';

interface ErrorPageProps {
  readonly reset: () => void;
}

const RETRY_MS = 10_000;

export default function ErrorPage({ reset }: ErrorPageProps) {
  useEffect(() => {
    const retry = setTimeout(reset, RETRY_MS);

    return () => clearTimeout(retry);
  }, [reset]);

  return (
    <section className="card">
      <h1>{t.failure.title}</h1>
      <p className="muted">{t.failure.text}</p>
      <button type="button" className="button" onClick={reset}>
        {t.failure.retry}
      </button>
    </section>
  );
}
