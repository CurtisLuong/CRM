// Bản sao hợp đồng src/config/banks.ts; test bắt buộc đối chiếu mã và ngưỡng.
export const BANK_SOURCES = [
  { code: 'bidv', name: 'BIDV', url: 'https://bidv.com.vn/' },
  { code: 'vietinbank', name: 'VietinBank', url: 'https://vietinbank.vn/' },
  { code: 'agribank', name: 'Agribank', url: 'https://agribank.com.vn/' },
  { code: 'vietcombank', name: 'Vietcombank', url: 'https://vietcombank.com.vn/' },
  { code: 'mb', name: 'MB', url: 'https://mbbank.com.vn/' },
  { code: 'techcombank', name: 'Techcombank', url: 'https://techcombank.com/' },
  { code: 'vpbank', name: 'VPBank', url: 'https://vpbank.com.vn/' },
  { code: 'hdbank', name: 'HDBank', url: 'https://hdbank.com.vn/' },
  { code: 'acb', name: 'ACB', url: 'https://acb.com.vn/' },
  { code: 'sacombank', name: 'Sacombank', url: 'https://sacombank.com.vn/' },
];

export const NEWS_FEEDS = [
  'https://cafef.vn/tai-chinh-ngan-hang.rss',
  'https://vnexpress.net/rss/kinh-doanh.rss',
  'https://vneconomy.vn/tai-chinh.rss',
  'https://vietnambiz.vn/tai-chinh/ngan-hang.rss',
  'https://baodautu.vn/ngan-hang.rss',
];

export const NEWS_SEARCH_FEEDS = ['lãi suất vay mua nhà', 'lãi suất cho vay mua nhà ngân hàng'].map(
  (query) => `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss&setlang=vi`,
);

// Chỉ mở thêm các báo được giao; kết quả tìm kiếm không được tự mở host bất kỳ.
export const NEWS_PUBLISHERS = [
  ...NEWS_FEEDS,
  'https://vietstock.vn/',
  'https://dantri.com.vn/',
  'https://vietnamnet.vn/',
  'https://baomoi.com/',
  'https://soha.vn/',
];

export const BANK_RATE_LIMITS = { min: 3, max: 20 };
export const BANK_RATES_CRON = '0 0 * * *';
export const MAX_PAGES = 30;
export const MIN_NEWS_PAGES = 12;
export const MAX_TEXT = 12_000;
export const MAX_NEWS_AGE_DAYS = 45;
export const AI_TIMEOUT_MS = 45_000;
