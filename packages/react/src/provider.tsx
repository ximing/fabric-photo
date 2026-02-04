import { useMemo, useState, type JSX, type ReactNode } from 'react';
import type { Editor } from '@gmi/fp-core';
import { EditorContext, EditorUIContext, type EditorUIState } from './context';
import { useThemeState, type ThemeState } from './theme';
import { DEFAULT_TOOL_SETTINGS, type ToolSettings } from './tool-settings';

export interface EditorProviderProps {
    /** 显式注入（FabricPhotoEditor 或测试创建的无头 Editor）。 */
    editor: Editor;
    /** FabricPhotoEditor 注入（根 div 也要用 theme 挂 data-theme）；缺省内部自建。 */
    themeState?: ThemeState;
    children: ReactNode;
}

/** 提供 Editor 实例、UI 层工具设置与主题；自身不创建 Editor（由调用方持有生命周期）。 */
export function EditorProvider(props: EditorProviderProps): JSX.Element {
    const [toolSettings, setToolSettings] = useState<ToolSettings>(DEFAULT_TOOL_SETTINGS);
    const fallbackTheme = useThemeState();
    const themeState = props.themeState ?? fallbackTheme;
    const uiState = useMemo<EditorUIState>(
        () => ({ toolSettings, setToolSettings, theme: themeState.theme, toggleTheme: themeState.toggleTheme }),
        [toolSettings, themeState]
    );
    return (
        <EditorContext.Provider value={props.editor}>
            <EditorUIContext.Provider value={uiState}>{props.children}</EditorUIContext.Provider>
        </EditorContext.Provider>
    );
}
