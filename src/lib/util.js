const {min, max} = Math;
function isUndefined(obj) {
    return obj === void 0;
}

function isNull(obj) {
    return obj === null;
}

function isTruthy(obj) {
    return isExisty(obj) && obj !== false;
}

function isFalsy(obj) {
    return !isTruthy(obj);
}

function isArguments(obj) {
    var result = isExisty(obj) &&
        ((toString.call(obj) === '[object Arguments]') || !!obj.callee);

    return result;
}

function isArray(obj) {
    return Array.isArray(obj);
}

function isFunction(obj) {
    return obj instanceof Function;
}

function createObject() {
    function F() {}

    return function(obj) {
        F.prototype = obj;
        return new F();
    };
}

function inherit(subType, superType) {
    var prototype = createObject(superType.prototype);
    prototype.constructor = subType;
    subType.prototype = prototype;
}

var lastId = 0;

function stamp(obj) {
    obj.__xm_id = obj.__xm_id || ++lastId;
    return obj.__xm_id;
}

function pick(obj, paths) {
    var args = arguments,
        target = args[0],
        length = args.length,
        i;
    try {
        for (i = 1; i < length; i++) {
            target = target[args[i]];
        }
        return target;
    }
    catch (e) {
        return;
    }
}

function hasStamp(obj) {
    return isExisty(pick(obj, '__xm_id'));
}

function resetLastId() {
    lastId = 0;
}
function inArray (val,arr,startIndex = 0) {
    arr = arr || [];
    let len = arr.length;
    for (let i = startIndex; i < len; i++) {
        if (arr[i] === val) {
            return true;
        }
    }
    return false;
};
function compareJSON(object) {
    var leftChain,
        rightChain,
        argsLen = arguments.length,
        i;

    function isSameObject(x, y) {
        var p;

        if (isNaN(x) &&
            isNaN(y) &&
            isNumber(x) &&
            isNumber(y)) {
            return true;
        }

        if (x === y) {
            return true;
        }

        if ((isFunction(x) && isFunction(y)) ||
            (x instanceof Date && y instanceof Date) ||
            (x instanceof RegExp && y instanceof RegExp) ||
            (x instanceof String && y instanceof String) ||
            (x instanceof Number && y instanceof Number)) {
            return x.toString() === y.toString();
        }

        if (!(x instanceof Object && y instanceof Object)) {
            return false;
        }

        if (x.isPrototypeOf(y) ||
            y.isPrototypeOf(x) ||
            x.constructor !== y.constructor ||
            x.prototype !== y.prototype) {
            return false;
        }

        if (inArray(x, leftChain) > -1 ||
            inArray(y, rightChain) > -1) {
            return false;
        }

        for (p in y) {
            if (y.hasOwnProperty(p) !== x.hasOwnProperty(p)) {
                return false;
            }
            else if (typeof y[p] !== typeof x[p]) {
                return false;
            }
        }

        for (p in x) {
            if (y.hasOwnProperty(p) !== x.hasOwnProperty(p)) {
                return false;
            }
            else if (typeof y[p] !== typeof x[p]) {
                return false;
            }

            if (typeof (x[p]) === 'object' || typeof (x[p]) === 'function') {
                leftChain.push(x);
                rightChain.push(y);

                if (!isSameObject(x[p], y[p])) {
                    return false;
                }

                leftChain.pop();
                rightChain.pop();
            }
            else if (x[p] !== y[p]) {
                return false;
            }
        }

        return true;
    }

    if (argsLen < 1) {
        return true;
    }

    for (i = 1; i < argsLen; i++) {
        leftChain = [];
        rightChain = [];

        if (!isSameObject(arguments[0], arguments[i])) {
            return false;
        }
    }

    return true;
}


function clamp(value, minValue, maxValue) {
    let temp;
    if (minValue > maxValue) {
        temp = minValue;
        minValue = maxValue;
        maxValue = temp;
    }

    return max(minValue, min(value, maxValue));
}

function keyMirror(...args) {
    const obj = {};

    args.forEach(key => {
        obj[key] = key;
    });

    return obj;
}

function makeStyleText(styleObj) {
    let styleStr = '';
    Object.keys(styleObj).forEach(key => {
        styleStr += `${key}: ${styleObj[key]};`;
    });

    return styleStr;
}
var browser = {
    chrome: false,
    firefox: false,
    safari: false,
    msie: false,
    edge: false,
    others: false,
    version: 0
};
var nav = window.navigator,
    appName = nav.appName.replace(/\s/g, '_'),
    userAgent = nav.userAgent;

var rIE = /MSIE\s([0-9]+[.0-9]*)/,
    rIE11 = /Trident.*rv:11\./,
    rEdge = /Edge\/(\d+)\./,
    versionRegex = {
        'firefox': /Firefox\/(\d+)\./,
        'chrome': /Chrome\/(\d+)\./,
        'safari': /Version\/([\d\.]+)\sSafari\/(\d+)/
    };

var key, tmp;

var detector = {
    'Microsoft_Internet_Explorer': function() {
        // ie8 ~ ie10
        browser.msie = true;
        browser.version = parseFloat(userAgent.match(rIE)[1]);
    },
    'Netscape': function() {
        var detected = false;

        if (rIE11.exec(userAgent)) {
            browser.msie = true;
            browser.version = 11;
            detected = true;
        }
        else if (rEdge.exec(userAgent)) {
            browser.edge = true;
            browser.version = userAgent.match(rEdge)[1];
            detected = true;
        }
        else {
            for (key in versionRegex) {
                if (versionRegex.hasOwnProperty(key)) {
                    tmp = userAgent.match(versionRegex[key]);
                    if (tmp && tmp.length > 1) {
                        browser[key] = detected = true;
                        browser.version = parseFloat(tmp[1] || 0);
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

var fn = detector[appName];

if (fn) {
    detector[appName]();
}

function forEachArray(arr, iteratee, context) {
    var index = 0,
        len = arr.length;

    context = context || null;

    for (; index < len; index++) {
        if (iteratee.call(context, arr[index], index, arr) === false) {
            break;
        }
    }
}


function forEachOwnProperties(obj, iteratee, context) {
    var key;

    context = context || null;

    for (key in obj) {
        if (obj.hasOwnProperty(key)) {
            if (iteratee.call(context, obj[key], key, obj) === false) {
                break;
            }
        }
    }
}

function forEach(obj, iteratee, context) {
    if (Array.isArray(obj)) {
        forEachArray(obj, iteratee, context);
    }
    else {
        forEachOwnProperties(obj, iteratee, context);
    }
}
function map(obj, iteratee, context) {
    var resultArray = [];

    context = context || null;

    forEach(obj, function() {
        resultArray.push(iteratee.apply(context, arguments));
    });

    return resultArray;
}
function isExisty(param) {
    return param != null;
}

function isObject(obj) {
    return obj === Object(obj);
}

function isString(obj) {
    return typeof obj === 'string' || obj instanceof String;
}

function isNumber(obj) {
    return typeof obj === 'number' || obj instanceof Number;
}
function bind(fn, obj) {
    var slice = Array.prototype.slice;

    if (fn.bind) {
        return fn.bind.apply(fn, slice.call(arguments, 1));
    }

        /* istanbul ignore next */
    var args = slice.call(arguments, 2);

        /* istanbul ignore next */
    return function() {
            /* istanbul ignore next */
        return fn.apply(obj, args.length ? args.concat(slice.call(arguments)) : arguments);
    };
}
function extend(target, objects) {
    var source,
        prop,
        hasOwnProp = Object.prototype.hasOwnProperty,
        i,
        len;

    for (i = 1, len = arguments.length; i < len; i++) {
        source = arguments[i];
        for (prop in source) {
            if (hasOwnProp.call(source, prop)) {
                target[prop] = source[prop];
            }
        }
    }
    return target;
}
function setStyle(obj,css) {
    for(let atr in css) {
        obj.style.setProperty(atr,css[atr]);
    }
}
export default {
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
    inArray:inArray
};
