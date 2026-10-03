/*!
 * loan-store.js — Lưu/đọc dữ liệu cho module tính vay.
 * Có Supabase → dùng Supabase (đồng bộ mọi máy). Không có / lỗi mạng → dùng bộ nhớ trình duyệt.
 */
(function (root) {
  'use strict';
  var LS_KEY = 'loanModule.settings.v1';

  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bỏ qua */ } }

  function createStore(supabase) {
    var sb = supabase || null;

    async function uid() {
      if (!sb || !sb.auth) return null;
      try { var r = await sb.auth.getUser(); return r && r.data && r.data.user ? r.data.user.id : null; }
      catch (e) { return null; }
    }

    return {
      hasRemote: !!sb,

      // Cài đặt "lần cuối" (lãi suất, kỳ hạn, ân hạn, phí...)
      async loadSettings() {
        var local = lsGet(LS_KEY);
        if (!sb) return local;
        try {
          var id = await uid();
          if (!id) return local;
          var r = await sb.from('loan_settings').select('settings').eq('user_id', id).maybeSingle();
          if (r.error) throw r.error;
          return (r.data && r.data.settings) || local;
        } catch (e) { console.warn('[loan] loadSettings', e); return local; }
      },

      async saveSettings(settings) {
        lsSet(LS_KEY, settings);
        if (!sb) return;
        try {
          var id = await uid();
          if (!id) return;
          var r = await sb.from('loan_settings').upsert({ user_id: id, settings: settings, updated_at: new Date().toISOString() });
          if (r.error) throw r.error;
        } catch (e) { console.warn('[loan] saveSettings', e); }
      },

      // Dự án + loại căn (đơn giá/m2 chuẩn)
      async loadProjects() {
        if (!sb) return null;
        try {
          var r = await sb.from('projects')
            .select('id,name,vat_rate,kpbt_rate,handover_date,payment_schedule,unit_types:project_unit_types(id,name,price_per_m2)')
            .order('name');
          if (r.error) throw r.error;
          return r.data;
        } catch (e) { console.warn('[loan] loadProjects', e); return null; }
      },

      async loadBankPresets() {
        if (!sb) return null;
        try {
          var r = await sb.from('bank_presets').select('*').order('sort_order');
          if (r.error) throw r.error;
          return (r.data || []).map(function (b) {
            return { key: b.key, name: b.name, ltv: +b.ltv, termYears: +b.term_years,
                     rateTiers: b.rate_tiers, floatingRate: +b.floating_rate,
                     maxGraceMonths: b.max_grace_months, prepayFees: b.prepay_fees };
          });
        } catch (e) { console.warn('[loan] loadBankPresets', e); return null; }
      },

      // Lưu một phương án, gắn với khách hàng
      async saveQuote(q) {
        if (!sb) throw new Error('Chưa kết nối Supabase');
        var r = await sb.from('loan_quotes').insert({
          customer_id: q.customerId || null,
          project_id: q.projectId || null,
          unit_code: q.unitCode || null,
          inputs: q.inputs,
          summary: q.summary
        }).select('id').single();
        if (r.error) throw r.error;
        return r.data.id;
      },

      async listQuotes(customerId) {
        if (!sb) return [];
        var r = await sb.from('loan_quotes').select('id,created_at,unit_code,summary,inputs')
          .eq('customer_id', customerId).order('created_at', { ascending: false });
        if (r.error) throw r.error;
        return r.data;
      }
    };
  }

  var api = { createStore: createStore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LoanStore = api;
})(typeof window !== 'undefined' ? window : this);
