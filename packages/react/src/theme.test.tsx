import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useThemeState, type ThemeState } from './theme';

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
    cleanup();
    localStorage.clear();
});

function Probe(props: { onState: (s: ThemeState) => void }): null {
    props.onState(useThemeState());
    return null;
}

describe('useThemeState', () => {
    it('jsdom 无 matchMedia 时默认 light；toggle 后 dark 并写 localStorage("fp-theme")', () => {
        let state: ThemeState | null = null;
        render(<Probe onState={(s) => (state = s)} />);
        expect(state!.theme).toBe('light');

        act(() => state!.toggleTheme());
        expect(state!.theme).toBe('dark');
        expect(localStorage.getItem('fp-theme')).toBe('dark');

        act(() => state!.toggleTheme());
        expect(state!.theme).toBe('light');
        expect(localStorage.getItem('fp-theme')).toBe('light');
    });

    it('localStorage 已有 fp-theme=dark 时初值 dark', () => {
        localStorage.setItem('fp-theme', 'dark');
        let state: ThemeState | null = null;
        render(<Probe onState={(s) => (state = s)} />);
        expect(state!.theme).toBe('dark');
    });

    it('localStorage.setItem 抛错（禁用/沙箱）时 toggle 不崩且 theme 照常切换', () => {
        const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('denied', 'SecurityError');
        });
        try {
            let state: ThemeState | null = null;
            render(<Probe onState={(s) => (state = s)} />);
            expect(state!.theme).toBe('light');

            expect(() => act(() => state!.toggleTheme())).not.toThrow();
            expect(state!.theme).toBe('dark');

            expect(() => act(() => state!.toggleTheme())).not.toThrow();
            expect(state!.theme).toBe('light');
        } finally {
            spy.mockRestore();
        }
    });

    it('localStorage.getItem 抛错（禁用/沙箱）时初始化回退系统偏好（jsdom → light）', () => {
        const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new DOMException('denied', 'SecurityError');
        });
        try {
            let state: ThemeState | null = null;
            render(<Probe onState={(s) => (state = s)} />);
            expect(state!.theme).toBe('light');
        } finally {
            spy.mockRestore();
        }
    });
});
