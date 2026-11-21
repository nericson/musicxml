const emptyWrappers = new Set(['notations','articulations','technical','ornaments']);
const simpleMarks = new Set(['accent','staccato','tenuto','staccatissimo','spiccato','detached-legato','strong-accent','stress','unstress','soft-accent']);
const decoder = new TextDecoder('utf-8', {fatal:true});
const encoder = new TextEncoder();

export function reviewScore(buffer, {clean, dedupe}) {
  const xml = decoder.decode(buffer);
  const doc = new DOMParser().parseFromString(xml,'application/xml');
  if (doc.documentElement.localName !== 'score-partwise' || doc.getElementsByTagName('parsererror').length)
    throw new Error('The converter returned an unreadable MusicXML score.');
  const findings = [];
  let changes = 0;
  let notes = 0;
  const parts = Array.from(doc.documentElement.children).filter(x => x.localName === 'part');
  if (!parts.length) throw new Error('The MusicXML has no score parts.');
  for (const part of parts) {
    for (const measure of [...part.children].filter(x => x.localName === 'measure')) {
      const noteList = [...measure.children].filter(x => x.localName === 'note');
      notes += noteList.length;
      for (const [n,note] of noteList.entries()) {
        const where = part.id + ', measure ' + measure.getAttribute('number') + ', note ' + (n + 1);
        for (const group of note.querySelectorAll(':scope > notations > articulations')) {
          const seen = new Set();
          for (const mark of [...group.children]) {
            if (!simpleMarks.has(mark.localName) || mark.childNodes.length || mark.hasAttribute('id')) continue;
            const attrs = [...mark.attributes].map(a => [a.name,a.value]).sort((a,b) => a[0].localeCompare(b[0]));
            const key = JSON.stringify([mark.namespaceURI,mark.localName,attrs]);
            if (seen.has(key)) {
              const remove = clean && dedupe;
              findings.push(where + ' — ' + (remove ? 'Removed' : 'Retained') + ' repeated ' + mark.localName + '.');
              if (remove) { mark.remove(); changes++; }
            }
            seen.add(key);
          }
        }
        if (!clean) continue;
        const wrappers = note.querySelectorAll(':scope > notations, :scope > notations > articulations, :scope > notations > ornaments, :scope > notations > technical');
        for (const el of [...wrappers].reverse()) {
          if (!emptyWrappers.has(el.localName) || el.attributes.length || [...el.childNodes].some(c => c.nodeType !== 3 || c.textContent.trim())) continue;
          findings.push(where + ' — removed empty ' + el.localName + ' group.');
          el.remove(); changes++;
        }
      }
    }
  }
  let output = buffer;
  if (changes) {
    const decl = xml.match(/^<\?xml[^?]*\?>\s*/)?.[0] || '';
    output = encoder.encode(decl + new XMLSerializer().serializeToString(doc)).buffer;
  }
  return {output, findings, changes, notes, partCount:parts.length};
}

export function safeSegment(value) {
  const safe = value.normalize('NFC').replace(/[\u0000-\u001f<>:"/\\|?*]/g,'_').replace(/[. ]+$/g,'').trim() || '_';
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe) ? '_' + safe : safe;
}

export function reservePath(path, used) {
  const dot = path.lastIndexOf('.');
  let candidate = path;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = path.slice(0,dot) + ' (' + suffix++ + ')' + path.slice(dot);
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

// Directory components are reserved independently of file names. This also
// handles case-insensitive destinations and folders named "score.musicxml".
export class ArchiveNames {
  constructor() { this.directories = new Map(); this.used = new Set(); }
  directory(segments) {
    let key = '', path = '';
    for (const segment of segments) {
      key += '/' + segment;
      if (!this.directories.has(key)) {
        const base = path + safeSegment(segment);
        let candidate = base, n = 2;
        while (this.used.has(candidate.toLowerCase())) candidate = base + ' (' + n++ + ')';
        this.used.add(candidate.toLowerCase());
        this.directories.set(key, candidate + '/');
      }
      path = this.directories.get(key);
    }
    return path;
  }
  file(segments,name) { return reservePath(this.directory(segments) + safeSegment(name),this.used); }
}
