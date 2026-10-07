/* Inventory search and two-way matching live inside the existing Giỏ hàng tool. */
(() => {
  const modal=$('#catalog-modal'), body=$('#cat-body');
  const panel=document.createElement('details');panel.className='search-options cat-search-options';
  panel.innerHTML=`<summary>Tìm căn / khách phù hợp</summary><div class="search-options-body">
    <div class="search-control-row"><label>Tìm căn<input id="inventory-query" type="search" placeholder="Mã căn, dự án, toà, ghi chú…"></label>
    <label>Dự án<select id="inventory-project"><option value="">Tất cả</option></select></label>
    <label>Trạng thái<select id="inventory-status"><option value="">Tất cả</option><option value="available">Còn</option><option value="holding">Giữ chỗ</option><option value="sold">Đã bán</option></select></label>
    <label>Loại căn<input id="inventory-type" placeholder="VD: 2N hoặc 2N-2WC"></label></div>
    <div class="search-control-row"><label>Mã toà<input id="inventory-building"></label><label>Hướng<select id="inventory-direction"><option value="">Tất cả</option>${['Đông','Tây','Nam','Bắc','Đông Bắc','Đông Nam','Tây Bắc','Tây Nam'].map((v)=>`<option>${v}</option>`).join('')}</select></label>
    <label>Tầng từ<input id="inventory-floor-min" type="number" min="0"></label><label>Tầng đến<input id="inventory-floor-max" type="number" min="0"></label></div>
    <div class="search-control-row"><label>Diện tích từ (m²)<input id="inventory-area-min" type="number" min="0" step="any"></label><label>Đến (m²)<input id="inventory-area-max" type="number" min="0" step="any"></label>
    <label>Giá từ (triệu)<input id="inventory-price-min" type="number" min="0" step="any"></label><label>Giá tối đa (triệu)<input id="inventory-price-max" type="number" min="0" step="any"></label></div>
    <p class="pop-hint">Giá gồm VAT và kinh phí bảo trì, theo cùng cách tính với công cụ vay. Căn thiếu số liệu không được coi là đạt điều kiện giá / diện tích.</p>
    <p id="inventory-match-context" class="pop-hint" hidden></p>
    <button id="inventory-reset" class="btn-ghost btn-small" type="button">Xoá tìm / trở về quản lý</button>
    <div id="inventory-results" aria-live="polite"></div></div>`;
  $('#cat-import-preview').before(panel);
  let customerId=null, limit=50, clientUnitId=null, clientLimit=50, timer, unitDocs=new WeakMap();
  const number=(id,mult=1)=>{const v=$('#inventory-'+id).value;return v===''?null:Number(v)*mult;};
  const inputs=['query','project','status','type','building','direction','floor-min','floor-max','area-min','area-max','price-min','price-max'];
  function hasFilters(){return customerId || inputs.some((name)=>$('#inventory-'+name).value!=='');}
  function projectOptions(){const el=$('#inventory-project'),old=el.value;el.innerHTML='<option value="">Tất cả</option>'+Catalog.projects().map((p)=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');el.value=old;}
  function doc(u){if(unitDocs.has(u))return unitDocs.get(u);const p=Catalog.project(u.project_id),b=Catalog.building(u.building_id);const d=CRMSearch.prepare([['Mã căn',u.code],['Mã toà',b?.code||''],['Dự án',p?.name||''],['Loại căn',u.apt_type||''],['Hướng',u.direction||''],['Ghi chú',u.note||'']]);unitDocs.set(u,d);return d;}
  function render(){
    if(!modal.open)return;
    projectOptions();const active=hasFilters();body.hidden=!!active;$('#inventory-results').hidden=!active;
    if(!active){$('#inventory-match-context').hidden=true;$('#inventory-results').replaceChildren();return;}
    const customer=customerId&&allCustomers.find((c)=>c.id===customerId),ctx=CRMSearch.compile($('#inventory-query').value,'property');
    // Inventory also searches its note field; no customer phone heuristics.
    ctx.scope='all';ctx.phoneOnly=false;
    const minPrice=number('price-min',1e6),maxPrice=number('price-max',1e6),minArea=number('area-min'),maxArea=number('area-max'),minFloor=number('floor-min'),maxFloor=number('floor-max');
    const invalid=panel.querySelectorAll('input[type=number]');
    if([...invalid].some((x)=>!x.checkValidity()) || [[minPrice,maxPrice],[minArea,maxArea],[minFloor,maxFloor]].some(([a,b])=>a!=null&&b!=null&&a>b)){$('#inventory-results').textContent='Khoảng lọc chưa hợp lệ: kiểm tra Từ / Đến.';return;}
    if(customerId&&!customer){$('#inventory-results').textContent='Không tìm thấy hồ sơ khách.';return;}
    const rows=[];
    for(const unit of Catalog.units()){
      if($('#inventory-project').value&&unit.project_id!==$('#inventory-project').value)continue;
      if($('#inventory-status').value&&unit.status!==$('#inventory-status').value)continue;
      if($('#inventory-type').value&&!CRMPropertySearch.typeCompatible($('#inventory-type').value,unit.apt_type))continue;
      const building=Catalog.building(unit.building_id);
      if($('#inventory-building').value&&CRMSearch.normalize(building?.code)!==CRMSearch.normalize($('#inventory-building').value))continue;
      if($('#inventory-direction').value&&unit.direction!==$('#inventory-direction').value)continue;
      const result=CRMSearch.match(doc(unit),ctx);if(!result.match)continue;
      const area=Catalog.unitArea(unit),price=CRMPropertySearch.price(unit,Catalog,LoanEngine);
      if(!CRMSearch.range(area,minArea,maxArea)||!CRMSearch.range(price,minPrice,maxPrice)||!CRMSearch.range(unit.floor,minFloor,maxFloor))continue;
      const matching=customer?CRMPropertySearch.match(customer,unit,Catalog,LoanEngine,maxPrice):null;
      if(customer&&!matching)continue;
      rows.push({unit,price,area,score:matching?matching.score:result.score,matching});
    }
    rows.sort((a,b)=>b.score-a.score||String(a.unit.code).localeCompare(String(b.unit.code),'vi',{numeric:true}));
    const context=$('#inventory-match-context');context.hidden=!customer;
    if(customer)context.textContent=`Gợi ý cho ${customer.full_name||'khách'} theo dự án / loại căn đã ghi. Hướng, tầng, diện tích chỉ dùng để xếp ưu tiên. Vốn sẵn có ${customer.finance!=null?formatPrice(customer.finance):'chưa rõ'} không phải giá mua tối đa; nhập giới hạn giá riêng ở trên.`;
    $('#inventory-results').innerHTML=`<p role="status">${rows.length} căn${customer?' còn hàng phù hợp dự án / loại căn':''}</p>`+rows.slice(0,limit).map(({unit,area,price,matching})=>{
      const p=Catalog.project(unit.project_id),b=Catalog.building(unit.building_id);
      return `<article class="inventory-card"><b>${escapeHtml(p?.name||'Chưa rõ dự án')} · ${escapeHtml(b?.code||'')} · ${CRMSearch.highlight(unit.code,ctx.terms.map((t)=>t.text))}</b>
      <p>${escapeHtml(unit.apt_type||'Chưa rõ loại')} · ${area==null?'Chưa rõ diện tích':area+' m²'} · ${escapeHtml(unit.direction||'Chưa rõ hướng')} · ${unit.floor==null?'Chưa rõ tầng':'Tầng '+unit.floor} · ${escapeHtml(Catalog.statusLabel(unit.status))}</p>
      <p>${price==null?'Chưa đủ dữ liệu giá':formatPrice(price)+' gồm VAT + KPBT'}</p>
      ${matching?`<p class="pop-hint">${escapeHtml(matching.reasons.join(' · '))}${matching.missing.length?' · Thiếu: '+escapeHtml(matching.missing.join(', ')):''}</p>`:''}
      <button type="button" class="btn-small" data-inventory-clients="${escapeHtml(unit.id)}">Tìm khách phù hợp</button></article>`;
    }).join('')+(rows.length>limit?`<button class="btn-ghost search-more" type="button" id="inventory-more">Xem thêm (${rows.length-limit} căn)</button>`:'')+'<div id="inventory-client-results"></div>';
    renderClients();
  }
  function renderClients(){
    const unit=Catalog.units().find((u)=>u.id===clientUnitId);if(!unit)return;
      const hits=allCustomers.filter((c)=>!c.disqualified_at&&!isCareDone(c.care_stage)).map((c)=>({c,m:CRMPropertySearch.match(c,unit,Catalog,LoanEngine)})).filter((x)=>x.m).sort((a,b)=>b.m.score-a.m.score);
      const unresolved=allCustomers.filter((c)=>!c.disqualified_at&&!isCareDone(c.care_stage)&&(!c.projects?.length||!c.apt_type)).length;
      $('#inventory-client-results').innerHTML=`<p>${hits.length} khách phù hợp dự án / loại căn. ${unresolved} khách chưa đủ hai thông tin này để đối chiếu.</p>`+hits.slice(0,clientLimit).map(({c,m})=>`<button type="button" class="search-row" data-inventory-open="${escapeHtml(c.id)}"><span>${escapeHtml(c.full_name||'Chưa có tên')}<small>${escapeHtml(m.reasons.join(' · '))}${m.missing.length?' · Thiếu '+escapeHtml(m.missing.join(', ')):''}</small></span></button>`).join('')+(hits.length>clientLimit?`<button type="button" class="btn-ghost search-more" id="inventory-client-more">Xem thêm (${hits.length-clientLimit} khách)</button>`:'');
  }
  function reset(){clearTimeout(timer);clientUnitId=null;customerId=null;limit=50;inputs.forEach((name)=>{$('#inventory-'+name).value='';});$('#inventory-match-context').hidden=true;render();}
  panel.addEventListener('input',(e)=>{if(e.isComposing)return;clearTimeout(timer);timer=setTimeout(()=>{clientUnitId=null;limit=50;render();},120);});
  panel.addEventListener('compositionend',()=>{clearTimeout(timer);timer=setTimeout(render,120);});
  panel.addEventListener('change',(e)=>{if(e.target.tagName!=='SELECT')return;clearTimeout(timer);clientUnitId=null;limit=50;render();});
  panel.addEventListener('toggle',()=>{if(panel.open)render();});
  $('#inventory-reset').addEventListener('click',reset);
  panel.addEventListener('click',(e)=>{
    if(e.target.closest('#inventory-client-more')){clientLimit+=50;renderClients();return;}
    if(e.target.closest('#inventory-more')){limit+=50;render();return;}
    const pick=e.target.closest('[data-inventory-clients]');
    if(pick){const unit=Catalog.units().find((u)=>u.id===pick.dataset.inventoryClients);if(!unit)return;
      clientUnitId=unit.id;clientLimit=50;renderClients();
      $('#inventory-client-results').scrollIntoView({block:'nearest'});return;
    }
    const client=e.target.closest('[data-inventory-open]');if(client){modal.close();openDetail(client.dataset.inventoryOpen);}
  });
  Catalog.onChange(()=>{unitDocs=new WeakMap();if(modal.open)render();});
  $('#catalog-btn').addEventListener('click',()=>{reset();projectOptions();});
  async function forCustomer(id){
    const c=allCustomers.find((x)=>x.id===id);if(!c)return;
    if(!c.projects?.length||!c.apt_type){showToast('Bổ sung dự án và loại căn trước khi tìm căn phù hợp.');return;}
    $('#catalog-btn').click();customerId=id;panel.open=true;$('#inventory-status').value='available';render();
  }
  const button=document.createElement('button');button.type='button';button.className='btn-small';button.id='detail-match-units';button.textContent='Tìm căn phù hợp';
  $('#detail-loan-btn').after(button);button.addEventListener('click',()=>forCustomer(detailId));
  window.CatalogSearchUI={render,reset,forCustomer};
})();
