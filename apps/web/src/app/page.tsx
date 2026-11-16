import Link from 'next/link';
import { BankView } from '@/components/views/BankView.tsx';
import { GutachterView } from '@/components/views/GutachterView.tsx';
import { ProjektiererView } from '@/components/views/ProjektiererView.tsx';
import {
  fetchDataQuality,
  fetchYieldBreakdown,
  fetchYieldHistory,
  fetchYieldOverview,
  type ReadyYieldOverview,
} from '@/lib/api.ts';
import { f } from '@/lib/format.ts';
import { t } from '@/lib/texts.ts';

export const dynamic = 'force-dynamic';

type View = 'gutachter' | 'projektierer' | 'bank';

interface PageProps {
  readonly searchParams: Promise<{ readonly sicht?: string }>;
}

interface ViewProps {
  readonly view: View;
  readonly overview: ReadyYieldOverview;
}

const VIEWS: readonly View[] = ['gutachter', 'projektierer', 'bank'];

function parseView(value: string | undefined): View {
  return VIEWS.find((view) => view === value) ?? 'gutachter';
}

async function ViewContent({ view, overview }: ViewProps) {
  const { result, inputs, hours } = overview;

  if (view === 'projektierer') {
    return (
      <ProjektiererView result={result} inputs={inputs} breakdown={await fetchYieldBreakdown()} />
    );
  }

  if (view === 'bank') {
    return <BankView result={result} inputs={inputs} history={await fetchYieldHistory()} />;
  }

  const [breakdown, quality] = await Promise.all([fetchYieldBreakdown(), fetchDataQuality()]);

  return (
    <GutachterView
      result={result}
      inputs={inputs}
      hours={hours}
      breakdown={breakdown}
      quality={quality}
    />
  );
}

export default async function YieldPage({ searchParams }: PageProps) {
  const view = parseView((await searchParams).sicht);
  const overview = await fetchYieldOverview();

  if (overview.state === 'pending') {
    return (
      <section className="card view">
        <h1>{t.pending.title}</h1>
        <p className="muted">{t.pending.text}</p>
      </section>
    );
  }

  return (
    <>
      <div className="page-head">
        <h1>{overview.inputs.site.name}</h1>
        <p className="muted">
          {t.shell.lastHour(overview.inputs.turbine.name, f.dateTime(overview.result.windowEnd))}
        </p>
      </div>

      <nav className="segments" aria-label={t.shell.viewsLabel}>
        {VIEWS.map((item) => (
          <Link
            key={item}
            href={`/?sicht=${item}`}
            className={item === view ? 'segment segment-active' : 'segment'}
            aria-current={item === view ? 'page' : undefined}
            scroll={false}
          >
            {t.shell.views[item]}
          </Link>
        ))}
      </nav>

      <div className="view" key={view}>
        <ViewContent view={view} overview={overview} />
      </div>
    </>
  );
}
