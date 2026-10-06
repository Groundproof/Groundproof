import {CHANGES,idFromURL,validId,openDB,readLedger,verifyLedger,prepareEvidence,appendCapture,stateFor,friendlyError} from './ledger.js';
const $=id=>document.getElementById(id);
let db, physicalId=null, snapshot={entries:[],evidence:[]}, healthy=false;
let prepared=null, captureStarted=0, generation=0, refreshGeneration=0, saving=false, processing=false;
let previewURL=null, historyURLs=[];
const planKey=id=>'gp_plan_'+id;
function getPlan(){try{return JSON.parse(localStorage.getItem(planKey(physicalId))||'null')}catch{return null}}
function setPlan(plan){localStorage.setItem(planKey(physicalId),JSON.stringify(plan))}
function quantityFrom(note=''){const m=note.match(/\[GPQ:([^:\]]+):([^\]]+)\]/);return m?{value:Number(m[1]),unit:m[2]}:null}
function stageFrom(note=''){return note.match(/\[GPS:(assess|count|build|yield)\]/)?.[1]||'assess'}
function cleanNote(note=''){return note.replace(/\s*\[GPQ:[^\]]+\]/,'').replace(/\s*\[GPS:[^\]]+\]/,'').trim()}
const navigation=['navHome','navAsset','navHistory','cancelCapture'];
function message(text='',kind='') { $('message').textContent=text;$('message').className='notice '+kind;$('message').hidden=!text; }
function show(id) {
  for(const s of document.querySelectorAll('main section'))s.hidden=s.id!==id;
  for(const [nav,section] of [['navHome','home'],['navAsset','asset'],['navHistory','history']]) {
    if(id===section)$(nav).setAttribute('aria-current','page');else $(nav).removeAttribute('aria-current');
  }
  window.scrollTo(0,0);
}
function busy(value) {
  saving=value;$('captureFields').disabled=value;
  for(const name of navigation)$(name).disabled=value || (name!=='navHome' && name!=='cancelCapture' && !physicalId);
  $('saveBtn').disabled=value || processing || !prepared || !healthy;
}
function clearCapture() {
  generation++;prepared=null;processing=false;
  if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;
  $('photo').value='';$('photoFallback').value='';$('note').value='';$('actualQty').value='';$('actualUnit').value='';$('eventType').value='updated';$('stageType').value='assess';
  $('preview').removeAttribute('src');$('preview').hidden=true;$('photoStatus').textContent='';$('saveBtn').disabled=true;
}
function revokeHistory() {for(const url of historyURLs)URL.revokeObjectURL(url);historyURLs=[];$('timeline').replaceChildren();}
function element(tag,text,className) {const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function formatTime(value) {return new Date(value).toLocaleString('de-CH');}
function render() {
  const last=snapshot.entries.at(-1);
  $('assetId').textContent=physicalId;$('historyId').textContent=physicalId;$('captureId').textContent=physicalId;
  $('lastState').textContent=healthy?(last?.human.state || 'Noch kein Zustand bestätigt'):'Nicht verfügbar – Prüfung fehlgeschlagen';
  $('lastNote').textContent=healthy?(last?.human.note || ''):'';
  $('lastTime').textContent=healthy && last?'Bestätigt laut Gerätezeit: '+formatTime(last.createdAt):'';
  $('captureCount').textContent=healthy?String(snapshot.entries.length):'—';
  $('lastChange').textContent=healthy && last?CHANGES[last.human.change]:'—';
  const plan=getPlan(),stage=last?stageFrom(last.human.note):'assess',order=['assess','count','build','yield'],labels=['Assess','Count','Build','Yield'];document.querySelectorAll('#phaseStrip span').forEach((el,i)=>el.classList.toggle('active',i<=order.indexOf(stage)));
  $('expectedSummary').textContent=plan?(plan.scope || (plan.qty?plan.qty+' '+plan.unit:'Erwartung festgehalten')):'Noch nicht erfasst';
  $('actualSummary').textContent=healthy && last?last.human.state:'Noch kein Capture';
  $('scopeInput').value=plan?.scope||'';$('plannedQty').value=plan?.qty||'';$('qtyUnit').value=plan?.unit||'';
  const qs=snapshot.entries.map(e=>quantityFrom(e.human.note)).filter(Boolean), lastQ=qs.at(-1);
  $('comparison').hidden=!(plan||lastQ);$('plannedView').textContent=plan?.qty?plan.qty+' '+plan.unit:(plan?.scope||'—');$('documentedView').textContent=lastQ?lastQ.value+' '+lastQ.unit:(last?'Zustand erfasst':'—');
  $('outcome').hidden=!(plan?.qty&&lastQ);if(plan?.qty&&lastQ){const delta=lastQ.value-Number(plan.qty),u=lastQ.unit||plan.unit;$('outcomeText').textContent=`${lastQ.value} ${u} dokumentiert gegenüber ${plan.qty} ${plan.unit}. Abweichung: ${delta>0?'+':''}${Number(delta.toFixed(2))} ${u}.`;}
  $('captureStart').textContent=last?'Nächsten realen Schritt erfassen →':'Ausgangslage erfassen →';
  const link=new URL(location.href);link.search='';link.hash='';link.searchParams.set('id',physicalId);
  $('identityLink').href=link.href;$('identityLink').textContent=link.href;
  $('captureStart').disabled=$('captureAgain').disabled=!healthy;
  $('navAsset').disabled=$('navHistory').disabled=!physicalId;
  revokeHistory();
  $('integrity').textContent=healthy?(last?'Lokale Prüfung bestanden: Originaldateien, verkleinerte Ansichten und Hash-Kette stimmen überein. Keine externe Beglaubigung.':'Noch keine Ledger-Einträge vorhanden.'):'Lokale Prüfung fehlgeschlagen. Die History wird nicht als bestätigter Verlauf angezeigt.';
  if(!healthy)return;
  if(!last){$('timeline').append(element('li','Noch kein Capture. Fotografiere dieses Objekt und bestätige den ersten Zustand.','card'));return;}
  snapshot.entries.forEach((entry,i)=>{
    const item=element('li',undefined,'proof');
    item.append(element('time',`#${entry.sequence} · ${formatTime(entry.createdAt)} (Gerätezeit)`),element('h2',CHANGES[entry.human.change]),element('p','Bestätigter Zustand: '+entry.human.state,'state'));
    if(i)item.append(element('p','Vorher: '+snapshot.entries[i-1].human.state,'muted'));
    item.append(element('div',stageFrom(entry.human.note).toUpperCase(),'stage-badge'));const humanNote=cleanNote(entry.human.note);if(humanNote)item.append(element('p',humanNote,'state'));const q=quantityFrom(entry.human.note);if(q)item.append(element('p','Bestätigte Menge: '+q.value+' '+q.unit,'quantity'));
    const evidence=snapshot.evidence[i];
    const img=element('img',undefined,'preview');img.alt='Verkleinerte Ansicht · Capture '+entry.sequence;img.loading='lazy';
    const preview=URL.createObjectURL(evidence.preview);historyURLs.push(preview);img.src=preview;item.append(img);
    const original=URL.createObjectURL(evidence.original);historyURLs.push(original);
    const download=element('a','Original Evidence öffnen / herunterladen','download');download.href=original;download.download=`${physicalId}-${entry.sequence}.${({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[entry.originalEvidence.mime]}`;
    item.append(download,element('small',`Original unverändert gespeichert · ${(entry.originalEvidence.bytes/1024/1024).toFixed(2)} MiB`));
    const details=element('details');details.append(element('summary','Integrity / Provenance · Hashes'));
    for(const [label,value] of [['Original SHA-256',entry.originalEvidence.sha256],['Verkleinerte Ansicht SHA-256',entry.derived.previewSha256],['Ledger SHA-256',entry.hash],['Vorheriger Ledger-Hash',entry.previousHash]])details.append(element('div',label,'muted'),element('div',value,'hash'));
    item.append(details);$('timeline').append(item);
  });
}
async function refresh() {
  const ticket=++refreshGeneration;
  healthy=false;$('captureStart').disabled=$('captureAgain').disabled=true;
  try {
    if(!db)throw new Error('Lokaler Speicher nicht bereit. Bitte Seite neu laden.');
    const loaded=await readLedger(db,physicalId);await verifyLedger(loaded,physicalId);
    if(ticket!==refreshGeneration)return;
    snapshot=loaded;healthy=true;
  } catch(e) {if(ticket!==refreshGeneration)return;snapshot={entries:[],evidence:[]};message(friendlyError(e),'error');}
  render();
}
function confirmation() {
  $('confirmation').textContent='Mit Speichern bestätigst du für '+physicalId+': '+stateFor($('eventType').value,snapshot.entries.at(-1))+'. Foto und optionale Notiz werden diesem Capture zugeordnet.';
}
async function startCapture() {
  if(saving)return;
  captureStarted=performance.now();clearCapture();message();
  await refresh();if(!healthy)return;
  confirmation();show('capture');
}
async function choosePhoto(event) {
  const file=event.target.files?.[0];
  // Cancelling the OS picker preserves an already selected preview.
  if(!file)return;
  const ticket=++generation;prepared=null;processing=true;$('saveBtn').disabled=true;
  if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;$('preview').hidden=true;
  message();$('photoStatus').textContent='Foto lokal prüfen und verkleinern …';
  try {
    const result=await prepareEvidence(file);
    if(ticket!==generation)return;
    prepared=result;previewURL=URL.createObjectURL(result.preview);$('preview').src=previewURL;$('preview').hidden=false;
    $('photoStatus').textContent=`Foto bereit · Ansicht ${Math.round(result.preview.size/1024)} KiB · Original separat erhalten.`;
  } catch(e) {if(ticket===generation){$('photoStatus').textContent='Kein Foto bereit.';message(friendlyError(e),'error');}}
  finally {if(ticket===generation){processing=false;$('saveBtn').disabled=!prepared || !healthy || saving;}}
}
async function saveProof() {
  if(saving || processing || !prepared || !healthy)return;
  busy(true);message('Proof wird lokal gespeichert …');
  try {
    const q=$('actualQty').value.trim(),u=$('actualUnit').value.trim();let note=$('note').value.trim();if(q){if(!u)throw new Error('Bitte eine Einheit zur Menge angeben.');note+=(note?' ':'')+`[GPQ:${q}:${u}]`;}note+=(note?' ':'')+`[GPS:${$('stageType').value}]`;
    const entry=await appendCapture(db,physicalId,prepared,$('eventType').value,note,snapshot.entries.at(-1)?.hash || 'GENESIS');
    // End timer only after the atomic IndexedDB transaction has committed.
    const seconds=(performance.now()-captureStarted)/1000;
    clearCapture();await refresh();show('asset');
    if(healthy)message(`Capture #${entry.sequence} gespeichert · ${seconds.toFixed(1)} Sekunden vom Öffnen bis zur Speicherung. ${seconds<10?'Unter dem 10-Sekunden-Ziel.':'Über dem 10-Sekunden-Ziel.'}`,'success');
    else message('Capture wurde gespeichert, aber die anschliessende Prüfung ist fehlgeschlagen. Bitte Seite neu laden.','error');
  } catch(e) {message(friendlyError(e),'error');}
  finally {busy(false);}
}
for(const [value,label] of Object.entries(CHANGES)) {const option=element('option',label);option.value=value;$('eventType').append(option);}
$('eventType').addEventListener('change',confirmation);
$('photo').addEventListener('change',choosePhoto);$('photoFallback').addEventListener('change',choosePhoto);
$('saveBtn').addEventListener('click',saveProof);
$('savePlan').addEventListener('click',()=>{const scope=$('scopeInput').value.trim(),qty=$('plannedQty').value.trim(),unit=$('qtyUnit').value.trim();if(!scope&&!qty){message('Beschreibe den erwarteten Umfang oder gib eine geplante Menge an.','error');return}if(qty&&!unit){message('Bitte eine Einheit zur geplanten Menge angeben.','error');return}setPlan({scope,qty,unit,confirmedAt:new Date().toISOString()});message('Erwartung für diesen Testfall festgehalten.','success');render();});
for(const id of ['captureStart','captureAgain'])$(id).addEventListener('click',startCapture);
for(const id of ['navAsset','backAsset','cancelCapture'])$(id).addEventListener('click',async()=>{if(saving || !physicalId)return;clearCapture();message();show('asset');await refresh();});
for(const id of ['navHistory','historyOpen'])$(id).addEventListener('click',async()=>{if(saving || !physicalId)return;clearCapture();message();show('history');await refresh();});
$('navHome').addEventListener('click',()=>{if(saving)return;clearCapture();show('home');});
$('identityForm').addEventListener('submit',event=>{
  event.preventDefault();const id=$('identityInput').value.trim();
  if(!validId(id)){message('Ungültige Physical ID.','error');return;}
  const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('id',id);location.assign(url.href);
});
async function init() {
  // Preserve old gp_proofs verbatim. Never parse, trust, or silently migrate old test records.
  try {if(localStorage.getItem('gp_proofs')!==null){$('legacy').textContent='Alte V0.1-Testdaten vorhanden. Sie bleiben unverändert in gp_proofs und werden nicht in diesen neuen Ledger übernommen: separate Original-Hashes fehlen. Details zur Sicherung stehen in der README.';$('legacy').hidden=false;}}
  catch {$('legacy').textContent='LocalStorage ist gesperrt. Der neue Ledger verwendet IndexedDB; alte Testdaten konnten nicht geprüft werden.';$('legacy').hidden=false;}
  try {
    physicalId=idFromURL(location.href);
    if(!globalThis.crypto?.subtle)throw new Error('Bitte diese App über HTTPS oder localhost öffnen. Sicheres Hashing ist hier nicht verfügbar.');
    db=await openDB();
    if(physicalId){$('identityInput').value=physicalId;show('asset');await refresh();}
  } catch(e) {message(friendlyError(e),'error');}
}
window.addEventListener('pagehide',()=>{generation++;refreshGeneration++;if(previewURL)URL.revokeObjectURL(previewURL);revokeHistory();db?.close();});
window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
init();
