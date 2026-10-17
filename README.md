# HYROX race planner

An interactive 3D model of a HYROX venue, for athletes to plan their race. It answers questions like these:
where do I come in, where do I park, where is the first station, and how exactly do I move through the Roxzone.

- **Bird's eye** — orbit around the hall; clicking a leg frames it.
- **Follow / POV** — ride along behind the athlete or at eye level (drag to look around).
- **Leg by leg** — every run, Roxzone walk, station and the finish, each with distances and directions.
- **Photo spots** — suggested spectator positions; picking one puts the camera there, aimed at the action.
- **City map** — the hall, the gate, transit stops and parking on OpenStreetMap.
- **Three looks** — the clean *3D model*; the *Organizer map* laid on the floor, to check the model against it;
  and *Realistic*: textured floors, black barriers with crowds, grandstand spectators, other athletes on course,
  a steel roof with LED strips and soft shadows. Textures are CC0 ([credits](assets/textures/CREDITS.md); re-fetch with
  `tools/fetch-textures.sh`).
- **Layer toggles** — labels, photo spots, facilities, athlete route, hall walls.
- **Mobile** — full-screen 3D view; everything else lives in the ☰ menu.

Plain HTML + ES modules. three.js and Leaflet load from a CDN. No build step.

## Run

```
node tools/serve.mjs 8080      # then open http://localhost:8080/
```

Any static file server works. Opening `index.html` as a file does not, because the page loads its venue JSON over HTTP.

## Venues

| id | Event | Source |
|---|---|---|
| `budapest-2026` | HYROX Budapest, 17 Oct 2026, HUNGEXPO Hall A | organizer map PDF in `source-data/` + web/OSM research |

To add a venue, follow [docs/venue-format.md](docs/venue-format.md), then validate it:

```
node tools/validate-venue.mjs venues/<id>/venue.json
```

Open a specific venue with `?venue=<id>`.

## Layout

```
index.html, css/app.css   page and styles
js/geometry.js            polyline maths (pure)
js/route.js               venue -> ordered race legs in metres (pure; shared with the validator)
js/stations.js            HYROX station catalogue
js/scene.js               three.js model of the venue
js/viewer.js              renderer, camera modes, runner
js/realistic.js           "Realistic" look: materials, lighting, barriers, crowd, roof
js/citymap.js             Leaflet city map
js/app.js                 UI wiring and playback
venues/                   venue data
tools/                    validator, dev server, texture fetcher
assets/textures/          CC0 textures for the realistic look
```
