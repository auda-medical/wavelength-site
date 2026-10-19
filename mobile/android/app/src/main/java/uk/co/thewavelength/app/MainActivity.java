package uk.co.thewavelength.app;

import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
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
        holdPortraitOnPhones(getResources().getConfiguration());
    }

    // 1.0.18: phones stay in portrait, as on the iPhone; a tablet or an unfolded foldable (smallest width 600 dp or more)
    // turns freely. Set here rather than in the manifest, so large screens have no orientation restriction (Google
    // Play large-screen guidance; Android 16 ignores such restrictions on large screens anyway). Folding or unfolding
    // does not recreate the activity (configChanges), so the choice is made again on every configuration change.
    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        holdPortraitOnPhones(newConfig);
    }

    private void holdPortraitOnPhones(Configuration c) {
        int want = c.smallestScreenWidthDp < 600 ? ActivityInfo.SCREEN_ORIENTATION_PORTRAIT : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
        if (getRequestedOrientation() != want) setRequestedOrientation(want);
    }
}
