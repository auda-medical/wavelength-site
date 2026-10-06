// Production guard for tools that write data (plan section 37). Each end-to-end and screenshot tool that creates
// accounts, logbook entries or sign-offs calls localOnly(target) before doing anything, and stops unless the target is
// this machine. There is no override: none of these tools ever needs to touch thewavelength.co.uk.
export function localOnly(target, tool = 'This tool') {
  let host = '';
  try { host = new URL(String(target)).hostname.toLowerCase(); } catch { host = ''; }
  const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host) || host.endsWith('.localhost');
  if (!local) {
    console.error(`${tool} writes test data and runs only against a local Worker (http://localhost:8787 from \`npx wrangler dev --local\`), never against ${host || String(target)}.`);
    process.exit(2);
  }
  return true;
}
