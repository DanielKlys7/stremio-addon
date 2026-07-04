import express, { Request, Response, NextFunction } from "express";
import { Manifest, Stream } from "stremio-addon-sdk";
import {
  getMyList,
  pickVideoFile,
  buildStreamUrl,
  formatBytes,
  editTorrent,
  hasTag,
  imdbIdOf,
  tagValue,
  mergeTags,
  sanitizeName,
  TorBoxTorrent,
} from "./torbox";
import { analyzeRelease } from "./openai";
import { searchImdbId } from "./cinemeta";
import {
  AddonConfig,
  ADDON_NAME,
  AUDIO_TAG_PREFIX,
  LMT_KEYWORD,
  NEEDS_REVIEW_KEYWORD,
  changedKeyword,
  decodeConfig,
} from "./config";
import { configurePage } from "./configure";

function buildManifest(configured: boolean): Manifest {
  return {
    id: "org.torbox.librarian",
    version: "1.0.0",
    name: ADDON_NAME,
    description:
      "Streamuj swoją bibliotekę TorBox w Stremio: dopasowanie po tagu IMDb, ładne nazwy generowane przez OpenAI.",
    catalogs: [],
    resources: ["stream"],
    types: ["movie"],
    idPrefixes: ["tt"],
    behaviorHints: {
      configurable: true,
      configurationRequired: !configured,
    },
  };
}

const inFlight = new Set<string>();

// How many freshly `lmt`-tagged torrents to resolve per stream request, so a
// large batch resolves progressively instead of blocking one slow response.
const RESOLVE_BUDGET = 12;

// Awaited within the request so the write lands before a serverless instance
// can freeze — otherwise the `openai-named` tag may never persist and we'd
// re-pay OpenAI on the next cold start.
async function persistName(
  config: AddonConfig,
  torrent: TorBoxTorrent,
  name: string,
  audio: string | null,
): Promise<void> {
  if (!config.openaiApiKey || !name) return;
  const keyword = changedKeyword(config);
  if (hasTag(torrent, keyword) || inFlight.has(torrent.hash)) return;

  inFlight.add(torrent.hash);
  const extra = audio ? [keyword, AUDIO_TAG_PREFIX + audio] : [keyword];
  const tags = mergeTags(torrent, ...extra);
  try {
    await editTorrent(config.torboxApiKey, torrent.id, { name, tags });
    torrent.name = name;
    torrent.tags = tags;
  } catch (err) {
    console.error(`editTorrent ${torrent.id}:`, err);
  } finally {
    inFlight.delete(torrent.hash);
  }
}

// AI Mode: map a torrent tagged `lmt` to a real IMDb id (OpenAI parse + Cinemeta
// lookup) and persist it as a tag so future stream requests can match it. On
// failure it is tagged `needs-review` so we don't keep paying to retry it.
async function resolveImdb(
  config: AddonConfig,
  torrent: TorBoxTorrent,
): Promise<void> {
  if (!config.openaiApiKey) return;
  if (!hasTag(torrent, LMT_KEYWORD)) return;
  if (imdbIdOf(torrent) || hasTag(torrent, NEEDS_REVIEW_KEYWORD)) return;
  if (inFlight.has(torrent.hash)) return;

  inFlight.add(torrent.hash);
  try {
    const file = pickVideoFile(torrent);
    const source = file?.short_name ?? file?.name ?? torrent.name;
    const { search_title, year } = await analyzeRelease(source, {
      apiKey: config.openaiApiKey,
      model: config.openaiModel,
    });
    const hit = await searchImdbId(search_title, year);
    const tags = mergeTags(torrent, hit ? hit.id : NEEDS_REVIEW_KEYWORD);
    await editTorrent(config.torboxApiKey, torrent.id, { tags });
    torrent.tags = tags;
  } catch (err) {
    console.error(`resolveImdb ${torrent.id}:`, err);
  } finally {
    inFlight.delete(torrent.hash);
  }
}

async function handleStream(
  config: AddonConfig,
  type: string,
  imdbId: string,
): Promise<{ streams: Stream[]; cacheMaxAge?: number }> {
  if (type !== "movie") {
    return { streams: [] };
  }

  const torrents = await getMyList(config.torboxApiKey);

  // AI Mode: give `lmt`-tagged torrents a real IMDb id so they become matchable.
  if (config.openaiApiKey) {
    const pending = torrents
      .filter(
        (t) =>
          hasTag(t, LMT_KEYWORD) &&
          !imdbIdOf(t) &&
          !hasTag(t, NEEDS_REVIEW_KEYWORD),
      )
      .slice(0, RESOLVE_BUDGET);
    await Promise.all(pending.map((t) => resolveImdb(config, t)));
  }

  const matches = torrents.filter(
    (t) =>
      hasTag(t, imdbId) && (t.download_present ?? t.download_finished ?? true),
  );

  const keyword = changedKeyword(config);
  const streams = await Promise.all(
    matches.map(async (torrent): Promise<Stream | null> => {
      const file = pickVideoFile(torrent);
      if (!file) return null;

      let display_name: string;
      let audio: string | null;

      if (config.openaiApiKey && hasTag(torrent, keyword)) {
        // Already named — reuse what we persisted, no OpenAI call.
        display_name = torrent.name;
        audio = tagValue(torrent, AUDIO_TAG_PREFIX) ?? null;
      } else {
        const source = file.short_name ?? file.name ?? torrent.name;
        const release = await analyzeRelease(source, {
          apiKey: config.openaiApiKey,
          model: config.openaiModel,
        });
        display_name = release.display_name;
        audio = release.audio;
        await persistName(config, torrent, sanitizeName(display_name), audio);
      }

      const title = [display_name, audio, formatBytes(file.size)]
        .filter(Boolean)
        .join("\n");
      return {
        url: buildStreamUrl(config.torboxApiKey, torrent.id, file.id),
        name: ADDON_NAME,
        title,
      };
    }),
  );

  return {
    streams: streams.filter((s): s is Stream => s !== null),
    cacheMaxAge: 60,
  };
}

const app = express();

app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  next();
});

app.get("/", (_req, res) => res.redirect("/configure"));

app.get("/configure", (_req, res) => {
  res.type("html").send(configurePage(null));
});

// Everything below is scoped to an encoded config in the URL path.
function withConfig(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const config = decodeConfig(req.params.config);
  if (!config) {
    res.status(400).send("Nieprawidłowa konfiguracja addonu.");
    return;
  }
  res.locals.config = config as AddonConfig;
  next();
}

app.get("/:config/configure", (req, res) => {
  res.type("html").send(configurePage(decodeConfig(req.params.config)));
});

app.get("/:config/manifest.json", withConfig, (_req, res) => {
  res.json(buildManifest(true));
});

app.get("/:config/stream/:type/:id.json", withConfig, async (req, res) => {
  const config = res.locals.config as AddonConfig;
  try {
    const result = await handleStream(config, req.params.type, req.params.id);
    res.json(result);
  } catch (err) {
    console.error("Błąd handlera streamów:", err);
    res.json({ streams: [] });
  }
});

export default app;
