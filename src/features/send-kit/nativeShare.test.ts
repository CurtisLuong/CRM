import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SendKitFile } from './model';
import { type NativeShareFilesPlugin, nativeShareFilesContext, shareFilesWithNativePlugin } from './nativeShare';

afterEach(() => {
  delete (window as Window & { Capacitor?: unknown }).Capacitor;
});

const file = (name: string, type: string, content: string): SendKitFile => {
  const blob = new Blob([content], { type });
  return { id: name, name, type, size: blob.size, blob };
};

describe('SendKit native file sharing', () => {
  it('uses ShareFiles only inside Capacitor and reports an old APK without the plugin', () => {
    expect(nativeShareFilesContext()).toEqual({ isNative: false, plugin: null });

    (window as Window & { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true, Plugins: {} };
    expect(nativeShareFilesContext()).toEqual({ isNative: true, plugin: null });

    (window as Window & { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => false,
      Plugins: { ShareFiles: { share: vi.fn() } },
    };
    expect(nativeShareFilesContext()).toEqual({ isNative: false, plugin: null });
  });

  it('encodes every blob asynchronously and invokes one native share with the message and Zalo preference', async () => {
    const share = vi.fn<NativeShareFilesPlugin['share']>(async () => ({ target: 'package' as const }));
    const plugin: NativeShareFilesPlugin = { share };
    const onSent = vi.fn(async () => {});

    await shareFilesWithNativePlugin(
      plugin,
      [file('bang-gia.txt', 'text/plain', 'hello'), file('anh.png', 'image/png', 'world')],
      'Chào chị Lan',
      onSent,
    );

    expect(share).toHaveBeenCalledTimes(1);
    const payload = share.mock.calls[0]?.[0];
    expect(payload).toEqual({
      files: [
        { name: 'bang-gia.txt', mimeType: 'text/plain', base64: 'aGVsbG8=' },
        { name: 'anh.png', mimeType: 'image/png', base64: 'd29ybGQ=' },
      ],
      text: 'Chào chị Lan',
      preferPackage: 'com.zing.zalo',
    });
    expect(onSent).toHaveBeenCalledOnce();
  });

  it.each([
    ['AbortError', new DOMException('Cancelled', 'AbortError')],
    ['other errors', new Error('share failed')],
  ])('does not record a sent interaction after %s', async (_label, reason) => {
    const share = vi.fn<NativeShareFilesPlugin['share']>(async () => {
      throw reason;
    });
    const onSent = vi.fn(async () => {});

    await expect(
      shareFilesWithNativePlugin({ share }, [file('anh.png', 'image/png', 'x')], 'Nội dung', onSent),
    ).rejects.toBe(reason);
    expect(onSent).not.toHaveBeenCalled();
  });
});
