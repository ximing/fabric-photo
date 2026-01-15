import { filters, type FabricImage } from 'fabric';
import type { FilterSettings } from '../model/doc';

type AnyBaseFilter = filters.BaseFilter<string, Record<string, unknown>>;

/**
 * FilterSettings → fabric filter 的纯描述（不含 fabric 实例），单测直接断言此层；
 * 实例化（buildFabricFilters）与挂载（applyFiltersToImage）留在渲染侧。
 * 默认值对应项不生成描述（fabric filter 恒等态）。
 */
export interface FilterSpec {
    type: 'Brightness' | 'Contrast' | 'Saturation' | 'Blur' | 'Grayscale' | 'Sepia' | 'Invert';
    /** 数值型 filter 的参数（brightness/contrast/saturation/blur）；开关型缺省。 */
    value?: number;
}

/** 纯函数：FilterSettings（缺省 = 无滤镜）→ 应生成的 fabric filter 描述序列。 */
export function describeFilters(settings: FilterSettings | undefined): FilterSpec[] {
    if (settings === undefined) {
        return [];
    }
    const specs: FilterSpec[] = [];
    if (settings.brightness !== 0) {
        specs.push({ type: 'Brightness', value: settings.brightness });
    }
    if (settings.contrast !== 0) {
        specs.push({ type: 'Contrast', value: settings.contrast });
    }
    if (settings.saturation !== 0) {
        specs.push({ type: 'Saturation', value: settings.saturation });
    }
    if (settings.blur > 0) {
        specs.push({ type: 'Blur', value: settings.blur });
    }
    if (settings.grayscale) {
        specs.push({ type: 'Grayscale' });
    }
    if (settings.sepia) {
        specs.push({ type: 'Sepia' });
    }
    if (settings.invert) {
        specs.push({ type: 'Invert' });
    }
    return specs;
}

/** FilterSettings → fabric filter 实例数组（默认值对应项不生成实例）。 */
export function buildFabricFilters(settings: FilterSettings | undefined): AnyBaseFilter[] {
    return describeFilters(settings).map((spec) => {
        switch (spec.type) {
            case 'Brightness':
                return new filters.Brightness({ brightness: spec.value });
            case 'Contrast':
                return new filters.Contrast({ contrast: spec.value });
            case 'Saturation':
                return new filters.Saturation({ saturation: spec.value });
            case 'Blur':
                return new filters.Blur({ blur: spec.value });
            case 'Grayscale':
                return new filters.Grayscale();
            case 'Sepia':
                return new filters.Sepia();
            case 'Invert':
                return new filters.Invert();
        }
    });
}

/** 上次挂载到某 fabric image 的 filters（值比较，避免每次同步重建 filter 数组）。 */
const appliedFilters = new WeakMap<FabricImage, FilterSettings | undefined>();

function sameSettings(a: FilterSettings | undefined, b: FilterSettings | undefined): boolean {
    if (a === undefined || b === undefined) {
        return a === b;
    }
    return (
        a.brightness === b.brightness &&
        a.contrast === b.contrast &&
        a.saturation === b.saturation &&
        a.blur === b.blur &&
        a.grayscale === b.grayscale &&
        a.sepia === b.sepia &&
        a.invert === b.invert
    );
}

/**
 * 把 FilterSettings 投影到 fabric image：重建 filter 实例数组并 applyFilters()。
 * 与上次挂载的值全等时跳过（doc 不可变更新会深拷贝 filters，引用比较不可靠，按值比较）。
 */
export function applyFiltersToImage(fImg: FabricImage, settings: FilterSettings | undefined): void {
    if (sameSettings(appliedFilters.get(fImg), settings)) {
        return;
    }
    fImg.filters = buildFabricFilters(settings);
    fImg.applyFilters();
    appliedFilters.set(fImg, settings === undefined ? undefined : { ...settings });
}
