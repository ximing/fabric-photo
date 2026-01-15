import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, type FilterSettings } from '../model/doc';
import { buildFabricFilters, describeFilters } from './filters';

function makeFilters(overrides: Partial<FilterSettings> = {}): FilterSettings {
    return { ...DEFAULT_FILTERS, ...overrides };
}

describe('describeFilters（FilterSettings → fabric filter 纯描述）', () => {
    it('undefined（无滤镜）→ 空数组', () => {
        expect(describeFilters(undefined)).toEqual([]);
    });

    it('全默认值 → 空数组（默认值对应项不生成 filter）', () => {
        expect(describeFilters(DEFAULT_FILTERS)).toEqual([]);
    });

    it('数值项非默认才生成描述，参数原样映射（域 [-1,1] / [0,1]）', () => {
        expect(describeFilters(makeFilters({ brightness: -0.5 }))).toEqual([{ type: 'Brightness', value: -0.5 }]);
        expect(describeFilters(makeFilters({ contrast: 0.3 }))).toEqual([{ type: 'Contrast', value: 0.3 }]);
        expect(describeFilters(makeFilters({ saturation: 1 }))).toEqual([{ type: 'Saturation', value: 1 }]);
        expect(describeFilters(makeFilters({ blur: 0.8 }))).toEqual([{ type: 'Blur', value: 0.8 }]);
    });

    it('开关项为 true 才生成描述（无参数）', () => {
        expect(describeFilters(makeFilters({ grayscale: true }))).toEqual([{ type: 'Grayscale' }]);
        expect(describeFilters(makeFilters({ sepia: true }))).toEqual([{ type: 'Sepia' }]);
        expect(describeFilters(makeFilters({ invert: true }))).toEqual([{ type: 'Invert' }]);
    });

    it('组合：顺序固定为 数值项（亮度/对比度/饱和/模糊）→ 开关项（灰度/褐色/反色）', () => {
        const specs = describeFilters(
            makeFilters({ brightness: 0.1, contrast: -0.2, saturation: 0.3, blur: 0.4, grayscale: true, sepia: true, invert: true })
        );
        expect(specs).toEqual([
            { type: 'Brightness', value: 0.1 },
            { type: 'Contrast', value: -0.2 },
            { type: 'Saturation', value: 0.3 },
            { type: 'Blur', value: 0.4 },
            { type: 'Grayscale' },
            { type: 'Sepia' },
            { type: 'Invert' }
        ]);
    });
});

describe('buildFabricFilters（描述 → fabric 实例）', () => {
    it('undefined / 全默认 → 空数组', () => {
        expect(buildFabricFilters(undefined)).toEqual([]);
        expect(buildFabricFilters(DEFAULT_FILTERS)).toEqual([]);
    });

    it('实例 type 与描述一致，数值参数写入实例', () => {
        const instances = buildFabricFilters(makeFilters({ brightness: 0.25, blur: 0.5, invert: true }));
        expect(instances.map((f) => f.type)).toEqual(['Brightness', 'Blur', 'Invert']);
        const brightness = instances[0] as unknown as { brightness: number };
        const blur = instances[1] as unknown as { blur: number };
        expect(brightness.brightness).toBe(0.25);
        expect(blur.blur).toBe(0.5);
    });

    it('开关项生成对应类型实例', () => {
        const instances = buildFabricFilters(makeFilters({ grayscale: true, sepia: true }));
        expect(instances.map((f) => f.type)).toEqual(['Grayscale', 'Sepia']);
    });
});
