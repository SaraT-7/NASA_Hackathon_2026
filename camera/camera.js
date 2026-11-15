// camera/camera.js — work stream A. Helmet camera demo: finds loose sand in a rover photo, in the browser.
// The model (model/sand_ai4mars.onnx, see model/README.md) is a DeepLabv3 + MobileNetV3 network trained on NASA's
// AI4Mars labels. Input: one greyscale image, 512 x 512, values 0..1. Output "classes": one id per pixel
// (0 soil, 1 bedrock, 2 sand, 3 big rock). This page only uses "sand".
// onnxruntime-web runs it with WebAssembly on one thread, so no special server headers are needed.

import * as ort from './vendor/onnxruntime-web/ort.wasm.min.js';

const SIZE = 512; // model input size
const SAND = 2;
const MODEL_URL = 'model/sand_ai4mars.onnx';
const SAND_RGBA = [255, 210, 0, 160];
const EXPERT_RGBA = [60, 200, 255, 160];

const vendor = new URL('./vendor/onnxruntime-web/', import.meta.url).href;
ort.env.wasm.numThreads = 1;
// The two runtime files are renamed from .mjs to .js so any static server sends them as JavaScript.
ort.env.wasm.wasmPaths = { mjs: vendor + 'ort-wasm-simd-threaded.js', wasm: vendor + 'ort-wasm-simd-threaded.wasm' };

const $ = (id) => document.getElementById(id);
const photo = $('photo');
const overlay = $('overlay');
const state = { session: null, busy: false, current: null, mode: 'model', nearOnly: true };

function setStatus(text, isError = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', isError);
}

const pct = (part, whole) => (whole ? `${((part / whole) * 100).toFixed(1)} %` : '—');

/** Download the model with a progress message, then open it. */
async function loadModel() {
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`Could not load the model (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    setStatus(`Loading the model… ${(got / 1e6).toFixed(0)}${total ? ` / ${(total / 1e6).toFixed(0)}` : ''} MB`);
  }
  const bytes = new Uint8Array(got);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  setStatus('Starting the model…');
  return ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
}

/** Greyscale 0..1 at SIZE x SIZE. Colour photos are turned to grey like the Navcam images the model learned from. */
function toInput(img) {
  const c = new OffscreenCanvas(SIZE, SIZE);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, SIZE, SIZE);
  const px = g.getImageData(0, 0, SIZE, SIZE).data;
  const x = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < x.length; i++) {
    x[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
  }
  return new ort.Tensor('float32', x, [1, 1, SIZE, SIZE]);
}

async function readMask(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = new OffscreenCanvas(SIZE, SIZE);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, SIZE, SIZE);
  const px = g.getImageData(0, 0, SIZE, SIZE).data;
  const m = new Uint8Array(SIZE * SIZE); // 2 sand, 1 labelled not sand, 0 not labelled
  for (let i = 0; i < m.length; i++) m[i] = px[i * 4] > 200 ? 2 : px[i * 4] > 64 ? 1 : 0;
  return m;
}

/** Paint a SIZE x SIZE mask (cells equal to `value`) onto the overlay, scaled to the photo. */
function paint(mask, value, rgba, nearOnly) {
  const c = new OffscreenCanvas(SIZE, SIZE);
  const g = c.getContext('2d');
  const img = g.createImageData(SIZE, SIZE);
  const start = nearOnly ? SIZE / 2 : 0;
  for (let r = start; r < SIZE; r++) {
    for (let col = 0; col < SIZE; col++) {
      const i = r * SIZE + col;
      if (mask[i] === value) img.data.set(rgba, i * 4);
    }
  }
  g.putImageData(img, 0, 0);
  const o = overlay.getContext('2d');
  o.imageSmoothingEnabled = true;
  o.drawImage(c, 0, 0, overlay.width, overlay.height);
}

function render() {
  const cur = state.current;
  const o = overlay.getContext('2d');
  o.clearRect(0, 0, overlay.width, overlay.height);
  if (!cur || !cur.classes) return;
  if (state.mode === 'model') paint(cur.classes, SAND, SAND_RGBA, state.nearOnly);
  if (state.mode === 'expert' && cur.expert) paint(cur.expert, 2, EXPERT_RGBA, false);
  placeNearLine();
}

function placeNearLine() {
  const line = $('near-line');
  const show = Boolean(state.current) && state.nearOnly && state.mode === 'model';
  line.hidden = !show;
  if (!show) return;
  const s = $('stage').getBoundingClientRect();
  const p = photo.getBoundingClientRect();
  line.style.left = `${p.left - s.left}px`;
  line.style.width = `${p.width}px`;
  line.style.top = `${p.top - s.top + p.height / 2}px`;
}

function showStats(cur) {
  const half = (SIZE * SIZE) / 2;
  let near = 0;
  let all = 0;
  for (let i = 0; i < cur.classes.length; i++) {
    if (cur.classes[i] !== SAND) continue;
    all++;
    if (i >= half) near++;
  }
  $('sand-near').textContent = pct(near, half);
  $('sand-all').textContent = pct(all, cur.classes.length);
  $('time').textContent = `${Math.round(cur.ms)} ms`;
  const hasExpert = Boolean(cur.expert);
  $('expert-row').hidden = !hasExpert;
  $('expert-row2').hidden = !hasExpert;
  if (hasExpert) {
    // Same measure as the test set: only pixels the experts labelled.
    let tp = 0;
    let expertSand = 0;
    let modelSand = 0;
    for (let i = 0; i < cur.classes.length; i++) {
      if (cur.expert[i] === 0) continue;
      const m = cur.classes[i] === SAND;
      const e = cur.expert[i] === 2;
      if (e) expertSand++;
      if (m) modelSand++;
      if (m && e) tp++;
    }
    $('sand-recall').textContent = pct(tp, expertSand);
    $('sand-precision').textContent = pct(tp, modelSand);
  }
}

async function analyse(sample, button) {
  if (state.busy || !state.session) return;
  state.busy = true;
  document.querySelectorAll('.thumb').forEach((b) => {
    b.disabled = true;
    b.classList.toggle('on', b === button);
  });
  $('busy').hidden = false;
  $('title').textContent = sample.title;
  $('subtitle').textContent = sample.subtitle || '';
  try {
    const img = sample.bitmap || (await loadImage(sample.url));
    photo.width = overlay.width = img.width;
    photo.height = overlay.height = img.height;
    photo.getContext('2d').drawImage(img, 0, 0);
    overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height);
    setStatus('Looking for sand…');
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); // let the photo appear first
    const t0 = performance.now();
    const out = await state.session.run({ image: toInput(img) });
    const ms = performance.now() - t0;
    const cur = { classes: out.classes.data, ms, expert: sample.expert ? await readMask(sample.expert) : null };
    state.current = cur;
    const expertBtn = document.querySelector('[data-mode="expert"]');
    expertBtn.disabled = !cur.expert;
    if (!cur.expert && state.mode === 'expert') setMode('model');
    showStats(cur);
    render();
    setStatus('Done. Pick another photo, or switch the view above the photo.');
  } catch (err) {
    console.error(err);
    setStatus(`Could not analyse this photo: ${err.message}`, true);
  } finally {
    $('busy').hidden = true;
    state.busy = false;
    document.querySelectorAll('.thumb').forEach((b) => (b.disabled = false));
  }
}

async function loadImage(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

function thumb(listId, sample) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'thumb';
  b.title = sample.title;
  b.disabled = true;
  const img = document.createElement('img');
  img.src = sample.url;
  img.alt = sample.title;
  img.loading = 'lazy';
  const label = document.createElement('span');
  label.textContent = sample.short;
  b.append(img, label);
  b.addEventListener('click', () => analyse(sample, b));
  $(listId).appendChild(b);
  return b;
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('#mode button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
  render();
}

async function main() {
  // Science stops: names and photos come from app_data (file names from grid.json, not hard-coded).
  const grid = await (await fetch('../app_data/grid.json')).json();
  const stops = (await (await fetch(`../app_data/${grid.files.stops}`)).json()).stops;
  const stopSamples = stops
    .filter((s) => s.photo && s.photo.file)
    .map((s) => ({
      url: `../app_data/${s.photo.file}`,
      title: s.name,
      short: s.name.replace(/ site$/, ''),
      subtitle: `Curiosity ${s.photo.instrument || 'Navcam'}, sol ${s.photo.sol}. ${s.photo.credit || 'NASA/JPL-Caltech'}.`,
    }));
  const tests = await (await fetch('samples/test_samples.json')).json();
  const testSamples = tests.map((t, i) => ({
    url: t.file,
    expert: t.expert,
    title: t.title,
    short: `Test ${i + 1}`,
    subtitle: `Curiosity Navcam ${t.source}. ${t.credit}.`,
  }));
  const buttons = [...stopSamples.map((s) => thumb('stop-list', s)), ...testSamples.map((s) => thumb('test-list', s))];

  $('upload').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const bitmap = await createImageBitmap(file);
    await analyse({ bitmap, title: 'Your photo', subtitle: file.name }, null);
    e.target.value = '';
  });
  document.querySelectorAll('#mode button').forEach((b) => b.addEventListener('click', () => !b.disabled && setMode(b.dataset.mode)));
  $('near-only').addEventListener('change', (e) => {
    state.nearOnly = e.target.checked;
    render();
  });
  window.addEventListener('resize', placeNearLine);

  try {
    state.session = await loadModel();
  } catch (err) {
    console.error(err);
    setStatus(`The model could not start: ${err.message}`, true);
    return;
  }
  setStatus('Ready.');
  buttons.forEach((b) => (b.disabled = false));
  if (buttons[0]) analyse(stopSamples[0], buttons[0]);
}

main();
