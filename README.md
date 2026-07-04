# TorBox Librarian — a private Stremio addon for your TorBox library

Turn your personal [TorBox](https://torbox.app) library into clean, auto-matched streams inside [Stremio](https://www.stremio.com) — no manual bookkeeping.

---

## The Problem: "The Grandparent Factor"

We all know the struggle: you have a perfectly good torrent in your TorBox library, but its file name is a mess of codecs and release group tags. If you want to share your library with family (like a grandparent), you can't expect them to hunt through file lists or deal with "No streams found" errors because a specific language version wasn't scraped by public addons.

**TorBox Librarian solves this.** It bridges the gap between your raw files and Stremio’s clean UI, allowing you to manually tag "edge case" files (like rare language dubs) so they appear perfectly linked to the right movie.

---

## How it works

The addon uses your TorBox tags as a state machine. It only processes files you mark for attention.

1.  **Mark the file** with one of two tags on TorBox:
    - **Manual Mode**: add the IMDb ID directly as a tag (e.g., `tt0250223`). The addon respects your manual override above all else — no OpenAI key needed.
    - **AI Mode**: add the tag `lmt` (requires an OpenAI key). The addon parses the file name with OpenAI, looks the title up against the **Cinemeta** catalog to get the real IMDb ID, and **writes that `tt…` ID back onto the torrent as a tag**. From then on it behaves exactly like a manually-tagged file.

    > Tagging IMDb IDs by hand is fine for a handful of files (3–5), but it doesn't scale — doing it for 50+ files quickly becomes tedious. That's where **AI Mode** pays off: tag them all `lmt` and it resolves the IDs for you. If the AI can't confidently match a file, it tags it `needs-review` instead of guessing, so you can fix those few by hand.
2.  **Serving**: When Stremio requests a movie, the addon returns every downloaded torrent tagged with that IMDb ID, with a clean title (generated once by OpenAI and cached back onto the torrent). Stremio's own Cinemeta metadata handles the rest of the UI.

---

## Configuration

There are **no server-side secrets**. Host the addon once and share it — every user opens the
`/configure` page, pastes their own keys, and gets a private install URL. The keys are encoded
into the URL path itself (`https://<host>/<config>/manifest.json`), so the URL _is_ the secret.

| Field            | Required | Description                                               |
| :--------------- | :------- | :-------------------------------------------------------- |
| TorBox API key   | ✅       | Your TorBox API key.                                      |
| OpenAI API key   | ⬜       | Optional. If provided, enables AI auto-naming/resolution. |
| OpenAI model     | ⬜       | Optional. `gpt-5-nano` (default) or `gpt-5.4-nano`.       |

> Why the path and not `?query=`? Stremio does not forward query strings from `manifest.json`
> to the follow-up `/stream/...` requests, so configuration must live in the URL path.

### Manual Mode

You don't need AI to use this! You can skip the OpenAI key entirely.

- Simply tag a torrent in TorBox with the IMDb ID (e.g., `tt0250223`).
- The addon will pick it up and present it in Stremio under that movie's official title. This is perfect for those "special" files (DUB/SUB versions) that scrapers usually ignore.

### Automatic Mode (AI)

Requires an OpenAI key. Tag a torrent `lmt` and the addon resolves its IMDb ID for you:

- On the next stream request it parses the name, matches it via Cinemeta, and writes the `tt…` ID back as a tag. Then the movie appears in Stremio automatically.
- Resolution happens in batches (a few files per request) to keep responses fast, so a large freshly-tagged library fills in over a handful of opens rather than all at once.
- Files the AI can't match are tagged `needs-review` (not retried) so you can spot and fix them.

**Costs:**
Naming your entire library of 1000 movies costs about 6 cents. Both the resolved IMDb ID and the generated name are written back onto the TorBox torrent (as tags), so you only pay once per file — subsequent requests reuse the cached result and skip OpenAI entirely.

| Model          | Cost / 1k requests |
| :------------- | :----------------- |
| `gpt-5-nano`   | **$0.059**         |
| `gpt-5.4-nano` | **$0.208**         |

**Naming examples: gpt-5-nano vs gpt-5.4-nano**

| Torrent Name                                       | Model: gpt-5-nano                        | Model: gpt-5.4-nano                               |
| :------------------------------------------------- | :--------------------------------------- | :------------------------------------------------ |
| `Asterix.i.Obelix.Misja.Kleopatra.2002.DUB-PL.mkv` | Asterix i Obelix: Misja Kleopatra (2002) | Asterix i Obelix: Misja Kleopatra (2002) (DUB) 🇵🇱 |
| `Django.Unchained.2012.Lektor.PL.1080p.BluRay`     | Django Unchained (2012)                  | Django Unchained (2012) (Lektor) 🇵🇱               |
| `Dune.Part.Two.2024.MULTi.TrueFrench.2160p`        | Dune Part Two (2024)                     | Dune Part Two (2024) [MULTi]                      |
| `Il.Buono.il.Brutto.il.Cattivo.1966.iTA.mkv`       | Il Buono, il Brutto, il Cattivo (1966)   | Il Buono il Brutto il Cattivo 1966 iTA            |
| `Das.Boot.1981.German.DL.1080p.BluRay`             | Das Boot (1981)                          | Das Boot (1981) (DUB) 🇩🇪                          |
| `El.Laberinto.del.Fauno.2006.SPANISH.mkv`          | El Laberinto del Fauno (2006)            | El Laberinto del Fauno (2006)                     |
| `Дюна.2021.UKR.DUB.1080p.WEB-DL.mkv`               | Дюна (2021)                              | Дюна.2021.UKR.DUB.1080p WEB-DL (DUB) 🇺🇦           |
| `Avengers.Endgame.2019.Hindi.Dubbed.mkv`           | Avengers Endgame (2019)                  | Avengers Endgame (2019) (DUB) 🇮🇳                  |
| `Kolja.1996.CZ.Dabing.1080p.BluRay`                | Kolja (1996)                             | Kolja (1996) (DUB) 🇨🇿                             |
| `Гражданин-мститель Citizen Vigilante (2026)`      | Citizen Vigilante (2026)                 | Citizen Vigilante (2026) (Lektor) 🇷🇺              |

---

## Getting started

### Deploy on Vercel (free)

1. Fork this repo and import it on [vercel.com](https://vercel.com).
2. Deploy — no environment variables needed. You get `https://<your-app>.vercel.app`.
3. Share `https://<your-app>.vercel.app/configure` with anyone who wants to use it.

### Self-host with Docker

Prefer to run it on your own box (home server, VPS, Raspberry Pi)? The repo ships a
multi-stage [`Dockerfile`](./Dockerfile), so you don't need Vercel at all.

**Build & run:**

```bash
docker build -t torbox-librarian .
docker run -d --name torbox-librarian -p 7000:8000 --restart unless-stopped torbox-librarian
```

The container listens on `8000` internally (override with `-e PORT=...`). The command above
maps it to `7000` on the host, so the addon is reachable at `http://<host>:7000/configure`.

**Or with Docker Compose:**

```yaml
services:
  torbox-librarian:
    build: .
    # or: image: torbox-librarian
    ports:
      - "7000:8000"
    restart: unless-stopped
```

```bash
docker compose up -d --build
```

There are **no environment variables to set** — every user configures their own keys on the
`/configure` page. If you expose the addon to the internet, put it behind a reverse proxy
(Caddy, Nginx, Traefik) with HTTPS, since Stremio requires `https://` for remote hosts.

### Install (for each user)

1. Open `https://<your-app>.vercel.app/configure`.
2. Paste your **TorBox API key** (and optionally an OpenAI key + model).
3. Click **Install in Stremio** (opens Stremio via a `stremio://` link) — or copy the URL and
   paste it in Stremio → Add-ons. The install URL looks like:

`https://<your-app>.vercel.app/<config>/manifest.json`

---

## Security & Privacy

- **Zero Database**: Your library state lives in your TorBox tags.
- **Total Control**: Because the addon uses your API keys, your data stays within your account.
- **Keep it Private**: Your install URL embeds your API keys. Treat it like a password — do not
  share it publicly, as it grants access to your library and your configured API services. The
  shared `/configure` page is safe to hand out; the generated `/<config>/manifest.json` URL is not.

---

## Roadmap

Ideas that are **not** built yet. This is a personal tool that already does everything I need, so
I'm not planning to implement these for myself — I'll only pick one up if I see that people
actually use the addon and want it. If that's you, open an issue and say so.

- [ ] TV series support (season/episode resolution).
- [ ] `/torrents` page to browse your library and bulk-tag files with `lmt` or a manual IMDb ID.
- [ ] `/review` page listing `needs-review` torrents (the ones AI Mode couldn't match).
- [ ] Pluggable ID sources (OMDb / TMDB / Cinemeta).
- [ ] Separate PL flags for `Lektor` / `Napisy` (currently dubs show as `(DUB) 🇵🇱`).

---

## Disclaimer

A personal tool for organizing **your own** library. Not affiliated with TorBox, Stremio, IMDb, or OpenAI.
