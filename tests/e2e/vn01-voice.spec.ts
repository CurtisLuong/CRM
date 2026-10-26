import { expect, test } from '@playwright/test';

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`VN-01 voice note ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test('shows interim text, replaces it on stop, and saves after stopping a live session', async ({ page }, info) => {
      const userId = `vn01-${info.project.name}-${scheme}`;
      const customerId = `${userId}-customer`;
      await page.route('http://127.0.0.1:54321/**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
      );
      await page.addInitScript((id) => {
        class MockSpeechRecognition {
          static latest: MockSpeechRecognition | null = null;
          lang = '';
          interimResults = false;
          continuous = false;
          onresult: ((event: unknown) => void) | null = null;
          onerror: ((event: unknown) => void) | null = null;
          onend: (() => void) | null = null;
          start() {
            MockSpeechRecognition.latest = this;
          }
          stop() {
            this.onresult?.({
              resultIndex: 0,
              results: [{ isFinal: true, 0: { transcript: 'Khách quan tâm căn 2 phòng ngủ' } }],
            });
            this.onend?.();
          }
          abort() {}
        }
        (window as Window & { SpeechRecognition?: typeof MockSpeechRecognition }).SpeechRecognition =
          MockSpeechRecognition;
        (window as Window & { __MockSpeechRecognition?: typeof MockSpeechRecognition }).__MockSpeechRecognition =
          MockSpeechRecognition;
        const user = {
          id,
          aud: 'authenticated',
          role: 'authenticated',
          email: 'e2e@example.test',
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: {},
          created_at: '2026-10-01T00:00:00.000Z',
        };
        localStorage.setItem('crm_last_user', JSON.stringify({ id, email: user.email }));
        localStorage.setItem(
          'sb-127-auth-token',
          JSON.stringify({
            access_token: 'synthetic-e2e-token',
            refresh_token: 'synthetic-e2e-refresh',
            expires_at: 4102444800,
            expires_in: 3600,
            token_type: 'bearer',
            user,
          }),
        );
      }, userId);
      await page.goto('/');
      await page.evaluate(
        async ({ id, customer }) => {
          const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(id)}`, 2);
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            request.onupgradeneeded = () => {
              const database = request.result;
              if (!database.objectStoreNames.contains('customers'))
                database.createObjectStore('customers', { keyPath: 'id' });
              if (!database.objectStoreNames.contains('queue'))
                database.createObjectStore('queue', { keyPath: 'opId', autoIncrement: true });
              if (!database.objectStoreNames.contains('meta')) database.createObjectStore('meta', { keyPath: 'key' });
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(['customers', 'meta'], 'readwrite');
            tx.objectStore('customers').put({
              id: customer,
              owner_id: id,
              full_name: 'Khách VN-01',
              phone: '0901234567',
              qualified_at: '2026-10-01T03:00:00.000Z',
              care_stage: 'Đang chăm sóc',
              registered_at: '2026-10-01T03:00:00.000Z',
              created_at: '2026-10-01T03:00:00.000Z',
              updated_at: '2026-10-01T03:00:00.000Z',
              call_attempts: [],
              next_tasks: [],
            });
            tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
          });
          db.close();
        },
        { id: userId, customer: customerId },
      );
      await page.goto('/thao-tac-nhanh');
      await expect(page.getByRole('heading', { name: 'Khách VN-01' })).toBeVisible();
      await page.getByRole('button', { name: 'Ghi chú', exact: true }).click();

      const note = page.getByRole('textbox', { name: 'Nội dung ghi chú' });
      await note.fill('Đã nhập trước');
      const start = page.getByRole('button', { name: 'Nói để ghi chú' });
      await start.click();
      const stop = page.getByRole('button', { name: 'Dừng nghe' });
      await expect(stop).toBeVisible();
      await expect(page.getByRole('button', { name: 'Lưu', exact: true })).toBeEnabled();
      const fieldBox = await note.boundingBox();
      const buttonBox = await stop.boundingBox();
      if (!fieldBox || !buttonBox) throw new Error('Không đo được ô ghi chú hoặc nút micro.');
      expect(buttonBox.width).toBeGreaterThanOrEqual(44);
      expect(buttonBox.height).toBeGreaterThanOrEqual(44);
      expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(fieldBox.x + fieldBox.width);
      expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(fieldBox.y + fieldBox.height);

      await page.evaluate(() => {
        const recognition = (
          window as Window & { __MockSpeechRecognition?: { latest: { onresult?: (event: unknown) => void } | null } }
        ).__MockSpeechRecognition?.latest;
        recognition?.onresult?.({
          resultIndex: 0,
          results: [{ isFinal: false, 0: { transcript: 'khách đang xem căn' } }],
        });
      });
      await expect(note).toHaveValue('Đã nhập trước khách đang xem căn');
      await stop.click();
      await expect(page.getByRole('button', { name: 'Nói để ghi chú' })).toBeVisible();
      await expect(note).toHaveValue('Đã nhập trước Khách quan tâm căn 2 phòng ngủ');

      await note.fill('Ghi nhanh lần hai');
      await page.getByRole('button', { name: 'Nói để ghi chú' }).click();
      await page.evaluate(() => {
        const recognition = (
          window as Window & { __MockSpeechRecognition?: { latest: { onresult?: (event: unknown) => void } | null } }
        ).__MockSpeechRecognition?.latest;
        recognition?.onresult?.({
          resultIndex: 0,
          results: [{ isFinal: false, 0: { transcript: 'đang nhận dạng' } }],
        });
      });
      await expect(note).toHaveValue('Ghi nhanh lần hai đang nhận dạng');
      await page.getByRole('button', { name: 'Lưu', exact: true }).click();
      await expect(page.getByRole('heading', { name: /Ghi chú nhanh/ })).toHaveCount(0);
      const savedText = await page.evaluate(
        async ({ id, customer }) => {
          const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(id)}`, 2);
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          const row = await new Promise<{ notes_manual?: Array<{ text: string }> }>((resolve, reject) => {
            const get = db.transaction('customers').objectStore('customers').get(customer);
            get.onsuccess = () => resolve(get.result);
            get.onerror = () => reject(get.error);
          });
          db.close();
          return row.notes_manual?.[0]?.text;
        },
        { id: userId, customer: customerId },
      );
      expect(savedText).toBe('Ghi nhanh lần hai Khách quan tâm căn 2 phòng ngủ');
      const dimensions = await page.evaluate(() => ({
        width: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.width);
    });
  });
}
