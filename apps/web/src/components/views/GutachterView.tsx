import { ChartCard } from '@/components/charts/ChartCard.tsx';
import { PowerCurveChart, WindSpeedDistributionChart } from '@/components/charts/charts.tsx';
import { DataTable } from '@/components/DataTable.tsx';
import { Disclosure } from '@/components/Disclosure.tsx';
import { Fact, Hero } from '@/components/Hero.tsx';
import type {
  DataQuality,
  ReadyYieldOverview,
  YieldBreakdown,
  YieldInputs,
  YieldResult,
} from '@/lib/api.ts';
import { f } from '@/lib/format.ts';
import { reasonLabel, t } from '@/lib/texts.ts';

interface GutachterViewProps {
  readonly result: YieldResult;
  readonly inputs: YieldInputs;
  readonly hours: ReadyYieldOverview['hours'];
  readonly breakdown: YieldBreakdown;
  readonly quality: DataQuality;
}

interface CalculationStep {
  readonly label: string;
  readonly formula: string;
  readonly valueMwh: number;
}

const STEP_DELAY_S = 0.08;

function calculationSteps(result: YieldResult, inputs: YieldInputs): CalculationStep[] {
  const { availability, electrical, wake } = inputs.site.losses;
  const afterAvailability = result.grossMwh * (1 - availability);

  return [
    {
      label: t.assessor.steps.measured,
      formula: t.assessor.steps.measuredFormula,
      valueMwh: result.measuredGrossMwh,
    },
    {
      label: t.assessor.steps.gross,
      formula: t.assessor.steps.grossFormula(
        f.count(result.interpolatedHours, t.assessor.hourForms),
        f.count(result.monthMeanHours, t.assessor.hourForms),
      ),
      valueMwh: result.grossMwh,
    },
    {
      label: t.assessor.steps.availability,
      formula: `× (1 − ${f.percent(availability)})`,
      valueMwh: afterAvailability,
    },
    {
      label: t.assessor.steps.electrical,
      formula: `× (1 − ${f.percent(electrical)})`,
      valueMwh: afterAvailability * (1 - electrical),
    },
    {
      label: t.assessor.steps.net,
      formula: `× (1 − ${f.percent(wake)}) ${t.assessor.steps.wake}`,
      valueMwh: result.netMwh,
    },
    {
      label: t.assessor.steps.p90,
      formula: `P50 × (1 − ${f.number(1.282, 3)} × ${f.percent(inputs.site.uncertainty)})`,
      valueMwh: result.p90Mwh,
    },
  ];
}

export function GutachterView({ result, inputs, hours, breakdown, quality }: GutachterViewProps) {
  const a = t.assessor;
  const steps = calculationSteps(result, inputs);
  const shearFactor =
    (inputs.turbine.hubHeightM / inputs.mast.measurementHeightM) ** inputs.site.shearExponent;
  const shownBins = breakdown.windSpeedBins.filter((bin) => bin.hours > 0);
  const unusableHours = hours.missing + hours.invalid + hours.absent;
  const turbineSource = `${inputs.turbine.id} v${inputs.turbine.version}`;
  const siteSource = `${inputs.site.id} v${inputs.site.version}`;
  const share = (count: number) => f.percent(count / result.expectedHours, 2);
  const speed = (valueMs: number | null) =>
    valueMs === null ? t.noValue : `${f.number(valueMs, 2)} m/s`;

  return (
    <>
      <Hero
        question={a.question}
        value={
          <>
            <span data-testid="hero-value">{f.number(result.p50Mwh)}</span>
            <span className="hero-unit">{t.shell.mwhPerYear}</span>
          </>
        }
        statement={a.statement(f.number(result.p90Mwh))}
      >
        <Fact label={a.grossLabel} note={a.grossNote}>
          <span data-testid="gross-value">{f.number(result.grossMwh)}</span>
        </Fact>
        <Fact label={a.lossesLabel} note={a.lossesNote}>
          {f.percent(1 - result.lossFactor)}
        </Fact>
        <Fact
          label={a.coverageLabel}
          note={a.coverageNote(f.number(result.validHours), f.number(result.expectedHours))}
        >
          {f.percent(result.coverage, 2)}
        </Fact>
      </Hero>

      <section className="card">
        <h2>{a.stepsTitle}</h2>
        <p className="muted">{a.stepsText}</p>
        <ol className="steps">
          {steps.map((step, index) => (
            <li key={step.label}>
              <div className="step-text">
                <strong>{step.label}</strong>
                <span className="muted">{step.formula}</span>
              </div>
              <div className="meter" aria-hidden="true">
                <span
                  style={{
                    width: `${(step.valueMwh / result.grossMwh) * 100}%`,
                    animationDelay: `${index * STEP_DELAY_S}s`,
                  }}
                />
              </div>
              <span className="step-value">{f.number(step.valueMwh, 1)} MWh</span>
            </li>
          ))}
        </ol>
        <p className="muted">
          {a.shear(
            f.number(inputs.turbine.hubHeightM),
            f.number(inputs.mast.measurementHeightM),
            f.number(inputs.site.shearExponent, 2),
            f.number(shearFactor, 4),
          )}
        </p>
      </section>

      <div className="disclosures">
        <Disclosure
          title={a.inputsTitle}
          hint={a.inputsHint(inputs.turbine.version, inputs.site.version)}
        >
          <DataTable
            head={a.inputsHead}
            empty=""
            rows={[
              [
                a.inputs.measurementHeight,
                `${f.number(inputs.mast.measurementHeightM)} m`,
                inputs.mast.id,
              ],
              [a.inputs.hubHeight, `${f.number(inputs.turbine.hubHeightM)} m`, turbineSource],
              [a.inputs.ratedPower, `${f.number(inputs.turbine.ratedPowerKw)} kW`, turbineSource],
              [
                a.inputs.cutInOut,
                `${f.number(inputs.turbine.cutInMs, 1)} / ${f.number(inputs.turbine.cutOutMs, 1)} m/s`,
                turbineSource,
              ],
              [a.inputs.shear, f.number(inputs.site.shearExponent, 2), siteSource],
              [a.inputs.availability, f.percent(inputs.site.losses.availability), siteSource],
              [a.inputs.electrical, f.percent(inputs.site.losses.electrical), siteSource],
              [a.inputs.wake, f.percent(inputs.site.losses.wake), siteSource],
              [a.inputs.uncertainty, f.percent(inputs.site.uncertainty), siteSource],
              [a.inputs.siteChanged, f.dateTime(inputs.site.updatedAt), inputs.site.id],
            ]}
          />
        </Disclosure>

        <Disclosure
          title={a.qualityTitle}
          hint={a.qualityHint(
            f.count(unusableHours, a.hourForms),
            f.count(quality.rejectedRows.length, a.rejectedForms),
          )}
        >
          <h3>{a.windowTitle}</h3>
          <p className="muted">
            {a.windowText(
              f.dateTime(result.windowStart),
              f.dateTime(result.windowEnd),
              f.number(result.expectedHours),
            )}
          </p>
          <DataTable
            head={a.hoursHead}
            empty=""
            rows={[
              [a.hours.valid, f.number(hours.valid), share(hours.valid)],
              [a.hours.missing, f.number(hours.missing), share(hours.missing)],
              [a.hours.invalid, f.number(hours.invalid), share(hours.invalid)],
              [a.hours.absent, f.number(hours.absent), share(hours.absent)],
            ]}
          />
          <h3>{a.unusableTitle}</h3>
          <DataTable
            head={a.unusableHead}
            empty={a.unusableEmpty}
            rows={quality.unusableHours.map((row) => [
              f.dateTime(row.measuredAt),
              row.rawValue === null ? t.noValue : `${row.rawValue} ${row.rawUnit}`,
              reasonLabel(row.reason),
            ])}
          />
          <h3>{a.rejectedTitle}</h3>
          <DataTable
            head={a.rejectedHead}
            empty={a.rejectedEmpty}
            rows={quality.rejectedRows.map((row) => [
              reasonLabel(row.reason),
              row.payload.replaceAll(',"', ', "'),
              f.dateTime(row.lastSeenAt),
            ])}
          />
        </Disclosure>

        <Disclosure
          title={a.correctionsTitle}
          hint={a.correctionsHint(f.count(quality.corrections.length, a.hourForms))}
        >
          <p className="muted">{a.correctionsText}</p>
          <DataTable
            head={a.correctionsHead}
            empty={a.correctionsEmpty}
            rows={quality.corrections.map((row) => [
              f.dateTime(row.measuredAt),
              f.number(row.revisions),
              speed(row.firstWindSpeedMs),
              speed(row.currentWindSpeedMs),
              f.dateTime(row.correctedAt),
            ])}
          />
        </Disclosure>

        <Disclosure
          title={a.distributionTitle}
          hint={a.distributionHint(f.number(result.meanHubWindSpeedMs, 1))}
        >
          <div className="grid-2">
            <ChartCard
              title={a.windChartTitle}
              subtitle={a.windChartSubtitle}
              tableHead={a.windHead}
              tableRows={shownBins.map((bin) => [
                `${bin.fromMs}–${bin.fromMs + 1}`,
                f.number(bin.hours),
                f.number(bin.grossMwh, 1),
              ])}
            >
              <WindSpeedDistributionChart bins={breakdown.windSpeedBins} />
            </ChartCard>

            <ChartCard
              title={a.curveChartTitle}
              subtitle={a.curveChartSubtitle(inputs.turbine.name)}
              tableHead={a.curveHead}
              tableRows={inputs.turbine.powerCurve.map((point) => [
                f.number(point.windSpeedMs),
                f.number(point.powerKw),
              ])}
            >
              <PowerCurveChart
                turbine={inputs.turbine}
                meanHubWindSpeedMs={result.meanHubWindSpeedMs}
              />
            </ChartCard>
          </div>
        </Disclosure>

        <Disclosure
          title={a.versionsTitle}
          hint={a.versionsHint(f.count(quality.masterDataVersions.length, a.recordForms))}
        >
          <p className="muted">{a.versionsText}</p>
          <DataTable
            head={a.versionsHead}
            empty={a.versionsEmpty}
            rows={quality.masterDataVersions.map((row) => [
              t.masterKinds[row.kind],
              row.upstreamVersion === null ? t.noValue : `v${row.upstreamVersion}`,
              row.accepted ? a.accepted : a.rejected(row.rejectReason ?? ''),
              f.dateTime(row.fetchedAt),
            ])}
          />
        </Disclosure>

        <Disclosure title={a.assumptionsTitle} hint={a.assumptionsHint}>
          <ul className="plain-list">
            {a.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </Disclosure>
      </div>
    </>
  );
}
