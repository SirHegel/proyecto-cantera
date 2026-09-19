import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { getUserProviderSettings, storeProviderSettings } from "../lib/settings";

test("provider keys persist encrypted and remain isolated by account", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "cantera-settings-"));
  process.env.CANTERA_MODE = "local";
  process.env.CANTERA_DATA_DIR = directory;
  const one = "00000000-0000-4000-8000-000000000001";
  const two = "00000000-0000-4000-8000-000000000002";
  try {
    await storeProviderSettings(one, "live", "test-google-secret", "test-openai-secret");
    const encoded = await readFile(path.join(directory, "providers", `${one}.json`), "utf8");
    assert.ok(!encoded.includes("test-google-secret"));
    assert.equal((await getUserProviderSettings(one)).openaiKey, "test-openai-secret");
    assert.notEqual((await getUserProviderSettings(two)).openaiKey, "test-openai-secret");
    await storeProviderSettings(one, "fixture", "", "");
    const preserved = await getUserProviderSettings(one);
    assert.equal(preserved.aiMode, "fixture");
    assert.equal(preserved.openaiKey, "test-openai-secret");
    await assert.rejects(storeProviderSettings("../../outside", "live", "key", "key"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
