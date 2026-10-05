// Node module hooks so tests can import the Worker as Wrangler bundles it: plain `import x from './file.json'`
// and binary `.bin` modules (Wrangler "Data" rule) become default exports.
import { readFile } from 'node:fs/promises';
export async function load(url, context, next) {
  if (url.endsWith('.json') && !(context.importAttributes && context.importAttributes.type)) {
    return { format: 'module', shortCircuit: true, source: `export default ${await readFile(new URL(url), 'utf8')};` };
  }
  if (url.endsWith('.bin')) {
    const b64 = (await readFile(new URL(url))).toString('base64');
    return { format: 'module', shortCircuit: true, source: `export default Uint8Array.from(atob(${JSON.stringify(b64)}), (c) => c.charCodeAt(0)).buffer;` };
  }
  return next(url, context);
}
