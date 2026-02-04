import { useCallback, useState } from 'react';

export type Theme = 'dark' | 'light';

export interface ThemeState {
    theme: Theme;
    toggleTheme: () => void;
}

const STORAGE_KEY = 'fp-theme';

/** jsdom 无 matchMedia：守卫后回退 light（真实浏览器跟随系统偏好）。 */
function systemTheme(): Theme {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
}

/**
 * 主题状态：初值 localStorage("fp-theme") → 系统偏好 → light；
 * toggle 写 localStorage（仅用户显式选择后持久化，未选择前跟随系统）。
 * localStorage 读写均 try/catch：禁用/沙箱环境（SecurityError）静默跳过持久化，主题照常切换。
 */
export function useThemeState(): ThemeState {
    const [theme, setTheme] = useState<Theme>(() => {
        let saved: string | null = null;
        try {
            saved = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
        } catch {
            saved = null;
        }
        return saved === 'dark' || saved === 'light' ? saved : systemTheme();
    });
    const toggleTheme = useCallback(() => {
        setTheme((prev) => {
            const next: Theme = prev === 'dark' ? 'light' : 'dark';
            try {
                localStorage.setItem(STORAGE_KEY, next);
            } catch {
                // localStorage 不可用（禁用/沙箱）：静默，仅内存切换
            }
            return next;
        });
    }, []);
    return { theme, toggleTheme };
}
