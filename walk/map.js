// walk/map.js — the small map on the walk screen, for work stream C.
// Leaflet comes from shared/vendor (the global L), with the same L.CRS.Simple set-up as the planner:
// local metres, latlng = [y, x]. The map only shows; it never takes input (gloves: no pinch, no drag).
//
// Heading-up view, like a car navigation screen: the map turns so the walking direction points up and is
// tilted so the path ahead runs towards the top of the screen. The heading is taken from the route, because
// the position is simulated. (A real wrist display could not use a magnetic compass: Mars has no global
// magnetic field.)

import { fileUrl, mapBounds, xyToLatLng } from '../shared/data.js';

/** About this many metres of terrain fit across the map at the astronaut's position. */
const VIEW_WIDTH_M = 300;
/** Heading is the direction to the route point this far ahead (behind, on the way back). */
const LOOK_AHEAD_M = 20;
/** Tilt of the map plane, in degrees, and the viewing distance for the perspective, in pixels. */
const TILT_DEG = 50;
const PERSPECTIVE_PX = 520;
/** The astronaut sits this far down the map area (0 = top, 1 = bottom), so more of the path ahead shows. */
const ANCHOR_Y = 0.74;
/** The map layer is this many times wider than the map area, so turned and tilted it still fills it. */
const LAYER_SCALE = 3.2;
/** How fast the view turns towards a new heading (fraction per frame), so grid steps do not jitter it. */
const TURN_SMOOTHING = 0.12;

/**
 * grid.json only. The map needs the area size and the image file name, not the risk, slope and
 * elevation rasters that loadGrid() also downloads (several megabytes on a phone).
 */
export async function loadGridMeta(base) {
  const res = await fetch(base + 'grid.json');
  if (!res.ok) throw new Error(`Could not load grid.json (${res.status})`);
  const meta = await res.json();
  return {
    meta,
    base,
    cols: meta.cols,
    rows: meta.rows,
    cellSize: meta.cell_size_m,
    widthM: meta.width_m,
    heightM: meta.height_m,
  };
}

function pin(className, text) {
  return L.divIcon({ className, html: `<span>${text}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] });
}

/** Heading in degrees clockwise from north, from one local-metre point to another. */
function bearing(from, to) {
  return (Math.atan2(to.x - from.x, to.y - from.y) * 180) / Math.PI;
}

/** Smallest signed difference between two angles, in degrees (-180..180]. */
function angleDiff(a, b) {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/**
 * Draw the orbital image, the route, the habitat, the numbered stops and the simulated position.
 * @param {HTMLElement} stage  the map area; the map layer is created inside it
 * @returns {{ update(s: object): void, resize(): void }}
 */
export function createWalkMap(stage, grid, route) {
  const layer = document.createElement('div');
  layer.className = 'map-layer';
  stage.prepend(layer);

  const arrow = document.createElement('div');
  arrow.className = 'map-me';
  arrow.setAttribute('aria-hidden', 'true');
  stage.append(arrow);

  const north = document.createElement('div');
  north.className = 'map-north';
  north.innerHTML = '<i class="map-needle"><b>N</b></i>';
  const needle = north.firstElementChild;
  const needleLabel = needle.firstElementChild;
  north.setAttribute('aria-hidden', 'true');
  stage.append(north);

  const map = L.map(layer, {
    crs: L.CRS.Simple,
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    touchZoom: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    zoomSnap: 0,
    minZoom: -8,
    maxZoom: 6,
    fadeAnimation: false,
  });
  L.imageOverlay(fileUrl(grid, 'ortho_small'), mapBounds(grid)).addTo(map);

  // The path the heading follows: the route, or on the way home a shorter direct path (snapshot.returnPoints).
  const routePoints = route.points;
  let points = routePoints;
  let last = points.length - 1;
  const line = points.map((p) => xyToLatLng(p.x, p.y));
  const routeShadow = L.polyline(line, { color: '#000', weight: 9, opacity: 0.5, interactive: false }).addTo(map);
  const routeLine = L.polyline(line, { color: '#ffd9b0', weight: 5, interactive: false }).addTo(map);
  let directLines = [];

  /** Draw the direct path home over the route (route dimmed), or remove it again (null). */
  function showDirect(pts) {
    for (const l of directLines) l.remove();
    directLines = [];
    routeShadow.setStyle({ opacity: pts ? 0.25 : 0.5 });
    routeLine.setStyle({ opacity: pts ? 0.35 : 1 });
    if (!pts) return;
    const ll = pts.map((p) => xyToLatLng(p.x, p.y));
    directLines = [
      L.polyline(ll, { color: '#000', weight: 9, opacity: 0.5, interactive: false }).addTo(map),
      L.polyline(ll, { color: '#4da3ff', weight: 5, interactive: false }).addTo(map),
    ];
  }

  const pins = [];
  const home = points[0];
  pins.push(L.marker(xyToLatLng(home.x, home.y), { icon: pin('map-pin map-habitat', 'H'), interactive: false, keyboard: false }).addTo(map));
  const stopMarkers = new Map();
  (route.stops || []).forEach((stop, i) => {
    const marker = L.marker(xyToLatLng(stop.x, stop.y), { icon: pin('map-pin map-stop', String(i + 1)), interactive: false, keyboard: false }).addTo(map);
    stopMarkers.set(stop.id, marker);
    pins.push(marker);
  });

  /** Direction of travel at a route point: towards the point LOOK_AHEAD_M further along (or back). */
  function headingAt(index, x, y, step) {
    const here = { x, y };
    let i = Math.min(last, Math.max(0, index));
    while (i + step >= 0 && i + step <= last && Math.hypot(points[i].x - x, points[i].y - y) < LOOK_AHEAD_M) i += step;
    if (Math.hypot(points[i].x - x, points[i].y - y) < 0.5) return null; // at the very end of the path
    return bearing(here, points[i]);
  }

  let heading = headingAt(0, home.x, home.y, 1) ?? 0;
  let target = heading;
  let nextId;

  function layout() {
    const w = stage.clientWidth || 360;
    const h = stage.clientHeight || 200;
    const size = Math.round(w * LAYER_SCALE);
    layer.style.width = `${size}px`;
    layer.style.height = `${size}px`;
    layer.style.left = `${Math.round(w / 2 - size / 2)}px`;
    layer.style.top = `${Math.round(h * ANCHOR_Y - size / 2)}px`;
    arrow.style.left = `${Math.round(w / 2)}px`;
    arrow.style.top = `${Math.round(h * ANCHOR_Y)}px`;
    map.invalidateSize({ animate: false });
    return Math.log2(w / VIEW_WIDTH_M);
  }
  let zoom = layout();

  function applyTurn() {
    layer.style.transform = `perspective(${PERSPECTIVE_PX}px) rotateX(${TILT_DEG}deg) rotate(${-heading}deg)`;
    // Keep the H and stop numbers upright on screen while the map turns under them.
    for (const m of pins) {
      const node = m.getElement();
      const label = node && node.firstElementChild;
      if (label) label.style.transform = `rotate(${heading}deg)`;
    }
    needle.style.transform = `rotate(${-heading}deg)`; // the red half points to north
    needleLabel.style.transform = `translateX(-50%) rotate(${heading}deg)`; // the N at its tip stays upright
  }

  return {
    /** @param {object} s  a walk snapshot: x, y, pointIndex, phase, nextStop */
    update(s) {
      const want = s.returnPoints || routePoints;
      if (want !== points) {
        points = want;
        last = points.length - 1;
        showDirect(s.returnPoints || null);
      }
      map.setView(xyToLatLng(s.x, s.y), zoom, { animate: false });
      const back = s.phase === 'returning' || s.phase === 'done';
      const index = s.returnPoints ? s.returnPointIndex : s.pointIndex;
      if (s.phase !== 'done' && s.phase !== 'at_stop') {
        const h = headingAt(back ? index : Math.max(0, index - 1), s.x, s.y, back ? -1 : 1);
        if (h != null) target = h;
      }
      heading += angleDiff(target, heading) * TURN_SMOOTHING;
      applyTurn();
      const id = s.nextStop ? s.nextStop.id : null;
      if (id !== nextId) {
        for (const [stopId, marker] of stopMarkers) {
          const node = marker.getElement();
          if (node) node.classList.toggle('is-next', stopId === id);
        }
        nextId = id;
      }
    },
    resize() {
      zoom = layout();
    },
  };
}
