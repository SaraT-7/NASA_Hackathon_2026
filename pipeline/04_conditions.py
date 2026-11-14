"""Step 4: last measured conditions from Curiosity -> app_data/conditions.json.

Weather: the public REMS weather feed (Centro de Astrobiologia / NASA-JPL), newest sol available.
Radiation: MSL RAD reduced data records from the NASA PDS Planetary Plasma Interactions node; the
mean of the "total dose E" values (tissue-equivalent plastic detector) over the newest sols archived.

These are the LAST ARCHIVED measurements, taken at the rover's position. They are not real time.

    python pipeline/04_conditions.py
"""
import csv
import json
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

import config as c

WEATHER_URL = "https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json"
RAD_BASE = "https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0"
RAD_PAGE = "https://pds-ppi.igpp.ucla.edu/collection/MSL-M-RAD-3-RDR-V1.0"
REMS_PDS = "https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/MARS/curiosity/rems.html"
RAD_SOLS = 3  # average the newest N daily files
CACHE = c.RAW / "conditions"


def fetch(url, name, binary=False):
    """Download once into data/raw/conditions/ and return the content."""
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / name
    if not path.exists():
        req = urllib.request.Request(url, headers={"User-Agent": "marswalk-hackathon"})
        with urllib.request.urlopen(req, timeout=120) as res:
            path.write_bytes(res.read())
    return path.read_bytes() if binary else path.read_text(encoding="utf-8", errors="replace")


def weather_items():
    sols = json.loads(fetch(WEATHER_URL, "msl_weather.json"))["soles"]
    newest = max(sols, key=lambda s: int(s["sol"]))
    when = f"Sol {newest['sol']} ({newest['terrestrial_date']})"
    common = {"measured": when, "instrument": "MSL REMS", "source_url": WEATHER_URL}

    def num(key):
        try:
            return float(newest[key])
        except (KeyError, ValueError):
            return None

    spec = [
        ("air_temp_max", "Air temperature, daily max", num("max_temp"), "°C"),
        ("air_temp_min", "Air temperature, daily min", num("min_temp"), "°C"),
        ("ground_temp_max", "Ground temperature, daily max", num("max_gts_temp"), "°C"),
        ("ground_temp_min", "Ground temperature, daily min", num("min_gts_temp"), "°C"),
        ("pressure", "Air pressure, daily mean", num("pressure"), "Pa"),
        ("uv", "UV irradiance index", newest.get("local_uv_irradiance_index"), ""),
        ("sky", "Sky", newest.get("atmo_opacity"), ""),
        ("sunrise", "Sunrise, local time", newest.get("sunrise"), ""),
        ("sunset", "Sunset, local time", newest.get("sunset"), ""),
    ]
    return [dict(id=i, label=lab, value=val, unit=unit, **common)
            for i, lab, val, unit in spec if val not in (None, "", "--")]


def read_range(url, cache_name, offset, length):
    """Read a few bytes of a remote file. The RAD data files are about 70 MB each, so we never download them whole
    (a complete local copy in data/raw/conditions/ is used when present)."""
    local = CACHE / cache_name
    if local.exists():
        with open(local, "rb") as fh:
            fh.seek(offset)
            return fh.read(length)
    req = urllib.request.Request(url, headers={"User-Agent": "marswalk-hackathon",
                                               "Range": f"bytes={offset}-{offset + length - 1}"})
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read()


def rad_item():
    rows = list(csv.reader(fetch(RAD_BASE + "/INDEX/INDEX.TAB", "rad_index.tab").splitlines()))[1:]
    files = sorted(((r[6].strip(), r[1].strip().strip('"').strip()) for r in rows if len(r) >= 7))[-RAD_SOLS:]
    jobs = []
    for start, lbl_path in files:
        name = lbl_path.rsplit("/", 1)[1]
        label = fetch(RAD_BASE + lbl_path, name)
        for m in re.finditer(r"\^OBS\d+_TOT_DOSE_E_ELEMENT\s*=\s*\(\"[^\"]+\",\s*(\d+)\s*<BYTES>\)", label):
            jobs.append((RAD_BASE + lbl_path[:-4] + ".TXT", name[:-4] + ".TXT", int(m.group(1)) - 1, 7))
    with ThreadPoolExecutor(8) as pool:
        raw = list(pool.map(lambda j: read_range(*j), jobs))
    values = []
    for chunk in raw:
        try:
            v = float(chunk)
        except ValueError:
            continue
        if 0 < v < 1000:
            values.append(v)
    if not values:
        raise SystemExit("no RAD dose values parsed")
    last_start, last_name = files[-1][0], files[-1][1].rsplit("/", 1)[1]
    mean_ugy_h = sum(values) / len(values)
    year, doy = int(last_start[:4]), int(last_start[5:8])
    date = (datetime(year, 1, 1) + timedelta(days=doy - 1)).date().isoformat()
    sol = int(last_name.split("_")[-2])
    print(f"RAD: {len(values)} observations over {len(files)} sols, mean {mean_ugy_h:.2f} microGy/h "
          f"(min {min(values):.2f}, max {max(values):.2f})")
    return {
        "id": "radiation",
        "label": "Radiation: absorbed dose rate",
        "value": round(mean_ugy_h * 24 / 1000, 2),
        "unit": "mGy/day",
        "measured": f"Sols {sol - len(files) + 1}-{sol} (to {date})",
        "instrument": "MSL RAD, tissue-equivalent detector (E)",
        "source_url": RAD_PAGE,
        "detail": f"Mean of {len(values)} observations. Absorbed dose, not dose equivalent (mSv).",
    }


def main():
    items = [rad_item(), *weather_items()]
    out = {
        "mock": False,
        "note": "Last archived measurements at the Curiosity rover's position. Not real time.",
        "sources": [
            {"name": "MSL RAD reduced data records, NASA PDS Planetary Plasma Interactions node", "url": RAD_PAGE},
            {"name": "REMS weather report (Centro de Astrobiologia, INTA-CSIC / NASA-JPL), an outreach product; "
                     "the science archive is at the NASA PDS Atmospheres node", "url": REMS_PDS},
        ],
        "items": items,
    }
    (c.APP / "conditions.json").write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    for it in items:
        print(f"  {it['label']}: {it['value']} {it['unit']}  [{it['measured']}]")


if __name__ == "__main__":
    main()
