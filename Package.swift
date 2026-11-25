// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "apple-like-waves",
    platforms: [
        .macOS(.v14),
        .iOS(.v16)
    ],
    products: [
        .library(name: "SpectrumCore", targets: ["SpectrumCore"]),
        .library(name: "SpectrumUI", targets: ["SpectrumUI"]),
        .library(name: "Alwave", targets: ["SpectrumCore", "SpectrumUI"])
    ],
    targets: [
        .target(
            name: "SpectrumCore",
            path: "swift/Sources/SpectrumCore"
        ),
        .target(
            name: "SpectrumUI",
            dependencies: ["SpectrumCore"],
            path: "swift/Sources/SpectrumUI"
        ),
        .testTarget(
            name: "SpectrumCoreTests",
            dependencies: ["SpectrumCore", "SpectrumUI"],
            path: "swift/Tests/SpectrumCoreTests"
        )
    ]
)
