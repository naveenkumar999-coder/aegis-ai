"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  CallSession,
  getCallSessions,
  markSessionAsRead,
  addCallMessage,
  createNewCallSession,
  saveCallSessions,
} from "@/lib/callLogStore";
import { generateSampleAudioMemoBase64 } from "@/lib/sampleAudio";

interface MiniWhatsAppProps {
  onClose: () => void;
  isMobile?: boolean;
}

export function MiniWhatsAppCallLogs({ onClose, isMobile = false }: MiniWhatsAppProps) {
  const [sessions, setSessions] = useState<CallSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [showCarrierSetup, setShowCarrierSetup] = useState(false);
  const [selectedCarrierTab, setSelectedCarrierTab] = useState<"jio" | "airtel" | "vi">("jio");
  const [assistantNumber, setAssistantNumber] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("aegis_carrier_assistant_number") || "+91 91234 56789";
    }
    return "+91 91234 56789";
  });

  // Sync with localStorage, API route and live events
  useEffect(() => {
    const loaded = getCallSessions();
    setSessions(loaded);
    if (loaded.length > 0 && !isMobile) {
      setActiveSessionId(loaded[0].id);
    }

    const fetchServerSessions = async () => {
      try {
        const res = await fetch("/api/call-logs");
        if (res.ok) {
          const data = await res.json();
          if (data.sessions && Array.isArray(data.sessions) && data.sessions.length > 0) {
            setSessions(data.sessions);
            saveCallSessions(data.sessions);
          } else if (data.sessions && Array.isArray(data.sessions) && data.sessions.length === 0) {
            // If server storage was reset (e.g. Vercel redeployment /tmp wipe), re-sync client cache up to server
            const local = getCallSessions();
            if (local && local.length > 0) {
              fetch("/api/call-logs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "sync_all", sessions: local }),
              }).catch(() => {});
            }
          }
        }
      } catch (e) {
        // Local offline fallback
      }
    };

    fetchServerSessions();
    const interval = setInterval(fetchServerSessions, 3500);

    const handleInterceptEvent = (e: any) => {
      try {
        const detail = e.detail;
        if (detail && detail.id) {
          setSessions((prev) => [detail, ...prev.filter((s) => s.id !== detail.id)]);
          setActiveSessionId(detail.id);
        }
      } catch (err) {}
    };

    window.addEventListener("aegis-call-intercepted", handleInterceptEvent);

    return () => {
      clearInterval(interval);
      window.removeEventListener("aegis-call-intercepted", handleInterceptEvent);
    };
  }, [isMobile]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSessionId, sessions]);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  const handleSelectSession = (id: string) => {
    setActiveSessionId(id);
    const updated = markSessionAsRead(id);
    setSessions(updated);
  };

  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlayMessageAudio = (
    msgId: string,
    audioDataUri?: string
  ) => {
    if (typeof window === "undefined") return;

    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    if (playingAudioId === msgId) {
      setPlayingAudioId(null);
      return;
    }

    if (!audioDataUri) {
      console.warn("No audio recording available for message:", msgId);
      setPlayingAudioId(null);
      return;
    }

    let uriToPlay = audioDataUri;

    // Only route direct Exotel URLs through the proxy if not already routed
    if (
      uriToPlay &&
      !uriToPlay.startsWith("/api/telephony/recording-audio") &&
      (uriToPlay.includes("recordings.exotel.com") ||
        uriToPlay.includes("exotel.com") ||
        uriToPlay.includes("amazonaws.com"))
    ) {
      uriToPlay = `/api/telephony/recording-audio?url=${encodeURIComponent(uriToPlay)}`;
    }

    setPlayingAudioId(msgId);

    try {
      const audio = new Audio(uriToPlay);
      audio.preload = "auto";
      activeAudioRef.current = audio;

      audio.onended = () => {
        setPlayingAudioId(null);
        activeAudioRef.current = null;
      };

      audio.onerror = (e) => {
        console.error("Audio playback error for", uriToPlay, e);
        setPlayingAudioId(null);
        activeAudioRef.current = null;
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.error("Audio play() promise rejected:", err);
          setPlayingAudioId(null);
          activeAudioRef.current = null;
        });
      }
    } catch (e) {
      console.error("Failed to initialize Audio:", e);
      setPlayingAudioId(null);
      activeAudioRef.current = null;
    }
  };

  const handleSimulateNewCall = async () => {
    if (isSimulating) return;
    setIsSimulating(true);

    const callerNames = [
      "Prof. Sharma (Dept HOD)",
      "Priya (Batchmate)",
      "Swiggy Delivery Partner",
      "Kavita (HDFC Bank)",
    ];
    const chosenName = callerNames[Math.floor(Math.random() * callerNames.length)];
    const chosenNum = "+91 9" + Math.floor(100000000 + Math.random() * 900000000);

    const audioMemo = generateSampleAudioMemoBase64();
    const newSession = createNewCallSession(chosenName, chosenNum, audioMemo);
    setSessions(getCallSessions());
    setActiveSessionId(newSession.id);

    try {
      await fetch("/api/call-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_session", session: newSession }),
      });
    } catch (e) {}

    // Simulate caller speaking after 1.8 seconds
    setTimeout(async () => {
      const callerTexts = [
        "Hello Naveen, please submit the project documentation by 4 PM today.",
        "Hi Naveen, are you free this evening for the hackathon discussion?",
        "Sir, I am waiting outside your building with the order. Please confirm room number.",
      ];
      const speech = callerTexts[Math.floor(Math.random() * callerTexts.length)];
      const updated1 = addCallMessage(newSession.id, "caller", speech, audioMemo);
      setSessions([...updated1]);

      try {
        await fetch("/api/call-logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "append_message",
            sessionId: newSession.id,
            sender: "caller",
            text: speech,
            audioDataUri: audioMemo,
          }),
        });
      } catch (e) {}

      // Trigger cloud test endpoint for server sync
      try {
        await fetch("/api/telephony/test-call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callerName: chosenName,
            callerNumber: chosenNum,
            transcriptionText: speech,
          }),
        });
      } catch (e) {}

      // Call cuts immediately after caller leaves voice recording
      setIsSimulating(false);
    }, 1800);
  };

  const filteredSessions = sessions.filter(
    (s) =>
      s.callerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.callerNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.summary && s.summary.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        backdropFilter: "blur(8px)",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: isMobile ? "0" : "20px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: isMobile ? "100%" : "880px",
          height: isMobile ? "100%" : "620px",
          backgroundColor: "#111B21",
          borderRadius: isMobile ? "0" : "12px",
          display: "flex",
          flexDirection: "row",
          overflow: "hidden",
          position: "relative",
          boxShadow: "0 10px 40px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Carrier Call Forwarding Setup Modal (Path A) */}
        {showCarrierSetup && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "#111B21",
              zIndex: 100,
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
              padding: "16px 20px",
            }}
          >
            {/* Setup Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "12px",
                borderBottom: "1px solid #222E35",
                paddingBottom: "10px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "20px" }}>📞</span>
                <div>
                  <div style={{ color: "#E9EDEF", fontSize: "15px", fontWeight: "bold" }}>
                    AI Call Forwarding Setup (Path A)
                  </div>
                  <div style={{ color: "#00A884", fontSize: "11px" }}>
                    Truecaller / Samsung Bixby Remote Cloud Architecture
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCarrierSetup(false)}
                style={{
                  backgroundColor: "transparent",
                  border: "none",
                  color: "#AEBAC1",
                  fontSize: "18px",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            {/* Explanation Card */}
            <div
              style={{
                backgroundColor: "rgba(0, 168, 132, 0.1)",
                border: "1px solid rgba(0, 168, 132, 0.3)",
                borderRadius: "8px",
                padding: "10px 14px",
                marginBottom: "14px",
                fontSize: "12px",
                color: "#E9EDEF",
                lineHeight: "1.5",
              }}
            >
              <strong style={{ color: "#00A884" }}>How it works on your phone:</strong>
              <br />
              When someone calls you, if you don't pick up within 25 seconds OR if you tap decline, your SIM carrier forwards the call directly to your AEGIS Cloud Telephony Assistant.
              <br />
              <strong style={{ color: "#53BDEB" }}>Key Guarantee:</strong> Your phone screen <span style={{ textDecoration: "underline" }}>NEVER</span> activates an answered call screen. Jarvis answers in the cloud, speaks the greeting to the caller, records their voice memo, and posts the audio & transcript right here in this chat slot!
            </div>

            {/* Cloud Assistant Number Setting */}
            <div style={{ marginBottom: "16px", backgroundColor: "#202C33", borderRadius: "8px", padding: "12px 14px" }}>
              <label style={{ display: "block", color: "#8696A0", fontSize: "11px", fontWeight: "600", marginBottom: "6px" }}>
                AEGIS CLOUD TELEPHONY NUMBER (FORWARD DESTINATION)
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  value={assistantNumber}
                  onChange={(e) => {
                    setAssistantNumber(e.target.value);
                    if (typeof window !== "undefined") {
                      localStorage.setItem("aegis_carrier_assistant_number", e.target.value);
                    }
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: "#111B21",
                    border: "1px solid #2A3942",
                    borderRadius: "6px",
                    color: "#00A884",
                    fontSize: "14px",
                    fontWeight: "bold",
                    padding: "8px 12px",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      localStorage.setItem("aegis_carrier_assistant_number", assistantNumber);
                    }
                    alert("Assistant forward number saved!");
                  }}
                  style={{
                    backgroundColor: "#00A884",
                    border: "none",
                    borderRadius: "6px",
                    color: "#FFF",
                    fontWeight: "bold",
                    fontSize: "12px",
                    padding: "8px 14px",
                    cursor: "pointer",
                  }}
                >
                  SAVE
                </button>
              </div>
            </div>

            {/* Operator Selection Tabs */}
            <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
              {[
                { id: "jio", name: "Reliance Jio" },
                { id: "airtel", name: "Bharti Airtel" },
                { id: "vi", name: "Vodafone Idea (Vi)" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedCarrierTab(tab.id as any)}
                  style={{
                    flex: 1,
                    padding: "8px 6px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: "bold",
                    border: "none",
                    cursor: "pointer",
                    backgroundColor: selectedCarrierTab === tab.id ? "#00A884" : "#202C33",
                    color: selectedCarrierTab === tab.id ? "#FFF" : "#8696A0",
                  }}
                >
                  {tab.name}
                </button>
              ))}
            </div>

            {/* Operator MMI Codes Card */}
            <div style={{ flex: 1, backgroundColor: "#202C33", borderRadius: "8px", padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
              {selectedCarrierTab === "jio" && (
                <>
                  <div style={{ color: "#E9EDEF", fontSize: "13px", fontWeight: "bold" }}>
                    Jio Forwarding Dial Codes
                  </div>
                  <div style={{ backgroundColor: "#111B21", padding: "10px", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ color: "#E9EDEF", fontSize: "12px", fontWeight: "600" }}>Forward When Unanswered (25s)</div>
                      <div style={{ color: "#00A884", fontSize: "13px", fontFamily: "monospace" }}>*61*{assistantNumber.replace(/[^0-9]/g, "")}*11*25#</div>
                    </div>
                    <a
                      href={`tel:*61*${assistantNumber.replace(/[^0-9]/g, "")}*11*25%23`}
                      style={{ backgroundColor: "#00A884", color: "#FFF", padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", textDecoration: "none" }}
                    >
                      DIAL
                    </a>
                  </div>

                  <div style={{ backgroundColor: "#111B21", padding: "10px", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ color: "#E9EDEF", fontSize: "12px", fontWeight: "600" }}>Forward When Busy / Declined</div>
                      <div style={{ color: "#00A884", fontSize: "13px", fontFamily: "monospace" }}>*67*{assistantNumber.replace(/[^0-9]/g, "")}#</div>
                    </div>
                    <a
                      href={`tel:*67*${assistantNumber.replace(/[^0-9]/g, "")}%23`}
                      style={{ backgroundColor: "#00A884", color: "#FFF", padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", textDecoration: "none" }}
                    >
                      DIAL
                    </a>
                  </div>

                  <div style={{ backgroundColor: "#111B21", padding: "10px", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ color: "#E9EDEF", fontSize: "12px", fontWeight: "600" }}>Deactivate All Forwarding</div>
                      <div style={{ color: "#8696A0", fontSize: "13px", fontFamily: "monospace" }}>*413 or ##002#</div>
                    </div>
                    <a
                      href="tel:*413"
                      style={{ backgroundColor: "#2A3942", color: "#AEBAC1", padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", textDecoration: "none" }}
                    >
                      RESET
                    </a>
                  </div>
                </>
              )}

              {selectedCarrierTab === "airtel" && (
                <>
                  <div style={{ color: "#E9EDEF", fontSize: "13px", fontWeight: "bold" }}>
                    Airtel Forwarding Dial Codes
                  </div>
                  <div style={{ backgroundColor: "#111B21", padding: "10px", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ color: "#E9EDEF", fontSize: "12px", fontWeight: "600" }}>Forward When Unanswered (25s)</div>
                      <div style={{ color: "#00A884", fontSize: "13px", fontFamily: "monospace" }}>**61*{assistantNumber.replace(/[^0-9]/g, "")}**25#</div>
                    </div>
                    <a
                      href={`tel:**61*${assistantNumber.replace(/[^0-9]/g, "")}**25%23`}
                      style={{ backgroundColor: "#00A884", color: "#FFF", padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", textDecoration: "none" }}
                    >
                      DIAL
                    </a>
                  </div>

                  <div style={{ backgroundColor: "#111B21", padding: "10px", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ color: "#E9EDEF", fontSize: "12px", fontWeight: "600" }}>Forward When Busy / Declined</div>
                      <div style={{ color: "#00A884", fontSize: "13px", fontFamily: "monospace" }}>**67*{assistantNumber.replace(/[^0-9]/g, "")}#</div>
                    </div>
                    <a
                      href={`tel:**67*${assistantNumber.replace(/[^0-9]/g, "")}%23`}
                      style={{ backgroundColor: "#00A884", color: "#FFF", padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", textDecoration: "none" }}
                    >
                      DIAL
                    </a>
                  </div>

                  <div style={{ backgroundColor: "#111B21", padding: "10px", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ color: "#E9EDEF", fontSize: "12px", fontWeight: "600" }}>Deactivate All Forwarding</div>
                      <div style={{ color: "#8696A0", fontSize: "13px", fontFamily: "monospace" }}>##002#</div>
                    </div>
                    <a
                      href="tel:##002%23"
                      style={{ backgroundColor: "#2A3942", color: "#AEBAC1", padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", textDecoration: "none" }}
                    >
                      RESET
                    </a>
                  </div>
                </>
              )}

              {selectedCarrierTab === "vi" && (
                <>
                  <div style={{ color: "#E9EDEF", fontSize: "13px", fontWeight: "bold" }}>
                    Vi (Vodafone Idea) Forwarding Dial Codes
                  </div>
                  <div style={{ backgroundColor: "#111B21", padding: "10px", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ color: "#E9EDEF", fontSize: "12px", fontWeight: "600" }}>Forward When Unanswered (25s)</div>
                      <div style={{ color: "#00A884", fontSize: "13px", fontFamily: "monospace" }}>**61*{assistantNumber.replace(/[^0-9]/g, "")}*11*25#</div>
                    </div>
                    <a
                      href={`tel:**61*${assistantNumber.replace(/[^0-9]/g, "")}*11*25%23`}
                      style={{ backgroundColor: "#00A884", color: "#FFF", padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", textDecoration: "none" }}
                    >
                      DIAL
                    </a>
                  </div>

                  <div style={{ backgroundColor: "#111B21", padding: "10px", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ color: "#E9EDEF", fontSize: "12px", fontWeight: "600" }}>Forward When Busy / Declined</div>
                      <div style={{ color: "#00A884", fontSize: "13px", fontFamily: "monospace" }}>**67*{assistantNumber.replace(/[^0-9]/g, "")}#</div>
                    </div>
                    <a
                      href={`tel:**67*${assistantNumber.replace(/[^0-9]/g, "")}%23`}
                      style={{ backgroundColor: "#00A884", color: "#FFF", padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", textDecoration: "none" }}
                    >
                      DIAL
                    </a>
                  </div>

                  <div style={{ backgroundColor: "#111B21", padding: "10px", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ color: "#E9EDEF", fontSize: "12px", fontWeight: "600" }}>Deactivate All Forwarding</div>
                      <div style={{ color: "#8696A0", fontSize: "13px", fontFamily: "monospace" }}>##002#</div>
                    </div>
                    <a
                      href="tel:##002%23"
                      style={{ backgroundColor: "#2A3942", color: "#AEBAC1", padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold", textDecoration: "none" }}
                    >
                      RESET
                    </a>
                  </div>
                </>
              )}
            </div>

            {/* Test Cloud Button in Modal */}
            <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => {
                  setShowCarrierSetup(false);
                  handleSimulateNewCall();
                }}
                style={{
                  backgroundColor: "#00A884",
                  border: "none",
                  borderRadius: "6px",
                  color: "#FFF",
                  fontWeight: "bold",
                  fontSize: "12px",
                  padding: "10px 18px",
                  cursor: "pointer",
                }}
              >
                ⚡ TEST CLOUD INTERCEPT NOW
              </button>
            </div>
          </div>
        )}

        {/* Left Side: Chats / Call Intercepts List */}
        <div
          style={{
            width: isMobile && activeSession ? "0" : isMobile ? "100%" : "360px",
            display: isMobile && activeSession ? "none" : "flex",
            flexDirection: "column",
            borderRight: "1px solid #222E35",
            backgroundColor: "#111B21",
          }}
        >
          {/* WhatsApp Header */}
          <div
            style={{
              height: "60px",
              backgroundColor: "#202C33",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  backgroundColor: "#00A884",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#FFF",
                  fontWeight: "bold",
                  fontSize: "16px",
                }}
              >
                ⚡
              </div>
              <div>
                <div style={{ color: "#E9EDEF", fontSize: "15px", fontWeight: "600" }}>AEGIS Intercepts</div>
                <div style={{ color: "#8696A0", fontSize: "11px" }}>Bixby Call Transcripts</div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                type="button"
                onClick={() => setShowCarrierSetup(true)}
                title="Carrier Call Forwarding Setup (Path A)"
                style={{
                  backgroundColor: "#202C33",
                  border: "1px solid #00A884",
                  borderRadius: "6px",
                  color: "#00A884",
                  padding: "5px 8px",
                  fontSize: "11px",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                ⚙️ SETUP
              </button>
              <button
                type="button"
                onClick={handleSimulateNewCall}
                disabled={isSimulating}
                title="Simulate Incoming Intercepted Call"
                style={{
                  backgroundColor: isSimulating ? "#2A3942" : "#00A884",
                  border: "none",
                  borderRadius: "6px",
                  color: "#FFF",
                  padding: "6px 10px",
                  fontSize: "11px",
                  fontWeight: "bold",
                  cursor: isSimulating ? "not-allowed" : "pointer",
                }}
              >
                {isSimulating ? "📞 INTERCEPTING..." : "⚡ TEST CALL"}
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  backgroundColor: "transparent",
                  border: "none",
                  color: "#AEBAC1",
                  fontSize: "18px",
                  cursor: "pointer",
                  padding: "4px",
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div style={{ padding: "8px 12px", backgroundColor: "#111B21" }}>
            <div
              style={{
                backgroundColor: "#202C33",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                padding: "6px 12px",
                gap: "8px",
              }}
            >
              <span style={{ color: "#8696A0", fontSize: "13px" }}>🔍</span>
              <input
                type="text"
                placeholder="Search callers or keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  backgroundColor: "transparent",
                  border: "none",
                  outline: "none",
                  color: "#E9EDEF",
                  fontSize: "12px",
                  width: "100%",
                }}
              />
            </div>
          </div>

          {/* Caller Conversations List */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {filteredSessions.map((session) => {
              const lastMsg =
                session.messages.length > 0
                  ? session.messages[session.messages.length - 1]
                  : null;
              const isSelected = session.id === activeSessionId;

              return (
                <div
                  key={session.id}
                  onClick={() => handleSelectSession(session.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "12px 16px",
                    cursor: "pointer",
                    backgroundColor: isSelected ? "#2A3942" : "transparent",
                    borderBottom: "1px solid #1C272E",
                    transition: "background 0.15s ease",
                  }}
                >
                  {/* Avatar */}
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "50%",
                      backgroundColor: session.avatarColor,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#FFF",
                      fontWeight: "bold",
                      fontSize: "16px",
                      marginRight: "12px",
                      flexShrink: 0,
                    }}
                  >
                    {session.callerName.charAt(0).toUpperCase()}
                  </div>

                  {/* Details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span
                        style={{
                          color: "#E9EDEF",
                          fontSize: "14px",
                          fontWeight: "500",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {session.callerName}
                      </span>
                      <span style={{ color: session.unread ? "#00A884" : "#8696A0", fontSize: "11px", flexShrink: 0 }}>
                        {session.messages.length > 0
                          ? session.messages[session.messages.length - 1].timestamp
                          : session.duration}
                      </span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span
                        style={{
                          color: "#8696A0",
                          fontSize: "12px",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {lastMsg ? (
                          <>
                            {lastMsg.sender === "aegis" && (
                              <span style={{ color: "#53BDEB", marginRight: "4px" }}>✓✓</span>
                            )}
                            {lastMsg.text}
                          </>
                        ) : (
                          "Call intercepted"
                        )}
                      </span>
                      {session.unread && (
                        <div
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            backgroundColor: "#00A884",
                            flexShrink: 0,
                            marginLeft: "6px",
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Mini WhatsApp Chat View */}
        {activeSession ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              backgroundColor: "#0B141A",
              backgroundImage:
                "radial-gradient(circle at 50% 50%, rgba(32, 44, 51, 0.4) 1px, transparent 1px)",
              backgroundSize: "20px 20px",
            }}
          >
            {/* Chat Top Header */}
            <div
              style={{
                height: "60px",
                backgroundColor: "#202C33",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 16px",
                borderBottom: "1px solid #2A3942",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {isMobile && (
                  <button
                    type="button"
                    onClick={() => setActiveSessionId(null)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#E9EDEF",
                      fontSize: "18px",
                      cursor: "pointer",
                      padding: "4px 8px 4px 0",
                    }}
                  >
                    ←
                  </button>
                )}
                <div
                  style={{
                    width: "38px",
                    height: "38px",
                    borderRadius: "50%",
                    backgroundColor: activeSession.avatarColor,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#FFF",
                    fontWeight: "bold",
                    fontSize: "15px",
                  }}
                >
                  {activeSession.callerName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ color: "#E9EDEF", fontSize: "14px", fontWeight: "600" }}>
                    {activeSession.callerName}
                  </div>
                  <div style={{ color: "#00A884", fontSize: "11px" }}>
                    ● {activeSession.callerNumber} • Intercept Duration: {activeSession.duration}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <a
                  href={`tel:${activeSession.callerNumber}`}
                  style={{
                    backgroundColor: "#00A884",
                    color: "#FFF",
                    textDecoration: "none",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: "bold",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  📞 CALL BACK
                </a>
                <a
                  href={`https://wa.me/${activeSession.callerNumber.replace(/[^0-9]/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    backgroundColor: "#25D366",
                    color: "#FFF",
                    textDecoration: "none",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: "bold",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  💬 WHATSAPP
                </a>
              </div>
            </div>

            {/* Conversation Messages */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "16px 20px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              {/* WhatsApp Date Pill */}
              <div style={{ display: "flex", justifyContent: "center", margin: "6px 0" }}>
                <span
                  style={{
                    backgroundColor: "#182229",
                    color: "#8696A0",
                    fontSize: "11px",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
                  }}
                >
                  {activeSession.timestamp}
                </span>
              </div>

              {/* Call Intercept Notice */}
              <div
                style={{
                  backgroundColor: "rgba(0, 168, 132, 0.12)",
                  border: "1px solid rgba(0, 168, 132, 0.3)",
                  color: "#00A884",
                  fontSize: "11px",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  textAlign: "center",
                  margin: "4px auto 12px auto",
                  maxWidth: "90%",
                }}
              >
                🔒 Call intercepted in background by AEGIS AI. Caller left a voice recording and call was disconnected.
              </div>

              {/* Message Bubbles */}
              {activeSession.messages.map((msg) => {
                const isAegis = msg.sender === "aegis";
                const audioUri = msg.audioDataUri || (!isAegis ? activeSession.audioDataUri : undefined);
                const hasVoiceRecording = !isAegis && Boolean(audioUri);

                // Clean transcript text for display (remove redundant prefixes if present)
                const transcriptText = msg.text
                  ? msg.text.replace(/^Voice recording:\s*/i, "").replace(/^["“]+|["”]+$/g, "").trim()
                  : "";

                return (
                  <div
                    key={msg.id}
                    style={{
                      alignSelf: isAegis ? "flex-end" : "flex-start",
                      maxWidth: hasVoiceRecording ? "82%" : "75%",
                      backgroundColor: isAegis ? "#005C4B" : "#202C33",
                      color: "#E9EDEF",
                      borderRadius: isAegis ? "8px 0px 8px 8px" : "0px 8px 8px 8px",
                      padding: "8px 12px",
                      position: "relative",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
                    }}
                  >
                    {/* Sender Label */}
                    <div
                      style={{
                        fontSize: "10px",
                        fontWeight: "bold",
                        color: isAegis ? "#25D366" : "#53BDEB",
                        marginBottom: "4px",
                      }}
                    >
                      {isAegis ? "⚡ AEGIS AI" : activeSession.callerName}
                    </div>

                    {hasVoiceRecording ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {/* 1. Caller Recording Audio Player */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            backgroundColor: "rgba(0, 0, 0, 0.25)",
                            border: "1px solid rgba(255, 255, 255, 0.08)",
                            padding: "8px 10px",
                            borderRadius: "8px",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => handlePlayMessageAudio(msg.id, audioUri)}
                            style={{
                              backgroundColor: "#00A884",
                              border: "none",
                              borderRadius: "50%",
                              width: "36px",
                              height: "36px",
                              color: "#FFFFFF",
                              cursor: "pointer",
                              flexShrink: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "14px",
                            }}
                            aria-label={
                              playingAudioId === msg.id
                                ? "Stop recording"
                                : "Play original caller recording"
                            }
                          >
                            {playingAudioId === msg.id ? "⏸" : "▶"}
                          </button>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "12px", fontWeight: "600", color: "#E9EDEF" }}>
                              Caller recording
                            </div>
                            <div
                              style={{
                                fontSize: "11px",
                                color: "#00A884",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <span style={{ fontSize: "8px" }}>●</span> Original voice · Actual Exotel audio
                            </div>
                          </div>
                        </div>

                        {/* 2. Transcript Section */}
                        {transcriptText && (
                          <div
                            style={{
                              backgroundColor: "rgba(255, 255, 255, 0.04)",
                              borderLeft: "3px solid #00A884",
                              padding: "6px 10px",
                              borderRadius: "4px",
                            }}
                          >
                            <div
                              style={{
                                fontSize: "10px",
                                fontWeight: "600",
                                color: "#8696A0",
                                letterSpacing: "0.5px",
                                textTransform: "uppercase",
                                marginBottom: "2px",
                              }}
                            >
                              Transcript
                            </div>
                            <div
                              style={{
                                fontSize: "13px",
                                lineHeight: "1.4",
                                color: "#E9EDEF",
                                fontStyle: "italic",
                              }}
                            >
                              “{transcriptText}”
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Standard Text (e.g. AEGIS AI greeting or non-recording status) */
                      <div style={{ fontSize: "13px", lineHeight: "1.4", wordBreak: "break-word" }}>
                        {msg.text}
                      </div>
                    )}

                    {/* Time & Read Receipts */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        alignItems: "center",
                        gap: "4px",
                        marginTop: "4px",
                        fontSize: "10px",
                        color: isAegis ? "rgba(255, 255, 255, 0.7)" : "#8696A0",
                      }}
                    >
                      <span>{msg.timestamp}</span>
                      {isAegis && <span style={{ color: "#53BDEB" }}>✓✓</span>}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Bottom Info Bar */}
            <div
              style={{
                backgroundColor: "#202C33",
                padding: "10px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderTop: "1px solid #2A3942",
              }}
            >
              <div style={{ color: "#8696A0", fontSize: "11px" }}>
                Summary: <span style={{ color: "#E9EDEF" }}>{activeSession.summary || "Conversation logged by AEGIS AI."}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const updated = addCallMessage(
                    activeSession.id,
                    "aegis",
                    "Boss Naveen has reviewed your transcript and will contact you directly."
                  );
                  setSessions([...updated]);
                }}
                style={{
                  backgroundColor: "#00A884",
                  border: "none",
                  borderRadius: "6px",
                  color: "#FFF",
                  padding: "6px 12px",
                  fontSize: "11px",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                + ADD NOTE
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              display: isMobile ? "none" : "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              backgroundColor: "#222E35",
              color: "#8696A0",
              gap: "10px",
            }}
          >
            <div style={{ fontSize: "40px" }}>💬</div>
            <div style={{ color: "#E9EDEF", fontSize: "16px", fontWeight: "bold" }}>
              AEGIS AI Call Transcripts
            </div>
            <div style={{ fontSize: "12px", maxWidth: "300px", textAlign: "center" }}>
              Select a caller on the left to read the transcribed conversation intercepted by AEGIS AI.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
