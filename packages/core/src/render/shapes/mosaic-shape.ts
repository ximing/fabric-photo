import { classRegistry, FabricObject, type TFabricObjectProps } from 'fabric';
import type { MosaicRect } from '../../model/doc';

export type MosaicShapeProps = TFabricObjectProps & {
    mosaicRects?: MosaicRect[];
};

/**
 * 马赛克自定义对象（移植自旧 src/shape/mosaic.ts 到 fabric 6 类体系）：
 * - 渲染语义：对象 left/top 为外接框中心（fabric 6 默认 center origin），
 *   rects 的 x/y 在 add 时已归一化到外接框左上角（0..width / 0..height），
 *   _render 减 width/2、height/2 换算到中心原点逐块 fillRect
 * - objectCaching:false（对齐旧实现：取色内容不进入对象缓存）
 * - selectable 由 renderer 按 mode 统一控制（新架构下马赛克可选中/删除，
 *   相对旧实现的 selectable:false 是有意增强）
 */
export class MosaicShape extends FabricObject<MosaicShapeProps> {
    static override type = 'mosaic';

    mosaicRects: MosaicRect[] = [];

    override objectCaching = false;

    constructor(options?: MosaicShapeProps) {
        super(options);
        // 字段初始化在 super 之后，显式从 options 还原（super 的 set 会被字段初值覆盖）
        this.mosaicRects = options?.mosaicRects ?? [];
    }

    override _render(ctx: CanvasRenderingContext2D): void {
        const offsetX = -this.width / 2;
        const offsetY = -this.height / 2;
        for (const rect of this.mosaicRects) {
            ctx.fillStyle = rect.color;
            ctx.fillRect(offsetX + rect.x, offsetY + rect.y, rect.size, rect.size);
        }
    }
}

classRegistry.setClass(MosaicShape, 'mosaic');
