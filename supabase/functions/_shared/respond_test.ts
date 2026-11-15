import { assertEquals } from "@std/assert";
import { fail, json } from "./respond.ts";

Deno.test("json: status defaults to 200, body round-trips, content type is JSON", async () => {
  const res = json({ id: "a1", count: 2, nested: { ok: true } });
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Content-Type"), "application/json; charset=utf-8");
  assertEquals(await res.json(), { id: "a1", count: 2, nested: { ok: true } });
});

Deno.test("json: keeps the status it is given", async () => {
  const res = json({ created: true }, 201);
  assertEquals(res.status, 201);
  assertEquals(await res.json(), { created: true });
});

Deno.test("fail: wraps code and message under error, and nothing else", async () => {
  const res = fail(401, "notSignedIn", "Sign in to continue.");
  assertEquals(res.status, 401);
  assertEquals(res.headers.get("Content-Type"), "application/json; charset=utf-8");
  assertEquals(await res.json(), { error: { code: "notSignedIn", message: "Sign in to continue." } });
});
