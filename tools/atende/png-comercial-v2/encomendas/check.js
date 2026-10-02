const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1200}});
await p.goto('file://'+process.cwd()+'/AGF_resultado-encomendas.html');await p.evaluate(()=>document.fonts.ready);
console.log(await p.evaluate(()=>{const c=document.querySelector('.peca');
const over=[...c.querySelectorAll('*')].filter(e=>e.scrollWidth>e.clientWidth+1&&!(e instanceof SVGElement)).map(e=>e.className||e.id);
const wrap=[...c.querySelectorAll('.rot,.num,.nome,.val,.pct,.linhas span,.linhas b,.de,.leg span,.chip,.ident span')].filter(e=>{const r=e.getClientRects();return r.length>1}).map(e=>e.className+':'+e.textContent.slice(0,25));
return {h:c.scrollHeight,over,wrap}}));
await p.screenshot({path:'AGF_resultado-encomendas_LIMPO.png',clip:{x:0,y:0,width:1080,height:1080}});await b.close();})();
