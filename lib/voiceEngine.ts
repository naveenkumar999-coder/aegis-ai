export type AiState = "idle" | "listening" | "thinking" | "speaking";

export interface VoiceEngineCallbacks {
  onStateChange: (state: AiState) => void;
  onTranscript: (text: string, isFinal: boolean) => void;
  onError?: (err: string) => void;
  onAudioLevel?: (level: number) => void;
}

export class VoiceEngine {
  private recognition: any = null;
  private synthesis: SpeechSynthesis | null = null;
  private state: AiState = "idle";
  private callbacks: VoiceEngineCallbacks;
  private isSupportedSTT = false;
  private isSupportedTTS = false;
  private selectedVoice: SpeechSynthesisVoice | null = null;
  public isContinuousMode = false;

  public voiceCharacter: "friday" | "ultron" | "jarvis" = "friday";
  public sttLang: string = "en-IN";
  private isRecognizing = false;

  // Studio Audio Input & Processing Stream
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private audioLevelAnimId: number | null = null;

  // Silence Debounce Engine (prevents cutting off sentences mid-speech)
  private silenceTimer: any = null;
  private bufferedFinalText: string = "";
  private latestInterimText: string = "";
  private silenceThresholdMs = 1000;

  // Neural MediaRecorder Audio Fallback
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];

  constructor(callbacks: VoiceEngineCallbacks) {
    this.callbacks = callbacks;
    if (typeof window !== "undefined") {
      const savedLang = localStorage.getItem("monday_stt_lang");
      if (savedLang) {
        this.sttLang = savedLang;
      } else {
        const navLang = navigator.language || "";
      }
    }
    this.initSTT();
    this.initTTS();
  }

  /**
   * Initializes Studio-Grade Hardware Microphone Audio Stream with:
   * - Acoustic Echo Cancellation (prevents AI self-feedback)
   * - High-Definition Noise Suppression (removes room/fan noise)
   * - Automatic Gain Control (boosts whisper/normal speech)
   */
  public async ensureMicStream(): Promise<MediaStream | null> {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;

    if (this.mediaStream && this.mediaStream.active) {
      return this.mediaStream;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
        },
      });
      this.mediaStream = stream;
      this.initAudioAnalyser(stream);
      return stream;
    } catch (err: any) {
      console.warn("Studio microphone initialization warning:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        this.callbacks.onError?.(
          "Microphone permission blocked. Please click the lock or shield icon in the URL bar to allow microphone access."
        );
      }
      return null;
    }
  }

  private initAudioAnalyser(stream: MediaStream) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.audioContext || this.audioContext.state === "closed") {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext.state === "suspended") {
        this.audioContext.resume().catch(() => {});
      }

      const source = this.audioContext.createMediaStreamSource(stream);
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      this.analyserNode = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const checkLevel = () => {
        if (!this.analyserNode || this.state !== "listening") {
          return;
        }
        this.analyserNode.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(1, avg / 80);
        this.callbacks.onAudioLevel?.(normalized);
        this.audioLevelAnimId = requestAnimationFrame(checkLevel);
      };
      checkLevel();
    } catch (e) {
      console.warn("Audio analyser init error:", e);
    }
  }

  public static normalizePhoneticText(raw: string): string {
    if (!raw) return "";
    let t = raw.replace(/[.,!?;:]/g, " ").trim();

    // Fix greetings misheard by offline acoustic models
    t = t.replace(/\b(?:are\s+a\s+room|all\s+a\s+room|our\s+room|hour\s+room|how\s+low|hallo|helo|yellow|halo|hello\s+there|hell\s+o|hellow)\b/gi, "hello");
    t = t.replace(/^\s*(?:eye|high|bye)\b/i, "hi");
    t = t.replace(/^\s*hay\b/i, "hey");

    // Fix WhatsApp phonetic variations
    t = t.replace(/\bwhat\s*sap\b/gi, "whatsapp");
    t = t.replace(/\bwhat'?s\s*up\b(?=\s+in|\s+and|\s+chat|\s+to|\s+message|\s+app)/gi, "whatsapp");
    t = t.replace(/\bwatch\s*app\b/gi, "whatsapp");
    t = t.replace(/\bwhats\s*app\b/gi, "whatsapp");
    t = t.replace(/\bwhats\s*up\b(?=\s+in|\s+and|\s+chat|\s+to|\s+message|\s+app)/gi, "whatsapp");
    t = t.replace(/\bwhatapp\b/gi, "whatsapp");
    t = t.replace(/\bwat\s*app\b/gi, "whatsapp");

    // Fix App names
    t = t.replace(/\bu\s*tube\b/gi, "youtube");
    t = t.replace(/\byou\s*tube\b/gi, "youtube");
    t = t.replace(/\bnot\s*pad\b/gi, "notepad");
    t = t.replace(/\bflash\s*light\b/gi, "flashlight");

    // Fix Website names (voice frequently misrecognizes these)
    t = t.replace(/\bgreeks?\s*for\s*greeks?\b/gi, "geeksforgeeks");
    t = t.replace(/\bgreeks?\s*for?\s*geeks?\b/gi, "geeksforgeeks");
    t = t.replace(/\bgeeks?\s*for\s*greeks?\b/gi, "geeksforgeeks");
    t = t.replace(/\bleet\s*code\b/gi, "leetcode");
    t = t.replace(/\bw3\s*school\b/gi, "w3schools");
    t = t.replace(/\bstack\s*overflow\b/gi, "stackoverflow");
    t = t.replace(/\bchat\s*gpt\b/gi, "chatgpt");
    t = t.replace(/\bgit\s*hub\b/gi, "github");

    // Fix Contact names in WhatsApp context
    if (/\b(?:in|on|find|open|message|to|chat)\s+whatsapp\b|\bwhatsapp\s+(?:and\s+)?(?:open|find|send)/i.test(t)) {
      t = t.replace(/\bclean\b/gi, "Queen");
      t = t.replace(/\bcream\b/gi, "Queen");
      t = t.replace(/\bquean\b/gi, "Queen");
      t = t.replace(/\bgreen\b(?=\s+in|\s+on|\s+whatsapp)/gi, "Queen");
    }

    // Fix Action verbs
    t = t.replace(/\b(?:writhe|wright|rite)\b/gi, "write");
    t = t.replace(/\byour\s*self\b/gi, "yourself");
    t = t.replace(/\b(?:surch|serch)\b/gi, "search");
    t = t.replace(/\b(?:search|surch|serch)\s+(?:u|view|your)\s+(?:on|in)\s+whatsapp\b/gi, "search you on whatsapp");
    t = t.replace(/\bsand\b(?=\s+it|\s+message|\s+the|\s+to|$)/gi, "send");
    t = t.replace(/\bsaint\b(?=\s+it|\s+message|\s+the|\s+to|$)/gi, "send");

    // Fix Window & Display actions
    t = t.replace(/\b(?:gnomec|gnomic|gomec|gomic)\b/gi, "make");
    t = t.replace(/\b(?:pull|fool|full)\s*scre[ae]n\b/gi, "full screen");
    t = t.replace(/\bminimise\b/gi, "minimize");
    t = t.replace(/\bmaximise\b/gi, "maximize");

    return t;
  }

  public finalizeAndDispatch(): boolean {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    const combined = (this.bufferedFinalText + " " + this.latestInterimText).trim();
    this.bufferedFinalText = "";
    this.latestInterimText = "";
    if (combined) {
      this.dispatchTranscript(combined, true);
      return true;
    }
    return false;
  }

  private dispatchTranscript(text: string, isFinal: boolean) {
    const cleaned = VoiceEngine.normalizePhoneticText(text);
    if (isFinal) {
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }
      this.bufferedFinalText = "";
      this.latestInterimText = "";
      // Abort recognition immediately so microphone stays clean while AI processes & speaks
      if (this.recognition) {
        try {
          this.recognition.onstart = null;
          this.recognition.onresult = null;
          this.recognition.onerror = null;
          this.recognition.onend = null;
          this.recognition.abort();
        } catch (e) {}
        this.recognition = null;
        this.isRecognizing = false;
      }
    }
    this.callbacks.onTranscript(cleaned, isFinal);
  }

  public initSTT() {
    if (typeof window === "undefined") return;

    if (this.recognition) {
      try {
        this.recognition.onstart = null;
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.abort();
      } catch (e) {}
      this.recognition = null;
      this.isRecognizing = false;
    }

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    this.isSupportedSTT = Boolean(SpeechRecognitionAPI) || true;
  }

  private startWebSpeech() {
    if (typeof window === "undefined") return;
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      this.listenViaWindowsCore();
      return;
    }

    // Cleanly abort previous instance and detach callbacks
    if (this.recognition) {
      try {
        this.recognition.onstart = null;
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.abort();
      } catch (e) {}
      this.recognition = null;
      this.isRecognizing = false;
    }

    try {
      const rec = new SpeechRecognitionAPI();
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 3;
      rec.lang = this.sttLang;

      rec.onstart = () => {
        this.isRecognizing = true;
        this.setState("listening");
        this.bufferedFinalText = "";
        this.latestInterimText = "";
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }
      };

      rec.onresult = (event: any) => {
        let interimText = "";
        let newFinalChunk = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i];
          if (!item || !item[0]) continue;
          const transcript = item[0].transcript || "";
          if (item.isFinal) {
            newFinalChunk += " " + transcript;
          } else {
            interimText += transcript;
          }
        }

        if (newFinalChunk.trim()) {
          this.bufferedFinalText = (this.bufferedFinalText + " " + newFinalChunk.trim()).trim();
          this.latestInterimText = "";
        }
        if (interimText.trim()) {
          this.latestInterimText = interimText.trim();
        }

        const candidate = (this.bufferedFinalText + " " + this.latestInterimText).trim();
        if (candidate) {
          this.dispatchTranscript(candidate, false);
        }

        // Always schedule/reset silence timer whenever voice activity occurs
        // Pausing speech for silenceThresholdMs will immediately finalize and submit the input
        if (this.silenceTimer) clearTimeout(this.silenceTimer);
        this.silenceTimer = setTimeout(() => {
          this.finalizeAndDispatch();
        }, this.silenceThresholdMs);
      };

      rec.onerror = (event: any) => {
        console.warn("Speech recognition event error:", event.error);
        this.isRecognizing = false;

        if (event.error === "network") {
          // Cloud service unavailable — auto-fallback to Windows System Audio (offline)
          this.isContinuousMode = false;
          this.setState("idle");
          this.callbacks.onError?.(
            "Web Speech cloud unavailable — auto-switching to Windows System Audio (offline mode). Speak now, Boss!"
          );
          // Short delay then retry with Windows Core Audio fallback
          setTimeout(() => {
            this.listenViaWindowsCore();
          }, 800);
          return;
        } else if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          this.isContinuousMode = false;
          this.setState("idle");
          this.callbacks.onError?.(
            "Microphone permission not allowed. Please allow microphone access in browser URL bar."
          );
          return;
        } else if (event.error === "aborted" || event.error === "no-speech") {
          return;
        }

        if (this.state === "listening" && !this.isContinuousMode) {
          this.setState("idle");
        }
      };

      rec.onend = () => {
        this.isRecognizing = false;
        if (this.isContinuousMode && this.state !== "speaking" && this.state !== "thinking") {
          setTimeout(() => {
            if (this.isContinuousMode && this.state !== "speaking" && this.state !== "thinking") {
              this.startWebSpeech();
            }
          }, 150);
        } else if (this.state === "listening") {
          this.finalizeAndDispatch();
          this.setState("idle");
        }
      };

      this.recognition = rec;
      rec.start();
    } catch (e: any) {
      console.warn("Speech recognition start failed:", e);
      setTimeout(() => {
        if (this.isContinuousMode && this.state === "listening" && !this.isRecognizing) {
          this.startWebSpeech();
        }
      }, 300);
    }
  }

  private coreAudioAbortController: AbortController | null = null;

  public async listenViaWindowsCore(timeoutSec = 8) {
    this.setState("listening");
    this.callbacks.onTranscript("🎙️ Listening via Windows System Audio... (Speak now)", false);

    // Always release browser mic tracks so Windows SpeechRecognitionEngine has clean, unblocked hardware access
    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach((track) => track.stop());
      } catch {}
      this.mediaStream = null;
    }

    try {
      this.coreAudioAbortController = new AbortController();
      const res = await fetch("/api/system-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "listen_mic", timeoutSec }),
        signal: this.coreAudioAbortController.signal,
      });
      const data = await res.json();
      if (data.success && data.text && data.text.trim()) {
        this.dispatchTranscript(data.text.trim(), true);
        return;
      }

      // No speech detected - cleanly reset transcript so dummy text never hangs
      this.callbacks.onTranscript("", false);
      this.callbacks.onError?.(
        "No speech detected. Click TALK to try again or speak closer to microphone."
      );
    } catch (err: any) {
      this.callbacks.onTranscript("", false);
      if (err.name !== "AbortError") {
        this.callbacks.onError?.(`Windows audio error: ${err.message}`);
      }
    } finally {
      this.coreAudioAbortController = null;
      this.setState("idle");
    }
  }

  public setSttLanguage(lang: "en-IN" | "en-US" | "en-GB") {
    this.sttLang = lang;
    if (typeof window !== "undefined") {
      localStorage.setItem("monday_stt_lang", lang);
    }
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }

  public setSpeechEngine(engine: "core" | "webspeech") {
    if (typeof window !== "undefined") {
      localStorage.setItem("monday_use_core_audio", engine === "core" ? "true" : "false");
    }
    this.initSTT();
  }

  public setVoiceCharacter(character: "friday" | "ultron" | "jarvis") {
    this.voiceCharacter = character;
    this.updateSelectedVoice();
  }

  private updateSelectedVoice() {
    if (!this.synthesis) return;
    const voices = this.synthesis.getVoices() || [];
    if (this.voiceCharacter === "friday") {
      const femaleVoices = voices.filter(
        (v) => !/david|mark|george|guy|christopher|ryan|james|richard|\bmale\b/i.test(v.name)
      );

      this.selectedVoice =
        femaleVoices.find((v) => /zira|eva|hazel|samantha|victoria|karen|catherine|susan|fiona|veena|helena|heera|cira|aria|jenny|female/i.test(v.name)) ||
        femaleVoices.find((v) => v.lang.startsWith("en")) ||
        femaleVoices[0] ||
        voices.find((v) => /zira|eva|hazel|samantha|victoria|karen|catherine|susan|fiona|veena|helena|heera|cira|aria|jenny|female/i.test(v.name)) ||
        null;
    } else if (this.voiceCharacter === "ultron") {
      this.selectedVoice =
        voices.find((v) => v.name.includes("David") && v.lang.startsWith("en")) ||
        voices.find((v) => v.name.includes("George") && v.lang.startsWith("en")) ||
        voices.find((v) => v.name.includes("Google US English") && v.lang.startsWith("en")) ||
        voices.find((v) => v.name.includes("Male") && v.lang.startsWith("en")) ||
        voices.find((v) => v.lang.startsWith("en")) ||
        voices[0] || null;
    } else {
      this.selectedVoice =
        voices.find((v) => v.name.includes("Guy") && (v.name.includes("Natural") || v.name.includes("Online"))) ||
        voices.find((v) => v.name.includes("Christopher") && (v.name.includes("Natural") || v.name.includes("Online"))) ||
        voices.find((v) => v.name.includes("Ryan") && (v.name.includes("Natural") || v.name.includes("Online"))) ||
        voices.find((v) => v.name.includes("Natural") && v.lang.startsWith("en")) ||
        voices.find((v) => v.lang.startsWith("en") && v.name.includes("Male")) ||
        voices.find((v) => v.lang.startsWith("en")) ||
        voices[0] || null;
    }
  }

  private initTTS() {
    if (typeof window === "undefined") return;
    if ((window as any).AndroidTTS) {
      this.isSupportedTTS = true;
    }
    if ("speechSynthesis" in window) {
      this.synthesis = window.speechSynthesis;
      this.isSupportedTTS = true;

      const loadVoices = () => {
        this.updateSelectedVoice();
      };

      loadVoices();
      if (this.synthesis.onvoiceschanged !== undefined) {
        this.synthesis.onvoiceschanged = loadVoices;
      }
    }
  }

  public async startListening() {
    // 1. Activate hardware microphone stream with echo cancellation & noise suppression
    await this.ensureMicStream();

    const userPrefersCore = typeof window !== "undefined" ? localStorage.getItem("monday_use_core_audio") : null;
    // Default to Web Speech API (Edge/Chrome/PC App) for live real-time speech conversion and continuous listening
    const useCore = userPrefersCore === "true";

    if (useCore) {
      await this.listenViaWindowsCore();
      return;
    }

    const SpeechRecognitionAPI =
      typeof window !== "undefined" &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

    if (!SpeechRecognitionAPI) {
      await this.listenViaWindowsCore();
      return;
    }

    this.isContinuousMode = true;
    this.bufferedFinalText = "";
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    if (this.state === "speaking") {
      this.stopSpeaking();
    }

    this.startWebSpeech();
  }

  public deactivateListening(drainInterim: boolean = false) {
    this.isContinuousMode = false;
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (drainInterim) {
      this.finalizeAndDispatch();
    } else {
      this.bufferedFinalText = "";
      this.latestInterimText = "";
    }
    if (this.coreAudioAbortController) {
      this.coreAudioAbortController.abort();
      this.coreAudioAbortController = null;
    }
    if (this.recognition) {
      try {
        this.recognition.onstart = null;
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.abort();
      } catch (e) {}
      this.recognition = null;
    }
    this.isRecognizing = false;
    this.setState("idle");

    if (this.audioLevelAnimId) {
      cancelAnimationFrame(this.audioLevelAnimId);
      this.audioLevelAnimId = null;
    }
  }

  public stopListening() {
    this.deactivateListening(true);
  }

  public speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (this.recognition) {
        try {
          this.recognition.onstart = null;
          this.recognition.onresult = null;
          this.recognition.onerror = null;
          this.recognition.onend = null;
          this.recognition.abort();
        } catch (e) {}
        this.recognition = null;
        this.isRecognizing = false;
      }

      const cleanText = text
        .replace(/```[\s\S]*?```/g, "Code block omitted.")
        .replace(/[*_#`[\]()]/g, "")
        .replace(/\n+/g, " ")
        .trim();

      if (!cleanText) {
        this.setState("idle");
        if (this.isContinuousMode) {
          this.startListening();
        }
        resolve();
        return;
      }

      // 1. Try Native Android TTS Bridge (Android system TextToSpeech engine)
      if (
        typeof window !== "undefined" &&
        (window as any).AndroidTTS &&
        typeof (window as any).AndroidTTS.speak === "function"
      ) {
        try {
          this.setState("speaking");
          const spoken = (window as any).AndroidTTS.speak(cleanText);
          if (spoken) {
            const wordCount = cleanText.split(/\s+/).length;
            const estimatedDurationMs = Math.max(1800, (wordCount / 2.8) * 1000);
            setTimeout(() => {
              if (this.state === "speaking") {
                this.setState("idle");
              }
              resolve();
            }, estimatedDurationMs);
            return;
          }
        } catch (e) {
          console.warn("AndroidTTS bridge error:", e);
        }
      }

      // 2. Fallback to Web Speech API (speechSynthesis)
      if (typeof window !== "undefined" && "speechSynthesis" in window && window.speechSynthesis) {
        const synth = window.speechSynthesis;
        this.synthesis = synth;
        try {
          if (synth.paused) {
            synth.resume();
          }
          synth.cancel();
        } catch (e) {
          // ignore
        }

        this.setState("speaking");
        this.updateSelectedVoice();

        const utterance = new SpeechSynthesisUtterance(cleanText);
        if (this.selectedVoice) {
          utterance.voice = this.selectedVoice;
        }

        if (this.voiceCharacter === "friday") {
          utterance.pitch = 1.45; // Crisp, high-frequency female AI pitch (F.R.I.D.A.Y.)
          utterance.rate = 1.02;  // Elegant natural speed
        } else if (this.voiceCharacter === "ultron") {
          utterance.pitch = 0.82; // Deep commanding Ultron metallic synth pitch
          utterance.rate = 0.95;  // Measured authoritative speed
        } else {
          utterance.pitch = 1.03; // Smooth energetic 20-year-old JARVIS pitch
          utterance.rate = 1.03;  // Energetic natural speed
        }

        let finished = false;
        const finishSpeech = () => {
          if (finished) return;
          finished = true;
          if (this.isContinuousMode) {
            setTimeout(() => {
              if (this.isContinuousMode) {
                this.startListening();
              }
            }, 350);
          } else {
            this.setState("idle");
          }
          resolve();
        };

        utterance.onend = finishSpeech;
        utterance.onerror = (e) => {
          console.warn("Speech synthesis error:", e);
          finishSpeech();
        };

        try {
          synth.speak(utterance);
          if (synth.paused) {
            synth.resume();
          }
        } catch (err) {
          console.warn("Speech synthesis speak error:", err);
          finishSpeech();
        }

        // Safety fallback timer so state never hangs in speaking
        const maxDuration = Math.max(3000, cleanText.split(/\s+/).length * 800);
        setTimeout(() => {
          if (!finished && this.state === "speaking") {
            finishSpeech();
          }
        }, maxDuration);
        return;
      }

      // 3. Fallback when neither native AndroidTTS nor Web Speech API is present
      this.setState("idle");
      resolve();
    });
  }

  public stopSpeaking() {
    if (typeof window !== "undefined" && (window as any).AndroidTTS && typeof (window as any).AndroidTTS.stop === "function") {
      try {
        (window as any).AndroidTTS.stop();
      } catch (e) {}
    }
    if (this.synthesis) {
      this.synthesis.cancel();
      if (this.state === "speaking") {
        this.setState("idle");
      }
    }
  }

  public setState(newState: AiState) {
    if (this.state !== newState) {
      this.state = newState;
      this.callbacks.onStateChange(newState);
    }
  }

  public getState(): AiState {
    return this.state;
  }

  public getSupported(): { stt: boolean; tts: boolean } {
    return { stt: this.isSupportedSTT, tts: this.isSupportedTTS };
  }
}
