/*
  Copy-and-register asset test:
  - Copies a file from repo root (e.g., ./assets/image.png) into IMAGE_STORAGE_DIR
  - Registers it in the assets table via /assets/register-local
  - Fetches the asset stream and saves to /tmp

  Usage examples:
    API_BASE=http://localhost:9000 node apps/api/testing/test-assets-copy.js
    API_BASE=http://localhost:9000 SRC_PATH=assets/image.png DEST_REL=test/my-copy.png OUT=/tmp/my_copy.png node apps/api/testing/test-assets-copy.js
*/
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { getApiUrl } from './test-env.js';

const API_BASE = getApiUrl();
const SRC_PATH = process.env.SRC_PATH || path.join('assets', 'image.png'); // repo-root path
const IMAGE_STORAGE_DIR = process.env.IMAGE_STORAGE_DIR || path.join('storage', 'images');
const DEST_REL = process.env.DEST_REL || path.join('test', `copy-${Date.now()}.png`); // relative to IMAGE_STORAGE_DIR
const OUT = process.env.OUT || '/tmp/asset_copy.png';

async function main() {
  try {
    const repoRoot = process.cwd();
    const srcAbs = path.isAbsolute(SRC_PATH) ? SRC_PATH : path.join(repoRoot, SRC_PATH);
    const destAbs = path.join(repoRoot, IMAGE_STORAGE_DIR, DEST_REL);
    const destDir = path.dirname(destAbs);

    console.log(`Copying from ${srcAbs} → ${destAbs}`);
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(srcAbs, destAbs);

    const mime = inferMime(DEST_REL);
    console.log(`Registering ${DEST_REL} (mime=${mime})`);
    const reg = await axios.post(`${API_BASE}/assets/register-local`, {
      path: DEST_REL,
      mime,
    }, { headers: { 'Content-Type': 'application/json' } });

    const id = reg.data?.id;
    if (!id) throw new Error(`Unexpected register response: ${JSON.stringify(reg.data)}`);
    console.log(`Registered asset id=${id}`);

    console.log('Downloading asset...');
    const resp = await axios.get(`${API_BASE}/assets/${id}`, { responseType: 'stream' });
    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(OUT);
      resp.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    const st = fs.statSync(OUT);
    console.log(`Saved copy to ${OUT} (${st.size} bytes)`);
    console.log('✅ Copy-and-register asset test completed');
  } catch (err) {
    console.error('💥 Asset copy test failed:', err?.response?.data || err?.message || err);
    process.exit(1);
  }
}

function inferMime(p) {
  const l = p.toLowerCase();
  if (l.endsWith('.png')) return 'image/png';
  if (l.endsWith('.jpg') || l.endsWith('.jpeg')) return 'image/jpeg';
  if (l.endsWith('.webp')) return 'image/webp';
  if (l.endsWith('.gif')) return 'image/gif';
  return 'application/octet-stream';
}

main();

