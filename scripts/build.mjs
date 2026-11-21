import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const commit = '45c3f6260f26f4d1752e3928013800bee6cc361f';
const archiveHash = 'df90c2d1bef67f1aedf85fd65810832feea920ca9c624e34cd0a0b7503a89760';
const target = 'dist/vendor';
await mkdir(target, { recursive: true });
await cp('site', 'dist', { recursive: true });

async function fetchBytes(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(r.status + ' from ' + url);
  return Buffer.from(await r.arrayBuffer());
}
async function fromArchive(bytes) {
  if (createHash('sha256').update(bytes).digest('hex') !== archiveHash)
    throw new Error('Unexpected upstream artifact checksum.');
  const directory = await mkdtemp(join(tmpdir(), 'musicxml-'));
  try {
    const zip = join(directory, 'engine.zip');
    await writeFile(zip, bytes);
    for (const name of ['denigma.js','denigma.wasm']) {
      const file = execFileSync('unzip', ['-p', zip, name], {maxBuffer:64 * 1024 * 1024});
      await writeFile(join(target,name), file);
    }
  } finally { await rm(directory, {recursive:true,force:true}); }
}
async function fromOfficialSite() {
  const home = new URL('https://denigma.robertgpatterson.com/');
  const manifest = JSON.parse(await fetchBytes(new URL('asset-manifest.json', home)));
  if (!manifest.denigmaOnlineCommit || !'e1de95a5ec1e0f5d9e20aa877839a5fd6a7871ad'.startsWith(manifest.denigmaOnlineCommit))
    throw new Error('Upstream website changed revisions.');
  for (const [key,name] of [['wasm','denigma.wasm'],['module','denigma.js']]) {
    const url = new URL(manifest[key], home);
    if (url.origin !== home.origin) throw new Error('Unexpected engine host.');
    await writeFile(join(target,name), await fetchBytes(url));
  }
}
try {
  const local = await readFile(process.env.DENIGMA_ARCHIVE || 'engine/denigma-wasm.zip').catch(e => {
    if (e.code !== 'ENOENT' || process.env.DENIGMA_ARCHIVE) throw e;
  });
  if (local) await fromArchive(local);
  else {
    try { await fromArchive(await fetchBytes('https://nightly.link/openmusx/denigma/actions/runs/43738266109/denigma-wasm.zip')); }
    catch(e) { console.log('Trying upstream published engine:',e.message); await fromOfficialSite(); }
  }
  const create = (await import(pathToFileURL(resolve(target, 'denigma.js')))).default;
  const m = await create({ wasmBinary: await readFile(join(target, 'denigma.wasm')) });
  const builtFrom = m.UTF8ToString(m._denigma_commit()).replace(/-dirty$/, '');
  if (builtFrom.length < 7 || !commit.startsWith(builtFrom)) throw new Error('Unexpected engine commit: ' + builtFrom);
  console.log('Denigma', m.UTF8ToString(m._denigma_version()), builtFrom);
} catch(e) {
  console.error('Supply the verified upstream ZIP via DENIGMA_ARCHIVE.'); throw e;
}
