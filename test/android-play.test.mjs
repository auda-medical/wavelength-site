// 1.0.18: Google Play's release checks on 1.0.17 (23), 18 October 2026. R8 optimises the release build ("DEX code
// optimisation", due February 2027), and the manifest carries no orientation lock (large-screen guidance): phones are
// held in portrait from MainActivity, as on the iPhone, and tablets and unfolded foldables turn freely.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../mobile/' + p, import.meta.url), 'utf8');

test('the Android release build is optimised by R8', () => {
  const g = read('android/app/build.gradle');
  assert.match(g, /release \{[\s\S]*?minifyEnabled true/);
  assert.doesNotMatch(g, /minifyEnabled false/);
  assert.match(g, /getDefaultProguardFile\('proguard-android-optimize\.txt'\)/);
  // The Capacitor rules that keep plugins (including WLNetwork and WLCapture) reach the app as consumer rules.
  assert.match(read('node_modules/@capacitor/android/capacitor/build.gradle'), /consumerProguardFiles 'proguard-rules\.pro'/);
  assert.match(read('node_modules/@capacitor/android/capacitor/proguard-rules.pro'), /-keep public class \* extends com\.getcapacitor\.Plugin/);
});

test('no orientation lock in the manifest; phones held in portrait, large screens free', () => {
  assert.doesNotMatch(read('android/app/src/main/AndroidManifest.xml'), /screenOrientation|resizeableActivity="false"/);
  const a = read('android/app/src/main/java/uk/co/thewavelength/app/MainActivity.java');
  assert.match(a, /smallestScreenWidthDp < 600 \? ActivityInfo\.SCREEN_ORIENTATION_PORTRAIT : ActivityInfo\.SCREEN_ORIENTATION_UNSPECIFIED/);
  assert.match(a, /onConfigurationChanged\(Configuration newConfig\)[\s\S]*holdPortraitOnPhones\(newConfig\)/);
  // The iPhone app is iPhone only and portrait, the same as an Android phone.
  const plist = read('ios/App/App/Info.plist');
  assert.match(plist, /<key>UISupportedInterfaceOrientations<\/key>\s*<array>\s*<string>UIInterfaceOrientationPortrait<\/string>\s*<\/array>/);
  assert.match(read('ios/App/App.xcodeproj/project.pbxproj'), /TARGETED_DEVICE_FAMILY = 1;/);
});

test('patch-native keeps both after a Capacitor upgrade', () => {
  const p = read('scripts/patch-native.py');
  assert.doesNotMatch(p, /android:screenOrientation="portrait"'\)\s*$/m);
  assert.match(p, /m = m\.replace\('\\n            android:screenOrientation="portrait"', ''\)/);
  assert.match(p, /minifyEnabled true/);
});
