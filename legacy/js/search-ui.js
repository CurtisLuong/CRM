/* Keyboard navigation for search; refinements live in each page's existing filter. */
(() => {
  document.addEventListener('keydown',(e)=>{
    if ((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k' && currentUser) {e.preventDefault();if($('.topbar').classList.contains('no-search')||!$('#detail-screen').hidden){showDashboardView();showAppScreen();}$('#search-input').focus();$('#search-input').select();return;}
    const input=$('#search-input'),focused=document.activeElement;
    const container=!$('#dashboard-view').hidden?$('#dash-search'):!$('#lead-view').hidden?$('#lead-list'):$('#customer-list');
    if(focused!==input&&!container.contains(focused))return;
    if(e.key==='Escape'&&focused===input){e.preventDefault();input.value='';resetSearchPages();renderSearchView();return;}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      const rows=[...container.querySelectorAll('[data-search-open],.cust-row,.customer-card,.lead-card')];if(!rows.length)return;
      e.preventDefault();let index=rows.indexOf(focused);index=Math.max(0,Math.min(rows.length-1,index+(e.key==='ArrowDown'?1:-1)));rows[index].focus();
    }else if(e.key==='Enter'&&!e.isComposing){if(focused===input){resetSearchPages();renderSearchView();container.querySelector('[data-search-open],.cust-row,.customer-card,.lead-card')?.focus();}else if(focused.matches('.cust-row,.customer-card,.lead-card')){e.preventDefault();focused.click();}}
  });
})();
