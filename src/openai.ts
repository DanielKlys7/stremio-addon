const OPENAI_BASE = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-5-nano-2025-08-07";

export const SYSTEM_PROMPT = `You parse a movie release file name into structured JSON.

Fields:
- "display_name": a short human-readable title, format "Title (Year) Quality Source", WITHOUT any audio/language marker (that goes in "audio"). Strip tracker tags [...], release-group names, dots/underscores (as spaces), extensions (.mkv/.ts), codecs (x264, ac3, h265...), and cryptic provider codes (CR, iT, AMZN, GUN, GRP, OT). Keep generic sources (BluRay, WEB-DL, HDTV, BRRip) and resolution (1080p, 2160p, 4K).
- The title in "display_name" MUST be kept EXACTLY as written in the file name — do NOT translate it. A Polish release title stays Polish (e.g. "Asterix i Obelix: Misja Kleopatra"), a French one stays French, a Russian one stays Russian. If the same title appears twice in different scripts (e.g. Cyrillic next to Latin), keep the Latin-script one and drop the duplicate.
- "search_title": the movie's widely-known English / international title (you MAY translate here — this field is used only for a metadata lookup), without year, quality, tags, or audio.
- "year": the release year as an integer, or null.
- "audio": the audio-language marker, or null:
    * If multi-language ("MULTi"/"MULTI"/"DUAL"), set "[MULTi]".
    * Else if the name explicitly marks a dubbing (DUB, Dubbing, Dubbed, Dabing, "DL"=German dual, TrueFrench, VF/VF2) or a voiceover/lektor (Lektor, "от <group>"), set "(DUB) <flag>" or "(Lektor) <flag>" using the language's FLAG EMOJI — never a letter code. Examples: DUB-PL->"(DUB) 🇵🇱", Lektor PL->"(Lektor) 🇵🇱", TrueFrench/VF->"(DUB) 🇫🇷", German DL->"(DUB) 🇩🇪", Hindi Dubbed->"(DUB) 🇮🇳", CZ Dabing->"(DUB) 🇨🇿", "от New-Team"->"(Lektor) 🇷🇺".
    * Otherwise null. A bare language word (SPANISH, JAPANESE, iTA) with no dub/lektor keyword is the original language — do not flag it, and never invent a flag.

Do not invent information that is not in the file name.`;

export interface Release {
  display_name: string;
  search_title: string;
  year: number | null;
  audio: string | null;
}

const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "release",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        display_name: { type: "string" },
        search_title: { type: "string" },
        year: { type: ["integer", "null"] },
        audio: { type: ["string", "null"] },
      },
      required: ["display_name", "search_title", "year", "audio"],
    },
  },
} as const;

const cache = new Map<string, Release>();

export async function analyzeRelease(
  rawName: string,
  opts: { apiKey?: string; model?: string } = {},
): Promise<Release> {
  const model = opts.model || DEFAULT_MODEL;
  const cacheKey = `${model}:${rawName}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const key = opts.apiKey;
  if (!key) return fallbackRelease(rawName);

  try {
    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: rawName },
        ],
        reasoning_effort: "minimal",
        max_completion_tokens: 256,
        prompt_cache_key: "stremio-namer-v1",
        response_format: RESPONSE_FORMAT,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI HTTP ${res.status}`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) return fallbackRelease(rawName);

    const parsed = JSON.parse(text) as Release;
    const result: Release = {
      display_name: parsed.display_name?.trim() || fallbackClean(rawName),
      search_title: parsed.search_title?.trim() || fallbackClean(rawName),
      year: typeof parsed.year === "number" ? parsed.year : null,
      audio: parsed.audio?.trim() || null,
    };
    cache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.error("OpenAI analyzeRelease błąd, używam fallbacku:", err);
    return fallbackRelease(rawName);
  }
}

function fallbackRelease(rawName: string): Release {
  const clean = fallbackClean(rawName);
  const year = clean.match(/\b(19|20)\d{2}\b/);
  return {
    display_name: clean,
    search_title: clean,
    year: year ? Number(year[0]) : null,
    audio: null,
  };
}

export function fallbackClean(rawName: string): string {
  return rawName
    .replace(/^\[[^\]]*\]\s*/g, "")
    .replace(/\.(mkv|mp4|avi|mov|ts|m4v|webm)(\.\w+)?$/i, "")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
