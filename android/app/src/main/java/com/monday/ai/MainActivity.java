package com.monday.ai;

import android.app.PictureInPictureParams;
import android.content.Context;
import android.content.Intent;
import android.hardware.camera2.CameraManager;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.util.Rational;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.widget.Toast;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.widget.EditText;
import java.net.HttpURLConnection;
import java.net.URL;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import java.util.List;
import com.getcapacitor.BridgeActivity;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    private TextToSpeech tts;
    private boolean isTtsReady = false;
    private String pendingSpeechText = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        initTTS();
        registerBridge();
        startOverlayService();
        checkServerAndConnect();
        handleIncomingIntent(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent);
    }

    private void handleIncomingIntent(Intent intent) {
        if (intent != null) {
            if (intent.hasExtra("user_query")) {
                String q = intent.getStringExtra("user_query");
                if (q != null && !q.trim().isEmpty()) {
                    sendQueryToWebView(q.trim());
                }
            }
            if (intent.getBooleanExtra("start_voice", false)) {
                startVoiceListeningInApp();
            }
        }
    }

    public void startVoiceListeningInApp() {
        runOnUiThread(() -> {
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().evaluateJavascript(
                    "if (window.startVoiceListening) { window.startVoiceListening(); } " +
                    "else { window._pendingVoiceListening = true; }",
                    null
                );
            }
        });
    }

    public void sendQueryToWebView(String query) {
        runOnUiThread(() -> {
            if (bridge != null && bridge.getWebView() != null) {
                String escaped = query.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ");
                bridge.getWebView().evaluateJavascript(
                    "if (window.sendAegisQuery) { window.sendAegisQuery('" + escaped + "'); } " +
                    "else { window._pendingAegisQuery = '" + escaped + "'; }",
                    null
                );
            }
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && Settings.canDrawOverlays(this)) {
            Intent intent = new Intent(this, OverlayService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent);
            } else {
                startService(intent);
            }
        }
        checkServerAndConnect();
    }

    public void checkServerAndConnect() {
        new Thread(() -> {
            SharedPreferences prefs = getSharedPreferences("monday_settings", MODE_PRIVATE);
            String savedIp = prefs.getString("pc_ip", "10.250.173.50");
            String cloudUrl = "https://aegis-ai-git-main-naveenkumar999-coders-projects.vercel.app";

            String[] candidates = new String[]{
                cloudUrl,
                "http://" + savedIp + ":3000",
                "http://192.168.43.10:3000",
                "http://10.250.173.50:3000",
                "http://localhost:3000"
            };

            String workingUrl = null;
            for (String candidate : candidates) {
                try {
                    HttpURLConnection conn = (HttpURLConnection) new URL(candidate).openConnection();
                    conn.setConnectTimeout(1500);
                    conn.setReadTimeout(1500);
                    conn.setRequestMethod("GET");
                    int code = conn.getResponseCode();
                    if (code == 200) {
                        workingUrl = candidate;
                        break;
                    }
                } catch (Exception ignored) {}
            }

            if (workingUrl != null) {
                final String urlToLoad = workingUrl;
                runOnUiThread(() -> {
                    if (bridge != null && bridge.getWebView() != null) {
                        String currentUrl = bridge.getWebView().getUrl();
                        if (currentUrl == null || currentUrl.contains("chrome-error") || currentUrl.startsWith("file:")) {
                            bridge.getWebView().loadUrl(urlToLoad);
                        }
                    }
                });
            } else {
                runOnUiThread(() -> {
                    if (bridge != null && bridge.getWebView() != null) {
                        String currentUrl = bridge.getWebView().getUrl();
                        if (currentUrl == null || currentUrl.contains("chrome-error")) {
                            showIpConfigurationDialog();
                        }
                    }
                });
            }
        }).start();
    }

    public void showIpConfigurationDialog() {
        if (isFinishing() || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1 && isDestroyed())) {
            return;
        }
        SharedPreferences prefs = getSharedPreferences("monday_settings", MODE_PRIVATE);
        String currentIp = prefs.getString("pc_ip", "10.250.173.50");

        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        builder.setTitle("AEGIS AI - Server Connection");
        builder.setMessage("Unable to reach PC server. Make sure your PC is running AEGIS and connected to the same Wi-Fi, or plugged in via USB.\n\nPC IP Address:");

        final EditText input = new EditText(this);
        input.setText(currentIp);
        input.setSingleLine(true);
        input.setPadding(50, 30, 50, 30);
        builder.setView(input);

        builder.setPositiveButton("Connect", (dialog, which) -> {
            String newIp = input.getText().toString().trim();
            if (!newIp.isEmpty()) {
                prefs.edit().putString("pc_ip", newIp).apply();
                if (bridge != null && bridge.getWebView() != null) {
                    bridge.getWebView().loadUrl("http://" + newIp + ":3000");
                }
            }
        });

        builder.setNegativeButton("Retry", (dialog, which) -> {
            checkServerAndConnect();
        });

        try {
            builder.show();
        } catch (Exception ignored) {}
    }

    public void startOverlayService() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
                Toast.makeText(this, "Please enable 'Allow display over other apps' for AEGIS AI", Toast.LENGTH_LONG).show();
                Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            } else {
                Intent intent = new Intent(this, OverlayService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(intent);
                } else {
                    startService(intent);
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public void stopOverlayService() {
        try {
            Intent intent = new Intent(this, OverlayService.class);
            stopService(intent);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        registerBridge();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                PictureInPictureParams params = new PictureInPictureParams.Builder()
                        .setAspectRatio(new Rational(1, 1))
                        .setAutoEnterEnabled(true)
                        .build();
                setPictureInPictureParams(params);
            } catch (Exception ignored) {}
        }
    }

    public void enterPipMode() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder();
                builder.setAspectRatio(new Rational(1, 1));
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    builder.setAutoEnterEnabled(true);
                }
                enterPictureInPictureMode(builder.build());
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        enterPipMode();
    }

    private void initTTS() {
        try {
            tts = new TextToSpeech(this, status -> {
                if (status == TextToSpeech.SUCCESS) {
                    int result = tts.setLanguage(Locale.US);
                    if (result != TextToSpeech.LANG_MISSING_DATA && result != TextToSpeech.LANG_NOT_SUPPORTED) {
                        tts.setPitch(1.4f);
                        tts.setSpeechRate(1.0f);
                        isTtsReady = true;

                        if (pendingSpeechText != null) {
                            String textToSpeak = pendingSpeechText;
                            pendingSpeechText = null;
                            speakNativeTTS(textToSpeak);
                        }
                    }
                }
            });
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private boolean speakNativeTTS(String text) {
        try {
            try {
                AudioManager audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
                if (audioManager != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        AudioAttributes playbackAttributes = new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_ASSISTANT)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                                .build();
                        AudioFocusRequest focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                                .setAudioAttributes(playbackAttributes)
                                .build();
                        audioManager.requestAudioFocus(focusRequest);
                    } else {
                        audioManager.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
                    }
                }
            } catch (Exception ignored) {}

            if (tts != null && isTtsReady) {
                tts.stop();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    Bundle params = new Bundle();
                    params.putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_MUSIC);
                    tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, "MONDAY_TTS_ID");
                } else {
                    java.util.HashMap<String, String> params = new java.util.HashMap<>();
                    params.put(TextToSpeech.Engine.KEY_PARAM_STREAM, String.valueOf(AudioManager.STREAM_MUSIC));
                    tts.speak(text, TextToSpeech.QUEUE_FLUSH, params);
                }
                return true;
            } else {
                pendingSpeechText = text;
                return true;
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return false;
    }

    private void registerBridge() {
        try {
            if (this.bridge != null && this.bridge.getWebView() != null) {
                WebSettings settings = this.bridge.getWebView().getSettings();
                settings.setMediaPlaybackRequiresUserGesture(false);
                settings.setDomStorageEnabled(true);
                settings.setJavaScriptEnabled(true);

                this.bridge.getWebView().addJavascriptInterface(new FlashlightBridge(), "AndroidFlashlight");
                this.bridge.getWebView().addJavascriptInterface(new TTSBridge(), "AndroidTTS");
                this.bridge.getWebView().addJavascriptInterface(new AppLauncherBridge(), "AndroidAppLauncher");
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public class AppLauncherBridge {
        @JavascriptInterface
        public void startOverlay() {
            MainActivity.this.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    MainActivity.this.startOverlayService();
                }
            });
        }

        @JavascriptInterface
        public void stopOverlay() {
            MainActivity.this.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    MainActivity.this.stopOverlayService();
                }
            });
        }

        @JavascriptInterface
        public void enterPip() {
            MainActivity.this.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    MainActivity.this.enterPipMode();
                }
            });
        }

        @JavascriptInterface
        public boolean launchApp(String appName) {
            try {
                String name = appName.toLowerCase().trim();
                Intent intent = null;

                if (name.contains("whatsapp")) {
                    try {
                        intent = MainActivity.this.getPackageManager().getLaunchIntentForPackage("com.whatsapp");
                    } catch (Exception ignored) {}
                    if (intent == null) {
                        try {
                            intent = MainActivity.this.getPackageManager().getLaunchIntentForPackage("com.whatsapp.w4b");
                        } catch (Exception ignored) {}
                    }
                    if (intent == null) intent = new Intent(Intent.ACTION_VIEW, Uri.parse("whatsapp://"));
                } else if (name.contains("camera")) {
                    intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                } else if (name.contains("youtube")) {
                    try {
                        intent = MainActivity.this.getPackageManager().getLaunchIntentForPackage("com.google.android.youtube");
                    } catch (Exception ignored) {}
                    if (intent == null) intent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://youtube.com"));
                } else if (name.contains("spotify")) {
                    try {
                        intent = MainActivity.this.getPackageManager().getLaunchIntentForPackage("com.spotify.music");
                    } catch (Exception ignored) {}
                    if (intent == null) intent = new Intent(Intent.ACTION_VIEW, Uri.parse("spotify://"));
                } else if (name.contains("instagram")) {
                    try {
                        intent = MainActivity.this.getPackageManager().getLaunchIntentForPackage("com.instagram.android");
                    } catch (Exception ignored) {}
                    if (intent == null) intent = new Intent(Intent.ACTION_VIEW, Uri.parse("instagram://"));
                } else if (name.contains("map") || name.contains("google maps")) {
                    try {
                        intent = MainActivity.this.getPackageManager().getLaunchIntentForPackage("com.google.android.apps.maps");
                    } catch (Exception ignored) {}
                    if (intent == null) intent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://maps.google.com"));
                } else if (name.contains("chrome") || name.contains("browser")) {
                    try {
                        intent = MainActivity.this.getPackageManager().getLaunchIntentForPackage("com.android.chrome");
                    } catch (Exception ignored) {}
                    if (intent == null) intent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://google.com"));
                } else if (name.contains("calc") || name.contains("calculator")) {
                    intent = new Intent(Intent.ACTION_MAIN);
                    intent.addCategory(Intent.CATEGORY_APP_CALCULATOR);
                } else if (name.contains("gallery") || name.contains("photo") || name.contains("pictures")) {
                    try {
                        intent = MainActivity.this.getPackageManager().getLaunchIntentForPackage("com.google.android.apps.photos");
                    } catch (Exception ignored) {}
                    if (intent == null) intent = new Intent(Intent.ACTION_VIEW, Uri.parse("content://media/external/images/media"));
                } else if (name.contains("gmail") || name.contains("mail")) {
                    try {
                        intent = MainActivity.this.getPackageManager().getLaunchIntentForPackage("com.google.android.gm");
                    } catch (Exception ignored) {}
                } else if (name.contains("telegram")) {
                    try {
                        intent = MainActivity.this.getPackageManager().getLaunchIntentForPackage("org.telegram.messenger");
                    } catch (Exception ignored) {}
                } else if (name.contains("play store") || name.contains("playstore") || name.contains("store")) {
                    try {
                        intent = MainActivity.this.getPackageManager().getLaunchIntentForPackage("com.android.vending");
                    } catch (Exception ignored) {}
                } else if (name.contains("phone") || name.contains("dialer") || name.contains("call")) {
                    intent = new Intent(Intent.ACTION_DIAL);
                } else if (name.contains("wifi")) {
                    intent = new Intent(Settings.ACTION_WIFI_SETTINGS);
                } else if (name.contains("bluetooth") || name.contains("bt")) {
                    intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
                } else if (name.contains("hotspot") || name.contains("tethering")) {
                    intent = new Intent(Settings.ACTION_WIRELESS_SETTINGS);
                } else if (name.contains("battery") || name.contains("power") || name.contains("saver")) {
                    intent = new Intent(Settings.ACTION_BATTERY_SAVER_SETTINGS);
                } else if (name.contains("settings")) {
                    intent = new Intent(Settings.ACTION_SETTINGS);
                }

                // Dynamic package lookup: check if any installed app matches target name
                if (intent == null) {
                    try {
                        PackageManager pm = MainActivity.this.getPackageManager();
                        List<ApplicationInfo> packages = pm.getInstalledApplications(PackageManager.GET_META_DATA);
                        for (ApplicationInfo packageInfo : packages) {
                            String label = pm.getApplicationLabel(packageInfo).toString().toLowerCase();
                            if (label.equals(name) || label.contains(name) || packageInfo.packageName.toLowerCase().contains(name)) {
                                intent = pm.getLaunchIntentForPackage(packageInfo.packageName);
                                if (intent != null) break;
                            }
                        }
                    } catch (Exception ignored) {}
                }


                if (intent != null) {
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    MainActivity.this.runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            MainActivity.this.enterPipMode();
                        }
                    });
                    MainActivity.this.startActivity(intent);
                    return true;
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
            return false;
        }
    }

    public class TTSBridge {
        @JavascriptInterface
        public boolean speak(String text) {
            return MainActivity.this.speakNativeTTS(text);
        }

        @JavascriptInterface
        public boolean stop() {
            try {
                if (MainActivity.this.tts != null) {
                    MainActivity.this.tts.stop();
                    return true;
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
            return false;
        }
    }

    public class FlashlightBridge {
        @JavascriptInterface
        public boolean toggle(boolean enable) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    CameraManager cameraManager = (CameraManager) MainActivity.this.getSystemService(Context.CAMERA_SERVICE);
                    if (cameraManager != null) {
                        String[] cameraIds = cameraManager.getCameraIdList();
                        for (String id : cameraIds) {
                            try {
                                cameraManager.setTorchMode(id, enable);
                                return true;
                            } catch (Exception ignored) {
                            }
                        }
                    }
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
            return false;
        }

        @JavascriptInterface
        public boolean isAvailable() {
            return true;
        }
    }

    @Override
    public void onDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        super.onDestroy();
    }
}
