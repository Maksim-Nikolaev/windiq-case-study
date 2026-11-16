import type { Logger } from './ports.ts';

export interface Scheduler {
  stop(): Promise<void>;
}

const MIN_PAUSE_MS = 1000;

export function startScheduler(
  task: () => Promise<unknown>,
  intervalMs: number,
  logger: Logger,
): Scheduler {
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  let running: Promise<void> = Promise.resolve();

  async function tick(): Promise<void> {
    const startedAtMs = Date.now();

    try {
      await task();
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'cycle failed',
      );
    }

    if (!stopped) {
      const pauseMs = Math.max(MIN_PAUSE_MS, intervalMs - (Date.now() - startedAtMs));
      timer = setTimeout(() => {
        running = tick();
      }, pauseMs);
    }
  }

  running = tick();

  return {
    async stop(): Promise<void> {
      stopped = true;

      if (timer !== null) {
        clearTimeout(timer);
      }

      await running;
    },
  };
}
