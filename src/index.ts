import express from "express";
import {
  addonBuilder,
  getRouter,
  // publishToCentral,
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
import { prettifyName, withPlFlag } from "./openai";

// Flaga oznaczająca, że torrent ma już wygenerowaną ładną nazwę (siedzi w tagach,
// NIE w nazwie — dzięki temu nie wycieka do Stremio). Konfigurowalna przez .env.
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

// Dedup w ramach sesji: hashe torrentów już przetworzonych (mylist bywa nieświeży,
// więc nie polegamy tylko na tagu-fladze). In-flight chroni przed równoległym
// podwójnym wywołaniem OpenAI dla tego samego torrenta.
const processed = new Set<string>();
const inFlight = new Set<string>();

// Generuje ładną nazwę i zapisuje ją na TorBoxie razem z flagą. Mutuje obiekt
// torrenta lokalnie, żeby od razu zwrócić ładną nazwę do Stremio.
async function ensurePrettyName(torrent: TorBoxTorrent): Promise<void> {
  if (hasTag(torrent, CHANGED_KEYWORD) || processed.has(torrent.hash)) return;
  if (inFlight.has(torrent.hash)) return;

  inFlight.add(torrent.hash);
  try {
    const source = pickVideoFile(torrent)?.name ?? torrent.name;
    const pretty = sanitizeName(await prettifyName(source));
    if (!pretty) return;

    const tags = mergeTags(torrent, CHANGED_KEYWORD);
    await editTorrent(torrent.id, { name: pretty, tags });

    // Zaktualizuj stan lokalny (cache mylist trzyma tę samą referencję obiektu).
    torrent.name = pretty;
    torrent.tags = tags;
    processed.add(torrent.hash);
  } catch (err) {
    console.error(`Nie udało się nazwać torrenta ${torrent.id}:`, err);
  } finally {
    inFlight.delete(torrent.hash);
  }
}

builder.defineStreamHandler(async (args: { type: ContentType; id: string }) => {
  if (args.type !== "movie") {
    return { streams: [] };
  }

  const imdbId = args.id; // np. "tt0250223"

  try {
    const torrents = await getMyList();

    const matches = torrents.filter(
      (t) =>
        hasTag(t, imdbId) &&
        (t.download_present ?? t.download_finished ?? true),
    );

    // Wygeneruj/zapisz ładne nazwy dla dopasowań (równolegle).
    await Promise.all(matches.map(ensurePrettyName));

    const streams: Stream[] = [];
    for (const torrent of matches) {
      const file = pickVideoFile(torrent);
      if (!file) continue;

      streams.push({
        url: buildStreamUrl(torrent.id, file.id),
        name: "TorBox",
        // torrent.name jest już ładne (ASCII); flagę PL dokładamy dopiero tutaj.
        // IMDb id i flaga-keyword siedzą w tagach, nie w nazwie.
        title: `${withPlFlag(torrent.name)}\n${formatBytes(file.size)}`,
      });
    }

    return { streams, cacheMaxAge: 60 };
  } catch (err) {
    console.error("Błąd handlera streamów:", err);
    return { streams: [] };
  }
});

// Sekret wymagany w ścieżce URL — bez niego addon zwraca 403. Instalujesz w
// Stremio adres: https://<host>/<ADDON_SECRET>/manifest.json
const SECRET = process.env.ADDON_SECRET;
if (!SECRET) {
  throw new Error("Brak ADDON_SECRET. Ustaw go w .env / w zmiennych środowiskowych.");
}

const app = express();
const router = getRouter(builder.getInterface());

// Health check (Koyeb / uptime pinger) — nic nie ujawnia.
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

const port = Number(process.env.PORT) || 7000;
app.listen(port, () => {
  console.log(`Addon na porcie ${port}`);
  console.log(`Instalka: http://127.0.0.1:${port}/${SECRET}/manifest.json`);
});
// publishToCentral(...) // NIE publikuj: token TorBoxa jest w URL-u streamu
