# Signing Wavelength 1.0.13 (19) and installing it over 1.0.12

The same procedure as every release since 1.0.8 (`WINDOWS_SIGNING_GUIDE.md` in Downloads), with this release's names.
Claude built the unsigned files; signing stays with you, on this PC, with passwords typed at hidden prompts.

**The quick way:** run `C:\WavelengthSigning\sign-wavelength-1.0.13.ps1` in Windows PowerShell
(`powershell -ExecutionPolicy Bypass -File C:\WavelengthSigning\sign-wavelength-1.0.13.ps1`). It does steps 1 to 5
below, with the same hidden prompts, and stops at the first check that fails.

**Rules**
- Windows PowerShell, one block at a time, the **same window** from step 2 to step 4 (the passwords live only in it).
- Never paste a password, the keystore or its contents anywhere. Closing the window erases the passwords.
- The unsigned files are made read-only and never changed; signing writes new files into `C:\WavelengthSigning\signed`.
- Nothing here uploads anything, and nothing here uninstalls the app.

## 1. Check the unsigned files

They are in `C:\WavelengthSigning\unsigned\wavelength-1.0.13\` (a copy is also in the release folder named in the
reply). Their SHA-256 checksums are in `SHA256SUMS.txt` next to them.

```powershell
$U = 'C:\WavelengthSigning\unsigned\wavelength-1.0.13'
Get-Content "$U\SHA256SUMS.txt"
Get-FileHash "$U\wavelength-1.0.13-19-unsigned.apk", "$U\wavelength-1.0.13-19-unsigned.aab" -Algorithm SHA256 |
  ForEach-Object { '{0}  {1}' -f $_.Hash.ToLower(), (Split-Path $_.Path -Leaf) }
Set-ItemProperty "$U\wavelength-1.0.13-19-unsigned.apk", "$U\wavelength-1.0.13-19-unsigned.aab" IsReadOnly $true
```
The two lists must be the same.

## 2. Confirm the keystore is the original signing identity

The installed 1.0.12 (18) is signed with certificate SHA-256
`ee30bfd2dfc3356eadd1b70919a50c5b66aacb1643ee312e63767f747261a1e0` (CN=Auda Medical Ltd). This is public, not a secret.

```powershell
$BT = 'C:\Android\build-tools-36.1'
$refSha = ((& "$BT\apksigner.bat" verify --print-certs 'C:\WavelengthSigning\signed\wavelength-1.0.12-18-release.apk') | Select-String 'Signer #1 certificate SHA-256 digest:\s*([0-9a-fA-F]+)').Matches[0].Groups[1].Value.ToLower()
"Installed 1.0.12 certificate: $refSha"
$JKS   = 'C:\WavelengthSigning\keys\wavelength-original-upload-keystore.jks'
$ALIAS = Read-Host 'Key alias'
$sp = Read-Host 'Keystore password (hidden)' -AsSecureString
$kp = Read-Host 'Key password (hidden; press Enter if it is the same as the keystore password)' -AsSecureString
$env:WL_KS_PASS  = [System.Net.NetworkCredential]::new('', $sp).Password
$env:WL_KEY_PASS = [System.Net.NetworkCredential]::new('', $kp).Password
if (-not $env:WL_KEY_PASS) { $env:WL_KEY_PASS = $env:WL_KS_PASS }
$ksSha = ((keytool -list -v -keystore $JKS -alias $ALIAS '-storepass:env' WL_KS_PASS) | Select-String 'SHA256:\s*([0-9A-Fa-f:]+)').Matches[0].Groups[1].Value.Replace(':','').ToLower()
if ($ksSha -and $ksSha -eq $refSha) { Write-Host 'MATCH: this is the original signing identity.' -ForegroundColor Green } else { Write-Host 'NO MATCH: stop here. Do not sign.' -ForegroundColor Red }
```
Continue only on **MATCH**.

## 3. Align and sign the APK

```powershell
$S = 'C:\WavelengthSigning\signed'
& "$BT\zipalign.exe" -p -f 4 "$U\wavelength-1.0.13-19-unsigned.apk" "$S\aligned-temp.apk"
& "$BT\zipalign.exe" -c -p 4 "$S\aligned-temp.apk"; "zipalign check exit code: $LASTEXITCODE (0 = good)"
& "$BT\apksigner.bat" sign --ks $JKS --ks-key-alias $ALIAS --ks-pass env:WL_KS_PASS --key-pass env:WL_KEY_PASS --v4-signing-enabled false --out "$S\wavelength-1.0.13-19-release.apk" "$S\aligned-temp.apk"
Remove-Item "$S\aligned-temp.apk"
$apkSha = ((& "$BT\apksigner.bat" verify --print-certs "$S\wavelength-1.0.13-19-release.apk") | Select-String 'Signer #1 certificate SHA-256 digest:\s*([0-9a-fA-F]+)').Matches[0].Groups[1].Value.ToLower()
if ($apkSha -eq $refSha) { Write-Host 'APK signed with the original identity.' -ForegroundColor Green } else { Write-Host 'APK certificate does not match: stop.' -ForegroundColor Red }
```

## 4. Sign the AAB (for Google Play, when you decide to upload)

```powershell
jarsigner -keystore $JKS '-storepass:env' WL_KS_PASS '-keypass:env' WL_KEY_PASS -signedjar "$S\wavelength-1.0.13-19-release.aab" "$U\wavelength-1.0.13-19-unsigned.aab" $ALIAS
jarsigner -verify "$S\wavelength-1.0.13-19-release.aab"
$aabSha = ((keytool -printcert -jarfile "$S\wavelength-1.0.13-19-release.aab") | Select-String 'SHA256:\s*([0-9A-Fa-f:]+)').Matches[0].Groups[1].Value.Replace(':','').ToLower()
if ($aabSha -eq $refSha) { Write-Host 'AAB signed with the original identity.' -ForegroundColor Green } else { Write-Host 'AAB certificate does not match: stop.' -ForegroundColor Red }
Remove-Item Env:WL_KS_PASS, Env:WL_KEY_PASS; Remove-Variable sp, kp
```
A warning about **no timestamp** or the certificate's expiry is normal for app signing. The last line erases the
passwords from the window.

## 5. Check package, version and signatures, then record the checksums

```powershell
& "$BT\aapt2.exe" dump badging "$S\wavelength-1.0.13-19-release.apk" | Select-String '^package:'
& "$BT\apksigner.bat" verify "$S\wavelength-1.0.13-19-release.apk"; "apksigner exit code: $LASTEXITCODE (0 = good)"
Get-FileHash "$S\wavelength-1.0.13-19-release.apk", "$S\wavelength-1.0.13-19-release.aab" -Algorithm SHA256 |
  ForEach-Object { '{0}  {1}' -f $_.Hash.ToLower(), (Split-Path $_.Path -Leaf) } | Set-Content "$S\SHA256SUMS-1.0.13-signed.txt"
Get-Content "$S\SHA256SUMS-1.0.13-signed.txt"
```
Expected: `package: name='uk.co.thewavelength.app' versionCode='19' versionName='1.0.13' ...` and exit code 0.

## 6. Install over 1.0.12 (keeps everything on the phone)

Android replaces the app in place when the package name and signing certificate are the same and the version code
is higher (19 > 18). Your logbook, photos, clips, login and app lock setting stay. **Do not uninstall 1.0.12 first:**
uninstalling deletes photos and clips that live only on the phone.

1. In Wavelength: Me > Back up and restore > Back up now. Keep the file somewhere off the phone.
2. Copy `C:\WavelengthSigning\signed\wavelength-1.0.13-19-release.apk` to the phone (USB, or the phone's Downloads
   folder through Link to Windows).
3. On the phone, open the file from Files > Downloads. If asked, allow "Install unknown apps" for Files, just for this.
4. Android asks whether to **update** the existing app (the exact words vary by phone; it should not say "install a
   new app"). Tap **Update**. If it says the package conflicts with an existing package, or offers only to
   uninstall, stop: that means a different signing key, and nothing should be uninstalled.
5. Open Wavelength: no sign-in screen. Settings > About shows **1.0.13 (19)**. Then work through
   `checklist-android.md`.

Alternatively, with USB debugging on: `adb install -r C:\WavelengthSigning\signed\wavelength-1.0.13-19-release.apk`
(`-r` replaces the installed app and keeps its data).

Google Play: the signed AAB is ready for internal testing when you choose to upload it in Play Console. Nothing has
been uploaded.
