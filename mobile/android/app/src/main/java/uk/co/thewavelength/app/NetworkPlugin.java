package uk.co.thewavelength.app;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.HashMap;
import java.util.Map;
import java.util.TreeSet;

/**
 * The phone's network as Android sees it, for the logbook's sync status (src/app/native.js, WLNetwork).
 *
 * Android WebView's navigator.onLine only changes when the default network appears or disappears. A VPN that stays
 * up while the Wi-Fi or mobile data under it drops and returns hides those changes, so the logbook could not tell
 * "no network" from "network, but the Wavelength server cannot be reached", and missed the moment to retry.
 *
 * This plugin reads the default network's capabilities (internet, validated by Android, VPN, Wi-Fi, mobile data) and
 * tells the page whenever they change in a way that matters.
 *
 * 1.0.11: a VPN app (NordVPN in testing) can keep its virtual network up, with the internet capability, after Flight
 * mode has switched off Wi-Fi and mobile data. The default network then still looks connected. So the plugin also
 * listens, passively, for networks that are not VPNs and have internet (Wi-Fi, mobile data, Ethernet), and reports
 * "underlying": true when at least one exists, false when none does, and null when it cannot tell (the listener could
 * not be registered). Flight mode itself is never read: Wi-Fi switched on again in Flight mode is a real network.
 *
 * Read-only: registerNetworkCallback only listens. It never requests, binds to or prefers a network, never changes
 * the VPN, its kill switch, routing or any setting, and sends nothing anywhere. Needs ACCESS_NETWORK_STATE (a normal
 * permission).
 */
@CapacitorPlugin(name = "WLNetwork")
public class NetworkPlugin extends Plugin {
    private ConnectivityManager cm;
    private ConnectivityManager.NetworkCallback callback;
    private ConnectivityManager.NetworkCallback underCallback;
    private String last = "";
    // The default network as the default callback last described it, so a change underneath can be reported with it.
    private Network defNet;
    private NetworkCapabilities defCaps;
    // Networks that are not VPNs and have internet, with their transports, from the passive listener.
    private final Map<Network, String> under = new HashMap<>();
    private boolean underKnown = false;

    @Override
    public void load() {
        cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return;
        // Inside the callbacks the status is built from the callback's own arguments: Android documents that
        // asking getActiveNetwork() there is prone to races. onAvailable is always followed by
        // onCapabilitiesChanged for the default network, so it sends nothing itself.
        callback = new ConnectivityManager.NetworkCallback() {
            @Override public void onCapabilitiesChanged(Network network, NetworkCapabilities caps) { setDefault(network, caps); }
            @Override public void onLost(Network network) { setDefault(null, null); }
            @Override public void onUnavailable() { setDefault(null, null); }
        };
        underCallback = new ConnectivityManager.NetworkCallback() {
            @Override public void onCapabilitiesChanged(Network network, NetworkCapabilities caps) { setUnder(network, caps); }
            @Override public void onLost(Network network) { setUnder(network, null); }
        };
        // The networks under any VPN are listened for first, and the list starts from what exists now, so the first
        // report of a VPN never says "nothing underneath" just because the listener has not been told yet.
        try {
            NetworkRequest req = new NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)
                .build();
            seedUnder();
            cm.registerNetworkCallback(req, underCallback);
            synchronized (this) { underKnown = true; }
        } catch (RuntimeException e) {
            underCallback = null; // "underlying" stays unknown (null): the logbook keeps its conservative status
        }
        try {
            cm.registerDefaultNetworkCallback(callback);
        } catch (RuntimeException e) {
            callback = null; // too many callbacks registered, or no permission: getStatus still works
        }
    }

    // The non-VPN networks with internet that exist when the plugin starts (read only).
    @SuppressWarnings("deprecation")
    private synchronized void seedUnder() {
        for (Network x : cm.getAllNetworks()) {
            NetworkCapabilities c = cm.getNetworkCapabilities(x);
            if (c == null || c.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) continue;
            if (!c.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) continue;
            under.put(x, transportsOf(c));
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (cm != null) {
            if (callback != null) try { cm.unregisterNetworkCallback(callback); } catch (RuntimeException ignored) { }
            if (underCallback != null) try { cm.unregisterNetworkCallback(underCallback); } catch (RuntimeException ignored) { }
        }
        callback = null;
        underCallback = null;
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(current());
    }

    private synchronized void setDefault(Network n, NetworkCapabilities c) {
        defNet = n;
        defCaps = c;
        changed(describe(n, c, underNow()));
    }

    private synchronized void setUnder(Network n, NetworkCapabilities c) {
        if (n == null) return;
        if (c == null || c.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) under.remove(n);
        else under.put(n, transportsOf(c));
        changed(describe(defNet, defCaps, underNow()));
    }

    // Only a change in what the logbook uses is sent on (not signal strength or bandwidth updates).
    private synchronized void changed(JSObject s) {
        String key = s.toString();
        if (key.equals(last)) return;
        last = key;
        notifyListeners("networkStatusChange", s);
    }

    // From the passive listener: the transports of every non-VPN network with internet, or null if not listening.
    private synchronized TreeSet<String> underNow() {
        if (!underKnown) return null;
        TreeSet<String> t = new TreeSet<>();
        for (String s : under.values()) if (!s.isEmpty()) for (String x : s.split(",")) t.add(x);
        if (t.isEmpty() && !under.isEmpty()) t.add("other");
        return t;
    }

    // Outside the callbacks (getStatus): the default network and the networks under it as they are now.
    @SuppressWarnings("deprecation")
    private JSObject current() {
        try {
            Network n = cm == null ? null : cm.getActiveNetwork();
            TreeSet<String> u = null;
            if (cm != null) {
                // getAllNetworks is deprecated for picking a network to use; here it is only read, to describe them.
                u = new TreeSet<>();
                for (Network x : cm.getAllNetworks()) {
                    NetworkCapabilities c = cm.getNetworkCapabilities(x);
                    if (c == null || c.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) continue;
                    if (!c.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) continue;
                    String s = transportsOf(c);
                    if (s.isEmpty()) u.add("other"); else for (String y : s.split(",")) u.add(y);
                }
            }
            return describe(n, n == null ? null : cm.getNetworkCapabilities(n), u);
        } catch (RuntimeException e) {
            return describe(null, null, null); // a permission or system error: "no network known" rather than a crash
        }
    }

    private static String transportsOf(NetworkCapabilities c) {
        StringBuilder b = new StringBuilder();
        if (c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) b.append("wifi,");
        if (c.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) b.append("cellular,");
        if (c.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) b.append("ethernet,");
        return b.length() == 0 ? "" : b.substring(0, b.length() - 1);
    }

    private JSObject describe(Network n, NetworkCapabilities c, TreeSet<String> u) {
        JSObject s = new JSObject();
        JSArray transports = new JSArray();
        boolean connected = false, validated = false, vpn = false;
        String id = "";
        try {
            if (n != null && c != null) {
                connected = c.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
                validated = c.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
                vpn = c.hasTransport(NetworkCapabilities.TRANSPORT_VPN);
                if (c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) transports.put("wifi");
                if (c.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) transports.put("cellular");
                if (c.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) transports.put("ethernet");
                if (vpn) transports.put("vpn");
                // A handle for "a different network", not an address or a name: nothing identifying leaves the phone.
                id = String.valueOf(n.hashCode());
            }
        } catch (RuntimeException e) {
            // A permission or system error: report "no network known" rather than crash.
        }
        s.put("connected", connected);
        s.put("validated", validated);
        s.put("vpn", vpn);
        s.put("transports", transports);
        s.put("id", id);
        if (u == null) {
            s.put("underlying", JSObject.NULL);
        } else {
            JSArray ut = new JSArray();
            for (String x : u) ut.put(x);
            s.put("underlying", !u.isEmpty());
            s.put("underlyingTransports", ut);
        }
        return s;
    }
}
