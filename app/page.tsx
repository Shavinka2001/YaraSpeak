"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  AlertCircle,
  Keyboard,
  Lightbulb,
  Loader2,
  Mic,
  Palmtree,
  RotateCcw,
  Send,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Scenarios                                                           */
/* ------------------------------------------------------------------ */

type ScenarioKey = "checkin" | "scooter" | "breakfast" | "checkout" | "free";

type Scenario = {
  key: ScenarioKey;
  emoji: string;
  label: string;
  short: string;
  /** David speaks first so the host always has something to answer. */
  opener: string;
};

const SCENARIOS: Scenario[] = [
  {
    key: "checkin",
    emoji: "🏨",
    label: "Check-in & Welcome Drink",
    short: "Check-in",
    opener:
      "Hello there! I'm David, I booked a room for the week. What a beautiful place you have here!",
  },
  {
    key: "scooter",
    emoji: "🛵",
    label: "Scooter Rental & Hiriketiya Beach",
    short: "Scooter & surf",
    opener:
      "Morning! I'd love to rent a scooter for a few days. Is it easy to ride down to Hiriketiya beach from here?",
  },
  {
    key: "breakfast",
    emoji: "🍳",
    label: "Breakfast & Wi-Fi Details",
    short: "Breakfast & Wi-Fi",
    opener:
      "Good morning! Could you tell me what time breakfast is served? And I might need the Wi-Fi password too.",
  },
  {
    key: "checkout",
    emoji: "🚕",
    label: "Check-out & Airport Taxi",
    short: "Check-out & taxi",
    opener:
      "Sadly it's my last morning. Could I settle the bill, and would you be able to arrange a taxi to Colombo airport?",
  },
  {
    key: "free",
    emoji: "🌴",
    label: "Free Conversation",
    short: "Free chat",
    opener:
      "Hello! I was just enjoying the garden. How has your day been so far?",
  },
];

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Message = {
  id: string;
  role: "host" | "david";
  text: string;
  feedback?: string;
};

type Status = "idle" | "listening" | "thinking" | "speaking";

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function YaraSpeakPage() {
  const [scenario, setScenario] = useState<ScenarioKey>("checkin");
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [handsFree, setHandsFree] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [micSupported, setMicSupported] = useState(true);
  const [ttsSupported, setTtsSupported] = useState(true);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalRef = useRef("");
  const cancelledRef = useRef(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);

  /** Mirrors of state for use inside speech-event callbacks. */
  const messagesRef = useRef<Message[]>([]);
  const scenarioRef = useRef<ScenarioKey>("checkin");
  const soundOnRef = useRef(true);
  const handsFreeRef = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    scenarioRef.current = scenario;
  }, [scenario]);
  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);
  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);

  const activeScenario = useMemo(
    () => SCENARIOS.find((item) => item.key === scenario) ?? SCENARIOS[0],
    [scenario],
  );

  /* ---------------- Text to speech ---------------- */

  const pickVoice = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;

    const score = (voice: SpeechSynthesisVoice) => {
      const name = voice.name.toLowerCase();
      let points = 0;
      if (voice.lang === "en-GB" || voice.lang === "en_GB") points += 10;
      else if (voice.lang.startsWith("en")) points += 3;
      if (/daniel|arthur|oliver|george|uk english male|british/.test(name)) {
        points += 6;
      }
      if (/google/.test(name)) points += 2;
      if (/female|zira|samantha|karen|moira/.test(name)) points -= 2;
      return points;
    };

    voiceRef.current = [...voices].sort((a, b) => score(b) - score(a))[0] ?? null;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!window.speechSynthesis) {
      setTtsSupported(false);
    } else {
      pickVoice();
      window.speechSynthesis.addEventListener("voiceschanged", pickVoice);
    }

    const SpeechRecognitionImpl =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionImpl) {
      setMicSupported(false);
      setShowTyping(true);
    }

    return () => {
      window.speechSynthesis?.removeEventListener("voiceschanged", pickVoice);
      window.speechSynthesis?.cancel();
      recognitionRef.current?.abort();
    };
  }, [pickVoice]);

  const startListeningRef = useRef<() => void>(() => {});

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return false;
    if (!soundOnRef.current || !text.trim()) return false;

    const synth = window.speechSynthesis;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voiceRef.current?.lang || "en-GB";
    if (voiceRef.current) utterance.voice = voiceRef.current;
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onstart = () => setStatus("speaking");
    utterance.onend = () => {
      setStatus("idle");
      if (handsFreeRef.current) {
        window.setTimeout(() => startListeningRef.current(), 350);
      }
    };
    utterance.onerror = () => setStatus("idle");

    setStatus("speaking");
    // Chrome occasionally needs a tick after cancel() before it will speak.
    window.setTimeout(() => synth.speak(utterance), 60);
    return true;
  }, []);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setStatus("idle");
  }, []);

  /* ---------------- Send a turn to Gemini ---------------- */

  const sendMessage = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text) return;

      setError(null);
      setInterim("");

      const history = messagesRef.current.map((message) => ({
        role: message.role === "host" ? ("user" as const) : ("model" as const),
        text: message.text,
      }));

      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "host", text },
      ]);
      setStatus("thinking");

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            history,
            scenario: scenarioRef.current,
          }),
        });

        const data = (await response.json().catch(() => null)) as
          | { reply?: string; feedback?: string; error?: string }
          | null;

        if (!response.ok || !data?.reply) {
          throw new Error(
            data?.error || "David could not reply just now. Please try again.",
          );
        }

        setMessages((prev) => [
          ...prev,
          {
            id: newId(),
            role: "david",
            text: data.reply as string,
            feedback: data.feedback || undefined,
          },
        ]);

        const spoke = speak(data.reply as string);
        if (!spoke) {
          setStatus("idle");
          if (handsFreeRef.current) {
            window.setTimeout(() => startListeningRef.current(), 300);
          }
        }
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Something went wrong.",
        );
        setStatus("idle");
      }
    },
    [speak],
  );

  /* ---------------- Speech to text ---------------- */

  const startListening = useCallback(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognitionImpl =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionImpl) {
      setMicSupported(false);
      setShowTyping(true);
      return;
    }

    window.speechSynthesis?.cancel();
    recognitionRef.current?.abort();

    const recognition = new SpeechRecognitionImpl();
    recognition.lang = "en-GB";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    finalRef.current = "";
    cancelledRef.current = false;

    recognition.onstart = () => {
      setError(null);
      setInterim("");
      setStatus("listening");
    };

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += `${transcript} `;
        else interimText += transcript;
      }
      if (finalText) finalRef.current = `${finalRef.current}${finalText}`;
      setInterim(interimText || finalRef.current.trim());
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech") {
        setError("I did not catch that. Try speaking a little louder.");
      } else if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed"
      ) {
        setError(
          "Microphone access was blocked. Allow the microphone in your browser settings, or type instead.",
        );
        setShowTyping(true);
      } else if (event.error === "audio-capture") {
        setError("No microphone was found. You can type your answer instead.");
        setShowTyping(true);
      } else if (event.error !== "aborted") {
        setError("The microphone stopped unexpectedly. Please try again.");
      }
      cancelledRef.current = true;
      setStatus("idle");
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      const captured = finalRef.current.trim();
      finalRef.current = "";
      setInterim("");

      if (cancelledRef.current) {
        setStatus("idle");
        return;
      }
      if (captured) void sendMessage(captured);
      else setStatus("idle");
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setError("The microphone is already in use. Please try again.");
      setStatus("idle");
    }
  }, [sendMessage]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  const stopListening = useCallback(() => {
    // stop() keeps whatever was heard, so the turn is still sent.
    recognitionRef.current?.stop();
  }, []);

  const handleMicPress = useCallback(() => {
    if (status === "listening") {
      stopListening();
      return;
    }
    if (status === "speaking") {
      stopSpeaking();
      return;
    }
    if (status === "thinking") return;
    startListening();
  }, [status, startListening, stopListening, stopSpeaking]);

  /* ---------------- Scenario / reset ---------------- */

  const beginScenario = useCallback(
    (key: ScenarioKey) => {
      cancelledRef.current = true;
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      window.speechSynthesis?.cancel();

      const next = SCENARIOS.find((item) => item.key === key) ?? SCENARIOS[0];
      setScenario(key);
      scenarioRef.current = key;
      setError(null);
      setInterim("");
      setTyped("");

      const opener: Message = {
        id: newId(),
        role: "david",
        text: next.opener,
      };
      setMessages([opener]);
      messagesRef.current = [opener];

      const spoke = speak(next.opener);
      if (!spoke) setStatus("idle");
    },
    [speak],
  );

  const resetConversation = useCallback(() => {
    beginScenario(scenarioRef.current);
  }, [beginScenario]);

  const handleTypedSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const value = typed.trim();
      if (!value || status === "thinking") return;
      setTyped("");
      void sendMessage(value);
    },
    [sendMessage, status, typed],
  );

  const toggleSound = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev;
      soundOnRef.current = next;
      if (!next) {
        window.speechSynthesis?.cancel();
        setStatus((current) => (current === "speaking" ? "idle" : current));
      }
      return next;
    });
  }, []);

  /* ---------------- Autoscroll ---------------- */

  useEffect(() => {
    const node = feedRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages, status, interim]);

  /* ---------------- Derived labels ---------------- */

  const statusLabel =
    status === "listening"
      ? "Listening… speak now"
      : status === "thinking"
        ? "David is thinking…"
        : status === "speaking"
          ? "David is speaking"
          : messages.length
            ? "Tap the microphone and reply"
            : "Pick a scenario to begin";

  const hasStarted = messages.length > 0;

  return (
    <main className="flex h-[100dvh] w-full flex-col bg-sand text-emerald-deep">
      {/* ---------------- Header ---------------- */}
      <header className="relative z-10 shrink-0 rounded-b-3xl bg-emerald-deep px-4 pb-5 pt-5 text-sand shadow-lg sm:px-6">
        <div className="mx-auto flex w-full max-w-2xl items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Palmtree className="h-6 w-6 text-sand" strokeWidth={1.75} />
            </span>
            <div>
              <h1 className="font-serif text-xl font-semibold leading-tight tracking-tight sm:text-2xl">
                YaraSpeak
              </h1>
              <p className="text-[11px] uppercase tracking-[0.16em] text-sand/70 sm:text-xs">
                Yara Retreat · Hiriketiya
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={toggleSound}
              aria-label={soundOn ? "Mute David" : "Unmute David"}
              title={soundOn ? "Mute David" : "Unmute David"}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20 transition hover:bg-white/20 active:scale-95"
            >
              {soundOn ? (
                <Volume2 className="h-5 w-5" strokeWidth={1.75} />
              ) : (
                <VolumeX className="h-5 w-5" strokeWidth={1.75} />
              )}
            </button>
            <button
              type="button"
              onClick={resetConversation}
              disabled={!hasStarted}
              aria-label="Start this scenario again"
              title="Start this scenario again"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20 transition hover:bg-white/20 active:scale-95 disabled:opacity-40"
            >
              <RotateCcw className="h-5 w-5" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {/* Scenario chips */}
        <div className="mx-auto mt-4 w-full max-w-2xl">
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {SCENARIOS.map((item) => {
              const isActive = item.key === scenario;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => beginScenario(item.key)}
                  title={item.label}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition active:scale-95 ${
                    isActive
                      ? "bg-sand text-emerald-deep shadow-sm"
                      : "bg-white/10 text-sand/90 ring-1 ring-white/15 hover:bg-white/20"
                  }`}
                >
                  <span aria-hidden>{item.emoji}</span>
                  <span className="whitespace-nowrap">{item.short}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* ---------------- Chat feed ---------------- */}
      <div
        ref={feedRef}
        className="yara-scroll flex-1 overflow-y-auto px-4 py-5 sm:px-6"
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
          {!hasStarted && <WelcomeCard onStart={() => beginScenario(scenario)} />}

          {hasStarted && (
            <p className="mb-1 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-soft/60">
              <span aria-hidden>{activeScenario.emoji}</span>{" "}
              {activeScenario.label}
            </p>
          )}

          {messages.map((message) =>
            message.role === "host" ? (
              <div key={message.id} className="yara-rise flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-emerald-deep px-4 py-3 text-[15px] leading-relaxed text-sand shadow-card">
                  {message.text}
                </div>
              </div>
            ) : (
              <div key={message.id} className="yara-rise flex flex-col gap-2">
                <div className="flex items-end gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-mist font-serif text-sm font-semibold text-emerald-deep">
                    D
                  </span>
                  <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-stone-line bg-white px-4 py-3 text-[15px] leading-relaxed text-emerald-deep shadow-card">
                    <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-soft/70">
                      David · UK
                    </p>
                    {message.text}
                  </div>
                </div>

                {message.feedback && (
                  <div className="ml-10 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 shadow-card">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
                      <Lightbulb className="h-3.5 w-3.5" strokeWidth={2.25} />
                      YaraSpeak Coach Tip
                    </p>
                    <p className="mt-1 text-[14px] leading-relaxed text-amber-950">
                      {message.feedback}
                    </p>
                  </div>
                )}
              </div>
            ),
          )}

          {status === "thinking" && (
            <div className="flex items-end gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-mist font-serif text-sm font-semibold text-emerald-deep">
                D
              </span>
              <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-stone-line bg-white px-4 py-4 shadow-card">
                {[0, 1, 2].map((index) => (
                  <span
                    key={index}
                    className="yara-dot h-2 w-2 rounded-full bg-emerald-soft"
                    style={{ animationDelay: `${index * 0.18}s` }}
                  />
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] leading-relaxed text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>

      {/* ---------------- Voice dock ---------------- */}
      <div className="shrink-0 border-t border-stone-line bg-sand-warm/90 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur sm:px-6">
        <div className="mx-auto w-full max-w-2xl">
          {/* Live transcript preview */}
          <div className="mb-3 min-h-[2.25rem] text-center">
            {status === "listening" ? (
              <p className="text-[15px] font-medium leading-snug text-emerald-deep">
                {interim || (
                  <span className="text-emerald-soft/60">
                    I am listening…
                  </span>
                )}
              </p>
            ) : (
              <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-emerald-soft/70">
                {statusLabel}
              </p>
            )}
          </div>

          <div className="flex items-center justify-center gap-6">
            {/* Hands-free toggle */}
            <button
              type="button"
              onClick={() => setHandsFree((prev) => !prev)}
              aria-pressed={handsFree}
              className="flex w-16 flex-col items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-emerald-soft/80 transition active:scale-95"
            >
              <span
                className={`flex h-6 w-11 items-center rounded-full p-0.5 transition ${
                  handsFree ? "bg-emerald-deep" : "bg-stone-line"
                }`}
              >
                <span
                  className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    handsFree ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </span>
              Hands free
            </button>

            {/* Mic button */}
            <div className="relative flex h-24 w-24 items-center justify-center">
              {status === "listening" && (
                <>
                  <span className="yara-ring absolute inset-0 rounded-full bg-emerald-deep/30" />
                  <span className="yara-ring yara-ring-delayed absolute inset-0 rounded-full bg-emerald-deep/20" />
                </>
              )}
              <button
                type="button"
                onClick={handleMicPress}
                disabled={status === "thinking" || !micSupported}
                aria-label={
                  status === "listening"
                    ? "Stop recording and send"
                    : status === "speaking"
                      ? "Stop David speaking"
                      : "Start speaking"
                }
                className={`relative flex h-20 w-20 items-center justify-center rounded-full text-sand shadow-lg transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 ${
                  status === "listening"
                    ? "bg-coral"
                    : status === "speaking"
                      ? "bg-emerald-soft"
                      : "bg-emerald-deep yara-breathe"
                }`}
              >
                {status === "thinking" ? (
                  <Loader2 className="h-8 w-8 animate-spin" strokeWidth={2} />
                ) : status === "listening" ? (
                  <Square className="h-7 w-7 fill-current" strokeWidth={2} />
                ) : status === "speaking" ? (
                  <span className="flex items-end gap-1" aria-hidden>
                    {[0, 1, 2, 3].map((index) => (
                      <span
                        key={index}
                        className="yara-bar block w-1.5 rounded-full bg-sand"
                        style={{
                          height: `${14 + (index % 2) * 10}px`,
                          animationDelay: `${index * 0.12}s`,
                        }}
                      />
                    ))}
                  </span>
                ) : (
                  <Mic className="h-9 w-9" strokeWidth={1.9} />
                )}
              </button>
            </div>

            {/* Keyboard toggle */}
            <button
              type="button"
              onClick={() => setShowTyping((prev) => !prev)}
              aria-pressed={showTyping}
              className={`flex w-16 flex-col items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] transition active:scale-95 ${
                showTyping ? "text-emerald-deep" : "text-emerald-soft/80"
              }`}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full ring-1 transition ${
                  showTyping
                    ? "bg-emerald-deep text-sand ring-emerald-deep"
                    : "bg-white text-emerald-deep ring-stone-line"
                }`}
              >
                <Keyboard className="h-5 w-5" strokeWidth={1.9} />
              </span>
              Type
            </button>
          </div>

          {/* Fallback text input */}
          {showTyping && (
            <form onSubmit={handleTypedSubmit} className="mt-4 flex gap-2">
              <input
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder="Type what you want to say to David…"
                aria-label="Type your reply"
                className="min-w-0 flex-1 rounded-full border border-stone-line bg-white px-4 py-3 text-[15px] text-emerald-deep placeholder:text-emerald-soft/45 focus:border-emerald-soft focus:outline-none focus:ring-2 focus:ring-emerald-soft/25"
              />
              <button
                type="submit"
                disabled={!typed.trim() || status === "thinking"}
                aria-label="Send message"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-deep text-sand shadow-md transition active:scale-95 disabled:opacity-40"
              >
                <Send className="h-5 w-5" strokeWidth={2} />
              </button>
            </form>
          )}

          {!micSupported && (
            <p className="mt-3 text-center text-[12px] leading-relaxed text-emerald-soft/80">
              Your browser does not support voice input. Use Chrome, Edge or
              Safari for the microphone, or type your answers above.
            </p>
          )}
          {micSupported && !ttsSupported && (
            <p className="mt-3 text-center text-[12px] leading-relaxed text-emerald-soft/80">
              Your browser cannot play David&apos;s voice, but you can still
              read his replies.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Welcome card                                                        */
/* ------------------------------------------------------------------ */

function WelcomeCard({ onStart }: { onStart: () => void }) {
  return (
    <div className="yara-rise rounded-3xl border border-stone-line bg-white p-6 text-center shadow-card">
      <h2 className="font-serif text-2xl font-semibold leading-tight text-emerald-deep">
        Practise English with David
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-balance text-[15px] leading-relaxed text-emerald-soft">
        David is a friendly British guest staying at Yara Retreat. Choose a
        scenario above, tap the microphone and speak to him just as you would at
        reception. After every reply you get one short coaching tip.
      </p>
      <button
        type="button"
        onClick={onStart}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-deep px-6 py-3 text-[15px] font-semibold text-sand shadow-md transition hover:bg-emerald-soft active:scale-95"
      >
        <Mic className="h-4 w-4" strokeWidth={2} />
        Start the conversation
      </button>
      <p className="mt-4 text-[12px] leading-relaxed text-emerald-soft/70">
        Tip: turn on <strong className="font-semibold">Hands free</strong> and
        the microphone reopens by itself after David finishes speaking.
      </p>
    </div>
  );
}
