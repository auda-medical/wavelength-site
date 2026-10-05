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
    'WKAppBoundDomains': '<array>\n\t\t<string>thewavelength.co.uk</string>\n\t\t<string>www.thewavelength.co.uk</string>\n\t</array>',
    'NSCameraUsageDescription': '<string>Wavelength uses the camera when you photograph an ultrasound screen or record a short clip for your logbook. Images stay on your phone.</string>',
    'NSMicrophoneUsageDescription': '<string>Your phone asks for the microphone when you record video. Wavelength removes the sound before saving a clip.</string>',
    'NSPhotoLibraryUsageDescription': '<string>Wavelength opens your photos when you choose ultrasound images to add to your logbook. Images stay on your phone.</string>',
    'NSPhotoLibraryAddUsageDescription': '<string>Wavelength saves exported case PDFs and images to your photos when you ask it to.</string>',
    'ITSAppUsesNonExemptEncryption': '<false/>',
    'CFBundleLocalizations': '<array>' + ''.join(f'<string>{l}</string>' for l in ['en', 'fr', 'es', 'de', 'it', 'pl', 'ar', 'ru', 'zh-Hans']) + '</array>',
}
for k, v in extra.items():
    if f'<key>{k}</key>' not in s:
        s = re.sub(r'</dict>\s*</plist>\s*$', f'\t<key>{k}</key>\n\t{v}\n</dict>\n</plist>\n', s)
plist.write_text(s)

man = root / 'android/app/src/main/AndroidManifest.xml'
m = man.read_text()
m = m.replace('android:allowBackup="true"', 'android:allowBackup="false"\n        android:fullBackupContent="false"')
if 'screenOrientation' not in m:
    m = m.replace('android:launchMode="singleTask"', 'android:launchMode="singleTask"\n            android:screenOrientation="portrait"')
man.write_text(m)

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
