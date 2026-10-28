import type { SendKitItem } from './model';

const DB_VERSION = 1;
function databaseName(userId: string) {
  return `crm_send_kit__${userId}`;
}

function openDatabase(userId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName(userId), DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('items'))
        request.result.createObjectStore('items', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Không mở được kho tài liệu trên máy.'));
  });
}

export async function listSendKitItems(userId: string): Promise<SendKitItem[]> {
  const db = await openDatabase(userId);
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('items', 'readonly').objectStore('items').getAll();
      request.onsuccess = () => resolve((request.result as SendKitItem[]).sort((a, b) => a.order - b.order));
      request.onerror = () => reject(request.error ?? new Error('Không đọc được tài liệu đã lưu.'));
    });
  } finally {
    db.close();
  }
}

export async function saveSendKitItem(userId: string, item: SendKitItem): Promise<void> {
  const db = await openDatabase(userId);
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction('items', 'readwrite').objectStore('items').put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('Không lưu được tài liệu.'));
    });
  } finally {
    db.close();
  }
}

export async function deleteSendKitItem(userId: string, id: string): Promise<void> {
  const db = await openDatabase(userId);
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction('items', 'readwrite').objectStore('items').delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('Không xoá được tài liệu.'));
    });
  } finally {
    db.close();
  }
}

export async function reorderSendKitItems(userId: string, items: SendKitItem[]): Promise<void> {
  const db = await openDatabase(userId);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('items', 'readwrite');
      const store = transaction.objectStore('items');
      items.forEach((item, order) => {
        store.put({ ...item, order });
      });
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error('Không đổi được thứ tự tài liệu.'));
      transaction.onerror = () => reject(transaction.error ?? new Error('Không đổi được thứ tự tài liệu.'));
    });
  } finally {
    db.close();
  }
}
