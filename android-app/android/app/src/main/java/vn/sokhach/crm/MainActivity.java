package vn.sokhach.crm;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CallLogPlugin.class); // đọc nhật ký cuộc gọi (phải đăng ký TRƯỚC super.onCreate)
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        // Báo trang web "app vừa được mở lại" → js/calls.js đọc nhật ký cuộc gọi mới.
        // (Không dựa hẳn vào visibilitychange của WebView — có máy không bắn sự kiện này.)
        if (bridge != null) bridge.triggerWindowJSEvent("crm:resume");
    }
}
