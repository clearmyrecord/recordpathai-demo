// Only for the isolated RecordPathAI staging Supabase project.
// Stripe verifies via HMAC in a service-role-only PostgreSQL function whose
// signing secret lives encrypted in Vault. No Lob, checkout, court or mail code.
Deno.serve(async (request: Request) => {
  const send = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store" }
    });
  if (request.method === "GET") {
    return send(200, { ok: true, mode: "recordpathai-stripe-sandbox-only" });
  }
  if (request.method !== "POST") return send(405, { ok: false });
  const signature = request.headers.get("stripe-signature") || "";
  if (!signature || signature.length > 1024)
    return send(400, { ok: false, error: "Invalid Stripe signature" });
  if (Number(request.headers.get("content-length") || "0") > 65536)
    return send(413, { ok: false, error: "Payload too large" });
  const body = await request.text();
  if (new TextEncoder().encode(body).length > 65536)
    return send(413, { ok: false, error: "Payload too large" });
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key)
    return send(503, { ok: false, error: "Staging verifier unavailable" });
  // Route by untrusted metadata ONLY to pick a verifier. Each isolated
  // PostgreSQL RPC independently verifies Stripe's HMAC before writing.
  let target = "recordpath_accept_stripe_packet_sandbox";
  try {
    const candidate = JSON.parse(body);
    const type = candidate?.type;
    const product = candidate?.data?.object?.metadata?.product;
    if (product === "premium_recordwatch_lifetime" ||
        type === "charge.refunded" || type === "charge.dispute.created") {
      target = "recordpath_accept_stripe_recordwatch_sandbox";
    }
  } catch {
    return send(400, { ok: false, error: "Malformed Stripe event" });
  }
  try {
    const response = await fetch(
      url + "/rest/v1/rpc/" + target, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: key,
          Authorization: "Bearer " + key
        },
        body: JSON.stringify({
          p_raw_body: body,
          p_stripe_signature: signature
        }),
        signal: AbortSignal.timeout(12000)
      });
    if (!response.ok)
      return send(503, { ok: false, error: "Staging verifier unavailable" });
    const result = await response.json();
    if (result?.ok === false)
      return send(result.error === "signing_secret_unconfigured" ? 503 : 400,
        { ok: false, error: "Stripe sandbox webhook rejected" });
    if (result?.status === "paid_hold" && target === "recordpath_accept_stripe_packet_sandbox") {
      const session = JSON.parse(body).data?.object;
      if (session?.metadata?.lobProof === "wood-signed-conviction-v1") {
        const proof = await fetch(url + "/functions/v1/packet-sandbox-proof", {
          method: "POST", headers: {"Content-Type":"application/json"},
          body: JSON.stringify({action:"render", session_id:session.id}),
          signal: AbortSignal.timeout(60000)
        });
        if (!proof.ok) return send(503, {error:"Sandbox fulfillment pending; retry delivery."});
      }
    }
    if (result?.received === true)
      return send(200, result);
    return send(503, { ok: false, error: "Unexpected verifier response" });
  } catch {
    return send(503, { ok: false, error: "Staging verification timed out" });
  }
});
