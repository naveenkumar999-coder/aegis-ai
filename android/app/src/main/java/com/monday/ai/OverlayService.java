package com.monday.ai;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.drawable.GradientDrawable;
import android.hardware.camera2.CameraManager;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.provider.MediaStore;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

public class OverlayService extends Service {
    private static final String CHANNEL_ID = "monday_overlay_channel";
    private static final int NOTIFICATION_ID = 9001;

    private WindowManager windowManager;
    private View overlayView;
    private WindowManager.LayoutParams params;

    private boolean isExpanded = false;
    private boolean isTorchOn = false;

    private FrameLayout circleView;
    private LinearLayout cardView;
    private EditText textInputField;
    private CyberOrb3DView orb3DViewRef;

    private int currentOrbSizeDp = 60;
    private float currentOpacity = 0.75f;

    private int initialX;
    private int initialY;
    private int lastOrbX = -30;
    private int lastOrbY = 350;
    private float initialTouchX;
    private float initialTouchY;
    private boolean isClick = true;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        SharedPreferences prefs = getSharedPreferences("aegis_overlay_prefs", MODE_PRIVATE);
        currentOrbSizeDp = prefs.getInt("orb_size_dp", 60);
        currentOpacity = prefs.getFloat("orb_opacity", 0.75f);
        startForegroundIfNeeded();
        createOverlay();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if ("UPDATE_ORB_SETTINGS".equals(action)) {
                if (intent.hasExtra("orb_size_dp")) {
                    int sizeDp = intent.getIntExtra("orb_size_dp", currentOrbSizeDp);
                    setOrbSize(sizeDp);
                }
                if (intent.hasExtra("orb_opacity")) {
                    float opacity = intent.getFloatExtra("orb_opacity", currentOpacity);
                    setOrbOpacity(opacity);
                }
            } else if ("STOP_OVERLAY".equals(action)) {
                stopOverlaySelf();
            }
        }
        return START_STICKY;
    }

    private void startForegroundIfNeeded() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID,
                        "AEGIS AI Overlay",
                        NotificationManager.IMPORTANCE_LOW
                );
                NotificationManager nm = getSystemService(NotificationManager.class);
                if (nm != null) {
                    nm.createNotificationChannel(channel);
                }

                Notification notification = new Notification.Builder(this, CHANNEL_ID)
                        .setContentTitle("AEGIS AI Floating Widget")
                        .setContentText("Active over Home Screen & Applications")
                        .setSmallIcon(android.R.drawable.ic_menu_compass)
                        .setOngoing(true)
                        .build();

                if (Build.VERSION.SDK_INT >= 34) {
                    startForeground(NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(NOTIFICATION_ID, notification, 0);
                } else {
                    startForeground(NOTIFICATION_ID, notification);
                }
            }
        } catch (Throwable t) {
            t.printStackTrace();
        }
    }


    private void createOverlay() {
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);

        int layoutType;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            layoutType = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
        } else {
            layoutType = WindowManager.LayoutParams.TYPE_PHONE;
        }

        int orbSizePx = dpToPx(currentOrbSizeDp);
        params = new WindowManager.LayoutParams(
                orbSizePx,
                orbSizePx,
                layoutType,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT
        );

        params.gravity = Gravity.TOP | Gravity.START;
        params.x = -orbSizePx / 2; // Initial position tucked at left edge
        params.y = dpToPx(240);
        lastOrbX = params.x;
        lastOrbY = params.y;

        // Container Layout (covers screen when expanded, touch outside to dismiss)
        FrameLayout container = new FrameLayout(this);
        container.setClickable(true);
        container.setFocusable(true);
        container.setOnClickListener(v -> {
            if (isExpanded) {
                toggleExpand();
            }
        });

        // 1. 3D Cybernetic Floating Orb (EasyTouch edge ball)
        circleView = new FrameLayout(this);
        FrameLayout.LayoutParams circleParams = new FrameLayout.LayoutParams(orbSizePx, orbSizePx);
        circleView.setLayoutParams(circleParams);
        circleView.setAlpha(currentOpacity);

        CyberOrb3DView orb3D = new CyberOrb3DView(this);
        orb3DViewRef = orb3D;
        FrameLayout.LayoutParams orbParams = new FrameLayout.LayoutParams(orbSizePx, orbSizePx);
        orbParams.gravity = Gravity.CENTER;
        circleView.addView(orb3D, orbParams);

        // 2. Expanded Control Card View (EasyTouch centered card)
        cardView = new LinearLayout(this);
        cardView.setOrientation(LinearLayout.VERTICAL);
        cardView.setPadding(dpToPx(14), dpToPx(12), dpToPx(14), dpToPx(12));
        cardView.setVisibility(View.GONE);
        // Intercept clicks inside card so tapping inside does NOT dismiss the popup
        cardView.setOnClickListener(v -> {});

        FrameLayout.LayoutParams cardParams = new FrameLayout.LayoutParams(
                dpToPx(280),
                FrameLayout.LayoutParams.WRAP_CONTENT
        );
        cardParams.gravity = Gravity.CENTER;
        cardView.setLayoutParams(cardParams);

        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(Color.parseColor("#EE0a0a10"));
        cardBg.setCornerRadius(dpToPx(18));
        cardBg.setStroke(dpToPx(1.5f), Color.parseColor("#ffaa30"));
        cardView.setBackground(cardBg);

        // Header (Clean title, touching anywhere outside automatically hides)
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER);
        header.setPadding(0, 0, 0, dpToPx(8));

        TextView title = new TextView(this);
        title.setText("⚡ AEGIS AI");
        title.setTextColor(Color.parseColor("#ffaa30"));
        title.setTextSize(13);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        header.addView(title);

        cardView.addView(header);

        // Text Input Row
        LinearLayout inputRow = new LinearLayout(this);
        inputRow.setOrientation(LinearLayout.HORIZONTAL);
        inputRow.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams inputRowParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        inputRowParams.setMargins(0, 0, 0, dpToPx(8));
        inputRow.setLayoutParams(inputRowParams);

        textInputField = new EditText(this);
        textInputField.setHint("Type message or command...");
        textInputField.setHintTextColor(Color.parseColor("#88ffaa30"));
        textInputField.setTextColor(Color.WHITE);
        textInputField.setTextSize(11);
        textInputField.setSingleLine(true);
        textInputField.setImeOptions(EditorInfo.IME_ACTION_SEND);
        textInputField.setPadding(dpToPx(8), dpToPx(6), dpToPx(8), dpToPx(6));

        GradientDrawable inputBg = new GradientDrawable();
        inputBg.setColor(Color.parseColor("#22ffffff"));
        inputBg.setCornerRadius(dpToPx(8));
        inputBg.setStroke(dpToPx(1), Color.parseColor("#ffaa30"));
        textInputField.setBackground(inputBg);

        LinearLayout.LayoutParams inputLp = new LinearLayout.LayoutParams(0, dpToPx(34), 1.0f);
        inputLp.setMargins(0, 0, dpToPx(4), 0);
        textInputField.setLayoutParams(inputLp);

        Button sendBtn = new Button(this);
        sendBtn.setText("⚡ SEND");
        sendBtn.setTextColor(Color.WHITE);
        sendBtn.setTextSize(10);
        sendBtn.setTypeface(null, android.graphics.Typeface.BOLD);
        sendBtn.setPadding(dpToPx(6), 0, dpToPx(6), 0);

        GradientDrawable sendBg = new GradientDrawable();
        sendBg.setColor(Color.parseColor("#44ffaa30"));
        sendBg.setCornerRadius(dpToPx(8));
        sendBg.setStroke(dpToPx(1), Color.parseColor("#ffaa30"));
        sendBtn.setBackground(sendBg);

        LinearLayout.LayoutParams sendLp = new LinearLayout.LayoutParams(dpToPx(64), dpToPx(34));
        sendBtn.setLayoutParams(sendLp);

        sendBtn.setOnClickListener(v -> {
            if (textInputField != null) {
                String query = textInputField.getText().toString().trim();
                if (!query.isEmpty()) {
                    handleTextSubmit(query);
                    textInputField.setText("");
                }
            }
        });

        textInputField.setOnEditorActionListener((tv, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEND || actionId == EditorInfo.IME_ACTION_DONE) {
                sendBtn.performClick();
                return true;
            }
            return false;
        });

        inputRow.addView(textInputField);
        inputRow.addView(sendBtn);
        cardView.addView(inputRow);

        // Action Buttons Row (TALK, WHATSAPP, FLASH)
        LinearLayout actionsRow = new LinearLayout(this);
        actionsRow.setOrientation(LinearLayout.HORIZONTAL);
        actionsRow.setGravity(Gravity.CENTER);

        Button talkBtn = createStyledButton("🎙️ TALK", "#ffaa30");
        talkBtn.setOnClickListener(v -> startVoiceCommand());

        Button waBtn = createStyledButton("💬 WHATSAPP", "#25D366");
        waBtn.setOnClickListener(v -> openWhatsApp());

        Button torchBtn = createStyledButton("🔦 FLASH", "#00e5ff");
        torchBtn.setOnClickListener(v -> toggleTorch());

        actionsRow.addView(talkBtn);
        actionsRow.addView(waBtn);
        actionsRow.addView(torchBtn);
        cardView.addView(actionsRow);

        // Explicit TURN OFF OVERLAY Button (stops overlay service completely)
        Button turnOffBtn = createStyledButton("🔴 TURN OFF OVERLAY", "#ff3b30");
        turnOffBtn.setOnClickListener(v -> stopOverlaySelf());
        cardView.addView(turnOffBtn);

        container.addView(circleView);
        container.addView(cardView);

        overlayView = container;

        // Touch Drag & Tap Handler (Free movement anywhere; tucks half off-screen only at edges)
        circleView.setOnTouchListener((v, event) -> {
            switch (event.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    initialX = params.x;
                    initialY = params.y;
                    initialTouchX = event.getRawX();
                    initialTouchY = event.getRawY();
                    isClick = true;
                    circleView.animate().alpha(1.0f).setDuration(120).start();
                    return true;

                case MotionEvent.ACTION_MOVE:
                    float deltaX = event.getRawX() - initialTouchX;
                    float deltaY = event.getRawY() - initialTouchY;

                    if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
                        isClick = false;
                    }

                    params.x = initialX + (int) deltaX;
                    params.y = initialY + (int) deltaY;
                    if (windowManager != null && overlayView != null) {
                        windowManager.updateViewLayout(overlayView, params);
                    }
                    return true;

                case MotionEvent.ACTION_UP:
                    if (isClick) {
                        toggleExpand();
                    } else {
                        checkEdgePlacement();
                    }
                    return true;
            }
            return false;
        });

        // Long click on circle to turn off overlay
        circleView.setOnLongClickListener(v -> {
            stopOverlaySelf();
            return true;
        });

        windowManager.addView(overlayView, params);
    }

    public void setOrbSize(int newSizeDp) {
        currentOrbSizeDp = newSizeDp;
        int px = dpToPx(newSizeDp);
        if (circleView != null) {
            FrameLayout.LayoutParams cp = (FrameLayout.LayoutParams) circleView.getLayoutParams();
            if (cp != null) {
                cp.width = px;
                cp.height = px;
                circleView.setLayoutParams(cp);
            }
        }
        if (orb3DViewRef != null) {
            FrameLayout.LayoutParams op = (FrameLayout.LayoutParams) orb3DViewRef.getLayoutParams();
            if (op != null) {
                op.width = px;
                op.height = px;
                orb3DViewRef.setLayoutParams(op);
            }
        }
        if (!isExpanded && params != null && windowManager != null && overlayView != null) {
            params.width = px;
            params.height = px;
            windowManager.updateViewLayout(overlayView, params);
            checkEdgePlacement();
        }
        getSharedPreferences("aegis_overlay_prefs", MODE_PRIVATE)
                .edit().putInt("orb_size_dp", newSizeDp).apply();
    }

    public void setOrbOpacity(float alpha) {
        currentOpacity = alpha;
        if (circleView != null) {
            circleView.setAlpha(alpha);
        }
        getSharedPreferences("aegis_overlay_prefs", MODE_PRIVATE)
                .edit().putFloat("orb_opacity", alpha).apply();
    }

    private Button createStyledButton(String text, String colorHex) {
        Button btn = new Button(this);
        btn.setText(text);
        btn.setTextColor(Color.WHITE);
        btn.setTextSize(10);
        btn.setPadding(dpToPx(8), dpToPx(4), dpToPx(8), dpToPx(4));

        GradientDrawable btnBg = new GradientDrawable();
        btnBg.setColor(Color.parseColor("#22ffffff"));
        btnBg.setCornerRadius(dpToPx(8));
        btnBg.setStroke(dpToPx(1), Color.parseColor(colorHex));
        btn.setBackground(btnBg);

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dpToPx(32)
        );
        lp.setMargins(dpToPx(2), dpToPx(3), dpToPx(2), dpToPx(3));
        btn.setLayoutParams(lp);

        return btn;
    }

    private void checkEdgePlacement() {
        if (windowManager == null || overlayView == null) return;
        int screenWidth = getResources().getDisplayMetrics().widthPixels;
        int screenHeight = getResources().getDisplayMetrics().heightPixels;
        int orbSize = dpToPx(currentOrbSizeDp);

        // Edge threshold: only if user intentionally drops near the screen edge (within 35dp)
        int edgeThreshold = dpToPx(35);

        if (params.x < edgeThreshold) {
            // User placed it at/near left edge -> tuck half off screen!
            params.x = -orbSize / 2;
            circleView.animate().alpha(currentOpacity * 0.7f).setDuration(300).start();
        } else if (params.x + orbSize > screenWidth - edgeThreshold) {
            // User placed it at/near right edge -> tuck half off screen!
            params.x = screenWidth - orbSize / 2;
            circleView.animate().alpha(currentOpacity * 0.7f).setDuration(300).start();
        } else {
            // User placed it ANYWHERE ELSE on the screen -> LET IT STAY RIGHT THERE!
            circleView.animate().alpha(currentOpacity).setDuration(200).start();
        }

        // Keep within vertical screen bounds
        params.y = Math.max(dpToPx(30), Math.min(screenHeight - orbSize - dpToPx(50), params.y));

        lastOrbX = params.x;
        lastOrbY = params.y;

        if (windowManager != null && overlayView != null) {
            windowManager.updateViewLayout(overlayView, params);
        }
    }

    private void toggleExpand() {
        isExpanded = !isExpanded;
        if (isExpanded) {
            lastOrbX = params.x;
            lastOrbY = params.y;

            circleView.setVisibility(View.GONE);
            cardView.setVisibility(View.VISIBLE);

            // Expand overlay to fill screen with touch-dismiss backdrop
            params.width = WindowManager.LayoutParams.MATCH_PARENT;
            params.height = WindowManager.LayoutParams.MATCH_PARENT;
            params.x = 0;
            params.y = 0;
            params.flags = WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL;
            if (overlayView != null) {
                overlayView.setBackgroundColor(Color.parseColor("#44000000"));
            }

            if (windowManager != null && overlayView != null) {
                windowManager.updateViewLayout(overlayView, params);
            }
        } else {
            // Dismiss soft keyboard when minimizing back to edge orb
            if (textInputField != null) {
                InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
                if (imm != null) {
                    imm.hideSoftInputFromWindow(textInputField.getWindowToken(), 0);
                }
                textInputField.clearFocus();
            }

            cardView.setVisibility(View.GONE);
            circleView.setVisibility(View.VISIBLE);
            if (overlayView != null) {
                overlayView.setBackgroundColor(Color.TRANSPARENT);
            }

            // Restore compact size and position for the orb
            int orbSize = dpToPx(currentOrbSizeDp);
            params.width = orbSize;
            params.height = orbSize;
            params.x = lastOrbX;
            params.y = lastOrbY;
            params.flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE;

            if (windowManager != null && overlayView != null) {
                windowManager.updateViewLayout(overlayView, params);
            }
            checkEdgePlacement();
        }
    }

    private void startVoiceCommand() {
        try {
            Intent intent = new Intent(this, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            intent.putExtra("start_voice", true);
            startActivity(intent);
        } catch (Exception e) {
            e.printStackTrace();
        }
        toggleExpand();
    }

    private void handleTextSubmit(String query) {
        if (query == null || query.trim().isEmpty()) return;
        String q = query.trim();
        try {
            Intent intent = new Intent(this, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            intent.putExtra("user_query", q);
            startActivity(intent);
        } catch (Exception e) {
            e.printStackTrace();
        }
        toggleExpand();
    }

    private void stopOverlaySelf() {
        Toast.makeText(this, "AEGIS Overlay Turned Off", Toast.LENGTH_SHORT).show();
        stopForeground(true);
        stopSelf();
    }

    private void launchApp(String packageName) {
        try {
            Intent intent = getPackageManager().getLaunchIntentForPackage(packageName);
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void openWhatsApp() {
        try {
            Intent intent = getPackageManager().getLaunchIntentForPackage("com.whatsapp");
            if (intent == null) {
                intent = new Intent(Intent.ACTION_VIEW, Uri.parse("whatsapp://"));
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void toggleTorch() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                CameraManager cm = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
                if (cm != null) {
                    String[] ids = cm.getCameraIdList();
                    if (ids.length > 0) {
                        isTorchOn = !isTorchOn;
                        cm.setTorchMode(ids[0], isTorchOn);
                    }
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private int dpToPx(float dp) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(dp * density);
    }

    public static class CyberOrb3DView extends View {
        private Paint corePaint;
        private Paint glowPaint;
        private Paint ringPaint1;
        private Paint ringPaint2;
        private Paint ringPaint3;
        private Paint dotPaint;
        private Paint gridPaint;
        private Paint rimPaint;

        private RectF ovalRect1 = new RectF();
        private RectF ovalRect2 = new RectF();
        private RectF ovalRect3 = new RectF();

        private float rotation1 = 0f;
        private float rotation2 = 0f;
        private float rotation3 = 0f;
        private float pulsePhase = 0f;
        private long lastTime = 0;

        public CyberOrb3DView(Context context) {
            super(context);
            init();
        }

        private void init() {
            setLayerType(View.LAYER_TYPE_HARDWARE, null);

            corePaint = new Paint(Paint.ANTI_ALIAS_FLAG);

            glowPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            glowPaint.setStyle(Paint.Style.FILL);

            ringPaint1 = new Paint(Paint.ANTI_ALIAS_FLAG);
            ringPaint1.setStyle(Paint.Style.STROKE);
            ringPaint1.setStrokeWidth(dpToPx(1.8f));
            ringPaint1.setColor(Color.parseColor("#ffaa30"));

            ringPaint2 = new Paint(Paint.ANTI_ALIAS_FLAG);
            ringPaint2.setStyle(Paint.Style.STROKE);
            ringPaint2.setStrokeWidth(dpToPx(1.4f));
            ringPaint2.setColor(Color.parseColor("#ffcc66"));

            ringPaint3 = new Paint(Paint.ANTI_ALIAS_FLAG);
            ringPaint3.setStyle(Paint.Style.STROKE);
            ringPaint3.setStrokeWidth(dpToPx(1.2f));
            ringPaint3.setColor(Color.parseColor("#ff8800"));

            dotPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            dotPaint.setStyle(Paint.Style.FILL);
            dotPaint.setColor(Color.parseColor("#ffffff"));

            gridPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            gridPaint.setStyle(Paint.Style.STROKE);
            gridPaint.setStrokeWidth(dpToPx(0.8f));
            gridPaint.setColor(Color.parseColor("#44ffaa30"));

            rimPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            rimPaint.setStyle(Paint.Style.STROKE);
            rimPaint.setStrokeWidth(dpToPx(1.0f));
            rimPaint.setColor(Color.parseColor("#99ffffff"));
        }

        private float dpToPx(float dp) {
            return dp * getResources().getDisplayMetrics().density;
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);

            int width = getWidth();
            int height = getHeight();
            if (width <= 0 || height <= 0) return;

            float cx = width / 2.0f;
            float cy = height / 2.0f;
            float maxR = Math.min(cx, cy) - dpToPx(2);

            long now = System.currentTimeMillis();
            if (lastTime == 0) lastTime = now;
            float dt = (now - lastTime) / 1000.0f;
            if (dt > 0.1f) dt = 0.016f;
            lastTime = now;

            // Update rotation and breathing pulse
            rotation1 = (rotation1 + 42f * dt) % 360f;
            rotation2 = (rotation2 - 65f * dt) % 360f;
            rotation3 = (rotation3 + 88f * dt) % 360f;
            pulsePhase = (pulsePhase + 2.5f * dt) % ((float) (Math.PI * 2));

            float pulseScale = 1.0f + 0.06f * (float) Math.sin(pulsePhase);
            float baseRadius = maxR * 0.44f;
            float coreRadius = baseRadius * pulseScale;

            // 1. Dark cybernetic backing sphere with ambient glow
            glowPaint.setShader(new RadialGradient(
                    cx, cy, maxR,
                    new int[]{Color.parseColor("#33ffaa30"), Color.parseColor("#15ffaa30"), Color.parseColor("#00000000")},
                    new float[]{0.0f, 0.65f, 1.0f},
                    Shader.TileMode.CLAMP
            ));
            canvas.drawCircle(cx, cy, maxR, glowPaint);

            // 2. Render 3D Gyroscopic Orbital Rings (tilted in 3D space)
            drawOrbitalRing(canvas, cx, cy, maxR * 0.88f, maxR * 0.38f, 25f + rotation1, ringPaint1, dotPaint, rotation1 * 2f);
            drawOrbitalRing(canvas, cx, cy, maxR * 0.78f, maxR * 0.32f, -40f + rotation2, ringPaint2, dotPaint, -rotation2 * 2.2f);
            drawOrbitalRing(canvas, cx, cy, maxR * 0.94f, maxR * 0.42f, 75f + rotation3, ringPaint3, dotPaint, rotation3 * 1.8f);

            // 3. True 3D Illuminated Sphere Core (3D Radial Gradient with Specular Light Source)
            float lightOffX = cx - coreRadius * 0.30f;
            float lightOffY = cy - coreRadius * 0.30f;
            corePaint.setShader(new RadialGradient(
                    lightOffX, lightOffY, coreRadius * 1.35f,
                    new int[]{
                            Color.parseColor("#ffffff"), // Specular highlight
                            Color.parseColor("#fff176"), // Hot radiant plasma
                            Color.parseColor("#ff9800"), // Cyber gold midtone
                            Color.parseColor("#e65100"), // Deep amber
                            Color.parseColor("#1a0500")  // Shaded back rim
                    },
                    new float[]{0.0f, 0.22f, 0.55f, 0.82f, 1.0f},
                    Shader.TileMode.CLAMP
            ));
            canvas.drawCircle(cx, cy, coreRadius, corePaint);

            // 4. Rotating 3D Holographic Latitude & Longitude Meridians
            canvas.save();
            canvas.clipRect(cx - coreRadius, cy - coreRadius, cx + coreRadius, cy + coreRadius);
            for (int i = 0; i < 3; i++) {
                float phase = (rotation1 * 0.035f + i * 1.05f) % ((float) Math.PI);
                float span = coreRadius * (float) Math.cos(phase);
                ovalRect1.set(cx - Math.abs(span), cy - coreRadius, cx + Math.abs(span), cy + coreRadius);
                canvas.drawOval(ovalRect1, gridPaint);
            }
            // Equator ring
            ovalRect2.set(cx - coreRadius, cy - coreRadius * 0.35f, cx + coreRadius, cy + coreRadius * 0.35f);
            canvas.drawOval(ovalRect2, gridPaint);
            canvas.restore();

            // 5. Specular Crescent Light Rim
            ovalRect3.set(cx - coreRadius * 0.92f, cy - coreRadius * 0.92f, cx + coreRadius * 0.75f, cy + coreRadius * 0.75f);
            canvas.drawArc(ovalRect3, 190, 85, false, rimPaint);

            // 6. Request next frame for fluid 60fps 3D animation
            postInvalidateOnAnimation();
        }

        private void drawOrbitalRing(Canvas canvas, float cx, float cy, float rx, float ry, float angle, Paint ringPaint, Paint dotP, float dotAngleDeg) {
            canvas.save();
            canvas.translate(cx, cy);
            canvas.rotate(angle);
            ovalRect1.set(-rx, -ry, rx, ry);
            canvas.drawOval(ovalRect1, ringPaint);

            // Orbiting photon / energy particle
            double rad = Math.toRadians(dotAngleDeg);
            float px = (float) (rx * Math.cos(rad));
            float py = (float) (ry * Math.sin(rad));
            canvas.drawCircle(px, py, dpToPx(2.2f), dotP);
            canvas.restore();
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (overlayView != null && windowManager != null) {
            try {
                windowManager.removeView(overlayView);
            } catch (Exception ignored) {}
        }
    }
}
