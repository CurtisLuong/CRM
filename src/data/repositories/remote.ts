/** Online-only storage, settings and team adapters, ported from legacy/js/db.js. */
// biome-ignore-all lint/suspicious/noExplicitAny: Supabase rows and JSON settings retain future properties.
import type { CustomerSync } from '../sync';
import type { CustomerRepository, Data } from './customers';

type UploadFile = Blob & { name?: string };
const settingsWrites = new WeakMap<CustomerSync, Promise<unknown>>();
const DOC_BUCKET = 'customer-docs',
  AVATAR_BUCKET = 'customer-avatars';
export function createRemoteRepository(sync: CustomerSync, customers: CustomerRepository) {
  const _supabase: any = sync.client;
  async function guard(request: () => PromiseLike<any>): Promise<any> {
    sync.local.assertOpen();
    const value = await request();
    sync.local.assertOpen();
    return value;
  }
  return {
    async listDocuments(customerId: string) {
      sync.local.assertOpen();
      if (!sync.isOnline() || !_supabase) return [];
      const { data, error } = await guard(() =>
        _supabase.from('documents').select('*').eq('customer_id', customerId).order('created_at', { ascending: true }),
      );
      if (error) {
        console.warn('listDocuments lỗi:', error);
        return [];
      }
      return data || [];
    },
    async uploadDocument(customerId: string, file: UploadFile, kind = 'khac', label: string | null = null) {
      sync.local.assertOpen();
      await sync.local.assertWritable(customerId);
      if (!sync.isOnline() || !_supabase) throw new Error('Cần mạng để tải tài liệu lên');
      const mime = file.type || 'application/octet-stream';
      let ext = 'bin';
      if (file.name?.includes('.')) ext = (file.name.split('.').pop() || 'bin').toLowerCase();
      else if (mime === 'application/pdf') ext = 'pdf';
      else if (mime.startsWith('image/')) ext = mime.split('/')[1] || 'jpg';
      const docId = crypto.randomUUID();
      const path = `${sync.local.userId}/${customerId}/${docId}.${ext}`;
      const up = await guard(() =>
        _supabase.storage.from(DOC_BUCKET).upload(path, file, { contentType: mime, upsert: false }),
      );
      if (up.error) throw up.error;
      const row = {
        id: docId,
        customer_id: customerId,
        owner_id: sync.local.userId,
        kind,
        label,
        storage_path: path,
        mime,
        size: file.size || null,
      };
      const { error } = await guard(() => _supabase.from('documents').insert(row));
      if (error) {
        // rollback file đã upload nếu tạo metadata lỗi
        await guard(() => _supabase.storage.from(DOC_BUCKET).remove([path]));
        throw error;
      }
      return row;
    },
    async deleteDocument(doc: Data) {
      sync.local.assertOpen();
      await sync.local.assertWritable(doc?.customer_id);
      if (!sync.isOnline() || !_supabase) throw new Error('Cần mạng để xoá tài liệu');
      await guard(() => _supabase.storage.from(DOC_BUCKET).remove([doc.storage_path]));
      const { error } = await guard(() => _supabase.from('documents').delete().eq('id', doc.id));
      if (error) throw error;
    },
    async uploadAvatar(customerId: string, file: UploadFile) {
      sync.local.assertOpen();
      await sync.local.assertWritable(customerId);
      if (!sync.isOnline() || !_supabase) throw new Error('Cần mạng để đổi ảnh đại diện');
      const existing = (await sync.local.getAll()).find((r) => r.id === customerId);
      const oldPath = existing?.avatar_path;
      const mime = file.type || 'image/jpeg';
      const ext = mime.startsWith('image/') ? mime.split('/')[1] || 'jpg' : 'jpg';
      const path = `${sync.local.userId}/${customerId}/avatar-${Date.now()}.${ext}`;
      const up = await guard(() =>
        _supabase.storage.from(AVATAR_BUCKET).upload(path, file, { contentType: mime, upsert: false }),
      );
      if (up.error) throw up.error;
      await customers.update(customerId, { avatar_path: path }); // ghi vào record (offline-first + đồng bộ)
      // Dọn file avatar cũ (không chặn nếu lỗi — chỉ là rác nhẹ trong bucket). File cũ có thể
      // còn nằm ở bucket tài liệu (trước migrate) → thử xoá ở CẢ 2 bucket cho sạch.
      if (oldPath && oldPath !== path) {
        for (const b of [AVATAR_BUCKET, DOC_BUCKET]) {
          try {
            await guard(() => _supabase.storage.from(b).remove([oldPath]));
          } catch (_e) {
            /* bỏ qua */
          }
        }
      }
      return path;
    },
    avatarUrl(path: string | null | undefined) {
      sync.local.assertOpen();
      if (!path || !_supabase) return null;
      const { data } = _supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      return data?.publicUrl || null;
    },
    async removeAvatar(customerId: string) {
      sync.local.assertOpen();
      await sync.local.assertWritable(customerId);
      const existing = (await sync.local.getAll()).find((r) => r.id === customerId);
      const oldPath = existing?.avatar_path;
      if (oldPath && sync.isOnline() && _supabase) {
        for (const b of [AVATAR_BUCKET, DOC_BUCKET]) {
          try {
            await guard(() => _supabase.storage.from(b).remove([oldPath]));
          } catch (_e) {
            /* bỏ qua */
          }
        }
      }
      await customers.update(customerId, { avatar_path: null });
    },
    async uploadCover(customerId: string, file: UploadFile) {
      sync.local.assertOpen();
      await sync.local.assertWritable(customerId);
      if (!sync.isOnline() || !_supabase) throw new Error('Cần mạng để đổi ảnh bìa');
      const existing = (await sync.local.getAll()).find((r) => r.id === customerId);
      const oldPath = existing?.cover_path;
      const mime = file.type || 'image/jpeg';
      const ext = mime.startsWith('image/') ? mime.split('/')[1] || 'jpg' : 'jpg';
      const path = `${sync.local.userId}/${customerId}/cover-${Date.now()}.${ext}`;
      const up = await guard(() =>
        _supabase.storage.from(AVATAR_BUCKET).upload(path, file, { contentType: mime, upsert: false }),
      );
      if (up.error) throw up.error;
      await customers.update(customerId, { cover_path: path });
      if (oldPath && oldPath !== path) {
        try {
          await guard(() => _supabase.storage.from(AVATAR_BUCKET).remove([oldPath]));
        } catch (_e) {
          /* bỏ qua */
        }
      }
      return path;
    },
    coverUrl(path: string | null | undefined) {
      sync.local.assertOpen();
      if (!path || !_supabase) return null;
      const { data } = _supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      return data?.publicUrl || null;
    },
    async removeCover(customerId: string) {
      sync.local.assertOpen();
      await sync.local.assertWritable(customerId);
      const existing = (await sync.local.getAll()).find((r) => r.id === customerId);
      const oldPath = existing?.cover_path;
      if (oldPath && sync.isOnline() && _supabase) {
        try {
          await guard(() => _supabase.storage.from(AVATAR_BUCKET).remove([oldPath]));
        } catch (_e) {
          /* bỏ qua */
        }
      }
      await customers.update(customerId, { cover_path: null });
    },
    async signedDocUrl(storagePath: string, expires = 60) {
      sync.local.assertOpen();
      if (!sync.isOnline() || !_supabase) return null;
      const { data, error } = await guard(() =>
        _supabase.storage.from(DOC_BUCKET).createSignedUrl(storagePath, expires),
      );
      if (error) {
        console.warn('signedDocUrl lỗi:', error);
        return null;
      }
      return data.signedUrl;
    },
    async getZaloGreetingRemote() {
      sync.local.assertOpen();
      if (!sync.isOnline() || !_supabase || !sync.local.userId) return undefined;
      const { data, error } = await guard(() =>
        _supabase.from('user_settings').select('zalo_greeting').eq('id', sync.local.userId).maybeSingle(),
      );
      if (error) {
        console.warn('getZaloGreeting remote lỗi:', error.message || error);
        return undefined;
      }
      return data ? data.zalo_greeting : null;
    },
    async saveZaloGreetingRemote(text: string) {
      sync.local.assertOpen();
      if (!sync.isOnline() || !_supabase || !sync.local.userId) return false;
      const { error } = await guard(() =>
        _supabase
          .from('user_settings')
          .upsert({ id: sync.local.userId, zalo_greeting: text, updated_at: new Date().toISOString() }),
      );
      if (error) {
        console.warn('saveZaloGreeting remote lỗi:', error.message || error);
        return false;
      }
      return true;
    },
    async getZaloTemplatesRemote() {
      sync.local.assertOpen();
      if (!sync.isOnline() || !_supabase || !sync.local.userId) return undefined;
      const { data, error } = await guard(() =>
        _supabase.from('user_settings').select('zalo_templates').eq('id', sync.local.userId).maybeSingle(),
      );
      if (error) {
        console.warn('getZaloTemplates remote lỗi (đã chạy SQL/add_zalo_templates.sql chưa?):', error.message || error);
        return undefined;
      }
      return data ? data.zalo_templates : null;
    },
    async saveZaloTemplatesRemote(list: Data[]) {
      sync.local.assertOpen();
      if (!sync.isOnline() || !_supabase || !sync.local.userId) return false;
      const { error } = await guard(() =>
        _supabase
          .from('user_settings')
          .upsert({ id: sync.local.userId, zalo_templates: list, updated_at: new Date().toISOString() }),
      );
      if (error) {
        console.warn(
          'saveZaloTemplates remote lỗi (đã chạy SQL/add_zalo_templates.sql chưa?):',
          error.message || error,
        );
        return false;
      }
      return true;
    },
    async getAiSettingsRemote() {
      sync.local.assertOpen();
      if (!sync.isOnline() || !_supabase || !sync.local.userId) return undefined;
      const { data, error } = await guard(() =>
        _supabase.from('user_settings').select('ai_settings').eq('id', sync.local.userId).maybeSingle(),
      );
      if (error) {
        console.warn('getAiSettings remote lỗi (đã chạy SQL/add_ai_settings.sql chưa?):', error.message || error);
        return undefined;
      }
      return data ? data.ai_settings : null;
    },
    async saveAiSettingsRemote(obj: Data) {
      sync.local.assertOpen();
      if (!sync.isOnline() || !_supabase || !sync.local.userId) return false;
      const { error } = await guard(() =>
        _supabase
          .from('user_settings')
          .upsert({ id: sync.local.userId, ai_settings: obj, updated_at: new Date().toISOString() }),
      );
      if (error) {
        console.warn('saveAiSettings remote lỗi (đã chạy SQL/add_ai_settings.sql chưa?):', error.message || error);
        return false;
      }
      return true;
    },
    async teamList() {
      sync.local.assertOpen();
      if (!sync.isOnline() || !_supabase) return undefined;
      const { data, error } = await guard(() => _supabase.rpc('team_list'));
      if (error) {
        console.warn('team_list lỗi (đã chạy SQL/add_team_assign.sql chưa?):', error.message || error);
        return undefined;
      }
      return data || [];
    },
    async teamAdd(email: string) {
      sync.local.assertOpen();
      if (!sync.isOnline() || !_supabase) throw new Error('Cần mạng để thêm đồng nghiệp');
      const { data, error } = await guard(() => _supabase.rpc('team_add', { member_email: email }));
      if (error) throw error;
      return data;
    },
    async teamRemove(userId: string) {
      sync.local.assertOpen();
      if (!sync.isOnline() || !_supabase) throw new Error('Cần mạng để xoá đồng nghiệp');
      const { error } = await guard(() => _supabase.rpc('team_remove', { member_id: userId }));
      if (error) throw error;
    },
    async setMyName(name: string) {
      sync.local.assertOpen();
      if (!sync.isOnline() || !_supabase) throw new Error('Cần mạng để đổi tên');
      const { error } = await guard(() => _supabase.rpc('team_set_my_name', { new_name: name }));
      if (error) throw error;
    },
    async getUiStateRemote() {
      sync.local.assertOpen();
      if (!sync.isOnline()) return undefined;
      const { data, error } = (await guard(() =>
        _supabase.from('user_settings').select('ui_state').eq('id', sync.local.userId).maybeSingle(),
      )) as any;
      return error ? undefined : (data?.ui_state ?? null);
    },
    async saveUiStateRemote(patch: Data) {
      const previous = settingsWrites.get(sync) ?? Promise.resolve();
      const write = previous
        .catch(() => {})
        .then(async () => {
          sync.local.assertOpen();
          if (!sync.isOnline()) return false;
          const { data, error } = (await guard(() =>
            _supabase.from('user_settings').select('ui_state').eq('id', sync.local.userId).maybeSingle(),
          )) as any;
          if (error) return false;
          const result = (await guard(() =>
            _supabase.from('user_settings').upsert({
              id: sync.local.userId,
              ui_state: merge(data?.ui_state ?? {}, patch),
              updated_at: new Date().toISOString(),
            }),
          )) as any;
          return !result.error;
        });
      settingsWrites.set(sync, write);
      return write;
    },
  };
}
function merge(old: Data, patch: Data): Data {
  const out = { ...old };
  for (const [key, value] of Object.entries(patch))
    out[key] =
      value && typeof value === 'object' && !Array.isArray(value)
        ? merge(old[key] && typeof old[key] === 'object' ? old[key] : {}, value)
        : value;
  return out;
}
