/**
 * Custom event system implementation
 */

import util from './util';

const R_EVENTNAME_SPLIT = /\s+/g; // eslint-disable-line

/**
 * Handler item stored in events array
 */
interface HandlerItem {
    handler: (...args: unknown[]) => unknown;
    context?: unknown;
}

/**
 * Event handlers map: eventName -> HandlerItem[]
 */
type EventsMap = Record<string, HandlerItem[]>;

/**
 * Context reference count map: context -> count
 */
type ContextsMap = [unknown, number][];

/**
 * Custom events mixin class
 */
class CustomEvents {
    events: EventsMap | null;
    contexts: ContextsMap | null;

    constructor() {
        this.events = null;
        this.contexts = null;
    }

    /**
     * Mix CustomEvents prototype to a function's prototype
     * @param func - Function to mix into
     */
    static mixin(func: new (...args: unknown[]) => CustomEvents): void {
        Object.assign(func.prototype, CustomEvents.prototype);
    }

    /**
     * Create a handler item
     * @param handler - Handler function
     * @param context - Optional context
     * @returns Handler item
     */
    _getHandlerItem(handler: (...args: unknown[]) => unknown, context?: unknown): HandlerItem {
        const item: HandlerItem = {
            handler: handler
        };

        if (context) {
            item.context = context;
        }

        return item;
    }

    /**
     * Get or create safe event array for event name
     * @param eventName - Event name
     * @returns Event handler array or events map
     */
    _safeEvent(eventName?: string): HandlerItem[] | EventsMap {
        let events = this.events as EventsMap;

        if (!events) {
            events = this.events = {};
        }

        if (eventName) {
            let byName = events[eventName];

            if (!byName) {
                byName = [];
                events[eventName] = byName;
            }

            return byName;
        }

        // Return events map when no eventName provided
        return events;
    }

    /**
     * Get or create safe context array
     * @returns Context array
     */
    _safeContext(): ContextsMap {
        let context = this.contexts as ContextsMap;

        if (!context) {
            context = this.contexts = [];
        }

        return context;
    }

    /**
     * Find index of context in contexts array
     * @param ctx - Context to find
     * @returns Index or -1
     */
    _indexOfContext(ctx: unknown): number {
        const context = this._safeContext();
        let index = 0;

        while (context[index]) {
            if (ctx === context[index][0]) {
                return index;
            }

            index += 1;
        }

        return -1;
    }

    /**
     * Memorize context (increment reference count)
     * @param ctx - Context to memorize
     */
    _memorizeContext(ctx?: unknown): void {
        let context: ContextsMap;
        let index: number;

        if (!util.isExisty(ctx)) {
            return;
        }

        context = this._safeContext();
        index = this._indexOfContext(ctx);

        if (index > -1) {
            context[index][1] += 1;
        } else {
            context.push([ctx, 1]);
        }
    }

    /**
     * Forget context (decrement reference count)
     * @param ctx - Context to forget
     */
    _forgetContext(ctx?: unknown): void {
        let context: ContextsMap;
        let contextIndex: number;

        if (!util.isExisty(ctx)) {
            return;
        }

        context = this._safeContext();
        contextIndex = this._indexOfContext(ctx);

        if (contextIndex > -1) {
            context[contextIndex][1] -= 1;

            if (context[contextIndex][1] <= 0) {
                context.splice(contextIndex, 1);
            }
        }
    }

    /**
     * Bind event handler
     * @param eventName - Event name
     * @param handler - Handler function
     * @param context - Context
     */
    _bindEvent(eventName: string, handler: (...args: unknown[]) => unknown, context?: unknown): void {
        const events = this._safeEvent(eventName) as HandlerItem[];
        this._memorizeContext(context);
        events.push(this._getHandlerItem(handler, context));
    }

    /**
     * Bind event handlers
     * @param eventName - Event name(s) or {name: handler} object
     * @param handler - Handler function or context
     * @param context - Context for binding
     */
    on(
        eventName: string | Record<string, (...args: unknown[]) => unknown>,
        handler?: ((...args: unknown[]) => unknown) | unknown,
        context?: unknown
    ): void {
        const self = this;

        if (util.isString(eventName)) {
            // [syntax 1, 2]
            const names = eventName.split(R_EVENTNAME_SPLIT);
            names.forEach((name: string) => {
                self._bindEvent(
                    name,
                    handler as (...args: unknown[]) => unknown,
                    context
                );
            });
        } else if (util.isObject(eventName)) {
            // [syntax 3, 4]
            const targetContext = handler;
            const eventObj = eventName as Record<string, (...args: unknown[]) => unknown>;
            Object.keys(eventObj).forEach((name: string) => {
                self.on(name, eventObj[name], targetContext);
            });
        }
    }

    /**
     * Bind one-shot event handlers
     * @param eventName - Event name(s) or {name: handler} object
     * @param handler - Handler function or context
     * @param context - Context for binding
     */
    once(
        eventName: string | Record<string, (...args: unknown[]) => unknown>,
        handler?: ((...args: unknown[]) => unknown) | unknown,
        context?: unknown
    ): void {
        const self = this;

        if (util.isObject(eventName)) {
            const targetContext = handler;
            const eventObj = eventName as Record<string, (...args: unknown[]) => unknown>;
            Object.keys(eventObj).forEach((name: string) => {
                self.once(name, eventObj[name], targetContext);
            });
            return;
        }

        const eventNameStr = eventName as string;
        const handlerFunc = handler as (...args: unknown[]) => unknown;

        function onceHandler(...args: unknown[]): void {
            handlerFunc.apply(context, args);
            self.off(eventNameStr, onceHandler);
        }

        this.on(eventNameStr, onceHandler, context);
    }

    /**
     * Splice array by predicate result
     * @param arr - Array to splice
     * @param predicate - Predicate function
     */
    _spliceMatches(
        arr: HandlerItem[],
        predicate: (item: HandlerItem) => boolean
    ): void {
        let i: number;
        let len: number;

        if (!util.isArray(arr)) {
            return;
        }

        for (i = 0, len = arr.length; i < len; i += 1) {
            if (predicate(arr[i]) === true) {
                arr.splice(i, 1);
                len -= 1;
                i -= 1;
            }
        }
    }

    /**
     * Get matcher for unbind specific handler events
     * @param handler - Handler function
     * @returns Handler matcher
     */
    _matchHandler(handler: (...args: unknown[]) => unknown): (item: HandlerItem) => boolean {
        const self = this;

        return function(item: HandlerItem): boolean {
            const needRemove = handler === item.handler;

            if (needRemove) {
                self._forgetContext(item.context);
            }

            return needRemove;
        };
    }

    /**
     * Get matcher for unbind specific context events
     * @param context - Context
     * @returns Context matcher
     */
    _matchContext(context: unknown): (item: HandlerItem) => boolean {
        const self = this;

        return function(item: HandlerItem): boolean {
            const needRemove = context === item.context;

            if (needRemove) {
                self._forgetContext(item.context);
            }

            return needRemove;
        };
    }

    /**
     * Get matcher for unbind specific handler and context pair events
     * @param handler - Handler function
     * @param context - Context
     * @returns Handler and context matcher
     */
    _matchHandlerAndContext(
        handler: (...args: unknown[]) => unknown,
        context: unknown
    ): (item: HandlerItem) => boolean {
        const self = this;

        return function(item: HandlerItem): boolean {
            const matchHandler = handler === item.handler;
            const matchContext = context === item.context;
            const needRemove = matchHandler && matchContext;

            if (needRemove) {
                self._forgetContext(item.context);
            }

            return needRemove;
        };
    }

    /**
     * Unbind event by event name
     * @param eventName - Event name
     * @param handler - Handler function
     */
    _offByEventName(eventName: string, handler?: (...args: unknown[]) => unknown): void {
        const self = this;
        const andByHandler = util.isFunction(handler);

        const names = eventName.split(R_EVENTNAME_SPLIT);

        names.forEach((name: string) => {
            const handlerItems = self._safeEvent(name) as HandlerItem[];

            if (andByHandler && handler) {
                const matchHandler = self._matchHandler(handler);
                self._spliceMatches(handlerItems, matchHandler);
            } else {
                handlerItems.forEach((item: HandlerItem) => {
                    self._forgetContext(item.context);
                });

                if (self.events) {
                    self.events[name] = [];
                }
            }
        });
    }

    /**
     * Unbind event by handler function
     * @param handler - Handler function
     */
    _offByHandler(handler: (...args: unknown[]) => unknown): void {
        const self = this;
        const matchHandler = this._matchHandler(handler);
        const events = this._safeEvent() as EventsMap;

        Object.keys(events).forEach((eventName: string) => {
            const handlerItems = events[eventName];
            if (handlerItems) {
                self._spliceMatches(handlerItems, matchHandler);
            }
        });
    }

    /**
     * Unbind event by object (context or {name: handler} pair)
     * @param obj - Context or {name: handler} object
     * @param handler - Handler function or event name
     */
    _offByObject(
        obj: unknown,
        handler?: ((...args: unknown[]) => unknown) | string
    ): void {
        const self = this;
        let matchFunc: (item: HandlerItem) => boolean;

        if (this._indexOfContext(obj) < 0) {
            const eventObj = obj as Record<string, (...args: unknown[]) => unknown>;
            Object.keys(eventObj).forEach((name: string) => {
                self.off(name, eventObj[name]);
            });
        } else if (util.isString(handler)) {
            matchFunc = this._matchContext(obj);

            self._spliceMatches(this._safeEvent(handler) as HandlerItem[], matchFunc);
        } else if (util.isFunction(handler)) {
            matchFunc = this._matchHandlerAndContext(
                handler as (...args: unknown[]) => unknown,
                obj
            );

            const events = this._safeEvent() as EventsMap;
            Object.keys(events).forEach((eventName: string) => {
                const handlerItems = events[eventName];
                if (handlerItems) {
                    self._spliceMatches(handlerItems, matchFunc);
                }
            });
        } else {
            matchFunc = this._matchContext(obj);

            const events = this._safeEvent() as EventsMap;
            Object.keys(events).forEach((eventName: string) => {
                const handlerItems = events[eventName];
                if (handlerItems) {
                    self._spliceMatches(handlerItems, matchFunc);
                }
            });
        }
    }

    /**
     * Unbind custom events
     * @param eventName - Event name(s) or context or handler
     * @param handler - Handler function
     */
    off(
        eventName?: string | ((...args: unknown[]) => unknown) | Record<string, (...args: unknown[]) => unknown>,
        handler?: ((...args: unknown[]) => unknown) | string
    ): void {
        if (util.isString(eventName)) {
            // [syntax 1, 2]
            this._offByEventName(eventName, handler as (...args: unknown[]) => unknown);
        } else if (!arguments.length) {
            // [syntax 8]
            this.events = {};
            this.contexts = [];
        } else if (util.isFunction(eventName)) {
            // [syntax 3]
            this._offByHandler(eventName);
        } else if (util.isObject(eventName)) {
            // [syntax 4, 5, 6]
            this._offByObject(eventName, handler as ((...args: unknown[]) => unknown) | string);
        }
    }

    /**
     * Fire custom event
     * @param eventName - Event name
     * @param args - Event arguments
     */
    fire(eventName: string, ...args: unknown[]): void {
        this.invoke(eventName, ...args);
    }

    // alias
    emit = this.fire;

    /**
     * Fire event and return boolean AND of all listener results
     * @param eventName - Event name
     * @param args - Event arguments
     * @returns Boolean AND result
     */
    invoke(eventName: string, ...args: unknown[]): boolean {
        let events: HandlerItem[];
        let index = 0;
        let item: HandlerItem;

        if (!this.hasListener(eventName)) {
            return true;
        }

        events = this._safeEvent(eventName) as HandlerItem[];

        while (events[index]) {
            item = events[index];

            if (item.handler.apply(item.context, args) === false) {
                return false;
            }

            index += 1;
        }

        return true;
    }

    /**
     * Check if there is at least one handler registered
     * @param eventName - Event name
     * @returns Has listener
     */
    hasListener(eventName: string): boolean {
        return this.getListenerLength(eventName) > 0;
    }

    /**
     * Get count of registered events
     * @param eventName - Event name
     * @returns Number of events
     */
    getListenerLength(eventName: string): number {
        const events = this._safeEvent(eventName) as HandlerItem[];
        return events.length;
    }
}

export default CustomEvents;
