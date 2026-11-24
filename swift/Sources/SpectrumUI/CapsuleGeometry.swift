import Foundation
#if canImport(CoreGraphics)
import CoreGraphics

/// Geometric metrics for laying out and rendering capsule bars.
public struct CapsuleMetrics: Sendable, Equatable {
    public var barWidth: CGFloat
    public var spacing: CGFloat
    public var minHeight: CGFloat
    public var maxBarHeight: CGFloat
    public var originX: CGFloat
    public var centerY: CGFloat
    public var cornerRadius: CGFloat
    public var widthExpansion: CGFloat

    public init(
        barWidth: CGFloat,
        spacing: CGFloat,
        minHeight: CGFloat,
        maxBarHeight: CGFloat,
        originX: CGFloat,
        centerY: CGFloat,
        cornerRadius: CGFloat,
        widthExpansion: CGFloat = 0.145
    ) {
        self.barWidth = barWidth
        self.spacing = spacing
        self.minHeight = minHeight
        self.maxBarHeight = maxBarHeight
        self.originX = originX
        self.centerY = centerY
        self.cornerRadius = cornerRadius
        self.widthExpansion = widthExpansion
    }

    /// Computes centered layout metrics for a bounding rectangle.
    public static func centered(
        bounds: CGRect,
        count: Int,
        capsuleWidth: CGFloat = 4.0,
        capsuleSpacing: CGFloat = 3.0,
        maxHeightRatio: CGFloat = 0.90,
        widthExpansion: CGFloat = 0.145
    ) -> CapsuleMetrics {
        let n = max(1, count)
        let totalWidth = CGFloat(n) * capsuleWidth + CGFloat(max(0, n - 1)) * capsuleSpacing
        return CapsuleMetrics(
            barWidth: capsuleWidth,
            spacing: capsuleSpacing,
            minHeight: capsuleWidth,
            maxBarHeight: bounds.height * maxHeightRatio,
            originX: (bounds.width - totalWidth) * 0.5,
            centerY: bounds.height * 0.5,
            cornerRadius: capsuleWidth * 0.5,
            widthExpansion: widthExpansion
        )
    }

    /// Computes the frame of bar `index` given its normalized height in [0, 1].
    public func frame(for index: Int, normalizedHeight: CGFloat) -> CGRect {
        let value = min(1.0, max(0.0, normalizedHeight))
        let height = minHeight + (maxBarHeight - minHeight) * value
        let width = barWidth * (1.0 + widthExpansion * value)
        let centerX = originX + CGFloat(index) * (barWidth + spacing) + barWidth * 0.5
        return CGRect(
            x: centerX - width * 0.5,
            y: centerY - height * 0.5,
            width: width,
            height: height
        )
    }
}
#endif
