import {convertFile} from './convert.js';
import {reviewScore,ArchiveNames,safeSegment} from './score.js';
import {createZipBlob} from './vendor/zip.js';

const $ = id => document.getElementById(id);
const scores = [];
const urls = new Set();
let busy = false, controller, importing = false, packing = false;
let settingsUsed, reportEngine, lastSummary = '';
const newElement = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
function setStatus(text) { $('status').textContent = text; }
function options() { return {parts:$('parts').checked, clean:$('clean').checked, dedupe:$('clean').checked && $('dedupe').checked, fonts:$('fonts').checked}; }
function refresh() {
  const locked = busy || importing || packing;
  for (const id of ['choose','folder','example','parts','clean','dedupe','fonts','clear','convert','zip','report']) $(id).disabled = locked;
  $('dedupe').disabled ||= !$('clean').checked;
  $('convert').disabled ||= scores.length === 0;
  $('cancel').hidden = !busy; $('clear').hidden = scores.length === 0 || busy;
  $('count').textContent = scores.length;
  $('convert').textContent = busy ? 'Converting…' : scores.some(s=>s.attempted) ? 'Convert again' : 'Convert scores';
  $('downloads').hidden = busy || !scores.some(s=>s.attempted);
  $('zip').disabled ||= !scores.some(s=>s.results?.length);
}
function link(file) {
  const a = newElement('a',file.path);
  a.download = file.path.split('/').pop();
  if (!file.url) {
    file.url = URL.createObjectURL(new Blob([file.data],{type:'application/vnd.recordare.musicxml+xml'}));
    urls.add(file.url);
  }
  a.href = file.url; return a;
}
function paint(s) {
  const row = s.row;
  row.replaceChildren();
  const top = newElement('div',undefined,'rowtop');
  top.append(newElement('span',s.path,'filename'),newElement('span',s.state,'rowstate ' + (s.error?'error':s.results?'done':'')));
  row.append(top);
  if (s.error) row.append(newElement('p',s.error,'rowdetails'));
  if (!s.results) return;
  const details = newElement('details',undefined,'rowdetails');
  details.append(newElement('summary',s.results.length + ' MusicXML ' + (s.results.length===1?'file':'files') + ' · downloads & details'));
  for (const r of s.results) {
    details.append(link(r));
    if (r.raw) details.append(link(r.raw));
  }
  if (s.warnings.length) details.append(newElement('p',s.warnings.join('\n')));
  const n = s.results.reduce((n,r)=>n+r.findings.length,0);
  if (n) details.append(newElement('p',n + ' cleanup or review entries in the conversion report.'));
  row.append(details);
}
async function isScore(file) {
  if (/\.(musx|mus)$/i.test(file.name)) return true;
  if (file.name.includes('.')) return false;
  const prefix = new TextDecoder('latin1').decode(await file.slice(0,64).arrayBuffer());
  return /^(ENIGMA BINARY FILE|Finale)/.test(prefix);
}
async function add(getEntries) {
  if (busy || importing || packing) return;
  importing = true; refresh(); setStatus('Reading selection…');
  let skipped=0,added=0;
  try {
    for (const {file,path} of await getEntries()) {
      if (file.name.startsWith('._') || !(await isScore(file))) { skipped++; continue; }
      const s = {file,path,state:'Queued',row:newElement('li')};
      scores.push(s); $('rows').append(s.row); paint(s); added++;
    }
    const message = added ? ('Added ' + added + (added === 1 ? ' score.' : ' scores.')) : 'No Finale scores found.';
    setStatus(message + (skipped?' Skipped ' + skipped + ' unrelated ' + (skipped===1?'file.':'files.'):''));
  } catch(e) {setStatus('Could not read the full selection. ' + e.message);}
  finally {importing=false;refresh();}
}
function selected(input) {
  const files = Array.from(input.files);input.value='';
  return add(()=>files.map(file=>({file,path:file.webkitRelativePath || file.name})));
}
$('choose').onclick=()=>$('files').click();
$('folder').onclick=()=>$('directory').click();
$('files').onchange=e=>selected(e.target);
$('directory').onchange=e=>selected(e.target);
$('example').onclick=()=>add(async()=>{
  const r=await fetch('./examples/F100-note.mus');
  if (!r.ok) throw new Error('The example could not be loaded.');
  const file=new File([await r.arrayBuffer()],'One-note sample.mus'); return [{file,path:file.name}];
});
async function walk(entry,path,entries) {
  if (entry.isFile) {
    const file=await new Promise((resolve,reject)=>entry.file(resolve,reject));
    entries.push({file,path:path+entry.name});
  } else if (entry.isDirectory) {
    const reader=entry.createReader();
    for (;;) {
      const items=await new Promise((resolve,reject)=>reader.readEntries(resolve,reject));
      if (!items.length) break;
      for (const item of items) await walk(item,path+entry.name+'/',entries);
    }
  }
}
const drop=$('drop');
drop.ondragover=e=>{e.preventDefault();drop.classList.add('over');};
drop.ondragleave=()=>drop.classList.remove('over');
drop.ondrop=e=>{
  e.preventDefault();drop.classList.remove('over');
  const roots=Array.from(e.dataTransfer.items || []).map(i=>i.webkitGetAsEntry?.()).filter(Boolean);
  const flat=Array.from(e.dataTransfer.files);
  add(async()=>{
    if (!roots.length) return flat.map(file=>({file,path:file.name}));
    const entries=[];
    for (const root of roots) await walk(root,'',entries);
    return entries;
  });
};
function resetResults() {
  for (const url of urls) URL.revokeObjectURL(url);
  urls.clear();
  for (const s of scores) { Object.assign(s,{state:'Queued',resources:null,error:null,results:null,warnings:[],attempted:false});paint(s); }
}
$('clear').onclick=()=>{
  resetResults();scores.length=0;$('rows').replaceChildren();$('progress').hidden=true;
  lastSummary='';setStatus('Add scores to start a conversion.');refresh();
};
$('cancel').onclick=()=>controller?.abort();
for(const id of ['clean','dedupe','fonts','parts']) $(id).onchange=()=>{
  refresh(); if(scores.some(s=>s.attempted))setStatus('Settings changed. Convert again to apply them to this queue.');
};
$('convert').onclick=async()=>{
  if (busy || !scores.length) return;
  busy=true;controller=new AbortController();const signal=controller.signal;
  settingsUsed=options();resetResults();refresh();
  const session = {},names = new ArchiveNames();
  names.used.add('conversion-report.txt');
  const progress=$('progress');progress.hidden=false;progress.max=scores.length;progress.value=0;
  let ready=0,failed=0;
  for (const [i,s] of scores.entries()) {
    if (signal.aborted) break;
    s.attempted=true;s.state='Reading score';paint(s);
    setStatus('Converting ' + (i+1) + ' of ' + scores.length + ' · ' + s.path);
    try {
      const {outputs,warnings,resources}=await convertFile(s.file,settingsUsed,session,signal,stage=>{s.state=stage;paint(s);});
      signal.throwIfAborted();
      const directories=s.path.split('/').slice(0,-1);
      const stem=safeSegment(s.file.name.replace(/\.musx?$/i,''));
      const results=[];
      for (const out of outputs) {
        const score=reviewScore(out.data,settingsUsed);
        const suffix=out.outputIndex===0?'':' — '+safeSegment(out.suggestedName || 'Part '+out.outputIndex);
        const path=names.file(directories,stem+suffix+'.musicxml');
        const raw=score.changes?{path:names.file(directories,stem+suffix+' (before cleanup).musicxml'),data:out.data}:null;
        results.push({path,data:score.output,raw,findings:score.findings,notes:score.notes,parts:score.partCount});
      }
      Object.assign(s,{warnings,resources,results,state:warnings.length?'Converted · review warnings':'Converted'});ready++;
    } catch(e) {
      if (signal.aborted) {s.attempted=false;s.state='Stopped';paint(s);break;}
      s.state='Could not convert';s.error=e.message || String(e);failed++;
    }
    paint(s);progress.value=i+1;
  }
  reportEngine=session.engine || 'Engine could not start';
  busy=false;controller=null;progress.hidden=true;
  lastSummary=(signal.aborted?'Stopped. ':'') + ready + ' converted · ' + failed + ' failed' + (scores.length-ready-failed?' · '+(scores.length-ready-failed)+' unprocessed':'')+'.';
  setStatus(lastSummary);refresh();
};
function report() {
  const lines=['Scorebridge conversion report',reportEngine,lastSummary,'', 'Settings '+JSON.stringify(settingsUsed),''];
  for(const s of scores){
    lines.push(s.path,'  '+s.state);
    if(s.resources) lines.push('  Reference tables: '+s.resources);
    if(s.error) lines.push('  '+s.error);
    for(const w of s.warnings || [])lines.push('  Warning: '+w);
    for(const r of s.results || []){
      lines.push('  '+r.path+' · '+r.parts+' parts · '+r.notes+' note/rest entries');
      if(r.raw)lines.push('  Before cleanup: '+r.raw.path);
      for(const f of r.findings)lines.push('    '+f);
    }
    lines.push('');
  }
  return lines.join('\n');
}
function download(blob,name) {
  const url=URL.createObjectURL(blob), a=newElement('a');
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
$('report').onclick=()=>download(new Blob([report()],{type:'text/plain;charset=utf-8'}),'conversion-report.txt');
$('zip').onclick=async()=>{
  if(packing || busy)return;
  packing=true;refresh();setStatus('Preparing the ZIP…');
  try {
    const entries=[{name:'conversion-report.txt',data:new TextEncoder().encode(report())}];
    for (const s of scores) for(const r of s.results || []) {
      entries.push({name:r.path,data:r.data});
      if(r.raw)entries.push({name:r.raw.path,data:r.raw.data});
    }
    download(await createZipBlob(entries),'MusicXML-scores.zip');
    setStatus(lastSummary+' ZIP ready.');
  } catch(e){setStatus('Could not create ZIP. '+e.message+' Individual downloads are available.');}
  finally {packing=false;refresh();}
};
refresh();
