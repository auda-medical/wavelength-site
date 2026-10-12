import Foundation
import Network
import Capacitor

/// The phone's network as iOS reports it, for the logbook's sync status (src/app/native.js, WLNetwork).
///
/// The same plugin name and events as the Android plugin (NetworkPlugin.java), built on NWPathMonitor:
///   connected   the current path is usable (NWPath.Status.satisfied)
///   validated   the same value: iOS has no separate "internet validated" check for apps
///   transports  "wifi", "cellular", "ethernet" for the interfaces the path can use
///   vpn         always null: iOS gives apps no supported way to tell whether a VPN is in use, so the app says it
///               cannot tell rather than guess from interface names
///   underlying  always null for the same reason; the logbook then keeps its conservative status ("Can't sync"
///               rather than "Offline") whenever the path is usable but the server cannot be reached
///   expensive / constrained  mobile data or Low Data Mode, for information only
///   id          a handle that changes when the set of interfaces changes, never an address or a network name
///
/// Read-only: NWPathMonitor only listens. Nothing here requests, binds to or prefers a network, and nothing touches
/// the VPN, its settings or routing. No permission or entitlement is needed.
@objc(WLNetworkPlugin)
public class WLNetworkPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WLNetworkPlugin"
    public let jsName = "WLNetwork"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise)
    ]

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "uk.co.thewavelength.app.network")
    private let lock = NSLock()
    private var current: [String: Any] = WLNetworkPlugin.describe(nil)
    private var last = ""

    override public func load() {
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self = self else { return }
            let s = WLNetworkPlugin.describe(path)
            let key = WLNetworkPlugin.key(s)
            self.lock.lock()
            self.current = s
            let changed = key != self.last
            if changed { self.last = key }
            self.lock.unlock()
            // Only a change in what the logbook uses is sent on.
            if changed { self.notifyListeners("networkStatusChange", data: s) }
        }
        monitor.start(queue: queue)
    }

    deinit { monitor.cancel() }

    @objc func getStatus(_ call: CAPPluginCall) {
        lock.lock()
        let s = current
        lock.unlock()
        call.resolve(s)
    }

    static func describe(_ path: NWPath?) -> [String: Any] {
        guard let path = path else {
            return ["connected": false, "validated": false, "vpn": NSNull(), "transports": [String](), "id": "", "underlying": NSNull(), "platform": "ios"]
        }
        let ok = path.status == .satisfied
        var transports: [String] = []
        if path.usesInterfaceType(.wifi) { transports.append("wifi") }
        if path.usesInterfaceType(.cellular) { transports.append("cellular") }
        if path.usesInterfaceType(.wiredEthernet) { transports.append("ethernet") }
        // A handle for "a different set of interfaces", not a name or an address.
        let id = path.availableInterfaces.map { "\($0.type)" }.sorted().joined(separator: ",").hashValue
        return [
            "connected": ok,
            "validated": ok,
            "vpn": NSNull(),
            "transports": transports.sorted(),
            "id": ok ? String(id) : "",
            "underlying": NSNull(),
            "expensive": path.isExpensive,
            "constrained": path.isConstrained,
            "platform": "ios"
        ]
    }

    static func key(_ s: [String: Any]) -> String {
        let t = (s["transports"] as? [String] ?? []).joined(separator: ",")
        return "\(s["connected"] as? Bool ?? false)|\(t)|\(s["id"] as? String ?? "")|\(s["constrained"] as? Bool ?? false)"
    }
}
