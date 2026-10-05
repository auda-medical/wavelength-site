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

man = root / 'android/app/src/main/AndroidManifest.xml'
m = man.read_text()
m = m.replace('android:allowBackup="true"', 'android:allowBackup="false"\n        android:fullBackupContent="false"')
if 'screenOrientation' not in m:
    m = m.replace('android:launchMode="singleTask"', 'android:launchMode="singleTask"\n            android:screenOrientation="portrait"')
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
man.write_text(m)

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
gradle.write_text(g)
print('patched')
