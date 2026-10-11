// Telling a tap on Vditor's toolbar from a swipe that scrolls it. Pure functions: `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { isTap, TAP_SLOP_PX, vditorPressesOnTouchStart } from "../src/touch-toolbar.ts";

test("a touch that ends where it began is a tap", () => {
  assert.equal(isTap({ x: 100, y: 20 }, { x: 103, y: 18 }), true);
  assert.equal(isTap({ x: 100, y: 20 }, { x: 100 + TAP_SLOP_PX, y: 20 }), true);
});

test("a sideways swipe across the toolbar is not a tap", () => {
  assert.equal(isTap({ x: 300, y: 20 }, { x: 120, y: 22 }), false);
  assert.equal(isTap({ x: 100, y: 20 }, { x: 100 + TAP_SLOP_PX + 1, y: 20 }), false);
});

test("a vertical drag is not a tap either", () => {
  assert.equal(isTap({ x: 100, y: 20 }, { x: 101, y: 60 }), false);
});

test("only an iPhone gets the replay: elsewhere Vditor listens for click", () => {
  assert.equal(vditorPressesOnTouchStart("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), true);
  assert.equal(vditorPressesOnTouchStart("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), false);
  assert.equal(vditorPressesOnTouchStart("Mozilla/5.0 (Linux; Android 14)"), false);
});
