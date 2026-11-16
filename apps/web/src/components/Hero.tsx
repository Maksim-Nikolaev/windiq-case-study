import type { ReactNode } from 'react';

interface HeroProps {
  readonly question: string;
  readonly value: ReactNode;
  readonly statement: ReactNode;
  readonly children: ReactNode;
}

interface FactProps {
  readonly label: string;
  readonly note: string;
  readonly children: ReactNode;
}

export function Hero({ question, value, statement, children }: HeroProps) {
  return (
    <section className="hero">
      <p className="hero-question">{question}</p>
      <p className="hero-value">{value}</p>
      <p className="hero-statement">{statement}</p>
      <div className="facts">{children}</div>
    </section>
  );
}

export function Fact({ label, note, children }: FactProps) {
  return (
    <div className="fact">
      <span className="fact-label">{label}</span>
      <span className="fact-value">{children}</span>
      <span className="fact-note">{note}</span>
    </div>
  );
}
