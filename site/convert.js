// One worker per score releases the entire WebAssembly heap between files.
export async function convertFile(file, settings, session, signal, onStage) {
  const bytes = await file.arrayBuffer();
  signal.throwIfAborted();
  const worker = new Worker(new URL('./vendor/worker.js',import.meta.url), {type:'module'});
  try {
    return await new Promise((resolve,reject) => {
      const warnings = [];
      let readerDefaults = session.readerDefaults || false;
      let outputs = [0];
      let timer;
      function fail(reason) { clearTimeout(timer); reject(new Error(reason)); }
      function cancel() { fail('Stopped.'); }
      function touch() {
        clearTimeout(timer);
        timer = setTimeout(() => fail('The converter stopped responding. Try this file separately.'), 180000);
      }
      signal.addEventListener('abort', cancel, {once:true});
      worker.onerror = e => fail(e.message || 'The conversion worker could not start.');
      worker.onmessageerror = () => fail('The browser could not read a conversion result.');
      function warningList(data) {
        for (const item of data.diagnostics || []) {
          if (item.severity === 'warning' || item.severity === 'error') warnings.push(item.message);
        }
      }
      worker.onmessage = ({data:d}) => {
        touch();
        switch(d.type) {
          case 'ready':
            session.module = d.wasmModule ?? session.module;
            session.engine = 'Denigma ' + d.denigmaVersion + ' (' + d.denigmaCommit + ')';
            worker.postMessage({type:'inspect',fileName:file.name,buffer:bytes,allowDefaults:readerDefaults},[bytes]);
            break;
          case 'resources-unavailable':
            if (readerDefaults) { fail(d.message); break; }
            readerDefaults = session.readerDefaults = true;
            session.resourceWarning = 'Legacy reference tables unavailable. Playback, percussion, or text may differ. ' + d.message;
            worker.postMessage({type:'inspect',allowDefaults:true}); break;
          case 'runtime-message': warnings.push(d.message); break;
          case 'inspected':
            warningList(d);
            if (!d.success) { fail(warnings.join('\n') || 'This Finale file could not be read.'); break; }
            if (settings.parts) outputs.push(...d.parts.map(p => p.outputIndex));
            onStage('Exporting MusicXML');
            worker.postMessage({type:'convert',allowDefaults:readerDefaults,options:{
              format:0, selectedOutputs:[...new Set(outputs)], indentSpaces:2,cueLayer:0,
              pitchDisplayMode:0, includeTempo:true, allFontsAvailable:settings.fonts, useFinaleRestPosition:true
            }});
            break;
          case 'converted':
            warningList(d);
            if (!d.success || !d.outputs.length) { fail(warnings.join('\n') || 'No MusicXML was produced.'); break; }
            if (d.resourceInfo.startsWith('Reader defaults') && session.resourceWarning) warnings.push(session.resourceWarning);
            clearTimeout(timer);
            signal.removeEventListener('abort',cancel);
            resolve({outputs:d.outputs, warnings:[...new Set(warnings)], resources:d.resourceInfo}); break;
          case 'load-error': case 'worker-error': fail(d.message); break;
        }
      };
      touch();
      worker.postMessage({type:'init',wasmModule:session.module});
    });
  } finally { worker.terminate(); }
}
