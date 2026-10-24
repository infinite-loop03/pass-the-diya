import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeFlame,
  encodeFlame,
  encodeFlameV1,
  firstFlame,
  flameUrl,
  nextFlame,
  MAX_TRAIL,
} from "../public/js/link.js";

const DAY = 20_750;

test("the first diya starts a chain at number 1", () => {
  assert.deepEqual(firstFlame("Pune", DAY), { v: 1, d: 1, o: "Pune", s: DAY, t: ["Pune"] });
});

test("passing a flame increments the number and keeps the origin", () => {
  const child = nextFlame(firstFlame("Pune", DAY), "Mumbai");
  assert.equal(child.d, 2);
  assert.equal(child.o, "Pune");
  assert.equal(child.s, DAY);
  assert.deepEqual(child.t, ["Pune", "Mumbai"]);
});

test("the trail keeps only the most recent cities", () => {
  let f = firstFlame("Pune", DAY);
  for (const city of ["A", "B", "C", "D", "E"]) f = nextFlame(f, city);
  assert.equal(f.d, 6);
  assert.equal(f.t.length, MAX_TRAIL);
  assert.deepEqual(f.t, ["B", "C", "D", "E"]);
});

test("encode and decode round-trip, including non-Latin city names", () => {
  const f = nextFlame(firstFlame("पुणे", DAY), "São Paulo");
  assert.deepEqual(decodeFlame(encodeFlame(f)), f);
});

test("tokens are URL-safe and short enough to scan easily as a QR code", () => {
  let f = firstFlame("Thiruvananthapuram", DAY);
  for (let i = 0; i < 500; i++) f = nextFlame(f, "Visakhapatnam");
  const token = encodeFlame(f);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.ok(flameUrl("https://pass-the-diya.example.workers.dev/", f).length < 260);
});

test("unknown cities are allowed and stored as empty strings", () => {
  const f = nextFlame(firstFlame("", DAY), undefined);
  assert.deepEqual(decodeFlame(encodeFlame(f)).t, ["", ""]);
});

test("malformed or tampered tokens are rejected", () => {
  const bad = [
    "",
    "not-base64!!",
    encodeFlameV1({ v: 2, d: 1, o: "x", s: DAY, t: ["x"] }),
    encodeFlameV1({ v: 1, d: 0, o: "x", s: DAY, t: ["x"] }),
    encodeFlameV1({ v: 1, d: 1.5, o: "x", s: DAY, t: ["x"] }),
    encodeFlameV1({ v: 1, d: 2, o: "x", s: DAY, t: [] }),
    encodeFlameV1({ v: 1, d: 1, o: "x", s: DAY, t: ["a", "b"] }), // trail longer than chain
    encodeFlameV1({ v: 1, d: 9, o: "x".repeat(41), s: DAY, t: ["x"] }),
    encodeFlameV1({ v: 1, d: 9, o: "x", s: 5, t: ["x"] }),
  ];
  for (const token of bad) assert.equal(decodeFlame(token), null, token);
});

test("markup in city names is stripped", () => {
  const token = encodeFlameV1({ v: 1, d: 1, o: "<b>Pune</b>", s: DAY, t: ["<img>"] });
  const f = decodeFlame(token);
  assert.equal(f.o, "bPune/b");
  assert.equal(f.t[0], "img");
});

test("links shared before the short format still open", () => {
  // A real v1 token. It must decode forever.
  const old = "eyJ2IjoxLCJkIjo0MTQsIm8iOiJQdW5lIiwicyI6MjA3NTAsInQiOlsiSW5kb3JlIiwiTXVtYmFpIiwiVGhhbmUiLCJOYXNoaWsiXX0";
  assert.deepEqual(decodeFlame(old), { v: 1, d: 414, o: "Pune", s: 20750, t: ["Indore", "Mumbai", "Thane", "Nashik"] });
});

test("new links are the short v2 format", () => {
  const f = { v: 1, d: 414, o: "Pune", s: 20750, t: ["Indore", "Mumbai", "Thane", "Nashik"] };
  const token = encodeFlame(f);
  assert.ok(token.length <= 18, token);
  assert.ok(token.length < encodeFlameV1(f).length / 4);
  assert.deepEqual(decodeFlame(token), f);
});

test("v2 round-trips mixed known and unknown cities, and an unknown origin", () => {
  const f = { v: 1, d: 7, o: "", s: DAY, t: ["Pune", "Smallville", "", "São Paulo"] };
  assert.deepEqual(decodeFlame(encodeFlame(f)), f);
});

test("v2 round-trips very long chains", () => {
  const f = { v: 1, d: 10_000_000, o: "Dubai", s: 39_999, t: ["London", "Dubai"] };
  assert.deepEqual(decodeFlame(encodeFlame(f)), f);
});

test("truncated, padded or invalid v2 tokens are rejected", () => {
  const good = Buffer.from(encodeFlame(firstFlame("Pune", DAY)), "base64url");
  const url = (b) => Buffer.from(b).toString("base64url");
  const bad = [
    url(good.subarray(0, good.length - 1)), // cut short
    url(Buffer.concat([good, Buffer.from([1])])), // extra byte
    url(Buffer.from([2, 1, 5, 1, 1, 1])), // day number far out of range
    url(Buffer.from([2, 1, 0xde, 0xa2, 1, 250, 1, 250])), // city index not in the list
    url(Buffer.from([2, 1, 0xde, 0xa2, 1, 255, 3, 0xff, 0xfe, 0xfd, 1, 1])), // invalid UTF-8
  ];
  for (const token of bad) assert.equal(decodeFlame(token), null, token);
});

test("the city list only ever grows: existing entries never move", () => {
  // If these fail, a list edit has changed what already-shared links say.
  const origin = (city) => Buffer.from(encodeFlame({ v: 1, d: 1, o: city, s: DAY, t: [city] }), "base64url")[5];
  assert.equal(origin("Mumbai"), 1);
  assert.equal(origin("Pune"), 8);
  assert.equal(origin("Stockholm"), 150);
});
