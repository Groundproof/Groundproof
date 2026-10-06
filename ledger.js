// Local ledger: native browser APIs only. No networking or third-party runtime.
export const DB_NAME = 'groundproof-v01-ledger';
export const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_PIXELS = 48 * 1000 * 1000;
export const CHANGES = Object.freeze({
  updated: 'Zustand aktualisiert', unchanged: 'Keine sichtbare Änderung',
  installed: 'Installiert / ausgeführt', added: 'Material hinzugefügt',
  removed: 'Material entfernt / verbraucht', problem: 'Abweichung / Problem'
});
const STATES = Object.freeze({updated:'Zustand laut Foto aktualisiert', installed:'Installiert / ausgeführt', added:'Material hinzugefügt', removed:'Material entfernt / verbraucht', problem:'Abweichung / Problem bestätigt'});
const HASH = /^[a-f0-9]{64}$/;
const MIMES = ['image/jpeg', 'image/png', 'image/webp'];
export function validId(id) { return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id); }
export function idFromURL(url) {
  const ids = new URL(url).searchParams.getAll('id');
  if (!ids.length) return null;
  if (ids.length !== 1 || !validId(ids[0])) throw new Error('Ungültige Physical ID. Verwende genau einen id-Parameter mit 1–64 Buchstaben, Ziffern, - oder _.');
  return ids[0];
}
export async function sha256(input) {
  if (!globalThis.crypto?.subtle) throw new Error('Hashing ist nicht verfügbar. Öffne die App über HTTPS oder localhost.');
  const bytes = input instanceof Blob ? await input.arrayBuffer() : typeof input === 'string' ? new TextEncoder().encode(input) : input;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2,'0')).join('');
}
// Canonical serialization makes verification independent of object property order.
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+canonical(value[k])).join(',') + '}';
}
export function stateFor(change, previous) {
  if (!Object.hasOwn(CHANGES, change)) throw new Error('Bitte einen gültigen Change auswählen.');
  return change === 'unchanged' ? (previous?.human.state || 'Erstaufnahme – kein früherer Zustand zum Vergleich') : STATES[change];
}
export async function prepareEvidence(file) {
  if (!(file instanceof Blob) || !file.size) throw new Error('Bitte ein Foto auswählen.');
  if (file.size > MAX_BYTES) throw new Error('Foto zu gross: maximal 20 MiB. Wähle eine kleinere Aufnahme.');
  if (!MIMES.includes(file.type)) throw new Error('Dieses Format wird nicht unterstützt. Bitte JPEG, PNG oder WebP wählen (HEIC ggf. als JPEG exportieren).');
  // Hash precisely the bytes handed to the browser, before any canvas transformation.
  const originalHash = await sha256(file);
  const url = URL.createObjectURL(file);
  const img = new Image();
  try {
    await new Promise((resolve,reject) => { img.onload=resolve; img.onerror=()=>reject(new Error('Das Foto konnte nicht gelesen werden. Bitte ein anderes Foto wählen.')); img.src=url; });
    const width=img.naturalWidth, height=img.naturalHeight;
    if (!width || !height || width*height > MAX_PIXELS) throw new Error('Fotoauflösung zu gross: maximal 48 Megapixel. Bitte kleinere Aufnahme wählen.');
    const scale=Math.min(1,1600/Math.max(width,height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(width*scale)); canvas.height=Math.max(1,Math.round(height*scale));
    const ctx=canvas.getContext('2d');
    if (!ctx) throw new Error('Bildverarbeitung nicht verfügbar. Bitte einen aktuellen Browser verwenden.');
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(img,0,0,canvas.width,canvas.height);
    const preview=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Vorschau konnte nicht erstellt werden.')),'image/jpeg',0.78));
    const meta={sha256:originalHash,bytes:file.size,mime:file.type};
    const derived={previewSha256:await sha256(preview),previewBytes:preview.size,previewMime:preview.type,sourceWidth:width,sourceHeight:height,previewWidth:canvas.width,previewHeight:canvas.height,transform:'canvas-jpeg-1600-q078-v1'};
    canvas.width=canvas.height=0;
    return {original:file,preview,meta,derived};
  } finally { URL.revokeObjectURL(url); img.src=''; }
}
function request(req) { return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);}); }
function completed(tx) { return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error || new Error('Speichervorgang abgebrochen.'));tx.onerror=()=>{};}); }
export function openDB() {
  return new Promise((resolve,reject)=>{
    if (!globalThis.indexedDB) return reject(new Error('Lokaler Browserspeicher ist nicht verfügbar.'));
    const req=indexedDB.open(DB_NAME,1);
    let blocked=false;
    req.onupgradeneeded=()=>{
      const db=req.result;
      db.createObjectStore('identities',{keyPath:'id'});
      db.createObjectStore('entries',{keyPath:['physicalId','sequence']});
      db.createObjectStore('evidence',{keyPath:['physicalId','sequence']});
    };
    req.onblocked=()=>{blocked=true;reject(new Error('Speicher wird von einem anderen Tab blockiert. Andere GroundProof-Tabs schliessen und neu laden.'));};
    req.onerror=()=>reject(req.error);
    req.onsuccess=()=>{const db=req.result;if(blocked){db.close();return;}db.onversionchange=()=>db.close();resolve(db);};
  });
}
export async function readLedger(db,id) {
  if (!validId(id)) throw new Error('Ungültige Physical ID.');
  const tx=db.transaction(['identities','entries','evidence'],'readonly');
  const done=completed(tx);
  const range=IDBKeyRange.bound([id,0],[id,Number.MAX_SAFE_INTEGER]);
  const results=await Promise.all([request(tx.objectStore('identities').get(id)),request(tx.objectStore('entries').getAll(range)),request(tx.objectStore('evidence').getAll(range)),done]);
  return {identity:results[0],entries:results[1],evidence:results[2]};
}
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const text = (v,n) => typeof v === 'string' && v.length<=n;
const iso = v => text(v,30) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString()===v;
function shape(e,id,i) {
  return object(e) && e.version===1 && e.physicalId===id && e.sequence===i+1 && iso(e.createdAt) &&
    object(e.human) && Object.hasOwn(CHANGES,e.human.change) && text(e.human.state,200) && text(e.human.note,500) && iso(e.human.confirmedAt) &&
    object(e.originalEvidence) && HASH.test(e.originalEvidence.sha256) && MIMES.includes(e.originalEvidence.mime) && Number.isSafeInteger(e.originalEvidence.bytes) && e.originalEvidence.bytes>0 && e.originalEvidence.bytes<=MAX_BYTES &&
    object(e.derived) && HASH.test(e.derived.previewSha256) && e.derived.previewMime==='image/jpeg' && Number.isSafeInteger(e.derived.previewBytes) && e.derived.previewBytes>0 && e.derived.previewBytes<=MAX_BYTES &&
    ['sourceWidth','sourceHeight','previewWidth','previewHeight'].every(k=>Number.isSafeInteger(e.derived[k]) && e.derived[k]>0) &&
    e.derived.sourceWidth*e.derived.sourceHeight<=MAX_PIXELS && e.derived.previewWidth<=1600 && e.derived.previewHeight<=1600 && e.derived.transform==='canvas-jpeg-1600-q078-v1' && HASH.test(e.hash) && (e.previousHash==='GENESIS' || HASH.test(e.previousHash));
}
export async function verifyLedger(snapshot,id) {
  const {identity,entries,evidence}=snapshot;
  if (!identity && !entries.length && !evidence.length) return true;
  const fail=()=>{throw new Error('Integritätsprüfung fehlgeschlagen: lokale Daten sind beschädigt oder verändert. Neue Captures für diese ID sind gesperrt; vorhandene Daten werden nicht überschrieben.');};
  if (!object(identity) || identity.id!==id || identity.version!==1 || !iso(identity.createdAt) || identity.count!==entries.length || entries.length!==evidence.length || !entries.length) fail();
  let previous='GENESIS';
  for (let i=0;i<entries.length;i++) {
    const e=entries[i], b=evidence[i];
    if (!shape(e,id,i) || e.previousHash!==previous || e.human.state!==stateFor(e.human.change,entries[i-1]) || e.human.confirmedAt!==e.createdAt) fail();
    const {hash,...payload}=e;
    if (await sha256(canonical(payload))!==hash) fail();
    if (!object(b) || b.physicalId!==id || b.sequence!==e.sequence || !(b.original instanceof Blob) || !(b.preview instanceof Blob) || b.original.size!==e.originalEvidence.bytes || b.original.type!==e.originalEvidence.mime || b.preview.size!==e.derived.previewBytes || b.preview.type!==e.derived.previewMime) fail();
    if (await sha256(b.original)!==e.originalEvidence.sha256 || await sha256(b.preview)!==e.derived.previewSha256) fail();
    previous=hash;
  }
  if (identity.headHash!==previous || identity.createdAt!==entries[0].createdAt) fail();
  return true;
}
export async function appendCapture(db,id,prepared,change,note,expectedHead) {
  if (!validId(id) || !text(note,500)) throw new Error('Ungültige Angaben.');
  const snapshot=await readLedger(db,id);
  await verifyLedger(snapshot,id);
  const last=snapshot.entries.at(-1);
  const previousHash=last?.hash || 'GENESIS';
  if (previousHash!==expectedHead) throw new Error('Der Verlauf wurde in einem anderen Tab ergänzt. Öffne die Physical ID erneut und bestätige den aktuellen Zustand.');
  const createdAt=new Date().toISOString(), sequence=snapshot.entries.length+1;
  const entry={version:1,physicalId:id,sequence,createdAt,originalEvidence:prepared.meta,human:{change,state:stateFor(change,last),note:note.trim(),confirmedAt:createdAt},derived:prepared.derived,previousHash};
  entry.hash=await sha256(canonical(entry));
  // Hashing completes before opening the write transaction (avoids IDB auto-commit).
  const tx=db.transaction(['identities','entries','evidence'],'readwrite');
  const done=completed(tx);
  let conflict=false;
  const identities=tx.objectStore('identities');
  const head=identities.get(id);
  head.onsuccess=()=>{
    const current=head.result;
    if ((current?.headHash || 'GENESIS')!==previousHash || (current?.count || 0)!==sequence-1) {conflict=true;tx.abort();return;}
    identities.put({version:1,id,createdAt:snapshot.identity?.createdAt || createdAt,count:sequence,headHash:entry.hash});
    tx.objectStore('entries').add(entry);
    tx.objectStore('evidence').add({physicalId:id,sequence,original:prepared.original,preview:prepared.preview});
  };
  try {await done;} catch(e) {if(conflict)throw new Error('Gleichzeitiger Capture in anderem Tab. Bitte Physical ID erneut öffnen; es wurde nichts überschrieben.');throw e;}
  return entry;
}
export function friendlyError(error) {
  if (error?.name==='QuotaExceededError') return 'Speicher voll. Der Proof wurde nicht gespeichert. Foto und Angaben bleiben für einen erneuten Versuch erhalten. Schaffe Gerätespeicher frei; lösche keine GroundProof-Browserdaten, wenn du den Verlauf behalten möchtest.';
  if (['SecurityError','InvalidStateError','UnknownError','NotAllowedError'].includes(error?.name)) return 'Der Browser erlaubt den lokalen Speicher nicht oder er ist nicht verfügbar. Bitte einen normalen Browser-Tab verwenden, Speichereinstellungen prüfen und erneut versuchen.';
  return error?.message || 'Speichern fehlgeschlagen. Es wurde kein Erfolg bestätigt. Bitte erneut versuchen.';
}
