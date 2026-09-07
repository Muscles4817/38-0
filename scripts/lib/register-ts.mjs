// Registers the TypeScript resolution hooks. See ts-hooks.mjs.
//
//   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs script.mjs

import { register } from 'node:module';

register('./ts-hooks.mjs', import.meta.url);
