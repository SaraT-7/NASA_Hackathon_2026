# MarsWalk

NASA Space Apps Challenge 2026 · *Interplanetary Survival Guide: Martian Map*

A Marswalk planner and walk guide for the boxwork ridges of Mount Sharp, Gale Crater. One static web site, two screens:

- **Plan** (`plan/`): in the habitat, on a large screen. Map layers, science stops, two alternative routes.
- **Walk** (`walk/`): on the surface, on a phone. Next stop, distance left, latest turn-back time.

> Status: the terrain currently in `app_data/` is demo data, not Mars data. Real data replaces it during the event.

## Run it

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/`.

## Repository layout

```
index.html      landing page
plan/           planning screen (work stream B)
walk/           walk screen (work stream C)
shared/         shared modules: data loading, walking model, route object, Leaflet
app_data/       data the site reads (produced by pipeline/)
pipeline/       Python scripts that turn NASA data into app_data/ (work stream A)
tools/          mock data generator, validator, tests
docs/           team contract and task files (Turkish)
```

## For the team

Ekip içi kurallar ve iş bölümü: [`docs/CONTRACT.md`](docs/CONTRACT.md) ve [`docs/tasks/`](docs/tasks/).
