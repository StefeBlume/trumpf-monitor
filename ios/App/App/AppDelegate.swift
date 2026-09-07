import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

@objc(MonitorViewController)
class MonitorViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(OfflineCachePlugin())
    }
}

@objc(OfflineCachePlugin)
class OfflineCachePlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "OfflineCachePlugin"
    let jsName = "OfflineCache"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "load", returnType: CAPPluginReturnPromise)
    ]
    private func cacheURL() throws -> URL {
        let directory = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        return directory.appendingPathComponent("policy-offline.json")
    }
    @objc func save(_ call: CAPPluginCall) {
        guard let payload = call.getString("payload"), let data = payload.data(using: .utf8), data.count < 10_000_000,
              (try? JSONSerialization.jsonObject(with: data)) != nil else {
            call.reject("Ungültiger Offline-Stand"); return
        }
        do { try data.write(to: cacheURL(), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]); call.resolve() }
        catch { call.reject("Offline-Stand konnte nicht gespeichert werden.") }
    }
    @objc func load(_ call: CAPPluginCall) {
        if let url = try? cacheURL(), let text = try? String(contentsOf: url, encoding: .utf8) {
            call.resolve(["payload": text])
        } else { call.resolve(["payload": ""]) }
    }
}
