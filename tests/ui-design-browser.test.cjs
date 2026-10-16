/* UI regression on a private fake origin: real renderers + IndexedDB, no external requests. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..', 'legacy');
const out = process.env.CRM_UI_OUTPUT || '/private/tmp/crm-ui-audit';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const errors = [], blocked = [];
    page.on('pageerror', e => errors.push(e.message));
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    await page.route('**/*', route => {
      const u = new URL(route.request().url());
      if (u.hostname !== 'crm-ui.local') { blocked.push(u.hostname); return route.abort(); }
      if (u.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '') });
      const file = path.join(root, u.pathname);
      return fs.existsSync(file) && fs.statSync(file).isFile() ? route.fulfill({ path: file }) : route.fulfill({ status: 404, body: '' });
    });
    await page.goto('http://crm-ui.local/', { waitUntil: 'load' });
    await page.evaluate(() => {
      window.APP_CONFIG = { SUPABASE_URL: 'http://crm-ui.local', SUPABASE_ANON_KEY: 'fake', WORKER_URL: '' };
      const query = { select() { return this; }, eq() { return this; }, order() { return this; }, then(resolve) { return Promise.resolve(resolve({ data: [], error: null })); } };
      window.__client = { from: () => Object.create(query), auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange() {} } };
      window.supabase = { createClient: () => window.__client };
    });
    for (const m of html.matchAll(/<script src="\/js\/([^"]+)"/g)) {
      if (m[1] !== 'config.js') await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'js', m[1]), 'utf8') });
    }
    await page.evaluate(() => document.dispatchEvent(new Event('DOMContentLoaded')));
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${out}/auth.png` });
    const fixture = await page.evaluate(async () => {
      currentUser = { id: 'ui-owner' }; sb = __client;
      CRM.isOnline = () => false;
      await CRM.init(__client, currentUser.id);
      localStorage.setItem('crm_catalog_v2:' + currentUser.id, JSON.stringify({
        projects: [{id:'p',name:'Marquee Homes',typical_price_per_m2:20000000,vat_rate:5,kpbt_rate:2,handover_date:'2027-10-01',title_after_months:1.5}],
        buildings: [{id:'b',project_id:'p',code:'CT1'}],
        projectTypes: [{id:'pt',project_id:'p',apt_type:'2N-2WC',typical_area_m2:53.6}], buildingTypes: [],
        units: [{id:'unit',project_id:'p',building_id:'b',code:'1208',apt_type:'2N-2WC',status:'available',floor:12,direction:'Nam'}]
      }));
      Catalog.scope(currentUser.id);
      const now = Date.now(), iso = delta => new Date(now + delta).toISOString(), H = 3600000;
      const base = { owner_id: currentUser.id, phone: '0900000000', full_name: 'Nguyễn Thị Hưởng', qualified_at: iso(-24*H), care_stage: 'Đang chăm sóc', care_stage_updated_at: iso(-24*H), created_at: iso(-24*H), registered_at: iso(-24*H), updated_at: iso(-H), interest_level: 70, contact_status: 'Phản hồi tốt', projects: ['Marquee Homes'], apt_type: '2N-2WC', apt_price: 1200000000, apt_area: 53.6, source: ['website'], notes_manual: [{ at: iso(-H), text: 'Trường · Hưởng · Ngữ · Tự · Đường. Khách quan tâm căn 2 phòng ngủ, cần xem phương án vay.' }], care_stage_history: [{ at: iso(-24*H), stage: 'Đang chăm sóc' }], call_attempts: [{ at: iso(-2*H), result: 'talked', duration: 60 }], next_tasks: [] };
      const rows = Array.from({ length: 18 }, (_, i) => ({ ...base, id: 'ui-' + i, phone: '09000000' + String(i).padStart(2, '0'), full_name: i === 1 ? 'Trần Thị Hưởng Trường Tên Khách Hàng Rất Dài Cần Đọc Đủ' : base.full_name + ' ' + i, interest_level: i*5, next_tasks: [{ at: iso(-H-i), text: 'Chuẩn bị hồ sơ cư trú và kiểm tra phương án tài chính trước buổi hẹn', due: iso((i-3)*24*H), due_allday: i===3 }] }));
      rows[0].next_call_at = iso(-2*H); rows[0].next_call_end = iso(-H); rows[0].next_call_reason = 'Khách hẹn kiểm tra hồ sơ';
      rows[1].next_call_at = iso(2*H); rows[1].next_call_end = iso(3*H);
      rows[2].next_tasks.push({ at: iso(-2*H), text: 'Gửi tài liệu đã hứa', done_at: iso(-H) });
      rows.push({ ...base, id: 'lead-new', phone: '0909999001', full_name: 'Khách mới Trường', qualified_at: null, care_stage: 'Đăng kí mới', created_at: iso(-600000), registered_at: iso(-600000), care_stage_updated_at: iso(-600000), call_attempts: [], next_tasks: [] });
      rows.push({ ...base, id: 'lead-dropped', phone: '0909999002', full_name: 'Khách đã loại', qualified_at: null, care_stage: 'Loại', disqualified_at: iso(-H), disqualify_reason: 'price_high', next_tasks: [] });
      rows.push({ ...base, id: 'team-readonly', owner_id: 'colleague', followers: ['ui-owner'], full_name: 'Khách nhóm chỉ xem' });
      team = [{ user_id: 'ui-owner', full_name: 'Sale kiểm thử', is_me: true }, { user_id: 'colleague', full_name: 'Đồng nghiệp' }];
      for (const row of rows) await localPut(row);
      window.__original = JSON.stringify(await CRM.list());
      showAppScreen(); await refreshList(); showDashboardView();
      return rows.length;
    });
    // The same deadline must read identically on Focus, Tasks, profile and the overdue KPI.
    const deadlineUi = await page.evaluate(() => {
      const saved = allCustomers, realNow = Date.now, initial = realNow();
      const base = { ...allCustomers.find(c=>c.id==='ui-0'), next_tasks: [],
        next_call_at:new Date(initial-20*60000).toISOString(), next_call_end:new Date(initial-10*60000).toISOString() };
      try {
        allCustomers=[base]; Date.now=()=>initial; showDashboardView();
        const inGrace={kpi:$('#dashboard-content .kpi-todo .kpi-sub').textContent,focus:$('#dashboard-content .focus-next p').textContent};
        showTasksView(); inGrace.tasks=$('#tasks-content .wk-cd').textContent;
        openDetail(base.id); inGrace.profile=$('#detail-tasks .call-tag').textContent;
        Date.now=()=>initial+21*60000; showAppScreen(); showDashboardView();
        const afterGrace={kpi:$('#dashboard-content .kpi-todo .kpi-sub').textContent,focus:$('#dashboard-content .focus-next p').textContent};
        showTasksView(); afterGrace.tasks=$('#tasks-content .wk-cd').textContent;
        openDetail(base.id); afterGrace.profile=$('#detail-tasks .call-tag').textContent;
        return {inGrace,afterGrace};
      } finally {Date.now=realNow;allCustomers=saved;showAppScreen();showDashboardView();}
    });
    assert.match(deadlineUi.inGrace.kpi,/không có hẹn gọi quá hạn/);
    assert.match(deadlineUi.inGrace.focus,/Đến giờ gọi/);
    assert.match(deadlineUi.inGrace.tasks,/đến hạn/); assert.match(deadlineUi.inGrace.profile,/đến hạn/);
    assert.match(deadlineUi.afterGrace.kpi,/1 hẹn gọi quá hạn/);
    assert.match(deadlineUi.afterGrace.focus,/Quá hạn gọi/);
    assert.match(deadlineUi.afterGrace.tasks,/quá hạn/); assert.match(deadlineUi.afterGrace.profile,/quá hạn/);
    const checks = [], contrastFindings = [];
    async function fit(label, resetScroll = true) {
      if(resetScroll)await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(100);
      const state = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert(state.scroll <= state.width, `${label}: page overflow ${state.scroll}/${state.width}`);
      const dialogOverflow = await page.evaluate(() => [...document.querySelectorAll('dialog[open]')].map(e => ({ id: e.id, w: e.clientWidth, sw: e.scrollWidth })).filter(e => e.sw > e.w + 1));
      assert.deepEqual(dialogOverflow, [], `${label}: dialog overflow`);
      const lowContrast = await page.evaluate(() => {
        const rgba = s => { const n = s.match(/[\d.]+/g)?.map(Number); return n?.length>=3 ? s.startsWith('color(srgb') ? [n[0]*255,n[1]*255,n[2]*255,n[3]??1] : [n[0],n[1],n[2],n[3]??1] : null; };
        const blend = (a,b) => [0,1,2].map(i=>a[i]*a[3]+b[i]*(1-a[3])).concat(1);
        const lum = c => c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
        return [...document.querySelectorAll('body *')].filter(e=>e.checkVisibility() && [...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()) && !e.closest('[disabled]')).flatMap(e=>{
          const st=getComputedStyle(e), fg=rgba(st.color); if(!fg)return [];
          const rect=e.getBoundingClientRect(); if(rect.bottom<0||rect.top>innerHeight)return [];
          let chain=[],p=e; while(p){chain.unshift(p);p=p.parentElement;}
          let bg=[255,255,255,1]; for(const n of chain){const c=rgba(getComputedStyle(n).backgroundColor);if(c)bg=blend(c,bg);}
          const a=lum(blend(fg,bg)), b=lum(bg), ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
          const large=parseFloat(st.fontSize)>=24||(parseFloat(st.fontSize)>=18.66&&parseInt(st.fontWeight)>=700);
          return ratio<(large?3:4.5)-.05 ? [{text:e.textContent.trim().slice(0,70),class:e.className,ratio:Math.round(ratio*100)/100,color:st.color}] : [];
        });
      });
      if(lowContrast.length)contrastFindings.push({label,items:lowContrast});
      checks.push(label);
      await page.screenshot({ path: `${out}/${label}.png` });
    }
    for (const width of (process.env.CRM_UI_FAST ? [375] : [1280, 320, 375, 390, 430, 768, 900, 1024])) {
      await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });
      for (const [label, fn] of [['focus','showDashboardView'], ['customers','showListView'], ['leads','showLeadView'], ['tasks','showTasksView'], ['analytics','showAnalyticsView']]) {
        await page.evaluate(fn => window[fn](), fn); await fit(`${label}-${width}`);
      }
      await page.evaluate(() => openDetail('ui-1')); await fit(`profile-${width}`);
      for (const tab of ['interact', 'info', 'history']) { await page.evaluate(tab => setDetailTab(tab), tab); await fit(`profile-${tab}-${width}`); }
      await page.evaluate(() => { detailId=null; showAppScreen(); showDashboardView(); });
    }
    await page.setViewportSize({ width: 375, height: 844 });
    await page.evaluate(() => { showDashboardView(); });
    assert(await page.locator('.focus-next').isVisible());
    assert(await page.locator('.focus-next').evaluate(e => e.getBoundingClientRect().top < document.querySelector('.kpi-strip').getBoundingClientRect().top));
    await page.locator('.focus-next [data-open]').click();
    assert(await page.locator('#detail-screen').isVisible());
    assert(await page.locator('.detail-call').evaluate(e => e.getBoundingClientRect().top < document.querySelector('.detail-badges').getBoundingClientRect().top));
    assert.equal(await page.locator('#detail-ai').isVisible(), false);
    await page.evaluate(() => CallLog.open({ customerId:'ui-0' })); await fit('call-log-375');
    await page.locator('#call-log-modal').evaluate(e => e.close());
    await page.evaluate(() => openScheduler('ui-0')); await fit('schedule-375');
    await page.locator('#schedule-modal').evaluate(e => e.close());
    await page.evaluate(() => openTaskModal()); await fit('task-form-375');
    await page.locator('#task-modal').evaluate(e => e.close());
    await page.evaluate(() => openForm('ui-0')); await fit('customer-form-375');
    await page.locator('#form-modal').evaluate(e => e.close());
    await page.evaluate(() => openDetail('team-readonly'));
    assert.equal(await page.locator('#detail-edit-btn').isVisible(), false);
    assert.equal(await page.locator('#detail-task-add-btn').isVisible(), false);
    await fit('readonly-375');
    await page.evaluate(() => { detailId=null; showAppScreen(); openLeadSheet('lead-new'); }); await fit('lead-sheet-375');
    await page.locator('#lead-modal').evaluate(e => e.close());
    await page.evaluate(() => { showListView(); $('#filter-btn').click(); }); await fit('filters-375');
    await page.evaluate(() => { closeToolPops(); $('#catalog-btn').click(); }); await fit('catalog-375');
    await page.locator('#catalog-modal').evaluate(e => e.close());
    for(const width of [320,430]) {
      await page.setViewportSize({width,height:844});
      await page.evaluate(()=>$('#catalog-btn').click());
      const project=page.locator('.cat-proj').first();
      if(!await project.evaluate(e=>e.open))await project.locator(':scope > summary').click();
      const building=page.locator('.cat-b').first();
      if(!await building.evaluate(e=>e.open))await building.locator(':scope > summary').click();
      await fit(`catalog-expanded-${width}`);
      await page.locator('#catalog-modal').evaluate(e=>e.close());
    }
    await page.setViewportSize({width:375,height:844});
    await page.evaluate(async () => { showLoanView(); });
    await page.waitForTimeout(300); await page.locator('#loan-cust-btn').click(); await page.locator('.loan-cust-row[data-cid="ui-0"]').click(); await page.waitForTimeout(100); await fit('loan-375');
    assert(await page.locator('.lm-results .lm-hero').count(), 'loan result renders from selected customer and catalog');
    assert.equal(await page.locator('[data-bind="unit.area"]').getAttribute('aria-label'), 'Diện tích thông thủy (m²)');
    await page.locator('.lm-results').scrollIntoViewIfNeeded(); await fit('loan-results-375', false);
    await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight)); await fit('loan-bottom-375', false);
    await page.evaluate(() => openDetail('ui-0'));
    await page.evaluate(() => { APP_CONFIG.WORKER_URL='http://crm-ui.local/worker'; CRMAI.onOpenDetail(allCustomers.find(c=>c.id==='ui-0')); });
    assert(await page.locator('#detail-ai').isVisible()); await fit('profile-ai-375');
    // Call save failure preserves entered notes; clicking a result only previews the follow-up.
    await page.evaluate(()=>{window.__callUpdate=CRM.update;CRM.update=async()=>{throw Error('Lỗi gọi mô phỏng');};CallLog.open({customerId:'ui-0'});});
    await page.locator('#calllog-results [data-res=talked]').click();
    assert((await page.locator('#calllog-save').innerText()).includes('Lưu'));
    await page.locator('#calllog-note').fill('Ghi chú cần giữ khi lưu lỗi');
    await page.locator('#calllog-save').click();
    await page.locator('#calllog-error').filter({hasText:'Lỗi gọi mô phỏng'}).waitFor();
    assert.equal(await page.locator('#calllog-note').inputValue(),'Ghi chú cần giữ khi lưu lỗi');
    await fit('call-save-error-375');
    await page.evaluate(()=>{CRM.update=__callUpdate;$('#call-log-modal').close();});
    await page.evaluate(()=>{openDetail('ui-0');window.__sessionFn=sb.auth.getSession;sb.auth.getSession=async()=>{await new Promise(r=>setTimeout(r,1500));return {data:{session:null}};};});
    await page.locator('#ai-brief-btn').click(); await page.locator('.ai-loading').waitFor(); await page.locator('#ai-out').scrollIntoViewIfNeeded(); await fit('ai-loading-375', false);
    await page.locator('.ai-error').waitFor(); await fit('ai-error-375', false);
    await page.evaluate(()=>{sb.auth.getSession=__sessionFn;detailId=null;showAppScreen();showDashboardView();});
    const untouched = await page.evaluate(async () => JSON.stringify(await CRM.list()) === __original);
    assert(untouched, 'Read-only UI navigation must not mutate customer records');
    const duplicateIds = await page.evaluate(() => [...document.querySelectorAll('[id]')].map(e=>e.id).filter((v,i,a)=>a.indexOf(v)!==i));
    assert.deepEqual(duplicateIds, []);
    const tokens = await page.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, primary: getComputedStyle(document.querySelector('.focus-next .btn-primary')).backgroundColor, font: getComputedStyle(document.querySelector('.focus-next h2')).fontFamily, hidden: getComputedStyle(document.querySelector('#auth-screen')).display }));
    assert.equal(tokens.bg, 'rgb(246, 248, 250)'); assert.equal(tokens.primary, 'rgb(23, 33, 43)'); assert(tokens.font.includes('sans-serif') && !/Georgia|Times New Roman/.test(tokens.font)); assert.equal(tokens.hidden, 'none');
    // Each utility is opened through its existing renderer, using fake data only.
    await page.evaluate(async()=>{allCustomers=await CRM.list();});
    for (const width of [320,430]) {
      await page.setViewportSize({width,height:844});
      const utilities = [
        ['export',()=>openExportModal()], ['import',()=>openImportModal()],
        ['templates',()=>$('#zalo-greeting-btn').click()],
        ['zalo-picker',()=>openZaloPicker(allCustomers.find(c=>c.id==='ui-0'))],
        ['assign',()=>openAssign('ui-0')],
        ['team',()=>{renderTeamModal();$('#team-modal').showModal();}],
        ['ai-settings',()=>$('#ai-settings-btn').click()],
        ['avatar',()=>openAvatarViewer('ui-0')], ['cover',()=>openCoverViewer('ui-0')], ['image-picker',()=>openImagePicker('ocr')],
      ];
      for(const [name,fn] of utilities) {
        await page.evaluate('('+fn.toString()+')()'); await fit(`${name}-${width}`);
        await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
      }
    }
    await page.setViewportSize({width:375,height:844});
    await page.evaluate(()=>{showDashboardView();});
    await page.locator('.focus-groups summary').click();
    await page.locator('[data-sl]').first().click();
    assert(await page.locator('.focus-groups').evaluate(e=>e.open), 'group list stays expanded after redraw');
    await page.evaluate(()=>openDetail('ui-0'));
    await page.locator('#detail-tabs [data-tab=overview]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#detail-body').getAttribute('data-active-tab'),'interact');
    await page.keyboard.press('End');
    assert.equal(await page.locator('#detail-body').getAttribute('data-active-tab'),'history');
    // Escape/cancel must not discard a partially edited customer without review.
    await page.evaluate(() => openForm('ui-0'));
    await page.locator('[name=full_name]').fill('Tên mới chưa lưu');
    page.once('dialog', d => d.dismiss());
    await page.locator('#cancel-form-btn').click();
    assert(await page.locator('#form-modal').evaluate(e=>e.open));
    assert.equal(await page.locator('[name=full_name]').inputValue(), 'Tên mới chưa lưu');
    page.once('dialog', d => d.accept());
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#form-modal').evaluate(e=>e.open), false);
    // Native back follows the same unsaved-data guard.
    await page.evaluate(() => openForm('ui-0'));
    await page.locator('[name=full_name]').fill('Tên mới chưa lưu');
    page.once('dialog', d => d.dismiss()); await page.evaluate(()=>CRMBack());
    assert(await page.locator('#form-modal').evaluate(e=>e.open));
    page.once('dialog', d => d.accept()); await page.evaluate(()=>CRMBack());
    assert.equal(await page.locator('#form-modal').evaluate(e=>e.open), false);
    // Navigation back restores the origin and its scroll, without changing filters.
    await page.evaluate(()=>{showAppScreen();showTasksView();window.scrollTo(0,500);});
    await page.waitForTimeout(150);
    const originY=await page.evaluate(()=>scrollY);
    await page.evaluate(()=>openDetail('ui-2'));
    await page.evaluate(()=>closeDetailToList());
    await page.waitForTimeout(250);
    assert(await page.locator('#tasks-view').isVisible());
    assert(Math.abs(await page.evaluate(()=>scrollY)-originY)<60, 'restore source scroll');
    // Saving once still writes the existing payload to the offline queue. Double submit is ignored.
    await page.evaluate(()=>{window.__updateCalls=0;window.__updateOriginal=CRM.update;CRM.update=async(...args)=>{__updateCalls++;await new Promise(r=>setTimeout(r,100));return __updateOriginal.apply(CRM,args);};openForm('ui-0');});
    await page.locator('[name=full_name]').fill('Nguyễn Thị Hưởng đã sửa');
    await page.evaluate(()=>{const f=$('#customer-form');f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
    await page.waitForFunction(()=>!$('#form-modal').open, null, {timeout:10000});
    assert.equal(await page.evaluate(()=>__updateCalls),1);
    const edited=await page.evaluate(async()=>{CRM.update=__updateOriginal;const c=(await CRM.list()).find(c=>c.id==='ui-0');return {name:c.full_name,stage:c.care_stage,owner:c.owner_id,pending:await CRM.pendingCount()};});
    assert.equal(edited.name,'Nguyễn Thị Hưởng đã sửa');assert.equal(edited.stage,'Đang chăm sóc');assert.equal(edited.owner,'ui-owner');assert(edited.pending>0);
    await page.evaluate(()=>{CRM.update=async()=>{throw Error('Lỗi lưu mô phỏng');};openForm('ui-0');});
    await page.locator('[name=full_name]').fill('Nội dung được giữ khi lỗi');
    page.once('dialog',d=>d.accept());
    await page.locator('#customer-form [type=submit]').click();
    await page.waitForFunction(()=>!$('#customer-form').hasAttribute('aria-busy'));
    assert(await page.locator('#form-modal').evaluate(e=>e.open));assert.equal(await page.locator('[name=full_name]').inputValue(),'Nội dung được giữ khi lỗi');
    await fit('customer-save-error-375');
    await page.evaluate(()=>{CRM.update=__updateOriginal;closeForm();});
    // Empty states and declared disabled AI state remain actionable and honest.
    await page.evaluate(()=>{allCustomers=[];showDashboardView();}); await fit('empty-focus-375');
    await page.evaluate(()=>showTasksView()); await fit('empty-tasks-375');
    await page.evaluate(()=>showAnalyticsView()); await fit('empty-analytics-375');
    assert.deepEqual(errors, []);
    fs.writeFileSync(`${out}/results.json`, JSON.stringify({ fixture, checks, untouched, tokens, duplicateIds, errors, contrastFindings, externalRequestsBlocked: [...new Set(blocked)] },null,2));
    console.log(JSON.stringify({ fixture, checks: checks.length, screenshots: checks.length, untouched, tokens, contrastScreens: contrastFindings.length, errors },null,2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
