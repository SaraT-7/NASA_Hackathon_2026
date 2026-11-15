// plan/terrain3d.js — Pure WebGL 3D terrain viewer for MarsWalk (no external libraries).
// Renders the DEM (grid.elevation) textured with ortho + optional risk/slope overlays,
// plus 3D route polylines and HTML overlay pins for Habitat, Science Stops, and hover cursor.

import { fileUrl } from '../shared/data.js';

const VERT_TERRAIN = `
attribute vec3 aPos;
attribute vec2 aUv;
attribute vec3 aNormal;

uniform mat4 uMvp;
uniform float uZScale;
uniform float uElevBase;

varying vec2 vUv;
varying vec3 vNormal;

void main() {
  vec3 p = vec3(aPos.x, (aPos.y - uElevBase) * uZScale, aPos.z);
  vUv = aUv;
  vNormal = normalize(vec3(aNormal.x * uZScale, aNormal.y, aNormal.z * uZScale));
  gl_Position = uMvp * vec4(p, 1.0);
}
`;

const FRAG_TERRAIN = `
precision mediump float;

varying vec2 vUv;
varying vec3 vNormal;

uniform sampler2D uOrtho;
uniform sampler2D uRisk;
uniform sampler2D uSlope;
uniform float uShowRisk;
uniform float uShowSlope;

void main() {
  vec4 base = texture2D(uOrtho, vUv);
  vec3 col = base.rgb;

  if (uShowRisk > 0.5) {
    vec4 r = texture2D(uRisk, vUv);
    col = mix(col, r.rgb, r.a * 0.68);
  }
  if (uShowSlope > 0.5) {
    vec4 s = texture2D(uSlope, vUv);
    col = mix(col, s.rgb, s.a * 0.68);
  }

  vec3 lightDir = normalize(vec3(-0.45, 0.78, -0.42));
  float diff = max(dot(normalize(vNormal), lightDir), 0.0);
  float lighting = 0.52 + 0.52 * diff;

  gl_FragColor = vec4(col * lighting, 1.0);
}
`;

const VERT_LINE = `
attribute vec3 aPos;
attribute float aDist;

uniform mat4 uMvp;
uniform float uZScale;
uniform float uElevBase;
uniform float uLift;

varying float vDist;

void main() {
  vec3 p = vec3(aPos.x, (aPos.y - uElevBase) * uZScale + uLift, aPos.z);
  vDist = aDist;
  gl_Position = uMvp * vec4(p, 1.0);
}
`;

const FRAG_LINE = `
precision mediump float;

varying float vDist;
uniform vec4 uColor;
uniform float uDashed;

void main() {
  if (uDashed > 0.5) {
    if (mod(vDist, 24.0) > 13.0) discard;
  }
  gl_FragColor = uColor;
}
`;

function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`WebGL shader error: ${info}`);
  }
  return sh;
}

function createProgram(gl, vsSrc, fsSrc) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`WebGL program link error: ${gl.getProgramInfoLog(prog)}`);
  }
  return prog;
}

function parseHexColor(hex, alpha = 1) {
  const c = (hex || '#ffffff').replace('#', '').trim();
  if (c.length === 3) {
    return [
      parseInt(c[0] + c[0], 16) / 255,
      parseInt(c[1] + c[1], 16) / 255,
      parseInt(c[2] + c[2], 16) / 255,
      alpha,
    ];
  }
  return [
    parseInt(c.slice(0, 2), 16) / 255,
    parseInt(c.slice(2, 4), 16) / 255,
    parseInt(c.slice(4, 6), 16) / 255,
    alpha,
  ];
}

function mat4Perspective(fovRad, aspect, near, far) {
  const f = 1 / Math.tan(fovRad / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function mat4LookAt(eye, target, up) {
  let zx = eye[0] - target[0];
  let zy = eye[1] - target[1];
  let zz = eye[2] - target[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  zx /= len; zy /= len; zz /= len;

  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len; xy /= len; xz /= len;

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
    -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
    -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
    1,
  ]);
}

function mat4Mul(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

function projectPoint(mvp, x, y, z, width, height) {
  const cx = mvp[0] * x + mvp[4] * y + mvp[8] * z + mvp[12];
  const cy = mvp[1] * x + mvp[5] * y + mvp[9] * z + mvp[13];
  const cz = mvp[2] * x + mvp[6] * y + mvp[10] * z + mvp[14];
  const cw = mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15];
  if (cw <= 0.1) return null;
  const ndcX = cx / cw;
  const ndcY = cy / cw;
  const ndcZ = cz / cw;
  if (ndcZ < -1 || ndcZ > 1) return null;
  return {
    sx: (ndcX * 0.5 + 0.5) * width,
    sy: (0.5 - ndcY * 0.5) * height,
  };
}

export function createTerrain3D({
  container,
  grid,
  habitat,
  stops,
  routeStyle,
  casingColor,
  onToggleStop,
  onSelectRouteKind,
}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'terrain3d-canvas';
  const markersLayer = document.createElement('div');
  markersLayer.className = 'terrain3d-markers';
  container.append(canvas, markersLayer);

  const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
  if (!gl) {
    throw new Error('WebGL is not supported in this browser.');
  }
  const uintExt = gl.getExtension('OES_element_index_uint');

  const terrainProg = createProgram(gl, VERT_TERRAIN, FRAG_TERRAIN);
  const lineProg = createProgram(gl, VERT_LINE, FRAG_LINE);

  // Sample elevation at local metres (x east, y north)
  function sampleElev(x, y) {
    const col = Math.max(0, Math.min(grid.cols - 1, Math.floor(x / grid.cellSize)));
    const row = Math.max(0, Math.min(grid.rows - 1, Math.floor((grid.heightM - y) / grid.cellSize)));
    const v = grid.elevation[row * grid.cols + col];
    return Number.isFinite(v) ? v : elevBase;
  }

  // Build terrain mesh (250x250 vertices max so 16-bit or 32-bit indices work smoothly at 60fps)
  const step = Math.max(1, Math.ceil(Math.max(grid.cols, grid.rows) / 240));
  const meshCols = Math.floor((grid.cols - 1) / step) + 1;
  const meshRows = Math.floor((grid.rows - 1) / step) + 1;

  let minElev = Infinity;
  let maxElev = -Infinity;
  for (let i = 0; i < grid.elevation.length; i++) {
    const v = grid.elevation[i];
    if (Number.isFinite(v)) {
      if (v < minElev) minElev = v;
      if (v > maxElev) maxElev = v;
    }
  }
  if (!Number.isFinite(minElev)) {
    minElev = 0;
    maxElev = 10;
  }
  const elevBase = 0.5 * (minElev + maxElev);

  const numVerts = meshCols * meshRows;
  const positions = new Float32Array(numVerts * 3);
  const uvs = new Float32Array(numVerts * 2);
  const normals = new Float32Array(numVerts * 3);

  const elevAtGrid = (c, r) => {
    const cc = Math.max(0, Math.min(grid.cols - 1, c));
    const rr = Math.max(0, Math.min(grid.rows - 1, r));
    const v = grid.elevation[rr * grid.cols + cc];
    return Number.isFinite(v) ? v : elevBase;
  };

  let vi = 0;
  for (let mr = 0; mr < meshRows; mr++) {
    const r = Math.min(grid.rows - 1, mr * step);
    const vFrac = r / (grid.rows - 1);
    // World Z: south (+heightM/2) to north (-heightM/2)
    const worldZ = (vFrac - 0.5) * grid.heightM;

    for (let mc = 0; mc < meshCols; mc++) {
      const c = Math.min(grid.cols - 1, mc * step);
      const uFrac = c / (grid.cols - 1);
      const worldX = (uFrac - 0.5) * grid.widthM;
      const elev = elevAtGrid(c, r);

      positions[vi * 3 + 0] = worldX;
      positions[vi * 3 + 1] = elev;
      positions[vi * 3 + 2] = worldZ;

      uvs[vi * 2 + 0] = uFrac;
      uvs[vi * 2 + 1] = vFrac;

      // Central difference normal in local metres
      const dzdx = (elevAtGrid(c + step, r) - elevAtGrid(c - step, r)) / (2 * step * grid.cellSize);
      const dzdy = (elevAtGrid(c, r - step) - elevAtGrid(c, r + step)) / (2 * step * grid.cellSize);
      // Since worldZ = heightM/2 - y, dz/dWorldZ = -dzdy
      let nx = -dzdx;
      let ny = 1.0;
      let nz = dzdy;
      const nLen = Math.hypot(nx, ny, nz) || 1;
      normals[vi * 3 + 0] = nx / nLen;
      normals[vi * 3 + 1] = ny / nLen;
      normals[vi * 3 + 2] = nz / nLen;

      vi++;
    }
  }

  const numTris = (meshCols - 1) * (meshRows - 1) * 2;
  const IndexArray = uintExt && numVerts > 65535 ? Uint32Array : Uint16Array;
  const indexType = IndexArray === Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
  const indices = new IndexArray(numTris * 3);
  let ii = 0;
  for (let mr = 0; mr < meshRows - 1; mr++) {
    for (let mc = 0; mc < meshCols - 1; mc++) {
      const i00 = mr * meshCols + mc;
      const i10 = i00 + 1;
      const i01 = i00 + meshCols;
      const i11 = i01 + 1;
      indices[ii++] = i00;
      indices[ii++] = i01;
      indices[ii++] = i10;
      indices[ii++] = i10;
      indices[ii++] = i01;
      indices[ii++] = i11;
    }
  }

  const posBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

  const uvBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
  gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);

  const normBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
  gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);

  const idxBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  // Create 1x1 fallback texture and load real images
  function loadTexture(url, fallbackRgba = [120, 100, 84, 255]) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(fallbackRgba));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const img = new Image();
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      requestRender();
    };
    img.src = url;
    return tex;
  }

  const orthoTex = loadTexture(fileUrl(grid, 'ortho'), [130, 110, 92, 255]);
  const riskTex = loadTexture(fileUrl(grid, 'risk_img'), [0, 0, 0, 0]);
  const slopeTex = loadTexture(fileUrl(grid, 'slope_img'), [0, 0, 0, 0]);

  // Camera state (turntable orbit + pan + zoom)
  const spanM = Math.max(grid.widthM, grid.heightM);
  const cam = {
    yaw: -0.35,
    pitch: 0.68,
    distance: spanM * 1.12,
    panX: 0,
    panZ: 0,
    zScale: 3.0,
  };

  function resetCamera() {
    cam.yaw = -0.35;
    cam.pitch = 0.68;
    cam.distance = spanM * 1.12;
    cam.panX = 0;
    cam.panZ = 0;
    requestRender();
  }

  let showRisk = true;
  let showSlope = false;
  let selectedIds = [];
  let currentRoutes = { shortest: null, low_risk: null };
  let selectedRouteKind = 'low_risk';
  let hoverPoint = null;
  let isVisible = false;
  let rafId = null;
  let lastMvp = null;

  // Route ribbon buffers (triangle strips in 3D space so lines have real width on all GPUs)
  const routeBuffers = {
    low_risk: null,
    shortest: null,
  };

  function buildRouteStrip(route, halfWidthM) {
    if (!route || !route.points || route.points.length < 2) return null;
    const pts = route.points;
    const count = pts.length;
    const verts = new Float32Array(count * 2 * 3);
    const dists = new Float32Array(count * 2);

    for (let i = 0; i < count; i++) {
      const p = pts[i];
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(count - 1, i + 1)];
      let dx = next.x - prev.x;
      let dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      // Perpendicular in (worldX, worldZ) where worldX = x - widthM/2, worldZ = heightM/2 - y
      const px = dy * halfWidthM;
      const pz = dx * halfWidthM;

      const wx = p.x - grid.widthM * 0.5;
      const wz = grid.heightM * 0.5 - p.y;
      const wy = p.elev != null ? p.elev : sampleElev(p.x, p.y);

      const idx0 = i * 2 * 3;
      verts[idx0 + 0] = wx - px;
      verts[idx0 + 1] = wy;
      verts[idx0 + 2] = wz - pz;

      verts[idx0 + 3] = wx + px;
      verts[idx0 + 4] = wy;
      verts[idx0 + 5] = wz + pz;

      dists[i * 2 + 0] = p.dist;
      dists[i * 2 + 1] = p.dist;
    }

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

    const dbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, dbo);
    gl.bufferData(gl.ARRAY_BUFFER, dists, gl.STATIC_DRAW);

    return { vbo, dbo, vertexCount: count * 2 };
  }

  function rebuildRouteBuffers() {
    for (const kind of ['low_risk', 'shortest']) {
      const old = routeBuffers[kind];
      if (old) {
        gl.deleteBuffer(old.casing.vbo);
        gl.deleteBuffer(old.casing.dbo);
        gl.deleteBuffer(old.core.vbo);
        gl.deleteBuffer(old.core.dbo);
        routeBuffers[kind] = null;
      }
      const r = currentRoutes[kind];
      if (!r) continue;
      const isSel = kind === selectedRouteKind;
      const coreHalf = (isSel ? 5.5 : 3.5) * (grid.cellSize * 0.45);
      const caseHalf = coreHalf + 2.2 * (grid.cellSize * 0.45);
      routeBuffers[kind] = {
        casing: buildRouteStrip(r, caseHalf),
        core: buildRouteStrip(r, coreHalf),
      };
    }
  }

  // Create DOM pins for Habitat, Science Stops, and Hover point
  const habitatPin = document.createElement('div');
  habitatPin.className = 'pin3d pin3d-habitat';
  habitatPin.textContent = 'H';
  habitatPin.title = `${habitat.name}: start and return point`;
  markersLayer.appendChild(habitatPin);

  let stopList = stops.slice();
  const stopPins = new Map();

  function rebuildStopPins() {
    for (const pin of stopPins.values()) pin.remove();
    stopPins.clear();
    for (const s of stopList) {
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'pin3d pin3d-stop';
      pin.title = s.description ? `${s.name}: ${s.description}` : s.name;
      pin.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onToggleStop(s.id);
      });
      markersLayer.appendChild(pin);
      stopPins.set(s.id, pin);
    }
    updateStopPinStyles();
  }

  const hoverPin = document.createElement('div');
  hoverPin.className = 'pin3d pin3d-hover';
  hoverPin.hidden = true;
  markersLayer.appendChild(hoverPin);

  function updateStopPinStyles() {
    for (const s of stopList) {
      const pin = stopPins.get(s.id);
      if (!pin) continue;
      const order = selectedIds.indexOf(s.id);
      const selected = order >= 0;
      pin.classList.toggle('is-selected', selected);
      pin.textContent = selected ? String(order + 1) : '';
    }
  }

  rebuildStopPins();

  function updatePinPositions(mvp, cssW, cssH) {
    const place = (el, x, y, elev, liftM = 8) => {
      const wx = x - grid.widthM * 0.5;
      const wz = grid.heightM * 0.5 - y;
      const wy = (elev - elevBase) * cam.zScale + liftM;
      const pt = projectPoint(mvp, wx, wy, wz, cssW, cssH);
      if (!pt || pt.sx < -40 || pt.sx > cssW + 40 || pt.sy < -40 || pt.sy > cssH + 40) {
        el.style.display = 'none';
      } else {
        el.style.display = '';
        el.style.transform = `translate3d(${pt.sx.toFixed(1)}px, ${pt.sy.toFixed(1)}px, 0) translate(-50%, -50%)`;
      }
    };

    place(habitatPin, habitat.x, habitat.y, sampleElev(habitat.x, habitat.y), 10);
    for (const s of stopList) {
      const pin = stopPins.get(s.id);
      if (pin) place(pin, s.x, s.y, sampleElev(s.x, s.y), 10);
    }
    if (hoverPoint) {
      hoverPin.hidden = false;
      const elev = hoverPoint.elev != null ? hoverPoint.elev : sampleElev(hoverPoint.x, hoverPoint.y);
      place(hoverPin, hoverPoint.x, hoverPoint.y, elev, 9);
    } else {
      hoverPin.hidden = true;
    }
  }

  function render() {
    rafId = null;
    if (!isVisible) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = container.clientWidth || 640;
    const cssH = container.clientHeight || 420;
    const pixelW = Math.max(1, Math.round(cssW * dpr));
    const pixelH = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW;
      canvas.height = pixelH;
    }

    gl.viewport(0, 0, pixelW, pixelH);
    gl.clearColor(0.047, 0.055, 0.059, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    const aspect = cssW / Math.max(1, cssH);
    const proj = mat4Perspective((44 * Math.PI) / 180, aspect, 10, spanM * 6);

    const cosP = Math.cos(cam.pitch);
    const sinP = Math.sin(cam.pitch);
    const sinY = Math.sin(cam.yaw);
    const cosY = Math.cos(cam.yaw);

    const eye = [
      cam.panX + cam.distance * cosP * sinY,
      cam.distance * sinP,
      cam.panZ + cam.distance * cosP * cosY,
    ];
    const target = [cam.panX, 0, cam.panZ];
    const view = mat4LookAt(eye, target, [0, 1, 0]);
    const mvp = mat4Mul(proj, view);
    lastMvp = mvp;

    // Draw terrain mesh
    gl.useProgram(terrainProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(terrainProg, 'uMvp'), false, mvp);
    gl.uniform1f(gl.getUniformLocation(terrainProg, 'uZScale'), cam.zScale);
    gl.uniform1f(gl.getUniformLocation(terrainProg, 'uElevBase'), elevBase);
    gl.uniform1f(gl.getUniformLocation(terrainProg, 'uShowRisk'), showRisk ? 1.0 : 0.0);
    gl.uniform1f(gl.getUniformLocation(terrainProg, 'uShowSlope'), showSlope ? 1.0 : 0.0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, orthoTex);
    gl.uniform1i(gl.getUniformLocation(terrainProg, 'uOrtho'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, riskTex);
    gl.uniform1i(gl.getUniformLocation(terrainProg, 'uRisk'), 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, slopeTex);
    gl.uniform1i(gl.getUniformLocation(terrainProg, 'uSlope'), 2);

    const aPosLoc = gl.getAttribLocation(terrainProg, 'aPos');
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.enableVertexAttribArray(aPosLoc);
    gl.vertexAttribPointer(aPosLoc, 3, gl.FLOAT, false, 0, 0);

    const aUvLoc = gl.getAttribLocation(terrainProg, 'aUv');
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.enableVertexAttribArray(aUvLoc);
    gl.vertexAttribPointer(aUvLoc, 2, gl.FLOAT, false, 0, 0);

    const aNormLoc = gl.getAttribLocation(terrainProg, 'aNormal');
    gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
    gl.enableVertexAttribArray(aNormLoc);
    gl.vertexAttribPointer(aNormLoc, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.drawElements(gl.TRIANGLES, indices.length, indexType, 0);

    // Draw 3D routes on top of terrain
    gl.useProgram(lineProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(lineProg, 'uMvp'), false, mvp);
    gl.uniform1f(gl.getUniformLocation(lineProg, 'uZScale'), cam.zScale);
    gl.uniform1f(gl.getUniformLocation(lineProg, 'uElevBase'), elevBase);

    const aLinePos = gl.getAttribLocation(lineProg, 'aPos');
    const aLineDist = gl.getAttribLocation(lineProg, 'aDist');
    const uColorLoc = gl.getUniformLocation(lineProg, 'uColor');
    const uLiftLoc = gl.getUniformLocation(lineProg, 'uLift');
    const uDashedLoc = gl.getUniformLocation(lineProg, 'uDashed');

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const order = ['low_risk', 'shortest'].filter((k) => k !== selectedRouteKind).concat(selectedRouteKind);
    order.forEach((kind, orderIdx) => {
      const buf = routeBuffers[kind];
      if (!buf || !buf.core || !buf.casing) return;
      const isSel = kind === selectedRouteKind;
      const baseLift = isSel ? 4.5 : 2.8;

      // Casing strip
      gl.uniform1f(uLiftLoc, baseLift);
      gl.uniform1f(uDashedLoc, 0.0);
      gl.uniform4fv(uColorLoc, parseHexColor(casingColor, isSel ? 0.78 : 0.5));
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.casing.vbo);
      gl.enableVertexAttribArray(aLinePos);
      gl.vertexAttribPointer(aLinePos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.casing.dbo);
      gl.enableVertexAttribArray(aLineDist);
      gl.vertexAttribPointer(aLineDist, 1, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, buf.casing.vertexCount);

      // Core strip
      gl.uniform1f(uLiftLoc, baseLift + 0.8 + orderIdx * 0.4);
      gl.uniform1f(uDashedLoc, routeStyle[kind].dash ? 1.0 : 0.0);
      gl.uniform4fv(uColorLoc, parseHexColor(routeStyle[kind].color, isSel ? 1.0 : 0.82));
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.core.vbo);
      gl.enableVertexAttribArray(aLinePos);
      gl.vertexAttribPointer(aLinePos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.core.dbo);
      gl.enableVertexAttribArray(aLineDist);
      gl.vertexAttribPointer(aLineDist, 1, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, buf.core.vertexCount);
    });

    gl.disable(gl.BLEND);
    updatePinPositions(mvp, cssW, cssH);
  }

  function requestRender() {
    if (!isVisible) return;
    if (rafId == null) {
      rafId = requestAnimationFrame(render);
    }
  }

  // Pointer interactions: left-drag to orbit, right-drag / shift+drag to pan, wheel to zoom, click route
  let dragMode = null;
  let startX = 0;
  let startY = 0;
  let moved = 0;

  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

  canvas.addEventListener('pointerdown', (ev) => {
    canvas.setPointerCapture(ev.pointerId);
    startX = ev.clientX;
    startY = ev.clientY;
    moved = 0;
    dragMode = ev.button === 2 || ev.shiftKey ? 'pan' : 'orbit';
  });

  canvas.addEventListener('pointermove', (ev) => {
    if (!dragMode) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    startX = ev.clientX;
    startY = ev.clientY;
    moved += Math.hypot(dx, dy);

    if (dragMode === 'orbit') {
      cam.yaw -= dx * 0.007;
      cam.pitch = Math.max(0.18, Math.min(1.48, cam.pitch + dy * 0.006));
    } else {
      const panScale = cam.distance * 0.0014;
      const cosY = Math.cos(cam.yaw);
      const sinY = Math.sin(cam.yaw);
      cam.panX -= (dx * cosY + dy * sinY) * panScale;
      cam.panZ -= (-dx * sinY + dy * cosY) * panScale;
      const maxPan = spanM * 0.55;
      cam.panX = Math.max(-maxPan, Math.min(maxPan, cam.panX));
      cam.panZ = Math.max(-maxPan, Math.min(maxPan, cam.panZ));
    }
    requestRender();
  });

  const endDrag = (ev) => {
    if (!dragMode) return;
    const wasClick = moved < 5 && ev.button === 0;
    dragMode = null;
    if (wasClick && lastMvp && onSelectRouteKind) {
      // Check if user clicked near one of the 3D route lines in screen space
      const rect = canvas.getBoundingClientRect();
      const clickX = ev.clientX - rect.left;
      const clickY = ev.clientY - rect.top;
      let bestKind = null;
      let bestDistSq = 14 * 14;
      for (const kind of ['low_risk', 'shortest']) {
        const r = currentRoutes[kind];
        if (!r) continue;
        for (let i = 0; i < r.points.length; i += 2) {
          const p = r.points[i];
          const wx = p.x - grid.widthM * 0.5;
          const wz = grid.heightM * 0.5 - p.y;
          const wy = ((p.elev != null ? p.elev : sampleElev(p.x, p.y)) - elevBase) * cam.zScale + 4;
          const sc = projectPoint(lastMvp, wx, wy, wz, rect.width, rect.height);
          if (!sc) continue;
          const d2 = (sc.sx - clickX) ** 2 + (sc.sy - clickY) ** 2;
          if (d2 < bestDistSq) {
            bestDistSq = d2;
            bestKind = kind;
          }
        }
      }
      if (bestKind) onSelectRouteKind(bestKind);
    }
  };

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  canvas.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault();
      const factor = Math.exp(ev.deltaY * 0.0012);
      cam.distance = Math.max(spanM * 0.22, Math.min(spanM * 2.4, cam.distance * factor));
      requestRender();
    },
    { passive: false }
  );

  return {
    setVisible(vis) {
      isVisible = vis;
      container.hidden = !vis;
      if (vis) requestRender();
    },
    setLayers({ risk, slope }) {
      if (risk !== undefined) showRisk = risk;
      if (slope !== undefined) showSlope = slope;
      requestRender();
    },
    setZScale(val) {
      cam.zScale = val;
      requestRender();
    },
    resetCamera,
    setStops(newStops) {
      stopList = newStops.slice();
      rebuildStopPins();
      requestRender();
    },
    setSelectedStops(ids) {
      selectedIds = ids.slice();
      updateStopPinStyles();
      requestRender();
    },
    setRoutes(routes, activeKind) {
      currentRoutes = routes;
      selectedRouteKind = activeKind;
      rebuildRouteBuffers();
      requestRender();
    },
    setHoverPoint(pt) {
      hoverPoint = pt;
      if (isVisible && lastMvp) {
        updatePinPositions(lastMvp, container.clientWidth || 640, container.clientHeight || 420);
      }
    },
    resize() {
      requestRender();
    },
  };
}
