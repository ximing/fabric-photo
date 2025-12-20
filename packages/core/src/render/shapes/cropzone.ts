import { classRegistry, Rect, type BasicTransformEvent, type RectProps } from 'fabric';

const CORNER_TYPE_TOP_LEFT = 'tl';
const CORNER_TYPE_TOP_RIGHT = 'tr';
const CORNER_TYPE_MIDDLE_TOP = 'mt';
const CORNER_TYPE_MIDDLE_LEFT = 'ml';
const CORNER_TYPE_MIDDLE_RIGHT = 'mr';
const CORNER_TYPE_MIDDLE_BOTTOM = 'mb';
const CORNER_TYPE_BOTTOM_LEFT = 'bl';
const CORNER_TYPE_BOTTOM_RIGHT = 'br';

/** 移植旧 src/lib/util.ts 的 clamp（min > max 时交换）。 */
function clamp(value: number, minValue: number, maxValue: number): number {
    let min = minValue;
    let max = maxValue;
    if (min > max) {
        const temp = min;
        min = max;
        max = temp;
    }
    return Math.max(min, Math.min(value, max));
}

export type CropzoneProps = Partial<RectProps> & {
    /** clamp 范围宽（doc 坐标，= 背景图宽），替代旧实现里的 canvas.width。 */
    boundsWidth?: number;
    /** clamp 范围高（doc 坐标，= 背景图高），替代旧实现里的 canvas.height。 */
    boundsHeight?: number;
};

interface CropzoneCoordinates {
    x: number[];
    y: number[];
}

/**
 * 裁剪框自定义对象（蚂蚁线），移植自旧 src/shape/cropzone.ts 到 fabric 6 类体系：
 * - _render = 外部遮罩 + 黑/白双层蚂蚁线，逐行移植；旧实现用 ctx.canvas.width/height
 *   作遮罩外沿（旧画布 == 图片尺寸），新架构画布铺满容器，改用 boundsWidth/Height
 *   （= 背景图 doc 宽高，创建时由 CropController 写入），遮罩恰好覆盖背景图范围
 * - moving/scaling 内部 clamp 在背景图范围内，逐行移植；
 *   scaling 事件 payload 的 pointer 是 scene（doc）坐标（fabric 6 已验证：
 *   controls/util.mjs commonEventInfo），zoom ≠ 1 时位置仍一致
 * - fabric 6 移除了旧 data 属性，渲染层内部对象标记改为实例字段 fpInternal
 *   （renderer 的 syncSelection 凭此豁免激活态同步；syncObjects diff 只遍历
 *   objectMap 中的 state 对象，cropzone 天然不参与）
 * - objectCaching:false（对齐旧实现：遮罩依赖 bounds 与位置，不进对象缓存）
 */
export class Cropzone extends Rect<CropzoneProps> {
    static override type = 'cropzone';

    /** 渲染层内部对象标记（对齐 brief 的 data.fpInternal 约定；fabric 6 无 data 属性）。 */
    readonly fpInternal = 'cropzone';

    boundsWidth = 0;

    boundsHeight = 0;

    override objectCaching = false;

    constructor(options?: CropzoneProps) {
        super(options);
        // 字段初始化在 super 之后，显式从 options 还原（super 的 set 会被字段初值覆盖）
        this.boundsWidth = options?.boundsWidth ?? 0;
        this.boundsHeight = options?.boundsHeight ?? 0;
        this.on({
            moving: this.onMoving,
            scaling: this.onScaling
        });
    }

    /**
     * 旧 fabric 1.7.3 getWidth() == width * scaleX；fabric 6 的 getScaledWidth()
     * 会额外计入 strokeWidth（_getTransformedDimensions），语义不同，故显式还原旧口径。
     */
    scaledWidth(): number {
        return this.width * this.scaleX;
    }

    /** 同 scaledWidth，对应旧 getHeight()。 */
    scaledHeight(): number {
        return this.height * this.scaleY;
    }

    /**
     * Render Crop-zone（遮罩 + 蚂蚁线，逐行移植旧 _render）。
     */
    override _render(ctx: CanvasRenderingContext2D): void {
        const cropzoneDashLineWidth = 7;
        const cropzoneDashLineOffset = 7;
        super._render(ctx);

        // Calc original scale
        const originalFlipX = this.flipX ? -1 : 1;
        const originalFlipY = this.flipY ? -1 : 1;
        const originalScaleX = originalFlipX / this.scaleX;
        const originalScaleY = originalFlipY / this.scaleY;

        // Set original scale
        ctx.scale(originalScaleX, originalScaleY);

        // Render outer rect
        this.fillOuterRect(ctx, 'rgba(0, 0, 0, 0.55)');

        // Black dash line
        this.strokeBorder(ctx, 'rgb(0, 0, 0)', cropzoneDashLineWidth);

        // White dash line
        this.strokeBorder(ctx, 'rgb(255, 255, 255)', cropzoneDashLineWidth, cropzoneDashLineOffset);

        // Reset scale
        ctx.scale(1 / originalScaleX, 1 / originalScaleY);
    }

    /** Fill outer rectangle（旧 _fillOuterRect；内外双路径 + fill 的奇偶规则出遮罩洞）。 */
    private fillOuterRect(ctx: CanvasRenderingContext2D, fillStyle: string | CanvasGradient | CanvasPattern): void {
        const coordinates = this.getCoordinates();
        const x = coordinates.x;
        const y = coordinates.y;

        ctx.save();
        ctx.fillStyle = fillStyle;
        ctx.beginPath();

        // Outer rectangle
        // Numbers are +/-1 so that overlay edges don't get blurry.
        ctx.moveTo(x[0] - 1, y[0] - 1);
        ctx.lineTo(x[3] + 1, y[0] - 1);
        ctx.lineTo(x[3] + 1, y[3] + 1);
        ctx.lineTo(x[0] - 1, y[3] - 1);
        ctx.lineTo(x[0] - 1, y[0] - 1);
        ctx.closePath();

        // Inner rectangle
        ctx.moveTo(x[1], y[1]);
        ctx.lineTo(x[1], y[2]);
        ctx.lineTo(x[2], y[2]);
        ctx.lineTo(x[2], y[1]);
        ctx.lineTo(x[1], y[1]);
        ctx.closePath();

        ctx.fill();
        ctx.restore();
    }

    /**
     * Get coordinates（旧 _getCoordinates；旧实现外沿取 ctx.canvas 尺寸 == 图片尺寸，
     * 这里用 boundsWidth/Height == 背景图 doc 宽高，语义等价）。
     */
    private getCoordinates(): CropzoneCoordinates {
        const ceil = Math.ceil;
        const width = this.scaledWidth();
        const height = this.scaledHeight();
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const left = this.left;
        const top = this.top;

        return {
            x: [-(halfWidth + left), -halfWidth, halfWidth, halfWidth + (this.boundsWidth - left - width)].map(ceil),
            y: [-(halfHeight + top), -halfHeight, halfHeight, halfHeight + (this.boundsHeight - top - height)].map(
                ceil
            )
        };
    }

    /** Stroke border（旧 _strokeBorder：虚线边框；lineDashOffset 错开黑/白两层出蚂蚁线）。 */
    private strokeBorder(
        ctx: CanvasRenderingContext2D,
        strokeStyle: string | CanvasGradient | CanvasPattern,
        lineDashWidth: number,
        lineDashOffset?: number
    ): void {
        const halfWidth = this.scaledWidth() / 2;
        const halfHeight = this.scaledHeight() / 2;

        ctx.save();
        ctx.strokeStyle = strokeStyle;
        if (ctx.setLineDash) {
            ctx.setLineDash([lineDashWidth, lineDashWidth]);
        }
        if (lineDashOffset) {
            ctx.lineDashOffset = lineDashOffset;
        }

        ctx.beginPath();
        ctx.moveTo(-halfWidth, -halfHeight);
        ctx.lineTo(halfWidth, -halfHeight);
        ctx.lineTo(halfWidth, halfHeight);
        ctx.lineTo(-halfWidth, halfHeight);
        ctx.lineTo(-halfWidth, -halfHeight);
        ctx.stroke();

        ctx.restore();
    }

    /** onMoving event listener（旧 _onMoving：clamp 在背景图范围内）。 */
    private readonly onMoving = (): void => {
        const left = this.left;
        const top = this.top;
        const maxLeft = this.boundsWidth - this.scaledWidth();
        const maxTop = this.boundsHeight - this.scaledHeight();

        this.set({
            left: clamp(left, 0, maxLeft),
            top: clamp(top, 0, maxTop)
        });
        this.setCoords();
    };

    /**
     * onScaling event listener（旧 _onScaling）：pointer 为 scene（doc）坐标。
     * On scaling cropzone, change real width and height and fix scaleFactor to 1.
     */
    private readonly onScaling = (event: BasicTransformEvent): void => {
        const pointer = event.pointer;
        const corner = event.transform?.corner ?? this.__corner ?? '';
        const settings = this.calcScalingSizeFromPointer(pointer.x, pointer.y, corner);

        this.scale(1);
        this.set(settings);
        this.setCoords();
    };

    /** Calc scaled size from mouse pointer with selected corner（旧 _calcScalingSizeFromPointer）。 */
    private calcScalingSizeFromPointer(pointerX: number, pointerY: number, corner: string): Record<string, number> {
        const tlScalingSize = this.calcTopLeftScalingSizeFromPointer(pointerX, pointerY);
        const brScalingSize = this.calcBottomRightScalingSizeFromPointer(pointerX, pointerY);

        return this.makeScalingSettings(tlScalingSize, brScalingSize, corner);
    }

    /** Calc scaling size(position + dimension) from left-top corner（旧 _calcTopLeftScalingSizeFromPointer）。 */
    private calcTopLeftScalingSizeFromPointer(
        x: number,
        y: number
    ): { top: number; left: number; width: number; height: number } {
        const bottom = this.scaledHeight() + this.top;
        const right = this.scaledWidth() + this.left;
        const top = clamp(y, 0, bottom - 1);
        const left = clamp(x, 0, right - 1);

        return {
            top,
            left,
            width: right - left,
            height: bottom - top
        };
    }

    /**
     * Calc scaling size from right-bottom corner（旧 _calcBottomRightScalingSizeFromPointer；
     * 旧实现 maxX/maxY 取 canvas.width/height == 图片尺寸，这里用 bounds）。
     */
    private calcBottomRightScalingSizeFromPointer(x: number, y: number): { width: number; height: number } {
        const maxX = this.boundsWidth;
        const maxY = this.boundsHeight;
        const left = this.left;
        const top = this.top;

        return {
            width: clamp(x, left + 1, maxX) - left,
            height: clamp(y, top + 1, maxY) - top
        };
    }

    /** Make scaling settings（旧 _makeScalingSettings，按角选择 tl/br 分量）。 */
    private makeScalingSettings(
        tl: { width: number; height: number; left: number; top: number },
        br: { width: number; height: number },
        corner: string
    ): Record<string, number> {
        const tlWidth = tl.width;
        const tlHeight = tl.height;
        const brHeight = br.height;
        const brWidth = br.width;
        const tlLeft = tl.left;
        const tlTop = tl.top;
        let settings: Record<string, number>;

        switch (corner) {
            case CORNER_TYPE_TOP_LEFT:
                settings = tl;
                break;
            case CORNER_TYPE_TOP_RIGHT:
                settings = {
                    width: brWidth,
                    height: tlHeight,
                    top: tlTop
                };
                break;
            case CORNER_TYPE_BOTTOM_LEFT:
                settings = {
                    width: tlWidth,
                    height: brHeight,
                    left: tlLeft
                };
                break;
            case CORNER_TYPE_BOTTOM_RIGHT:
                settings = br;
                break;
            case CORNER_TYPE_MIDDLE_LEFT:
                settings = {
                    width: tlWidth,
                    left: tlLeft
                };
                break;
            case CORNER_TYPE_MIDDLE_TOP:
                settings = {
                    height: tlHeight,
                    top: tlTop
                };
                break;
            case CORNER_TYPE_MIDDLE_RIGHT:
                settings = {
                    width: brWidth
                };
                break;
            case CORNER_TYPE_MIDDLE_BOTTOM:
                settings = {
                    height: brHeight
                };
                break;
            default:
                settings = {};
                break;
        }

        return settings;
    }

    /** Return the whether this cropzone is valid（旧 isValid 逐行移植）。 */
    isValid(): boolean {
        return this.left >= 0 && this.top >= 0 && this.width > 0 && this.height > 0;
    }
}

classRegistry.setClass(Cropzone, 'cropzone');
