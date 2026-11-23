// Generates the example compositions by driving the real app and using its real "Export SVG" button.
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const OUT=path.join(__dirname,'..','examples');
const URL=process.env.URL||'http://localhost:8765/index.html';
const EX=[
 {file:'example1-learning-aqua-S',mode:'meta',text:'Learning is a journey: books, a good idea and a plan',layout:'assembled',pal:3,size:'S',shuffles:0},
 {file:'example2-listening-peach-L',mode:'names',text:'headphones, smartphone, desk lamp, pen, фон: наушники',layout:'offset',pal:2,size:'L',shuffles:1},
 {file:'example3-secure-payments-lavender-S',mode:'meta',text:'Secure payments in a mobile app',layout:'headline',pal:1,size:'S',shuffles:0},
];
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1500,height:900},acceptDownloads:true});const p=await ctx.newPage();
await p.goto(URL);await p.waitForSelector('#libGrid .libitem');
for(const e of EX){
 await p.click(`#modeTabs [data-tab=${e.mode}]`);await p.selectOption('#layoutMode',e.layout);await p.selectOption('#sizeMode',e.size);
 await p.click(`#palettes .pal:nth-child(${e.pal})`);
 await p.fill(e.mode==='meta'?'#metaText':'#namesText',e.text);await p.click('#compose');await p.waitForTimeout(700);
 for(let i=0;i<e.shuffles;i++){await p.click('#shuffle');await p.waitForTimeout(250);}
 const [d]=await Promise.all([p.waitForEvent('download'),p.click('#export')]);await d.saveAs(path.join(OUT,e.file+'.svg'));
}
await b.close()})();
