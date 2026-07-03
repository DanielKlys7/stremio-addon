# TorBox Librarian — a private Stremio addon for your TorBox library

Turn your personal [TorBox](https://torbox.app) library into clean, auto-matched
streams inside [Stremio](https://www.stremio.com) — no manual bookkeeping.

You drop a torrent into TorBox. The addon figures out **what movie it is**,
gives it a **human-readable name**, and makes it show up under the right title
in Stremio. That's it.

---

## The problem

TorBox is a great debrid/seedbox, but its file names look like this:

```
[superseed.byethost7.com] Asterix.i.Obelix.Misja.Kleopatra.2002.DUB-PL.m1080p.BluRay.x264.ac3-GUN.mkv.ts
```

To watch that in Stremio you'd normally have to know the movie's IMDb id, tag
the file by hand, and live with the ugly release name on the stream list.

**TorBox Librarian automates all of it.**

---

## How it works

The addon keeps a tiny **state machine on your TorBox tags**. Each torrent moves
through it automatically:

```
new torrent ──▶ [resolve] ──▶ tt#######  ──▶ [name] ──▶ clean title
             (find IMDb id)   (matched)     (OpenAI)     shown in Stremio
```

### 1. Resolution — "what movie is this?"

A background sweep looks at torrents that don't have an IMDb id yet and resolves
them so you never have to look one up manually:

- **OpenAI (function calling)** parses the messy release name into a clean
  `{ title, year }` and calls a `search_imdb(title, year)` tool.
- The tool queries a real movie database (**OMDb**), so the **IMDb id comes from
  the database, never from the model** — no hallucinated ids.
- The model reconciles localized titles (e.g. Polish *"Misja Kleopatra"* ↔
  *"Mission Cleopatra"*) and picks the best candidate.
- The resolved `tt#######` is written back to the torrent as a **tag**.
- Low confidence? The torrent is tagged `needs-review` instead of being matched
  to the wrong title.

### 2. Naming — "make it readable"

The first time a matched torrent is served, its ugly file name is turned into a
clean title via OpenAI (e.g. `Asterix i Obelix: Misja Kleopatra (2002) 1080p
BluRay (DUB) 🇵🇱`) and stored back on TorBox. A marker tag records that it's
done, so the model is **called at most once per torrent**.

### 3. Serving — "stream it in Stremio"

When Stremio requests `/stream/movie/tt0250223.json`, the addon lists your
library, matches by the `tt` **tag**, picks the best video file, and returns a
direct TorBox CDN link. The IMDb id and internal flags live in tags, never in
the visible name — so nothing leaks into the Stremio UI.

---

## Tag vocabulary

The entire state lives in TorBox tags — inspectable and editable by hand at any
time:

| Tag             | Meaning                                                        |
| --------------- | -------------------------------------------------------------- |
| `tt#######`     | Matched to this IMDb title (the key used for Stremio matching) |
| `openai-named`  | A clean name has already been generated (don't re-call OpenAI) |
| `needs-review`  | Auto-resolution wasn't confident — check it manually           |
| `no-match`      | Resolution ran and found nothing (won't retry endlessly)       |

A manually-added `tt` tag always wins — the automation never overrides you.

---

## Features

- 🎬 **Zero-config matching** — drop a file in TorBox, it appears under the right
  movie in Stremio.
- 🤖 **AI naming** — release-name soup → clean, readable titles.
- 🔎 **Automatic IMDb resolution** — no more copy-pasting `tt` ids.
- 🇵🇱 **Localized audio markers** — e.g. `DUB-PL` rendered as `(DUB) 🇵🇱`.
- 🔒 **Private by design** — a secret in the URL path; only you can query it.
- 💸 **Cheap to run** — the LLM touches each torrent once; results are cached on
  TorBox itself.
- ☁️ **Deploy free** — runs as a Vercel serverless function or a Docker container.

---

## Architecture

- **`src/torbox.ts`** — minimal TorBox client (list, edit tags/name, build stream
  URLs) + tag helpers.
- **`src/openai.ts`** — naming and IMDb-resolution logic (OpenAI + OMDb lookup).
- **`src/app.ts`** — the Stremio addon (manifest + stream handler) wrapped in an
  Express app, behind a secret-path guard.
- **`src/index.ts`** — local/container entrypoint (`app.listen`).
- **`api/index.ts`** — Vercel serverless entrypoint (exports the same app).

Built on [`stremio-addon-sdk`](https://github.com/Stremio/stremio-addon-sdk),
TypeScript, and Node 22. No database — TorBox tags *are* the database.

---

## Getting started

### Deploy on Vercel (free)

1. Fork this repo and import it on [vercel.com](https://vercel.com).
2. Set the environment variables below (Production).
3. Deploy — you get `https://<your-app>.vercel.app`.
4. In Stremio → Add-ons → paste:
   ```
   https://<your-app>.vercel.app/<ADDON_SECRET>/manifest.json
   ```

### Or run with Docker

```bash
docker build -t torbox-librarian .
docker run -p 7000:7000 --env-file .env torbox-librarian
```

### Or locally

```bash
npm install
cp .env.example .env   # fill it in
npm run dev
```

---

## Configuration

| Variable                 | Required | Description                                                       |
| ------------------------ | -------- | ----------------------------------------------------------------- |
| `ADDON_SECRET`           | ✅       | Random secret required in the URL path. Acts as your private key. |
| `TORBOX_API_KEY`         | ✅       | Your TorBox API key.                                              |
| `OPENAI_API_KEY`         | ✅\*     | For naming and IMDb resolution. Without it, a regex fallback runs. |
| `OMDB_API_KEY`           | ✅\*     | Movie database used to fetch the real IMDb id.                    |
| `OPENAI_MODEL`           | ⬜       | Defaults to a small, cheap model.                                 |
| `TORBOX_CHANGED_KEYWORD` | ⬜       | The "already named" marker tag (default `openai-named`).          |

\* Required for the AI features; the addon still serves already-matched files
without them.

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

---

## Security & privacy

- The addon is reachable only under `/<ADDON_SECRET>/…`; any other path returns
  `403`. Treat that URL like a password — anyone with it can use your TorBox and
  your OpenAI budget.
- All keys are read from environment variables and never committed.
- Stream URLs embed a TorBox token, so **keep the instance private** — don't
  publish it to the Stremio central catalog.

---

## Roadmap

- 📺 TV series support (season/episode resolution).
- 🧾 A small `/review` page for `needs-review` torrents.
- 🌐 Pluggable id sources (TMDB, Cinemeta) alongside OMDb.
- 🔁 Configurable resolution triggers (cron vs. on-demand).

---

## Disclaimer

A personal tool for organizing **your own** TorBox library. You are responsible
for what you store and stream through your account. Not affiliated with TorBox,
Stremio, IMDb, or OpenAI.
