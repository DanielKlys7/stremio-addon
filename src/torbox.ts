const API_BASE = "https://api.torbox.app/v1/api";

export interface TorBoxFile {
  id: number;
  name: string;
  short_name?: string;
  size: number;
  mimetype?: string;
}

export interface TorBoxTorrent {
  id: number;
  name: string;
  hash: string;
  size: number;
  tags?: string[];
  download_finished?: boolean;
  download_present?: boolean;
  files?: TorBoxFile[];
}

interface MyListResponse {
  success: boolean;
  detail?: string;
  data?: TorBoxTorrent[];
}

function getApiKey(): string {
  const key = process.env.TORBOX_API_KEY;
  if (!key) {
    throw new Error(
      "Brak TORBOX_API_KEY. Ustaw go w pliku .env (patrz .env.example).",
    );
  }
  return key;
}

let cache: { at: number; data: TorBoxTorrent[] } | null = null;
const CACHE_TTL_MS = 60_000;

export async function getMyList(): Promise<TorBoxTorrent[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data;
  }

  const res = await fetch(`${API_BASE}/torrents/mylist?bypass_cache=false`, {
    headers: { Authorization: `Bearer ${getApiKey()}` },
  });

  if (!res.ok) {
    throw new Error(`TorBox mylist HTTP ${res.status}`);
  }

  const json = (await res.json()) as MyListResponse;
  const data = json.data ?? [];
  cache = { at: Date.now(), data };
  return data;
}

function expandTags(tags?: string[]): string[] {
  return (tags ?? []).flatMap((t) => t.split(",")).map((t) => t.trim());
}

export function hasTag(torrent: TorBoxTorrent, tag: string): boolean {
  return expandTags(torrent.tags).includes(tag);
}

export function mergeTags(torrent: TorBoxTorrent, ...add: string[]): string[] {
  return Array.from(new Set([...expandTags(torrent.tags), ...add])).filter(
    Boolean,
  );
}

export function sanitizeName(name: string): string {
  return name
    .replace(/[:/\\*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

export async function editTorrent(
  torrentId: number,
  fields: { name?: string; tags?: string[] },
): Promise<void> {
  const res = await fetch(`${API_BASE}/torrents/edittorrent`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ torrent_id: torrentId, ...fields }),
  });

  if (!res.ok) {
    throw new Error(`TorBox edittorrent HTTP ${res.status}`);
  }
}

const VIDEO_EXT = /\.(mkv|mp4|avi|mov|webm|m4v|ts|flv|wmv)$/i;

export function pickVideoFile(torrent: TorBoxTorrent): TorBoxFile | undefined {
  const files = torrent.files ?? [];
  if (files.length === 0) return undefined;

  const videos = files.filter((f) => VIDEO_EXT.test(f.name));
  const pool = videos.length > 0 ? videos : files;
  return pool.reduce((a, b) => (b.size > a.size ? b : a));
}
export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

export function buildStreamUrl(torrentId: number, fileId: number): string {
  const token = getApiKey();
  return `${API_BASE}/torrents/requestdl?token=${token}&torrent_id=${torrentId}&file_id=${fileId}&redirect=true`;
}
