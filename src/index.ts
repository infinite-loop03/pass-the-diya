/**
 * Pass the Diya: the whole backend.
 *
 * POST /api/light  Count one diya in the caller's city (one D1 write). Returns the city.
 * GET  /api/sky    Map data, read from a single cached snapshot row.
 * cron             Rebuilds that snapshot every few minutes.
 *
 * The flame's history (chain number, origin, recent cities) travels inside the share
 * link and is handled entirely by the page. If this Worker is over its free quota,
 * people can still light and pass diyas; only the map pauses.
 */

export interface Env {
  DB: D1Database;
  DEV_FAKE_GEO?: string;
}

type CityRow = {
  city: string;
  country: string;
  lat: number | null;
  lon: number | null;
  n: number;
};

/** Compact on purpose: this is what every map view downloads. */
type Sky = {
  total: number; // all diyas counted
  cities: number; // distinct named cities
  abroad: number; // diyas lit outside India
  unplaced: number; // diyas Cloudflare couldn't place on a map
  points: [name: string, country: string, lat: number, lon: number, n: number][];
  updatedAt: number;
};

const MAX_POINTS = 400;
const SKY_MEMORY_MS = 10_000; // per-isolate cache in front of the snapshot row
const SNAPSHOT_STALE_MS = 15_000; // a read older than this rebuilds the snapshot, so new diyas show within seconds

let skyMemo: { body: string; at: number } | null = null;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/light") return await light(request, env, url);
      if (url.pathname === "/api/sky") return await sky(request, env);
      return json({ error: "not_found" }, 404);
    } catch {
      // The page treats any failure as "the map is catching up".
      return json({ error: "busy" }, 503);
    }
  },

  async scheduled(_controller, env) {
    await buildSnapshot(env);
  },
} satisfies ExportedHandler<Env>;

// ---------------------------------------------------------------------------

async function light(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Only our own page may count diyas. (Browsers always send Origin on POST.)
  const origin = request.headers.get("Origin");
  if (origin && safeHost(origin) !== url.host) return json({ error: "forbidden" }, 403);

  const geo = env.DEV_FAKE_GEO === "true" ? fakeGeo() : geoFrom(request);
  const key = `${geo.country}|${geo.city}`;

  let recorded = true;
  try {
    await env.DB.prepare(
      `INSERT INTO cities (key, city, country, lat, lon, n)
       VALUES (?1, ?2, ?3, ?4, ?5, 1)
       ON CONFLICT(key) DO UPDATE SET
         n   = n + 1,
         lat = COALESCE(cities.lat, excluded.lat),
         lon = COALESCE(cities.lon, excluded.lon)`
    )
      .bind(key, geo.city, geo.country, geo.lat, geo.lon)
      .run();
  } catch {
    // Most likely the free daily write limit. We still know the city from the
    // request itself, so the flame's trail stays accurate; only the count is lost.
    recorded = false;
  }

  return json({ city: geo.city, country: geo.country, recorded });
}

async function sky(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const now = Date.now();
  if (skyMemo && now - skyMemo.at < SKY_MEMORY_MS) return raw(skyMemo.body);

  const row = await env.DB.prepare("SELECT json, updated_at FROM snapshot WHERE id = 1").first<{
    json: string;
    updated_at: number;
  }>();

  const body =
    row && now - row.updated_at < SNAPSHOT_STALE_MS ? row.json : await buildSnapshot(env);

  skyMemo = { body, at: now };
  return raw(body);
}

/** Scans the cities table once and stores the result as a single row. */
async function buildSnapshot(env: Env): Promise<string> {
  const { results } = await env.DB.prepare(
    "SELECT city, country, lat, lon, n FROM cities"
  ).all<CityRow>();

  let total = 0;
  let abroad = 0;
  let unplaced = 0;
  let named = 0;
  const placed: CityRow[] = [];

  for (const r of results) {
    total += r.n;
    if (r.country !== "IN") abroad += r.n;
    if (r.city) named++;
    if (r.lat === null || r.lon === null) unplaced += r.n;
    else placed.push(r);
  }

  placed.sort((a, b) => b.n - a.n);

  const snapshot: Sky = {
    total,
    cities: named,
    abroad,
    unplaced,
    points: placed
      .slice(0, MAX_POINTS)
      .map((r) => [r.city, r.country, r.lat as number, r.lon as number, r.n]),
    updatedAt: Date.now(),
  };

  const body = JSON.stringify(snapshot);
  await env.DB.prepare(
    `INSERT INTO snapshot (id, json, updated_at) VALUES (1, ?1, ?2)
     ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`
  )
    .bind(body, snapshot.updatedAt)
    .run();

  return body;
}

// ---------------------------------------------------------------------------

type Geo = { city: string; country: string; lat: number | null; lon: number | null };

/**
 * City-level location that Cloudflare derives from the request's IP address.
 * No browser permission prompt, and we never store the IP itself.
 */
function geoFrom(request: Request): Geo {
  const cf = (request.cf ?? {}) as IncomingRequestCfProperties;
  const country = /^[A-Z]{2}$/.test(cf.country ?? "") ? (cf.country as string) : "XX";
  return {
    city: clean(cf.city),
    country,
    lat: coarse(cf.latitude),
    lon: coarse(cf.longitude),
  };
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/[|\u0000-\u001f]/g, "").trim().slice(0, 40) : "";
}

/** One decimal place is roughly 10 km: enough for a map dot, too coarse to locate anyone. */
function coarse(value: unknown): number | null {
  const n = typeof value === "string" ? parseFloat(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

const DEV_CITIES: [string, string, number | null, number | null, number][] = [
  // name, country, lat, lon, weight
  ["Mumbai", "IN", 19.1, 72.9, 9],
  ["Delhi", "IN", 28.6, 77.2, 9],
  ["Bengaluru", "IN", 13.0, 77.6, 8],
  ["Hyderabad", "IN", 17.4, 78.5, 6],
  ["Chennai", "IN", 13.1, 80.3, 6],
  ["Kolkata", "IN", 22.6, 88.4, 6],
  ["Pune", "IN", 18.5, 73.9, 6],
  ["Ahmedabad", "IN", 23.0, 72.6, 5],
  ["Jaipur", "IN", 26.9, 75.8, 4],
  ["Lucknow", "IN", 26.8, 81.0, 4],
  ["Indore", "IN", 22.7, 75.9, 3],
  ["Bhopal", "IN", 23.3, 77.4, 2],
  ["Nagpur", "IN", 21.1, 79.1, 2],
  ["Patna", "IN", 25.6, 85.1, 3],
  ["Surat", "IN", 21.2, 72.8, 3],
  ["Kochi", "IN", 9.9, 76.3, 2],
  ["Guwahati", "IN", 26.1, 91.7, 2],
  ["Chandigarh", "IN", 30.7, 76.8, 2],
  ["Varanasi", "IN", 25.3, 83.0, 2],
  ["Bhubaneswar", "IN", 20.3, 85.8, 2],
  ["Coimbatore", "IN", 11.0, 77.0, 2],
  ["Visakhapatnam", "IN", 17.7, 83.2, 2],
  ["Amritsar", "IN", 31.6, 74.9, 1],
  ["Dehradun", "IN", 30.3, 78.0, 1],
  ["Raipur", "IN", 21.3, 81.6, 1],
  ["Thiruvananthapuram", "IN", 8.5, 76.9, 1],
  ["Ranchi", "IN", 23.3, 85.3, 1],
  ["Srinagar", "IN", 34.1, 74.8, 1],
  ["Dubai", "AE", 25.2, 55.3, 2],
  ["London", "GB", 51.5, -0.1, 2],
  ["Singapore", "SG", 1.4, 103.8, 1],
  ["Toronto", "CA", 43.7, -79.4, 1],
  ["", "IN", null, null, 1], // a diya Cloudflare couldn't place
];

function fakeGeo(): Geo {
  const sum = DEV_CITIES.reduce((s, c) => s + c[4], 0);
  let pick = Math.random() * sum;
  for (const [city, country, lat, lon, w] of DEV_CITIES) {
    if ((pick -= w) <= 0) return { city, country, lat, lon };
  }
  return { city: "Mumbai", country: "IN", lat: 19.1, lon: 72.9 };
}

function safeHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function raw(body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Lets the browser reuse the map for a few seconds without another Worker request.
      "cache-control": "public, max-age=10",
    },
  });
}
