package uk.co.thewavelength.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugins (not from npm) are registered before the bridge starts.
        registerPlugin(NetworkPlugin.class);
        registerPlugin(CapturePlugin.class);
        super.onCreate(savedInstanceState);
        // 1.0.14: photos and clips taken with the camera go to Wavelength's private storage, never the gallery or
        // shared storage (WLChromeClient). Set while the activity is being created, as its result launcher requires.
        if (bridge != null && bridge.getWebView() != null) bridge.getWebView().setWebChromeClient(new WLChromeClient(bridge));
    }
}
