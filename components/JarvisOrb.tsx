"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createOrbScene, type OrbSceneApi } from "@/lib/orbScene";
import { HandTracker, type TrackerStatus } from "@/lib/handTracker";
import { VoiceEngine, type AiState } from "@/lib/voiceEngine";
import { AiBrain, type ToolResult } from "@/lib/aiBrain";

type CameraState = "off" | "starting" | "on" | "error";

const MODE_LABEL: Record<TrackerStatus["mode"], string> = {
  idle: "STANDBY",
  spin: "SPIN",
  zoom: "ZOOM",
};

export interface ChatMessage {
  id: string;
  sender: "user" | "aegis" | "monday";
  text: string;
  toolName?: string;
  toolOutput?: string;
  timestamp: string;
}

export default function JarvisOrb() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<OrbSceneApi | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const voiceRef = useRef<VoiceEngine | null>(null);

  // Core States
  const [camera, setCamera] = useState<CameraState>("off");
  const [status, setStatus] = useState<TrackerStatus>({ hands: 0, mode: "idle" });
  const [error, setError] = useState<string | null>(null);

  // AI & Voice States
  const [aiState, setAiState] = useState<AiState>("idle");
  const [transcript, setTranscript] = useState<string>("");
  const [aiResponse, setAiResponse] = useState<string>("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      id: "welcome-init",
      sender: "aegis",
      text: "Online and operational, Boss Nani. A.E.G.I.S. neural core active. Standing by for your directive.",
      timestamp: typeof window !== "undefined" ? new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
    },
  ]);
  const [activeTool, setActiveTool] = useState<ToolResult | null>(null);
  const [inputText, setInputText] = useState<string>("");
  const transcriptPanelRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Floating Mini-Widget & OS PopUp Window State
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [isOsPopUpActive, setIsOsPopUpActive] = useState<boolean>(false);
  const pipWinRef = useRef<any>(null);
  const [miniPos, setMiniPos] = useState<{ x: number; y: number }>({ x: 20, y: 20 });
  const isDraggingRef = useRef<boolean>(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Device Type State for Cross-Device Command Bridge
  const [deviceType, setDeviceType] = useState<"pc" | "mobile">(() => {
    if (typeof window !== "undefined") {
      const isMobileUA =
        /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) ||
        typeof (window as any).AndroidAppLauncher !== "undefined" ||
        typeof (window as any).AndroidFlashlight !== "undefined" ||
        window.innerWidth <= 600;
      return isMobileUA ? "mobile" : "pc";
    }
    return "pc";
  });

  // Settings, Theme & Voice Mode State
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [geminiApiKey, setGeminiApiKey] = useState<string>("");
  const [themeColor, setThemeColorState] = useState<string>("gold");
  const [voiceMode, setVoiceMode] = useState<"friday" | "ultron" | "jarvis">("friday");
  const [sttLang, setSttLang] = useState<"en-IN" | "en-US" | "en-GB">("en-IN");
  const [speechEngine, setSpeechEngine] = useState<"core" | "webspeech">("webspeech");
  const [micAudioLevel, setMicAudioLevel] = useState<number>(0);
  const [isPopupMode, setIsPopupMode] = useState<boolean>(false);
  const [overlaySizePercent, setOverlaySizePercent] = useState<number>(100);
  const [overlayOpacityPercent, setOverlayOpacityPercent] = useState<number>(75);

  const THEME_OPTIONS = [
    { id: "gold", name: "Gold", dotClass: "gold" },
    { id: "blue", name: "Cyan Blue", dotClass: "blue" },
    { id: "red", name: "Red Core", dotClass: "red" },
    { id: "green", name: "Matrix Green", dotClass: "green" },
    { id: "black", name: "Stealth Black", dotClass: "black" },
    { id: "white", name: "Platinum White", dotClass: "white" },
  ];

  const THEME_PIP_STYLES: Record<string, { primary: string; light: string; bgGlow: string; glowShadow: string; border: string }> = {
    gold: { primary: "#ffaa30", light: "#ffcc66", bgGlow: "rgba(255, 170, 48, 0.3)", glowShadow: "rgba(255, 170, 48, 0.5)", border: "rgba(255, 170, 48, 0.6)" },
    blue: { primary: "#00e5ff", light: "#80f3ff", bgGlow: "rgba(0, 229, 255, 0.3)", glowShadow: "rgba(0, 229, 255, 0.6)", border: "rgba(0, 229, 255, 0.7)" },
    red: { primary: "#ff3b30", light: "#ff7970", bgGlow: "rgba(255, 59, 48, 0.3)", glowShadow: "rgba(255, 59, 48, 0.6)", border: "rgba(255, 59, 48, 0.7)" },
    green: { primary: "#30d158", light: "#63e685", bgGlow: "rgba(48, 209, 88, 0.3)", glowShadow: "rgba(48, 209, 88, 0.6)", border: "rgba(48, 209, 88, 0.7)" },
    black: { primary: "#8e8e93", light: "#e5e5ea", bgGlow: "rgba(142, 142, 147, 0.3)", glowShadow: "rgba(142, 142, 147, 0.5)", border: "rgba(142, 142, 147, 0.6)" },
    white: { primary: "#ffffff", light: "#ffffff", bgGlow: "rgba(255, 255, 255, 0.35)", glowShadow: "rgba(255, 255, 255, 0.7)", border: "rgba(255, 255, 255, 0.8)" },
  };

  const updatePipTheme = (themeName: string) => {
    if (!pipWinRef.current || !pipWinRef.current.document) return;
    const cfg = THEME_PIP_STYLES[themeName.toLowerCase()] || THEME_PIP_STYLES.gold;

    let styleEl = pipWinRef.current.document.getElementById("pip-dynamic-theme");
    if (!styleEl) {
      styleEl = pipWinRef.current.document.createElement("style");
      styleEl.id = "pip-dynamic-theme";
      pipWinRef.current.document.head.appendChild(styleEl);
    }

    styleEl.textContent = `
      :root {
        --pip-primary: ${cfg.primary};
        --pip-light: ${cfg.light};
        --pip-bg-glow: ${cfg.bgGlow};
        --pip-shadow: ${cfg.glowShadow};
        --pip-border: ${cfg.border};
      }
    `;
  };

  // Load saved API Key, Theme & Voice Mode from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedKey =
        localStorage.getItem("aegis_gemini_api_key") ||
        localStorage.getItem("monday_gemini_api_key") ||
        localStorage.getItem("ultron_gemini_api_key") ||
        "";
      setGeminiApiKey(savedKey);
      const savedTheme =
        localStorage.getItem("aegis_theme_color") ||
        localStorage.getItem("monday_theme_color") ||
        "gold";
      setThemeColorState(savedTheme);
      document.body.setAttribute("data-theme", savedTheme);
      const savedVoice =
        (localStorage.getItem("aegis_voice_character") as "friday" | "ultron" | "jarvis") ||
        (localStorage.getItem("monday_voice_character") as "friday" | "ultron" | "jarvis") ||
        "friday";
      setVoiceMode(savedVoice);

      const savedEngine =
        localStorage.getItem("aegis_use_core_audio") ||
        localStorage.getItem("monday_use_core_audio");
      if (savedEngine === "true") {
        setSpeechEngine("core");
      } else {
        setSpeechEngine("webspeech");
        localStorage.setItem("aegis_use_core_audio", "false");
        localStorage.setItem("monday_use_core_audio", "false");
      }

      const isMobileUA =
        /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) ||
        typeof (window as any).AndroidAppLauncher !== "undefined" ||
        typeof (window as any).AndroidFlashlight !== "undefined" ||
        window.innerWidth <= 600;
      setDeviceType(isMobileUA ? "mobile" : "pc");

      const params = new URLSearchParams(window.location.search);
      if (params.get("mode") === "popup" || window.innerWidth <= 480) {
        setIsPopupMode(true);
      }

      const handleResize = () => {
        const isSmall = window.innerWidth <= 480 || params.get("mode") === "popup";
        setIsPopupMode(isSmall);
      };
      window.addEventListener("resize", handleResize);
      const savedOverlaySize = localStorage.getItem("aegis_overlay_size_percent");
      if (savedOverlaySize) {
        const val = parseInt(savedOverlaySize, 10);
        if (!isNaN(val)) setOverlaySizePercent(val);
      }

      const savedOverlayOpacity = localStorage.getItem("aegis_overlay_opacity_percent");
      if (savedOverlayOpacity) {
        const val = parseInt(savedOverlayOpacity, 10);
        if (!isNaN(val)) setOverlayOpacityPercent(val);
      }

      return () => {
        window.removeEventListener("resize", handleResize);
      };
    }
  }, []);

  const handleOverlaySizeChange = (val: number) => {
    setOverlaySizePercent(val);
    if (typeof window !== "undefined") {
      localStorage.setItem("aegis_overlay_size_percent", val.toString());
      const sizeDp = Math.round(60 * (val / 100));
      (window as any).AndroidAppLauncher?.setOverlaySize?.(sizeDp);
    }
  };

  const handleOverlayOpacityChange = (val: number) => {
    setOverlayOpacityPercent(val);
    if (typeof window !== "undefined") {
      localStorage.setItem("aegis_overlay_opacity_percent", val.toString());
      const opacityFloat = val / 100;
      (window as any).AndroidAppLauncher?.setOverlayOpacity?.(opacityFloat);
    }
  };

  const lastSyncTimestampRef = useRef<number>(0);

  const broadcastSyncSettings = async (settings: Record<string, any>) => {
    try {
      await fetch("/api/command-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync_settings",
          sourceDevice: deviceType,
          settings,
        }),
      });
    } catch (e) {
      // silent fail
    }
  };

  const changeTheme = (newTheme: string, skipBroadcast = false) => {
    setThemeColorState(newTheme);
    if (typeof window !== "undefined") {
      localStorage.setItem("aegis_theme_color", newTheme);
      localStorage.setItem("monday_theme_color", newTheme);
      document.body.setAttribute("data-theme", newTheme);
    }
    sceneRef.current?.setThemeColor(newTheme);
    updatePipTheme(newTheme);
    if (!skipBroadcast) {
      broadcastSyncSettings({ themeColor: newTheme });
    }
  };

  const changeVoiceMode = (mode: "friday" | "ultron" | "jarvis", skipBroadcast = false) => {
    setVoiceMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("aegis_voice_character", mode);
      localStorage.setItem("monday_voice_character", mode);
      (window as any).AndroidTTS?.setVoiceCharacter?.(mode);
    }
    voiceRef.current?.setVoiceCharacter(mode);
    if (!skipBroadcast) {
      broadcastSyncSettings({ voiceCharacter: mode });
    }
  };

  const changeSttLang = (lang: "en-IN" | "en-US" | "en-GB") => {
    setSttLang(lang);
    if (typeof window !== "undefined") {
      localStorage.setItem("aegis_stt_lang", lang);
      localStorage.setItem("monday_stt_lang", lang);
    }
    voiceRef.current?.setSttLanguage(lang);
  };

  const changeSpeechEngine = (engine: "core" | "webspeech") => {
    setSpeechEngine(engine);
    if (typeof window !== "undefined") {
      localStorage.setItem("aegis_use_core_audio", engine === "core" ? "true" : "false");
      localStorage.setItem("monday_use_core_audio", engine === "core" ? "true" : "false");
    }
    voiceRef.current?.stopListening();
    voiceRef.current?.setSpeechEngine(engine);
  };

  const saveApiKey = (key: string, skipBroadcast = false) => {
    setGeminiApiKey(key);
    if (typeof window !== "undefined") {
      localStorage.setItem("aegis_gemini_api_key", key.trim());
      localStorage.setItem("monday_gemini_api_key", key.trim());
    }
    setShowSettings(false);
    if (!skipBroadcast) {
      broadcastSyncSettings({ geminiApiKey: key.trim() });
    }
  };

  // 1. Initialize 3D Orb Scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    try {
      const scene = createOrbScene(container);
      sceneRef.current = scene;

      const savedTheme =
        localStorage.getItem("aegis_theme_color") ||
        localStorage.getItem("monday_theme_color") ||
        "gold";
      scene.setThemeColor(savedTheme);
      document.body.setAttribute("data-theme", savedTheme);
    } catch (err) {
      console.warn("WebGL initialization warning on mobile:", err);
    }

    return () => {
      trackerRef.current?.stop();
      trackerRef.current = null;
      voiceRef.current?.stopSpeaking();
      voiceRef.current?.stopListening();
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // 2. Initialize Voice Engine
  useEffect(() => {
    const voice = new VoiceEngine({
      onStateChange: (state) => {
        setAiState(state);
        sceneRef.current?.setAiState(state);
      },
      onTranscript: (text, isFinal) => {
        if (!isFinal) {
          setTranscript(text);
        } else {
          setTranscript("");
          if (text.trim()) {
            handleUserQuery(text.trim());
          }
        }
      },
      onError: (err) => {
        setError(err);
      },
      onAudioLevel: (level) => {
        setMicAudioLevel(level);
      },
    });
    const savedVoice =
      (localStorage.getItem("aegis_voice_character") as "friday" | "ultron" | "jarvis") ||
      (localStorage.getItem("monday_voice_character") as "friday" | "ultron" | "jarvis") ||
      "friday";
    const savedLang =
      (localStorage.getItem("aegis_stt_lang") as "en-IN" | "en-US" | "en-GB") ||
      (localStorage.getItem("monday_stt_lang") as "en-IN" | "en-US" | "en-GB") ||
      "en-IN";
    voice.setVoiceCharacter(savedVoice);
    voice.setSttLanguage(savedLang);
    setSttLang(savedLang);
    voiceRef.current = voice;
    setTimeout(() => {
      voice.speak("Online and operational, Boss Nani. A.E.G.I.S. neural core active.");
    }, 600);
  }, []);

  // Auto-scroll chat conversation log to latest turn
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, transcript, aiState]);



  // Screen Stream Reference for Live Display OCR
  const screenStreamRef = useRef<MediaStream | null>(null);

  // Live Screen Capture & WinRT OCR Reader
  const captureAndReadScreen = async (customPrompt?: string) => {
    try {
      setAiState("thinking");
      sceneRef.current?.setAiState("thinking");
      setAiResponse("Scanning live display & extracting text with WinRT OCR, Boss...");

      let stream = screenStreamRef.current;
      if (!stream || !stream.active) {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: "monitor" } as any,
          audio: false,
        });
        screenStreamRef.current = stream;

        // Reset if user stops sharing via browser bar
        stream.getVideoTracks()[0].addEventListener("ended", () => {
          screenStreamRef.current = null;
        });
      }

      const videoTrack = stream.getVideoTracks()[0];
      const imageCapture = (window as any).ImageCapture ? new (window as any).ImageCapture(videoTrack) : null;

      let base64Data = "";
      if (imageCapture && imageCapture.grabFrame) {
        try {
          const imageBitmap = await imageCapture.grabFrame();
          const canvas = document.createElement("canvas");
          canvas.width = imageBitmap.width;
          canvas.height = imageBitmap.height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(imageBitmap, 0, 0);
          base64Data = canvas.toDataURL("image/png");
        } catch (grabErr) {
          console.warn("grabFrame fallback:", grabErr);
        }
      }

      if (!base64Data) {
        const tempVideo = document.createElement("video");
        tempVideo.srcObject = stream;
        tempVideo.muted = true;
        await tempVideo.play();
        const canvas = document.createElement("canvas");
        canvas.width = tempVideo.videoWidth || 1920;
        canvas.height = tempVideo.videoHeight || 1080;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(tempVideo, 0, 0);
        base64Data = canvas.toDataURL("image/png");
        tempVideo.pause();
        tempVideo.srcObject = null;
      }

      const res = await fetch("/api/screen-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: base64Data,
          prompt: customPrompt || "read out the screen displaying texts live",
          apiKey: geminiApiKey,
        }),
      });

      const data = await res.json();
      const timeStr = typeof window !== "undefined" ? new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      if (data.success && data.response) {
        setActiveTool({
          toolName: "Live Screen Vision & OCR Engine",
          output: data.response,
          data: { rawOcr: data.rawOcr, lines: data.lines },
        });
        setChatHistory((prev) => [
          ...prev,
          {
            id: "aegis-" + Date.now(),
            sender: "aegis",
            text: data.response,
            toolName: "Live Screen Vision & OCR Engine",
            toolOutput: data.response,
            timestamp: timeStr,
          },
        ]);
        setAiResponse(data.response);
        voiceRef.current?.speak(data.response);
      } else {
        const fallbackMsg = data.response || "No clear text elements detected on your active display, Boss!";
        setChatHistory((prev) => [
          ...prev,
          {
            id: "aegis-" + Date.now(),
            sender: "aegis",
            text: fallbackMsg,
            timestamp: timeStr,
          },
        ]);
        setAiResponse(fallbackMsg);
        voiceRef.current?.speak(fallbackMsg);
      }
    } catch (err: any) {
      console.warn("Screen capture failed or was cancelled:", err);
      // Fallback seamlessly to AiBrain so user receives an intelligent answer if browser prompt was dismissed
      const timeStr = typeof window !== "undefined" ? new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      try {
        const { text, tool } = await AiBrain.queryAi(customPrompt || "what is running on the browser right now", geminiApiKey, deviceType);
        if (tool) setActiveTool(tool);
        setChatHistory((prev) => [
          ...prev,
          {
            id: "aegis-" + Date.now(),
            sender: "aegis",
            text,
            toolName: tool?.toolName,
            toolOutput: tool?.output,
            timestamp: timeStr,
          },
        ]);
        setAiResponse(text);
        voiceRef.current?.speak(text);
      } catch {
        const errReply = "Screen capture was cancelled or could not be initialized, Boss!";
        setChatHistory((prev) => [
          ...prev,
          {
            id: "aegis-" + Date.now(),
            sender: "aegis",
            text: errReply,
            timestamp: timeStr,
          },
        ]);
        setAiResponse(errReply);
        voiceRef.current?.speak(errReply);
      }
    } finally {
      setAiState("idle");
      sceneRef.current?.setAiState("idle");
    }
  };

  // 3. Process AI User Query
  const handleUserQuery = async (rawQuery: string) => {
    if (!rawQuery.trim()) return;

    // Normalize common speech-to-text / typing typos
    const queryText = rawQuery
      .replace(/\byut\b/gi, "you")
      .replace(/\bshearch\b/gi, "search")
      .replace(/\breasults?\b/gi, "results")
      .replace(/\blounch\b/gi, "launch")
      .replace(/\bebil+ity\b/gi, "ability");

    const timeStr = typeof window !== "undefined" ? new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

    // 1. Immediately record user prompt in conversation log
    setChatHistory((prev) => [
      ...prev,
      {
        id: "user-" + Date.now(),
        sender: "user",
        text: queryText,
        timestamp: timeStr,
      },
    ]);
    setTranscript("");
    setAiState("thinking");
    sceneRef.current?.setAiState("thinking");
    setAiResponse("Processing neural query...");

    // Direct Live Screen & Page / Browser Watching Intent Check (Watches directly without UI button)
    const isScreenOrBrowserWatch =
      (/\b(screen|display|browser|page|webpage|window|tab|tabs)\b/i.test(queryText) &&
      /\b(watch|read|tell|speak|scan|extract|what('s| is) on|displaying|texts?|running|open|active)\b/i.test(queryText)) ||
      /\b(watch|read)\s+(the\s+|this\s+)?(page|screen|window|browser)\b/i.test(queryText) ||
      /\bwhat\s+(is|'s)\s+running\s+(on|in)\s+(the\s+)?(browser|screen)\b/i.test(queryText) ||
      /\bwhat\s+is\s+running\s+(right\s+)?now\b/i.test(queryText) ||
      /\bwatch\s+page\s+directly\b/i.test(queryText);

    if (isScreenOrBrowserWatch) {
      await captureAndReadScreen(queryText);
      return;
    }

    const { text, tool } = await AiBrain.queryAi(queryText, geminiApiKey, deviceType);

    if (tool?.data?.isScreenCapture) {
      await captureAndReadScreen(queryText);
      return;
    }

    if (tool) {
      setActiveTool(tool);
    } else {
      setActiveTool(null);
    }

    // Voice & Listening Control (Turn off listening / Turn on listening)
    const isStopListeningCmd =
      tool?.data?.action === "stop_listening" ||
      /\b(turn\s+off|stop|disable|pause|mute|shut\s+down|kill)\s+(?:the\s+)?(?:listening|voice(?:\s+recognition)?|mic|microphone|speech(?:\s+recognition)?|audio\s+input)\b/i.test(queryText) ||
      /^(?:stop\s+listening|turn\s+off\s+listening|pause\s+listening|mute\s+mic|mute\s+microphone|turn\s+off\s+mic|turn\s+off\s+microphone|mute)$/i.test(queryText) ||
      /\b(?:turn\s+off\s+listening|stop\s+listening|turn\s+off\s+mic|mute\s+mic)\b/i.test(queryText);

    const isStartListeningCmd =
      tool?.data?.action === "start_listening" ||
      /\b(turn\s+on|start|resume|enable|unmute|activate)\s+(?:the\s+)?(?:listening|voice(?:\s+recognition)?|mic|microphone|speech(?:\s+recognition)?|audio\s+input)\b/i.test(queryText) ||
      /^(?:start\s+listening|turn\s+on\s+listening|resume\s+listening|unmute\s+mic|unmute\s+microphone|turn\s+on\s+mic|turn\s+on\s+microphone|unmute)$/i.test(queryText) ||
      /\b(?:turn\s+on\s+listening|start\s+listening|turn\s+on\s+mic|unmute\s+mic)\b/i.test(queryText);

    if (isStopListeningCmd) {
      voiceRef.current?.deactivateListening();
      setAiState("idle");
      sceneRef.current?.setAiState("idle");
    }

    // Window & AEGIS UI management (Fullscreen, Maximize, Minimize, Restore)
    const isSelfWindowCmd =
      tool?.data?.target === "aegis" ||
      tool?.data?.target === "monday" ||
      /\b(yourself|you|aegis|monday|ultron|orb|ui|interface)\b/i.test(queryText);

    if (isSelfWindowCmd && (tool?.data?.action || /\b(full\s*screen|fullscreen|maximize|minimise|minimize|restore|unmaximize)\b/i.test(queryText))) {
      const act = tool?.data?.action || (/\b(full\s*screen|fullscreen)\b/i.test(queryText) ? "fullscreen" : (/\b(minimize|minimise)\b/i.test(queryText) ? "minimize" : (/\b(restore|unmaximize)\b/i.test(queryText) ? "restore" : "maximize")));
      if (act === "fullscreen") {
        setIsMinimized(false);
        if (typeof document !== "undefined" && !document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } else if (act === "maximize") {
        setIsMinimized(false);
      } else if (act === "minimize") {
        // Minimize the main application, while always keeping the 3D OS overlay popup active and visible
        setIsMinimized(true);
      } else if (act === "restore") {
        if (typeof document !== "undefined" && document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        setIsMinimized(false);
      }
    }

    const aegisTimeStr = typeof window !== "undefined" ? new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
    setChatHistory((prev) => [
      ...prev,
      {
        id: "aegis-" + Date.now(),
        sender: "aegis",
        text,
        toolName: tool?.toolName,
        toolOutput: tool?.output,
        timestamp: aegisTimeStr,
      },
    ]);
    setAiResponse(text);

    if (isStartListeningCmd) {
      voiceRef.current?.speak(text).then(() => {
        voiceRef.current?.startListening();
      }).catch(() => {
        setAiState("idle");
        sceneRef.current?.setAiState("idle");
      });
    } else {
      voiceRef.current?.speak(text).finally(() => {
        setAiState("idle");
        sceneRef.current?.setAiState("idle");
      });
    }
  };

  // Expose sendAegisQuery globally for native Android Overlay / external callers
  const handleUserQueryRef = useRef(handleUserQuery);
  useEffect(() => {
    handleUserQueryRef.current = handleUserQuery;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).sendAegisQuery = (q: string) => {
        if (q && typeof q === "string") {
          handleUserQueryRef.current(q);
        }
      };
      (window as any).startVoiceListening = () => {
        if (voiceRef.current) {
          setError(null);
          voiceRef.current.startListening();
        }
      };
      if ((window as any)._pendingAegisQuery) {
        const pending = (window as any)._pendingAegisQuery;
        delete (window as any)._pendingAegisQuery;
        handleUserQueryRef.current(pending);
      }
      if ((window as any)._pendingVoiceListening) {
        delete (window as any)._pendingVoiceListening;
        setTimeout(() => {
          if (voiceRef.current) {
            setError(null);
            voiceRef.current.startListening();
          }
        }, 500);
      }
    }
    return () => {
      if (typeof window !== "undefined") {
        delete (window as any).sendAegisQuery;
        delete (window as any).startVoiceListening;
      }
    };
  }, []);

  // 4. Real-Time Cross-Device Command Bridge & State Sync Listener (PC ↔ Mobile)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/command-bridge?device=${deviceType}`);
        if (res.ok) {
          const data = await res.json();

          // 1. Process pending commands
          if (data.commands && data.commands.length > 0) {
            for (const cmd of data.commands) {
              handleUserQuery(cmd.query);
            }
          }

          // 2. Synchronize shared AI State (Voice, Theme, API Key) across PC & Mobile
          if (data.sharedState && data.sharedState.lastUpdated > lastSyncTimestampRef.current) {
            const st = data.sharedState;
            lastSyncTimestampRef.current = st.lastUpdated;

            if (st.updatedBy !== deviceType) {
              // Sync Voice Character
              if (st.voiceCharacter && st.voiceCharacter !== voiceMode) {
                changeVoiceMode(st.voiceCharacter, true);
              }
              // Sync Theme Color
              if (st.themeColor && st.themeColor !== themeColor) {
                changeTheme(st.themeColor, true);
              }
              // Sync Gemini API Key
              if (st.geminiApiKey && st.geminiApiKey !== geminiApiKey) {
                setGeminiApiKey(st.geminiApiKey);
                if (typeof window !== "undefined") {
                  localStorage.setItem("aegis_gemini_api_key", st.geminiApiKey);
                  localStorage.setItem("monday_gemini_api_key", st.geminiApiKey);
                }
              }
            }
          }
        }
      } catch (err) {
        // silent poll catch
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [deviceType, voiceMode, themeColor, geminiApiKey]);

  // Hand Gestures Controls
  const stopGestures = useCallback(() => {
    trackerRef.current?.stop();
    trackerRef.current = null;
    setCamera("off");
    setStatus({ hands: 0, mode: "idle" });
  }, []);

  const startGestures = useCallback(async () => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay || trackerRef.current) return;

    setCamera("starting");
    setError(null);

    const tracker = new HandTracker(video, overlay, {
      onRotate: (dt, dp) => sceneRef.current?.rotateBy(dt, dp),
      onZoom: (factor) => sceneRef.current?.zoomBy(factor),
      onStatus: setStatus,
    });
    trackerRef.current = tracker;

    try {
      await tracker.start();
      setCamera("on");
    } catch (err) {
      trackerRef.current = null;
      tracker.stop();
      setCamera("error");
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "CAMERA ACCESS DENIED"
          : "TRACKING INIT FAILED",
      );
    }
  }, []);

  const toggleGestures = useCallback(() => {
    if (trackerRef.current) stopGestures();
    else void startGestures();
  }, [startGestures, stopGestures]);

  const toggleVoice = useCallback(() => {
    if (aiState === "listening") {
      voiceRef.current?.stopListening();
    } else {
      setError(null);
      voiceRef.current?.startListening();
    }
  }, [aiState]);

  // Launch Native Always-On-Top OS Popup Window across ALL PC & Mobile Applications
  const toggleOsPopUp = useCallback(async () => {
    if (typeof window === "undefined") return;

    // 1. Android Native Floating Overlay Service
    if ((window as any).AndroidAppLauncher) {
      try {
        if (isOsPopUpActive) {
          (window as any).AndroidAppLauncher.stopOverlay?.();
          setIsOsPopUpActive(false);
        } else {
          (window as any).AndroidAppLauncher.startOverlay?.();
          setIsOsPopUpActive(true);
        }
        return;
      } catch (err) {
        console.warn("Native Android Overlay toggle warning:", err);
      }
    }

    // 2. PC Desktop & Browser OS Overlay Popup Window
    // If the overlay window is already open, toggle it closed
    if (pipWinRef.current && !pipWinRef.current.closed) {
      try {
        pipWinRef.current.close();
      } catch (e) {}
      pipWinRef.current = null;
      setIsOsPopUpActive(false);
      return;
    }

    // Open a detached, dedicated OS Overlay Window
    const popupWidth = 420;
    const popupHeight = 640;
    const screenW = typeof window.screen !== "undefined" ? window.screen.availWidth : 1280;
    const left = Math.max(20, screenW - popupWidth - 40);
    const top = 60;
    const popupUrl = `${window.location.origin}/?mode=popup`;

    try {
      const popup = window.open(
        popupUrl,
        "AegisOverlay",
        `width=${popupWidth},height=${popupHeight},left=${left},top=${top},resizable=yes,scrollbars=no,status=no,toolbar=no,menubar=no`
      );

      if (popup) {
        pipWinRef.current = popup;
        setIsOsPopUpActive(true);

        const checkClosedTimer = setInterval(() => {
          if (!popup || popup.closed) {
            clearInterval(checkClosedTimer);
            pipWinRef.current = null;
            setIsOsPopUpActive(false);
          }
        }, 800);

        try {
          popup.focus();
        } catch (e) {}
      }
    } catch (err) {
      console.warn("Failed to open PC OS overlay window:", err);
    }
  }, [isOsPopUpActive]);

  const togglePip = toggleOsPopUp;
  // Sync state into OS PiP Floating Window
  useEffect(() => {
    if (pipWinRef.current && pipWinRef.current.document) {
      const miniOrb = pipWinRef.current.document.getElementById("pip-mini-orb");
      const voiceBtn = pipWinRef.current.document.getElementById("pip-btn-voice");

      if (miniOrb) {
        miniOrb.className = `mini-orb-core state-${aiState}`;
      }
      if (voiceBtn) {
        if (aiState === "listening") {
          voiceBtn.classList.add("active");
        } else {
          voiceBtn.classList.remove("active");
        }
      }
    }
  }, [aiState]);

  const toggleMinimize = useCallback(() => {
    setIsMinimized((prev) => !prev);
  }, []);

  // Dragging handlers for Mini Orb Widget
  const handleDragStart = (clientX: number, clientY: number) => {
    isDraggingRef.current = true;
    dragOffsetRef.current = {
      x: clientX - miniPos.x,
      y: clientY - miniPos.y,
    };
  };

  const handleDragMove = (clientX: number, clientY: number) => {
    if (!isDraggingRef.current) return;
    const newX = Math.max(10, Math.min(window.innerWidth - 180, clientX - dragOffsetRef.current.x));
    const newY = Math.max(10, Math.min(window.innerHeight - 180, clientY - dragOffsetRef.current.y));
    setMiniPos({ x: newX, y: newY });
  };

  const handleDragEnd = () => {
    isDraggingRef.current = false;
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => handleDragMove(e.clientX, e.clientY);
    const onMouseUp = () => handleDragEnd();
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const onTouchEnd = () => handleDragEnd();

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("touchend", onTouchEnd);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [miniPos]);

  // Keyboard Hotkeys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case "+":
        case "=":
          sceneRef.current?.zoomIn();
          break;
        case "-":
        case "_":
          sceneRef.current?.zoomOut();
          break;
        case "r":
        case "R":
          sceneRef.current?.resetView();
          break;
        case "g":
        case "G":
          toggleGestures();
          break;
        case "v":
        case "V":
          toggleVoice();
          break;
        case "m":
        case "M":
          // Only toggle mini-orb when popup is NOT active (avoid accidental minimize)
          if (!isOsPopUpActive) {
            toggleMinimize();
          }
          break;
        case "s":
        case "S":
          captureAndReadScreen();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleGestures, toggleVoice, toggleMinimize, isOsPopUpActive, aiState]);

  const cameraOn = camera === "on";

  const winW = typeof window !== "undefined" ? window.innerWidth : 360;
  const winH = typeof window !== "undefined" ? window.innerHeight : 640;
  return (
    <>
      {/* 3D Orb Root Container */}
      <div
        ref={containerRef}
        className={`orb-root ${isMinimized ? "minimized" : ""}`}
        style={
          isMinimized
            ? {
                position: "fixed",
                left: `${miniPos.x}px`,
                top: `${miniPos.y}px`,
                width: "160px",
                height: "160px",
                borderRadius: "50%",
                zIndex: 9999,
                boxShadow: "0 0 30px rgba(255, 170, 48, 0.4)",
                border: "2px solid rgba(255, 170, 48, 0.6)",
                background: "rgba(10, 10, 14, 0.85)",
                backdropFilter: "blur(10px)",
                cursor: "grab",
              }
            : {}
        }
        onMouseDown={(e) => isMinimized && handleDragStart(e.clientX, e.clientY)}
        onTouchStart={(e) =>
          isMinimized && e.touches.length > 0 && handleDragStart(e.touches[0].clientX, e.touches[0].clientY)
        }
      />

      {/* Floating Controls Bar over Mini Orb Widget */}
      {isMinimized && (
        <div
          className="mini-widget-controls"
          style={{
            position: "fixed",
            left: `${miniPos.x + 10}px`,
            top: `${miniPos.y + 168}px`,
            zIndex: 10000,
            display: "flex",
            gap: "8px",
          }}
        >
          <button
            type="button"
            className={`hud-btn mini-btn ${aiState === "listening" ? "active-voice" : ""}`}
            onClick={toggleVoice}
            title="Toggle Voice Input"
          >
            {aiState === "listening" ? "🎙️ LISTENING" : "🎙️ TALK"}
          </button>
          <button type="button" className="hud-btn mini-btn" onClick={toggleMinimize} title="Expand UI">
            ⛶ EXPAND
          </button>
        </div>
      )}


      {/* Overlays (Only active when full screen) */}
      {!isMinimized && (
        <>
          <div className="overlay-vignette" />
          <div className="overlay-grain" />
          <div className="overlay-scanlines" />

          {/* Title Header */}
          <div className="hud hud-title">
            A.E.G.I.S.
            {isPopupMode && <span style={{ fontSize: "9px", marginLeft: "6px", opacity: 0.7, color: "var(--theme-text-light)" }}>[POPUP]</span>}
          </div>

          {/* AI Voice State Badge & Settings Trigger */}
          <div style={{ position: "fixed", top: isPopupMode ? "12px" : "24px", right: isPopupMode ? "12px" : "24px", zIndex: 20, display: "flex", gap: "6px", alignItems: "center" }}>
            {isPopupMode ? (
              <button
                type="button"
                className="hud-btn mini-btn"
                onClick={() => {
                  window.open("http://localhost:3000", "_blank", "width=1400,height=900");
                }}
                title="Open Full Application in Large Window"
                style={{ height: "30px", padding: "0 8px", fontSize: "10px" }}
              >
                ⛶ FULL APP
              </button>
            ) : (
              <button
                type="button"
                className="hud-btn mini-btn"
                onClick={() => setDeviceType((prev) => (prev === "pc" ? "mobile" : "pc"))}
                title="Click to toggle cross-device bridge mode"
              >
                {deviceType === "pc" ? "💻 LAPTOP PC" : "📱 MOBILE PHONE"}
              </button>
            )}
            <button
              type="button"
              className="hud-btn mini-btn"
              style={isPopupMode ? { height: "30px", padding: "0 8px", fontSize: "10px" } : {}}
              onClick={() => setShowSettings(true)}
            >
              {isPopupMode ? "⚙️" : "⚙️ SETTINGS"}
            </button>
            <div
              className={`ai-state-badge state-${aiState}`}
              style={{
                position: "relative",
                top: 0,
                right: 0,
                ...(isPopupMode ? { padding: "4px 8px", fontSize: "9px" } : {}),
              }}
            >
              <span className="state-dot" />
              <span className="state-label">{isPopupMode ? aiState.toUpperCase() : `AEGIS: ${aiState.toUpperCase()}`}</span>
            </div>
          </div>

          {/* Settings Modal */}
          {showSettings && (
            <div className="settings-modal-backdrop" onClick={() => setShowSettings(false)}>
              <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
                <h3>⚙️ AEGIS AI Settings</h3>
                <p>Enter your free Google Gemini API Key to enable unlimited dynamic AI question answering:</p>
                <input
                  type="password"
                  className="command-input"
                  placeholder="Paste GEMINI_API_KEY here..."
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                />

                {/* Theme Color Selector Section */}
                <div className="theme-picker-section">
                  <h4>🎨 AEGIS THEME COLOR</h4>
                  <div className="theme-picker-row">
                    {THEME_OPTIONS.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={`theme-chip-btn ${themeColor === t.id ? "active" : ""}`}
                        onClick={() => changeTheme(t.id)}
                      >
                        <span className={`color-dot ${t.dotClass}`} />
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Voice Mode Selector Section */}
                <div className="theme-picker-section">
                  <h4>🔊 AEGIS VOICE SYNTHESIS CHARACTER</h4>
                  <div className="theme-picker-row">
                    <button
                      type="button"
                      className={`theme-chip-btn ${voiceMode === "friday" ? "active" : ""}`}
                      onClick={() => changeVoiceMode("friday")}
                    >
                      👩 Friday Voice (Crisp Female AI)
                    </button>
                    <button
                      type="button"
                      className={`theme-chip-btn ${voiceMode === "ultron" ? "active" : ""}`}
                      onClick={() => changeVoiceMode("ultron")}
                    >
                      🤖 Ultron Voice (Deep & Commanding)
                    </button>
                    <button
                      type="button"
                      className={`theme-chip-btn ${voiceMode === "jarvis" ? "active" : ""}`}
                      onClick={() => changeVoiceMode("jarvis")}
                    >
                      ⚡ Jarvis Voice (Smooth Male Assistant)
                    </button>
                  </div>
                </div>

                {/* Speech Recognition & Listening Model Section */}
                <div className="theme-picker-section">
                  <h4>🎙️ SPEECH RECOGNITION ENGINE & ACCENT</h4>
                  <div className="theme-picker-row" style={{ marginBottom: "8px" }}>
                    <button
                      type="button"
                      className={`theme-chip-btn ${speechEngine === "webspeech" ? "active" : ""}`}
                      onClick={() => changeSpeechEngine("webspeech")}
                      title="Native High-Speed Speech Recognition Engine with Live Real-Time Conversion & Continuous Listening (Microsoft Edge / PC Desktop App)"
                    >
                      🌐 Web Speech API (Edge / PC App - Live & Continuous)
                    </button>
                    <button
                      type="button"
                      className={`theme-chip-btn ${speechEngine === "core" ? "active" : ""}`}
                      onClick={() => changeSpeechEngine("core")}
                      title="Direct Windows System Audio Hardware Engine - 100% Offline Native SAPI"
                    >
                      🛡️ Windows System Audio (Offline Native SAPI)
                    </button>
                  </div>
                  <div className="theme-picker-row">
                    <button
                      type="button"
                      className={`theme-chip-btn ${sttLang === "en-IN" ? "active" : ""}`}
                      onClick={() => changeSttLang("en-IN")}
                    >
                      🇮🇳 English (India) - Boss Nani Cadence
                    </button>
                    <button
                      type="button"
                      className={`theme-chip-btn ${sttLang === "en-US" ? "active" : ""}`}
                      onClick={() => changeSttLang("en-US")}
                    >
                      🇺🇸 English (US)
                    </button>
                    <button
                      type="button"
                      className={`theme-chip-btn ${sttLang === "en-GB" ? "active" : ""}`}
                      onClick={() => changeSttLang("en-GB")}
                    >
                      🇬🇧 English (UK)
                    </button>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--theme-text-light)", opacity: 0.85, marginTop: "6px" }}>
                    ✨ Studio Hardware Mic: Acoustic Echo Cancellation + HD Noise Suppression + Auto Gain active.
                  </div>
                  <div style={{ fontSize: "10.5px", color: "#30d158", marginTop: "4px", lineHeight: "1.4" }}>
                    💻 <strong>Windows System Audio:</strong> Direct Windows OS microphone integration. Works 100% offline with zero external cloud dependencies.
                  </div>
                </div>

                {/* Floating Overlay Size & Visibility Percentage Bars */}
                <div className="theme-picker-section">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <h4>📱 FLOATING OVERLAY SIZE</h4>
                    <span style={{ fontSize: "12px", color: "var(--theme-color)", fontWeight: "bold" }}>
                      {overlaySizePercent}% ({Math.round(60 * (overlaySizePercent / 100))}dp)
                    </span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="150"
                    step="1"
                    value={overlaySizePercent}
                    onChange={(e) => handleOverlaySizeChange(parseInt(e.target.value, 10))}
                    style={{
                      width: "100%",
                      accentColor: "var(--theme-color)",
                      height: "6px",
                      borderRadius: "4px",
                      cursor: "pointer",
                      marginBottom: "16px",
                      touchAction: "pan-x",
                    }}
                  />

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <h4>👁️ FLOATING OVERLAY VISIBILITY (OPACITY)</h4>
                    <span style={{ fontSize: "12px", color: "var(--theme-color)", fontWeight: "bold" }}>
                      {overlayOpacityPercent}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    step="1"
                    value={overlayOpacityPercent}
                    onChange={(e) => handleOverlayOpacityChange(parseInt(e.target.value, 10))}
                    style={{
                      width: "100%",
                      accentColor: "var(--theme-color)",
                      height: "6px",
                      borderRadius: "4px",
                      cursor: "pointer",
                      touchAction: "pan-x",
                    }}
                  />
                  <div style={{ fontSize: "10.5px", color: "var(--theme-text-light)", opacity: 0.8, marginTop: "6px" }}>
                    Drag the percentage bars to dynamically increase or decrease the floating orb size and transparency on your phone.
                  </div>
                </div>

                <div style={{ display: "flex", gap: "10px", marginTop: "20px", justifyContent: "flex-end" }}>
                  <button type="button" className="hud-btn" onClick={() => saveApiKey(geminiApiKey)}>
                    SAVE KEY
                  </button>
                  <button type="button" className="hud-btn" onClick={() => setShowSettings(false)}>
                    CLOSE
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Controls Hint */}
          <div className="hud hud-hint">
            <div>
              <span className="key">DRAG</span> spin&nbsp;&nbsp;
              <span className="key">SCROLL</span> zoom
            </div>
            <div>
              <span className="key">V</span> voice command&nbsp;&nbsp;
              <span className="key">G</span> gestures&nbsp;&nbsp;
              <span className="key">R</span> reset
            </div>
          </div>

          {/* Live Transcript & Response Display Panel */}
          <div className="transcript-panel" ref={transcriptPanelRef}>
            <div className="transcript-header">
              <div className="transcript-title">
                <span className="transcript-dot" />
                COMMUNICATION LOG
              </div>
              {chatHistory.length > 1 && (
                <button
                  type="button"
                  className="transcript-clear-btn"
                  onClick={() => setChatHistory([chatHistory[0]])}
                  title="Clear conversation log"
                >
                  CLEAR
                </button>
              )}
            </div>

            <div className="transcript-messages">
              {chatHistory.map((msg) => (
                <div key={msg.id} className={`speech-bubble ${msg.sender === "user" ? "user-bubble" : "ai-bubble"}`}>
                  <div className="bubble-header">
                    <span className="bubble-label">{msg.sender === "user" ? "YOU:" : "AEGIS:"}</span>
                    {msg.timestamp && <span className="bubble-time">{msg.timestamp}</span>}
                  </div>
                  <div className="bubble-content">{msg.text}</div>
                  {msg.toolName && (
                    <div className="tool-badge inline-tool-badge">
                      ⚡ <strong>{msg.toolName}</strong>: {msg.toolOutput}
                    </div>
                  )}
                </div>
              ))}

              {/* Real-time speech recognition live interim preview */}
              {transcript && (
                <div className="speech-bubble user-bubble live-transcribing">
                  <div className="bubble-header">
                    <span className="bubble-label">YOU:</span>
                    <span className="live-badge">LISTENING...</span>
                  </div>
                  <div className="bubble-content">
                    {transcript}
                    <span className="live-typing-indicator">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </span>
                  </div>
                </div>
              )}

              {/* AEGIS thinking status indicator */}
              {aiState === "thinking" && (
                <div className="speech-bubble ai-bubble thinking-bubble">
                  <div className="bubble-header">
                    <span className="bubble-label">AEGIS:</span>
                  </div>
                  <div className="bubble-content thinking-content">
                    <span className="thinking-spinner">⚡</span> Processing neural query...
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Command Input Bar */}
          <div className="command-bar-container">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleUserQuery(inputText);
                setInputText("");
              }}
              className="command-form"
            >
              <input
                type="text"
                className="command-input"
                placeholder="Ask AEGIS anything or type a command..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
              <button type="submit" className="hud-btn command-btn">
                SEND
              </button>
            </form>
          </div>

          {/* HUD Controls */}
          <div className="hud hud-controls">
            <div className={`camera-panel${cameraOn ? " visible" : ""}`}>
              <video ref={videoRef} muted playsInline className="camera-video" />
              <canvas ref={overlayRef} width={208} height={156} className="camera-overlay" />
              <div className="camera-status">
                {status.hands > 0
                  ? `${status.hands} HAND${status.hands > 1 ? "S" : ""} · ${MODE_LABEL[status.mode]}`
                  : "SHOW HANDS"}
              </div>
            </div>

            {error && (
              <div
                className="hud-error"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "10px",
                  padding: "8px 12px",
                  background: "rgba(30, 10, 10, 0.9)",
                  border: "1px solid rgba(255, 68, 68, 0.6)",
                  borderRadius: "8px",
                  fontSize: "11px",
                  maxWidth: "520px",
                  marginBottom: "8px",
                }}
              >
                <span>⚠️ {error}</span>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  style={{
                    background: "rgba(255, 255, 255, 0.1)",
                    border: "none",
                    color: "#fff",
                    borderRadius: "4px",
                    padding: "2px 6px",
                    cursor: "pointer",
                    fontSize: "10px",
                  }}
                >
                  ✕
                </button>
              </div>
            )}

            <div className="hud-row">
              <button
                type="button"
                className={`hud-btn ${aiState === "listening" ? "active-voice" : ""}`}
                onClick={toggleVoice}
                title="Click to toggle studio microphone voice command input"
              >
                {aiState === "listening" ? `🎙️ LISTENING ${micAudioLevel > 0.08 ? "⚡" : "..."}` : "🎙️ VOICE COMMAND"}
              </button>
              <button type="button" className={`hud-btn ${isOsPopUpActive ? "active-voice" : ""}`} onClick={toggleOsPopUp} title="Pop out always-on-top overlay window across all applications">
                {isOsPopUpActive ? "📌 OS OVERLAY ON" : "📌 OS OVERLAY POPUP"}
              </button>
            </div>

            <div className="hud-row desktop-only-row">
              <button
                type="button"
                className="hud-btn"
                aria-pressed={cameraOn}
                onClick={toggleGestures}
                disabled={camera === "starting"}
              >
                {camera === "starting" ? "INITIALIZING…" : cameraOn ? "GESTURES ON" : "GESTURES OFF"}
              </button>
            </div>

            <div className="hud-row desktop-only-row">
              <button type="button" className="hud-btn" onClick={() => sceneRef.current?.zoomIn()} aria-label="Zoom in">
                +
              </button>
              <button type="button" className="hud-btn" onClick={() => sceneRef.current?.zoomOut()} aria-label="Zoom out">
                −
              </button>
              <button type="button" className="hud-btn" onClick={() => sceneRef.current?.resetView()}>
                RESET
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
