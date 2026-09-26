// MONDAY Mobile Hardware & Web Intent Control Engine

let activeMediaStream: MediaStream | null = null;
let activeTorchTrack: MediaStreamTrack | null = null;
let isTorchOn = false;
let screenFlashOverlay: HTMLDivElement | null = null;

/**
 * Toggles or sets mobile device camera flashlight (Torch) via Native Android Bridge, Web API, or Screen Flash fallback
 */
export async function toggleMobileFlashlight(enable?: boolean): Promise<{ success: boolean; message: string }> {
  if (typeof window === "undefined") {
    return { success: false, message: "Window environment unavailable." };
  }

  const targetState = enable !== undefined ? enable : !isTorchOn;

  // 1. Try Native Android Flashlight Bridge (Capacitor Native Interface)
  if ((window as any).AndroidFlashlight && typeof (window as any).AndroidFlashlight.toggle === "function") {
    try {
      const res = (window as any).AndroidFlashlight.toggle(targetState);
      if (res) {
        isTorchOn = targetState;
        toggleScreenFlashFallback(false); // remove screen flash if native LED worked
        return {
          success: true,
          message: targetState ? "Mobile Flashlight turned ON successfully, Boss!" : "Mobile Flashlight turned OFF successfully, Boss!",
        };
      }
    } catch (err) {
      console.warn("AndroidFlashlight native bridge error:", err);
    }
  }

  // 2. Try Web MediaStreamTrack API (Direct constraint without capability check block)
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try {
      if (targetState) {
        if (!activeMediaStream) {
          activeMediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
          });
        }

        const videoTracks = activeMediaStream.getVideoTracks();
        if (videoTracks.length > 0) {
          const track = videoTracks[0];
          try {
            await (track as any).applyConstraints({ advanced: [{ torch: true }] });
            activeTorchTrack = track;
            isTorchOn = true;
            toggleScreenFlashFallback(false);
            return { success: true, message: "Mobile Flashlight turned ON successfully, Boss!" };
          } catch (constraintErr: any) {
            console.warn("Web Torch constraint apply failed:", constraintErr);
          }
        }
      } else {
        if (activeTorchTrack) {
          try {
            await (activeTorchTrack as any).applyConstraints({ advanced: [{ torch: false }] });
          } catch (e) {}
        }
        if (activeMediaStream) {
          activeMediaStream.getTracks().forEach((t) => t.stop());
          activeMediaStream = null;
        }
        activeTorchTrack = null;
        isTorchOn = false;
        toggleScreenFlashFallback(false);
        return { success: true, message: "Mobile Flashlight turned OFF successfully, Boss!" };
      }
    } catch (err: any) {
      console.warn("Mobile Flashlight Web API Error:", err);
    }
  }

  // 3. Fallback: Ultra-bright Screen Torch Overlay Mode
  toggleScreenFlashFallback(targetState);
  isTorchOn = targetState;
  return {
    success: true,
    message: targetState
      ? "Mobile High-Brightness Screen Flashlight activated, Boss!"
      : "Mobile Flashlight turned OFF, Boss!",
  };
}

/**
 * Creates or removes an ultra-bright white screen overlay as a flashlight fallback
 */
function toggleScreenFlashFallback(show: boolean) {
  if (typeof document === "undefined") return;

  if (show) {
    if (!screenFlashOverlay) {
      screenFlashOverlay = document.createElement("div");
      screenFlashOverlay.id = "monday-screen-flashlight";
      screenFlashOverlay.style.position = "fixed";
      screenFlashOverlay.style.top = "0";
      screenFlashOverlay.style.left = "0";
      screenFlashOverlay.style.width = "100vw";
      screenFlashOverlay.style.height = "100vh";
      screenFlashOverlay.style.backgroundColor = "#ffffff";
      screenFlashOverlay.style.zIndex = "999999";
      screenFlashOverlay.style.display = "flex";
      screenFlashOverlay.style.flexDirection = "column";
      screenFlashOverlay.style.alignItems = "center";
      screenFlashOverlay.style.justifyContent = "center";
      screenFlashOverlay.style.color = "#000000";
      screenFlashOverlay.style.fontFamily = "sans-serif";
      screenFlashOverlay.style.fontWeight = "bold";

      screenFlashOverlay.innerHTML = `
        <div style="font-size: 24px; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 2px;">⚡ MONDAY FLASHLIGHT</div>
        <button id="close-screen-flash-btn" style="padding: 14px 32px; background: #000; color: #fff; border: none; border-radius: 30px; font-size: 16px; font-weight: bold; cursor: pointer;">
          TURN OFF FLASHLIGHT
        </button>
      `;

      document.body.appendChild(screenFlashOverlay);

      const btn = document.getElementById("close-screen-flash-btn");
      if (btn) {
        btn.onclick = () => {
          toggleMobileFlashlight(false);
        };
      }
    }
  } else {
    if (screenFlashOverlay && screenFlashOverlay.parentNode) {
      screenFlashOverlay.parentNode.removeChild(screenFlashOverlay);
    }
    screenFlashOverlay = null;
  }
}

/**
 * Triggers Mobile Native Intents or URL Schemes for Android Settings & App Directives
 */
export function launchMobileIntent(target: string): { success: boolean; message: string } {
  if (typeof window === "undefined") {
    return { success: false, message: "Window environment unavailable." };
  }

  const t = target.toLowerCase().trim();

  // 1. Try Native Android Java AppLauncher Bridge
  if ((window as any).AndroidAppLauncher && typeof (window as any).AndroidAppLauncher.launchApp === "function") {
    try {
      const launched = (window as any).AndroidAppLauncher.launchApp(t);
      if (launched) {
        return { success: true, message: `Launched ${target} on your mobile device, Boss!` };
      }
    } catch (e) {
      console.warn("AndroidAppLauncher bridge error:", e);
    }
  }

  const isAndroid = /android/i.test(navigator.userAgent);

  let intentUrl = "";
  let targetName = target;

  if (t.includes("wifi") || t.includes("wi-fi")) {
    targetName = "Wi-Fi Settings";
    intentUrl = isAndroid ? "intent:#Intent;action=android.settings.WIFI_SETTINGS;end" : "app-settings:";
  } else if (t.includes("bluetooth") || t.includes("bt")) {
    targetName = "Bluetooth Settings";
    intentUrl = isAndroid ? "intent:#Intent;action=android.settings.BLUETOOTH_SETTINGS;end" : "app-settings:";
  } else if (t.includes("hotspot") || t.includes("tethering")) {
    targetName = "Hotspot & Tethering Settings";
    intentUrl = isAndroid ? "intent:#Intent;action=android.settings.TETHER_SETTINGS;end" : "app-settings:";
  } else if (t.includes("airplane") || t.includes("flight mode")) {
    targetName = "Airplane Mode Settings";
    intentUrl = isAndroid ? "intent:#Intent;action=android.settings.AIRPLANE_MODE_SETTINGS;end" : "app-settings:";
  } else if (t.includes("battery") || t.includes("power saver") || t.includes("powersaver") || t.includes("energy saver")) {
    targetName = "Battery Saver Settings";
    intentUrl = isAndroid ? "intent:#Intent;action=android.settings.BATTERY_SAVER_SETTINGS;end" : "app-settings:";
  } else if (t.includes("settings")) {

    targetName = "Device Settings";
    intentUrl = isAndroid ? "intent:#Intent;action=android.settings.SETTINGS;end" : "app-settings:";
  } else if (t.includes("whatsapp") || t.includes("whats app")) {
    targetName = "WhatsApp";
    intentUrl = "whatsapp://";
  } else if (t.includes("camera")) {
    targetName = "Mobile Camera";
    intentUrl = isAndroid ? "intent:#Intent;action=android.media.action.IMAGE_CAPTURE;end" : "";
  } else if (t.includes("spotify")) {
    targetName = "Spotify";
    intentUrl = "spotify://";
  } else if (t.includes("youtube")) {
    targetName = "YouTube";
    intentUrl = "https://youtube.com";
  } else if (t.includes("instagram")) {
    targetName = "Instagram";
    intentUrl = "instagram://";
  } else if (t.includes("map") || t.includes("google maps")) {
    targetName = "Google Maps";
    intentUrl = "https://maps.google.com";
  } else if (t.includes("chrome") || t.includes("browser")) {
    targetName = "Browser";
    intentUrl = "https://google.com";
  } else if (t.includes("calc") || t.includes("calculator")) {
    targetName = "Calculator";
    intentUrl = isAndroid ? "intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.APP_CALCULATOR;end" : "";
  } else if (t.includes("gallery") || t.includes("photo") || t.includes("pictures")) {
    targetName = "Gallery";
    intentUrl = isAndroid ? "intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.APP_GALLERY;end" : "";
  } else if (t.includes("phone") || t.includes("dialer") || t.includes("call")) {
    targetName = "Phone Dialer";
    intentUrl = "tel:";
  }

  if (intentUrl) {
    try {
      window.location.href = intentUrl;
      return { success: true, message: `Launched ${targetName} on your mobile device, Boss!` };
    } catch (e) {
      return { success: false, message: `Could not launch ${targetName} directly.` };
    }
  }

  return { success: false, message: `Unrecognized mobile app intent target: ${target}` };
}

/**
 * Triggers mobile device haptic vibration
 */
export function triggerHapticVibration(pattern: number[] = [100, 50, 100]) {
  if (typeof window !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      // ignore
    }
  }
}
