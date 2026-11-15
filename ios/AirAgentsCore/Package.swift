// swift-tools-version: 6.0
import PackageDescription

// Logic with no UIKit: gestures, geo maths, the approval client, models.
// Everything here runs under `swift test` without a device or simulator.
let package = Package(
    name: "AirAgentsCore",
    platforms: [.iOS(.v18), .macOS(.v14)],
    products: [
        .library(name: "AirAgentsCore", targets: ["AirAgentsCore"]),
    ],
    targets: [
        .target(name: "AirAgentsCore"),
        .testTarget(name: "AirAgentsCoreTests", dependencies: ["AirAgentsCore"]),
    ]
)
