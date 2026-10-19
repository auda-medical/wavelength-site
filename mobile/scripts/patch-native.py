#!/usr/bin/env python3
# Applies Wavelength's native settings to the Capacitor projects. Safe to run more than once.
# Run after `npx cap add ios|android` or a Capacitor upgrade: python3 scripts/patch-native.py
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent

plist = root / 'ios/App/App/Info.plist'
s = plist.read_text()
s = s.replace('<string>armv7</string>', '<string>arm64</string>')
s = re.sub(r'(<key>UISupportedInterfaceOrientations</key>\s*<array>)(.*?)(</array>)', r'\1\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t\3', s, count=1, flags=re.S)
extra = {
    'NSFaceIDUsageDescription': '<string>Wavelength uses Face ID to unlock your logbook when you turn on app lock.</string>',
    'NSCameraUsageDescription': '<string>Wavelength uses the camera when you photograph an ultrasound screen or record a short clip for your logbook. Images stay on your phone.</string>',
    'NSMicrophoneUsageDescription': '<string>Your phone asks for the microphone when you record video. Wavelength removes the sound before saving a clip.</string>',
    'NSPhotoLibraryUsageDescription': '<string>Wavelength opens your photos when you choose ultrasound images to add to your logbook. Images stay on your phone.</string>',
    'NSPhotoLibraryAddUsageDescription': '<string>Wavelength saves exported case PDFs and images to your photos when you ask it to.</string>',
    'ITSAppUsesNonExemptEncryption': '<false/>',
    'CFBundleLocalizations': '<array>' + ''.join(f'<string>{l}</string>' for l in ['en', 'fr', 'es', 'de', 'it', 'pl', 'ar', 'ru', 'zh-Hans']) + '</array>',
}
# The logbook ships inside the app now (www/), so the app-bound domain list for the website is no longer used.
s = re.sub(r'\s*<key>WKAppBoundDomains</key>\s*<array>.*?</array>', '', s, flags=re.S)
for k, v in extra.items():
    if f'<key>{k}</key>' not in s:
        s = re.sub(r'</dict>\s*</plist>\s*$', f'\t<key>{k}</key>\n\t{v}\n</dict>\n</plist>\n', s)
plist.write_text(s)

# iPhone only (store blocker B1). The layout is designed for phones; iPad support would mean layout work and iPad
# screenshots, so `npx cap add ios` must not bring it back. Future iPad support: TARGETED_DEVICE_FAMILY "1,2" plus layout.
s = plist.read_text()
s = re.sub(r'\s*<key>UISupportedInterfaceOrientations~ipad</key>\s*<array>.*?</array>', '', s, flags=re.S)
plist.write_text(s)
pbx = root / 'ios/App/App.xcodeproj/project.pbxproj'
x = pbx.read_text()
x = re.sub(r'TARGETED_DEVICE_FAMILY = [^;]*;', 'TARGETED_DEVICE_FAMILY = 1;', x)
pbx.write_text(x)

# iOS backup exclusion (store blocker B2): ultrasound images and clips live in WKWebView's IndexedDB under
# Library/WebKit, which iOS would otherwise copy into iCloud and iTunes backups.
delegate = root / 'ios/App/App/AppDelegate.swift'
d = delegate.read_text()
if 'excludeWebKitFromBackup' not in d:
    d = re.sub(r'(func application\(_ application: UIApplication, didFinishLaunchingWithOptions[^{]*\{\n)(\s*// Override point for customization after application launch\.\n)?',
               r'\1        excludeWebKitFromBackup()\n', d, count=1)
    head, tail = d.rsplit('}', 1)
    d = head.rstrip() + '''

    // Ultrasound images and clips are kept in WKWebView's IndexedDB under Library/WebKit. They must never go to
    // iCloud or iTunes backups: they stay on this phone, and a new phone gets them back only from the learner's own
    // backup file. Set on every launch, creating the folder first so the flag sticks before WebKit writes to it.
    // Errors are ignored: the app must always start.
    private func excludeWebKitFromBackup() {
        let fm = FileManager.default
        guard let library = fm.urls(for: .libraryDirectory, in: .userDomainMask).first else { return }
        var webKit = library.appendingPathComponent("WebKit", isDirectory: true)
        try? fm.createDirectory(at: webKit, withIntermediateDirectories: true, attributes: nil)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? webKit.setResourceValues(values)
    }
}''' + tail
    delegate.write_text(d)

man = root / 'android/app/src/main/AndroidManifest.xml'
m = man.read_text()
# No Google Drive backup (Android 11 and below) and, through dataExtractionRules, no cloud backup or device-to-device
# transfer on Android 12+ (store blocker B3).
m = m.replace('android:allowBackup="true"', 'android:allowBackup="false"')
if 'android:allowBackup=' not in m:
    m = m.replace('<application', '<application\n        android:allowBackup="false"', 1)
if 'android:fullBackupContent=' not in m:
    m = m.replace('android:allowBackup="false"', 'android:allowBackup="false"\n        android:fullBackupContent="false"', 1)
if 'android:dataExtractionRules=' not in m:
    m = m.replace('android:fullBackupContent="false"', 'android:fullBackupContent="false"\n        android:dataExtractionRules="@xml/data_extraction_rules"', 1)
# 1.0.20: app links for /app/ and the Firebase notification icon, colour and channel (see the manifest).
if 'android:autoVerify="true"' not in m:
    m = m.replace('''                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>''', '''                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="thewavelength.co.uk" android:path="/app/" />
            </intent-filter>
        </activity>
        <meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_stat_wavelength" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_color" android:resource="@color/wl_deep" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="requests" />
        <meta-data android:name="firebase_messaging_auto_init_enabled" android:value="false" />
        <meta-data android:name="firebase_analytics_collection_enabled" android:value="false" />''', 1)
# 1.0.18: no orientation lock in the manifest (Google Play large-screen guidance). MainActivity keeps phones in
# portrait and lets tablets and unfolded foldables turn.
m = m.replace('\n            android:screenOrientation="portrait"', '')
if '<queries>' not in m:
    # Android 11+ package visibility: without this, "Take photo" and "Record clip" fall back to the file picker.
    m = m.replace('    <!-- Permissions -->', '''    <!-- Camera and video apps the logbook hands off to for "Take photo" and "Record clip" (no camera permission needed). -->
    <queries>
        <intent>
            <action android:name="android.media.action.IMAGE_CAPTURE" />
        </intent>
        <intent>
            <action android:name="android.media.action.VIDEO_CAPTURE" />
        </intent>
    </queries>

    <!-- Permissions -->''')
if 'ACCESS_NETWORK_STATE' not in m:
    # 1.0.9: without it Android WebView never reports going offline or coming back, so the logbook missed reconnects.
    m = m.replace('    <uses-permission android:name="android.permission.INTERNET" />', '''    <uses-permission android:name="android.permission.INTERNET" />
    <!-- Lets the app's WebView see when the phone goes offline and comes back, so the logbook syncs on reconnect.
         A normal permission: no prompt, no access to other apps or to the network's content. -->
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />''')
man.write_text(m)
domains = ['root', 'file', 'database', 'sharedpref', 'external', 'device_root', 'device_file', 'device_database', 'device_sharedpref']
rules = ''.join(f'        <exclude domain="{d}" path="." />\n' for d in domains)
xml = root / 'android/app/src/main/res/xml'
xml.mkdir(parents=True, exist_ok=True)
(xml / 'data_extraction_rules.xml').write_text(f'''<?xml version="1.0" encoding="utf-8"?>
<!-- Android 12+ backup and device-to-device transfer: nothing from the app is copied.
     Text logbook data restores through the Wavelength account sync; images and clips must never transfer between
     devices automatically. A new phone gets images back only from the learner's own backup file.
     Android 11 and below: android:allowBackup="false" in AndroidManifest.xml. Applied by mobile/scripts/patch-native.py. -->
<data-extraction-rules>
    <cloud-backup>
{rules}    </cloud-backup>
    <device-transfer>
{rules}    </device-transfer>
</data-extraction-rules>
''')

# Deep navy behind the status and navigation bars.
(root / 'android/app/src/main/res/values/wl_colors.xml').write_text('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <!-- Wavelength deep navy: behind the status and navigation bars. -->\n    <color name="wl_deep">#0A1526</color>\n</resources>\n')
lay = root / 'android/app/src/main/res/layout/activity_main.xml'
l = lay.read_text()
if 'android:background' not in l:
    l = l.replace('    tools:context=".MainActivity">', '    android:background="@color/wl_deep"\n    tools:context=".MainActivity">')
lay.write_text(l)

# Release signing from environment variables (set by the GitHub workflow). Local debug builds are unaffected.
gradle = root / 'android/app/build.gradle'
g = gradle.read_text()
if 'WL_KEYSTORE' not in g:
    g = g.replace('    buildTypes {', '''    signingConfigs {
        release {
            if (System.getenv("WL_KEYSTORE")) {
                storeFile file(System.getenv("WL_KEYSTORE"))
                storePassword System.getenv("WL_KEYSTORE_PASSWORD")
                keyAlias System.getenv("WL_KEY_ALIAS")
                keyPassword System.getenv("WL_KEY_PASSWORD")
            }
        }
    }
    buildTypes {''', 1)
    g = g.replace('            minifyEnabled false\n', '            minifyEnabled false\n            if (System.getenv("WL_KEYSTORE")) signingConfig signingConfigs.release\n', 1)
    g = re.sub(r'versionCode \d+', 'versionCode(Integer.parseInt(System.getenv("WL_VERSION_CODE") ?: "1"))', g)
    g = re.sub(r'versionName "[^"]*"', 'versionName(System.getenv("WL_VERSION_NAME") ?: "1.0.0")', g)
# 1.0.18: R8 on for release builds (Google Play "DEX code optimisation").
g = g.replace('            minifyEnabled false\n', '            minifyEnabled true\n', 1)
g = g.replace("getDefaultProguardFile('proguard-android.txt')", "getDefaultProguardFile('proguard-android-optimize.txt')", 1)
gradle.write_text(g)
print('patched')
