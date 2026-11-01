// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const plugin = readFileSync(
  new URL('../../android-app/android/app/src/main/java/vn/sokhach/crm/ShareFilesPlugin.java', import.meta.url),
  'utf8',
);
const activity = readFileSync(
  new URL('../../android-app/android/app/src/main/java/vn/sokhach/crm/MainActivity.java', import.meta.url),
  'utf8',
);
const paths = readFileSync(
  new URL('../../android-app/android/app/src/main/res/xml/file_paths.xml', import.meta.url),
  'utf8',
);
const gradle = readFileSync(new URL('../../android-app/android/app/build.gradle', import.meta.url), 'utf8');
const releaseNotes = readFileSync(new URL('../../android-app/release-notes.txt', import.meta.url), 'utf8');

describe('Android ShareFiles bridge contract', () => {
  it('registers ShareFiles and exposes the required validation errors', () => {
    expect(plugin).toContain('@CapacitorPlugin(name = "ShareFiles")');
    expect(plugin).toMatch(/public void share\(PluginCall call\)/);
    expect(activity).toContain('registerPlugin(ShareFilesPlugin.class)');
    for (const code of ['no_files', 'write_failed', 'no_app', 'busy']) expect(plugin).toContain(`"${code}"`);
  });

  it('writes privately and shares one or many FileProvider URIs with read grants and text', () => {
    expect(plugin).toContain('getContext().getCacheDir()');
    expect(plugin).toContain('deleteChildren(root)');
    expect(plugin).toContain('Base64.decode(base64, Base64.DEFAULT)');
    expect(plugin).toContain('FileProvider.getUriForFile');
    expect(paths).toContain('<cache-path name="my_cache_images" path="." />');
    expect(plugin).toContain('Intent.ACTION_SEND : Intent.ACTION_SEND_MULTIPLE');
    expect(plugin).toContain('Intent.EXTRA_STREAM');
    expect(plugin).toContain('Intent.EXTRA_TEXT');
    expect(plugin).toContain('intent.setClipData(clipData)');
    expect(plugin).toContain('Intent.FLAG_GRANT_READ_URI_PERMISSION');
  });

  it('prefers Zalo when it can handle the intent and otherwise opens the system chooser', () => {
    expect(plugin).toContain('canHandle(packageManager, intent, preferPackage.trim())');
    expect(plugin).toContain('direct.setPackage(preferPackage.trim())');
    expect(plugin).toContain('Intent.createChooser(intent, null)');
    expect(plugin).toContain('result.put("target", target)');
  });

  it('ships APK version 1.8 and the requested Vietnamese release note', () => {
    expect(gradle).toMatch(/versionCode\s+9/);
    expect(gradle).toMatch(/versionName\s+"1\.8"/);
    expect(releaseNotes.split(/\r?\n/)).toContain('Gửi tài liệu kèm tệp qua Zalo');
  });
});
