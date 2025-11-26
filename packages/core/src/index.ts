export const VERSION = '0.1.0';

export { Editor } from './editor';
export type { EditorOptions, ViewportInfo } from './editor';

export { EditorState, StepError } from './state/editor-state';
export type { EditorMode, Viewport, EditorStateConfig } from './state/editor-state';

export { Transaction } from './transform/transaction';

export { Step } from './steps/step';
export type { StepResult } from './steps/step';
export { AddObject, RemoveObject, RestoreObject, UpdateObject, ClearObjects } from './steps/object-steps';
export type { ObjectAttrs } from './steps/object-steps';
export { SetBackground, RestoreDoc, TransformDoc } from './steps/doc-steps';

export { createDoc, docToJSON, docFromJSON, cloneDoc } from './model/doc';
export type {
    Doc,
    EditorObject,
    BackgroundImage,
    BaseObject,
    ShapeObject,
    TextObject,
    PathObject,
    MosaicObject,
    MosaicRect,
    ImageObject
} from './model/doc';
export { createId } from './model/id';

export type { Plugin } from './plugins/plugin';
export { History } from './plugins/history';
export type { HistoryEntry, HistorySizes } from './plugins/history';

export type { EditorEventMap } from './events';
