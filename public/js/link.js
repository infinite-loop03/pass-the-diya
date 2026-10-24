/**
 * The share-link format. A flame's whole history lives in the link, so passing
 * a diya needs no server at all.
 *
 *   ?f=<token>
 *
 * The token carries these fields:
 *
 *   d  this flame's place in the chain; the first diya is 1
 *   o  city where the chain began ("" if unknown)
 *   s  day the chain began, as days since 1970-01-01 (UTC)
 *   t  cities of the most recent flames, oldest first, ending with this one
 *
 * Two encodings exist and both are always accepted:
 *
 *   v1 (original)  base64url of JSON  {"v":1,"d":414,"o":"Pune","s":20750,"t":[...]}
 *   v2 (current)   base64url of bytes: 0x02, varint d, varint s, city o, count, cities...
 *                  A city is one byte: 0 = unknown, 1..250 = its place in CITIES below,
 *                  255 = spelled out (length byte, then UTF-8). Typical tokens are ~16 characters.
 *
 * Links shared on WhatsApp live forever, so never change what v1 or v2 mean, and only
 * ever APPEND to CITIES (reordering it would change what old links say).
 * To change the format, add v3 next to these and keep decoding both.
 */

/** Append-only. Position + 1 is what a v2 token stores for the city. */
const CITIES = [
  "Mumbai", "Delhi", "New Delhi", "Bengaluru", "Hyderabad", "Chennai", "Kolkata", "Pune", "Ahmedabad", "Jaipur",
  "Lucknow", "Surat", "Kanpur", "Nagpur", "Indore", "Thane", "Bhopal", "Visakhapatnam", "Patna", "Vadodara",
  "Ghaziabad", "Ludhiana", "Agra", "Nashik", "Faridabad", "Meerut", "Rajkot", "Varanasi", "Srinagar", "Aurangabad",
  "Dhanbad", "Amritsar", "Navi Mumbai", "Allahabad", "Prayagraj", "Ranchi", "Howrah", "Coimbatore", "Jabalpur", "Gwalior",
  "Vijayawada", "Jodhpur", "Madurai", "Raipur", "Kota", "Chandigarh", "Guwahati", "Solapur", "Hubli", "Mysore",
  "Mysuru", "Tiruchirappalli", "Bareilly", "Aligarh", "Tiruppur", "Moradabad", "Jalandhar", "Bhubaneswar", "Salem", "Warangal",
  "Guntur", "Bhiwandi", "Saharanpur", "Gorakhpur", "Bikaner", "Amravati", "Noida", "Jamshedpur", "Bhilai", "Cuttack",
  "Firozabad", "Kochi", "Thiruvananthapuram", "Kozhikode", "Thrissur", "Dehradun", "Mangalore", "Mangaluru", "Belgaum", "Nellore",
  "Gurgaon", "Gurugram", "Jamnagar", "Udaipur", "Ujjain", "Jammu", "Panaji", "Shimla", "Puducherry", "Gandhinagar",
  "Rourkela", "Kolhapur", "Ajmer", "Siliguri", "Durgapur", "Dubai", "Abu Dhabi", "Sharjah", "Singapore", "London",
  "Manchester", "Birmingham", "Toronto", "Vancouver", "Montréal", "Calgary", "Ottawa", "Mississauga", "New York", "Los Angeles",
  "Chicago", "Houston", "San Francisco", "San Jose", "Seattle", "Dallas", "Boston", "Atlanta", "Washington", "Sydney",
  "Melbourne", "Brisbane", "Perth", "Auckland", "Kuala Lumpur", "Doha", "Muscat", "Riyadh", "Kuwait City", "Manama",
  "Kathmandu", "Colombo", "Dhaka", "Karachi", "Lahore", "Islamabad", "Nairobi", "Johannesburg", "Cape Town", "Durban",
  "Port Louis", "Hong Kong", "Tokyo", "Frankfurt", "Amsterdam", "Paris", "Berlin", "Dublin", "Zurich", "Stockholm",
];
const CITY_INDEX = new Map(CITIES.map((c, i) => [c, i + 1]));
const LITERAL = 255;

export const MAX_TRAIL = 4;
const MAX_DEPTH = 10_000_000;
const MAX_CITY = 40;
const DAY_MS = 86_400_000;

export const epochDay = (ms = Date.now()) => Math.floor(ms / DAY_MS);

export function firstFlame(city, day = epochDay()) {
  const c = cleanCity(city);
  return { v: 1, d: 1, o: c, s: day, t: [c] };
}

export function nextFlame(parent, city) {
  return {
    v: 1,
    d: Math.min(parent.d + 1, MAX_DEPTH),
    o: parent.o,
    s: parent.s,
    t: [...parent.t, cleanCity(city)].slice(-MAX_TRAIL),
  };
}

const b64url = (bytes) => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** The original v1 encoding. Kept so old links can still be produced and tested. */
export function encodeFlameV1(flame) {
  const { v, d, o, s, t } = flame;
  return b64url(new TextEncoder().encode(JSON.stringify({ v, d, o, s, t })));
}

/** The current v2 encoding: short enough to read aloud and to scan as a small QR code. */
export function encodeFlame(flame) {
  const { d, o, s, t } = flame;
  const out = [2];
  const varint = (n) => {
    while (n >= 128) { out.push((n % 128) | 128); n = Math.floor(n / 128); }
    out.push(n);
  };
  const city = (name) => {
    const idx = name === "" ? 0 : CITY_INDEX.get(name);
    if (idx !== undefined) { out.push(idx); return; }
    const bytes = new TextEncoder().encode(name);
    out.push(LITERAL, bytes.length, ...bytes);
  };
  varint(d);
  varint(s);
  city(o);
  out.push(t.length);
  for (const c of t) city(c);
  return b64url(Uint8Array.from(out));
}

/** Returns a clean flame object, or null for anything malformed or unknown. */
export function decodeFlame(token) {
  if (typeof token !== "string" || token.length === 0 || token.length > 600) return null;
  try {
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    if (bytes[0] === 2) return decodeV2(bytes);
    const data = JSON.parse(new TextDecoder().decode(bytes));
    return data && data.v === 1 ? validateV1(data) : null;
  } catch {
    return null;
  }
}

function decodeV2(bytes) {
  let i = 1;
  const next = () => {
    if (i >= bytes.length) throw new Error("short");
    return bytes[i++];
  };
  const varint = () => {
    let n = 0;
    for (let shift = 0, k = 0; k < 5; k++, shift += 7) {
      const b = next();
      n += (b & 127) * 2 ** shift;
      if (b < 128) return n;
    }
    throw new Error("long");
  };
  const city = () => {
    const b = next();
    if (b === 0) return "";
    if (b === LITERAL) {
      const len = next();
      if (i + len > bytes.length) throw new Error("short");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(i, i + len));
      i += len;
      return text;
    }
    const name = CITIES[b - 1];
    if (name === undefined) throw new Error("unknown city");
    return name;
  };
  const d = varint();
  const s = varint();
  const o = city();
  const count = next();
  const t = Array.from({ length: count }, city);
  if (i !== bytes.length) return null; // trailing bytes: not something we wrote
  return validateV1({ d, o, s, t });
}

export function flameUrl(base, flame) {
  return `${base}?f=${encodeFlame(flame)}`;
}

function validateV1({ d, o, s, t }) {
  if (!Number.isInteger(d) || d < 1 || d > MAX_DEPTH) return null;
  if (!Number.isInteger(s) || s < 19_000 || s > 40_000) return null; // 2022 to 2079
  if (typeof o !== "string" || o.length > MAX_CITY) return null;
  if (!Array.isArray(t) || t.length < 1 || t.length > MAX_TRAIL) return null;
  if (!t.every((c) => typeof c === "string" && c.length <= MAX_CITY)) return null;
  if (t.length > d) return null;
  return { v: 1, d, o: cleanCity(o), s, t: t.map(cleanCity) };
}

function cleanCity(value) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, MAX_CITY)
    : "";
}
