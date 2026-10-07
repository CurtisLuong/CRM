/* Deterministic inventory matching. Finance is capital, never a purchase budget. */
(function(root) {
  'use strict';
  function typeCompatible(wanted, actual) {
    const a=CRMSearch.aliases(wanted), b=CRMSearch.aliases(actual);
    return !!a && !!b && (/^\d+n\+?$/.test(a) ? b===a||b.startsWith(a+'-')||b.startsWith(a+',')||b.startsWith(a+'+') : a===b);
  }
  function price(unit, catalog, engine) {
    const p=catalog.project(unit.project_id), area=catalog.unitArea(unit), perM2=catalog.unitPrice(unit);
    if (!p || (!unit.net_price_override && (!area || !perM2))) return null;
    return engine.calcPrice({area:area||0,pricePerM2:perM2||0,netPriceOverride:unit.net_price_override,
      vatRate:p.vat_rate==null?5:+p.vat_rate,kpbtRate:p.kpbt_rate==null?2:+p.kpbt_rate}).full;
  }
  function match(customer, unit, catalog, engine, maxPrice=null) {
    const p=catalog.project(unit.project_id), reasons=[], missing=[];
    if (!p || !Array.isArray(customer.projects) || !customer.projects.includes(p.name) || !typeCompatible(customer.apt_type,unit.apt_type)) return null;
    let score=90;reasons.push('Đúng dự án','Đúng loại căn');
    const total=price(unit,catalog,engine);
    if (maxPrice!=null && (total==null || total>maxPrice)) return null;
    if (maxPrice!=null) reasons.push('Trong giá tối đa đã chọn');
    if (total==null) missing.push('giá');
    if(customer.apt_direction){if(!unit.direction)missing.push('hướng');else if(CRMSearch.normalize(customer.apt_direction)===CRMSearch.normalize(unit.direction)){score+=10;reasons.push('Cùng hướng hồ sơ');}else reasons.push('Hướng khác hồ sơ');}
    if(customer.apt_floor!=null){if(unit.floor==null)missing.push('tầng');else if(+customer.apt_floor===+unit.floor){score+=10;reasons.push('Cùng tầng hồ sơ');}else reasons.push('Tầng khác hồ sơ');}
    const area=catalog.unitArea(unit);
    if(customer.apt_area!=null){if(area==null)missing.push('diện tích');else if(Math.abs(+customer.apt_area-area)<=5){score+=10;reasons.push('Diện tích gần hồ sơ (±5 m²)');}else reasons.push('Diện tích khác hồ sơ');}
    if(unit.status!=='available')return null;
    return {score,reasons,missing,total};
  }
  root.CRMPropertySearch={typeCompatible,price,match};
  if(typeof module!=='undefined')module.exports=root.CRMPropertySearch;
})(typeof window!=='undefined'?window:globalThis);
