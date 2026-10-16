/// <reference types="node" />
// Chạy legacy/js/db.js THẬT (v1) trên 1 IDBFactory (fake-indexeddb) dùng chung với code v2 — để kiểm
// v1 ⇄ v2 cùng đọc/ghi 1 IndexedDB. Không sửa file v1.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const DB_JS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'legacy', 'js', 'db.js');

export type Call = [op: 'upsert' | 'update' | 'delete', ...args: unknown[]];

/** Client Supabase giả cho v1: ghi lại lời gọi; failWith(i) → lời gọi thứ i trả lỗi đó. */
export function fakeSupabase(fail: (call: Call, i: number) => { code?: string; message?: string } | null = () => null) {
  const calls: Call[] = [];
  const done = (call: Call) => {
    calls.push(call);
    return Promise.resolve({ error: fail(call, calls.length - 1) });
  };
  return {
    calls,
    from(table: string) {
      if (table !== 'customers') throw new Error(`bảng lạ ${table}`);
      return {
        upsert: (p: unknown) => done(['upsert', p]),
        update: (p: unknown) => ({ eq: (_c: string, id: unknown) => done(['update', id, p]) }),
        delete: () => ({ eq: (_c: string, id: unknown) => done(['delete', id]) }),
      };
    },
  };
}

export type V1 = {
  // biome-ignore lint/suspicious/noExplicitAny: API v1 không có kiểu
  CRM: any;
  navigator: { onLine: boolean };
  localStorage: Map<string, string>;
  run: (code: string) => unknown;
};

export function loadV1Db(idb: IDBFactory): V1 {
  const store = new Map<string, string>();
  const navigator = { onLine: false };
  const sandbox: Record<string, unknown> = {
    indexedDB: idb,
    navigator,
    crypto: { randomUUID: () => crypto.randomUUID() },
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
    },
    console: { log() {}, info() {}, warn() {}, error() {} },
    addEventListener() {},
    setTimeout,
    clearTimeout,
    Date,
    JSON,
    Promise,
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(DB_JS, 'utf8'), ctx, { filename: 'js/db.js' });
  return { CRM: sandbox.CRM, navigator, localStorage: store, run: (code) => vm.runInContext(code, ctx) };
}

/** Đọc thô 1 store (không qua v1 hay v2). */
export function rawAll(idb: IDBFactory, dbName: string, storeName: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const open = idb.open(dbName);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const req = db.transaction(storeName).objectStore(storeName).getAll();
      req.onsuccess = () => {
        db.close();
        resolve(req.result);
      };
      req.onerror = () => reject(req.error);
    };
  });
}

/** Ghi thô nhiều bản ghi vào 1 store đã có. */
export function rawPut(idb: IDBFactory, dbName: string, storeName: string, rows: unknown[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = idb.open(dbName);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(storeName, 'readwrite');
      for (const r of rows) tx.objectStore(storeName).put(r);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}
