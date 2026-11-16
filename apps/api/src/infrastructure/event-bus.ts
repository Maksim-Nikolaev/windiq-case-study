import type { AppEvent, EventPublisher } from '../application/ports.ts';

export type EventListener = (event: AppEvent) => void;

export interface EventBus extends EventPublisher {
  subscribe(listener: EventListener): () => void;
}

export function createEventBus(): EventBus {
  const listeners = new Set<EventListener>();

  return {
    publish(event: AppEvent): void {
      for (const listener of listeners) {
        listener(event);
      }
    },

    subscribe(listener: EventListener): () => void {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}
