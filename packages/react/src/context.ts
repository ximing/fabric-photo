import { createContext, type Context, type Dispatch, type SetStateAction } from 'react';
import type { Editor } from '@gmi/fp-core';
import type { ToolSettings } from './tool-settings';

/** UI 层状态（core 不存）：工具设置及其 setter。 */
export interface EditorUIState {
    toolSettings: ToolSettings;
    setToolSettings: Dispatch<SetStateAction<ToolSettings>>;
}

export const EditorContext: Context<Editor | null> = createContext<Editor | null>(null);
export const EditorUIContext: Context<EditorUIState | null> = createContext<EditorUIState | null>(null);
