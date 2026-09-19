import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getPlacesProvider } from "../lib/providers/places";
import { getAiProvider, verifyEvidence } from "../lib/providers/ai";
import type { PlacesQuery, QualifyInput, QualifyResult } from "../lib/providers/types";
import type { ProviderSettings } from "../lib/settings";

const settings: ProviderSettings = {
  placesMode: "live",
  aiMode: "live",
  googleKey: "test-only-google-key",
  openaiKey: "test-only-openai-key",
};
const query: PlacesQuery = {
  niche: "Clínicas dentales",
  city: "Bogotá",
  country: "CO",
  language: "es",
  limit: 25,
};
const quote = "Para reservar tu cita debes llamar al teléfono de la clínica.";
const item: QualifyInput = {
  id: "lead-one",
  businessName: "Clínica Uno",
  hasWebsite: true,
  hasPhone: true,
  hasEmail: false,
  hasBookingLink: false,
  hasForm: false,
  signals: ["Sin reserva online visible"],
  websiteText: quote,
};
const offer = { whatISell: "Sistema de citas", niche: "Clínicas dentales" };
const qualification: QualifyResult = {
  id: item.id,
  problemFitPoints: 28,
  observedProblem: "Reserva por teléfono",
  evidence: [{ claim: "Reservas telefónicas", quote, sourceUrl: "https://inventado.example/" }],
  reason: "La web pide llamar",
  confidence: "high",
};
let directory: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "cantera-providers-"));
  // Any request not explicitly injected into a provider fails before networking.
  mock.method(globalThis, "fetch", async () => {
    throw new Error("External network is forbidden in provider tests");
  });
});
afterEach(() => {
  mock.restoreAll();
  rmSync(directory, { recursive: true, force: true });
});

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const place = (index: number) => ({
  id: `ChIJ_test_${index}`,
  displayName: { text: `Clínica ${index}` },
  types: ["dentist", "health"],
  primaryType: "dentist",
  businessStatus: "OPERATIONAL",
  websiteUri: `https://clinic-${index}.example/`,
  nationalPhoneNumber: "+57 555 123 456",
  rating: 4.5,
  userRatingCount: 14,
  location: { latitude: 4.6, longitude: -74.1 },
});
function responseOutput(output: unknown, status = "completed") {
  return json({
    id: "resp_offline_test",
    object: "response",
    status,
    output: [
      {
        id: "msg_offline_test",
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: typeof output === "string" ? output : JSON.stringify(output),
            annotations: [],
          },
        ],
      },
    ],
    usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
  });
}

test("Google live adapter paginates with stable parameters and maps/deduplicates real HTTP response fields", async () => {
  const bodies: Record<string, unknown>[] = [];
  const fetch: typeof globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://places.googleapis.com/v1/places:searchText");
    assert.equal(init?.method, "POST");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("X-Goog-Api-Key"), settings.googleKey);
    assert.match(headers.get("X-Goog-FieldMask")!, /places\.websiteUri/);
    assert.ok(init?.signal instanceof AbortSignal);
    bodies.push(JSON.parse(String(init?.body)));
    return bodies.length === 1
      ? json({
          places: Array.from({ length: 20 }, (_, index) => place(index)),
          nextPageToken: "page-two",
        })
      : json({
          places: [place(19), ...Array.from({ length: 10 }, (_, index) => place(20 + index))],
        });
  };
  const result = await getPlacesProvider("live", undefined, settings, { fetch }).search(query);
  assert.equal(result.calls, 2);
  assert.equal(result.places.length, 25);
  const { pageToken, ...second } = bodies[1];
  assert.equal(pageToken, "page-two");
  assert.deepEqual(second, bodies[0]);
  assert.equal(bodies[0].pageSize, 20);
  assert.equal(result.places[0].phone, "+57 555 123 456");
  assert.equal(result.places[0].lat, 4.6);
  assert.equal(new Set(result.places.map((row) => row.placeId)).size, 25);
});

test("Google stops repeated pagination tokens and validates request limits before any fetch", async () => {
  let calls = 0;
  const fetch: typeof globalThis.fetch = async () => {
    calls++;
    return json({ places: [place(calls)], nextPageToken: "repeated" });
  };
  const provider = getPlacesProvider("live", undefined, settings, { fetch });
  const result = await provider.search(query);
  assert.equal(result.calls, 2);
  assert.equal(calls, 2);
  await assert.rejects(provider.search({ ...query, limit: -1 }), /entre 1 y 100/);
  assert.equal(calls, 2);
});

test("Google handles HTTP errors, invalid JSON, malformed arrays and missing place IDs without accepting bad leads", async () => {
  for (const [response, pattern] of [
    [json({ error: { message: "private provider diagnostic" } }, 403), /HTTP 403/],
    [new Response("not json", { status: 200 }), /JSON inválida/],
    [json({ places: {} }), /formato inválido/],
    [json({ places: [{ displayName: { text: "Sin ID" } }] }), /identificador/],
    [json({ places: [null] }), /identificador/],
  ] as const) {
    const provider = getPlacesProvider("live", undefined, settings, {
      fetch: async () => response,
    });
    await assert.rejects(provider.search(query), pattern);
  }
});

test("both HTTP adapters abort stalled requests promptly without automatic paid retries", async () => {
  let calls = 0;
  const stalled: typeof globalThis.fetch = async (_url, init) => {
    calls++;
    return new Promise((_resolve, reject) => {
      // Keep the event loop alive: AbortSignal.timeout itself is unref'd by Node.
      const guard = setTimeout(() => reject(new Error("Provider failed to abort")), 500);
      const stop = () => {
        clearTimeout(guard);
        reject(new DOMException("Aborted", "AbortError"));
      };
      init?.signal?.addEventListener("abort", stop, { once: true });
      if (init?.signal?.aborted) stop();
    });
  };
  await assert.rejects(
    getPlacesProvider("live", undefined, settings, { fetch: stalled, timeoutMs: 10 }).search(query),
    /tardó demasiado/,
  );
  await assert.rejects(
    getAiProvider("live", settings, { fetch: stalled, timeoutMs: 10 }).inferProblem("Reservas"),
    /tardó demasiado/,
  );
  assert.equal(calls, 2);
});

test("OpenAI adapter sends strict Responses schema, attributes usage and verifies returned evidence/IDs", async () => {
  let requestedBody: Record<string, any> | undefined;
  const fetch: typeof globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://api.openai.com/v1/responses");
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${settings.openaiKey}`);
    requestedBody = JSON.parse(String(init?.body));
    return responseOutput({
      results: [
        qualification,
        { ...qualification, id: "unknown-lead" },
        { ...qualification, problemFitPoints: 35 },
      ],
    });
  };
  const result = await getAiProvider("live", settings, { fetch }).qualifyBatch(offer, [item]);
  assert.equal(requestedBody!.text.format.type, "json_schema");
  assert.equal(requestedBody!.text.format.strict, true);
  assert.equal(requestedBody!.text.format.name, "qualification");
  assert.equal(JSON.parse(requestedBody!.input[1].content).businesses[0].id, item.id);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].problemFitPoints, 28);
  assert.equal(result.results[0].evidence[0].sourceUrl, null);
  assert.equal(result.usage.inputTokens, 100);
  assert.equal(result.usage.outputTokens, 50);
  assert.ok(result.usage.costUsd > 0);
});

test("AI rejects incomplete responses, invalid JSON and schema violations with useful errors", async () => {
  for (const [response, pattern] of [
    [responseOutput({ problem: "Citas", niches: ["Clínicas"] }, "incomplete"), /incompleta/],
    [responseOutput("{ invalid JSON"), /JSON inválido/],
    [responseOutput({ problem: 17, niches: ["Clínicas"] }), /formato inválido/],
    [responseOutput({ problem: "Citas", niches: "not an array" }), /formato inválido/],
    [
      responseOutput({ problem: "Citas", niches: ["Clínicas"], unexpected: true }),
      /formato inválido/,
    ],
    [
      json({ error: { message: "secret diagnostic", type: "invalid_request_error" } }, 401),
      /HTTP 401/,
    ],
  ] as const) {
    const provider = getAiProvider("live", settings, { fetch: async () => response });
    await assert.rejects(provider.inferProblem("Sistema de citas"), pattern);
  }
  const badId = getAiProvider("live", settings, {
    fetch: async () => responseOutput({ results: [{ ...qualification, id: 42 }] }),
  });
  await assert.rejects(badId.qualifyBatch(offer, [item]), /formato inválido/);
});

test("only actual website text supports evidence; generated signals, empty claims and hallucinations cannot score", () => {
  const results = verifyEvidence(
    [
      {
        ...qualification,
        evidence: [
          { claim: "Inventada", quote: "El negocio pierde millones de clientes", sourceUrl: null },
        ],
      },
    ],
    [item],
  );
  assert.equal(results[0].problemFitPoints, 0);
  assert.equal(results[0].observedProblem, null);
  assert.equal(results[0].confidence, "low");
  const signalOnly = verifyEvidence(
    [
      {
        ...qualification,
        evidence: [{ claim: "Interpretación", quote: item.signals[0], sourceUrl: null }],
      },
    ],
    [item],
  );
  assert.equal(signalOnly[0].problemFitPoints, 0);
  assert.deepEqual(verifyEvidence([null, { id: 123 }] as unknown as QualifyResult[], [item]), []);
});

test("AI hint, angle and message response contracts work through the real SDK with mocked HTTP", async () => {
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    if (request.text.format.name === "offer_hint")
      return responseOutput({
        problem: "Reservas sin respuesta",
        niches: ["Clínicas", "Peluquerías"],
      });
    if (request.text.format.name === "angle")
      return responseOutput({
        observation: "La web pide llamar",
        angle: "Facilitar solicitudes",
        demoIdea: "Formulario de citas",
      });
    assert.match(request.input[0].content, /inglés natural/);
    return responseOutput({
      subject: null,
      body: "I noticed your website asks visitors to call.\nWould you like to see an idea?",
    });
  };
  const ai = getAiProvider("live", settings, { fetch });
  assert.equal((await ai.inferProblem("Reservas")).result.niches.length, 2);
  assert.equal(
    (await ai.generateAngle({ evidence: quote })).result.observation,
    "La web pide llamar",
  );
  assert.equal((await ai.generateMessage({}, "instagram", "en")).result.subject, null);
});

test("cassette replay is offline, works without credentials and reports zero calls/tokens/cost", async () => {
  let googleCalls = 0;
  let aiCalls = 0;
  const googleDirectory = path.join(directory, "google");
  const aiDirectory = path.join(directory, "ai");
  const google = getPlacesProvider("cassette", undefined, settings, {
    cassetteDir: googleDirectory,
    fetch: async () => {
      googleCalls++;
      return json({ places: [place(1)] });
    },
  });
  assert.equal((await google.search(query)).calls, 1);
  assert.equal((await google.search(query)).calls, 0);
  const ai = getAiProvider("cassette", settings, {
    cassetteDir: aiDirectory,
    fetch: async () => {
      aiCalls++;
      return responseOutput({ problem: "Reservas sin respuesta", niches: ["Clínicas"] });
    },
  });
  assert.ok((await ai.inferProblem("Reservas")).usage.costUsd > 0);
  const withoutCredentials = getAiProvider(
    "cassette",
    { placesMode: "cassette", aiMode: "cassette" },
    { cassetteDir: aiDirectory },
  );
  const replay = await withoutCredentials.inferProblem("Reservas");
  assert.equal(replay.usage.costUsd, 0);
  assert.equal(replay.usage.inputTokens, 0);
  assert.equal(replay.usage.outputTokens, 0);
  assert.match(replay.usage.model, /^cassette:/);
  assert.equal(googleCalls, 1);
  assert.equal(aiCalls, 1);
});

test("corrupt or expired cassettes never silently trigger another paid request", async () => {
  let calls = 0;
  const aiDirectory = path.join(directory, "ai");
  const ai = getAiProvider("cassette", settings, {
    cassetteDir: aiDirectory,
    fetch: async () => {
      calls++;
      return responseOutput({ problem: "Reservas sin respuesta", niches: ["Clínicas"] });
    },
  });
  await ai.inferProblem("Reservas");
  writeFileSync(path.join(aiDirectory, readdirSync(aiDirectory)[0]), "not JSON");
  await assert.rejects(ai.inferProblem("Reservas"), /JSON inválido/);
  assert.equal(calls, 1);
  const googleDirectory = path.join(directory, "google");
  const google = getPlacesProvider("cassette", undefined, settings, {
    cassetteDir: googleDirectory,
    fetch: async () => {
      calls++;
      return json({ places: [place(1)] });
    },
  });
  await google.search(query);
  writeFileSync(
    path.join(googleDirectory, readdirSync(googleDirectory)[0]),
    JSON.stringify({ places: [], recordedAt: "2000-01-01T00:00:00.000Z" }),
  );
  await assert.rejects(google.search(query), /caducó/);
  assert.equal(calls, 2);
});
