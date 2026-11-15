# MarsWalk

NASA Space Apps Challenge 2026 · *Interplanetary Survival Guide: Martian Map*

MarsWalk plans and guides a walk on Mars for one astronaut, answering three questions at once:
**can I walk here, can I still call for help, and will I make it back in time?**
It covers the boxwork ridges of Mount Sharp in Gale Crater: a 2 × 2 km area that NASA's Curiosity rover has been
exploring since 2025, so every model can be checked against what the rover actually did.

> Existing tools start from the map and adapt it to the astronaut. We started from the astronaut's constraints:
> gloves, fatigue, no GPS, and no real-time link to Earth.

## Three screens

| Screen | Where it is used | What it does |
| --- | --- | --- |
| **Plan** (`plan/`) | In the habitat, on a laptop (1280 × 720) | Pick science stops; get two routes ("Shortest" and "Lowest estimated risk") with times, slopes and risk; switch data layers on and off and watch the route change; elevation profile, 3D terrain, report new obstacles; last measured conditions and data limits. |
| **Walk** (`walk/`) | On the surface, on a wrist display or phone | Next stop and distance left, elapsed time, latest turn-back time, an estimated oxygen gauge, a stop card with Curiosity's photo of that stop. Three large buttons, no typing. Works offline after the first visit. |
| **Helmet camera** (`camera/`, experimental) | Concept for a camera on the ground | A segmentation model, trained on NASA's AI4Mars labels, finds loose sand in rover photos. It runs in the browser. |

## What the route is based on

Slope from NASA elevation data decides where walking is possible at all (20° or steeper is impassable, from NASA's
xEVA suit requirement). Four data layers then raise or lower the estimated risk of each 2 m cell:

| Layer | From | Effect on risk |
| --- | --- | --- |
| Ground the Curiosity rover drove on | MSL traverse (NASA/JPL MMGIS) | −20: proven firm ground |
| No radio line of sight to the habitat | Line of sight computed from the elevation model | +20: you cannot call the habitat |
| Boxwork ridges | Ridge lines detected in HiRISE images (rule based) | +15: a ridge to step over |
| Radiation shelter | Sky blocked by terrain, scaled with a Curiosity RAD measurement | 0: shown as a shelter map for solar storms |

Layer weights, walking speed and the habitat's position are planning assumptions, labelled as such on every screen.

## NASA data

Elevation: USGS MSL Gale Merged DEM 1 m (MRO HiRISE stereo) · Orbital image: USGS/JPL MSL Gale HiRISE colour mosaic ·
Rover track and stops: MSL traverse and waypoints (NASA/JPL MMGIS) · Stop photos: Curiosity Navcam ·
Conditions: MSL RAD (NASA PDS) and REMS · Sand model: AI4Mars (NASA JPL) · Suit and walking assumptions: NASA
EVA-EXP-0075 and NTRS 20210026296.

Every source, what we derived from it, how it was checked and what it cannot see: [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md).

**Checks against independent data:** 135 of Curiosity's 144 real positions in the area fall on cells our model
calls passable; the rover's driven track runs exactly through our three stops; ridges found in the image stand about
20 cm above their surroundings in the elevation model; the sand model finds 90 % of the sand NASA experts marked,
and 95 % of what it calls sand is sand.

## Run it

No build step, no install: plain HTML, CSS and JavaScript modules, no external libraries or fonts.

```bash
python -m http.server 8000
```

Open `http://localhost:8000/`. The pages use JavaScript modules, so they must be served, not opened as files.

Tests and data checks (Node 18+ and Python 3):

```bash
node tools/test_shared.mjs          # shared modules, route search, layer combination
python tools/validate_app_data.py   # app_data/ follows the data contract
```

## Repository layout

```
index.html      landing page
plan/           planning screen
walk/           walk screen (wrist display, offline)
camera/         helmet camera demo: sand model + browser runtime (experimental)
shared/         shared modules: data loading, layer combination, walking model, route object, Leaflet
app_data/       everything the site reads, produced by pipeline/
pipeline/       Python scripts that turn NASA data into app_data/; Colab notebook for the sand model
tools/          validator, tests, demo route generator
docs/           documentation, data sources, team contract and task files
```

How it works, data formats and how to rebuild the data: [`docs/DOCUMENTATION.md`](docs/DOCUMENTATION.md).

## Limits

- Lunar requirements (NASA Artemis) are used for the suit; there is no Mars suit specification.
- The 1 m elevation model smooths features smaller than a few metres; single rocks are not in the model.
- Loose sand is not on the map: orbital colour could not be checked well enough. The helmet camera shows how it could be found from the ground.
- The walker's position is simulated (no GPS on Mars). Radio relays (orbiters, repeaters) are not modelled.

## Team and tools

Samet Arat (data, work stream A) · Kemal Emre Özel (planning screen, B) · Elif Naz Bahçeli (walk screen and presentation, C).

AI use: Claude helped write code and documentation; the sand model is a DeepLabv3 network we trained on AI4Mars.
Map display uses Leaflet; the helmet camera runs the model with onnxruntime-web (both copied into the repository).

Team rules and task split (Turkish): [`docs/CONTRACT.md`](docs/CONTRACT.md), [`docs/tasks/`](docs/tasks/).
