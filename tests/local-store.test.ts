import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createLocalClient } from "../lib/local/client";
import { closeLocalStores, getLocalStore } from "../lib/local/store";
import {
  authenticateLocalAccount,
  createLocalSession,
  localSessionUser,
  registerLocalAccount,
  revokeLocalSession,
} from "../lib/local/auth";
import { permitsLocalRequest } from "../lib/local/access";

const execute = promisify(execFile);
let directory: string;
let filename: string;
let userId: string;
const password = "Una clave de prueba 123";

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "cantera-store-"));
  filename = join(directory, "cantera.sqlite");
  const account = await registerLocalAccount(
    { email: "uno@example.test", password, fullName: "Primera Cuenta" },
    filename,
  );
  userId = String(account.id);
});
afterEach(() => {
  closeLocalStores();
  rmSync(directory, { recursive: true, force: true });
});

const owner = () => createLocalClient({ filename, userId });
const service = () => createLocalClient({ filename, serviceRole: true });

test("persists accounts, offers, search defaults and nested CRM data across reopening", async () => {
  const client = owner();
  const { data: offer, error: offerError } = await client
    .from("offers")
    .insert({ user_id: userId, what_i_sell: "Webs con reservas" })
    .select("*")
    .single();
  assert.equal(offerError, null);
  const { data: search } = await client
    .from("searches")
    .insert({ user_id: userId, offer_id: offer!.id, niche: "Dentistas", country: "Colombia" })
    .select()
    .single();
  assert.equal(search!.status, "pending");
  assert.equal(search!.city, null);
  const { data: lead, error } = await client
    .from("leads")
    .insert({
      user_id: userId,
      search_id: search!.id,
      offer_id: offer!.id,
      business_name: "Clínica Uno",
      evidence: [{ quote: "Llámanos" }],
    })
    .select()
    .single();
  assert.equal(error, null);
  assert.equal(lead!.saved, false);
  assert.equal(lead!.candidate, true);
  closeLocalStores();
  const reopened = await owner().from("leads").select("business_name,evidence").single();
  assert.deepEqual(reopened.data, {
    business_name: "Clínica Uno",
    evidence: [{ quote: "Llámanos" }],
  });
});

test("passwords and sessions are hashed; login survives restart, logout and expiry revoke access", async () => {
  const store = getLocalStore(filename);
  const credential = store.database
    .prepare("SELECT password_hash FROM local_credentials WHERE user_id = ?")
    .get(userId)!;
  assert.match(String(credential.password_hash), /^scrypt:/);
  assert.ok(!String(credential.password_hash).includes(password));
  assert.equal(
    (await authenticateLocalAccount(" UNO@EXAMPLE.TEST ", password, filename)).id,
    userId,
  );
  await assert.rejects(
    authenticateLocalAccount("uno@example.test", "incorrecta", filename),
    /incorrectos/,
  );
  const token = createLocalSession(userId, filename);
  const storedSession = store.database.prepare("SELECT token_hash FROM local_sessions").get()!;
  assert.notEqual(storedSession.token_hash, token);
  closeLocalStores();
  assert.equal(localSessionUser(token, filename), userId);
  assert.equal(localSessionUser(`${token.slice(0, -1)}!`, filename), null);
  revokeLocalSession(token, filename);
  assert.equal(localSessionUser(token, filename), null);
  const expired = createLocalSession(userId, filename);
  getLocalStore(filename).database.prepare("UPDATE local_sessions SET expires_at = 0").run();
  assert.equal(localSessionUser(expired, filename), null);
  assert.equal((await owner().from("local_credentials").select()).error?.code, "42P01");
});

test("separate local accounts cannot read, update, overwrite or reference another account's rows", async () => {
  const second = await registerLocalAccount(
    { email: "dos@example.test", password, fullName: "Segunda Cuenta" },
    filename,
  );
  assert.equal(second.role, "student");
  const other = createLocalClient({ filename, userId: String(second.id) });
  const { data: lead } = await owner()
    .from("leads")
    .insert({ user_id: userId, business_name: "Privado" })
    .select()
    .single();
  assert.deepEqual((await other.from("leads").select()).data, []);
  assert.deepEqual(
    (await other.from("leads").update({ saved: true }).eq("id", lead!.id).select()).data,
    [],
  );
  assert.equal(
    (
      await other
        .from("leads")
        .upsert({ id: lead!.id, user_id: second.id, business_name: "Robado" })
        .select()
    ).error?.code,
    "42501",
  );
  assert.equal(
    (await other.from("activities").insert({ lead_id: lead!.id, user_id: second.id, type: "note" }))
      .error?.code,
    "23503",
  );
  assert.equal(
    (await other.from("profiles").update({ role: "admin" }).eq("id", second.id)).error?.code,
    "42501",
  );
  assert.equal(
    (
      await other
        .from("profiles")
        .update({ limits: { searches_per_day: 999 } })
        .eq("id", second.id)
    ).error?.code,
    "42501",
  );
  assert.deepEqual(
    (await other.from("app_settings").update({ default_limits: {} }).eq("id", true).select()).data,
    [],
  );
  assert.equal(
    (
      await other
        .from("usage_counters")
        .insert({ user_id: second.id, kind: "searches_per_day", used: 0 })
    ).error?.code,
    "42501",
  );
  assert.deepEqual((await other.from("profiles").select("id")).data, [{ id: second.id }]);
  assert.equal(
    (await other.rpc("consume_quota", { p_user_id: userId, p_kind: "searches_per_day" })).error
      ?.code,
    "42501",
  );
  assert.deepEqual((await createLocalClient({ filename }).from("leads").select()).data, []);
  assert.equal((await owner().from("leads").select("saved").single()).data!.saved, false);
});

test("supports filtering, SQL null behavior, ordering, inclusive ranges and single-row errors", async () => {
  const client = owner();
  await client.from("leads").insert([
    {
      user_id: userId,
      business_name: "Primero",
      score: 30,
      next_followup_at: "2026-10-01T10:00:00.000Z",
    },
    {
      user_id: userId,
      business_name: "Segundo",
      score: 90,
      next_followup_at: "2026-10-02T10:00:00.000Z",
    },
    { user_id: userId, business_name: "Tercero", score: 60 },
  ]);
  const query = await client
    .from("leads")
    .select("business_name", { count: "exact" })
    .not("next_followup_at", "is", null)
    .gte("score", 20)
    .lte("score", 100)
    .order("score", { ascending: false })
    .range(1, 1);
  assert.deepEqual(query.data, [{ business_name: "Primero" }]);
  assert.equal(query.count, 2);
  assert.equal((await client.from("leads").select().neq("next_followup_at", null)).data!.length, 0);
  assert.equal(
    (await client.from("leads").select().not("next_followup_at", "eq", null)).data!.length,
    0,
  );
  assert.equal(
    (await client.from("leads").select().or("score.gt.80,business_name.eq.Tercero")).data!.length,
    2,
  );
  assert.equal((await client.from("leads").select().in("score", [30, 60])).data!.length, 2);
  assert.equal((await client.from("leads").select().single()).error?.code, "PGRST116");
  assert.equal((await client.from("leads").select().eq("score", 99).maybeSingle()).data, null);
  assert.equal((await client.from("leads").select("typo")).error?.code, "42703");
  assert.equal(
    (await client.from("leads").select().not("score", "unsupported", 1)).error?.code,
    "0A000",
  );
});

test("atomic bulk insert rolls back on duplicates and null unique keys remain independent", async () => {
  const client = owner();
  const duplicate = await client.from("leads").insert([
    { user_id: userId, business_name: "Uno", place_id: "same" },
    { user_id: userId, business_name: "Dos", place_id: "same" },
  ]);
  assert.equal(duplicate.error?.code, "23505");
  assert.deepEqual((await client.from("leads").select()).data, []);
  const nullKeys = await client
    .from("leads")
    .insert([
      { user_id: userId, business_name: "Uno" },
      { user_id: userId, business_name: "Dos" },
    ])
    .select();
  assert.equal(nullKeys.data!.length, 2);
  const db = service();
  await db.from("invites").upsert({ email: "invite@example.test" }, { onConflict: "email" });
  await db.from("invites").upsert({ email: "invite@example.test" }, { onConflict: "email" });
  assert.equal((await db.from("invites").select()).data!.length, 1);
});

test("compare-and-set search claims have one winner, and repeated awaiting does not repeat inserts", async () => {
  const client = owner();
  const insert = client
    .from("searches")
    .insert({ user_id: userId, niche: "Clínicas", country: "Colombia" })
    .select()
    .single();
  const first = await insert;
  assert.deepEqual(await insert, first);
  assert.equal((await client.from("searches").select()).data!.length, 1);
  const claim = () =>
    client
      .from("searches")
      .update({ status: "discovering" })
      .eq("id", first.data!.id)
      .eq("status", "pending")
      .eq("updated_at", first.data!.updated_at)
      .select("id")
      .maybeSingle();
  const results = await Promise.all([claim(), claim()]);
  assert.equal(results.filter((result) => result.data).length, 1);
});

test("quota rejection never consumes units and concurrent processes cannot overrun the limit", async () => {
  const db = service();
  await db
    .from("profiles")
    .update({ limits: { searches_per_day: 11 } })
    .eq("id", userId);
  const child = `
    const { createLocalClient } = require('./lib/local/client.ts');
    (async () => {
      const db = createLocalClient({ filename: process.env.TEST_SQLITE_FILE, serviceRole: true });
      let success = 0;
      for (let i = 0; i < 8; i++) {
        const result = await db.rpc('consume_quota', { p_user_id: process.env.TEST_USER_ID, p_kind: 'searches_per_day' });
        if (!result.error) success++;
        else if (!result.error.message.includes('QUOTA_EXCEEDED')) throw new Error(result.error.message);
      }
      process.stdout.write(String(success));
    })().catch((error) => { console.error(error); process.exitCode = 1; });
  `;
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      execute(process.execPath, ["--import", "tsx", "--eval", child], {
        cwd: process.cwd(),
        env: { ...process.env, TEST_SQLITE_FILE: filename, TEST_USER_ID: userId },
      }),
    ),
  );
  assert.equal(
    results.reduce((sum, result) => sum + Number(result.stdout), 0),
    11,
  );
  assert.equal((await db.from("usage_counters").select("used").single()).data!.used, 11);
  assert.equal(
    (await db.rpc("consume_quota", { p_user_id: userId, p_kind: "searches_per_day", p_n: -3 }))
      .error?.code,
    "22023",
  );
  assert.equal((await db.from("usage_counters").select("used").single()).data!.used, 11);
});

test("deleting a search detaches leads and deleting a lead cascades its history", async () => {
  const client = owner();
  const { data: search } = await client
    .from("searches")
    .insert({ user_id: userId, niche: "Clínicas", country: "Colombia" })
    .select()
    .single();
  const { data: lead } = await client
    .from("leads")
    .insert({ user_id: userId, search_id: search!.id, business_name: "Uno" })
    .select()
    .single();
  await client
    .from("activities")
    .insert({ user_id: userId, lead_id: lead!.id, type: "note", body: "Nota" });
  await client.from("searches").delete().eq("id", search!.id);
  assert.equal((await client.from("leads").select().single()).data!.search_id, null);
  await client.from("leads").delete().eq("id", lead!.id);
  assert.deepEqual((await client.from("activities").select()).data, []);
});

test("local access rejects remote hosts and cross-origin writes while permitting loopback", () => {
  assert.equal(permitsLocalRequest(new Headers({ host: "127.0.0.1:3000" }), "GET"), true);
  assert.equal(
    permitsLocalRequest(new Headers({ host: "[::1]:3000", origin: "http://[::1]:3000" }), "POST"),
    true,
  );
  assert.equal(permitsLocalRequest(new Headers({ host: "evil.test" }), "GET"), false);
  assert.equal(
    permitsLocalRequest(
      new Headers({ host: "localhost:3000", origin: "https://evil.test" }),
      "POST",
    ),
    false,
  );
  assert.equal(
    permitsLocalRequest(
      new Headers({ host: "localhost:3000", "x-forwarded-for": "192.168.1.7" }),
      "GET",
    ),
    false,
  );
  assert.equal(
    permitsLocalRequest(
      new Headers({ host: "localhost:3000", "sec-fetch-site": "cross-site" }),
      "POST",
    ),
    false,
  );
  assert.equal(
    permitsLocalRequest(
      new Headers({ host: "localhost:3000", origin: "http://localhost:9999" }),
      "GET",
    ),
    false,
  );
  assert.equal(
    permitsLocalRequest(
      new Headers({ host: "localhost:3000", "sec-fetch-site": "cross-site" }),
      "GET",
    ),
    false,
  );
  assert.equal(
    permitsLocalRequest(new Headers({ host: "localhost:3000", origin: "null" }), "POST"),
    false,
  );
  assert.equal(
    permitsLocalRequest(new Headers({ host: "localhost.evil.test:3000" }), "GET"),
    false,
  );
  assert.equal(
    permitsLocalRequest(
      new Headers({ host: "localhost:3000", "x-forwarded-host": "evil.test" }),
      "GET",
    ),
    false,
  );
});

test("registration validates and deduplicates accounts; repeated failed logins are throttled persistently", async () => {
  await assert.rejects(
    registerLocalAccount(
      { email: " UNO@example.test ", password, fullName: "Duplicada" },
      filename,
    ),
    /Ya existe/,
  );
  await assert.rejects(
    registerLocalAccount(
      { email: "otro@example.test", password: "corta", fullName: "Otra Cuenta" },
      filename,
    ),
    /8 y 128/,
  );
  assert.equal(getLocalStore(filename).rows("profiles").length, 1);
  for (let index = 0; index < 5; index++)
    await assert.rejects(
      authenticateLocalAccount("uno@example.test", "incorrecta", filename),
      /incorrectos/,
    );
  closeLocalStores();
  await assert.rejects(
    authenticateLocalAccount("uno@example.test", password, filename),
    /cinco minutos/,
  );
  getLocalStore(filename).database.prepare("UPDATE local_credentials SET blocked_until = 0").run();
  assert.equal((await authenticateLocalAccount("uno@example.test", password, filename)).id, userId);
});
