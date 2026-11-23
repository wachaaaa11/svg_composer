// End-to-end test: drives the real UI in Chromium, downloads real exports into tests/out/
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const OUT=path.join(__dirname,'out');fs.mkdirSync(OUT,{recursive:true});
const URL=process.env.URL||'http://localhost:8765/index.html';
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
(async()=>{
 const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1500,height:900},acceptDownloads:true});const p=await ctx.newPage();
 const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
 await p.goto(URL);await p.waitForSelector('#libGrid .libitem');
 const exportTo=async name=>{const [d]=await Promise.all([p.waitForEvent('download'),p.click('#export')]);await d.saveAs(path.join(OUT,name));return fs.readFileSync(path.join(OUT,name),'utf8');};
 const st=()=>p.evaluate(()=>{const s=window.__app.editor.state;return {size:s.size,n:s.items.length,items:s.items.map(i=>({...i}))}});

 // ---- Workflow A
 await p.fill('#metaText','Teamwork is solving a puzzle together, with a good idea and a plan');
 await p.click('#compose');await p.waitForTimeout(600);
 let s=await st();ok(s.n>=3,'A: metaphor composes ≥3 objects ('+s.items.map(i=>i.object+':'+i.role).join(',')+')');
 ok(s.items.some(i=>i.object==='puzzle'),'A: puzzle selected for "solving a puzzle together"');
 ok(s.items.every(i=>i.x>0&&i.y>0&&i.x<1200&&i.y<630),'A: all objects inside canvas');
 await exportTo('A_lavender_S.svg');

 // ---- Workflow B (+ background)
 await p.click('#modeTabs [data-tab=names]');
 await p.fill('#namesText','наушники, lamp, 2x coin, notebuk, телефон, фон: открытая книга');
 await p.click('#compose');await p.waitForTimeout(600);
 s=await st();ok(s.items.filter(i=>i.object==='coin').length===2,'B: "2x coin" gives two coins');
 ok(s.items.some(i=>i.role==='background'&&i.object==='open_book'),'B: "фон: открытая книга" → background book');
 ok(await p.innerText('#report').then(t=>t.includes('Not found')===false),'B: typo "notebuk" resolved (wallet alias)');
 ok(s.items.some(i=>i.object==='wallet'),'B: wallet found via fuzzy match');

 // ---- palettes
 await p.click('#palettes .pal:nth-child(3)');await p.waitForTimeout(200);
 const aqua=await exportTo('B_aqua_S.svg');
 await p.click('#palettes .pal:nth-child(2)');await p.waitForTimeout(200);
 await exportTo('B_peach_S.svg');
 await p.setInputFiles('#palFile',path.join(__dirname,'..','examples','custom-palette.json'));await p.waitForTimeout(300);
 ok((await p.innerText('#palMsg')).includes('Sunset'),'palette: custom JSON upload accepted');
 await exportTo('B_custom_S.svg');
 await p.setInputFiles('#palFile',{name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"name":"x","background":["#fff"],"objects":[]}')});await p.waitForTimeout(300);
 ok((await p.innerText('#palMsg')).includes('Need at least 6'),'palette: invalid file rejected with message');

 // ---- S -> L
 await p.selectOption('#sizeMode','L');await p.waitForTimeout(800);
 s=await st();ok(s.size==='L','size: switched to L');
 ok((await p.innerText('#sizeBadge'))==='L','size: badge shows L');
 await exportTo('B_custom_L.svg');
 await p.selectOption('#sizeMode','auto');await p.waitForTimeout(500);
 s=await st();ok(s.size==='S','size: auto → S for 1200×630');
 await p.selectOption('#preset','1920x1080');await p.waitForTimeout(800);
 s=await st();ok(s.size==='L','size: auto → L for 1920×1080 output');
 await p.selectOption('#preset','1200x630');await p.waitForTimeout(500);

 // ---- manual editing
 const n0=(await st()).n;
 await p.click('#libTabs [data-role=main]');
 await p.click('#libGrid .libitem:nth-child(10)');await p.waitForTimeout(200); // pen
 s=await st();ok(s.n===n0+1,'edit: add from library');
 const added=s.items[s.items.length-1];
 // drag it
 const box=await p.evaluate(u=>{const e=document.querySelector(`.item[data-uid="${u}"]`).getBoundingClientRect();return {x:e.x+e.width/2,y:e.y+e.height/2}},added.uid);
 await p.mouse.move(box.x,box.y);await p.mouse.down();await p.mouse.move(box.x+120,box.y+60,{steps:6});await p.mouse.up();
 let a2=(await st()).items.find(i=>i.uid===added.uid);
 ok(Math.abs(a2.x-added.x)>50&&Math.abs(a2.y-added.y)>20,'edit: drag moves object');
 await p.fill('#pRot','30');await p.dispatchEvent('#pRot','change');
 a2=(await st()).items.find(i=>i.uid===added.uid);ok(Math.abs(a2.rot-30)<1e-6,'edit: rotate via panel');
 // rotate handle drag
 const hnd=await p.evaluate(()=>{const e=document.querySelector('[data-handle=rot]').getBoundingClientRect();return {x:e.x+e.width/2,y:e.y+e.height/2}});
 await p.mouse.move(hnd.x,hnd.y);await p.mouse.down();await p.mouse.move(hnd.x+60,hnd.y+10,{steps:5});await p.mouse.up();
 const a3=(await st()).items.find(i=>i.uid===added.uid);ok(Math.abs(a3.rot-30)>1,'edit: rotate handle drag changes rotation');
 // scale handle drag
 const sh=await p.evaluate(()=>{const e=document.querySelector('[data-handle=se]').getBoundingClientRect();return {x:e.x+e.width/2,y:e.y+e.height/2}});
 await p.mouse.move(sh.x,sh.y);await p.mouse.down();await p.mouse.move(sh.x+50,sh.y+30,{steps:5});await p.mouse.up();
 const a4=(await st()).items.find(i=>i.uid===added.uid);ok(a4.scale>a3.scale*1.05,'edit: scale handle enlarges uniformly');
 await p.click('#bDup');s=await st();ok(s.n===n0+2,'edit: duplicate');
 await p.keyboard.press('Control+z');s=await st();ok(s.n===n0+1,'edit: undo duplicate');
 await p.keyboard.press('Control+Shift+z');s=await st();ok(s.n===n0+2,'edit: redo');
 await p.click('#bBack');s=await st();ok(s.items[0].uid===s.items.find(i=>true).uid&&s.items.findIndex(i=>i.uid===(s.items.at(-1).uid))>=0,'edit: stacking command runs');
 const sel=await p.evaluate(()=>window.__app.editor.state.selected);s=await st();ok(s.items[0].uid===sel,'edit: "to back" puts selection at index 0');
 await p.click('#bFront');s=await st();ok(s.items.at(-1).uid===sel,'edit: "to front" puts selection on top');
 await p.click('#bDel');s=await st();ok(s.n===n0+1,'edit: delete');
 // add background object from library tab
 await p.click('#libTabs [data-role=background]');await p.click('#libGrid .libitem:nth-child(5)');
 s=await st();ok(s.items[0].role==='background'&&s.items[0].object==='headphones','edit: background object added at the bottom');
 const fin=await exportTo('final_edit_custom_S.svg');
 ok(errs.length===0,'no console/page errors '+errs.join('|'));
 console.log(fails?`\n${fails} FAILED`:'\nALL PASSED');
 await b.close();process.exit(fails?1:0);
})();
