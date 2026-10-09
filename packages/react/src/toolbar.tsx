import { Fragment, type JSX } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
    ArrowUpRight,
    Crop,
    Grid3x3,
    Hand,
    MousePointer2,
    Pencil,
    RotateCw,
    Slash,
    Square,
    Type
} from 'lucide-react';
import { useEditor, useEditorState, useIsLoadingImage, useToolSettings } from './hooks';
import { activateTool, modeToTool, type ToolId } from './tool-settings';

export interface ToolDef {
    id: ToolId;
    icon: LucideIcon;
    label: string;
    shortcut?: string; // T8 快捷键展示用
}

/** 工具定义。数组顺序保持稳定（外部可能按下标取）；坞上的视觉顺序见 TOOL_GROUPS。rotate 是动作，不产生 active 态。 */
export const TOOLS: ToolDef[] = [
    { id: 'select', icon: MousePointer2, label: '选择', shortcut: 'V' },
    { id: 'crop', icon: Crop, label: '裁剪', shortcut: 'C' },
    { id: 'rotate', icon: RotateCw, label: '旋转', shortcut: 'R' },
    { id: 'arrow', icon: ArrowUpRight, label: '箭头', shortcut: 'A' },
    { id: 'freedraw', icon: Pencil, label: '画笔', shortcut: 'P' },
    { id: 'line', icon: Slash, label: '直线', shortcut: 'L' },
    { id: 'shape', icon: Square, label: '形状', shortcut: 'S' },
    { id: 'text', icon: Type, label: '文字', shortcut: 'T' },
    { id: 'mosaic', icon: Grid3x3, label: '马赛克', shortcut: 'M' },
    { id: 'pan', icon: Hand, label: '平移', shortcut: 'H' }
];

/** 视觉分组（无眉题，名字只放在 role="group" 上）。组间一条分隔。 */
const TOOL_GROUPS: { label: string; ids: ToolId[] }[] = [
    { label: '查看', ids: ['select', 'pan'] },
    { label: '标注', ids: ['arrow', 'freedraw', 'line', 'shape', 'text', 'mosaic'] },
    { label: '照片', ids: ['crop', 'rotate'] }
];

const TOOL_BY_ID = new Map(TOOLS.map((tool) => [tool.id, tool]));

/**
 * 底部工具坞里的工具条：10 个工具一次点击可达，短标签始终可见。
 * active = modeToTool(当前 mode) === tool.id；rotate 是动作（rotate 90°）无 active 态。
 * 点击 mode 工具 → activateTool；再次点击已激活的 mode 工具 → editor.endAll() 回 normal。
 * `editor.isLoadingImage` 时全部按钮 disabled。不做 roving tabindex。
 */
export function Toolbar(props: { className?: string }): JSX.Element {
    const editor = useEditor();
    const { toolSettings } = useToolSettings();
    const activeTool = useEditorState((state) => modeToTool(state.mode));
    const loading = useIsLoadingImage();

    const handleClick = (tool: ToolDef): void => {
        if (editor.isLoadingImage) {
            return;
        }
        if (tool.id !== 'rotate' && activeTool === tool.id) {
            editor.endAll();
            return;
        }
        activateTool(editor, tool.id, toolSettings);
    };

    const rootClassName = props.className === undefined ? 'fp-toolbar' : `fp-toolbar ${props.className}`;
    return (
        <div className={rootClassName} role="toolbar" aria-label="工具">
            {TOOL_GROUPS.map((group, groupIndex) => (
                <Fragment key={group.label}>
                    {groupIndex > 0 ? <span className="fp-tool-sep" aria-hidden="true" /> : null}
                    <div className="fp-tool-group" role="group" aria-label={group.label}>
                        {group.ids.map((id) => {
                            const tool = TOOL_BY_ID.get(id);
                            if (tool === undefined) {
                                return null;
                            }
                            const isActive = tool.id !== 'rotate' && activeTool === tool.id;
                            const btnClassName = isActive ? 'fp-tool-btn fp-tool-btn-active' : 'fp-tool-btn';
                            // lucide-react 0.344 的类型基于 React 18 JSX 命名空间，与 @types/react 19
                            // 的 ReactNode 不兼容；运行时是标准 FC，渲染处收窄为 JSX.ElementType
                            const Icon = tool.icon as unknown as JSX.ElementType;
                            return (
                                <button
                                    key={tool.id}
                                    type="button"
                                    className={btnClassName}
                                    title={tool.shortcut === undefined ? tool.label : `${tool.label} (${tool.shortcut})`}
                                    aria-pressed={isActive}
                                    aria-disabled={loading}
                                    disabled={loading}
                                    onClick={() => handleClick(tool)}
                                >
                                    <Icon size={16} aria-hidden />
                                    <span className="fp-tool-btn-label">{tool.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </Fragment>
            ))}
        </div>
    );
}
