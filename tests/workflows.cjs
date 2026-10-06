const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.GP_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'?id=Musterprojekt-Wand-A');
 await page.waitForTimeout(500);if(errors.length)throw new Error('PAGEERROR '+errors.join(' | '));
 await page.locator('#register').waitFor({state:'visible',timeout:5000});
 assert.equal(await page.locator('#asset').isVisible(),false);
 await page.locator('#registerName').fill('Test Person');
 await page.locator('#registerCompany').fill('Test Firma');
 await page.locator('#registerRole').fill('Elektro');
 await page.locator('#registerConfirm').check();
 await page.locator('#registerForm button[type=submit]').click();
 await page.locator('#asset').waitFor({state:'visible'});
 assert.match(await page.locator('#scopeInput').inputValue(),/Steckdose/);
 console.log('PASS Registrierung -> zugewiesener Arbeitsbereich');

 await page.locator('#navHome').click();
 await page.locator('#home').waitFor({state:'visible'});
 await page.locator('#identityInput').fill('Musterprojekt-Wand-A');
 await page.locator('#identityForm button[type=submit]').click();
 await page.locator('#asset').waitFor({state:'visible'});
 console.log('PASS Projekt öffnen');

 await page.locator('#assignmentPhoto').click();
 await page.locator('#capture').waitFor({state:'visible'});
 assert.equal(await page.locator('#stageType').inputValue(),'count');
 assert.equal(await page.locator('#stageChooser').isHidden(),true);
 assert.equal(await page.locator('#saveBtn').isHidden(),true);
 assert.equal(await page.locator('#countConfirm').isVisible(),true);
 const photo=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=80;const g=c.getContext('2d');g.fillRect(0,0,80,80);return c.toDataURL('image/png').split(',')[1];}),'base64');
 await page.locator('#photo').setInputFiles({name:'material.png',mimeType:'image/png',buffer:photo});
 await page.waitForFunction(()=>document.querySelector('#actualQty').value==='18');
 assert.match(await page.locator('#materialSuggestion').textContent(),/Rohre/);
 await page.locator('#countConfirm').click();
 await page.waitForTimeout(500);if(errors.length)throw new Error('COUNT PAGEERROR '+errors.join(' | '));
 await page.locator('#asset').waitFor({state:'visible',timeout:5000});
 assert.match(await page.locator('#documentedView').textContent(),/18/);
 await page.reload();await page.locator('#asset').waitFor({state:'visible'});assert.match(await page.locator('#documentedView').textContent(),/18/);
 console.log('PASS Menge per Foto -> Simulation -> Bestätigung -> strukturiertes Ergebnis bleibt, Foto verworfen');

 await page.locator('#continueTask').click();
 await page.locator('#capture').waitFor({state:'visible'});
 assert.equal(await page.locator('#stageType').inputValue(),'assess');
 await page.locator('#photo').setInputFiles({name:'baseline.png',mimeType:'image/png',buffer:photo});
 await page.waitForFunction(()=>!document.querySelector('#saveBtn').disabled);
 await page.locator('#saveBtn').click();
 await page.locator('#asset').waitFor({state:'visible'});
 assert.equal(await page.locator('#captureCount').textContent(),'1');assert.match(await page.locator('#nextStepTitle').textContent(),/Ausführung/);
 console.log('PASS Ausgangslage dokumentieren -> speichern -> Materialzählung wird nicht erzwungen');

 await page.locator('#historyOpen').click();
 await page.locator('#history').waitFor({state:'visible'});
 assert.equal(await page.locator('#timeline > li.proof').count(),1);
 console.log('PASS Verlauf öffnen');

 await page.locator('#backAsset').click();await page.locator('#asset').waitFor({state:'visible'});
 await page.locator('#continueTask').click();await page.locator('#capture').waitFor({state:'visible'});
 assert.equal(await page.locator('#stageType').inputValue(),'build');
 await page.locator('#photo').setInputFiles({name:'work.png',mimeType:'image/png',buffer:photo});
 await page.waitForFunction(()=>!document.querySelector('#saveBtn').disabled);await page.locator('#saveBtn').click();await page.locator('#asset').waitFor({state:'visible'});
 assert.match(await page.locator('#nextStepTitle').textContent(),/Ergebnis/);
 console.log('PASS Ausführung dokumentieren -> Ergebnis wird nächster Schritt');

 await page.locator('#continueTask').click();await page.locator('#capture').waitFor({state:'visible'});
 assert.equal(await page.locator('#stageType').inputValue(),'yield');
 await page.locator('#photo').setInputFiles({name:'result.png',mimeType:'image/png',buffer:photo});
 await page.waitForFunction(()=>!document.querySelector('#saveBtn').disabled);await page.locator('#saveBtn').click();await page.locator('#asset').waitFor({state:'visible'});
 await page.locator('#historyOpen').click();await page.locator('#history').waitFor({state:'visible'});
 assert.equal(await page.locator('#timeline > li.proof').count(),3);
 const timeline=await page.locator('#timeline').textContent();assert.match(timeline,/Ausgangslage/);assert.match(timeline,/Ausführung/);assert.match(timeline,/Ergebnis/);
 console.log('PASS Ergebnis dokumentieren -> vollständiger deutscher Verlauf');

 assert.deepEqual(errors,[]);
 console.log('WORKFLOW QA PASS');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
