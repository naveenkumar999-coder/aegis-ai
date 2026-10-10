export interface CallMessage {
  id: string;
  sender: "caller" | "aegis";
  text: string;
  timestamp: string;
  status?: "sent" | "delivered" | "read";
}

export interface CallSession {
  id: string;
  callerName: string;
  callerNumber: string;
  avatarColor: string;
  timestamp: string;
  duration: string;
  unread: boolean;
  status: "intercepted" | "completed" | "ongoing";
  urgency: "urgent" | "normal" | "inquiry";
  summary?: string;
  messages: CallMessage[];
}

const DEFAULT_CALL_SESSIONS: CallSession[] = [
  {
    id: "call-101",
    callerName: "Rajesh (Project Teammate)",
    callerNumber: "+91 98765 43210",
    avatarColor: "#25D366",
    timestamp: "Today, 10:42 AM",
    duration: "0:25",
    unread: true,
    status: "intercepted",
    urgency: "urgent",
    summary: "Voice recording: Are you coming to the lab seminar at 2 PM? Review slides before prof arrives.",
    messages: [
      {
        id: "msg-1",
        sender: "aegis",
        text: "Boss is busy right now. If you're okay, please leave a voice recording.",
        timestamp: "10:42 AM",
        status: "read",
      },
      {
        id: "msg-2",
        sender: "caller",
        text: "Hey Nani, this is Rajesh. Are you coming to the lab seminar at 2 PM? We need to review the presentation slides before the professor arrives. Call me back when free.",
        timestamp: "10:42 AM",
      },
    ],
  },
  {
    id: "call-102",
    callerName: "Amazon Delivery Executive",
    callerNumber: "+91 91234 56789",
    avatarColor: "#00A884",
    timestamp: "Yesterday, 3:15 PM",
    duration: "0:20",
    unread: false,
    status: "completed",
    urgency: "normal",
    summary: "Voice recording: Parcel arrived, kept at main gate security desk.",
    messages: [
      {
        id: "msg-6",
        sender: "aegis",
        text: "Boss is busy right now. If you're okay, please leave a voice recording.",
        timestamp: "3:15 PM",
        status: "read",
      },
      {
        id: "msg-7",
        sender: "caller",
        text: "Sir, your Amazon delivery parcel has arrived. I have kept it safely with the security desk.",
        timestamp: "3:15 PM",
      },
    ],
  },
  {
    id: "call-103",
    callerName: "Swiggy Delivery Partner",
    callerNumber: "+91 80012 34567",
    avatarColor: "#128C7E",
    timestamp: "28 Sep, 11:20 AM",
    duration: "0:18",
    unread: false,
    status: "completed",
    urgency: "normal",
    summary: "Voice recording: Waiting outside building, please collect order.",
    messages: [
      {
        id: "msg-10",
        sender: "aegis",
        text: "Boss is busy right now. If you're okay, please leave a voice recording.",
        timestamp: "11:20 AM",
        status: "read",
      },
      {
        id: "msg-11",
        sender: "caller",
        text: "Sir, your food order from Swiggy is at your apartment lobby.",
        timestamp: "11:20 AM",
      },
    ],
  },
];

const STORAGE_KEY = "aegis_call_intercept_sessions";

export function getCallSessions(): CallSession[] {
  if (typeof window === "undefined") return DEFAULT_CALL_SESSIONS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_CALL_SESSIONS));
      return DEFAULT_CALL_SESSIONS;
    }
    return JSON.parse(raw);
  } catch {
    return DEFAULT_CALL_SESSIONS;
  }
}

export function saveCallSessions(sessions: CallSession[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (err) {
    console.warn("Failed to persist call sessions:", err);
  }
}

export function markSessionAsRead(sessionId: string): CallSession[] {
  const list = getCallSessions().map((s) => (s.id === sessionId ? { ...s, unread: false } : s));
  saveCallSessions(list);
  return list;
}

export function addCallMessage(sessionId: string, sender: "caller" | "aegis", text: string): CallSession[] {
  const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const list = getCallSessions().map((s) => {
    if (s.id === sessionId) {
      const newMsg: CallMessage = {
        id: "msg-" + Date.now(),
        sender,
        text,
        timestamp: now,
        status: sender === "aegis" ? "read" : undefined,
      };
      return {
        ...s,
        messages: [...s.messages, newMsg],
      };
    }
    return s;
  });
  saveCallSessions(list);
  return list;
}

export function createNewCallSession(callerName: string, callerNumber: string): CallSession {
  const id = "call-" + Date.now();
  const timeStr = "Today, " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const colors = ["#25D366", "#00A884", "#128C7E", "#34B7F1", "#075E54"];
  const avatarColor = colors[Math.floor(Math.random() * colors.length)];

  const newSession: CallSession = {
    id,
    callerName: callerName || callerNumber || "Unknown Caller",
    callerNumber: callerNumber || "Private Number",
    avatarColor,
    timestamp: timeStr,
    duration: "Live",
    unread: true,
    status: "ongoing",
    urgency: "normal",
    messages: [
      {
        id: "msg-welcome-" + Date.now(),
        sender: "aegis",
        text: "Boss is busy right now. If you're okay, please leave a voice recording.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        status: "read",
      },
    ],
  };

  const list = [newSession, ...getCallSessions()];
  saveCallSessions(list);
  return newSession;
}
