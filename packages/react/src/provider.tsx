import { useMemo, useState, type JSX, type ReactNode } from 'react';
import type { Editor } from '@gmi/fp-core';
import { EditorContext, EditorUIContext, type EditorUIState } from './context';
import { DEFAULT_TOOL_SETTINGS, type ToolSettings } from './tool-settings';

export interface EditorProviderProps {
    /** 显式注入（FabricPhotoEditor 或测试创建的无头 Editor）。 */
    editor: Editor;
    children: ReactNode;
}

/** 提供 Editor 实例与 UI 层工具设置；自身不创建 Editor（由调用方持有生命周期）。 */
export function EditorProvider(props: EditorProviderProps): JSX.Element {
    const [toolSettings, setToolSettings] = useState<ToolSettings>(DEFAULT_TOOL_SETTINGS);
    const uiState = useMemo<EditorUIState>(() => ({ toolSettings, setToolSettings }), [toolSettings]);
    return (
        <EditorContext.Provider value={props.editor}>
            <EditorUIContext.Provider value={uiState}>{props.children}</EditorUIContext.Provider>
        </EditorContext.Provider>
    );
}
