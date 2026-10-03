import { test } from "node:test";
import assert from "node:assert/strict";
import { newestFirst } from "../src/lib/listing-order";
import { CITIES } from "../src/lib/config";
import { parseProject, parseProjectOffers, roomTypes, projectStage } from "../scraper/lib/project-parser";
import { normalize } from "../scraper/lib/store";
import { inventoryMatches, projectMatches, projectPriceLines, type ProjectInfo } from "../src/lib/projects";

const p: ProjectInfo = {
  developer: "יזם", offers: [{ rooms: 4, price: 3_600_000, priceKind: "from" }, { rooms: 5, price: null, priceKind: "unknown" }],
  generalPrice: 2_840_000, generalPriceKind: "from", stage: "marketing", availability: "marketing", locationPrecision: "city", checkedAt: "2026-10-03T00:00:00Z",
};
test("newest first uses publication dates, discovery fallback and stable ties", () => {
  const rows = [
    { id: 1, postedAt: "2026-09-01T00:00:00Z", firstSeenAt: "2026-10-03T00:00:00Z" },
    { id: 2, postedAt: null, firstSeenAt: "2026-10-02T00:00:00Z" },
    { id: 3, postedAt: "2026-10-01T00:00:00Z", firstSeenAt: "2026-10-03T00:00:00Z" },
    { id: 4, postedAt: "invalid", firstSeenAt: "2026-10-02T00:00:00Z" },
  ];
  assert.deepEqual(rows.sort(newestFirst).map((row) => row.id), [4, 2, 3, 1]);
});
test("general project price never becomes a four/five room price", () => {
  const result = parseProjectOffers("דירות 3-5 חד' החל מ-2,840,000 ש״ח");
  assert.deepEqual(result.offers.map((o) => [o.rooms, o.price]), [[4, null], [5, null]]);
  assert.equal(result.generalPrice, 2_840_000);
  assert.equal(result.generalPriceKind, "from");
});
test("advertised prices stay with their own room type", () => {
  const result = parseProjectOffers("4 חדרים החל מ-3.6 מיליון ₪\n5 חדרים ב-4,200,000 ₪");
  assert.deepEqual(result.offers.map((o) => [o.rooms, o.price, o.priceKind]), [[4, 3_600_000, "from"], [5, 4_200_000, "exact"]]);
});
test("a price for 3 rooms and financing/phone numbers do not leak into relevant types", () => {
  const result = parseProjectOffers("3 חדרים החל מ-2,800,000 ₪\n4 ו-5 חדרים\n20/80\nטלפון 054-3450000");
  assert.ok(result.offers.every((o) => o.price === null));
  assert.equal(result.generalPrice, null);
});
test("room ranges and explicit 4.5 differ", () => {
  assert.deepEqual(roomTypes("3–6 חדרים"), [4, 5]);
  assert.deepEqual(roomTypes("5.5-3 חדרים"), [4, 5]);
  assert.deepEqual(roomTypes("4, 4.5 ו-5 חדרים"), [4, 4.5, 5]);
});
test("rooms and price filter must match the same apartment type", () => {
  assert.equal(projectMatches(p, [5], [2_000_000, 4_500_000]), false);
  assert.equal(projectMatches(p, [4], [2_000_000, 4_500_000]), true);
  assert.equal(projectMatches(p, [5], null), true);
  assert.equal(projectMatches(p, [4], [2_000_000, 3_000_000]), false);
});
test("unknown project prices survive normalization but unknown apartment prices do not", () => {
  const raw = parseProject({ title: "פרויקט בהרצליה", identity: "הרצליה", text: "דירות 4 ו-5 חדרים", image: null }, "https://vgroup.co.il/project/test/", "יזם", CITIES)!;
  assert.ok(raw);
  const stored = normalize(raw);
  assert.ok(stored?.project);
  assert.equal(stored.price, null);
  assert.equal(normalize({ ...raw, project: undefined }), null);
});
test("project identity excludes unrelated cities and sold-out inventory", () => {
  assert.equal(parseProject({ title: "פרויקט ירושלים", identity: "ירושלים", text: "4 חדרים, ליד תל אביב", image: null }, "https://vgroup.co.il/project/test/", "יזם", CITIES), null);
  assert.equal(parseProject({ title: "פרויקט הרצליה", identity: "הרצליה", text: "4 חדרים, כל הדירות נמכרו", image: null }, "https://vgroup.co.il/project/test/", "יזם", CITIES), null);
});
test("inventory switches and labels preserve uncertainty", () => {
  assert.equal(inventoryMatches({ project: p }, "apartments"), false);
  assert.equal(inventoryMatches({}, "projects"), false);
  assert.equal(inventoryMatches({ project: p }, "both"), true);
  assert.equal(inventoryMatches({}, "both"), true);
  assert.ok(projectPriceLines(p).some((s) => s.includes("5 rooms — Price not published")));
  assert.ok(projectPriceLines(p).some((s) => s.includes("room type not specified")));
  assert.equal(projectStage("הגשת בקשה להיתר"), "planning");
});

test("a project city in the heading wins over nearby cities in marketing copy", () => {
  const r = parseProject({ title: "פרויקט AIR גבעתיים", identity: "גבעתיים ליד תל אביב", text: "4 ו-5 חדרים", image: null }, "https://icrr.co.il/project/air/", "ICR", CITIES);
  assert.equal(r?.cityText, "גבעתיים");
});
