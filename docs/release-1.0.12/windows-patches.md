# Wavelength 1.0.12: applying the patches on Windows

The handover holds the 1.0.12 work as a numbered `git format-patch` series, made from the seed commit `445dc66`. The
seed's tree is `1e40d1b338796c030632d94959398d8d26a4ae5d`, the verified 1.0.11 source. Applying the series rebuilds
exactly the final tree in `manifest.md`. Nothing here needs credentials.

## 1. Check the files

In PowerShell, in the folder with the handover:

```
Get-FileHash .\patches\*.patch -Algorithm SHA256
```

Compare each hash with `SHA256SUMS.txt`. Stop if any differ.

## 2. Get a working copy at the 1.0.11 tree

Use your local clone of the repository. Do not touch your `main` branch. Create a branch at the commit whose tree is
the 1.0.11 tree:

```
cd C:\path\to\wavelength-site
git status                                   # must be clean; commit or stash your own work first
git log --format="%H %T %s" -n 30            # find the commit whose tree (second column) is 1e40d1b3...
git switch -c wl-1.0.12 <that commit>
git rev-parse HEAD^{tree}                    # must print 1e40d1b338796c030632d94959398d8d26a4ae5d
```

If no commit has that tree, use the commit that the 1.0.11 Android build was made from. `git am` then still applies if
the files are the same. Otherwise apply with `git am -3` (step 3) and check the tree at the end.

Line endings: the patches use LF. If Git for Windows is set to `core.autocrlf=true`, run this before applying, so
whitespace does not reject them:

```
git config core.autocrlf false
git checkout -- .
```

## 3. Apply

```
git am .\patches\*.patch
```

If one stops with a conflict: `git am --show-current-patch=diff` shows it. Fix the files, `git add` them, then
`git am --continue`. `git am --abort` puts everything back.

## 4. Confirm

```
git rev-parse HEAD^{tree}                    # must equal the final tree in manifest.md
git log --oneline 445dc66..HEAD             # the commits listed in manifest.md (hashes differ, subjects match)
```

Commit hashes differ from the manifest because of the committer and date. The tree hash is the check that matters.

## 5. Test and build

Node 22.5 or later:

```
npm test
node build.js
```

Android, with your signing set up locally as for 1.0.11:

```
cd mobile
npm ci
$env:WL_APP_VERSION="1.0.12"; node scripts\build-www.mjs
npx cap sync android
cd android
$env:WL_VERSION_NAME="1.0.12"; $env:WL_VERSION_CODE="18"; .\gradlew bundleRelease assembleRelease
```

Sign with your own key, the same way as 1.0.11. Then work through `checklist-android.md`.

## 6. Push (when you decide)

`git push -u origin wl-1.0.12`, then open a pull request. Follow `backend-and-web.md` for the website deployment.
