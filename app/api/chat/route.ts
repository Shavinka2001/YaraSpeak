import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The model id is read from the environment so it can be swapped without a
 * code change (Google retires older model aliases from time to time).
 */
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

/**
 * Gemini 3.x models reason before answering by default, and those hidden
 * thinking tokens are drawn from maxOutputTokens: left alone they eat the
 * whole budget and the JSON comes back truncated. David only needs two
 * friendly sentences, so thinking is turned down to the lowest level.
 * The field is 3.x-only, so it is omitted for any other model.
 */
const supportsThinkingLevel = (model: string) => model.startsWith("gemini-3");
const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

type Role = "user" | "model";

type HistoryItem = {
  role: Role;
  text: string;
};

type ChatRequestBody = {
  message?: unknown;
  history?: unknown;
  scenario?: unknown;
};

const SCENARIO_CONTEXT: Record<string, string> = {
  checkin:
    "Right now David has just arrived at the retreat by tuk-tuk after a long flight. He is checking in and being offered a welcome king coconut drink.",
  scooter:
    "Right now David wants to rent a scooter for a few days and is asking about Hiriketiya beach, surfboard rental and whether the waves suit a beginner.",
  breakfast:
    "Right now David is asking about breakfast times, what is on the menu, and the Wi-Fi name and password.",
  checkout:
    "Right now David is checking out, settling the bill and asking to arrange a taxi to Colombo airport.",
  free: "Right now David is making relaxed small talk around the retreat with no particular task.",
};

const SYSTEM_PROMPT = [
  'You are David, a polite 34-year-old British tourist from Bristol, England. You are staying for a week at "Yara Retreat", a small family-run boutique retreat in Hiriketiya, a surf bay on the south coast of Sri Lanka.',
  "",
  "You are talking out loud with the host and owner of Yara Retreat, who is practising spoken English. You are warm, patient, cheerful and easy-going: a dream guest. You use natural British English (lovely, brilliant, cheers, no worries).",
  "",
  "Rules you must always follow:",
  "1. Stay in character as David the guest. Never mention that you are an AI, a model or a language coach, and never break character.",
  '2. Keep "reply" to 1-2 short, conversational sentences that sound natural when spoken aloud. No emoji, no bullet points, no markdown, no stage directions, no asterisks.',
  "3. Ask a simple follow-up question fairly often so the host keeps talking.",
  "4. Use simple, everyday vocabulary, as a kind guest would with someone who is still learning English.",
  '5. "feedback" is written by the YaraSpeak coach, not by David. It is ONE short sentence of gentle, specific, encouraging advice on the host\'s last message: grammar, polite hotel vocabulary, a more natural phrasing, or pronunciation. When you correct something, show the better phrasing in quotes.',
  '6. If the host\'s English was already good, make "feedback" a short, warm, specific compliment instead.',
  '7. Write "feedback" in plain, simple English that a learner can read quickly. Never scold.',
  '8. Return ONLY a JSON object with exactly the keys "reply" and "feedback". No extra keys, no code fences, no commentary.',
].join("\n");

function sanitizeHistory(raw: unknown): HistoryItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is HistoryItem =>
        !!item &&
        typeof item === "object" &&
        typeof (item as HistoryItem).text === "string" &&
        ((item as HistoryItem).role === "user" ||
          (item as HistoryItem).role === "model"),
    )
    .slice(-12)
    .map((item) => ({ role: item.role, text: item.text.slice(0, 2000) }));
}

/** Gemini can wrap JSON in code fences; pull the object out either way. */
function parseModelJson(
  text: string,
): { reply: string; feedback: string } | null {
  const cleaned = text
    .trim()
    .replace(/^`{3}(?:json)?/i, "")
    .replace(/`{3}$/, "")
    .trim();

  const candidates = [cleaned];
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first !== -1 && last > first) {
    candidates.push(cleaned.slice(first, last + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") {
        const reply =
          typeof parsed.reply === "string" ? parsed.reply.trim() : "";
        const feedback =
          typeof parsed.feedback === "string" ? parsed.feedback.trim() : "";
        if (reply) return { reply, feedback };
      }
    } catch {
      // try the next candidate
    }
  }

  // Truncated JSON (e.g. the model hit the token ceiling): recover the reply
  // text by hand so David never reads raw JSON out loud.
  const replyMatch = cleaned.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (replyMatch?.[1]) {
    const reply = replyMatch[1].replace(/\\n/g, " ").replace(/\\"/g, '"').trim();
    const feedbackMatch = cleaned.match(/"feedback"\s*:\s*"((?:[^"\\]|\\.)*)/);
    if (reply) {
      return {
        reply,
        feedback: feedbackMatch?.[1]?.replace(/\\"/g, '"').trim() ?? "",
      };
    }
  }

  return null;
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "GEMINI_API_KEY is not set. Add it to .env.local for local use, or to the Vercel project environment variables.",
      },
      { status: 500 },
    );
  }

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  const scenarioKey =
    typeof body.scenario === "string" && body.scenario in SCENARIO_CONTEXT
      ? body.scenario
      : "free";
  const history = sanitizeHistory(body.history);

  const contents = [
    ...history.map((item) => ({
      role: item.role,
      parts: [{ text: item.text }],
    })),
    { role: "user" as const, parts: [{ text: message.slice(0, 2000) }] },
  ];

  const payload = {
    systemInstruction: {
      role: "system",
      parts: [
        { text: `${SYSTEM_PROMPT}\n\nScenario: ${SCENARIO_CONTEXT[scenarioKey]}` },
      ],
    },
    contents,
    generationConfig: {
      temperature: 0.85,
      topP: 0.95,
      maxOutputTokens: 800,
      ...(supportsThinkingLevel(MODEL)
        ? { thinkingConfig: { thinkingLevel: "low" } }
        : {}),
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          reply: { type: "string" },
          feedback: { type: "string" },
        },
        required: ["reply", "feedback"],
      },
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_ONLY_HIGH",
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_ONLY_HIGH",
      },
    ],
  };

  const callGemini = () =>
    fetch(ENDPOINT(MODEL), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

  let response: Response;
  try {
    response = await callGemini();
    // The free flash tiers return 503 under load; one quick retry usually lands.
    if (response.status === 503) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      response = await callGemini();
    }
  } catch {
    return NextResponse.json(
      { error: "Could not reach Google AI. Check your internet connection." },
      { status: 502 },
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(
      "[YaraSpeak] Gemini error",
      response.status,
      detail.slice(0, 600),
    );
    const hint =
      response.status === 404
        ? ` The model "${MODEL}" is not available for this API key. Set GEMINI_MODEL to a model you can access, for example gemini-3.5-flash.`
        : response.status === 429
          ? " The free quota is used up for now. Wait a minute and try again."
          : response.status === 503
            ? " Google AI is busy at the moment. Please try again in a few seconds."
            : response.status === 400 || response.status === 403
              ? " Check that GEMINI_API_KEY is a valid Google AI Studio key."
              : "";
    return NextResponse.json(
      { error: `Google AI returned ${response.status}.${hint}` },
      { status: 502 },
    );
  }

  const data = await response.json().catch(() => null);
  const text: string =
    data?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part?.text ?? "")
      .join("") ?? "";

  if (!text) {
    const blocked =
      data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason;
    console.error("[YaraSpeak] Empty Gemini response", blocked);
    return NextResponse.json(
      { error: "David did not have anything to say. Please try again." },
      { status: 502 },
    );
  }

  const parsed = parseModelJson(text);
  if (!parsed) {
    // Last resort: speak the raw text and skip the tip so the lesson never stalls.
    return NextResponse.json({ reply: text.slice(0, 500), feedback: "" });
  }

  return NextResponse.json({ reply: parsed.reply, feedback: parsed.feedback });
}
