/**
 * Event emitter for custom events
 * Provides minimal EventEmitter interface for browser compatibility
 */

interface EventEmitter {
    on(event: string, listener: (...args: unknown[]) => void): this;
    once(event: string, listener: (...args: unknown[]) => void): this;
    addListener(event: string, listener: (...args: unknown[]) => void): this;
    removeListener(event: string, listener: (...args: unknown[]) => void): this;
    removeAllListeners(event?: string): this;
    emit(event: string, ...args: unknown[]): boolean;
    listeners(event: string): ((...args: unknown[]) => void)[];
    listenerCount(event: string): number;
    setMaxListeners(n: number): this;
    getMaxListeners(): number;
    eventNames(): (string | symbol)[];
    listenerCount(type: string | symbol): number;
}

// Declare events module (typically from Node.js, polyfilled for browser)
declare const EventEmitter: {
    new (): EventEmitter;
};

const eventEmitter: EventEmitter = new EventEmitter();

export default eventEmitter;
