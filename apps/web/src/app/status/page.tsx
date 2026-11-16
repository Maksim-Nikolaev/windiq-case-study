import { DataTable } from '@/components/DataTable.tsx';
import { Disclosure } from '@/components/Disclosure.tsx';
import { Fact, Hero } from '@/components/Hero.tsx';
import { fetchStatus } from '@/lib/api.ts';
import { f } from '@/lib/format.ts';
import { t } from '@/lib/texts.ts';

export const dynamic = 'force-dynamic';

const COMMIT_LENGTH = 7;

export default async function StatusPage() {
  const s = t.status;
  const status = await fetchStatus();
  const { total, failed } = status.runsLast24h;
  const successShare = total === 0 ? 0 : (total - failed) / total;
  const freshness =
    status.latestValidMeasurementAt === null || status.dataAgeMinutes === null
      ? s.firstRun
      : s.freshness(f.dateTime(status.latestValidMeasurementAt), f.number(status.dataAgeMinutes));
  const rejectedKinds = status.rejectedMasterData.map((kind) => t.masterKinds[kind]).join(', ');

  return (
    <>
      <div className="page-head">
        <h1>{s.title}</h1>
        <p className="muted">{s.asOf(f.dateTime(status.now))}</p>
      </div>

      <div className="view">
        <Hero
          question={s.question}
          value={
            <span
              className={`headline headline-${status.dataFreshness}`}
              data-testid="status-headline"
            >
              {s.headlines[status.dataFreshness]}
            </span>
          }
          statement={
            <>
              {freshness}
              {rejectedKinds === '' ? null : (
                <strong className="warning" data-testid="master-data-warning">
                  {s.masterDataRejected(rejectedKinds)}
                </strong>
              )}
            </>
          }
        >
          <Fact
            label={s.successLabel}
            note={s.successNote(f.number(total - failed), f.number(total))}
          >
            {f.percent(successShare)}
          </Fact>
          <Fact label={s.lastPollLabel} note={s.lastPollNote}>
            {status.lastPollSuccessAt === null ? t.noValue : f.dateTime(status.lastPollSuccessAt)}
          </Fact>
          <Fact label={s.versionLabel} note={s.versionNote(f.dateTime(status.startedAt))}>
            {status.version.slice(0, COMMIT_LENGTH)}
          </Fact>
        </Hero>

        <div className="disclosures">
          <Disclosure title={s.runsTitle} hint={s.runsHint(f.number(failed))}>
            <p className="muted">{s.runsText}</p>
            <DataTable
              head={s.runsHead}
              empty={s.runsEmpty}
              rows={status.runs.map((run) => [
                f.dateTime(run.startedAt),
                t.runKinds[run.kind],
                run.outcome === 'ok' ? s.ok : s.failed,
                f.duration(run.durationMs),
                f.number(run.rowsNew),
                f.number(run.rowsCorrected),
                f.number(run.rowsRejected),
                run.errorMessage ?? '',
              ])}
            />
          </Disclosure>

          <Disclosure title={s.monitoringTitle} hint={s.monitoringHint}>
            <ul className="plain-list">
              {s.monitoring.map((item) => (
                <li key={item}>{item}</li>
              ))}
              <li>
                <a href="/api/docs">{s.apiDocs}</a>
              </li>
              <li>
                {status.lastReconcileAt === null
                  ? s.noReconcile
                  : s.lastReconcile(f.dateTime(status.lastReconcileAt))}
              </li>
            </ul>
          </Disclosure>
        </div>
      </div>
    </>
  );
}
