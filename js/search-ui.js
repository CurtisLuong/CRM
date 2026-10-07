/* Shared refinements and personal saved searches; all evaluation stays offline. */
(() => {
  const form = $('#search-refine-form');
  const numberKeys = ['priceMin','priceMax','capitalMin','capitalMax','areaMin','areaMax','callsMin','callsMax','oldDays'];
  let userId = null, state = {}, saved = [], recent = [], error = '', meta = new WeakMap(), isActive = false;
  let filterTimer, compiled = {types:[],buildings:[],campaign:''};
  const builtins = [
    { id: 'preset:new', name: 'Khách mới chưa gọi', view:'leads', state:{calls:'none'} },
    { id: 'preset:hot', name: 'Khách nóng chưa gọi 7 ngày', view:'list', state:{oldDays:7}, interest:70 },
    { id: 'preset:due', name: 'Khách đến hạn gọi', view:'dashboard', state:{calls:'due'} }
  ];
  const key = (type) => 'crm_search_v1:' + userId + ':' + type;
  const load = (type) => { try { const a=JSON.parse(localStorage.getItem(key(type)) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
  const persist = () => { if (!userId) return; try { localStorage.setItem(key('saved'),JSON.stringify(saved)); localStorage.setItem(key('recent'),JSON.stringify(recent)); } catch { showToast('Không lưu được danh sách trên máy này.'); } };
  function active() { return isActive; }
  function read() {
    const next = { projects:[...form.querySelectorAll('[name="projects"]:checked')].map((x)=>x.value), sources:[...form.querySelectorAll('[name="sources"]:checked')].map((x)=>x.value) };
    for (const name of ['types','buildings','campaign','calls','missing']) next[name] = form.elements[name].value.trim();
    for (const name of numberKeys) { const input = form.elements[name]; next[name] = input.value === '' ? null : Number(input.value); }
    error = form.checkValidity() ? '' : 'Vui lòng nhập số hợp lệ, không âm (số lần gọi / số ngày là số nguyên).';
    for (const group of ['price','capital','area','calls']) if (next[group+'Min'] != null && next[group+'Max'] != null && next[group+'Min'] > next[group+'Max']) error = 'Giá trị “Từ” phải nhỏ hơn hoặc bằng “Đến”.';
    state = next; $('#search-refine-error').textContent = error;
    updateSummary();
  }
  function write() {
    for (const input of form.querySelectorAll('input,select')) {
      if (input.type === 'checkbox') input.checked = (state[input.name] || []).includes(input.value);
      else input.value = state[input.name] ?? '';
    }
    error = ''; $('#search-refine-error').textContent = ''; updateSummary();
  }
  function updateSummary() { isActive = !!error || Object.values(state).some((v) => Array.isArray(v) ? v.length : v !== '' && v != null); compiled = {types:values(state.types||''), buildings:values(state.buildings||''), campaign:CRMSearch.normalize(state.campaign)}; $('#search-filter-summary').textContent = active() ? 'Đang lọc · chỉnh / xoá' : 'Lọc tìm kiếm'; }
  function options() {
    const selectedProjects = state.projects || [];
    const names = [...new Set([...Catalog.projects().map((p)=>p.name), ...allCustomers.flatMap((c)=>Array.isArray(c.projects)?c.projects:[]), ...selectedProjects])].sort((a,b)=>a.localeCompare(b,'vi'));
    $('#search-project-options').innerHTML = names.length ? names.map((name)=>`<label><input type="checkbox" name="projects" value="${escapeHtml(name)}"${selectedProjects.includes(name)?' checked':''}>${escapeHtml(name)}</label>`).join('') : '<span class="cat-muted">Chưa có dự án</span>';
    $('#search-source-options').innerHTML = Object.entries(SOURCES).map(([code,label])=>`<label><input type="checkbox" name="sources" value="${code}"${(state.sources||[]).includes(code)?' checked':''}>${escapeHtml(label)}</label>`).join('');
  }
  function customerMeta(c) {
    if (meta.has(c)) return meta.get(c);
    const calls = Array.isArray(c.call_attempts) ? c.call_attempts : [];
    const times = calls.map((a)=>Date.parse(a.at)).filter(Number.isFinite);
    const m = { count:calls.length, last:times.length?times.reduce((a,b)=>Math.max(a,b),-Infinity):null, talked:calls.some((a)=>a.result==='talked') };
    meta.set(c,m); return m;
  }
  function values(text) { return CRMSearch.aliases(text).split(/[,;]+/).map((s)=>s.trim()).filter(Boolean); }
  function matches(c) {
    if (error) return false;
    if (!active()) return true;
    if (state.projects?.length && !state.projects.some((p)=>(c.projects||[]).includes(p))) return false;
    if (state.sources?.length && !state.sources.some((src)=>sourceListOf(c.source).includes(src))) return false;
    if (state.types && !compiled.types.some((t)=> { const actual=CRMSearch.aliases(c.apt_type); return /^\d+n\+?$/.test(t)?actual===t||actual.startsWith(t+'-')||actual.startsWith(t+',')||actual.startsWith(t+'+'):actual===t; })) return false;
    if (state.buildings && !compiled.buildings.includes(CRMSearch.normalize(c.building_code))) return false;
    if (state.campaign && !CRMSearch.normalize(campaignOf(c)).includes(compiled.campaign)) return false;
    for (const [field,prefix,mult] of [['apt_price','price',1e6],['finance','capital',1e6],['apt_area','area',1]]) {
      if (!CRMSearch.range(c[field], state[prefix+'Min']==null?null:state[prefix+'Min']*mult, state[prefix+'Max']==null?null:state[prefix+'Max']*mult)) return false;
    }
    if (state.missing) { const v=c[state.missing]; if (Array.isArray(v)?v.length:v!=null&&v!=='') return false; }
    const m=customerMeta(c);
    if (!CRMSearch.range(m.count,state.callsMin,state.callsMax)) return false;
    if (state.calls==='none' && m.count) return false;
    if (state.calls==='called' && !m.count) return false;
    if (state.calls==='talked' && !m.talked) return false;
    if (state.oldDays && m.last != null && Date.now()-m.last < state.oldDays*86400000) return false;
    if (state.calls==='due') { const reminder=!c.disqualified_at&&!isCareDone(c.care_stage)&&callReminder(c); if (!reminder || reminder.state==='soon') return false; }
    return true;
  }
  function refreshSaved(selected='') {
    $('#search-saved').innerHTML = '<option value="">Chọn danh sách…</option>' + [...builtins,...saved].map((v)=>`<option value="${escapeHtml(v.id)}">${escapeHtml(v.name)}</option>`).join('');
    $('#search-saved').value=selected; $('#search-delete').hidden=!saved.some((v)=>v.id===selected);
  }
  function remember() {
    const query=$('#search-input').value.trim(); if (!userId||!query) return;
    const scope=$('#search-field').value;
    recent=[{query,scope},...recent.filter((v)=>v.query!==query||v.scope!==scope)].slice(0,8); persist(); renderRecent();
  }
  function renderRecent() {
    const box=$('#search-recent'); box.hidden=!!$('#search-input').value.trim()||!recent.length;
    box.innerHTML = '<span>Tìm gần đây:</span> '+recent.map((v,i)=>`<button type="button" class="btn-ghost btn-small" data-recent="${i}">${escapeHtml(v.query)}</button>`).join('');
  }
  function changed() { resetSearchPages(); renderSearchView(); updateSummary(); }
  function legacyState() { return {progressFilter,stageFilter,dateFilter,minInterest:Number($('#filter-min-interest').value||0),leadFilter,leadSrcFilter,leadDatePreset}; }
  function applySaved(view) {
    state = {...(view.state||{})}; write();
    const old=view.legacy||{};
    progressFilter=old.progressFilter||'active'; stageFilter=old.stageFilter||''; dateFilter=old.dateFilter||{preset:'all',from:null,to:null};
    $('#filter-min-interest').value=old.minInterest??view.interest??0; $('#filter-interest-val').textContent=$('#filter-min-interest').value;
    leadFilter=old.leadFilter||'open';leadSrcFilter=old.leadSrcFilter||'';leadDatePreset=old.leadDatePreset||'all';
    $('#progress-label').textContent=progressFilter==='all'?'Tất cả':progressFilter==='done'?'Đã xong':'Đang chăm';
    $('#lead-status-label').textContent=leadFilter==='all'?'Tất cả':leadFilter==='dropped'?'Đã loại':'Cần gọi';
    $$('#progress-pop .status-opt').forEach((el)=>el.classList.toggle('is-sel',el.dataset.value===progressFilter));
    syncLeadFilterUI(); syncStageLabel(); syncDatePresetUI();
    $('#search-input').value=view.query||'';$('#search-field').value=view.scope||'all';
    setActiveView(view.view||'dashboard'); changed();
  }
  form.addEventListener('submit',(e)=>e.preventDefault());
  form.addEventListener('input',()=>{read();clearTimeout(filterTimer);filterTimer=setTimeout(changed,120);});
  form.addEventListener('change',()=>{read();clearTimeout(filterTimer);changed();});
  $('#search-refine-reset').addEventListener('click',()=>{state={};write();$('#search-saved').value='';$('#search-delete').hidden=true;changed();});
  $('#search-field').addEventListener('change',changed);
  $('#search-all').addEventListener('click',()=>{setActiveView('dashboard');changed();});
  $('#search-options').addEventListener('toggle',()=>{if($('#search-options').open){options();renderRecent();}});
  $('#search-input').addEventListener('input',renderRecent);
  $('#search-recent').addEventListener('click',(e)=>{const b=e.target.closest('[data-recent]');if(!b)return;const v=recent[+b.dataset.recent];$('#search-input').value=v.query;$('#search-field').value=v.scope;changed();renderRecent();});
  $('#search-save').addEventListener('click',()=>{
    if(!userId) return;read();if(error)return;
    const name=prompt('Tên danh sách (tự cập nhật theo bộ lọc):');if(!name?.trim())return;
    const id='saved:'+Date.now(); const view=!$('#list-view').hidden?'list':!$('#lead-view').hidden?'leads':'dashboard';
    saved.push({id,name:name.trim().slice(0,80),query:$('#search-input').value.trim(),scope:$('#search-field').value,state:JSON.parse(JSON.stringify(state)),view,legacy:legacyState()});persist();refreshSaved(id);
  });
  $('#search-saved').addEventListener('change',()=>{const id=$('#search-saved').value;const view=[...builtins,...saved].find((v)=>v.id===id);$('#search-delete').hidden=!saved.some((v)=>v.id===id);if(view)applySaved(view);});
  $('#search-delete').addEventListener('click',()=>{saved=saved.filter((v)=>v.id!==$('#search-saved').value);persist();refreshSaved();});
  document.addEventListener('click',(e)=>{if(e.target.closest('#customer-list .customer-card,#customer-list .cust-row,#lead-list .lead-card'))remember();});
  document.addEventListener('keydown',(e)=>{
    if ((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k' && currentUser) {e.preventDefault();if($('.topbar').classList.contains('no-search')||!$('#detail-screen').hidden){showDashboardView();showAppScreen();}$('#search-input').focus();$('#search-input').select();return;}
    const input=$('#search-input'),focused=document.activeElement;
    const container=!$('#dashboard-view').hidden?$('#dash-search'):!$('#lead-view').hidden?$('#lead-list'):$('#customer-list');
    if(focused!==input&&!container.contains(focused))return;
    if(e.key==='Escape'&&focused===input){e.preventDefault();input.value='';changed();renderRecent();return;}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      const rows=[...container.querySelectorAll('[data-search-open],.cust-row,.customer-card,.lead-card')];if(!rows.length)return;
      e.preventDefault();let index=rows.indexOf(focused);index=Math.max(0,Math.min(rows.length-1,index+(e.key==='ArrowDown'?1:-1)));rows[index].focus();
    }else if(e.key==='Enter'&&!e.isComposing){remember();if(focused===input){changed();container.querySelector('[data-search-open],.cust-row,.customer-card,.lead-card')?.focus();}else if(focused.matches('.cust-row,.customer-card,.lead-card')){e.preventDefault();focused.click();}}
  });
  window.SearchUI={active,matches,remember,changed,updateScope:(view)=>{$('#search-scope-label').textContent=view==='list'?'Tìm trong Tiềm năng · theo bộ lọc':view==='leads'?'Tìm trong Khách mới · theo bộ lọc':'Tìm trong tất cả khách';},
    setUser:(id)=>{userId=id;state={};meta=new WeakMap();saved=id?load('saved'):[];recent=id?load('recent'):[];write();refreshSaved();renderRecent();$('#search-field').value='all';},
    dataChanged:()=>{meta=new WeakMap();if($('#search-options').open)options();},getState:()=>({...state})};
  refreshSaved();
})();
