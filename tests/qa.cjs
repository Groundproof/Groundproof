// Dev-only browser QA; application has zero dependencies.
// Run against a local server: NODE_PATH=<path containing playwright> node tests/qa.cjs
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const base=process.env.GP_TEST_URL || 'http://127.0.0.1:8765/';
const passed=[];
async function testEngine(name,type) {
 const browser=await type.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage();
 const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
 const foreign=[];page.on('request',r=>{if(!r.url().startsWith(base) && !r.url().startsWith('blob:'))foreign.push(r.url());});
 const check=(label)=>{passed.push(name+': '+label);console.log('PASS '+name+': '+label);};
 const open=async id=>{await page.goto(base+(id===null?'':'?id='+encodeURIComponent(id)));if(id)await page.waitForFunction(()=>!document.querySelector('#captureStart').disabled);};
 const count=async n=>{await page.waitForFunction(n=>document.querySelector('#captureCount').textContent===String(n),n);};
 const read=async()=>page.evaluate(async()=>{const m=await import('./ledger.js');const db=await m.openDB();const s=await m.readLedger(db,'GP-WALL-001');db.close();return {entries:s.entries,count:s.identity?.count};});
 await open('GP-WALL-001');
 assert.equal(await page.locator('#assetId').textContent(),'GP-WALL-001');await count(0);check('URL identity opens directly, empty ledger');
 const makePhoto=async(width,height)=>Buffer.from(await page.evaluate(([w,h])=>{const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.fillStyle='#438278';g.fillRect(0,0,w,h);return c.toDataURL('image/png').split(',')[1];},[width,height]),'base64');
 const photo=await makePhoto(2400,1200);
 const originalHash=createHash('sha256').update(photo).digest('hex');
 const capture=async(change='updated',note='',fallback=false)=>{
   await page.locator('#captureStart').click();
   await page.locator('#capture').waitFor({state:'visible'});
   assert.equal(await page.locator('#saveBtn').isDisabled(),true);
   await page.locator(fallback?'#photoFallback':'#photo').setInputFiles({name:'sample.png',mimeType:'image/png',buffer:photo});
   await page.waitForFunction(()=>!document.querySelector('#saveBtn').disabled);
   await page.locator('#eventType').selectOption(change);await page.locator('#note').fill(note);
   await page.locator('#saveBtn').click();await page.locator('#asset').waitFor({state:'visible'});
 };
 await capture('installed','Dämmung montiert');await count(1);
 assert.match(await page.locator('#message').textContent(),/Sekunden vom Öffnen bis zur Speicherung/);
 const first=(await read()).entries[0];
 assert.equal(first.originalEvidence.sha256,originalHash);assert.notEqual(first.hash,originalHash);assert.equal(first.previousHash,'GENESIS');
 assert.equal(first.derived.previewWidth,1600);assert.equal(first.derived.previewHeight,800);
 check('photo required, separate original hash, compressed derivative, post-commit timer');
 await capture('unchanged','<img src=x onerror=alert(1)>',true);await count(2);
 const second=(await read()).entries[1];assert.equal(second.previousHash,first.hash);assert.equal(second.human.state,first.human.state);
 await page.locator('#historyOpen').click();await page.waitForFunction(()=>document.querySelectorAll('#timeline > li.proof').length===2);
 assert.equal(await page.locator('#timeline > li.proof').count(),2);
 assert.match(await page.locator('#timeline').textContent(),/<img src=x onerror=alert\(1\)>/);
 assert.equal(await page.locator('#timeline img').count(),2);
 assert.equal(await page.locator('a[download]').count(),2);
 assert.match(await page.locator('#integrity').textContent(),/Prüfung bestanden/);
 check('second capture, unchanged state retained, chronological history, safe text, originals accessible');
 await page.reload();await count(2);assert.equal(await page.locator('#lastState').textContent(),'Installiert / ausgeführt');
 await open('GP-MAT-002');await count(0);await capture('added','',true);await count(1);
 await open('GP-WALL-001');await count(2);check('reload and physical ID histories isolated');
 // No application network requests while the capture/history function is exercised.
 await context.setOffline(true);await capture('removed');await count(3);await context.setOffline(false);check('capture works offline once loaded');
 await page.locator('#captureStart').click();await page.locator('#capture').waitFor({state:'visible'});
 await page.locator('#photo').setInputFiles({name:'huge.jpg',mimeType:'image/jpeg',buffer:Buffer.alloc(20*1024*1024+1)});
 await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('maximal 20 MiB'));
 assert.equal(await page.locator('#saveBtn').isDisabled(),true);check('oversize byte limit handled');
 await page.locator('#photo').setInputFiles({name:'bad.png',mimeType:'image/png',buffer:Buffer.from('not an image')});
 await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('nicht gelesen'));check('invalid image rejected');
 await page.locator('#photo').setInputFiles({name:'x.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});
 await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('Format'));check('SVG/unsupported format rejected');
 const tooManyPixels=await makePhoto(7000,7000);
 await page.locator('#photo').setInputFiles({name:'49mp.png',mimeType:'image/png',buffer:tooManyPixels});
 await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('48 Megapixel'));check('oversize pixel limit handled');
 // Simulate a storage engine quota abort, without using or filling real disk space.
 await page.locator('#photoFallback').setInputFiles({name:'ok.png',mimeType:'image/png',buffer:photo});
 await page.waitForFunction(()=>!document.querySelector('#saveBtn').disabled);
 await page.evaluate(()=>{
   const original=IDBDatabase.prototype.transaction;
   IDBDatabase.prototype.transaction=function(...args){const tx=original.apply(this,args);if(args[1]==='readwrite'){Object.defineProperty(tx,'error',{get:()=>new DOMException('quota','QuotaExceededError')});queueMicrotask(()=>tx.abort());}return tx;};
   window.restoreTransaction=()=>{IDBDatabase.prototype.transaction=original;};
 });
 await page.locator('#saveBtn').click();await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('Speicher voll'));
 assert.equal(await page.locator('#capture').isVisible(),true);assert.equal(await page.locator('#preview').isVisible(),true);assert.equal((await read()).count,3);
 await page.evaluate(()=>window.restoreTransaction());await page.locator('#saveBtn').click();await page.locator('#asset').waitFor({state:'visible'});await count(4);check('quota abort keeps input, rolls back atomically, retry succeeds');
 // Two tabs attempt to append from the same predecessor: exactly one must succeed.
 const result=await page.evaluate(async()=>{
   const m=await import('./ledger.js'),db=await m.openDB(),s=await m.readLedger(db,'GP-WALL-001'),e=s.evidence[0];
   const prepared=await m.prepareEvidence(e.original),head=s.entries.at(-1).hash;
   const results=await Promise.allSettled([m.appendCapture(db,'GP-WALL-001',prepared,'updated','A',head),m.appendCapture(db,'GP-WALL-001',prepared,'updated','B',head)]);
   const after=await m.readLedger(db,'GP-WALL-001');await m.verifyLedger(after,'GP-WALL-001');db.close();
   return {statuses:results.map(x=>x.status),count:after.entries.length};
 });
 assert.deepEqual(result.statuses.sort(),['fulfilled','rejected']);assert.equal(result.count,5);check('concurrent writers cannot fork chain or overwrite');
 await page.evaluate(()=>localStorage.setItem('gp_proofs','{BROKEN <img src=x onerror=alert(1)>'));
 await page.reload();await count(5);assert.equal(await page.locator('#legacy').isVisible(),true);assert.equal(await page.evaluate(()=>localStorage.getItem('gp_proofs')),'{BROKEN <img src=x onerror=alert(1)>');check('malformed legacy LocalStorage retained, no crash');
 // Tamper a confirmed field without updating its hash.
 await page.evaluate(async()=>{const m=await import('./ledger.js'),db=await m.openDB();await new Promise((resolve,reject)=>{const tx=db.transaction('entries','readwrite');const req=tx.objectStore('entries').get(['GP-WALL-001',1]);req.onsuccess=()=>{req.result.human.note='tampered';tx.objectStore('entries').put(req.result);};tx.oncomplete=resolve;tx.onabort=reject;});db.close();});
 await page.reload();await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('Integritätsprüfung fehlgeschlagen'));
 assert.equal(await page.locator('#captureStart').isDisabled(),true);assert.equal(await page.locator('#lastState').textContent(),'Nicht verfügbar – Prüfung fehlgeschlagen');check('tampered ledger fails closed');
 await open('GP-MAT-002');await count(1);check('corrupt identity does not block other identity');
 for(const query of ['?id=','?id=%3Cscript%3E','?id='+('A'.repeat(65)),'?id=A&id=B','?id=..%2Fx']){
   await page.goto(base+query);await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('Ungültige Physical ID'));
   assert.equal(await page.locator('#asset').isVisible(),false);
 }
 check('invalid, empty, duplicate and oversized URL IDs rejected');
 await open('MOBILE');
 assert.equal(await page.locator('#photo').getAttribute('capture'),'environment');assert.equal(await page.locator('#photoFallback').getAttribute('capture'),null);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);check('390px mobile layout and explicit picker fallback');
 const denied=await context.newPage();
 await denied.addInitScript(()=>{Object.defineProperty(window,'indexedDB',{get(){throw new DOMException('blocked','SecurityError');}});});
 await denied.goto(base+'?id=DENIED');await denied.waitForFunction(()=>document.querySelector('#message').textContent.includes('Browser erlaubt'));await denied.close();check('unavailable storage reported');
 assert.deepEqual(foreign,[]);assert.deepEqual(pageErrors,[]);check('no external requests or unhandled errors');
 if(process.env.GP_SCREENSHOT)await page.screenshot({path:process.env.GP_SCREENSHOT,fullPage:true});
 await browser.close();
}
(async()=>{for(const [name,type] of [['Chromium',chromium],['WebKit',webkit]])await testEngine(name,type);console.log('\n'+passed.length+' checks passed. Real iPhone camera/QR remains a manual acceptance test.');})().catch(e=>{console.error(e);process.exit(1);});
