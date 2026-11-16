'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { t } from '@/lib/texts.ts';

type Connection = 'connecting' | 'live' | 'interrupted';

const STATUS_PATH = '/status';

export function LiveIndicator() {
  const router = useRouter();
  const pathname = usePathname();
  const [connection, setConnection] = useState<Connection>('connecting');
  const refreshEvent = useRef('data.changed');

  refreshEvent.current = pathname === STATUS_PATH ? 'cycle.finished' : 'data.changed';

  useEffect(() => {
    const events = new EventSource('/api/events');
    const refreshOn = (event: string) => () => {
      if (refreshEvent.current === event) {
        router.refresh();
      }
    };
    let wasInterrupted = false;

    events.addEventListener('ready', () => {
      setConnection('live');

      if (wasInterrupted) {
        router.refresh();
      }
    });
    events.addEventListener('data.changed', refreshOn('data.changed'));
    events.addEventListener('cycle.finished', refreshOn('cycle.finished'));
    events.addEventListener('error', () => {
      wasInterrupted = true;
      setConnection('interrupted');
    });

    return () => events.close();
  }, [router]);

  return (
    <span className={`live live-${connection}`} role="status" title={t.shell.liveHints[connection]}>
      <span className="live-dot" aria-hidden="true" />
      {t.shell.live[connection]}
    </span>
  );
}
