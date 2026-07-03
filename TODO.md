# TODO

## Auto IMDb resolution (drop-a-file → auto-matched)

**Goal:** user no longer looks up `tt` ids by hand. The addon resolves the IMDb
id from a torrent's title and tags it automatically.

### Why it needs its own trigger

`defineStreamHandler` is reactive — Stremio only calls us for a specific `tt`
id. A torrent with no `tt` tag is never requested, so auto-tagging cannot happen
during a normal stream request. It needs a proactive sweep.

- [ ] Add a protected sweep endpoint, e.g. `GET /<secret>/resolve`.
- [ ] Sweep logic: list `mylist` → take torrents that need resolving → resolve →
      write tag.
- [ ] "Needs resolving" = has a marker tag (e.g. `auto`) OR simply has no `tt`
      and no `no-match`/`needs-review`. **Decide which.**
- [ ] Trigger the sweep: Vercel Cron and/or external cron (cron-job.org) and/or
      manual hit. **Decide which.**

### Correctness rule (non-negotiable)

The LLM must **not** invent `tt` ids (it hallucinates plausible-but-wrong ones).

- [ ] LLM only extracts `{ title, year }` from the messy release name and helps
      disambiguate (localized titles, remakes).
- [ ] Real `tt` id comes from a movie database lookup, not the model.
- [ ] Implement OpenAI **function calling** with a `search_imdb(title, year)`
      tool; the model picks the best candidate, we take the id from the API
      response.

### Id source — LEAN Cinemeta (verified)

Cinemeta (no key, free) is the best fit — verified working:

- Search: `https://v3-cinemeta.strem.io/catalog/movie/top/search=<query>.json`
  → `metas[].id` are the `tt…` ids Stremio itself uses (zero drift).
- Meta:   `https://v3-cinemeta.strem.io/meta/movie/tt0250223.json`
- **Handles localized titles natively**: "kac vegas" → The Hangover,
  "misja kleopatra" → tt0250223. So the LLM does NOT need to translate PL→EN —
  it only needs to produce a clean query and disambiguate the result list.

Alternatives if ever needed:
- OMDb — `?t=<title>&y=<year>` returns `imdbID` directly, but needs a key and is
  weaker on localized titles.
- TMDB — richer, needs a key + 2 calls (`search/movie` → `external_ids`).

### Tag state machine

| Tag            | Meaning                                             |
| -------------- | --------------------------------------------------- |
| `tt#######`    | Matched (key used for Stremio matching)             |
| `openai-named` | Clean name already generated                        |
| `needs-review` | Resolution not confident — check manually           |
| `no-match`     | Resolution ran, found nothing (don't retry forever) |

- [ ] Confidence threshold → `needs-review` instead of a wrong match.
- [ ] Idempotent: never re-resolve something already resolved / `no-match`.
- [ ] Manual `tt` tag always wins.
- [ ] Movies only for now (series = season/episode, separate task).

### Open decisions before building

1. Sweep trigger: cron, manual endpoint, or both?
2. ~~Id source~~ → decided: **Cinemeta** (no key, PL-aware, Stremio-native ids).
3. Real function calling vs. simpler `parse → search → best-match` pipeline?

---

## Later / roadmap

- [ ] TV series support (season/episode resolution).
- [ ] `/review` page listing `needs-review` torrents.
- [ ] Pluggable id sources (OMDb / TMDB / Cinemeta).
- [ ] PL flag for `Lektor` / `Napisy` (currently only `(DUB) 🇵🇱`).
