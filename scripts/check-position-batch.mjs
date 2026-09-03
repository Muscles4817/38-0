// Validates one batch of position assignments.
//
//   node scripts/check-position-batch.mjs data/raw/positions/batch-003.json
//   node scripts/check-position-batch.mjs            # every batch
//
// Checks each assignment against what FBref recorded. Team-level coherence is a
// separate check that needs whole club-seasons; see
// src/lib/positionCoherence.test.ts.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { checkAssignment } from './lib/positions.mjs';

const ROOT = process.cwd();
const DIR = path.join(ROOT, 'data', 'raw', 'positions');

const target = process.argv[2];
const files = target
  ? [path.resolve(target)]
  : fs.readdirSync(DIR).filter(f => /^batch-\d+\.json$/.test(f)).sort()
      .map(f => path.join(DIR, f));

let assigned = 0, missing = 0;
const problems = [];
const lowConfidence = [];
const disputed = [];

for (const file of files) {
  const batch = JSON.parse(fs.readFileSync(file, 'utf8'));
  const label = path.basename(file);
  for (const p of batch.players) {
    if (!Array.isArray(p.positions) || p.positions.length === 0) {
      missing++;
      continue;
    }
    assigned++;
    problems.push(...checkAssignment(p).map(m => `${label}: ${m}`));
    if (!['high', 'medium', 'low'].includes(p.confidence)) {
      problems.push(`${label}: ${p.name}: confidence must be high, medium or low`);
    }
    if (p.confidence === 'low') lowConfidence.push(`${p.name} (${p.positions.join('/')})`);
    if (p.labelDisputed) disputed.push(`${p.name}: FBref says ${p.fbrefPosition}, assigned ${p.positions.join('/')} — ${p.note}`);
  }
}

console.log(`${assigned} assigned, ${missing} still empty, across ${files.length} file(s).`);
if (lowConfidence.length) {
  console.log(`\n${lowConfidence.length} marked low confidence:`);
  console.log('  ' + lowConfidence.slice(0, 20).join(', ') +
    (lowConfidence.length > 20 ? ` … +${lowConfidence.length - 20}` : ''));
}
if (disputed.length) {
  console.log(`\n${disputed.length} player(s) where the FBref label is disputed:`);
  for (const d of disputed) console.log(`  ${d}`);
}
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems.slice(0, 40)) console.error(`  ${p}`);
  process.exit(1);
}
console.log('\nAll assignments are consistent with what FBref recorded.');
