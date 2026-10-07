package vn.sokhach.crm;

import android.os.Bundle;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CallLogPlugin.class); // đọc nhật ký cuộc gọi (phải đăng ký TRƯỚC super.onCreate)
        registerPlugin(AppInfoPlugin.class); // phiên bản APK → banner "Có bản app mới"
        registerPlugin(ClipboardImagePlugin.class); // nút "Dán ảnh" (WebView không đọc được clipboard)
        super.onCreate(savedInstanceState);

        // NÚT / VUỐT BACK: hỏi trang web trước (window.CRMBack() trong js/app.js) — đóng hộp thoại,
        // về danh sách, về Tổng quan... Trang trả "không còn gì để lùi" → đưa app xuống nền
        // (giống nút Home, app vẫn giữ trạng thái), KHÔNG tắt hẳn app.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (bridge == null || bridge.getWebView() == null) { moveTaskToBack(true); return; }
                bridge.getWebView().evaluateJavascript(
                    "(window.CRMBack && window.CRMBack()) ? 'y' : 'n'",
                    result -> { if (!"\"y\"".equals(result)) moveTaskToBack(true); }
                );
            }
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        // Báo trang web "app vừa được mở lại" → js/calls.js đọc nhật ký cuộc gọi mới.
        // (Không dựa hẳn vào visibilitychange của WebView — có máy không bắn sự kiện này.)
        if (bridge != null) bridge.triggerWindowJSEvent("crm:resume");
    }
}
