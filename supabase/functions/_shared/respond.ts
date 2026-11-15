/** A JSON response. Every function answers through this, so bodies and headers stay uniform. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/** An error response: `{ error: { code, message } }`. `code` is stable; `message` is for people. */
export function fail(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}
