# Venue format and how to build a venue

A venue is one folder: `venues/<id>/venue.json` plus the organizer map rendered as `map.png`.
List it in `venues/index.json`. The app turns it into the full athlete route (`js/route.js`) and the 3D model (`js/scene.js`).

## Building a venue (the LLM pipeline)

The pipeline is meant to be run by an LLM agent, with a person checking the result at the end.

1. **Render the organizer map.** Convert the PDF to a PNG whose width defines the frame units:
   `pdftoppm -png -singlefile -scale-to-x 2396 -scale-to-y -1 map.pdf venues/<id>/map`
   Trace at half that resolution (1198 units wide). Crop and zoom as needed to read small labels.
2. **Trace the geometry in map pixels.** Write every coordinate in `venue.json` in map pixels (x right, y down).
   Never convert to metres by hand; `frame.metersPerUnit` does it. Trace:
   the run course centreline, the IN/OUT arches, the Roxzone corridor, each station's area, its ↓ entry and ↑ exit,
   the path the athlete takes while working (`work`), the finish, the zones, and the points of interest.
3. **Calibrate the scale.** Most organizer maps have no scale bar, so use the race rules.
   Find "enter the Roxzone on the N-th sighting of the IN arch" on the event page or in the athlete guide.
   Pick `metersPerUnit` so a run measures about 1000 m, then cross-check it against the real hall size
   from OpenStreetMap (the building outline) or the venue's own website. Write the reasoning in `frame.calibration`.
4. **Research the venue online.** Use the HYROX event page (schedule, check-in, Roxzone rule), the venue website
   (address, parking, transport) and OSM (hall outline, gates, stops, car parks; Nominatim or Overpass).
   Put each fact in `city`, and cite the source in `sources`. Never invent a fact.
   When something is unconfirmed, say so in the text (e.g. "NOT confirmed for HYROX").
5. **Geo-reference the map.** Pick one map point you can find in OSM (usually a hall corner) as `geo.anchor`.
   Set `geo.bearingDeg` to the compass bearing of "map up" (0 = map up is north).
6. **Validate.** Run `node tools/validate-venue.mjs venues/<id>/venue.json`. It prints every leg's length
   and fails if the station order is wrong or a run is far from 1 km.
7. **Check by eye.** Open the app, tick **Organizer map** and check that the 3D geometry sits exactly on the drawing.

## Fields

| Field | Meaning |
|---|---|
| `frame.origin` | Map pixel that becomes (0, 0) m, normally the hall's bottom-left corner |
| `frame.metersPerUnit` | Scale: metres per map pixel |
| `overlay.extent` | `[x0, y0, x1, y1]` in map pixels covered by `map.png` |
| `geo.anchor` | `{ frame: [x, y], lat, lng }`: ties one map point to the world |
| `hall.outline` | Hall polygon. `hall.door` is where athletes enter the hall |
| `runCourse.centerline` | Polygon corners `[x, y, cornerRadius]` **in running direction** |
| `runCourse.width` | Course width (map px) |
| `runCourse.enterOnInSighting` | The N-th time past the IN arch is when you go in (HYROX rule) |
| `roxzone.in` / `roxzone.out` | Points on the inner edge of the course where the IN / OUT arches are |
| `roxzone.corridor` | Polyline that athletes walk along between the gates and the station mouths |
| `start.path` | Start corral → course; the last point is projected onto the course |
| `stations[]` | `n`, `type` (see `js/stations.js`), `area` rect, `entry`, `exit`, `work` path, optional `note` |
| `finish.path` | From the last station's exit across the line; `finish.line` is the painted line (optional) |
| `arrival[]` | Waypoints from the venue gate to the start; points without `name` only shape the path |
| `zones[]` | `kind` + `rect` or `poly`. Kinds: warmup, relay, bagdrop, tunnel, finish, grandstand (`facing`), recovery, stage, sponsor, store, crossing, building, registration, checkin, lane |
| `pois[]` | `kind` (water, energy, medic, wc, food, changing, help) + `at` |
| `photoSpots[]` | Spectator photo positions: `name`, `at`, `look` (what you aim at), optional `height` (eye height in m; use ~4.8 on a grandstand), `bestFor`, `tip`. Place them only in spectator zones or on grandstands, never on a crossing point. `photoSpotsNote` says where the spots come from |
| `city` | `hallOutline` (lat/lng), `places[]` (gate, bus, tram, metro, parking), `transport[]`, `parking[]`, `unknowns` |

A station's movement goes `entry → work… → exit`. A stationary station (SkiErg, Rowing, Wall Balls) has one `work` point,
and the playback pauses there. Lane and equipment placement inside a station is illustrative; only the area,
entry and exit come from the map.

## Future: photos from the ground

Planned shape (not used by the app yet): `photos[]` with `{ at: [x, y], heading, url, caption, author, date }`,
shown as pins in the 3D view that open the photo at that spot.
