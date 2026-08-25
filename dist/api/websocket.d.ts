import { FastifyInstance } from 'fastify';
/**
 * WEBSOCKET LIVE UPDATES
 * ======================
 * Clients connect to `ws(s)://<host>/ws` and receive a JSON-encoded
 * `RealtimeEvent` every time a job/queue/worker/DLQ mutation happens
 * anywhere in the system (see `event-bus.ts`). This replaces dashboard
 * polling with push-based updates.
 *
 * On connect we also send a `HELLO` frame with the current server time
 * so clients can confirm the socket is live, and we respond to simple
 * `PING` text frames with `PONG` for client-side liveness checks.
 */
export declare function registerWebsocket(fastify: FastifyInstance): Promise<void>;
