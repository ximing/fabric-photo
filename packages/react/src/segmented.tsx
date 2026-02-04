import { useRef, type JSX, type KeyboardEvent } from 'react';

/** segmented 单项：value 为语义值，label 即按钮文本（可达名）。 */
export interface SegmentedOption<T> {
    value: T;
    label: string;
    disabled?: boolean;
}

const NAV_KEYS = new Set(['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End']);

/**
 * segmented 控件（radiogroup 语义）：roving tabindex + 方向键/Home/End 导航，
 * 移动即选中（与原生 radio 组一致：focus 与选中同步，触发与点击相同的 onChange），
 * 循环回绕并跳过 disabled；全部 disabled 时静默不动作。
 * 纯 UI 行为组件；视觉类名 fp-seg / fp-seg-btn / fp-seg-btn-active 由 styles.css 提供。
 */
export function SegmentedControl<T>(props: {
    ariaLabel: string;
    options: readonly SegmentedOption<T>[];
    value: T;
    onChange: (value: T) => void;
}): JSX.Element {
    const { ariaLabel, options, value, onChange } = props;
    const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

    // roving 落点：选中且可用者优先；选中项 disabled 或无选中时取第一个可用项；全 disabled 无落点
    const selectedEnabled = options.findIndex((o) => o.value === value && o.disabled !== true);
    const firstEnabled = options.findIndex((o) => o.disabled !== true);
    const tabbable = selectedEnabled >= 0 ? selectedEnabled : firstEnabled;

    const moveTo = (fromIndex: number, key: string): void => {
        const enabled: number[] = [];
        options.forEach((o, i) => {
            if (o.disabled !== true) {
                enabled.push(i);
            }
        });
        if (enabled.length === 0) {
            return;
        }
        let target: number;
        if (key === 'Home') {
            target = enabled[0];
        } else if (key === 'End') {
            target = enabled[enabled.length - 1];
        } else {
            const delta = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1;
            const pos = enabled.indexOf(fromIndex);
            const start = pos >= 0 ? pos : 0;
            target = enabled[(start + delta + enabled.length) % enabled.length];
        }
        onChange(options[target].value);
        buttonRefs.current[target]?.focus();
    };

    const handleKeyDown = (index: number) => (event: KeyboardEvent<HTMLButtonElement>): void => {
        if (!NAV_KEYS.has(event.key)) {
            return;
        }
        event.preventDefault();
        moveTo(index, event.key);
    };

    return (
        <div className="fp-seg" role="radiogroup" aria-label={ariaLabel}>
            {options.map((option, i) => (
                <button
                    key={option.label}
                    ref={(el) => {
                        buttonRefs.current[i] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={option.value === value}
                    disabled={option.disabled === true}
                    tabIndex={i === tabbable ? 0 : -1}
                    className={option.value === value ? 'fp-seg-btn fp-seg-btn-active' : 'fp-seg-btn'}
                    onClick={() => onChange(option.value)}
                    onKeyDown={handleKeyDown(i)}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}
