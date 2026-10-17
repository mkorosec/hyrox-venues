// Turns a venue description into the athlete's full route: an ordered list of segments
// (arrival, start, 8 x [run, roxzone in, station, roxzone out], finish), all in metres.
// Pure module: used by the browser app and by tools/validate-venue.mjs.
import * as G from './geometry.js';
import { STATIONS, STATION_ORDER } from './stations.js';

/** Converts venue frame units (organizer map pixels, y down) into metres (y up). */
export function frameToMeters(venue) {
  const [ox, oy] = venue.frame.origin;
  const k = venue.frame.metersPerUnit;
  return p => [(p[0] - ox) * k, (oy - p[1]) * k];
}

const round = m => Math.round(m);
const side = t => (t > 0 ? 'left' : 'right');

export function buildRace(venue) {
  const M = frameToMeters(venue);
  const k = venue.frame.metersPerUnit;
  const rc = venue.runCourse;
  const loop = G.fillet(rc.centerline.map(c => [...M(c), (c[2] || 0) * k]), true);
  const L = G.length(loop);
  const corridor = venue.roxzone.corridor.map(M);
  const inGate = M(venue.roxzone.in), outGate = M(venue.roxzone.out);
  const sIn = G.project(loop, inGate).s, sOut = G.project(loop, outGate).s;
  // HYROX rule: you enter the Roxzone on the N-th time you pass the IN arch.
  const sightings = rc.enterOnInSighting;
  const ordinal = ['', '1st', '2nd', '3rd', '4th', '5th'][sightings] || `${sightings}th`;
  const segments = [];

  const corridorWalk = (from, to) =>
    G.slice(corridor, G.project(corridor, from).s, G.project(corridor, to).s);

  const runSegment = (n, s0, intro) => {
    const toFirstSighting = G.mod(sIn - s0, L) || L;
    const d = (sightings - 1) * L + toFirstSighting;
    return {
      kind: 'run', key: `run${n}`, group: n, title: `Run ${n}`,
      points: G.loopWalk(loop, s0, d), lapLength: L, toFirstSighting,
      text: `${intro} the ${round(L)} m course loop, ${round(d)} m in total. ` +
        `Run past the yellow IN arch ${sightings - 1}×; on the ${ordinal} time you see it, go in.`,
    };
  };

  // Arrival: entrance -> registration -> ... -> start area.
  const arrival = venue.arrival.map(w => ({ ...w, at: M(w.at) }));
  segments.push({
    kind: 'arrival', key: 'arrival', group: 0, title: 'Arrival',
    points: arrival.map(w => w.at), waypoints: arrival,
    text: arrival.filter(w => w.name).map((w, i) => `${i + 1}. ${w.name}${w.note ? ` – ${w.note}` : ''}`).join('\n'),
  });

  const startPts = venue.start.path.map(M);
  segments.push({
    kind: 'start', key: 'start', group: 0, title: 'Start',
    points: startPts, text: venue.start.note,
  });

  let s0 = G.project(loop, startPts[startPts.length - 1]).s;
  const stations = [...venue.stations].sort((a, b) => a.n - b.n);
  stations.forEach((st, i) => {
    const n = i + 1;
    const info = STATIONS[st.type];
    const label = `${String(n).padStart(2, '0')} ${info.name}`;
    const entry = M(st.entry), exit = M(st.exit);
    const work = (st.work || []).map(M);

    segments.push(runSegment(n, s0, n === 1 ? 'Out of the start tunnel onto' : 'Out of OUT onto'));

    // Roxzone in: course -> IN gate -> corridor -> station entry.
    const onCourse = G.pointAt(loop, sIn).p;
    const walkIn = corridorWalk(inGate, entry);
    const inPts = [onCourse, inGate, ...walkIn, entry];
    const headIn = G.pointAt([onCourse, inGate], 0).dir;
    const corridorDirIn = G.pointAt(walkIn, 0).dir;
    segments.push({
      kind: 'roxzone', key: `rox-in${n}`, group: n, title: `Roxzone → ${label}`, points: inPts,
      text: `Through IN, turn ${side(G.turn(headIn, corridorDirIn))} along the Roxzone corridor ` +
        `for about ${round(G.length(walkIn))} m, then take the ↓ entry into ${label}.`,
    });

    const stPts = [entry, ...work, exit];
    segments.push({
      kind: 'station', key: `station${n}`, group: n, title: label, station: st, info,
      points: stPts, hold: work.length <= 1 ? 3 : 0,
      text: `${info.spec}${info.weight ? ` · ${info.weight}` : ''}. ${info.detail}${st.note ? ` ${st.note}` : ''}`,
    });

    if (n < stations.length) {
      // Roxzone out: station exit -> corridor -> OUT gate -> course.
      const walkOut = corridorWalk(exit, outGate);
      const outPts = [exit, ...walkOut, outGate, G.pointAt(loop, sOut).p];
      const headOut = G.pointAt([work[work.length - 1] || entry, exit], 0).dir;
      segments.push({
        kind: 'roxzone', key: `rox-out${n}`, group: n, title: `${label} → Roxzone OUT`, points: outPts,
        text: `Leave through the ↑ exit, turn ${side(G.turn(headOut, G.pointAt(walkOut, 0).dir))} ` +
          `and walk/jog about ${round(G.length(walkOut))} m to the yellow OUT gate.`,
      });
      s0 = sOut;
    } else {
      segments.push({
        kind: 'finish', key: 'finish', group: n, title: 'Finish',
        points: [exit, ...venue.finish.path.map(M)], text: venue.finish.note,
      });
    }
  });

  for (const s of segments) s.length = G.length(s.points);
  return { segments, loop, lapLength: L, corridor, M, k };
}

/** Sanity checks used by the validator and shown in the app's console. */
export function checkRace(venue, race) {
  const problems = [];
  const types = [...venue.stations].sort((a, b) => a.n - b.n).map(s => s.type);
  if (types.join() !== STATION_ORDER.join()) problems.push(`station order is ${types.join(', ')}`);
  for (const s of race.segments.filter(s => s.kind === 'run')) {
    if (Math.abs(s.length - 1000) > 120) problems.push(`${s.title} measures ${round(s.length)} m (expected ~1000 m)`);
  }
  return problems;
}
