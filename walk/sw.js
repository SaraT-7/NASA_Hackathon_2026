// walk/ belongs to work stream C. Offline support for the wrist display (docs/tasks/C_WALK.md, "Çekirdekten sonra" 1).
// On Mars there is no internet and no real-time link to Earth, so once the page has been opened one time, everything
// the walk needs is kept on the device: the screen's code, the shared modules, the small map image, the stops and
// Curiosity's photos. The route chosen in the planner is already in localStorage and needs no network.
//
// Strategy: network first, so a fresh version is used whenever the server can be reached; if it cannot (airplane
// mode, no Wi-Fi, server off), the stored copy is used. A service worker only runs on https:// or http://localhost.

const CACHE = 'marswalk-walk-v4';
const NETWORK_WAIT_MS = 3000; // after this, a stored copy is used instead of waiting for a slow network

// The screen's own files and the shared modules it imports.
const SHELL = [
  './',
  'index.html',
  'walk.css',
  'walk.js',
  'state.js',
  'status.js',
  'check.js',
  'oxygen.js',
  'map.js',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  '../shared/data.js',
  '../shared/route.js',
  '../shared/walk-model.js',
  '../shared/vendor/leaflet/leaflet.js',
  '../shared/vendor/leaflet/leaflet.css',
];

// Data files are not listed by name: they are read from grid.json and stops.json, as the screen itself does.
const DATA_BASE = '../app_data/';

const url = (path) => new URL(path, self.location).href;

async function dataFiles() {
  const files = [url(DATA_BASE + 'grid.json'), url(DATA_BASE + 'mock_route.json')];
  const grid = await (await fetch(url(DATA_BASE + 'grid.json'))).json();
  if (grid.files?.ortho_small) files.push(url(DATA_BASE + grid.files.ortho_small));
  if (grid.files?.stops) {
    files.push(url(DATA_BASE + grid.files.stops));
    const { stops = [] } = await (await fetch(url(DATA_BASE + grid.files.stops))).json();
    for (const stop of stops) if (stop.photo?.file) files.push(url(DATA_BASE + stop.photo.file));
  }
  return files;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Each file is stored on its own: one missing file (a photo, the sound) must not stop the rest from being stored.
    const files = await dataFiles().catch(() => []);
    await Promise.allSettled([...SHELL.map(url), ...files].map((file) => cache.add(file)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('marswalk-walk-') && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

async function fromCache(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit || request.mode !== 'navigate') return hit;
  return cache.match(url('index.html'));
}

async function networkFirst(request) {
  // 'no-cache': always ask the server whether a file changed, so an old copy kept by the browser can never be
  // mixed with new files (one old module next to new ones stops the whole page).
  const network = fetch(request, { cache: 'no-cache' }).then(async (response) => {
    if (response.ok && response.type === 'basic') {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  });
  const slow = new Promise((resolve) => setTimeout(resolve, NETWORK_WAIT_MS));
  try {
    const first = await Promise.race([network, slow.then(() => null)]);
    if (first) return first;
    const stored = await fromCache(request);
    return stored || (await network);
  } catch {
    const stored = await fromCache(request);
    if (stored) return stored;
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(request));
});
