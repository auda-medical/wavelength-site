package uk.co.thewavelength.app;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The phone's network as Android sees it, for the logbook's sync status (src/app/native.js, WLNetwork).
 *
 * Android WebView's navigator.onLine only changes when the default network appears or disappears. A VPN that stays
 * up while the Wi-Fi or mobile data under it drops and returns hides those changes, so the logbook could not tell
 * "no network" from "network, but the Wavelength server cannot be reached", and missed the moment to retry.
 *
 * This plugin reads the default network's capabilities (internet, validated by Android, VPN, Wi-Fi, mobile data) and
 * tells the page whenever they change in a way that matters. It is read-only: it never changes the network, the
 * VPN, routing or any setting, and it sends nothing anywhere. Needs ACCESS_NETWORK_STATE (a normal permission).
 */
@CapacitorPlugin(name = "WLNetwork")
public class NetworkPlugin extends Plugin {
    private ConnectivityManager cm;
    private ConnectivityManager.NetworkCallback callback;
    private String last = "";

    @Override
    public void load() {
        cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return;
        // Inside the callbacks the status is built from the callback's own arguments: Android documents that
        // asking getActiveNetwork() there is prone to races. onAvailable is always followed by
        // onCapabilitiesChanged for the default network, so it sends nothing itself.
        callback = new ConnectivityManager.NetworkCallback() {
            @Override public void onCapabilitiesChanged(Network network, NetworkCapabilities caps) { changed(describe(network, caps)); }
            @Override public void onLost(Network network) { changed(describe(null, null)); }
            @Override public void onUnavailable() { changed(describe(null, null)); }
        };
        try {
            cm.registerDefaultNetworkCallback(callback);
        } catch (RuntimeException e) {
            callback = null; // too many callbacks registered, or no permission: getStatus still works
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (cm != null && callback != null) {
            try { cm.unregisterNetworkCallback(callback); } catch (RuntimeException ignored) { }
        }
        callback = null;
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(current());
    }

    // Only a change in what the logbook uses is sent on (not signal strength or bandwidth updates).
    private synchronized void changed(JSObject s) {
        String key = s.toString();
        if (key.equals(last)) return;
        last = key;
        notifyListeners("networkStatusChange", s);
    }

    // Outside the callbacks (getStatus): the default network as it is now.
    private JSObject current() {
        try {
            Network n = cm == null ? null : cm.getActiveNetwork();
            return describe(n, n == null ? null : cm.getNetworkCapabilities(n));
        } catch (RuntimeException e) {
            return describe(null, null); // a permission or system error: "no network known" rather than a crash
        }
    }

    private JSObject describe(Network n, NetworkCapabilities c) {
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
        return s;
    }
}
