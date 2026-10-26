package vn.sokhach.crm;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;

/**
 * Nhận giọng nói tiếng Việt trên thiết bị, chỉ trả chữ về WebView.
 * JS gọi: Capacitor.Plugins.SpeechInput.available/start({ lang })/stop(); nghe partial, end, error.
 */
@CapacitorPlugin(
    name = "SpeechInput",
    permissions = {
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone")
    }
)
public class SpeechInputPlugin extends Plugin {
    private static final long SILENCE_LIMIT_MS = 60_000L;
    private static final long RESTART_DELAY_MS = 200L;
    private static final long STOP_RESULT_TIMEOUT_MS = 5_000L;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Runnable silenceTimeout = () -> finishSession("no_speech");
    private final Runnable stopResultTimeout = () -> finishSession(null);

    private SpeechRecognizer recognizer;
    private PluginCall startCall;
    private PluginCall stopCall;
    private boolean startPending;
    private boolean listening;
    private boolean stopRequested;
    private String language = "vi-VN";
    private StringBuilder committedText = new StringBuilder();
    private String partialText = "";
    private int recognizerGeneration;
    private Runnable pendingRestart;

    @PluginMethod
    public void available(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", isOnDeviceRecognitionAvailable());
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        getActivity().runOnUiThread(() -> beginStart(call));
    }

    private void beginStart(PluginCall call) {
        if (listening || startPending) {
            call.reject("busy");
            notifyError("busy");
            return;
        }
        if (!isOnDeviceRecognitionAvailable()) {
            call.reject("unavailable");
            notifyError("unavailable");
            return;
        }

        String requestedLanguage = call.getString("lang", "vi-VN");
        language = requestedLanguage == null || requestedLanguage.trim().isEmpty()
            ? "vi-VN" : requestedLanguage;
        startPending = true;
        startCall = call;

        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            beginListening();
        } else {
            requestPermissionForAlias("microphone", call, "microphonePermsCallback");
        }
    }

    @PermissionCallback
    private void microphonePermsCallback(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (!startPending || startCall != call) return;
            if (getPermissionState("microphone") == PermissionState.GRANTED) {
                beginListening();
            } else {
                startPending = false;
                startCall = null;
                call.reject("not_allowed");
                notifyError("not_allowed");
            }
        });
    }

    private boolean isOnDeviceRecognitionAvailable() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            && SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext());
    }

    private void beginListening() {
        if (!startPending) return;
        committedText = new StringBuilder();
        partialText = "";
        stopRequested = false;
        listening = true;
        mainHandler.removeCallbacks(silenceTimeout);
        mainHandler.postDelayed(silenceTimeout, SILENCE_LIMIT_MS);
        createChildRecognizer();
    }

    private void createChildRecognizer() {
        if (!listening || stopRequested) return;

        final int generation = ++recognizerGeneration;
        try {
            if (recognizer == null) {
                recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext());
            }
            recognizer.setRecognitionListener(new RecognitionListener() {
                private boolean childFinished;

                @Override public void onReadyForSpeech(android.os.Bundle params) {
                    if (!isCurrent(generation)) return;
                    if (startCall != null) {
                        startCall.resolve();
                        startCall = null;
                        startPending = false;
                    }
                }

                @Override public void onBeginningOfSpeech() {
                    if (isCurrent(generation)) resetSilenceTimer();
                }

                @Override public void onRmsChanged(float rmsdB) { }
                @Override public void onBufferReceived(byte[] buffer) { }
                @Override public void onEndOfSpeech() { }

                @Override public void onError(int error) {
                    if (!isCurrent(generation) || childFinished) return;
                    childFinished = true;
                    handleRecognizerError(error);
                }

                @Override public void onResults(android.os.Bundle results) {
                    if (!isCurrent(generation) || childFinished) return;
                    childFinished = true;
                    ArrayList<String> matches = results == null
                        ? null : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    String result = matches == null || matches.isEmpty() ? "" : matches.get(0);
                    if (!result.trim().isEmpty()) {
                        resetSilenceTimer();
                        appendCommitted(result.trim());
                        partialText = "";
                        notifyPartial();
                    } else {
                        commitPartial();
                        notifyError("no_speech");
                    }
                    childStopped();
                }

                @Override public void onPartialResults(android.os.Bundle partialResults) {
                    if (!isCurrent(generation) || childFinished) return;
                    ArrayList<String> matches = partialResults == null
                        ? null : partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    String result = matches == null || matches.isEmpty() ? "" : matches.get(0);
                    partialText = result.trim();
                    if (!partialText.isEmpty()) {
                        resetSilenceTimer();
                        notifyPartial();
                    }
                }

                @Override public void onEvent(int eventType, android.os.Bundle params) { }
            });

            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);
            intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
            recognizer.startListening(intent);
        } catch (Exception e) {
            finishSession("unavailable");
        }
    }

    private boolean isCurrent(int generation) {
        return listening && generation == recognizerGeneration;
    }

    private void handleRecognizerError(int error) {
        if (stopRequested) {
            finishSession(null);
            return;
        }

        if (error == SpeechRecognizer.ERROR_NO_MATCH
                || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
            commitPartial();
            notifyError("no_speech");
            childStopped();
            return;
        }

        if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) {
            finishSession("busy");
        } else if (error == SpeechRecognizer.ERROR_TOO_MANY_REQUESTS) {
            finishSession("busy");
        } else if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
            finishSession("not_allowed");
        } else if (error == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED
                || error == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE
                || error == SpeechRecognizer.ERROR_CANNOT_CHECK_SUPPORT) {
            finishSession("unavailable");
        } else if (error == SpeechRecognizer.ERROR_AUDIO
                || error == SpeechRecognizer.ERROR_NETWORK
                || error == SpeechRecognizer.ERROR_NETWORK_TIMEOUT
                || error == SpeechRecognizer.ERROR_SERVER
                || error == SpeechRecognizer.ERROR_SERVER_DISCONNECTED) {
            finishSession("unavailable");
        } else {
            finishSession("other");
        }
    }

    private void childStopped() {
        if (stopRequested) {
            finishSession(null);
            return;
        }
        if (!listening) return;
        recognizerGeneration++;
        pendingRestart = () -> {
            pendingRestart = null;
            createChildRecognizer();
        };
        mainHandler.postDelayed(pendingRestart, RESTART_DELAY_MS);
    }

    private void resetSilenceTimer() {
        mainHandler.removeCallbacks(silenceTimeout);
        mainHandler.postDelayed(silenceTimeout, SILENCE_LIMIT_MS);
    }

    private void appendCommitted(String addition) {
        if (addition == null || addition.isEmpty()) return;
        if (committedText.length() > 0) committedText.append(' ');
        committedText.append(addition);
    }

    private void commitPartial() {
        if (partialText.isEmpty()) return;
        appendCommitted(partialText);
        partialText = "";
        notifyPartial();
    }

    private String currentText() {
        String committed = committedText.toString();
        if (partialText.isEmpty()) return committed;
        return committed.isEmpty() ? partialText : committed + " " + partialText;
    }

    private void notifyPartial() {
        JSObject event = new JSObject();
        event.put("text", currentText());
        notifyListeners("partial", event);
    }

    private void notifyError(String code) {
        JSObject event = new JSObject();
        event.put("code", code);
        notifyListeners("error", event);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> stopListening(call));
    }

    private void stopListening(PluginCall call) {
        if (stopRequested || stopCall != null) {
            call.reject("busy");
            return;
        }
        if (!listening) {
            resolveText(call);
            return;
        }
        stopRequested = true;
        stopCall = call;
        mainHandler.removeCallbacks(silenceTimeout);
        mainHandler.removeCallbacks(stopResultTimeout);
        if (pendingRestart != null) {
            mainHandler.removeCallbacks(pendingRestart);
            pendingRestart = null;
        }
        if (recognizer == null) {
            finishSession(null);
            return;
        }
        mainHandler.postDelayed(stopResultTimeout, STOP_RESULT_TIMEOUT_MS);
        try {
            recognizer.stopListening();
        } catch (Exception e) {
            finishSession(null);
        }
    }

    private void finishSession(String errorCode) {
        if (!listening && !startPending) return;
        if (errorCode != null) notifyError(errorCode);
        commitPartial();

        listening = false;
        startPending = false;
        stopRequested = false;
        mainHandler.removeCallbacks(silenceTimeout);
        mainHandler.removeCallbacks(stopResultTimeout);
        if (pendingRestart != null) {
            mainHandler.removeCallbacks(pendingRestart);
            pendingRestart = null;
        }
        destroyRecognizer();

        if (startCall != null) {
            String rejection = errorCode;
            if (!"not_allowed".equals(rejection) && !"unavailable".equals(rejection)
                    && !"busy".equals(rejection)) rejection = "unavailable";
            startCall.reject(rejection == null ? "unavailable" : rejection);
            startCall = null;
        }
        JSObject event = new JSObject();
        event.put("text", committedText.toString());
        notifyListeners("end", event);
        if (stopCall != null) {
            PluginCall call = stopCall;
            stopCall = null;
            resolveText(call);
        }
    }

    private void resolveText(PluginCall call) {
        JSObject result = new JSObject();
        result.put("text", committedText.toString());
        call.resolve(result);
    }

    private void destroyRecognizer() {
        recognizerGeneration++;
        if (recognizer != null) {
            try {
                recognizer.cancel();
            } catch (Exception ignored) { }
            try {
                recognizer.destroy();
            } catch (Exception ignored) { }
            recognizer = null;
        }
    }

    @Override
    public void handleOnDestroy() {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            finishSession("other");
        } else {
            getActivity().runOnUiThread(() -> finishSession("other"));
        }
        super.handleOnDestroy();
    }
}
