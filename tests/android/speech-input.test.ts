// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const plugin = readFileSync(
  new URL('../../android-app/android/app/src/main/java/vn/sokhach/crm/SpeechInputPlugin.java', import.meta.url),
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
const gradle = readFileSync(new URL('../../android-app/android/app/build.gradle', import.meta.url), 'utf8');

describe('Android SpeechInput bridge contract', () => {
  it('exposes the methods, events, and result/error fields expected by the web app', () => {
    expect(plugin).toContain('@CapacitorPlugin(');
    expect(plugin).toContain('name = "SpeechInput"');
    expect(plugin).toMatch(/public void available\(PluginCall call\)/);
    expect(plugin).toMatch(/public void start\(PluginCall call\)/);
    expect(plugin).toMatch(/public void stop\(PluginCall call\)/);
    expect(plugin).toContain('notifyListeners("partial", event)');
    expect(plugin).toContain('notifyListeners("end", event)');
    expect(plugin).toContain('notifyListeners("error", event)');
    for (const code of ['not_allowed', 'unavailable', 'no_speech', 'busy', 'other']) {
      expect(plugin).toContain(`"${code}"`);
    }
    expect(plugin).toContain('result.put("text", committedText.toString())');
  });

  it('registers the plugin, declares runtime microphone permission, and ships a new APK version', () => {
    expect(activity).toContain('registerPlugin(SpeechInputPlugin.class)');
    expect(plugin).toContain('Manifest.permission.RECORD_AUDIO');
    expect(manifest).toContain('android.speech.RecognitionService');
    expect(gradle).toMatch(/versionCode\s+7/);
    expect(gradle).toMatch(/versionName\s+"1\.6"/);
  });

  it('uses Android on-device recognition and reports support only when that service is available', () => {
    expect(plugin).toContain('SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext())');
    expect(plugin).toContain('SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext())');
    expect(plugin).toContain('SILENCE_LIMIT_MS = 60_000L');
  });
});
