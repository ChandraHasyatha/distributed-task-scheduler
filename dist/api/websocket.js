import websocketPlugin from '@fastify/websocket';
import { eventBus } from '../core/events/event-bus.js';
import { logger } from '../core/logger/index.js';
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
export async function registerWebsocket(fastify) {
    await fastify.register(websocketPlugin, {
        options: { maxPayload: 1048576 },
    });
    fastify.get('/ws', { websocket: true }, (connection) => {
        const socket = connection.socket ?? connection;
        socket.send(JSON.stringify({
            type: 'HELLO',
            payload: { message: 'Connected to Distributed Job Scheduler live feed' },
            timestamp: new Date().toISOString(),
        }));
        const unsubscribe = eventBus.subscribe((event) => {
            if (socket.readyState === socket.OPEN) {
                socket.send(JSON.stringify(event));
            }
        });
        socket.on('message', (raw) => {
            const text = raw.toString();
            if (text === 'PING') {
                socket.send('PONG');
            }
        });
        socket.on('close', () => {
            unsubscribe();
        });
        socket.on('error', (err) => {
            logger.warn({ err: err.message }, 'WebSocket client error');
            unsubscribe();
        });
    });
}
//# sourceMappingURL=websocket.js.map