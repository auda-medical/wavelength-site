import UIKit
import Capacitor

/// The app's web view controller. It registers the app's own plugins (not from npm) when the bridge has loaded, as
/// MainActivity does on Android.
class WLBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WLNetworkPlugin())
    }
}
