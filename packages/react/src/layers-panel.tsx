import { useRef, useState, type DragEvent, type JSX, type MouseEvent } from 'react';
import { ArrowUpRight, Circle, Eye, EyeOff, Grid3x3, Image, Lock, Pencil, Slash, Square, Triangle, Type, Unlock } from 'lucide-react';
import type { EditorObject } from '@gmi/fp-core';
import { useEditor, useEditorState } from './hooks';

export interface LayersPanelProps {
    className?: string;
}

/** 类型标记（lucide 图标 + 名称基础词）；shape/path 按子类型细分。 */
function typeInfo(obj: EditorObject): { icon: JSX.ElementType; baseName: string } {
    switch (obj.kind) {
        case 'image':
            return { icon: Image, baseName: '图片' };
        case 'text':
            return { icon: Type, baseName: '文本' };
        case 'shape':
            if (obj.shapeType === 'rect') {
                return { icon: Square, baseName: '矩形' };
            }
            if (obj.shapeType === 'circle') {
                return { icon: Circle, baseName: '圆形' };
            }
            return { icon: Triangle, baseName: '三角形' };
        case 'path':
            if (obj.tool === 'arrow') {
                return { icon: ArrowUpRight, baseName: '箭头' };
            }
            if (obj.tool === 'line') {
                return { icon: Slash, baseName: '直线' };
            }
            return { icon: Pencil, baseName: '画笔' };
        case 'mosaic':
            return { icon: Grid3x3, baseName: '马赛克' };
    }
}

/** id → 展示名（kind 中文名 + 同类序号，序号按 doc 顺序自底向上递增）。 */
function layerNames(objects: readonly EditorObject[]): Map<string, string> {
    const counts = new Map<string, number>();
    const names = new Map<string, string>();
    for (const obj of objects) {
        const { baseName } = typeInfo(obj);
        const seq = (counts.get(baseName) ?? 0) + 1;
        counts.set(baseName, seq);
        names.set(obj.id, `${baseName} ${seq}`);
    }
    return names;
}

interface DropIndicator {
    id: string;
    /** 视觉上半区 = z 序更高（display 为 doc 倒序）。 */
    above: boolean;
}

/**
 * 图层面板：列出 doc.objects（顶层在前 = 数组倒序），每项带类型图标、名称
 * （kind 中文名 + 同类序号）、隐藏/锁定切换按钮。点击项 selectObjects([id])，
 * Shift+点击加选/减选；HTML5 拖拽排序落账 moveObjectToIndex；选中项高亮；
 * 空列表显示占位文案。零编辑逻辑，全部交互走 core 公开 API。
 */
export function LayersPanel(props: LayersPanelProps): JSX.Element {
    const editor = useEditor();
    const objects = useEditorState((state) => state.doc.objects);
    const selection = useEditorState((state) => state.selection);
    const dragIdRef = useRef<string | null>(null);
    const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);

    const names = layerNames(objects);
    // 顶层在前：doc 数组倒序显示
    const display = [...objects].reverse();

    const onItemClick = (event: MouseEvent, id: string): void => {
        if (event.shiftKey) {
            const next = selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id];
            editor.selectObjects(next);
        } else {
            editor.selectObjects([id]);
        }
    };

    const onDragStart = (event: DragEvent, id: string): void => {
        dragIdRef.current = id;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', id);
    };

    const onDragOver = (event: DragEvent, id: string): void => {
        if (dragIdRef.current === null || dragIdRef.current === id) {
            return;
        }
        event.preventDefault(); // 允许 drop
        event.dataTransfer.dropEffect = 'move';
        const rect = event.currentTarget.getBoundingClientRect();
        const above = event.clientY < rect.top + rect.height / 2;
        setDropIndicator({ id, above });
    };

    const onDrop = (event: DragEvent, targetId: string): void => {
        event.preventDefault();
        const dragId = dragIdRef.current;
        setDropIndicator(null);
        if (dragId === null || dragId === targetId) {
            return;
        }
        // 与 moveObjectToIndex 的「最终数组下标」语义对齐：先在移除拖拽项的序列里
        // 定位目标项，视觉上方（above）= z 序更高 = 下标 +1
        const ids = objects.map((o) => o.id).filter((id) => id !== dragId);
        const targetPos = ids.indexOf(targetId);
        if (targetPos < 0) {
            return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        const above = event.clientY < rect.top + rect.height / 2;
        editor.moveObjectToIndex(dragId, above ? targetPos + 1 : targetPos);
    };

    const onDragEnd = (): void => {
        dragIdRef.current = null;
        setDropIndicator(null);
    };

    const rootClassName = props.className === undefined ? 'fp-layers-panel' : `fp-layers-panel ${props.className}`;
    return (
        <div className={rootClassName}>
            <div className="fp-layers-header">图层</div>
            {display.length === 0 ? (
                <div className="fp-layers-empty">暂无图层，使用左侧工具绘制</div>
            ) : (
                <ul className="fp-layers-list">
                    {display.map((obj) => {
                        const { icon: Icon, baseName } = typeInfo(obj);
                        const selected = selection.includes(obj.id);
                        const hidden = obj.hidden === true;
                        const locked = obj.locked === true;
                        const indicator = dropIndicator?.id === obj.id ? dropIndicator : null;
                        const itemClassName = [
                            'fp-layer-item',
                            selected ? 'fp-layer-item-selected' : '',
                            hidden ? 'fp-layer-item-hidden' : '',
                            indicator !== null ? (indicator.above ? 'fp-layer-item-drop-above' : 'fp-layer-item-drop-below') : ''
                        ]
                            .filter((c) => c !== '')
                            .join(' ');
                        return (
                            <li
                                key={obj.id}
                                className={itemClassName}
                                draggable
                                aria-label={names.get(obj.id) ?? baseName}
                                aria-selected={selected}
                                onClick={(event) => onItemClick(event, obj.id)}
                                onDragStart={(event) => onDragStart(event, obj.id)}
                                onDragOver={(event) => onDragOver(event, obj.id)}
                                onDrop={(event) => onDrop(event, obj.id)}
                                onDragEnd={onDragEnd}
                            >
                                <Icon size={14} aria-hidden className="fp-layer-item-icon" />
                                <span className="fp-layer-item-name">{names.get(obj.id)}</span>
                                <button
                                    type="button"
                                    className={hidden ? 'fp-layer-btn fp-layer-btn-active' : 'fp-layer-btn'}
                                    aria-label={hidden ? `显示 ${names.get(obj.id) ?? ''}` : `隐藏 ${names.get(obj.id) ?? ''}`}
                                    aria-pressed={hidden}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        editor.toggleObjectHidden(obj.id);
                                    }}
                                >
                                    {hidden ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
                                </button>
                                <button
                                    type="button"
                                    className={locked ? 'fp-layer-btn fp-layer-btn-active' : 'fp-layer-btn'}
                                    aria-label={locked ? `解锁 ${names.get(obj.id) ?? ''}` : `锁定 ${names.get(obj.id) ?? ''}`}
                                    aria-pressed={locked}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        editor.toggleObjectLocked(obj.id);
                                    }}
                                >
                                    {locked ? <Lock size={14} aria-hidden /> : <Unlock size={14} aria-hidden />}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
