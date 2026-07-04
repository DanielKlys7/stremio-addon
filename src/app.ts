import express from "express";
import {
  addonBuilder,
  getRouter,
  Manifest,
  Stream,
  ContentType,
} from "stremio-addon-sdk";
import {
  getMyList,
  pickVideoFile,
  buildStreamUrl,
  formatBytes,
  editTorrent,
  hasTag,
  mergeTags,
  sanitizeName,
  TorBoxTorrent,
} from "./torbox";
import { analyzeRelease } from "./openai";

const CHANGED_KEYWORD = process.env.TORBOX_CHANGED_KEYWORD || "openai-named";

const manifest: Manifest = {
  id: "org.myexampleaddon",
  version: "1.0.0",

  name: "FTP daniel's speciality pizza \u{1F60E}",
  description:
    "Streamy z TorBoxa: dopasowanie po tagu IMDb, ładne nazwy generowane przez OpenAI",

  catalogs: [],
  resources: ["stream"],
  types: ["movie"],
  idPrefixes: ["tt"],
};

const builder = new addonBuilder(manifest);

const inFlight = new Set<string>();

function persistName(torrent: TorBoxTorrent, name: string): void {
  if (!process.env.OPENAI_API_KEY || !name) return;
  if (hasTag(torrent, CHANGED_KEYWORD) || inFlight.has(torrent.hash)) return;

  inFlight.add(torrent.hash);
  const tags = mergeTags(torrent, CHANGED_KEYWORD);
  editTorrent(torrent.id, { name, tags })
    .then(() => {
      torrent.name = name;
      torrent.tags = tags;
    })
    .catch((err) => console.error(`editTorrent ${torrent.id}:`, err))
    .finally(() => inFlight.delete(torrent.hash));
}

builder.defineStreamHandler(async (args: { type: ContentType; id: string }) => {
  if (args.type !== "movie") {
    return { streams: [] };
  }

  const imdbId = args.id;

  try {
    const torrents = await getMyList();

    const matches = torrents.filter(
      (t) =>
        hasTag(t, imdbId) &&
        (t.download_present ?? t.download_finished ?? true),
    );

    const streams = await Promise.all(
      matches.map(async (torrent): Promise<Stream | null> => {
        const file = pickVideoFile(torrent);
        if (!file) return null;

        const source = file.short_name ?? file.name ?? torrent.name;
        const { display_name, audio } = await analyzeRelease(source);
        persistName(torrent, sanitizeName(display_name));

        const title = [display_name, audio, formatBytes(file.size)]
          .filter(Boolean)
          .join("\n");
        return {
          url: buildStreamUrl(torrent.id, file.id),
          name: "FTP daniel's speciality pizza \u{1F60E}",
          title,
        };
      }),
    );

    return {
      streams: streams.filter((s): s is Stream => s !== null),
      cacheMaxAge: 60,
    };
  } catch (err) {
    console.error("Błąd handlera streamów:", err);
    return { streams: [] };
  }
});

export const SECRET = process.env.ADDON_SECRET;
if (!SECRET) {
  throw new Error(
    "Brak ADDON_SECRET. Ustaw go w .env / w zmiennych środowiskowych.",
  );
}

const app = express();
const router = getRouter(builder.getInterface());

app.get("/", (_req, res) => res.status(200).send("OK"));

app.use(
  "/:secret",
  (req, res, next) => {
    if (req.params.secret !== SECRET) {
      res.status(403).send("Forbidden");
      return;
    }
    next();
  },
  router,
);

export default app;
