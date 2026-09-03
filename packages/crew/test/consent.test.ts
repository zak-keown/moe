import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { consentPath, grantConsent, hasConsent } from "../src/core/consent.js";

function tmpHome(): string {
  return mkdtempSync(join(tmpdir(), "moe-crew-consent-home-"));
}

describe("consentPath", () => {
  it("uses XDG_STATE_HOME under Moe ownership when configured", () => {
    const home = "/home/testuser";
    expect(consentPath(home, { XDG_STATE_HOME: "/var/state/testuser" })).toBe(
      "/var/state/testuser/moe/crew/consent",
    );
  });

  it("falls back to ~/.local/state under Moe ownership", () => {
    expect(consentPath("/home/testuser", {})).toBe("/home/testuser/.local/state/moe/crew/consent");
  });

  it("treats an empty XDG_STATE_HOME as unset", () => {
    expect(consentPath("/home/testuser", { XDG_STATE_HOME: "" })).toBe(
      "/home/testuser/.local/state/moe/crew/consent",
    );
  });
});

describe("hasConsent / grantConsent", () => {
  let home: string;

  beforeEach(() => {
    home = tmpHome();
  });

  afterEach(() => {
    rmSync(home, { recursive: true });
  });

  it("returns false before consent is granted", () => {
    expect(hasConsent(home, {})).toBe(false);
  });

  it("returns true after consent is granted", () => {
    grantConsent(home, {});
    expect(hasConsent(home, {})).toBe(true);
  });

  it("creates the consent file at the expected path", () => {
    grantConsent(home, {});
    expect(existsSync(consentPath(home, {}))).toBe(true);
  });

  it("is idempotent — granting twice does not throw", () => {
    grantConsent(home, {});
    expect(() => grantConsent(home, {})).not.toThrow();
  });

  it("ignores the legacy Claude consent file without migrating it", () => {
    const legacy = join(home, ".claude", ".moe-crew-consent");
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(legacy, "");

    expect(hasConsent(home, {})).toBe(false);
    expect(existsSync(consentPath(home, {}))).toBe(false);
  });
});
