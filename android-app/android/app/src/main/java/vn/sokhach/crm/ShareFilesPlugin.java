package vn.sokhach.crm;

import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** Chia sẻ tệp riêng của ứng dụng qua Android Sharesheet. */
@CapacitorPlugin(name = "ShareFiles")
public class ShareFilesPlugin extends Plugin {
    private final ExecutorService shareExecutor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean(false);

    @PluginMethod
    public void share(PluginCall call) {
        JSArray files = call.getArray("files");
        if (files == null || files.length() == 0) {
            reject(call, "no_files");
            return;
        }
        if (!busy.compareAndSet(false, true)) {
            reject(call, "busy");
            return;
        }

        String text = call.getString("text", "");
        String preferPackage = call.getString("preferPackage", "");
        shareExecutor.execute(() -> prepareShare(call, files, text, preferPackage));
    }

    private void prepareShare(PluginCall call, JSArray files, String text, String preferPackage) {
        File shareDirectory = null;
        try {
            File root = new File(getContext().getCacheDir(), "share-files");
            if (!root.exists() && !root.mkdirs()) throw new IOException("cache directory");
            deleteChildren(root);
            shareDirectory = new File(root, UUID.randomUUID().toString());
            if (!shareDirectory.mkdirs()) throw new IOException("share directory");

            List<Uri> uris = new ArrayList<>();
            List<String> mimeTypes = new ArrayList<>();
            Set<String> usedNames = new HashSet<>();
            for (int index = 0; index < files.length(); index++) {
                JSONObject input = files.getJSONObject(index);
                String name = safeName(input.optString("name", "tai-lieu"), usedNames);
                String mimeType = input.optString("mimeType", "application/octet-stream").trim();
                if (mimeType.isEmpty()) mimeType = "application/octet-stream";
                String base64 = input.optString("base64", "");
                byte[] content = Base64.decode(base64, Base64.DEFAULT);
                File output = new File(shareDirectory, name);
                try (FileOutputStream stream = new FileOutputStream(output)) {
                    stream.write(content);
                    stream.flush();
                }
                uris.add(FileProvider.getUriForFile(
                    getContext(), getContext().getPackageName() + ".fileprovider", output));
                mimeTypes.add(mimeType);
            }
            Intent intent = createShareIntent(uris, mimeTypes, text);
            File completedDirectory = shareDirectory;
            getActivity().runOnUiThread(() -> openShare(call, intent, preferPackage, completedDirectory));
        } catch (Exception e) {
            deleteQuietly(shareDirectory);
            reject(call, "write_failed");
            busy.set(false);
        }
    }

    private Intent createShareIntent(List<Uri> uris, List<String> mimeTypes, String text) {
        Intent intent = new Intent(uris.size() == 1 ? Intent.ACTION_SEND : Intent.ACTION_SEND_MULTIPLE);
        intent.setType(commonMimeType(mimeTypes));
        if (uris.size() == 1) {
            intent.putExtra(Intent.EXTRA_STREAM, uris.get(0));
        } else {
            intent.putParcelableArrayListExtra(Intent.EXTRA_STREAM, new ArrayList<>(uris));
        }
        intent.putExtra(Intent.EXTRA_TEXT, text == null ? "" : text);

        ClipData clipData = ClipData.newUri(getContext().getContentResolver(), "Tài liệu", uris.get(0));
        for (int index = 1; index < uris.size(); index++) {
            clipData.addItem(new ClipData.Item(uris.get(index)));
        }
        intent.setClipData(clipData);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        return intent;
    }

    private String commonMimeType(List<String> mimeTypes) {
        String first = mimeTypes.get(0);
        for (String mimeType : mimeTypes) {
            if (!first.equalsIgnoreCase(mimeType)) return "*/*";
        }
        return first;
    }

    private void openShare(PluginCall call, Intent intent, String preferPackage, File shareDirectory) {
        try {
            PackageManager packageManager = getContext().getPackageManager();
            if (preferPackage != null && !preferPackage.trim().isEmpty()
                && canHandle(packageManager, intent, preferPackage.trim())) {
                Intent direct = new Intent(intent);
                direct.setPackage(preferPackage.trim());
                try {
                    getActivity().startActivity(direct);
                    resolve(call, "package");
                    return;
                } catch (Exception ignored) {
                    // App có thể vừa bị gỡ hoặc handler vừa đổi; thử mở bảng chia sẻ chung.
                }
            }

            // Sharesheet tự tìm mọi app nhận tệp; Android 11 chỉ cho plugin truy vấn gói đã khai báo.
            Intent chooser = Intent.createChooser(intent, null);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            resolve(call, "chooser");
        } catch (Exception e) {
            deleteQuietly(shareDirectory);
            reject(call, "no_app");
        } finally {
            busy.set(false);
        }
    }

    private boolean canHandle(PackageManager packageManager, Intent intent, String packageName) {
        Intent query = new Intent(intent);
        if (packageName != null) query.setPackage(packageName);
        List<ResolveInfo> handlers = packageManager.queryIntentActivities(query, PackageManager.MATCH_DEFAULT_ONLY);
        return handlers != null && !handlers.isEmpty();
    }

    private String safeName(String rawName, Set<String> usedNames) {
        String name = rawName == null ? "" : rawName.trim();
        name = name.replaceAll("[^\\p{L}\\p{N}._-]", "_");
        if (name.isEmpty() || name.equals(".") || name.equals("..")) name = "tai-lieu";
        if (name.length() > 180) name = name.substring(0, 180);

        String candidate = name;
        int suffix = 2;
        while (!usedNames.add(candidate)) {
            int extension = name.lastIndexOf('.');
            String base = extension > 0 ? name.substring(0, extension) : name;
            String ext = extension > 0 ? name.substring(extension) : "";
            candidate = base + "_" + suffix++ + ext;
        }
        return candidate;
    }

    private void resolve(PluginCall call, String target) {
        JSObject result = new JSObject();
        result.put("target", target);
        call.resolve(result);
    }

    private void deleteChildren(File directory) throws IOException {
        File[] children = directory.listFiles();
        if (children == null) return;
        for (File child : children) {
            if (!deleteRecursively(child)) throw new IOException("cannot clear share cache");
        }
    }

    private boolean deleteRecursively(File file) {
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) {
                    if (!deleteRecursively(child)) return false;
                }
            }
        }
        return !file.exists() || file.delete();
    }

    private void deleteQuietly(File file) {
        if (file != null && file.exists()) deleteRecursively(file);
    }

    private void reject(PluginCall call, String code) {
        call.reject(code, code);
    }
}
