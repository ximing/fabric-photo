import type { JSX } from 'react';

/** 固定色板（7 色）；自定义取色走原生 input[type=color]。 */
export const PALETTE_COLORS = ['#ff0000', '#ffff00', '#00ff00', '#0000ff', '#808080', '#000000', '#ffffff'] as const;

/** input[type=color] 只接受 #rrggbb；对象上的颜色可能是命名色/transparent，非法值回退黑色避免控件异常。 */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function toColorInputValue(value: string): string {
    return HEX_COLOR.test(value) ? value : '#000000';
}

export interface ColorPaletteProps {
    value: string;
    onChange: (color: string) => void;
    className?: string;
    /** 自定义取色 input 的 aria-label（默认「自定义颜色」）；属性面板按字段名传入以区分多个色板。 */
    inputLabel?: string;
}

/**
 * 色板：7 个固定色块按钮 + 1 个原生自定义取色 input。纯受控组件，
 * 改色是否实时生效由调用方的 onChange 决定（见 tool-settings.applyColor 路由）。
 * 视觉样式（20x20 圆角带边框格子、白色块可见边框）由 className 占位，T9 统一落地。
 */
export function ColorPalette(props: ColorPaletteProps): JSX.Element {
    const rootClassName =
        props.className === undefined ? 'fp-color-palette' : `fp-color-palette ${props.className}`;
    return (
        <div className={rootClassName} role="group" aria-label="色板">
            {PALETTE_COLORS.map((color) => {
                const isActive = props.value.toLowerCase() === color;
                return (
                    <button
                        key={color}
                        type="button"
                        className={isActive ? 'fp-swatch fp-swatch-active' : 'fp-swatch'}
                        style={{ backgroundColor: color }}
                        aria-label={`色板 ${color}`}
                        aria-pressed={isActive}
                        onClick={() => props.onChange(color)}
                    />
                );
            })}
            <input
                type="color"
                className="fp-color-custom"
                aria-label={props.inputLabel ?? '自定义颜色'}
                value={toColorInputValue(props.value)}
                onChange={(event) => props.onChange(event.target.value)}
            />
        </div>
    );
}
