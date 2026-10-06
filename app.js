import {CHANGES,idFromURL,validId,openDB,readLedger,verifyLedger,prepareEvidence,appendCapture,stateFor,friendlyError} from './ledger.js';
const $=id=>document.getElementById(id);
let db, physicalId=null, snapshot={entries:[],evidence:[]}, healthy=false;
let prepared=null, captureStarted=0, generation=0, refreshGeneration=0, saving=false, processing=false;
let previewURL=null, historyURLs=[];
const planKey=id=>'gp_plan_'+id;
const authorKey='gp_author_v1';
const profileKey='gp_profile_v1';
function getProfile(){try{return JSON.parse(localStorage.getItem(profileKey)||'null')}catch{return null}}
function setProfile(v){localStorage.setItem(profileKey,JSON.stringify(v))}
const draftKey=id=>'gp_draft_'+id;
function getDraft(){try{return JSON.parse(localStorage.getItem(draftKey(physicalId))||'null')}catch{return null}}
function setDraft(v){try{localStorage.setItem(draftKey(physicalId),JSON.stringify(v))}catch{}}
function clearDraft(){try{localStorage.removeItem(draftKey(physicalId))}catch{}}
function getAuthor(){try{return JSON.parse(localStorage.getItem(authorKey)||'null')}catch{return null}}
function setAuthor(v){localStorage.setItem(authorKey,JSON.stringify(v))}
function authorFrom(note=''){const m=note.match(/\[GPA:([^:\]]*)(?::([^\]]*))?\]/);return m?{name:decodeURIComponent(m[1]||''),company:decodeURIComponent(m[2]||'')}:null}
function getPlan(){try{return JSON.parse(localStorage.getItem(planKey(physicalId))||'null')}catch{return null}}
function setPlan(plan){localStorage.setItem(planKey(physicalId),JSON.stringify(plan))}
function quantityFrom(note=''){const m=note.match(/\[GPQ:([^:\]]+):([^\]]+)\]/);return m?{value:Number(m[1]),unit:m[2]}:null}
function stageFrom(note=''){return note.match(/\[GPS:(assess|count|build|yield)\]/)?.[1]||'assess'}
function cleanNote(note=''){return note.replace(/\s*\[GPQ:[^\]]+\]/,'').replace(/\s*\[GPS:[^\]]+\]/,'').replace(/\s*\[GPA:[^\]]+\]/,'').trim()}
const navigation=['navHome','navAsset','navHistory','cancelEintrag'];
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
  for(const name of navigation){const el=$(name);if(el)el.disabled=value || (name!=='navHome' && name!=='cancelEintrag' && !physicalId);}
  $('saveBtn').disabled=value || processing || !prepared || !healthy;
}
function clearCapture() {
  generation++;prepared=null;processing=false;
  if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;
  $('photo').value='';$('photoFallback').value='';$('note').value='';$('actualQty').value='';$('actualUnit').value='';$('actualQtyMirror').value='';$('actualUnitMirror').value='';$('materialType').value='';$('materialSuggestion').textContent='Noch nicht ausgewertet';$('countSuggestion').textContent='—';$('countHint').textContent='Nach dem Foto simuliert GroundProof automatisch Materialerkennung und Zählung.';$('stageType').value='assess';updateGuidance();
  $('preview').removeAttribute('src');$('preview').hidden=true;$('photoStatus').textContent='';$('saveBtn').disabled=true;
}
function revokeHistory() {for(const url of historyURLs)URL.revokeObjectURL(url);historyURLs=[];$('timeline').replaceChildren();}
function element(tag,text,className) {const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function formatTime(value) {return new Date(value).toLocaleString('de-CH');}
function render() {
  const last=snapshot.entries.at(-1);
  $('assetId').textContent=physicalId;$('historyId').textContent=physicalId;$('captureId').textContent=physicalId;
  $('lastState').textContent=healthy?(last?.human.state || 'Noch kein Zustand bestätigt'):'Nicht verfügbar – Prüfung fehlgeschlagen';
  $('lastNote').textContent=healthy?(cleanNote(last?.human.note || '')):'';
  $('lastTime').textContent=healthy && last?'Bestätigt laut Gerätezeit: '+formatTime(last.createdAt):'';
  $('captureCount').textContent=healthy?String(snapshot.entries.length):'—';
  $('lastChange').textContent=healthy && last?CHANGES[last.human.change]:'—';
  let plan=getPlan();if(!plan){plan={scope:'Neue Steckdose neben der Tür installieren',qty:'1',unit:'Stk.',owner:'Projektverantwortung',confirmedAt:'prototype'};setPlan(plan);}const stage=last?stageFrom(last.human.note):'assess',order=['assess','count','build','yield'];document.querySelectorAll('#phaseStrip span').forEach((el,i)=>el.classList.toggle('active',i<=order.indexOf(stage)));
  $('expectedSummary').textContent=plan?(plan.scope || (plan.qty?plan.qty+' '+plan.unit:'Erwartung festgehalten')):'Noch nicht erfasst';
  $('actualSummary').textContent=healthy && last?last.human.state:'Noch kein Eintrag';
  $('scopeInput').value=plan?.scope||'';$('plannedQty').value=plan?.qty||'';$('qtyUnit').value=plan?.unit||'';$('plannedQty').readOnly=true;$('qtyUnit').readOnly=true;
  const qs=snapshot.entries.map(e=>quantityFrom(e.human.note)).filter(Boolean), lastQ=qs.at(-1);
  $('comparison').hidden=!(plan||lastQ);$('plannedView').textContent=plan?.qty?plan.qty+' '+plan.unit:(plan?.scope||'—');$('documentedView').textContent=lastQ?lastQ.value+' '+lastQ.unit:(last?'Zustand erfasst':'—');
  $('outcome').hidden=!(plan?.qty&&lastQ);if(plan?.qty&&lastQ){const delta=lastQ.value-Number(plan.qty),u=lastQ.unit||plan.unit;$('outcomeText').textContent=`${lastQ.value} ${u} dokumentiert gegenüber ${plan.qty} ${plan.unit}. Abweichung: ${delta>0?'+':''}${Number(delta.toFixed(2))} ${u}.`;}
  const nextStage=last?({assess:'count',count:'build',build:'yield',yield:'yield'}[stage]||'assess'):'assess';
  const nextCopy={assess:['Ausgangslage festhalten','Dokumentiere zuerst die Situation vor Beginn der Arbeit.'],count:['Material / Bestand erfassen','Erfasse vorhandenes Material als zusätzlichen Schritt, bevor die Ausführung dokumentiert wird.'],build:['Ausführung dokumentieren','Halte fest, was tatsächlich ausgeführt wurde.'],yield:['Ergebnis festhalten','Dokumentiere den fertigen oder aktuellen Endstand.']}[nextStage];
  const draft=getDraft();$('nextStepTitle').textContent=draft?'Offenen Eintrag fortsetzen':nextCopy[0];$('nextStepText').textContent=draft?'Du hast diesen Schritt bereits begonnen. Deine Angaben bleiben erhalten.':nextCopy[1];
  $('captureStart').textContent=draft?'Offenen Eintrag fortsetzen →':(last?'Nächsten realen Schritt erfassen →':'Vor-Ort-Zustand dokumentieren →');
  const link=new URL(location.href);link.search='';link.hash='';link.searchParams.set('id',physicalId);
  $('identityLink').href=link.href;$('identityLink').textContent=link.href;
  $('captureStart').disabled=$('EintragAgain').disabled=!healthy;
  $('navAsset').disabled=$('navHistory').disabled=!physicalId;
  revokeHistory();
  $('integrity').textContent=healthy?(last?'Lokale Prüfung bestanden: Originaldateien, verkleinerte Ansichten und Hash-Kette stimmen überein. Keine externe Beglaubigung.':'Noch keine Ledger-Einträge vorhanden.'):'Lokale Prüfung fehlgeschlagen. Die History wird nicht als bestätigter Verlauf angezeigt.';
  if(!healthy)return;
  if(!last){$('timeline').append(element('li','Noch kein Eintrag. Fotografiere dieses Objekt und bestätige den ersten Zustand.','card'));return;}
  snapshot.entries.forEach((entry,i)=>{
    const item=element('li',undefined,'proof');
    item.append(element('time',`#${entry.sequence} · ${formatTime(entry.createdAt)} (Gerätezeit)`),element('h2',CHANGES[entry.human.change]),element('p','Bestätigter Zustand: '+entry.human.state,'state'));
    if(i)item.append(element('p','Vorher: '+snapshot.entries[i-1].human.state,'muted'));
    item.append(element('div',stageFrom(entry.human.note).toUpperCase(),'stage-badge'));const author=authorFrom(entry.human.note);if(author?.name)item.append(element('p','Dokumentiert von '+author.name+(author.company?' · '+author.company:''),'author-line'));const humanNote=cleanNote(entry.human.note);if(humanNote)item.append(element('p',humanNote,'state'));const q=quantityFrom(entry.human.note);if(q)item.append(element('p','Bestätigte Menge: '+q.value+' '+q.unit,'quantity'));
    const evidence=snapshot.evidence[i];
    const img=element('img',undefined,'preview');img.alt='Verkleinerte Ansicht · Eintrag '+entry.sequence;img.loading='lazy';
    const preview=URL.createObjectURL(evidence.preview);historyURLs.push(preview);img.src=preview;item.append(img);
    const original=URL.createObjectURL(evidence.original);historyURLs.push(original);
    const download=element('a','Datei herunterladen','download');download.href=original;download.download=`${physicalId}-${entry.sequence}.${({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[entry.originalEvidence.mime]}`;
    item.append(download,element('small',`Original unverändert gespeichert · ${(entry.originalEvidence.bytes/1024/1024).toFixed(2)} MiB`));
    const details=element('details');details.append(element('summary','Technische Nachweisdetails'));
    for(const [label,value] of [['Original SHA-256',entry.originalEvidence.sha256],['Verkleinerte Ansicht SHA-256',entry.derived.previewSha256],['Ledger SHA-256',entry.hash],['Vorheriger Ledger-Hash',entry.previousHash]])details.append(element('div',label,'muted'),element('div',value,'hash'));
    item.append(details);$('timeline').append(item);
  });
}
async function refresh() {
  const ticket=++refreshGeneration;
  healthy=false;$('captureStart').disabled=$('EintragAgain').disabled=true;
  try {
    if(!db)throw new Error('Lokaler Speicher nicht bereit. Bitte Seite neu laden.');
    const loaded=await readLedger(db,physicalId);await verifyLedger(loaded,physicalId);
    if(ticket!==refreshGeneration)return;
    snapshot=loaded;healthy=true;
  } catch(e) {if(ticket!==refreshGeneration)return;snapshot={entries:[],evidence:[]};message(friendlyError(e),'error');}
  render();
}
function confirmation() {$('confirmation').textContent=prepared?'Foto bereit. Optional weitere Angaben ergänzen oder direkt speichern.':'Nimm zuerst ein Foto auf.';}
async function startCapture() {
  if(saving)return;
  captureStarted=performance.now();clearCapture();message();
  await refresh();if(!healthy)return;
  const last=snapshot.entries.at(-1), order=['assess','count','build','yield'],draft=getDraft();
  if(draft){$('stageType').value=draft.stage||'assess';$('materialType').value=draft.material||'';$('actualQty').value=draft.qty||'';$('actualUnit').value=draft.unit||'';$('note').value=draft.note||'';}
  else if(last){const i=order.indexOf(stageFrom(last.human.note));$('stageType').value=order[Math.min(i+1,3)];}else $('stageType').value='assess';
  updateGuidance();confirmation();show('capture');
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
    $('photoStatus').textContent='Foto bereit ✓';if($('stageType').value==='count')simulateVision();confirmation();
  } catch(e) {if(ticket===generation){$('photoStatus').textContent='Kein Foto bereit.';message(friendlyError(e),'error');}}
  finally {if(ticket===generation){processing=false;$('saveBtn').disabled=!prepared || !healthy || saving;}}
}
async function saveProof() {
  if(saving || processing || !prepared || !healthy)return;
  busy(true);message('Eintrag wird gespeichert …');
  try {
    const q=$('actualQty').value.trim(),u=$('actualUnit').value.trim();if($('stageType').value==='count'&&(!q||!u))throw new Error('Bitte Menge und Einheit für den Bestand angeben.');let note=$('note').value.trim();if(q){if(!u)throw new Error('Bitte eine Einheit zur Menge angeben.');note+=(note?' ':'')+`[GPQ:${q}:${u}]`;}note+=(note?' ':'')+`[GPS:${$('stageType').value}]`;const authorName=$('authorName').value.trim(),authorCompany=$('authorCompany').value.trim();if(!authorName||!authorCompany)throw new Error('Dein Profil ist unvollständig. Bitte GroundProof neu öffnen und Profil vervollständigen.');setAuthor({name:authorName,company:authorCompany});note+=(note?' ':'')+`[GPA:${encodeURIComponent(authorName)}:${encodeURIComponent(authorCompany)}]`;
    const entry=await appendCapture(db,physicalId,prepared,$('eventType').value,note,snapshot.entries.at(-1)?.hash || 'GENESIS');clearDraft();
    // End timer only after the atomic IndexedDB transaction has committed.
    const seconds=(performance.now()-captureStarted)/1000;
    clearCapture();await refresh();show('asset');
    if(healthy)message(`Eintrag gespeichert · ${seconds.toFixed(1)} Sekunden. ${seconds<10?'Schneller Ablauf ✓':'Für den Schnellablauf noch zu langsam.'}`,'success');
    else message('Eintrag wurde gespeichert, aber die anschliessende Prüfung ist fehlgeschlagen. Bitte Seite neu laden.','error');
  } catch(e) {message(friendlyError(e),'error');}
  finally {busy(false);}
}
const EVENT_BY_STAGE={
  assess:{label:'Wie ist die Ausgangslage?',help:'Nur auswählen, wenn etwas Besonderes festgehalten werden soll.',options:[['updated','Ausgangslage festhalten'],['problem','Abweichung / Problem entdeckt']]},
  count:{label:'Was passiert mit dem Material?',help:'Damit Bestand und spätere Verwendung nachvollziehbar bleiben.',options:[['updated','Bestand gezählt'],['added','Material angekommen / hinzugefügt'],['removed','Material verwendet / entnommen'],['problem','Abweichung / Problem entdeckt']]},
  build:{label:'Wie ist der Stand der Arbeit?',help:'Wähle den tatsächlichen Arbeitsstand.',options:[['installed','Arbeit ausgeführt'],['updated','Zwischenstand festhalten'],['problem','Abweichung / Problem entdeckt']]},
  yield:{label:'Wie ist das Ergebnis?',help:'Der Abschluss bleibt mit dem vorherigen Zustand verbunden.',options:[['installed','Arbeit fertig'],['updated','Teilweise fertig / Zwischenstand'],['problem','Mangel / Abweichung entdeckt']]}
};
function updateGuidance(){
  const stage=$('stageType').value,isCount=stage==='count';
  $('countPrompt').hidden=!isCount;$('optionalQty').hidden=isCount;
  $('actualQty').required=isCount;$('actualUnit').required=isCount;
  const cfg=EVENT_BY_STAGE[stage], select=$('eventType'), previous=select.value;
  $('eventLabel').textContent=cfg.label;$('eventHelp').textContent=cfg.help;select.replaceChildren();
  for(const [value,label] of cfg.options){const option=element('option',label);option.value=value;select.append(option);}
  if(cfg.options.some(([v])=>v===previous))select.value=previous;
}
function persistDraft(){if(!physicalId)return;setDraft({stage:$('stageType').value,material:$('materialType').value,qty:$('actualQty').value,unit:$('actualUnit').value,note:$('note').value});}
$('stageType').addEventListener('change',()=>{updateGuidance();persistDraft();confirmation();});
for(const id of ['materialType','actualQty','actualUnit','note'])$(id).addEventListener('input',persistDraft);
$('eventType').addEventListener('change',confirmation);
$('actualQtyMirror').addEventListener('input',()=>{$('actualQty').value=$('actualQtyMirror').value;});
$('actualUnitMirror').addEventListener('input',()=>{$('actualUnit').value=$('actualUnitMirror').value;});
function simulateVision(){
  const material='Rohre',n=18;$('materialType').value=material;$('materialSuggestion').textContent=material;
  $('countSuggestion').textContent=`≈ ${n} Stück`;$('countHint').textContent='Simulierter KI-Vorschlag aus dem Foto – bitte prüfen.';
  $('actualQty').value=String(n);$('actualUnit').value='Stk.';persistDraft();
}
$('simulateCount').addEventListener('click',()=>{if(!prepared){message('Nimm zuerst ein Foto auf.','error');return;}simulateVision();message('Foto-Auswertung simuliert. Bitte Erkennung und Menge prüfen.','success');});
$('photo').addEventListener('change',choosePhoto);$('photoFallback').addEventListener('change',choosePhoto);
$('saveBtn').addEventListener('click',saveProof);
$('savePlan').addEventListener('click',()=>{});
for(const id of ['captureStart','EintragAgain','continueTask'])$(id).addEventListener('click',startCapture);
for(const id of ['navAsset','backAsset','cancelEintrag'])$(id).addEventListener('click',async()=>{if(saving || !physicalId)return;clearCapture();message();show('asset');await refresh();});
for(const id of ['navHistory','historyOpen'])$(id).addEventListener('click',async()=>{if(saving || !physicalId)return;clearCapture();message();show('history');await refresh();});
$('navHome').addEventListener('click',()=>{if(saving)return;clearCapture();show('home');});
$('identityForm').addEventListener('submit',async event=>{
  event.preventDefault();const id=$('identityInput').value.trim();
  if(!validId(id)){message('Ungültige ID. Bitte nur Buchstaben, Zahlen, _ oder - verwenden.','error');return;}
  physicalId=id;
  const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('id',id);
  history.replaceState(null,'',url.href);
  message();show('asset');
  try { await refresh(); } catch(e) { message(friendlyError(e),'error'); }
});
$('registerForm').addEventListener('submit',event=>{
  event.preventDefault();
  const name=$('registerName').value.trim(),company=$('registerCompany').value.trim(),role=$('registerRole').value.trim();
  if(!name||!company||!role||!$('registerConfirm').checked){message('Bitte alle Pflichtfelder ausfüllen und bestätigen.','error');return;}
  setProfile({name,company,role,createdAt:new Date().toISOString()});setAuthor({name,company});
  $('authorName').value=name;$('authorCompany').value=company;$('authorDisplay').textContent=`Dokumentiert von ${name} · ${company}`;
  message('Profil eingerichtet. Du kannst GroundProof jetzt verwenden.','success');show(physicalId?'asset':'home');
});
async function init() {
  // Preserve old gp_proofs verbatim. Never parse, trust, or silently migrate old test records.
  try {if(localStorage.getItem('gp_proofs')!==null){$('legacy').textContent='Alte V0.1-Testdaten vorhanden. Sie bleiben unverändert in gp_proofs und werden nicht in diesen neuen Ledger übernommen: separate Original-Hashes fehlen. Details zur Sicherung stehen in der README.';$('legacy').hidden=false;}}
  catch {$('legacy').textContent='LocalStorage ist gesperrt. Der neue Ledger verwendet IndexedDB; alte Testdaten konnten nicht geprüft werden.';$('legacy').hidden=false;}
  try {
    physicalId=idFromURL(location.href);
    if(!globalThis.crypto?.subtle)throw new Error('Bitte diese App über HTTPS oder localhost öffnen. Sicheres Hashing ist hier nicht verfügbar.');
    db=await openDB();
    const profile=getProfile();
    if(profile){$('authorName').value=profile.name||'';$('authorCompany').value=profile.company||'';$('authorDisplay').textContent=`Dokumentiert von ${profile.name} · ${profile.company}`;}
    if(!profile){show('register');}
    else if(physicalId){$('identityInput').value=physicalId;show('asset');await refresh();}
    else show('home');
  } catch(e) {message(friendlyError(e),'error');}
}
window.addEventListener('pagehide',()=>{generation++;refreshGeneration++;if(previewURL)URL.revokeObjectURL(previewURL);revokeHistory();});
window.addEventListener('pageshow',async e=>{
  if(!e.persisted)return;
  try{db=await openDB();if(physicalId)await refresh();message();}
  catch(err){message(friendlyError(err),'error');}
});
init();
