// Cloudfalre Worker script to handle Email Submission requests
export default {
  async fetch(request, env) {
    const ALLOWED_ORIGINS = new Set([
      "https://arvinderkang.com",
      "https://www.arvinderkang.com",
      "http://localhost:3000",
    ]);

    const origin = request.headers.get("Origin") || "";
    const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "";

    const corsHeaders = {
      ...(allowOrigin ? { "Access-Control-Allow-Origin": allowOrigin } : {}),
      "Vary": "Origin",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If this Worker is only called server-to-server from Next.js, Origin may be empty.
    // In that case, skip Origin checks.
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return new Response(JSON.stringify({ ok: false, error: "Origin not allowed" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const name = (payload.name || "").trim();
    const email = (payload.email || "").trim();
    const message = (payload.message || "").trim();
    const company = (payload.company || "").trim();
    const type = (payload.type || "").trim();
    const turnstileToken = (payload.turnstileToken || "").trim();

    if (!name || !email || !message) {
      return new Response(JSON.stringify({ ok: false, error: "Missing required fields" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (message.length > 5000) {
      return new Response(JSON.stringify({ ok: false, error: "Message too long" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SCRIPT_URL = env.SCRIPT_URL;
    const SHARED_SECRET = env.FORM_SHARED_SECRET;
    const TURNSTILE_SECRET = env.TURNSTILE_SECRET;

    if (TURNSTILE_SECRET) {
      if (!turnstileToken) {
        return new Response(JSON.stringify({ ok: false, error: "Missing captcha token" }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: TURNSTILE_SECRET,
          response: turnstileToken,
          remoteip: request.headers.get("CF-Connecting-IP") || "",
        }),
      });

      let verify;
      try {
        verify = await verifyRes.json();
      } catch {
        verify = { success: false };
      }

      if (!verifyRes.ok || !verify?.success) {
        return new Response(JSON.stringify({ ok: false, error: "Captcha failed" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const forwarded = {
      name,
      email,
      company,
      type,
      message,
      secret: SHARED_SECRET,
      ip: request.headers.get("CF-Connecting-IP") || "",
      ua: request.headers.get("User-Agent") || "",
    };

    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(forwarded),
    });

    const text = await res.text();
    let upstream;
    try { upstream = JSON.parse(text); } catch { upstream = { raw: text }; }

    // Apps Script may return 200 even on failure. Respect upstream.ok.
    if (!res.ok || upstream?.ok !== true) {
      return new Response(JSON.stringify({ ok: false, error: upstream?.error || "Upstream failed", upstream }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  },
};
