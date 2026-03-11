/**
 * Canvas to Blob conversion utility
 * Provides polyfill for canvas.toBlob() and dataURLtoBlob() function
 * Created by yeanzhi on 16/12/12.
 */

interface BlobBuilder {
    append(data: ArrayBuffer | string): void;
    getBlob(mediaType?: string): Blob;
}

interface DataURLtoBlobFunction {
    (dataURI: string): Blob;
}

declare global {
    interface Window {
        BlobBuilder?: new () => BlobBuilder;
        WebKitBlobBuilder?: new () => BlobBuilder;
        MozBlobBuilder?: new () => BlobBuilder;
        MSBlobBuilder?: new () => BlobBuilder;
    }
}

const hasWindow = typeof window !== 'undefined';

let hasBlobConstructor = false;
if (hasWindow && window.Blob) {
    try {
        hasBlobConstructor = Boolean(new Blob());
    } catch {
        hasBlobConstructor = false;
    }
}

let hasArrayBufferViewSupport = false;
if (hasBlobConstructor && hasWindow && window.Uint8Array) {
    try {
        hasArrayBufferViewSupport = new Blob([new Uint8Array(100)]).size === 100;
    } catch {
        hasArrayBufferViewSupport = false;
    }
}

let BlobBuilder: (new () => BlobBuilder) | undefined;
if (hasWindow) {
    BlobBuilder =
        window.BlobBuilder ||
        window.WebKitBlobBuilder ||
        window.MozBlobBuilder ||
        window.MSBlobBuilder;
}

const dataURIPattern = /^data:((.*?)(;charset=.*?)?)(;base64)?,/;

// eslint-disable-next-line import/no-mutable-exports
let dataURLtoBlob: DataURLtoBlobFunction | false = false;

// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
if (
    Boolean(hasBlobConstructor || BlobBuilder) &&
    hasWindow &&
    typeof window.atob === 'function' &&
    typeof window.ArrayBuffer === 'function' &&
    typeof window.Uint8Array === 'function'
) {
    dataURLtoBlob = function (dataURI: string): Blob {
        const matches = dataURI.match(dataURIPattern);
        if (!matches) {
            throw new Error('invalid data URI');
        }
        // Default to text/plain;charset=US-ASCII
        const mediaType = matches[2]
            ? matches[1]
            : `text/plain${matches[3] || ';charset=US-ASCII'}`;
        const isBase64 = Boolean(matches[4]);
        const dataString = dataURI.slice(matches[0].length);
        let byteString: string;
        if (isBase64) {
            // Convert base64 to raw binary data held in a string:
            byteString = atob(dataString);
        } else {
            // Convert base64/URLEncoded data component to raw binary:
            byteString = decodeURIComponent(dataString);
        }
        // Write the bytes of the string to an ArrayBuffer:
        const arrayBuffer = new ArrayBuffer(byteString.length);
        const intArray = new Uint8Array(arrayBuffer);
        for (let i = 0; i < byteString.length; i += 1) {
            intArray[i] = byteString.charCodeAt(i);
        }
        // Write the ArrayBuffer (or ArrayBufferView) to a blob:
        if (hasBlobConstructor) {
            return new Blob([hasArrayBufferViewSupport ? intArray : arrayBuffer], {
                type: mediaType
            });
        }
        const bb = new BlobBuilder!();
        bb.append(arrayBuffer);
        return bb.getBlob(mediaType);
    };
}

if (hasWindow && window.HTMLCanvasElement && dataURLtoBlob) {
    const canvasProto = window.HTMLCanvasElement.prototype as any;
    if (!canvasProto.toBlob) {
        if (canvasProto.mozGetAsFile) {
            canvasProto.toBlob = function (
                callback: BlobCallback,
                type?: string | null,
                quality?: number | null
            ): void {
                const qualityArg = quality ?? undefined;
                if (canvasProto.toDataURL) {
                    callback(dataURLtoBlob(canvasProto.toDataURL(type ?? undefined, qualityArg)));
                } else {
                    callback(canvasProto.mozGetAsFile('blob', type ?? undefined));
                }
            };
        } else if (canvasProto.toDataURL) {
            canvasProto.toBlob = function (
                callback: BlobCallback,
                type?: string | null,
                quality?: number | null
            ): void {
                const qualityArg = quality ?? undefined;
                callback(dataURLtoBlob(canvasProto.toDataURL(type ?? undefined, qualityArg)));
            };
        }
    }
}

export default dataURLtoBlob;

// Expose to window for backwards compatibility
if (hasWindow) {
    (window as any).dataURLtoBlob = dataURLtoBlob;
}
