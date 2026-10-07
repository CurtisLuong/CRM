/* Run with Playwright available via NODE_PATH; uses only a private fake origin. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='crm-audit.local')return route.abort();if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')});const file=path.join(root,url.pathname);return fs.existsSync(file)?route.fulfill({path:file}):route.fulfill({status:404,body:''});});
 await page.goto('http://crm-audit.local/',{waitUntil:'load'});
 await page.evaluate(()=>{window.APP_CONFIG={SUPABASE_URL:'http://crm-audit.local/',SUPABASE_ANON_KEY:'fake'};window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}})};});
 for(const file of ['paged-fetch','search','lunar','db','notifications','catalog','app','search-ui','catalog-ui','loan/loan-engine','property-search','catalog-search-ui'])await page.addScriptTag({content:fs.readFileSync(path.join(root,'js',file+'.js'),'utf8')});
 await page.evaluate(()=>document.dispatchEvent(new Event('DOMContentLoaded')));
 await page.waitForTimeout(30);
 const storage=await page.evaluate(async()=>{
  window.__server={customers:[]};window.__requests=0;window.__failPage=0;window.__hook=null;
  window.__client={from:(table)=>{let cursor='',mode='select',payload;const q={select:()=>q,order:()=>q,limit:()=>q,gt:(_,v)=>{cursor=v;return q;},eq:()=>q,upsert:p=>{mode='upsert';payload=p;return q;},update:p=>{mode='update';payload=p;return q;},delete:()=>{mode='delete';return q;},then:async(resolve,reject)=>{try{
   if(mode!=='select')return resolve({data:payload,error:null});
   window.__requests++;if(window.__hook){const fn=window.__hook;window.__hook=null;await fn();}
   const rows=(window.__server[table]||[]).filter(r=>!cursor||r.id>cursor).sort((a,b)=>a.id.localeCompare(b.id));
   return resolve({data:rows.slice(0,137),count:rows.length,error:window.__requests===window.__failPage?new Error('fake page failure'):null});
  }catch(e){return reject(e);}}};return q;}};
  CRM.isOnline=()=>false;
  const legacy=await openNamedDB(DB_NAME);await new Promise((resolve,reject)=>{const t=legacy.transaction(['customers','queue'],'readwrite');t.objectStore('customers').put({id:'legacy-a',owner_id:'A',full_name:'Khách A',phone:'0901111111'});t.objectStore('customers').put({id:'legacy-b',owner_id:'B',full_name:'Khách B',phone:'0902222222'});t.objectStore('queue').add({type:'update',recordId:'legacy-a',payload:{full_name:'A sửa'},ts:'2026-10-07'});t.objectStore('queue').add({type:'update',recordId:'legacy-b',payload:{full_name:'B sửa'},ts:'2026-10-07'});t.oncomplete=resolve;t.onerror=()=>reject(t.error);});legacy.close();localStorage.setItem('crm_last_user',JSON.stringify({id:'A'}));
  await CRM.init(window.__client,'A');assertBrowser((await CRM.list()).length===1,'legacy only own rows');assertBrowser(await CRM.pendingCount()===1,'legacy queue preserved');
  await CRM.init(window.__client,'B');assertBrowser((await CRM.list()).every(c=>c.owner_id==='B'),'B scope');assertBrowser(await CRM.pendingCount()===0,'B no A queue');
  await CRM.init(window.__client,'A');assertBrowser(await CRM.pendingCount()===1,'A queue remains, no duplicate migration');
  await CRM.clearQueue();CRM.isOnline=()=>true;
  window.__server.customers=Array.from({length:1201},(_,i)=>({id:String(i).padStart(6,'0'),owner_id:'A',full_name:i===0?'Nguyễn Thị Hương':'Trần Văn Nam '+i,phone:'09'+String(i).padStart(8,'0'),qualified_at:i%2===0?'2026-10-01':null,care_stage:'Đang chăm sóc',projects:['Marquee Homes'],apt_type:'2N-2WC',apt_area:53.6,apt_price:1.2e9,finance:4e8,source:['website'],interest_level:80,notes_manual:[{text:'Lăn tăn giá'}],care_stage_history:[{at:'history1',stage:'Đang chăm sóc',note:'Ghichucu'}],call_attempts:[{at:'2026-09-01T00:00:00Z',result:'talked',note:'Muốn hướng Nam'}],next_tasks:[{text:'Chuẩn bị hồ sơ vay'}],updated_at:'2026-10-01T00:00:00Z',created_at:'2026-10-01T00:00:00Z'}));
  const full=await CRM.pull();assertBrowser(full.ok&&(await CRM.list()).length===1201,'all pages despite API cap 137');
  const ids=(await CRM.list()).map(c=>c.id).join(',');window.__requests=0;window.__failPage=2;const failed=await CRM.pull();assertBrowser(!failed.ok&&(await CRM.list()).map(c=>c.id).join(',')===ids,'failed page preserves cache');window.__failPage=0;
  window.__hook=async()=>{await localPut({id:'offline-new',owner_id:'A',full_name:'Mới local',phone:'0909999999'});await queueAdd({type:'insert',recordId:'offline-new',payload:{id:'offline-new',owner_id:'A'}});};const concurrent=await CRM.pull();assertBrowser(concurrent.skipped&&(await CRM.list()).some(c=>c.id==='offline-new'),'local changes while pulling preserved');await CRM.clearQueue();
  window.__hook=async()=>{await CRM.init(window.__client,'B');};const switched=await CRM.pull();assertBrowser(!switched.ok&&(await CRM.list()).every(c=>c.owner_id==='B'),'inflight A pull cannot overwrite B');
  await CRM.init(window.__client,'A');await CRM.pull();
  return{fullCount:(await CRM.list()).length,legacyMigration:true,pageFailure:true,localEditDuringPull:true,accountSwitch:true};
  function assertBrowser(value,msg){if(!value)throw new Error(msg);}
 });
 await page.evaluate(async()=>{currentUser={id:'A'};sb=window.__client;showAppScreen();SearchUI.setUser('A');Catalog.scope('A');await refreshList();showDashboardView();});
 await page.locator('#search-input').fill('nguyen huong');await page.waitForTimeout(300);
 assert.equal(await page.locator('#dash-search [data-search-open]').count(),1);
 assert.equal(await page.locator('#customer-list').count(),1);assert.equal(await page.locator('#customer-list').evaluate(e=>e.children.length),0);
 await page.locator('#search-input').fill('huogn');await page.waitForTimeout(300);await page.locator('#dash-search .search-fuzzy').waitFor();assert.equal(await page.locator('#dash-search .search-fuzzy').count(),1);
 await page.locator('#search-input').fill('huong');await page.waitForTimeout(300);
 assert.equal(await page.locator('#dash-search [data-search-open]').count(),60);
 assert.equal(await page.locator('#dash-search [data-search-open]').first().getAttribute('data-search-open'),'000000');
 await page.locator('[data-search-more=qualified]').click();assert.equal(await page.locator('#dash-search [data-search-open]').count(),90);
 await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(350);
 await page.locator('#tab-list').click();assert.equal(await page.locator('#customer-list').evaluate(e=>e.children.length),50);
 await page.locator('#list-search-more').click();assert.equal(await page.locator('#customer-list').evaluate(e=>e.children.length),100);
 await page.locator('#view-toggle').click();assert.equal(await page.locator('#customer-list .cust-row').count(),100);await page.locator('#view-toggle').click();
 // Export still uses the complete filtered list, independent of rendered pages.
 assert.equal(await page.evaluate(()=>visibleCustomers().length),601);
 await page.locator('#search-input').fill('');await page.waitForTimeout(30);await page.locator('#search-options summary').click();
 await page.locator('#search-refine-form [name=areaMin]').fill('54');await page.waitForTimeout(300);assert.equal(await page.locator('#customer-list').evaluate(e=>e.children.length),0);
 await page.locator('#search-refine-reset').click();
 await page.locator('#search-saved').selectOption('preset:hot');assert.equal(await page.locator('#customer-list').evaluate(e=>e.children.length),50);
 page.once('dialog',d=>d.accept('Khách nóng Marquee'));await page.locator('#search-save').click();
 const savedId=await page.locator('#search-saved').inputValue();assert(savedId.startsWith('saved:'));
 await page.evaluate(()=>{SearchUI.setUser('B');});assert.equal(await page.locator('#search-saved option').filter({hasText:'Khách nóng Marquee'}).count(),0);
 await page.evaluate(()=>SearchUI.setUser('A'));await page.locator('#search-saved').selectOption(savedId);assert.equal(await page.locator('#filter-min-interest').inputValue(),'70');
 await page.locator('#search-delete').click();assert.equal(await page.locator('#search-saved option').filter({hasText:'Khách nóng Marquee'}).count(),0);
 await page.locator('#search-refine-reset').click();
 await page.locator('#search-input').fill('huong marquee');await page.waitForTimeout(300);await page.locator('#search-input').press('ArrowDown');assert(await page.evaluate(()=>document.activeElement.classList.contains('customer-card')));
 await page.evaluate(async()=>{CRM.isOnline=()=>false;const old=allCustomers.find(c=>c.id==='000000');if(!customerSearchResult(old,CRMSearch.compile('ghichucu')).match)throw Error('history searchable');await CRM.updateCareHistoryNote('000000','history1','Ghichumoi');await refreshList();const edited=allCustomers.find(c=>c.id==='000000');if(edited.updated_at!==old.updated_at||customerSearchResult(edited,CRMSearch.compile('ghichucu')).match||!customerSearchResult(edited,CRMSearch.compile('ghichumoi')).match)throw Error('note cache invalidation');});
 // Simulate composition without committing an intermediate query.
 await page.evaluate(()=>{$('#search-input').dispatchEvent(new CompositionEvent('compositionstart'));$('#search-input').value='khongtimthay';$('#search-input').dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));});
 await page.waitForTimeout(200);assert(await page.locator('#customer-list').evaluate(e=>e.children.length)>0);
 await page.evaluate(()=>$('#search-input').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));await page.waitForTimeout(300);assert.equal(await page.locator('#customer-list').evaluate(e=>e.children.length),0);
 await page.locator('#search-input').fill('huong');await page.waitForTimeout(300);await page.locator('#search-input').press('Enter');
 assert(await page.evaluate(()=>JSON.parse(localStorage.getItem('crm_search_v1:A:recent')).some(v=>v.query==='huong')));
 // Inventory: cached offline data, inherited area/price and reverse matching.
 await page.evaluate(()=>{
  CRM.isOnline=()=>false;
  localStorage.setItem('crm_catalog_v2:A',JSON.stringify({projects:[{id:'p',name:'Marquee Homes',typical_price_per_m2:2e7,vat_rate:5,kpbt_rate:2}],buildings:[{id:'b',project_id:'p',code:'CT1'}],projectTypes:[{id:'pt',project_id:'p',apt_type:'2N-2WC',typical_area_m2:53.6}],buildingTypes:[],units:[{id:'u1',project_id:'p',building_id:'b',code:'1208',apt_type:'2N-2WC',status:'available',floor:12,direction:'Nam'},{id:'u2',project_id:'p',building_id:'b',code:'1209',apt_type:'2N-2WC',status:'sold',floor:12,direction:'Nam'}]}));Catalog.scope('A');$('#catalog-btn').click();
 });
 await page.locator('.cat-search-options summary').click();await page.locator('#inventory-query').fill('1208');await page.waitForTimeout(300);assert.equal(await page.locator('.inventory-card').count(),1);
 assert((await page.locator('.inventory-card').innerText()).includes('53.6 m²'));
 await page.locator('[data-inventory-clients=u1]').click();assert.equal(await page.locator('#inventory-client-results [data-inventory-open]').count(),50);
 await page.locator('#inventory-client-more').click();assert.equal(await page.locator('#inventory-client-results [data-inventory-open]').count(),100);
 await page.locator('#catalog-close').click();
 await page.evaluate(()=>CatalogSearchUI.forCustomer('000000'));assert.equal(await page.locator('.inventory-card').count(),1);
 await page.locator('#inventory-price-max').fill('1000');await page.waitForTimeout(300);assert.equal(await page.locator('.inventory-card').count(),0);
 await page.locator('#catalog-close').click();
 const catalogChecks=await page.evaluate(async()=>{
  CRM.isOnline=()=>true;__requests=0;__failPage=0;
  __server.projects=Catalog.projects();__server.buildings=[Catalog.building('b')];
  __server.project_apt_types=[{id:'pt',project_id:'p',apt_type:'2N-2WC',typical_area_m2:53.6}];__server.building_apt_types=[];
  __server.units=Array.from({length:1201},(_,i)=>({...Catalog.units()[0],id:String(i).padStart(6,'0'),code:String(i)}));
  if(!await Catalog.load()||Catalog.units().length!==1201)throw Error('catalog pagination');
  const first=Catalog.units()[0];__requests=0;__failPage=7;
  if(await Catalog.load()||Catalog.units().length!==1201||Catalog.units()[0]!==first)throw Error('catalog failure preserves all tables');
  __failPage=0;CRM.isOnline=()=>false;return{fullCount:Catalog.units().length,pageFailure:true};
 });
 await page.evaluate(()=>{showDashboardView();$('#search-input').value='huong';resetSearchPages();renderSearchView();});
 const timing=await page.evaluate(()=>{const base=allCustomers[0];allCustomers=Array.from({length:10000},(_,i)=>({...base,id:'perf'+i,full_name:'Trần Văn Nam '+i,qualified_at:i%2?'2026-10-01':null}));_queryContext=null;const cold=performance.now();renderSearchView();const coldMs=performance.now()-cold;const runs=[];for(let i=0;i<7;i++){const t=performance.now();renderSearchView();runs.push(performance.now()-t);}runs.sort((a,b)=>a-b);$('#search-input').value='nam marquee';const fresh=performance.now();renderSearchView();const freshQueryMs=performance.now()-fresh;return{freshQueryMs,records:10000,coldMs,warmMedianMs:runs[3],dashboardRows:$('#dash-search').querySelectorAll('[data-search-open]').length,hiddenRows:$('#customer-list').children.length};});
 const idle=await page.evaluate(async()=>{
  allCustomers=allCustomers.map(c=>({...c}));_queryContext=null;const original=requestIdleCallback,slices=[];
  window.requestIdleCallback=fn=>setTimeout(()=>{const t=performance.now();fn();slices.push(performance.now()-t);},1);
  scheduleSearchWarmup();for(let i=0;i<2000&&!_searchBlobCache.has(allCustomers.at(-1));i++)await new Promise(r=>setTimeout(r,5));
  window.requestIdleCallback=original;if(!_searchBlobCache.has(allCustomers.at(-1)))throw Error('idle warmup incomplete');
  const t=performance.now();renderSearchView();return{sliceCount:slices.length,maxSliceMs:Math.max(...slices),preparedFreshQueryMs:performance.now()-t};
 });Object.assign(timing,idle);
 await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(350);await page.screenshot({path:'/private/tmp/crm-search-desktop.png'});
 for(const width of [375,320]){await page.setViewportSize({width,height:812});await page.locator('#search-options').evaluate(e=>e.open=true);const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));assert(size.scroll<=size.width,`overflow ${width}: ${size.scroll}`);await page.screenshot({path:`/private/tmp/crm-search-mobile-${width}.png`,fullPage:false});}
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({storage,catalog:catalogChecks,timing,browser:'Chrome',viewports:[1280,375,320],errors},null,2));
 fs.writeFileSync('/private/tmp/crm-search-implementation-results.json',JSON.stringify({storage,catalog:catalogChecks,timing,errors},null,2));
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
