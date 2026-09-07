// swift-tools-version: 5.9
import PackageDescription
// Official Capacitor 8.5.1 release binaries, downloaded anonymously and SHA-256 verified.
// Local targets prevent Xcode from invoking GitHub account/keychain authentication.
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [.library(name: "CapApp-SPM", targets: ["CapApp-SPM"])],
    targets: [
        .binaryTarget(name: "Capacitor", path: "Frameworks/Capacitor.xcframework"),
        .binaryTarget(name: "Cordova", path: "Frameworks/Cordova.xcframework"),
        .target(name: "CapApp-SPM", dependencies: ["Capacitor", "Cordova"])
    ]
)
