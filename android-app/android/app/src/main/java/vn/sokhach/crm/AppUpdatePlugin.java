package vn.sokhach.crm;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** Tải APK từ Storage của Sổ Khách và mở hộp cài đặt hệ thống. */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {
    private static final String RELEASE_HOST = "nrqccwamwctihivpxjww.supabase.co";
    private final ExecutorService downloadExecutor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean(false);

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject result = new JSObject();
        result.put("allowed", canRequestInstall());
        call.resolve(result);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.resolve();
            return;
        }
        try {
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName())
            );
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            reject(call, "install_not_allowed");
        }
    }

    @PluginMethod
    public void install(PluginCall call) {
        if (!busy.compareAndSet(false, true)) {
            reject(call, "busy");
            return;
        }
        if (!canRequestInstall()) {
            busy.set(false);
            reject(call, "install_not_allowed");
            return;
        }

        String url = call.getString("url");
        String sha256 = call.getString("sha256");
        Object codeValue = call.getData().opt("versionCode");
        long versionCode = codeValue instanceof Number ? ((Number) codeValue).longValue() : 0L;
        if (!isAllowedUrl(url) || versionCode <= 0) {
            busy.set(false);
            reject(call, "download_failed");
            return;
        }

        downloadExecutor.execute(() -> downloadAndOpen(call, url, sha256, versionCode));
    }

    private boolean canRequestInstall() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            || getContext().getPackageManager().canRequestPackageInstalls();
    }

    private void downloadAndOpen(PluginCall call, String rawUrl, String sha256, long versionCode) {
        File temporary = null;
        File apk = null;
        try {
            File updateDirectory = new File(getContext().getFilesDir(), "updates");
            if (!updateDirectory.exists() && !updateDirectory.mkdirs()) throw new IllegalStateException();
            temporary = new File(updateDirectory, "app-update-" + versionCode + ".apk.part");
            apk = new File(updateDirectory, "app-update-" + versionCode + ".apk");
            if (temporary.exists() && !temporary.delete()) throw new IllegalStateException();

            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long total = download(rawUrl, temporary, digest);
            if (sha256 != null && !sha256.trim().isEmpty()) {
                if (!sha256.matches("(?i)^[a-f0-9]{64}$")
                    || !toHex(digest.digest()).equalsIgnoreCase(sha256.trim())) {
                    deleteQuietly(temporary);
                    reject(call, "checksum_mismatch");
                    busy.set(false);
                    return;
                }
            }

            if (apk.exists() && !apk.delete()) throw new IllegalStateException();
            if (!temporary.renameTo(apk)) throw new IllegalStateException();
            notifyProgress(total, total);
            final File completedApk = apk;
            getActivity().runOnUiThread(() -> openInstaller(call, completedApk));
        } catch (Exception e) {
            deleteQuietly(temporary);
            deleteQuietly(apk);
            reject(call, "download_failed");
            busy.set(false);
        }
    }

    private long download(String rawUrl, File destination, MessageDigest digest) throws Exception {
        URL current = new URL(rawUrl);
        HttpURLConnection connection = null;
        try {
            for (int redirects = 0; redirects <= 5; redirects++) {
                if (!isAllowedUrl(current.toString())) throw new IllegalArgumentException();
                connection = (HttpURLConnection) current.openConnection();
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(20_000);
                connection.setReadTimeout(30_000);
                connection.setRequestProperty("Accept", "application/vnd.android.package-archive, application/octet-stream");
                int status = connection.getResponseCode();
                if (status >= 300 && status < 400) {
                    String location = connection.getHeaderField("Location");
                    connection.disconnect();
                    connection = null;
                    if (location == null || redirects == 5) throw new IllegalArgumentException();
                    current = new URL(current, location);
                    continue;
                }
                if (status < 200 || status >= 300) throw new IllegalArgumentException();

                long expected = connection.getContentLengthLong();
                long downloaded = 0;
                long nextReport = 0;
                byte[] buffer = new byte[16 * 1024];
                try (InputStream input = new BufferedInputStream(connection.getInputStream());
                     FileOutputStream output = new FileOutputStream(destination)) {
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        output.write(buffer, 0, count);
                        digest.update(buffer, 0, count);
                        downloaded += count;
                        if (downloaded >= nextReport) {
                            notifyProgress(downloaded, Math.max(0, expected));
                            nextReport = downloaded + 128 * 1024;
                        }
                    }
                    output.getFD().sync();
                }
                return downloaded;
            }
            throw new IllegalArgumentException();
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void notifyProgress(long downloaded, long total) {
        JSObject progress = new JSObject();
        progress.put("downloaded", downloaded);
        progress.put("total", total);
        notifyListeners("progress", progress);
    }

    private void openInstaller(PluginCall call, File apk) {
        try {
            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apk
            );
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(intent);
            JSObject result = new JSObject();
            result.put("started", true);
            call.resolve(result);
        } catch (Exception e) {
            deleteQuietly(apk);
            reject(call, "download_failed");
        } finally {
            busy.set(false);
        }
    }

    private boolean isAllowedUrl(String rawUrl) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) return false;
        try {
            URI uri = new URI(rawUrl);
            return "https".equalsIgnoreCase(uri.getScheme())
                && RELEASE_HOST.equalsIgnoreCase(uri.getHost())
                && uri.getUserInfo() == null
                && (uri.getPort() == -1 || uri.getPort() == 443);
        } catch (Exception e) {
            return false;
        }
    }

    private String toHex(byte[] bytes) {
        StringBuilder output = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) output.append(String.format(Locale.ROOT, "%02x", value));
        return output.toString();
    }

    private void deleteQuietly(File file) {
        if (file != null && file.exists()) file.delete();
    }

    private void reject(PluginCall call, String code) {
        call.reject(code, code);
    }
}
