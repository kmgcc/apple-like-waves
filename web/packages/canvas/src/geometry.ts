export interface CapsuleRect {
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius: number;
}

/**
 * Geometric metrics for laying out and rendering capsule bars.
 */
export class CapsuleMetrics {
  public barWidth: number;
  public spacing: number;
  public minHeight: number;
  public maxBarHeight: number;
  public originX: number;
  public centerY: number;
  public cornerRadius: number;
  public widthExpansion: number;

  constructor(
    barWidth: number,
    spacing: number,
    minHeight: number,
    maxBarHeight: number,
    originX: number,
    centerY: number,
    cornerRadius: number,
    widthExpansion = 0.145
  ) {
    this.barWidth = barWidth;
    this.spacing = spacing;
    this.minHeight = minHeight;
    this.maxBarHeight = maxBarHeight;
    this.originX = originX;
    this.centerY = centerY;
    this.cornerRadius = cornerRadius;
    this.widthExpansion = widthExpansion;
  }

  /**
   * Computes centered layout metrics for a bounding rectangle.
   */
  public static centered(
    boundsWidth: number,
    boundsHeight: number,
    count: number,
    capsuleWidth = 4.0,
    capsuleSpacing = 3.0,
    maxHeightRatio = 0.9,
    widthExpansion = 0.145
  ): CapsuleMetrics {
    const n = Math.max(1, count);
    const totalWidth = n * capsuleWidth + Math.max(0, n - 1) * capsuleSpacing;
    return new CapsuleMetrics(
      capsuleWidth,
      capsuleSpacing,
      capsuleWidth,
      boundsHeight * maxHeightRatio,
      (boundsWidth - totalWidth) * 0.5,
      boundsHeight * 0.5,
      capsuleWidth * 0.5,
      widthExpansion
    );
  }

  /**
   * Computes the frame of bar `index` given its normalized height in [0, 1].
   */
  public frame(index: number, normalizedHeight: number): CapsuleRect {
    const value = Math.min(1.0, Math.max(0.0, normalizedHeight));
    const height = this.minHeight + (this.maxBarHeight - this.minHeight) * value;
    const width = this.barWidth * (1.0 + this.widthExpansion * value);
    const centerX =
      this.originX + index * (this.barWidth + this.spacing) + this.barWidth * 0.5;
    return {
      x: centerX - width * 0.5,
      y: this.centerY - height * 0.5,
      width,
      height,
      cornerRadius: width * 0.5,
    };
  }
}
