export const ADDON_NAME = "TorBox Librarian \u{1F4DA}";

// Tag a torrent with this to opt it into AI resolution (needs an OpenAI key).
export const LMT_KEYWORD = "lmt";
// Set on torrents the AI could not map to an IMDb id — surfaced for manual review.
export const NEEDS_REVIEW_KEYWORD = "needs-review";
// Prefix used to persist the audio-language flag on a torrent tag.
export const AUDIO_TAG_PREFIX = "aud:";

export interface AddonConfig {
  torboxApiKey: string;
  openaiApiKey?: string;
  openaiModel?: string;
  changedKeyword?: string;
}

const DEFAULT_CHANGED_KEYWORD = "openai-named";

export function changedKeyword(config: AddonConfig): string {
  return config.changedKeyword?.trim() || DEFAULT_CHANGED_KEYWORD;
}

export function encodeConfig(config: AddonConfig): string {
  const json = JSON.stringify(config);
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodeConfig(encoded: string): AddonConfig | null {
  try {
    const json = Buffer.from(encoded, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as Partial<AddonConfig>;
    if (!parsed || typeof parsed.torboxApiKey !== "string" || !parsed.torboxApiKey) {
      return null;
    }
    return {
      torboxApiKey: parsed.torboxApiKey.trim(),
      openaiApiKey: parsed.openaiApiKey?.trim() || undefined,
      openaiModel: parsed.openaiModel?.trim() || undefined,
      changedKeyword: parsed.changedKeyword?.trim() || undefined,
    };
  } catch {
    return null;
  }
}
