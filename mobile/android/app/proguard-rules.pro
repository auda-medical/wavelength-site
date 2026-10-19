# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# 1.0.20: Capacitor reads @CapacitorPlugin(permissions = @Permission(...)) at runtime (Plugin.getPermissionStates).
# Without these, R8 strips the annotation data and a plugin's checkPermissions crashes the app (found on the emulator
# with Firebase messaging, 19 Oct 2026; 1.0.18 and 1.0.19 never call it).
-keepattributes RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations,AnnotationDefault,*Annotation*
-keep @interface com.getcapacitor.annotation.** { *; }
-keep class com.getcapacitor.annotation.** { *; }
