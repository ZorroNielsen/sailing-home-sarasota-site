// POST /api/contact — website form → email through Resend.
//
// Safety: until FORMS_LIVE is "true" (wrangler.toml), every message goes to
// TEST_TO and never to Jan.
//
// Settings: wrangler.toml [vars] SITE_NAME, MAIL_FROM, LIVE_TO, FORMS_LIVE.
// Secrets (Cloudflare dashboard, never in the repo): RESEND_API_KEY,
// TURNSTILE_SECRET_KEY, TEST_TO.

const FORMS = {
  speaking: {
    subject: "Speaking request",
    fields: ["Name", "Organization", "Email Address", "Phone", "Event Date", "Approximate Audience Size", "Location", "Message"],
    required: ["Name", "Email Address"],
  },
  contact: {
    subject: "Message",
    fields: ["Name", "Email Address", "Message"],
    required: ["Name", "Email Address"],
  },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function onRequestPost({ request, env }) {
  let data;
  try {
    data = await request.formData();
  } catch {
    return json({ ok: false, error: "bad-request" }, 400);
  }

  // Honeypot: people never see this field, bots fill it in. Pretend it worked, send nothing.
  if (String(data.get("website") || "").trim() !== "") return json({ ok: true });

  const form = FORMS[data.get("form")];
  if (!form) return json({ ok: false, error: "unknown-form" }, 400);

  const live = env.FORMS_LIVE === "true";
  const to = live ? env.LIVE_TO : env.TEST_TO;
  // Names only (never values), so a missing setting is easy to spot.
  const missing = [live ? "LIVE_TO" : "TEST_TO", "RESEND_API_KEY", "TURNSTILE_SECRET_KEY"].filter(
    (name) => !(name === "LIVE_TO" || name === "TEST_TO" ? to : env[name])
  );
  if (missing.length) return json({ ok: false, error: "not-configured", missing }, 500);

  if (!(await turnstileOk(data.get("cf-turnstile-response"), env, request))) {
    return json({ ok: false, error: "turnstile" }, 403);
  }

  const values = {};
  for (const name of form.fields) {
    const all = data.getAll(name).map((v) => String(v).trim()).filter(Boolean);
    if (all.length) values[name] = all.join(", ").slice(0, 4000);
  }
  for (const name of form.required) {
    if (!values[name]) return json({ ok: false, error: "missing", field: name }, 400);
  }
  const replyTo = values["Email Address"];
  if (replyTo && !EMAIL_RE.test(replyTo)) return json({ ok: false, error: "email" }, 400);

  const who = (values["Name"] || "").replace(/[\r\n]+/g, " ").slice(0, 80);
  const subject = `${live ? "" : "[TEST] "}${env.SITE_NAME || "Website"}: ${form.subject}${who ? " from " + who : ""}`;
  const text =
    form.fields.filter((f) => values[f]).map((f) => `${f}: ${values[f]}`).join("\n\n") +
    `\n\n--\nSent from the form at ${new URL(request.url).host}${live ? "" : " (test mode, not sent to Jan)"}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [to],
      subject,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  if (!res.ok) {
    console.log("Resend error", res.status, await res.text());
    return json({ ok: false, error: "send" }, 502);
  }
  return json({ ok: true });
}

async function turnstileOk(token, env, request) {
  if (!token) return false;
  const body = new FormData();
  body.append("secret", env.TURNSTILE_SECRET_KEY);
  body.append("response", String(token));
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) body.append("remoteip", ip);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const out = await r.json();
    return out.success === true;
  } catch {
    return false;
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
