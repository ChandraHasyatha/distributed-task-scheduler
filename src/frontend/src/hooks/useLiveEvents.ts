import { useEffect, useRef, useState } from 'react';
import { RealtimeEvent } from '../types/index.js';

const WS_URL = 'ws://localhost:4000/ws';

/**
 * WEBSOCKET LIVE UPDATES (bonus feature)
 * =======================================
 * Connects to the backend's /ws endpoint and calls `onEvent` for every
 * job/queue/worker/DLQ change pushed by the server (see
 * core/events/event-bus.ts on the backend). Pages use this instead of —
 * or alongside — polling to refresh instantly when something changes.
 *
 * Reconnects automatically with a short backoff if the connection drops.
 * Returns the current connection status so the UI can show a live
 * indicator (e.g. a green "Live" dot vs "Reconnecting...").
 */
export function useLiveEvents(onEvent?: (event: RealtimeEvent) => void) {
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closedByEffect = false;

    const connect = () => {
      socket = new WebSocket(WS_URL);

      socket.onopen = () => setConnected(true);

      socket.onmessage = (msg) => {
        try {
          const event: RealtimeEvent = JSON.parse(msg.data);
          onEventRef.current?.(event);
        } catch {
          // ignore malformed frames
        }
      };

      socket.onclose = () => {
        setConnected(false);
        if (!closedByEffect) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      closedByEffect = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  return { connected };
}
