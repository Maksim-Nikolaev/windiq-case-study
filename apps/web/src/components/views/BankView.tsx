import Link from 'next/link';
import { ChartCard } from '@/components/charts/ChartCard.tsx';
import { YieldHistoryChart } from '@/components/charts/charts.tsx';
import { Disclosure } from '@/components/Disclosure.tsx';
import { Fact, Hero } from '@/components/Hero.tsx';
import type { YieldHistory, YieldInputs, YieldResult } from '@/lib/api.ts';
import { f } from '@/lib/format.ts';
import { t } from '@/lib/texts.ts';

interface BankViewProps {
  readonly result: YieldResult;
  readonly inputs: YieldInputs;
  readonly history: YieldHistory;
}

const HISTORY_ROWS = 48;

export function BankView({ result, inputs, history }: BankViewProps) {
  const p90Values = history.points.map((point) => point.p90Mwh);
  const lowestP90 = Math.min(...p90Values, result.p90Mwh);
  const highestP90 = Math.max(...p90Values, result.p90Mwh);

  return (
    <>
      <Hero
        question={t.bank.question}
        value={
          <>
            <span data-testid="hero-value">{f.number(result.p90Mwh)}</span>
            <span className="hero-unit">{t.shell.mwhPerYear}</span>
          </>
        }
        statement={t.bank.statement}
      >
        <Fact label={t.bank.p50Label} note={t.shell.mwhPerYear}>
          {f.number(result.p50Mwh)}
        </Fact>
        <Fact label={t.bank.marginLabel} note={t.bank.marginNote}>
          {f.percent(1 - result.p90Mwh / result.p50Mwh)}
        </Fact>
        <Fact label={t.bank.dataLabel} note={t.bank.dataNote}>
          {f.percent(result.coverage, 2)}
        </Fact>
      </Hero>

      <div className="disclosures">
        <Disclosure
          title={t.bank.historyTitle}
          hint={t.bank.historyHint(f.number(lowestP90), f.number(highestP90))}
        >
          <ChartCard
            title={t.bank.historyChartTitle}
            subtitle={t.bank.historyChartSubtitle}
            tableHead={t.bank.historyHead}
            tableRows={history.points
              .slice(-HISTORY_ROWS)
              .reverse()
              .map((point) => [
                f.dateTime(point.computedAt),
                f.number(point.p50Mwh, 1),
                f.number(point.p90Mwh, 1),
              ])}
          >
            <YieldHistoryChart points={history.points} />
          </ChartCard>
        </Disclosure>

        <Disclosure title={t.bank.basisTitle} hint={t.bank.basisHint}>
          <ul className="plain-list">
            <li>{t.bank.basisMeasurements(f.number(inputs.turbine.hubHeightM))}</li>
            <li>{t.bank.basisLosses(f.number((1 - result.lossFactor) * 100, 1))}</li>
            <li>{t.bank.basisUncertainty(f.number(inputs.site.uncertainty * 100, 1))}</li>
            <li>{t.bank.basisChanges}</li>
          </ul>
          <p>
            <Link href="/?sicht=gutachter">{t.bank.basisLink}</Link>
          </p>
        </Disclosure>
      </div>
    </>
  );
}
