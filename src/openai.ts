const OPENAI_BASE = "https://api.openai.com/v1";
const MODEL = process.env.OPENAI_MODEL || "gpt-5.4-nano";

const SYSTEM_PROMPT = `Jesteś parserem nazw plików filmowych (release names).
Dostajesz surową nazwę pliku torrenta i zwracasz JEDEN krótki, czytelny tytuł.

Zasady:
- Format: "Tytuł (Rok) · Jakość · Źródło · Audio" — pomijaj części, których nie ma.
- Usuń: tagi trackerów w [...], nazwy grup release, kropki/podkreślenia jako spacje, rozszerzenia (.mkv, .ts), kodeki (x264, ac3, h265 itd.).
- Zachowaj istotne: rozdzielczość (1080p, 2160p, 4K), źródło (BluRay, WEB-DL, HDTV), język/dubbing.
- Polski dubbing (DUB-PL, Dubbing PL) zapisuj DOKŁADNIE jako "(DUB) PL". Analogicznie "Lektor PL", "Napisy PL".
- NIE używaj emoji ani znaków specjalnych (: / \\ * ? " < > |) — zostaną usunięte.
- NIE wymyślaj informacji, których nie ma w nazwie.
- Zwróć TYLKO gotowy tytuł, bez cudzysłowów i komentarzy.

Przykład wejścia: "[tracker] Asterix.Misja.Kleopatra.2002.DUB-PL.1080p.BluRay.x264-GRP.mkv"
Przykład wyjścia: "Asterix: Misja Kleopatra (2002) 1080p BluRay (DUB) PL"`;

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
        max_tokens: 64,
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
