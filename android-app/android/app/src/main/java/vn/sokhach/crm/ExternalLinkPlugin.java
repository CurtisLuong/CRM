package vn.sokhach.crm;

import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;

import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;
import java.util.Locale;

/**
 * Mở link Zalo (zalo.me/<SĐT>) THẲNG vào màn chat của app Zalo.
 *
 * Lỗi gốc: Capacitor mở link ra ngoài bằng Intent ACTION_VIEW "trơn" (Bridge.launchIntent). App
 * Zalo có nhiều màn cùng nhận link http(s) (kể cả trình duyệt nội bộ) → Android lúc giao đúng màn
 * chat, lúc giao cho trình duyệt nội bộ → trang zalo.me "Trang này không tìm thấy". Chrome (web app)
 * không bị vì nó gửi Intent BROWSABLE và chọn đúng màn xử lý link.
 *
 * Cách sửa: chặn link *.zalo.me trước Capacitor (shouldOverrideLoad), gửi Intent giống Chrome
 * (CATEGORY_BROWSABLE, chỉ trong gói Zalo) và CHỈ ĐÍCH DANH màn khai báo đúng tên miền zalo.me
 * (không phải màn trình duyệt chung). Máy chưa cài Zalo → trả null để Capacitor mở như cũ.
 */
@CapacitorPlugin(name = "ExternalLink")
public class ExternalLinkPlugin extends Plugin {
    private static final String ZALO_PKG = "com.zing.zalo";

    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        String host = url.getHost();
        if (host == null) return null;
        host = host.toLowerCase(Locale.ROOT);
        if (!host.equals("zalo.me") && !host.endsWith(".zalo.me")) return null;
        return openInZalo(url) ? Boolean.TRUE : null; // null → Capacitor xử lý như cũ
    }

    private boolean openInZalo(Uri url) {
        PackageManager pm = getContext().getPackageManager();
        Intent intent = new Intent(Intent.ACTION_VIEW, url);
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.setPackage(ZALO_PKG);

        List<ResolveInfo> list = pm.queryIntentActivities(intent,
            PackageManager.MATCH_DEFAULT_ONLY | PackageManager.GET_RESOLVED_FILTER);
        if (list == null || list.isEmpty()) return false; // chưa cài Zalo

        // Chấm điểm: khai báo ĐÚNG tên miền (+2) · tên màn không giống trình duyệt (+1).
        ResolveInfo best = null;
        int bestScore = -1;
        for (ResolveInfo ri : list) {
            if (ri.activityInfo == null) continue;
            int score = 0;
            if (ri.filter != null && declaresHost(ri.filter, url.getHost())) score += 2;
            String name = ri.activityInfo.name.toLowerCase(Locale.ROOT);
            if (!name.contains("browser") && !name.contains("webview") && !name.contains("web.")) score += 1;
            Logger.debug("ExternalLink", "zalo handler " + ri.activityInfo.name + " score=" + score);
            if (score > bestScore) { bestScore = score; best = ri; }
        }
        if (best != null) {
            intent.setComponent(new ComponentName(best.activityInfo.packageName, best.activityInfo.name));
        }
        try {
            getContext().startActivity(intent);
            return true;
        } catch (ActivityNotFoundException | SecurityException e) {
            Logger.error("ExternalLink", "Không mở được Zalo, để Capacitor mở như cũ", e);
            return false;
        }
    }

    private static boolean declaresHost(IntentFilter f, String host) {
        if (host == null) return false;
        for (int i = 0; i < f.countDataAuthorities(); i++) {
            IntentFilter.AuthorityEntry a = f.getDataAuthority(i);
            if (a != null && host.equalsIgnoreCase(a.getHost())) return true;
        }
        return false;
    }
}
