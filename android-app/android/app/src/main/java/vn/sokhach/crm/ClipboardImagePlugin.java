package vn.sokhach.crm;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentResolver;
import android.content.Context;
import android.net.Uri;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * Đọc ẢNH trong clipboard Android cho nút "Dán ảnh" (OCR / ảnh đại diện).
 * WebView không hỗ trợ xin quyền navigator.clipboard.read() → phải đọc qua native.
 * JS gọi: Capacitor.nativePromise('ClipboardImage', 'read', {})
 *   → { mime: 'image/png', data: '<base64>' }  hoặc  {} nếu clipboard không có ảnh.
 */
@CapacitorPlugin(name = "ClipboardImage")
public class ClipboardImagePlugin extends Plugin {

    private static final int MAX_BYTES = 20 * 1024 * 1024; // ảnh quá 20 MB → bỏ

    @PluginMethod
    public void read(PluginCall call) {
        // Android 10+ chỉ cho đọc clipboard khi app đang ở trước & có focus → lấy clip trên UI thread.
        getActivity().runOnUiThread(() -> {
            ClipboardManager cm = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
            ClipData clip = cm != null ? cm.getPrimaryClip() : null;
            if (clip == null || clip.getItemCount() == 0) { call.resolve(new JSObject()); return; }
            Uri found = null;
            String foundMime = null;
            ContentResolver cr = getContext().getContentResolver();
            for (int i = 0; i < clip.getItemCount(); i++) {
                Uri uri = clip.getItemAt(i).getUri();
                if (uri == null) continue;
                String mime = cr.getType(uri);
                if (mime == null && clip.getDescription() != null && clip.getDescription().getMimeTypeCount() > 0) {
                    mime = clip.getDescription().getMimeType(0);
                }
                if (mime != null && mime.startsWith("image/")) { found = uri; foundMime = mime; break; }
            }
            if (found == null) { call.resolve(new JSObject()); return; }
            final Uri uri = found;
            final String mime = foundMime;
            // Đọc file ảnh ở luồng nền (ảnh lớn không làm đơ giao diện).
            new Thread(() -> {
                try (InputStream in = cr.openInputStream(uri)) {
                    if (in == null) { call.reject("read_failed"); return; }
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buf = new byte[64 * 1024];
                    int n, total = 0;
                    while ((n = in.read(buf)) != -1) {
                        total += n;
                        if (total > MAX_BYTES) { call.reject("too_large"); return; }
                        out.write(buf, 0, n);
                    }
                    JSObject ret = new JSObject();
                    ret.put("mime", mime);
                    ret.put("data", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
                    call.resolve(ret);
                } catch (Exception e) {
                    call.reject("read_failed: " + e.getMessage());
                }
            }).start();
        });
    }
}
