// Quy tắc "tên chiến dịch → dự án" (bảng `lead_campaign_projects`, SQL/v2/009).
// Chỉ ĐỌC, tối đa 1 lượt gọi mạng mỗi lần chạy; đọc lỗi = không có quy tắc — không chặn lead (luật 6).

/** So khớp tên chiến dịch: bỏ khoảng trắng hai đầu, không phân biệt hoa thường. */
export function campaignKey(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Trả hàm `projectFor(campaign)`: lần gọi đầu đọc cả bảng quy tắc của người nhận lead rồi cache
 * cho hết lượt chạy (cron/webhook xử lý nhiều lead vẫn chỉ 1 lượt fetch).
 */
export function createProjectRules(store, ownerId) {
  let loaded = false;
  let rules = [];

  async function loadOnce() {
    if (loaded) return rules;
    loaded = true; // đánh dấu trước khi gọi: lỗi cũng không thử lại trong cùng lượt chạy
    try {
      const data = await store.campaignProjects(ownerId);
      rules = Array.isArray(data) ? data : [];
    } catch {
      rules = [];
    }
    return rules;
  }

  return async function projectFor(campaign) {
    const key = campaignKey(campaign);
    if (!ownerId || !key) return null;
    const list = await loadOnce();
    const rule = list.find((item) => item && !item.archived_at && campaignKey(item.campaign) === key);
    const project = rule && typeof rule.project === 'string' ? rule.project.trim() : '';
    return project || null;
  };
}
