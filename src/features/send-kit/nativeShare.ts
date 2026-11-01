import type { SendKitFile } from './model';

export type NativeShareFile = { name: string; mimeType: string; base64: string };
export type NativeShareFilesPlugin = {
  share(options: {
    files: NativeShareFile[];
    text?: string;
    preferPackage?: string;
  }): Promise<{ target: 'package' | 'chooser' }>;
};

type NativeWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    Plugins?: { ShareFiles?: Partial<NativeShareFilesPlugin> };
  };
};

export function nativeShareFilesContext(host?: NativeWindow) {
  const bridge = (host ?? (typeof window === 'undefined' ? undefined : (window as NativeWindow)))?.Capacitor;
  const isNative = bridge?.isNativePlatform?.() === true;
  const plugin = isNative ? bridge?.Plugins?.ShareFiles : undefined;
  return {
    isNative,
    plugin: typeof plugin?.share === 'function' ? (plugin as NativeShareFilesPlugin) : null,
  };
}

const NATIVE_SHARE_ERRORS: Record<string, string> = {
  no_files: 'Chưa chọn tệp nào.',
  write_failed: 'Không chuẩn bị được tệp trên máy.',
  no_app: 'Máy không có app nào nhận tệp.',
  busy: 'Đang mở chia sẻ, thử lại sau giây lát.',
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Không đọc được tệp.'));
        return;
      }
      const separator = reader.result.indexOf(',');
      if (separator < 0) {
        reject(new Error('Không mã hoá được tệp.'));
        return;
      }
      resolve(reader.result.slice(separator + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Không đọc được tệp.'));
    reader.onabort = () => reject(new Error('Đã huỷ đọc tệp.'));
    reader.readAsDataURL(blob);
  });
}

export async function shareFilesWithNativePlugin(
  plugin: NativeShareFilesPlugin,
  files: SendKitFile[],
  text: string,
  onSent: () => Promise<void>,
) {
  const nativeFiles = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      base64: await blobToBase64(file.blob),
    })),
  );
  const result = await plugin
    .share({ files: nativeFiles, text, preferPackage: 'com.zing.zalo' })
    .catch((reason: unknown) => {
      // Mã lỗi của plugin không hiện cho người dùng (D-023 L3).
      const code = reason && typeof reason === 'object' && 'code' in reason ? String(reason.code) : '';
      if (NATIVE_SHARE_ERRORS[code]) throw new Error(NATIVE_SHARE_ERRORS[code]);
      throw reason;
    });
  await onSent();
  return result;
}
