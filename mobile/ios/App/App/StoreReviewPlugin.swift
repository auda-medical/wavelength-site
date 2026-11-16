import UIKit
import StoreKit
import Capacitor

/// Store ratings for the logbook (src/app/native.js, StoreReview; when to ask is decided in src/app/rating.js).
///
///   requestReview  asks iOS for its own rating prompt (StoreKit). iOS decides whether anything appears (at most three
///                  times in 365 days, never in TestFlight builds) and tells the app nothing either way.
///   openStore      opens the App Store's "write a review" page for Wavelength, for "Rate Wavelength" in Settings.
///                  Only an https address on apps.apple.com is opened.
///
/// The same plugin name and methods as the Android plugin (StoreReviewPlugin.java). No permission or entitlement is
/// needed, and nothing is collected or sent.
@objc(StoreReviewPlugin)
public class StoreReviewPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StoreReviewPlugin"
    public let jsName = "StoreReview"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestReview", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openStore", returnType: CAPPluginReturnPromise)
    ]

    @objc func requestReview(_ call: CAPPluginCall) {
        Task { @MainActor [weak self] in
            let own = self?.bridge?.viewController?.view.window?.windowScene
            let active = UIApplication.shared.connectedScenes.first { $0.activationState == .foregroundActive } as? UIWindowScene
            guard let scene = own ?? active else {
                call.reject("No active window")
                return
            }
            if #available(iOS 16.0, *) {
                AppStore.requestReview(in: scene)
            } else {
                SKStoreReviewController.requestReview(in: scene)
            }
            call.resolve()
        }
    }

    @objc func openStore(_ call: CAPPluginCall) {
        guard let text = call.getString("url"), let url = URL(string: text), url.scheme == "https", url.host == "apps.apple.com" else {
            call.reject("Not an App Store address")
            return
        }
        Task { @MainActor in
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened { call.resolve() } else { call.reject("Could not open the App Store") }
            }
        }
    }
}
