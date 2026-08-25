import { EventEmitter } from 'events';
class EventBus extends EventEmitter {
    publish(type, payload) {
        const event = {
            type,
            payload,
            timestamp: new Date().toISOString(),
        };
        this.emit('event', event);
    }
    subscribe(handler) {
        this.on('event', handler);
        return () => this.off('event', handler);
    }
}
// Increase max listeners since every connected WebSocket client subscribes.
export const eventBus = new EventBus();
eventBus.setMaxListeners(0);
//# sourceMappingURL=event-bus.js.map