package uk.co.thewavelength.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.install.model.UpdateAvailability;
import com.google.android.play.core.review.ReviewInfo;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;

/**
 * Store ratings for the logbook (src/app/native.js, StoreReview; when to ask is decided in src/app/rating.js).
 *
 *   requestReview  asks Google Play for its In-App Review card (com.google.android.play:review). Google Play decides
 *                  whether it appears (quotas, a Play Store install) and tells the app nothing either way, so the call
 *                  resolves once the flow has finished whether or not anything was shown.
 *   checkUpdate    (1.0.30) asks Google Play whether a newer version of Wavelength is available for this phone
 *                  (com.google.android.play:app-update). Resolves { available, versionCode }; available is false when
 *                  Google Play cannot be asked (no Play Store, offline, a sideloaded build). Nothing is installed here:
 *                  the app shows its own pop-up and Update now opens the listing (openStore).
 *   openStore      opens Wavelength's Google Play listing in the Play Store app (or the browser where there is no Play
 *                  Store), for "Rate Wavelength" in Settings. Only an https address on play.google.com is opened.
 *
 * The same plugin name and methods as the iPhone plugin (StoreReviewPlugin.swift). No permission is needed, and
 * nothing is collected or sent by the app.
 */
@CapacitorPlugin(name = "StoreReview")
public class StoreReviewPlugin extends Plugin {

    @PluginMethod
    public void requestReview(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity");
            return;
        }
        ReviewManager manager = ReviewManagerFactory.create(activity);
        manager.requestReviewFlow().addOnCompleteListener(request -> {
            if (!request.isSuccessful()) {
                call.reject("Review not available");
                return;
            }
            ReviewInfo info = request.getResult();
            manager.launchReviewFlow(activity, info).addOnCompleteListener(done -> call.resolve());
        });
    }

    @PluginMethod
    public void checkUpdate(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity");
            return;
        }
        AppUpdateManager manager = AppUpdateManagerFactory.create(activity);
        manager.getAppUpdateInfo().addOnCompleteListener(task -> {
            JSObject out = new JSObject();
            if (!task.isSuccessful() || task.getResult() == null) {
                out.put("available", false);
                call.resolve(out);
                return;
            }
            AppUpdateInfo info = task.getResult();
            out.put("available", info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE);
            out.put("versionCode", info.availableVersionCode());
            call.resolve(out);
        });
    }

    @PluginMethod
    public void openStore(PluginCall call) {
        String url = call.getString("url", "");
        Uri uri = Uri.parse(url == null ? "" : url);
        if (!"https".equals(uri.getScheme()) || !"play.google.com".equals(uri.getHost())) {
            call.reject("Not a Google Play address");
            return;
        }
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        intent.setPackage("com.android.vending");
        try {
            activity.startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException noPlay) {
            intent.setPackage(null);
            try {
                activity.startActivity(intent);
                call.resolve();
            } catch (ActivityNotFoundException none) {
                call.reject("No app can open Google Play");
            }
        }
    }
}
