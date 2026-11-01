// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const plugin = readFileSync(
  new URL('../../android-app/android/app/src/main/java/vn/sokhach/crm/AppUpdatePlugin.java', import.meta.url),
  'utf8',
);
const activity = readFileSync(
  new URL('../../android-app/android/app/src/main/java/vn/sokhach/crm/MainActivity.java', import.meta.url),
  'utf8',
);
const manifest = readFileSync(
  new URL('../../android-app/android/app/src/main/AndroidManifest.xml', import.meta.url),
  'utf8',
);
const paths = readFileSync(
  new URL('../../android-app/android/app/src/main/res/xml/file_paths.xml', import.meta.url),
  'utf8',
);
const gradle = readFileSync(new URL('../../android-app/android/app/build.gradle', import.meta.url), 'utf8');

describe('Android AppUpdate bridge contract', () => {
  it('exposes the install methods and progress event', () => {
    expect(plugin).toContain('@CapacitorPlugin(name = "AppUpdate")');
    expect(plugin).toMatch(/public void canInstall\(PluginCall call\)/);
    expect(plugin).toMatch(/public void openInstallSettings\(PluginCall call\)/);
    expect(plugin).toMatch(/public void install\(PluginCall call\)/);
    expect(plugin).toContain('notifyListeners("progress", progress)');
    expect(plugin).toContain('result.put("started", true)');
  });

  it('registers the plugin, limits APK storage to private files, and declares install permission', () => {
    expect(activity).toContain('registerPlugin(AppUpdatePlugin.class)');
    expect(manifest).toContain('android.permission.REQUEST_INSTALL_PACKAGES');
    expect(paths).toContain('<files-path name="app_updates" path="updates/" />');
    expect(plugin).toContain('getContext().getFilesDir()');
    expect(plugin).toContain('FileProvider.getUriForFile');
    // AppUpdate có từ APK 1.7 (versionCode 8); các bản sau chỉ được tăng số.
    expect(Number(gradle.match(/versionCode\s+(\d+)/)?.[1])).toBeGreaterThanOrEqual(8);
    expect(gradle).toMatch(/versionName\s+"1\.\d+"/);
  });

  it('restricts HTTPS downloads to the release host and rejects using matching code/message', () => {
    expect(plugin).toContain('RELEASE_HOST = "nrqccwamwctihivpxjww.supabase.co"');
    expect(plugin).toContain('"https".equalsIgnoreCase(uri.getScheme())');
    expect(plugin).toContain('call.reject(code, code)');
    expect(plugin).toContain('checksum_mismatch');
    expect(plugin).toContain('install_not_allowed');
    expect(plugin).toContain('download_failed');
    expect(plugin).toContain('busy');
  });
});
