// Native Node tests for the exported browser-independent integrity boundary.
// No dev dependencies. Run: node --test tests/core.mjs
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {validId,idFromURL,sha256,canonical,stateFor,verifyLedger,prepareEvidence,MAX_BYTES,friendlyError,CHANGES} from '../ledger.js';
const original=new Blob([Uint8Array.from([0xff,0xd8,0xff,0xd9])],{type:'image/jpeg'});
const preview=new Blob(['preview bytes'],{type:'image/jpeg'});
async function fixture(id='GP-WALL-001',length=2) {
 const entries=[],evidence=[];
 for(let i=0;i<length;i++) {
  const createdAt=`2026-10-06T12:0${i}:00.000Z`,change=i?'unchanged':'installed';
  const e={version:1,physicalId:id,sequence:i+1,createdAt,originalEvidence:{sha256:await sha256(original),bytes:original.size,mime:original.type},human:{change,state:stateFor(change,entries.at(-1)),note:'Photo-based human confirmation',confirmedAt:createdAt},derived:{previewSha256:await sha256(preview),previewBytes:preview.size,previewMime:preview.type,sourceWidth:100,sourceHeight:100,previewWidth:100,previewHeight:100,transform:'canvas-jpeg-1600-q078-v1'},previousHash:entries.at(-1)?.hash || 'GENESIS'};
  e.hash=await sha256(canonical(e));entries.push(e);evidence.push({physicalId:id,sequence:i+1,original,preview});
 }
 return {identity:{version:1,id,createdAt:entries[0].createdAt,count:length,headHash:entries.at(-1).hash},entries,evidence};
}
const rejectMutation=async mutate=>{const s=await fixture();mutate(s);await assert.rejects(verifyLedger(s,'GP-WALL-001'),/Integritätsprüfung/);};
test('valid Physical IDs and case sensitivity',()=>{for(const id of ['A','GP-WALL-001','a_B','0','X'.repeat(64),'constructor','__x'])assert.equal(validId(id),id!=='__x');assert.notEqual(idFromURL('https://x/?id=a'),idFromURL('https://x/?id=A'));});
test('invalid URL IDs rejected, missing ID starts picker',()=>{assert.equal(idFromURL('https://x/'),null);for(const q of ['?id=','?id=A&id=A','?id='+('X'.repeat(65)),'?id=%3Cscript%3E','?id=a%20b','?id=..%2Fx','?id=%00','?id=%E0%A4%A'])assert.throws(()=>idFromURL('https://x/'+q));});
test('SHA-256 matches independent standard implementation',async()=>{assert.equal(await sha256('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');assert.equal(await sha256(original),createHash('sha256').update(Buffer.from(await original.arrayBuffer())).digest('hex'));});
test('canonical JSON handles ordering and text deterministically',()=>assert.equal(canonical({z:'<img> ä',a:{b:2,a:1}}),canonical({a:{a:1,b:2},z:'<img> ä'})));
test('all six changes supported',()=>assert.equal(Object.keys(CHANGES).length,6));
test('unchanged keeps state; first unchanged has no comparison claim',()=>{assert.equal(stateFor('unchanged',{human:{state:'Installed'}}),'Installed');assert.match(stateFor('unchanged'),/kein früherer Zustand/);assert.throws(()=>stateFor('constructor'));});
test('valid empty and populated chain',async()=>{await verifyLedger({entries:[],evidence:[]},'GP-WALL-001');await verifyLedger(await fixture(),'GP-WALL-001');});
test('original and entry hashes are separate',async()=>{const s=await fixture();assert.notEqual(s.entries[0].hash,s.entries[0].originalEvidence.sha256);assert.equal(s.entries[1].previousHash,s.entries[0].hash);});
for(const [name,mutate] of [
 ['confirmed note',s=>s.entries[0].human.note='tampered'],
 ['physical identity',s=>s.entries[0].physicalId='OTHER'],
 ['sequence',s=>s.entries[1].sequence=3],
 ['predecessor',s=>s.entries[1].previousHash='0'.repeat(64)],
 ['entry hash',s=>s.entries[0].hash='a'.repeat(64)],
 ['original hash',s=>s.entries[0].originalEvidence.sha256='b'.repeat(64)],
 ['original blob bytes',s=>s.evidence[0].original=new Blob(['xxxx'],{type:'image/jpeg'})],
 ['preview blob bytes',s=>s.evidence[0].preview=new Blob(['modified'],{type:'image/jpeg'})],
 ['blob MIME',s=>s.evidence[0].original=new Blob([s.evidence[0].original],{type:'image/png'})],
 ['head',s=>s.identity.headHash='a'.repeat(64)],
 ['count',s=>s.identity.count=3],
 ['missing identity',s=>s.identity=undefined],
 ['missing evidence',s=>s.evidence.pop()],
 ['deleted tail with unchanged head',s=>{s.entries.pop();s.evidence.pop();}],
 ['invalid schema',s=>s.entries[0].human=null],
 ['invalid time',s=>s.entries[0].createdAt='not-a-date'],
 ['unsupported schema version',s=>s.entries[0].version=99],
 ['evidence wrong ID',s=>s.evidence[0].physicalId='OTHER'],
 ['excessive dimensions',s=>s.entries[0].derived.sourceWidth=999999999]
]) test('reject inconsistent '+name,()=>rejectMutation(mutate));
test('ID isolation validation',async()=>{await assert.rejects(verifyLedger(await fixture('B'),'A'),/Integritätsprüfung/);await verifyLedger(await fixture('B'),'B');});
test('documented boundary: fully rewritten internally consistent ledger still validates',async()=>{const s=await fixture();s.entries[0].human.note='attacker can rewrite local facts';for(let i=0;i<s.entries.length;i++){s.entries[i].previousHash=i?s.entries[i-1].hash:'GENESIS';const {hash,...p}=s.entries[i];s.entries[i].hash=await sha256(canonical(p));}s.identity.headHash=s.entries.at(-1).hash;assert.equal(await verifyLedger(s,'GP-WALL-001'),true);});
test('pre-decode validation: empty, excessive bytes and unsupported format',async()=>{await assert.rejects(prepareEvidence(new Blob([])),/Foto auswählen/);await assert.rejects(prepareEvidence(new Blob([new Uint8Array(MAX_BYTES+1)],{type:'image/jpeg'})),/20 MiB/);await assert.rejects(prepareEvidence(new Blob(['<svg/>'],{type:'image/svg+xml'})),/Format/);});
test('friendly quota and unavailable storage errors',()=>{assert.match(friendlyError(new DOMException('full','QuotaExceededError')),/nicht gespeichert/);assert.match(friendlyError(new DOMException('blocked','SecurityError')),/Browser erlaubt/);});
test('static app security and capture configuration',async()=>{const html=await readFile(new URL('../index.html',import.meta.url),'utf8'),app=await readFile(new URL('../app.js',import.meta.url),'utf8');assert.match(html,/connect-src 'none'/);assert.match(html,/capture="environment"/);assert.match(html,/id="photoFallback"[^>]+type="file"/);assert.doesNotMatch(app,/\.innerHTML\s*=/);assert.doesNotMatch(html,/<(?:script|link)[^>]+(?:src|href)="https?:/);assert.match(app,/performance\.now\(\)/);});

test('V0.2 product journey exposes value, plan and outcome without network AI',async()=>{const html=await readFile(new URL('../index.html',import.meta.url),'utf8'),app=await readFile(new URL('../app.js',import.meta.url),'utf8');for(const s of ['Assess','Count','Build','Yield','stageType','expectedSummary','actualSummary','plannedQty','actualQty','outcome'])assert.match(html,new RegExp(s));assert.match(app,/gp_plan_/);assert.match(app,/GPS:/);assert.match(app,/stageFrom/);assert.match(app,/Abweichung:/);assert.doesNotMatch(app,/fetch\s*\(/);});
