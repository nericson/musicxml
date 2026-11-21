import assert from 'node:assert/strict';
import { Worker as NodeWorker } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { convertFile } from '../dist/convert.js';
import { ArchiveNames } from '../dist/score.js';
import { createZipBlob } from '../dist/vendor/zip.js';

// Adapt only browser transport. The worker, C++ reader, and exporter are the
// same ones served by the website. No score or reference data leaves the test.
globalThis.Worker = class {
  constructor(url) {
    this.worker = new NodeWorker(`
      const {parentPort} = require('node:worker_threads');
      const {readFile} = require('node:fs/promises');
      globalThis.self = globalThis;
      globalThis.addEventListener = (_, fn) => parentPort.on('message', data => fn({data}));
      globalThis.postMessage = (data, list) => parentPort.postMessage(data,list);
      globalThis.fetch = async input => {
        if (!String(input).startsWith('file:')) throw new Error('Remote support tables intentionally offline for test');
        return new Response(await readFile(new URL(input)));
      };
      import(${JSON.stringify(url.href)}).catch(err => {throw err});
    `, {eval:true});
    this.worker.on('message',data=>this.onmessage?.({data}));
    this.worker.on('error',e=>this.onerror?.(e));
  }
  postMessage(...args) { this.worker.postMessage(...args); }
  terminate() { this.worker.terminate(); }
};
const settings={parts:true,fonts:true};
const session={};
const run=async (path,bytes) => convertFile(new File([bytes ?? await readFile(path)],path.split('/').pop()),settings,session,new AbortController().signal,()=>{});
for (const file of ['site/examples/F100-note.mus','tests/F300-baseline.mus','tests/F2008-parts-voiced.mus','tests/linked-parts.musx']) {
  const result = await run(file);
  assert.ok(result.outputs.length);
  const xml = new TextDecoder().decode(result.outputs[0].data);
  assert.match(xml,/<score-partwise/);
  assert.match(xml,/<part id=/);assert.match(xml,/<measure\s/);
  if (file.includes('F100')) {assert.match(xml,/<pitch>/);assert.ok(result.warnings.some(s=>s.includes('reference tables')));}
  if (/parts/.test(file)) assert.ok(result.outputs.length>1, 'Expected linked part exports');
  console.log(file, '=>', result.outputs.length,'MusicXML document(s)');
}
await assert.rejects(run('broken.mus',(await readFile('tests/F300-baseline.mus')).subarray(0,1024)),/damaged|invalid|corrupt|end of|truncated/i);
await assert.rejects(run('misnamed.mus',new Uint8Array([1,2,3,4])));
const paths=new ArchiveNames();
assert.equal(paths.file(['A'],'Tune.musicxml'),'A/Tune.musicxml');
assert.equal(paths.file(['A'],'Tune (2).musicxml'),'A/Tune (2).musicxml');
assert.equal(paths.file(['A'],'tune.musicxml'),'A/tune (3).musicxml');
assert.notEqual(paths.file(['a'],'Tune.musicxml'),'a/Tune.musicxml');
const zip=await createZipBlob([{name:'A/Tune.musicxml',data:new TextEncoder().encode('<score-partwise/>')}]);
assert.equal(new DataView(await zip.arrayBuffer()).getUint32(0,true),0x04034b50);
console.log('Passed legacy, modern, linked parts, damaged input, collision handling, ZIP export.');
