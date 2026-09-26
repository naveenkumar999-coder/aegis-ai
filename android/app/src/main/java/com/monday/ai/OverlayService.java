package com.monday.ai;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
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
import android.widget.Button;
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

    private int initialX;
    private int initialY;
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
        startForegroundIfNeeded();
        createOverlay();
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

        params = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                layoutType,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT
        );

        params.gravity = Gravity.TOP | Gravity.START;
        params.x = 100;
        params.y = 350;

        // Container Layout
        FrameLayout container = new FrameLayout(this);

        // 1. 3D Cybernetic Floating Orb (60dp with 3D gyroscopic rotating rings and glowing core)
        circleView = new FrameLayout(this);
        int orbSize = dpToPx(60);
        FrameLayout.LayoutParams circleParams = new FrameLayout.LayoutParams(orbSize, orbSize);
        circleView.setLayoutParams(circleParams);

        CyberOrb3DView orb3D = new CyberOrb3DView(this);
        FrameLayout.LayoutParams orbParams = new FrameLayout.LayoutParams(orbSize, orbSize);
        orbParams.gravity = Gravity.CENTER;
        circleView.addView(orb3D, orbParams);

        // 2. Expanded Control Card View
        cardView = new LinearLayout(this);
        cardView.setOrientation(LinearLayout.VERTICAL);
        cardView.setPadding(dpToPx(12), dpToPx(10), dpToPx(12), dpToPx(10));
        cardView.setVisibility(View.GONE);

        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(Color.parseColor("#F50c0c12"));
        cardBg.setCornerRadius(dpToPx(16));
        cardBg.setStroke(dpToPx(1.5f), Color.parseColor("#ffaa30"));
        cardView.setBackground(cardBg);

        // Header
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(0, 0, 0, dpToPx(8));

        TextView title = new TextView(this);
        title.setText("AEGIS AI");
        title.setTextColor(Color.parseColor("#ffaa30"));
        title.setTextSize(12);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.0f);
        header.addView(title, titleParams);

        // Close / Turn Off Header Button (✕)
        TextView closeHeaderBtn = new TextView(this);
        closeHeaderBtn.setText(" ✕ HIDE ");
        closeHeaderBtn.setTextColor(Color.parseColor("#ff3b30"));
        closeHeaderBtn.setTextSize(11);
        closeHeaderBtn.setTypeface(null, android.graphics.Typeface.BOLD);
        closeHeaderBtn.setPadding(dpToPx(6), dpToPx(3), dpToPx(6), dpToPx(3));
        closeHeaderBtn.setOnClickListener(v -> stopOverlaySelf());
        header.addView(closeHeaderBtn);

        cardView.addView(header);

        // Action Buttons Row
        LinearLayout actionsRow = new LinearLayout(this);
        actionsRow.setOrientation(LinearLayout.HORIZONTAL);
        actionsRow.setGravity(Gravity.CENTER);

        Button talkBtn = createStyledButton("🎙️ TALK", "#ffaa30");
        talkBtn.setOnClickListener(v -> launchApp("com.monday.ai"));

        Button waBtn = createStyledButton("💬 WHATSAPP", "#25D366");
        waBtn.setOnClickListener(v -> openWhatsApp());

        Button torchBtn = createStyledButton("🔦 FLASH", "#00e5ff");
        torchBtn.setOnClickListener(v -> toggleTorch());

        actionsRow.addView(talkBtn);
        actionsRow.addView(waBtn);
        actionsRow.addView(torchBtn);
        cardView.addView(actionsRow);

        // Open App Button Row
        Button openAppBtn = createStyledButton("⚡ OPEN AEGIS APP", "#ffaa30");
        openAppBtn.setOnClickListener(v -> launchApp("com.monday.ai"));
        cardView.addView(openAppBtn);

        // Explicit TURN OFF OVERLAY Button
        Button turnOffBtn = createStyledButton("🔴 TURN OFF OVERLAY", "#ff3b30");
        turnOffBtn.setOnClickListener(v -> stopOverlaySelf());
        cardView.addView(turnOffBtn);

        container.addView(circleView);
        container.addView(cardView);

        overlayView = container;

        // Touch Drag & Tap Handler
        circleView.setOnTouchListener((v, event) -> {
            switch (event.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    initialX = params.x;
                    initialY = params.y;
                    initialTouchX = event.getRawX();
                    initialTouchY = event.getRawY();
                    isClick = true;
                    return true;

                case MotionEvent.ACTION_MOVE:
                    float deltaX = event.getRawX() - initialTouchX;
                    float deltaY = event.getRawY() - initialTouchY;

                    if (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6) {
                        isClick = false;
                    }

                    params.x = initialX + (int) deltaX;
                    params.y = initialY + (int) deltaY;
                    windowManager.updateViewLayout(overlayView, params);
                    return true;

                case MotionEvent.ACTION_UP:
                    if (isClick) {
                        toggleExpand();
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

    private void toggleExpand() {
        isExpanded = !isExpanded;
        if (isExpanded) {
            circleView.setVisibility(View.GONE);
            cardView.setVisibility(View.VISIBLE);
        } else {
            cardView.setVisibility(View.GONE);
            circleView.setVisibility(View.VISIBLE);
        }
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
