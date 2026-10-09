import type { EditorObject } from './model/doc';
import type { EditorMode, EditorState, Viewport } from './state/editor-state';

/** 编辑器语义事件表。loadImage/clearImage/objectAdded/objectRemoved 由后续任务的高级 API fire。 */
export type EditorEventMap = {
    change: { state: EditorState; prev: EditorState };
    'change:mode': { mode: EditorMode; prevMode: EditorMode };
    'change:selection': { selection: readonly string[] };
    'change:viewport': { viewport: Viewport };
    /** 背景图开始从 URL 加载（`isLoadingImage` 为 true）。成功落盘见 `loadImage`。 */
    loadImageStart: { url: string; name: string };
    loadImage: { name: string; width: number; height: number };
    /** 背景/贴图加载失败（CORS/404/坏 dataURL 等）。promise API 仍 reject；渲染层投影失败也会 fire。 */
    loadImageError: { url: string; error: unknown };
    clearImage: Record<string, never>;
    historyChange: { undoSize: number; redoSize: number };
    objectAdded: { object: EditorObject };
    objectRemoved: { id: string };
};

type AnyHandler = (payload: never) => void;

/** 类型化事件发射器（内核内部使用，不对外导出）。 */
export class Emitter<EventMap> {
    private readonly handlers = new Map<keyof EventMap, Set<AnyHandler>>();

    on<K extends keyof EventMap>(name: K, handler: (payload: EventMap[K]) => void): void {
        let set = this.handlers.get(name);
        if (set === undefined) {
            set = new Set();
            this.handlers.set(name, set);
        }
        set.add(handler as AnyHandler);
    }

    once<K extends keyof EventMap>(name: K, handler: (payload: EventMap[K]) => void): void {
        const wrapped = (payload: EventMap[K]): void => {
            this.off(name, wrapped);
            handler(payload);
        };
        this.on(name, wrapped);
    }

    off<K extends keyof EventMap>(name: K, handler?: (payload: EventMap[K]) => void): void {
        const set = this.handlers.get(name);
        if (set === undefined) {
            return;
        }
        if (handler === undefined) {
            this.handlers.delete(name);
            return;
        }
        set.delete(handler as AnyHandler);
        if (set.size === 0) {
            this.handlers.delete(name);
        }
    }

    emit<K extends keyof EventMap>(name: K, payload: EventMap[K]): void {
        const set = this.handlers.get(name);
        if (set === undefined) {
            return;
        }
        for (const handler of [...set]) {
            (handler as (p: EventMap[K]) => void)(payload);
        }
    }

    clear(): void {
        this.handlers.clear();
    }
}
