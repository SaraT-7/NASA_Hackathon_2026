// tools/node-fetch-files.mjs — lets the browser modules in shared/ run under Node for tests and mock data.
// It replaces fetch() with a version that reads files relative to the repo root.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function installFileFetch() {
  globalThis.fetch = async (url) => {
    try {
      const buf = await readFile(path.join(REPO, url));
      return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(buf.toString('utf-8')),
        arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      };
    } catch (err) {
      return { ok: false, status: 404 };
    }
  };
}
