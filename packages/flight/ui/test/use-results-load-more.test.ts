import { describe, expect, test } from "vitest";
import { computeLoadMoreOffset } from "../src/hooks/useResults";

describe("computeLoadMoreOffset", () => {
  test("bails out while a fetch is already in flight — prevents the double-append a rapid double-click causes", () => {
    // offset=0, limit=50, total=200: there IS a next page, but a fetch is
    // already in flight, so loadMore must not start a second one.
    expect(computeLoadMoreOffset({ loading: true, offset: 0, limit: 50, total: 200 })).toBeNull();
  });

  test("returns the next offset when nothing is in flight and more pages remain", () => {
    expect(computeLoadMoreOffset({ loading: false, offset: 0, limit: 50, total: 200 })).toBe(50);
  });

  test("bails out once every page has been loaded", () => {
    expect(
      computeLoadMoreOffset({ loading: false, offset: 150, limit: 50, total: 200 }),
    ).toBeNull();
  });
});
