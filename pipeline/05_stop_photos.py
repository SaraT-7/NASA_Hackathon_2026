"""Step 5: photos for the science stops, taken by Curiosity's navigation cameras at those places.

The images were chosen by hand from NASA's public raw-image archive (mars.nasa.gov/msl/multimedia/raw-images)
for the sols when the rover was parked at each stop; the choice is recorded in pipeline/stop_photos.json.
This script downloads them into app_data/photos/. Run step 3 afterwards so stops.json points at them.

    python pipeline/05_stop_photos.py
    python pipeline/03_export_app_data.py
"""
import io
import json
import urllib.request
from pathlib import Path

from PIL import Image

import config as c

photos = json.loads((Path(__file__).parent / "stop_photos.json").read_text(encoding="utf-8"))
out = c.APP / "photos"
out.mkdir(parents=True, exist_ok=True)
for stop_id, p in photos.items():
    req = urllib.request.Request(p["url"], headers={"User-Agent": "marswalk-hackathon"})
    with urllib.request.urlopen(req, timeout=120) as res:
        im = Image.open(io.BytesIO(res.read())).convert("L")
    im.thumbnail((1024, 1024))
    im.save(out / f"{stop_id}.jpg", quality=85, optimize=True)
    print(f"{stop_id}: sol {p['sol']} {p['imageid']} -> photos/{stop_id}.jpg {im.size}")
