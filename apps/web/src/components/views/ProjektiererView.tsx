import { ChartCard } from '@/components/charts/ChartCard.tsx';
import { MonthlyEnergyChart } from '@/components/charts/charts.tsx';
import { Fact, Hero } from '@/components/Hero.tsx';
import type { YieldBreakdown, YieldInputs, YieldResult } from '@/lib/api.ts';
import { f } from '@/lib/format.ts';
import { t } from '@/lib/texts.ts';

interface ProjektiererViewProps {
  readonly result: YieldResult;
  readonly inputs: YieldInputs;
  readonly breakdown: YieldBreakdown;
}

export function ProjektiererView({ result, inputs, breakdown }: ProjektiererViewProps) {
  const best = breakdown.months.reduce(
    (top, month) => (month.netMwh > top.netMwh ? month : top),
    breakdown.months[0] ?? { month: '', netMwh: 0 },
  );

  return (
    <>
      <Hero
        question={t.developer.question}
        value={
          <>
            <span data-testid="hero-value">{f.number(result.p50Mwh)}</span>
            <span className="hero-unit">{t.shell.mwhPerYear}</span>
          </>
        }
        statement={t.developer.statement(inputs.turbine.name)}
      >
        <Fact label={t.developer.fullLoadLabel} note={t.developer.fullLoadNote}>
          {f.number(result.fullLoadHours)}
        </Fact>
        <Fact label={t.developer.capacityLabel} note={t.developer.capacityNote}>
          {f.percent(result.capacityFactor)}
        </Fact>
        <Fact
          label={t.developer.windLabel}
          note={t.developer.windNote(f.number(inputs.turbine.hubHeightM))}
        >
          {f.number(result.meanHubWindSpeedMs, 1)}
        </Fact>
      </Hero>

      <ChartCard
        title={t.developer.monthlyTitle}
        subtitle={t.developer.monthlySubtitle(
          best.month === '' ? t.noValue : f.month(best.month),
          f.number(best.netMwh),
        )}
        tableHead={t.developer.monthlyHead}
        tableRows={breakdown.months.map((month) => [
          f.month(month.month),
          f.number(month.netMwh, 1),
          f.number(month.grossMwh, 1),
          t.developer.validOfExpected(f.number(month.validHours), f.number(month.expectedHours)),
        ])}
      >
        <MonthlyEnergyChart months={breakdown.months} />
      </ChartCard>
    </>
  );
}
