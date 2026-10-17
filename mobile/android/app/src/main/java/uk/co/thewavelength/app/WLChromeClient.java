package uk.co.thewavelength.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.provider.MediaStore;
import android.webkit.ValueCallback;
import android.webkit.WebView;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.FileProvider;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

import java.io.File;
import java.util.Arrays;
import java.util.List;

/**
 * Capacitor's file chooser, except for "Take photo" and "Record a clip" (1.0.14).
 *
 * Capacitor sends a photo to a file in shared storage (Android/data/.../files/Pictures) that it never deletes, and
 * sends a clip to the camera app with no output file, so the camera app saves the clip in the phone's gallery (where
 * other apps and cloud photo backup can reach it). Here both go to a new file in Wavelength's private storage
 * (CapturePlugin.dir), handed to the camera app through the FileProvider for that one capture only. Choosing an
 * existing photo or clip is unchanged.
 *
 * If the camera app ignores the private file and returns its own copy, that copy is used and the page is told
 * (CapturePlugin.notifyElsewhere), so the learner can delete the gallery copy.
 */
public class WLChromeClient extends BridgeWebChromeClient {
    private final Bridge bridge;
    private final ActivityResultLauncher<Intent> launcher;
    private ValueCallback<Uri[]> pending;
    private File pendingFile;
    private Uri pendingUri;
    private boolean pendingVideo;

    public WLChromeClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
        launcher = bridge.registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), this::onResult);
    }

    @Override
    public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
        List<String> types = Arrays.asList(params.getAcceptTypes());
        boolean capture = params.isCaptureEnabled();
        boolean video = capture && types.contains("video/*");
        boolean photo = capture && types.contains("image/*");
        if (!video && !photo) return super.onShowFileChooser(webView, callback, params);
        Activity act = bridge.getActivity();
        Intent it = new Intent(video ? MediaStore.ACTION_VIDEO_CAPTURE : MediaStore.ACTION_IMAGE_CAPTURE);
        if (it.resolveActivity(act.getPackageManager()) == null) return super.onShowFileChooser(webView, callback, params);
        File f;
        Uri u;
        try {
            f = CapturePlugin.newCapture(act, video ? ".mp4" : ".jpg");
            u = FileProvider.getUriForFile(act, act.getPackageName() + ".fileprovider", f);
        } catch (Exception e) {
            return super.onShowFileChooser(webView, callback, params);
        }
        it.putExtra(MediaStore.EXTRA_OUTPUT, u);
        it.setClipData(ClipData.newRawUri("", u));
        it.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        if (pending != null) pending.onReceiveValue(null); // never leave an earlier chooser waiting
        pending = callback;
        pendingFile = f;
        pendingUri = u;
        pendingVideo = video;
        try {
            launcher.launch(it);
        } catch (Exception e) {
            finish(null);
            f.delete();
            return false;
        }
        return true;
    }

    private void onResult(ActivityResult r) {
        File f = pendingFile;
        Uri u = pendingUri;
        boolean video = pendingVideo;
        boolean ok = r.getResultCode() == Activity.RESULT_OK;
        if (ok && f != null && f.length() > 0) { finish(new Uri[] { u }); return; }
        if (f != null) f.delete(); // cancelled, or the camera app wrote somewhere else
        Uri other = ok && r.getData() != null ? r.getData().getData() : null;
        if (other != null && !other.equals(u)) {
            CapturePlugin.notifyElsewhere(video ? "clip" : "image");
            finish(new Uri[] { other });
            return;
        }
        finish(null);
    }

    private void finish(Uri[] result) {
        ValueCallback<Uri[]> cb = pending;
        pending = null;
        pendingFile = null;
        pendingUri = null;
        if (cb != null) cb.onReceiveValue(result);
    }
}
