package vn.sokhach.crm;

import android.Manifest;
import android.database.Cursor;
import android.provider.CallLog;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Đọc NHẬT KÝ CUỘC GỌI của máy cho CRM (docs/decisions.md D-002).
 *
 * JS gọi: Capacitor.nativePromise('CallLog', 'fetchSince', { since: <ms> })
 *   → { calls: [{ id, number, startedAt (ms), durationSec, direction: 'out'|'in'|'missed' }] }
 * Chỉ trả dữ liệu về trang web; việc lọc "chỉ giữ SĐT có trong danh sách khách" làm ở
 * js/calls.js (ingest) — app không gửi cuộc gọi cá nhân đi đâu.
 * Lần đầu sẽ xin quyền READ_CALL_LOG; từ chối → trả lỗi "permission_denied".
 */
@CapacitorPlugin(
    name = "CallLog",
    permissions = { @Permission(strings = { Manifest.permission.READ_CALL_LOG }, alias = "callLog") }
)
public class CallLogPlugin extends Plugin {

    private static final int MAX_ROWS = 500; // chặn trên, tránh đọc quá nhiều khi lâu không mở app

    @PluginMethod
    public void fetchSince(PluginCall call) {
        if (getPermissionState("callLog") != PermissionState.GRANTED) {
            requestPermissionForAlias("callLog", call, "callLogPermsCallback");
            return;
        }
        readCalls(call);
    }

    @PermissionCallback
    private void callLogPermsCallback(PluginCall call) {
        if (getPermissionState("callLog") == PermissionState.GRANTED) readCalls(call);
        else call.reject("permission_denied");
    }

    private void readCalls(PluginCall call) {
        long since = call.getLong("since", 0L);
        String[] projection = {
            CallLog.Calls._ID, CallLog.Calls.NUMBER, CallLog.Calls.DATE,
            CallLog.Calls.DURATION, CallLog.Calls.TYPE
        };
        JSArray calls = new JSArray();
        try (Cursor cur = getContext().getContentResolver().query(
                CallLog.Calls.CONTENT_URI, projection,
                CallLog.Calls.DATE + " > ?", new String[] { String.valueOf(since) },
                CallLog.Calls.DATE + " ASC")) {
            if (cur != null) {
                int n = 0;
                while (cur.moveToNext() && n++ < MAX_ROWS) {
                    JSObject o = new JSObject();
                    o.put("id", String.valueOf(cur.getLong(0)));
                    o.put("number", cur.getString(1));
                    o.put("startedAt", cur.getLong(2));
                    o.put("durationSec", cur.getLong(3)); // giây tính từ lúc KẾT NỐI; 0 = không kết nối
                    o.put("direction", directionOf(cur.getInt(4)));
                    calls.put(o);
                }
            }
        } catch (SecurityException e) {
            call.reject("permission_denied");
            return;
        } catch (Exception e) {
            call.reject("read_failed: " + e.getMessage());
            return;
        }
        JSObject ret = new JSObject();
        ret.put("calls", calls);
        call.resolve(ret);
    }

    private static String directionOf(int type) {
        switch (type) {
            case CallLog.Calls.OUTGOING_TYPE: return "out";
            case CallLog.Calls.INCOMING_TYPE: return "in";
            default: return "missed"; // gọi nhỡ / từ chối / chặn / voicemail
        }
    }
}
