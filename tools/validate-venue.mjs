#!/usr/bin/env node
// Usage: node tools/validate-venue.mjs venues/<id>/venue.json
// Builds the full race route from a venue file and prints every segment's length,
// failing (exit 1) if the structure is broken or runs are far from 1 km.
import { readFileSync } from 'node:fs';
import { buildRace, checkRace } from '../js/route.js';

const file = process.argv[2];
if (!file) { console.error('usage: validate-venue.mjs <venue.json>'); process.exit(2); }
const venue = JSON.parse(readFileSync(file, 'utf8'));

const required = ['frame', 'hall', 'runCourse', 'roxzone', 'start', 'stations', 'finish', 'arrival'];
const missing = required.filter(k => !venue[k]);
if (missing.length) { console.error(`missing sections: ${missing.join(', ')}`); process.exit(1); }

const race = buildRace(venue);
console.log(`course loop: ${race.lapLength.toFixed(1)} m`);
for (const s of race.segments) console.log(`${s.kind.padEnd(8)} ${s.title.padEnd(32)} ${s.length.toFixed(1).padStart(7)} m`);
const total = race.segments.filter(s => s.kind !== 'arrival').reduce((a, s) => a + s.length, 0);
console.log(`start → finish: ${(total / 1000).toFixed(2)} km`);

const problems = checkRace(venue, race);
problems.forEach(p => console.error(`PROBLEM: ${p}`));
process.exit(problems.length ? 1 : 0);
