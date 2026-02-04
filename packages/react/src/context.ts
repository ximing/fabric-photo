import { createContext, type Context, type Dispatch, type SetStateAction } from 'react';
import type { Editor } from '@gmi/fp-core';
import type { Theme } from './theme';
import type { ToolSettings } from './tool-settings';

/** UI 层状态（core 不存）：工具设置 + 主题。 */
export interface EditorUIState {
    toolSettings: ToolSettings;
    setToolSettings: Dispatch<SetStateAction<ToolSettings>>;
    theme: Theme;
    toggleTheme: () => void;
}

export const EditorContext: Context<Editor | null> = createContext<Editor | null>(null);
export const EditorUIContext: Context<EditorUIState | null> = createContext<EditorUIState | null>(null);
