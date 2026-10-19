// App links (19 October 2026): a link to https://thewavelength.co.uk/app/ (with its #screen) in a Wavelength email opens
// the installed app instead of the browser. These two files let Android (App Links) and the iPhone (Universal Links)
// confirm that the site and the app belong together; the app itself claims the links from 1.0.20. Only the logbook's
// own address /app/ is claimed: the one-off signing pages (/app/sign/, /app/assess/) always open in the browser.
// Android: the signing certificate Google Play signs with (the original upload key, kept through Play App Signing).
// iPhone: Team ID and bundle identifier of the App Store app.
const ANDROID_CERT = 'EE:30:BF:D2:DF:C3:35:6E:AD:D1:B7:09:19:A5:0C:5B:66:AA:CB:16:43:EE:31:2E:63:76:7F:74:72:61:A1:E0';
export const ASSET_LINKS = [{
  relation: ['delegate_permission/common.handle_all_urls'],
  target: { namespace: 'android_app', package_name: 'uk.co.thewavelength.app', sha256_cert_fingerprints: [ANDROID_CERT] },
}];
export const APPLE_APP_SITE = { applinks: { details: [{ appIDs: ['XXUSS4CKW8.uk.co.thewavelength.app'], components: [{ '/': '/app/', comment: 'The logbook; its screen is in the #fragment' }] }] } };

export function appLinkFile(p) {
  const body = p === '/.well-known/assetlinks.json' ? ASSET_LINKS : p === '/.well-known/apple-app-site-association' ? APPLE_APP_SITE : null;
  if (!body) return null;
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
}
