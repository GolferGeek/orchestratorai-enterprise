/*
  Simple asset flow test:
  - Registers an existing local file under IMAGE_STORAGE_DIR
  - Fetches the streamed content and writes it to /tmp
  Usage:
    API_BASE=http://localhost:9000 FILE=image.png node apps/api/testing/test-assets.js
*/
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { getApiUrl } from './test-env.js';

const API_BASE = getApiUrl();
const FILE = process.env.FILE || 'image.png'; // relative to IMAGE_STORAGE_DIR
const OUT = process.env.OUT || '/tmp/asset_copy.png';

async function main() {
  try {
    console.log(`Registering local file: ${FILE}`);
    const reg = await axios.post(`${API_BASE}/assets/register-local`, {
      path: FILE,
    }, { headers: { 'Content-Type': 'application/json' } });
    if (!reg.data?.id && !reg.data?.url) {
      throw new Error(`Unexpected register response: ${JSON.stringify(reg.data)}`);
    }
    const id = reg.data.id;
    const url = reg.data.url || `${API_BASE}/assets/${id}`;
    console.log(`Registered asset id=${id} url=${url}`);

    console.log('Downloading asset...');
    const resp = await axios.get(`${API_BASE}/assets/${id}`, { responseType: 'stream' });
    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(OUT);
      resp.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    const st = fs.statSync(OUT);
    console.log(`Saved to ${OUT} (${st.size} bytes)`);
    console.log('✅ Asset test completed');
  } catch (err) {
    console.error('💥 Asset test failed:', err?.response?.data || err?.message || err);
    process.exit(1);
  }
}

main();

