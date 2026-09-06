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

import path from 'node:path';

export async function resolve(specifier, context, nextResolve) {
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
