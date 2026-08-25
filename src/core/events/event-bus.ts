import { EventEmitter } from 'events';

/**
 * Central in-process pub/sub bus. Every service that mutates job/queue/
 * worker/DLQ state publishes here; the WebSocket layer (see
 * `api/websocket.ts`) subscribes and fans events out to connected
 * dashboard clients in real time.
 *
 * Kept deliberately dependency-free (Node's built-in EventEmitter) so it
 * works identically in-process for a single API instance. For a multi-
 * instance API deployment this would be backed by Postgres LISTEN/NOTIFY
 * or a message broker (Redis pub/sub) — the publish/subscribe surface
 * below is designed so swapping the transport doesn't touch call sites.
 */
export type RealtimeEventType =
  | 'JOB_CREATED'
  | 'JOB_UPDATED'
  | 'QUEUE_UPDATED'
  | 'WORKER_UPDATED'
  | 'DLQ_UPDATED'
  | 'SCHEDULE_TRIGGERED';

export interface RealtimeEvent {
  type: RealtimeEventType;
  payload: Record<string, any>;
  timestamp: string;
}

class EventBus extends EventEmitter {
  publish(type: RealtimeEventType, payload: Record<string, any>): void {
    const event: RealtimeEvent = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };
    this.emit('event', event);
  }

  subscribe(handler: (event: RealtimeEvent) => void): () => void {
    this.on('event', handler);
    return () => this.off('event', handler);
  }
}

// Increase max listeners since every connected WebSocket client subscribes.
export const eventBus = new EventBus();
eventBus.setMaxListeners(0);
