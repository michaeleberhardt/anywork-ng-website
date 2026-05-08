// Cloudflare Pages Function: POST /api/contact
//
// Nimmt Kontaktformular-Submits entgegen, validiert serverseitig,
// erkennt Bots über das Honeypot-Feld und schickt die Nachricht
// per Resend API an die in TARGET_EMAIL hinterlegte Adresse.
//
// Erforderliche Cloudflare-Pages-Environment-Variablen
// (Dashboard → Settings → Environment variables):
//   RESEND_API_KEY  — von resend.com (Free Tier: 100 Mails/Tag, 3.000/Monat)
//   FROM_EMAIL      — z. B. "kontakt@anywork.ing" — muss bei Resend
//                     verifiziert sein (DNS: SPF + DKIM)
//   TARGET_EMAIL    — Empfänger-Adresse, z. B. "kontakt@anywork.ing"
//
// Wenn diese Variablen fehlen, antwortet die Funktion mit 503 — die
// Site bleibt online, das Formular zeigt eine sprechende Fehlermeldung.

const RATE_LIMIT_MAX = 5;          // Submits
const RATE_LIMIT_WINDOW = 3600000; // pro Stunde pro IP
const recentSubmits = new Map();   // in-memory; reicht für CF-Worker-Lifecycle

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = recentSubmits.get(ip) ?? { count: 0, since: now };
  if (now - entry.since > RATE_LIMIT_WINDOW) {
    recentSubmits.set(ip, { count: 1, since: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  recentSubmits.set(ip, entry);
  return true;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isValidEmail(s) {
  if (typeof s !== 'string') return false;
  if (s.length > 200) return false;
  // pragmatic — not RFC-perfect, blocks obvious nonsense
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function onRequestPost({ request, env }) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };

  // --- Parse JSON body ---
  let data;
  try {
    data = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Ungültiges Anfrageformat.' }), { status: 400, headers });
  }

  const { name, email, company, message, consent, website } = data ?? {};

  // --- Honeypot: filled = bot ---
  if (website && String(website).trim() !== '') {
    // Vortäuschen, dass alles geklappt hat — Bots sollen nicht lernen
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  }

  // --- Validation ---
  if (typeof name !== 'string' || name.trim().length < 2 || name.length > 100) {
    return new Response(JSON.stringify({ error: 'Bitte einen gültigen Namen angeben.' }), { status: 400, headers });
  }
  if (!isValidEmail(email)) {
    return new Response(JSON.stringify({ error: 'Bitte eine gültige E-Mail-Adresse angeben.' }), { status: 400, headers });
  }
  if (typeof message !== 'string' || message.trim().length < 10 || message.length > 3000) {
    return new Response(JSON.stringify({ error: 'Nachricht: zwischen 10 und 3000 Zeichen.' }), { status: 400, headers });
  }
  if (consent !== 'on' && consent !== true && consent !== 'true') {
    return new Response(JSON.stringify({ error: 'Bitte den Einwilligungs-Hinweis bestätigen.' }), { status: 400, headers });
  }

  // --- Rate limit per IP ---
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: 'Zu viele Anfragen — bitte später erneut versuchen.' }), { status: 429, headers });
  }

  // --- Required env vars ---
  const apiKey = env.RESEND_API_KEY;
  const fromEmail = env.FROM_EMAIL;
  const targetEmail = env.TARGET_EMAIL;
  if (!apiKey || !fromEmail || !targetEmail) {
    console.error('contact form: missing env vars (RESEND_API_KEY/FROM_EMAIL/TARGET_EMAIL)');
    return new Response(
      JSON.stringify({ error: 'Mail-Versand ist serverseitig nicht konfiguriert. Bitte direkt an kontakt@anywork.ing schreiben.' }),
      { status: 503, headers },
    );
  }

  // --- Build email payload ---
  const subject = `[anywork.ing] Neue Kontaktanfrage von ${name.trim()}`;
  const safeBody = `
Name:    ${escapeHtml(name)}
E-Mail:  ${escapeHtml(email)}
Firma:   ${escapeHtml(company || '(nicht angegeben)')}
IP:      ${escapeHtml(ip)}

Nachricht:
${escapeHtml(message)}

— Über Kontaktformular auf anywork.ing —
`.trim();

  const htmlBody = `
<div style="font-family: -apple-system, sans-serif; line-height: 1.6; color: #1a1d27; max-width: 640px;">
  <h2 style="color: #f97316; font-weight: 700;">Neue Kontaktanfrage</h2>
  <table style="border-collapse: collapse;">
    <tr><td style="padding: 4px 12px 4px 0; color: #8b8fa3;">Name:</td><td><strong>${escapeHtml(name)}</strong></td></tr>
    <tr><td style="padding: 4px 12px 4px 0; color: #8b8fa3;">E-Mail:</td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
    <tr><td style="padding: 4px 12px 4px 0; color: #8b8fa3;">Firma:</td><td>${escapeHtml(company || '(nicht angegeben)')}</td></tr>
    <tr><td style="padding: 4px 12px 4px 0; color: #8b8fa3;">IP:</td><td style="font-family: monospace; font-size: 13px;">${escapeHtml(ip)}</td></tr>
  </table>
  <h3 style="margin-top: 24px;">Nachricht</h3>
  <div style="white-space: pre-wrap; padding: 16px; background: #f4f5f8; border-radius: 8px;">${escapeHtml(message)}</div>
  <p style="margin-top: 24px; color: #8b8fa3; font-size: 12px;">Über Kontaktformular auf anywork.ing</p>
</div>`.trim();

  // --- Send via Resend ---
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [targetEmail],
        reply_to: email,
        subject,
        text: safeBody,
        html: htmlBody,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      console.error('Resend error:', resp.status, err);
      return new Response(
        JSON.stringify({ error: 'Mail konnte nicht zugestellt werden. Bitte direkt an kontakt@anywork.ing schreiben.' }),
        { status: 502, headers },
      );
    }
  } catch (err) {
    console.error('Resend network error:', err);
    return new Response(
      JSON.stringify({ error: 'Netzwerkfehler beim Mail-Versand. Bitte direkt an kontakt@anywork.ing schreiben.' }),
      { status: 502, headers },
    );
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

// GET / OPTIONS / etc. — höflich abweisen
export async function onRequest({ request }) {
  if (request.method === 'POST') {
    // Wird durch onRequestPost gehandelt — Fallback nicht nötig
    return new Response('Method Not Allowed', { status: 405 });
  }
  return new Response('Method Not Allowed', { status: 405, headers: { 'Allow': 'POST' } });
}
