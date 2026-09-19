import test from "node:test";
import assert from "node:assert/strict";
import { csvCell, toCsv } from "../lib/csv";
import { followupDate } from "../lib/validation";
import { scoreLead, icpFit } from "../lib/pipeline/score";
import { parseHtml, signalsFrom, mapPool } from "../lib/pipeline/extract";
import { allowedWebsiteUrl, isPublicAddress } from "../lib/pipeline/safe-fetch";
import { verifyEvidence, getAiProvider } from "../lib/providers/ai";
import { lintMessage } from "../lib/pipeline/message-rules";
import type { QualifyInput, QualifyResult } from "../lib/providers/types";

test("CSV preserves accented text and blocks spreadsheet formula execution", () => {
  assert.equal(csvCell('=HYPERLINK("bad")'), '"\'=HYPERLINK(""bad"")"');
  assert.equal(csvCell(" +123"), '"\' +123"');
  assert.match(
    toCsv(["Negocio"], [["Clínica, Norte"]]),
    /^\uFEFF"Negocio"\r\n"Clínica, Norte"\r\n$/,
  );
});
test("calendar dates reject rollover and keep the chosen day", () => {
  assert.equal(followupDate("2026-02-30"), null);
  assert.equal(followupDate("2026-09-20"), "2026-09-20T09:00:00.000Z");
  assert.equal(followupDate("invalid"), null);
});
test("unknown category does not match every industry and NaN scores stay finite", () => {
  assert.equal(icpFit({ types: [] }, ["dentist"]), 8);
  const result = scoreLead({
    place: { types: [] },
    expectedTypes: ["dentist"],
    signals: {
      publicEmail: null,
      publicPhone: null,
      hasForm: false,
      hasWhatsapp: false,
      webStatus: "none",
    },
    problemFitPoints: NaN,
  });
  assert.equal(result.breakdown.problem, 0);
  assert.equal(result.qualified, false);
  assert.ok(Number.isFinite(result.total));
});
test("extractor ignores scripts and Facebook is not a booking link", () => {
  const html =
    '<script>secret</script><h1>Clínica dental</h1><a href="https://facebook.com/example">Facebook</a><a href="mailto:info@clinic.test">Correo</a>';
  const parsed = parseHtml(html);
  assert.ok(!parsed.text.includes("secret"));
  const signals = signalsFrom(parsed, html);
  assert.equal(signals.hasBookingLink, false);
  assert.equal(signals.publicEmail, "info@clinic.test");
});
test("website fetch blocks private hosts, credentials and non-HTTP protocols", () => {
  for (const url of [
    "http://127.0.0.1/admin",
    "http://[::1]/",
    "http://10.0.0.1",
    "http://169.254.169.254",
    "file:///etc/passwd",
    "https://name:pass@example.org",
    "http://192.168.1.1",
    "http://[::ffff:127.0.0.1]/",
  ])
    assert.equal(allowedWebsiteUrl(url), false, url);
  assert.equal(allowedWebsiteUrl("https://example.org/contact"), true);
  assert.equal(
    allowedWebsiteUrl("http://127.0.0.1:3000/demo-site/smile-harbor", "http://127.0.0.1:3000"),
    true,
  );
  assert.equal(
    allowedWebsiteUrl("http://127.0.0.1:3000/api/admin", "http://127.0.0.1:3000"),
    false,
  );
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("172.16.0.1"), false);
});
test("unverified evidence cannot create an opportunity", () => {
  const item = {
    id: "one",
    websiteText: "Llame para pedir su cita.",
    signals: [],
  } as unknown as QualifyInput;
  const result = {
    id: "one",
    evidence: [{ claim: "Inventado", quote: "Tiene millones de clientes", sourceUrl: null }],
    problemFitPoints: 35,
    observedProblem: "Inventado",
    reason: null,
    confidence: "high",
  } as QualifyResult;
  const verified = verifyEvidence([result], [item])[0];
  assert.equal(verified.problemFitPoints, 0);
  assert.equal(verified.observedProblem, null);
});
test("bounded pool preserves order and works when misconfigured concurrency is zero", async () => {
  assert.deepEqual(await mapPool([1, 2, 3], async (x) => x * 2, 0), [2, 4, 6]);
});
test("fixture messages satisfy channel rules and requested language", async () => {
  const ai = getAiProvider("fixture");
  for (const language of ["es", "en"] as const)
    for (const channel of ["email", "instagram", "linkedin"] as const) {
      const { result } = await ai.generateMessage({ negocio: "Example Dental" }, channel, language);
      assert.equal(lintMessage(result.body).ok, true, result.body);
      if (language === "en") assert.ok(!result.body.includes("¿"));
      if (channel !== "email") assert.equal(result.subject, null);
    }
});
