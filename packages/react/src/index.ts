export const VERSION = '0.1.0';

export { FabricPhotoEditor } from './editor';
export type { FabricPhotoEditorProps } from './editor';
export { CanvasView } from './canvas-view';
export type { CanvasViewProps } from './canvas-view';
export { EditorProvider } from './provider';
export type { EditorProviderProps } from './provider';
export { useEditor, useEditorState, useEditorEvent, useToolSettings } from './hooks';
export { DEFAULT_TOOL_SETTINGS, modeToTool, activateTool } from './tool-settings';
export type { ToolId, ToolSettings } from './tool-settings';
export type { EditorUIState } from './context';
