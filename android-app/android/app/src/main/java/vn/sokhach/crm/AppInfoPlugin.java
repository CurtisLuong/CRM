package vn.sokhach.crm;

import android.content.pm.PackageInfo;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Phiên bản APK đang cài — để web (js/app.js, checkAppUpdate) so với /android-app-version.json
 * và hiện banner "Có bản app mới".
 * JS gọi: Capacitor.nativePromise('AppInfo', 'get', {}) → { versionCode, versionName }
 */
@CapacitorPlugin(name = "AppInfo")
public class AppInfoPlugin extends Plugin {
    @PluginMethod
    public void get(PluginCall call) {
        try {
            PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
            JSObject ret = new JSObject();
            ret.put("versionCode", code);
            ret.put("versionName", pi.versionName);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("version_unavailable");
        }
    }
}
