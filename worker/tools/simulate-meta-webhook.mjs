#!/usr/bin/env node
// Gửi 1 webhook `leadgen` mẫu ĐÃ KÝ tới Worker để thử hàng chờ/chống trùng.
// App Secret lấy từ biến môi trường FB_APP_SECRET. Không có URL production mặc định.
//
//   FB_APP_SECRET=... node worker/tools/simulate-meta-webhook.mjs [url]
//
// Mặc định gửi tới http://127.0.0.1:8787/fb/webhook (wrangler dev).
import { pathToFileURL } from 'node:url';
import { signBody } from '../meta/signature.js';

export const SAMPLE = {
  object: 'page',
  pageId: '111',
  time: 1792375200,
  leadgenId: '444',
  formId: '222',
  adId: '333',
  adgroupId: '555',
  createdTime: 1792375200,
};

/** Body mẫu đúng từng byte (test chữ ký dùng cùng hàm này). */
export function buildBody(values = {}) {
  const v = { ...SAMPLE, ...values };
  return JSON.stringify({
    object: v.object,
    entry: [
      {
        id: v.pageId,
        time: v.time,
        changes: [
          {
            field: 'leadgen',
            value: {
              leadgen_id: v.leadgenId,
              page_id: v.pageId,
              form_id: v.formId,
              ad_id: v.adId,
              adgroup_id: v.adgroupId,
              created_time: v.createdTime,
            },
          },
        ],
      },
    ],
  });
}

/** { raw, headers } — hàm export để test kiểm lại bằng chính hàm kiểm chữ ký của Worker. */
export async function buildPayload(values = {}, secret = '') {
  const raw = buildBody(values);
  return {
    raw,
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Signature-256': await signBody(raw, secret),
    },
  };
}

async function main() {
  const url = process.argv[2] || 'http://127.0.0.1:8787/fb/webhook';
  const secret = process.env.FB_APP_SECRET;
  if (!secret) {
    console.error('Thiếu biến môi trường FB_APP_SECRET (App Secret của app Meta).');
    process.exitCode = 1;
    return;
  }
  const { raw, headers } = await buildPayload({}, secret);
  const response = await fetch(url, { method: 'POST', headers, body: raw });
  console.log(`POST ${url} → ${response.status} ${response.statusText}`);
  const text = await response.text();
  if (text) console.log(text);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
