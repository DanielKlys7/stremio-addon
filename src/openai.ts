const OPENAI_BASE = "https://api.openai.com/v1";
const MODEL = process.env.OPENAI_MODEL || "gpt-5.4-nano";

export const SYSTEM_PROMPT = `You parse movie release file names.
You receive a raw torrent file name and return ONE short, readable title.

Rules:
- Format: "Title (Year) · Quality · Source · Audio" — omit any part that is absent.
- Strip: tracker tags in [...], release group names, dots/underscores (turn into spaces), file extensions (.mkv, .ts), codecs (x264, ac3, h265, etc.).
- Keep the essentials: resolution (1080p, 2160p, 4K), source (BluRay, WEB-DL, HDTV).
- If the name specifies a dubbing/voiceover (lektor) audio language, describe it and append that language's flag emoji. Examples: "DUB-PL"/"Dubbing PL" -> "(DUB) 🇵🇱"; "Lektor PL" -> "(Lektor) 🇵🇱"; "TrueFrench"/"VF"/"VF2" -> "(DUB) 🇫🇷"; "iTA" -> "(DUB) 🇮🇹"; "German" -> "(DUB) 🇩🇪"; "UKR DUB" -> "(DUB) 🇺🇦". Use the correct country flag for the language.
- If no dub/voiceover language is specified, do not add any flag.
- Do NOT invent information that is not in the name.
- Return ONLY the final title, without quotes or comments.

Example input: "[tracker] Asterix.Misja.Kleopatra.2002.DUB-PL.1080p.BluRay.x264-GRP.mkv"
Example output: "Asterix: Misja Kleopatra (2002) 1080p BluRay (DUB) 🇵🇱"`;

const cache = new Map<string, string>();

export async function prettifyName(rawName: string): Promise<string> {
  const cached = cache.get(rawName);
  if (cached) return cached;

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return fallbackClean(rawName);
  }

  try {
    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: rawName },
        ],
        temperature: 0.2,
        max_completion_tokens: 64,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI HTTP ${res.status}`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content?.trim();
    const result = text && text.length > 0 ? text : fallbackClean(rawName);

    cache.set(rawName, result);
    return result;
  } catch (err) {
    console.error("OpenAI prettify błąd, używam fallbacku:", err);
    return fallbackClean(rawName);
  }
}

const PL_FLAG = "\u{1F1F5}\u{1F1F1}";

export function withPlFlag(title: string): string {
  return title.replace(/\(?\bDUB\)?[\s._-]*PL\b/gi, `(DUB) ${PL_FLAG}`);
}

export function fallbackClean(rawName: string): string {
  return rawName
    .replace(/^\[[^\]]*\]\s*/g, "")
    .replace(/\.(mkv|mp4|avi|mov|ts|m4v|webm)(\.\w+)?$/i, "")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
