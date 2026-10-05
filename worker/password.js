// Password rules for app accounts (sign-up, reset, change, claim). The app shows the same rules as a live
// checklist (pwRules in src/app/app.js); keep the two in step. Unicode classes, so Cyrillic, Greek and other
// scripts count as upper and lower case letters.
export const PASSWORD_MIN = 10;
export function passwordProblem(pw) {
  pw = String(pw || '');
  if (pw.length > 200) return 'Choose a password of at most 200 characters.';
  const ok = pw.length >= PASSWORD_MIN && /\p{Lu}/u.test(pw) && /\p{Ll}/u.test(pw) && /\p{Nd}/u.test(pw) && /[^\p{L}\p{N}]/u.test(pw);
  if (!ok) return { error: 'Choose a password of at least 10 characters with an uppercase letter, a lowercase letter, a number and a symbol.' }.error;
  return '';
}
