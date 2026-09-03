// Lists the position assignments that need a second look.
//
//   node scripts/list-position-doubts.mjs
//   node scripts/list-position-doubts.mjs --json    # for feeding a review pass
//
// Two kinds of doubt, and they are different:
//
//   - low or medium confidence: the assigner was unsure. Normal, and the reason
//     confidence is recorded at all.
//   - a note suggesting the FBref label itself is wrong: the assigner was sure,
//     and had to write something they believed to be false because the label
//     left no legal alternative. These are the dangerous ones — the assignment
//     looks valid and is not.
//
// The second kind exists because the label constraint was added before the
// escape hatch for disputing a label. Anything found here should be revisited
// and, where the label really is wrong, re-assigned with labelDisputed set.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DIR = path.join(process.cwd(), 'data', 'raw', 'positions');
const asJson = process.argv.includes('--json');

// Phrases people reach for when the label fought them.
const DISPUTE_HINTS = [
  'label', 'forced', 'forces', 'under protest', 'least-wrong', 'least wrong',
  'not a defender', 'never a defender', 'actually a', 'in reality',
  'no legal', 'no midfield', 'wrong', 'artifact', 'stale', 'misleading',
];

const files = fs.existsSync(DIR)
  ? fs.readdirSync(DIR).filter(f => /^batch-\d+\.json$/.test(f)).sort()
  : [];

const disputes = [];
const lowConfidence = [];
let assigned = 0;

for (const file of files) {
  const batch = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
  for (const p of batch.players) {
    if (!Array.isArray(p.positions) || p.positions.length === 0) continue;
    assigned++;

    const note = String(p.note ?? '').toLowerCase();
    const hinted = DISPUTE_HINTS.some(h => note.includes(h));

    if (p.labelDisputed || hinted) {
      disputes.push({
        file, name: p.name, fbrefPosition: p.fbrefPosition,
        positions: p.positions, confidence: p.confidence,
        note: p.note, alreadyDisputed: Boolean(p.labelDisputed),
      });
    } else if (p.confidence === 'low') {
      lowConfidence.push({
        file, name: p.name, fbrefPosition: p.fbrefPosition,
        positions: p.positions, note: p.note,
      });
    }
  }
}

if (asJson) {
  console.log(JSON.stringify({ assigned, disputes, lowConfidence }, null, 2));
  process.exit(0);
}

console.log(`${assigned} assignments across ${files.length} batch(es).\n`);

console.log(`${disputes.length} where the FBref label itself looks wrong:`);
for (const d of disputes) {
  console.log(`  ${d.name.padEnd(24)} ${String(d.fbrefPosition).padEnd(6)} -> ` +
    `${d.positions.join('/').padEnd(14)} ${d.alreadyDisputed ? '[disputed]' : '[NOT disputed]'}`);
  if (d.note) console.log(`      ${d.note}`);
}

console.log(`\n${lowConfidence.length} low confidence, without a label dispute:`);
for (const l of lowConfidence) {
  console.log(`  ${l.name.padEnd(24)} ${String(l.fbrefPosition).padEnd(6)} -> ${l.positions.join('/')}`);
}

const undisputed = disputes.filter(d => !d.alreadyDisputed).length;
if (undisputed > 0) {
  console.log(
    `\n${undisputed} of these were assigned before the labelDisputed escape ` +
    `hatch existed, so they hold a value the assigner believed to be wrong. ` +
    `They need re-doing.`
  );
}
