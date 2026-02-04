import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
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
});
