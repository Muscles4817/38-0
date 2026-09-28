// Module resolution hooks that let a plain `node` script import the game's
// TypeScript modules.
//
// Used with node's built-in type stripping:
//
//   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs script.mjs
//
// Type stripping handles the types; what it does not do is resolve an
// extensionless import, because that is a bundler convention rather than an
// ESM one. `./formations` is not a specifier node can resolve, so this appends
// `.ts` and retries.
//
// Why bother: the alternative is reimplementing the formation matcher in
// `.mjs`, and a second copy of it would drift from the one the game and CI
// actually use. A derived formation is only worth having if it is reproducible,
// so the deriving script has to run the same code.
//
// Two more bundler conventions, so a script can import gameData.ts and play a
// season with the code the game runs (see scripts/sim-report.mjs):
//
//   - `@/…` is the tsconfig path alias for `src/…`;
//   - a JSON file imported without `with { type: 'json' }`, which a bundler
//     allows and node refuses, is served as a module exporting the parsed JSON.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    specifier = pathToFileURL(path.join(SRC, specifier.slice(2))).href;
    if (!path.extname(specifier)) specifier += '.ts';
    return nextResolve(specifier, context);
  }
  const relative = specifier.startsWith('./') || specifier.startsWith('../');
  if (relative && !path.extname(specifier)) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      // Not a TypeScript module; fall through to normal resolution.
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.json') && context.importAttributes?.type !== 'json') {
    const { source } = await nextLoad(url, { ...context, format: 'json', importAttributes: { type: 'json' } });
    return { format: 'module', source: `export default ${source};`, shortCircuit: true };
  }
  return nextLoad(url, context);
}
