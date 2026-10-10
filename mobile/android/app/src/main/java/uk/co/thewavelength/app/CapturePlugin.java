package uk.co.thewavelength.app;

import android.content.Context;
import android.os.Environment;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * Photos and clips taken with the camera from Wavelength (1.0.14).
 *
 * WLChromeClient has the camera app write each one into Wavelength's private internal storage (files/wl-captures),
 * which other apps cannot read, a cable-connected computer cannot see, and backup and device transfer exclude
 * (data_extraction_rules.xml). The app removes each file as soon as it holds its own copy (remove). Anything left
 * behind, because Android closed Wavelength while the camera was open, is listed at the next start (list) and offered
 * back to the learner; nothing is deleted without them.
 *
 * Before 1.0.14, photos from "Take photo" were written by Capacitor to the app's folder in shared storage
 * (Android/data/uk.co.thewavelength.app/files/Pictures/JPEG_*.jpg) and never removed. list() reports those as legacy,
 * so the learner can review or delete them.
 *
 * Only those two folders, and only file names Wavelength made (no paths), can be listed or removed.
 */
@CapacitorPlugin(name = "WLCapture")
public class CapturePlugin extends Plugin {
    static final String DIR = "wl-captures";
    private static CapturePlugin live;

    @Override
    public void load() { live = this; }

    static File dir(Context c) {
        File d = new File(c.getFilesDir(), DIR);
        if (!d.isDirectory()) d.mkdirs();
        return d;
    }

    static File legacyDir(Context c) { return c.getExternalFilesDir(Environment.DIRECTORY_PICTURES); }

    static File newCapture(Context c, String ext) throws IOException {
        String stamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.UK).format(new Date());
        File f = new File(dir(c), "WL_" + stamp + "_" + Long.toString(System.nanoTime() % 1000000L, 36) + ext);
        if (!f.createNewFile()) throw new IOException("capture file exists");
        return f;
    }

    /** The camera app ignored the private file and kept its own copy (usually in the gallery): tell the page. */
    static void notifyElsewhere(String kind) {
        CapturePlugin p = live;
        if (p == null) return;
        JSObject o = new JSObject();
        o.put("kind", kind);
        p.notifyListeners("elsewhere", o);
    }

    private static boolean ours(String name, boolean legacy) {
        if (name.contains("/") || name.contains("\\") || name.contains("..")) return false;
        return legacy ? name.startsWith("JPEG_") && name.endsWith(".jpg") : name.startsWith("WL_") && (name.endsWith(".jpg") || name.endsWith(".mp4"));
    }

    private void add(JSArray out, File d, boolean legacy) {
        if (d == null) return;
        File[] files = d.listFiles();
        if (files == null) return;
        for (File f : files) {
            if (!f.isFile() || !ours(f.getName(), legacy)) continue;
            if (f.length() == 0) { f.delete(); continue; } // a capture that never happened
            JSObject o = new JSObject();
            o.put("name", f.getName());
            o.put("path", f.getAbsolutePath());
            o.put("size", f.length());
            o.put("modified", f.lastModified());
            o.put("legacy", legacy);
            o.put("kind", f.getName().endsWith(".mp4") ? "clip" : "image");
            out.put(o);
        }
    }

    @PluginMethod
    public void list(PluginCall call) {
        JSArray files = new JSArray();
        add(files, dir(getContext()), false);
        add(files, legacyDir(getContext()), true);
        JSObject r = new JSObject();
        r.put("files", files);
        call.resolve(r);
    }

    @PluginMethod
    public void remove(PluginCall call) {
        boolean legacy = Boolean.TRUE.equals(call.getBoolean("legacy", false));
        File d = legacy ? legacyDir(getContext()) : dir(getContext());
        int removed = 0;
        try {
            JSArray names = call.getArray("names", new JSArray());
            List<Object> list = names.toList();
            for (Object o : list) {
                String n = String.valueOf(o);
                if (d == null || !ours(n, legacy)) continue;
                File f = new File(d, n);
                if (f.isFile() && f.delete()) removed++;
            }
        } catch (Exception e) {
            call.reject("Could not remove: " + e.getMessage());
            return;
        }
        JSObject r = new JSObject();
        r.put("removed", removed);
        call.resolve(r);
    }
}
