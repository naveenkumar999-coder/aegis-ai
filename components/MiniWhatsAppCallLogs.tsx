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

  const handlePlayMessageAudio = (msgId: string, text: string, isAegis: boolean) => {
    if (typeof window === "undefined") return;
    if (playingAudioId === msgId) {
      window.speechSynthesis?.cancel();
      setPlayingAudioId(null);
      return;
    }

    window.speechSynthesis?.cancel();
    setPlayingAudioId(msgId);

    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = isAegis ? 1.0 : 0.95;
    utt.pitch = isAegis ? 1.15 : 0.9;
    utt.onend = () => setPlayingAudioId(null);
    utt.onerror = () => setPlayingAudioId(null);
    window.speechSynthesis?.speak(utt);
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

    const newSession = createNewCallSession(chosenName, chosenNum);
    setSessions(getCallSessions());
    setActiveSessionId(newSession.id);

    try {
      await fetch("/api/call-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_session", session: newSession }),
      });
    } catch (e) {}

    // Simulate caller speaking after 2 seconds
    setTimeout(async () => {
      const callerTexts = [
        "Hello Nani, please submit the project documentation by 4 PM today.",
        "Hi Nani, are you free this evening for the hackathon discussion?",
        "Sir, I am waiting outside your building with the order. Please confirm room number.",
      ];
      const speech = callerTexts[Math.floor(Math.random() * callerTexts.length)];
      const updated1 = addCallMessage(newSession.id, "caller", speech);
      setSessions([...updated1]);

      try {
        await fetch("/api/call-logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "append_message", sessionId: newSession.id, sender: "caller", text: speech }),
        });
      } catch (e) {}

      // Call cuts immediately after caller leaves voice recording
      setIsSimulating(false);
    }, 2000);
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
          boxShadow: "0 10px 40px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
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

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
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

                return (
                  <div
                    key={msg.id}
                    style={{
                      alignSelf: isAegis ? "flex-end" : "flex-start",
                      maxWidth: "75%",
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
                        marginBottom: "2px",
                      }}
                    >
                      {isAegis ? "⚡ AEGIS AI" : activeSession.callerName}
                    </div>

                    {/* Text */}
                    <div style={{ fontSize: "13px", lineHeight: "1.4", wordBreak: "break-word" }}>
                      {msg.text}
                    </div>

                    {/* Voice Note Audio Preview */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        marginTop: "6px",
                        backgroundColor: isAegis ? "rgba(0, 0, 0, 0.2)" : "rgba(255, 255, 255, 0.08)",
                        padding: "4px 8px",
                        borderRadius: "6px",
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                      onClick={() => handlePlayMessageAudio(msg.id, msg.text, isAegis)}
                      title="Click to listen to spoken audio"
                    >
                      <span style={{ fontSize: "11px" }}>{playingAudioId === msg.id ? "⏸️" : "▶️"}</span>
                      <span style={{ fontSize: "10px", color: isAegis ? "#25D366" : "#53BDEB", fontWeight: "500", flex: 1 }}>
                        {playingAudioId === msg.id ? "Playing Voice..." : "Voice Note"}
                      </span>
                      <span style={{ fontSize: "10px", opacity: 0.7 }}>🔊</span>
                    </div>

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
                    "Boss Nani has reviewed your transcript and will contact you directly."
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
