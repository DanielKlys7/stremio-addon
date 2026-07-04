const CINEMETA = "https://v3-cinemeta.strem.io";

export interface CinemetaHit {
  id: string;
  name: string;
  year?: string;
}

interface CinemetaMeta {
  id: string;
  name: string;
  releaseInfo?: string;
  year?: string;
}

export async function searchImdbId(
  title: string,
  year?: number | null,
): Promise<CinemetaHit | null> {
  const url = `${CINEMETA}/catalog/movie/top/search=${encodeURIComponent(title)}.json`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const json = (await res.json()) as { metas?: CinemetaMeta[] };
  const metas = json.metas ?? [];
  if (metas.length === 0) return null;

  let pick = metas[0];
  if (year) {
    const byYear = metas.find((m) =>
      (m.releaseInfo ?? m.year ?? "").startsWith(String(year)),
    );
    if (byYear) pick = byYear;
  }
  return { id: pick.id, name: pick.name, year: pick.releaseInfo ?? pick.year };
}
