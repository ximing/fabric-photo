/**
 * Utility functions for type checking, object manipulation, and browser detection
 */

/**
 * Type definitions
 */
type PropertyKey = string | number | symbol;

interface BrowserInfo {
    chrome: boolean;
    firefox: boolean;
    safari: boolean;
    msie: boolean;
    edge: boolean;
    others: boolean;
    version: number;
}

interface CreateObjectFunction {
    <T>(obj: T): T;
}

interface InheritFunction {
    (subType: new (...args: unknown[]) => unknown, superType: new (...args: unknown[]) => unknown): void;
}

interface StampFunction {
    <T extends { __xm_id?: number }>(obj: T): number;
}

interface PickFunction {
    <T>(obj: T, ...paths: PropertyKey[]): unknown;
}

interface InArrayFunction {
    <T>(val: T, arr: T[] | null | undefined, startIndex?: number): boolean;
}

interface CompareJSONFunction {
    (...objects: unknown[]): boolean;
}

interface ClampFunction {
    (value: number, minValue: number, maxValue: number): number;
}

interface KeyMirrorFunction {
    <T extends string>(...args: T[]): Record<T, T>;
}

interface MakeStyleTextFunction {
    (styleObj: Record<string, string>): string;
}

interface ForEachArrayFunction {
    <T>(arr: T[], iteratee: (value: T, index: number, arr: T[]) => boolean | void, context?: unknown): void;
}

interface ForEachOwnPropertiesFunction {
    <T extends Record<string, unknown>>(
        obj: T,
        iteratee: (value: T[keyof T], key: string, obj: T) => boolean | void,
        context?: unknown
    ): void;
}

interface ForEachFunction {
    <T>(
        obj: T[] | Record<string, unknown>,
        iteratee: (value: unknown, key: string | number, obj: T[] | Record<string, unknown>) => boolean | void,
        context?: unknown
    ): void;
}

interface MapFunction {
    <T, U>(obj: T[] | Record<string, unknown>, iteratee: (...args: unknown[]) => U, context?: unknown): U[];
}

interface BindFunction {
    <T extends (...args: unknown[]) => unknown>(fn: T, obj: unknown): T;
    <T extends (...args: unknown[]) => unknown>(fn: T, obj: unknown, ...args: unknown[]): (...args: unknown[]) => unknown;
}

interface ExtendFunction {
    <T extends Record<string, unknown>>(target: T, ...objects: Partial<T>[]): T;
}

interface SetStyleFunction {
    (obj: CSSStyleDeclaration, css: Record<string, string>): void;
}

/**
 * Utility functions
 */
function isExisty(param: unknown): boolean {
    return param != null;
}

function isUndefined(obj: unknown): obj is undefined {
    return obj === void 0;
}

function isNull(obj: unknown): obj is null {
    return obj === null;
}

function isTruthy(obj: unknown): boolean {
    return isExisty(obj) && obj !== false;
}

function isFalsy(obj: unknown): boolean {
    return !isTruthy(obj);
}

function isArguments(obj: unknown): boolean {
    const result = isExisty(obj) && (toString.call(obj) === '[object Arguments]' || !!(obj as { callee?: unknown })?.callee);
    return result;
}

function isArray(obj: unknown): obj is unknown[] {
    return Array.isArray(obj);
}

function isFunction(obj: unknown): obj is (...args: unknown[]) => unknown {
    return obj instanceof Function;
}

function createObject(): CreateObjectFunction {
    function F() {}

    return function<T>(obj: T): T {
        F.prototype = obj as object;
        return new (F as unknown as new () => T)();
    };
}

function inherit(subType: new (...args: unknown[]) => unknown, superType: new (...args: unknown[]) => unknown): void {
    const prototype = createObject()(superType.prototype);
    (prototype as { constructor: typeof subType }).constructor = subType;
    subType.prototype = prototype;
}

let lastId = 0;

function stamp<T extends { __xm_id?: number }>(obj: T): number {
    obj.__xm_id = obj.__xm_id || ++lastId;
    return obj.__xm_id;
}

function pick<T>(obj: T, ...paths: PropertyKey[]): unknown {
    let target: unknown = obj;
    const length = arguments.length;
    try {
        for (let i = 1; i < length; i++) {
            target = (target as Record<string, unknown>)[String(arguments[i])];
        }
        return target;
    } catch {
        return;
    }
}

function hasStamp(obj: unknown): boolean {
    return isExisty(pick(obj, '__xm_id'));
}

function resetLastId(): void {
    lastId = 0;
}

function inArray<T>(val: T, arr: T[] | null | undefined, startIndex = 0): boolean {
    arr = arr || [];
    const len = arr.length;
    for (let i = startIndex; i < len; i++) {
        if (arr[i] === val) {
            return true;
        }
    }
    return false;
}

function compareJSON(...objects: unknown[]): boolean {
    let leftChain: unknown[];
    let rightChain: unknown[];
    const argsLen = arguments.length;

    function isSameObject(x: unknown, y: unknown): boolean {
        let p: string;

        if (isNaN(x as number) && isNaN(y as number) && isNumber(x) && isNumber(y)) {
            return true;
        }

        if (x === y) {
            return true;
        }

        if (
            (isFunction(x) && isFunction(y)) ||
            (x instanceof Date && y instanceof Date) ||
            (x instanceof RegExp && y instanceof RegExp) ||
            (x instanceof String && y instanceof String) ||
            (x instanceof Number && y instanceof Number)
        ) {
            return x.toString() === y.toString();
        }

        if (!(x instanceof Object && y instanceof Object)) {
            return false;
        }

        if (
            (x as object).isPrototypeOf(y as object) ||
            (y as object).isPrototypeOf(x as object) ||
            (x as unknown as { constructor: unknown }).constructor !== (y as unknown as { constructor: unknown }).constructor ||
            (x as unknown as { prototype: unknown }).prototype !== (y as unknown as { prototype: unknown }).prototype
        ) {
            return false;
        }

        if (leftChain.indexOf(x) > -1 || rightChain.indexOf(y) > -1) {
            return false;
        }

        for (p in y as object) {
            if (((y as Record<string, unknown>).hasOwnProperty(p) !== (x as Record<string, unknown>).hasOwnProperty(p))) {
                return false;
            } else if (typeof (y as Record<string, unknown>)[p] !== typeof (x as Record<string, unknown>)[p]) {
                return false;
            }
        }

        for (p in x as object) {
            if (((y as Record<string, unknown>).hasOwnProperty(p) !== (x as Record<string, unknown>).hasOwnProperty(p))) {
                return false;
            } else if (typeof (y as Record<string, unknown>)[p] !== typeof (x as Record<string, unknown>)[p]) {
                return false;
            }

            if (typeof (x as Record<string, unknown>)[p] === 'object' || typeof (x as Record<string, unknown>)[p] === 'function') {
                leftChain.push(x);
                rightChain.push(y);

                if (!isSameObject((x as Record<string, unknown>)[p], (y as Record<string, unknown>)[p])) {
                    return false;
                }

                leftChain.pop();
                rightChain.pop();
            } else if ((x as Record<string, unknown>)[p] !== (y as Record<string, unknown>)[p]) {
                return false;
            }
        }

        return true;
    }

    if (argsLen < 1) {
        return true;
    }

    for (let i = 1; i < argsLen; i++) {
        leftChain = [];
        rightChain = [];

        if (!isSameObject(arguments[0], arguments[i])) {
            return false;
        }
    }

    return true;
}

function clamp(value: number, minValue: number, maxValue: number): number {
    let temp: number;
    if (minValue > maxValue) {
        temp = minValue;
        minValue = maxValue;
        maxValue = temp;
    }

    return Math.max(minValue, Math.min(value, maxValue));
}

function keyMirror<T extends string>(...args: T[]): Record<T, T> {
    const obj: Record<T, T> = {} as Record<T, T>;

    args.forEach((key) => {
        obj[key] = key;
    });

    return obj;
}

function makeStyleText(styleObj: Record<string, string>): string {
    let styleStr = '';
    Object.keys(styleObj).forEach((key) => {
        styleStr += `${key}: ${styleObj[key]};`;
    });

    return styleStr;
}

/**
 * Browser detection
 */
const browser: BrowserInfo = {
    chrome: false,
    firefox: false,
    safari: false,
    msie: false,
    edge: false,
    others: false,
    version: 0
};

const nav = typeof window !== 'undefined' ? window.navigator : ({} as Navigator);
const appName = nav.appName ? nav.appName.replace(/\s/g, '_') : '';
const userAgent = nav.userAgent || '';

const rIE = /MSIE\s([0-9]+[.0-9]*)/;
const rIE11 = /Trident.*rv:11\./;
const rEdge = /Edge\/(\d+)\./;
const versionRegex: Record<string, RegExp> = {
    firefox: /Firefox\/(\d+)\./,
    chrome: /Chrome\/(\d+)\./,
    safari: /Version\/([\d\.]+)\sSafari\/(\d+)/
};

type DetectorFunction = () => void;

interface Detector {
    [key: string]: DetectorFunction;
    Microsoft_Internet_Explorer: DetectorFunction;
    Netscape: DetectorFunction;
}

const detector: Detector = {
    Microsoft_Internet_Explorer() {
        // ie8 ~ ie10
        browser.msie = true;
        const match = userAgent.match(rIE);
        browser.version = match ? parseFloat(match[1]) : 0;
    },
    Netscape() {
        let detected = false;

        if (rIE11.exec(userAgent)) {
            browser.msie = true;
            browser.version = 11;
            detected = true;
        } else if (rEdge.exec(userAgent)) {
            const match = userAgent.match(rEdge);
            browser.edge = true;
            browser.version = match ? parseFloat(match[1]) : 0;
            detected = true;
        } else {
            for (const key in versionRegex) {
                if (versionRegex.hasOwnProperty(key)) {
                    const tmp = userAgent.match(versionRegex[key]);
                    if (tmp && tmp.length > 1) {
                        detected = true;
                        if (key === 'firefox') browser.firefox = true;
                        else if (key === 'chrome') browser.chrome = true;
                        else if (key === 'safari') browser.safari = true;
                        browser.version = parseFloat(tmp[1] || '0');
                        break;
                    }
                }
            }
        }
        if (!detected) {
            browser.others = true;
        }
    }
};

const fn = detector[appName];

if (typeof fn === 'function') {
    fn();
}

function forEachArray<T>(arr: T[], iteratee: (value: T, index: number, arr: T[]) => boolean | void, context?: unknown): void {
    const index = 0;
    const len = arr.length;

    const ctx = context || null;

    for (let i = index; i < len; i++) {
        if (iteratee.call(ctx, arr[i], i, arr) === false) {
            break;
        }
    }
}

function forEachOwnProperties<T extends Record<string, unknown>>(
    obj: T,
    iteratee: (value: T[keyof T], key: string, obj: T) => boolean | void,
    context?: unknown
): void {
    const ctx = context || null;

    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            if (iteratee.call(ctx, obj[key], key, obj) === false) {
                break;
            }
        }
    }
}

function forEach<T>(
    obj: T[] | Record<string, unknown>,
    iteratee: (value: unknown, key: string | number, obj: T[] | Record<string, unknown>) => boolean | void,
    context?: unknown
): void {
    if (Array.isArray(obj)) {
        forEachArray(obj as T[], iteratee as (value: T, index: number, arr: T[]) => boolean | void, context);
    } else {
        forEachOwnProperties(obj as Record<string, unknown>, iteratee as (value: unknown, key: string, obj: Record<string, unknown>) => boolean | void, context);
    }
}

function map<T, U>(obj: T[] | Record<string, unknown>, iteratee: (...args: unknown[]) => U, context?: unknown): U[] {
    const resultArray: U[] = [];

    const ctx = context || null;

    forEach(obj, function(...args: unknown[]) {
        resultArray.push(iteratee.apply(ctx, args));
    });

    return resultArray;
}

function isObject(obj: unknown): obj is Record<string, unknown> {
    return obj === Object(obj);
}

function isString(obj: unknown): obj is string {
    return typeof obj === 'string' || obj instanceof String;
}

function isNumber(obj: unknown): obj is number {
    return typeof obj === 'number' || obj instanceof Number;
}

function bind<T extends (...args: unknown[]) => unknown>(
    fn: T,
    obj: unknown,
    ...additionalArgs: unknown[]
): (...args: unknown[]) => unknown {
    return function(...args: unknown[]): unknown {
        return fn.apply(obj, additionalArgs.concat(args));
    };
}

function extend<T extends Record<string, unknown>>(target: T, ...objects: Partial<T>[]): T {
    let source: Record<string, unknown>;
    let prop: string;
    const hasOwnProp = Object.prototype.hasOwnProperty;
    let i: number;
    const len = arguments.length;

    for (i = 1; i < len; i++) {
        source = arguments[i] as Record<string, unknown>;
        for (prop in source) {
            if (hasOwnProp.call(source, prop)) {
                (target as Record<string, unknown>)[prop] = source[prop];
            }
        }
    }
    return target;
}

function setStyle(obj: { style: { setProperty: (prop: string, value: string) => void } }, css: Record<string, string>): void {
    for (const atr in css) {
        obj.style.setProperty(atr, css[atr]);
    }
}

/**
 * Default export with all utility functions
 */
const util = {
    createObject: createObject(),
    inherit: inherit,
    isFunction: isFunction,
    isArray: isArray,
    isArguments: isArguments,
    isString: isString,
    isNumber: isNumber,
    isFalsy: isFalsy,
    isObject: isObject,
    isTruthy: isTruthy,
    isNull: isNull,
    isUndefined: isUndefined,
    compareJSON: compareJSON,
    hasStamp: hasStamp,
    resetLastId: resetLastId,
    stamp: stamp,
    pick: pick,
    clamp: clamp,
    keyMirror: keyMirror,
    browser: browser,
    makeStyleText: makeStyleText,
    forEach: forEach,
    map: map,
    isExisty: isExisty,
    bind: bind,
    extend: extend,
    setStyle: setStyle,
    inArray: inArray
};

export default util;
