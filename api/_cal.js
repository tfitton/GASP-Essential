/* GASP! Essential · calendar helper for the audit booking step (not a route: Vercel skips files starting with _).
   After the lead form, /api/lead returns open times from Tyler's Outlook calendar plus a signed token, and the visitor
   picks one; /api/book creates the Teams meeting and Outlook sends the invite. Name and email are typed once.
   Needs the same Entra app as the email alert (MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, LEAD_MAILBOX) with the
   Calendars.ReadWrite application permission. Without them slots() returns [] and the page falls back to BOOKING_URL. */
const crypto = require("crypto");

const env = k => (process.env[k] || "").trim();
const T = () => AbortSignal.timeout(4000); // token + schedule stay well inside the function limit
const TZ = "America/Chicago";
const STEP = 30, LEN = 15;             // offer :00 and :30 starts, 15-minute audit
const OPEN = 9 * 60, LAST = 16 * 60 + 30; // first and last start, Central
const DAYS = 5, NOTICE = 120;          // next 5 business days, at least 2 hours out
const TTL = 60 * 60;                   // a booking token lives an hour

const ready = () => !!(env("MS_TENANT_ID") && env("MS_CLIENT_ID") && env("MS_CLIENT_SECRET") && env("LEAD_MAILBOX"));

async function graphToken() {
  const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(env("MS_TENANT_ID"))}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env("MS_CLIENT_ID"), client_secret: env("MS_CLIENT_SECRET"), grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }),
    signal: T()
  });
  if (!r.ok) throw new Error(`token ${r.status}`);
  return (await r.json()).access_token;
}

// Central wall clock for an instant: weekday 1-7 (Mon-Sun), minutes after midnight, and the local date
const fmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function local(t) {
  const p = Object.fromEntries(fmt.formatToParts(t).map(x => [x.type, x.value]));
  return { wd: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday) + 1, min: +p.hour * 60 + +p.minute, day: `${p.year}-${p.month}-${p.day}` };
}
const bookable = t => { const l = local(t); return l.wd <= 5 && l.min >= OPEN && l.min <= LAST; };

// availabilityView: one char per STEP minutes from start, "0" = free. Returns ISO starts, first DAYS business days.
function pick(view, start, now) {
  const out = [], days = new Set();
  for (let i = 0; i < view.length; i++) {
    const t = new Date(start.getTime() + i * STEP * 60000);
    if (view[i] !== "0" || t - now < NOTICE * 60000 || !bookable(t)) continue;
    const d = local(t).day;
    if (!days.has(d) && days.size === DAYS) break;
    days.add(d); out.push(t.toISOString());
  }
  return out;
}

async function schedule(token, start, end) {
  const mb = env("LEAD_MAILBOX");
  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mb)}/calendar/getSchedule`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ schedules: [mb], startTime: { dateTime: start.toISOString().slice(0, 19), timeZone: "UTC" }, endTime: { dateTime: end.toISOString().slice(0, 19), timeZone: "UTC" }, availabilityViewInterval: STEP }),
    signal: T()
  });
  if (!r.ok) throw new Error(`schedule ${r.status} ${(await r.text()).slice(0, 200)}`);
  const v = (await r.json()).value?.[0];
  if (!v || v.error) throw new Error(`schedule ${v?.error?.message || "empty"}`);
  return v.availabilityView || "";
}

async function slots(now = new Date()) {
  if (!ready()) return [];
  const start = new Date(Math.ceil(now.getTime() / (STEP * 60000)) * STEP * 60000);
  const end = new Date(start.getTime() + 9 * 864e5); // 9 calendar days always holds 5 business days
  return pick(await schedule(await graphToken(), start, end), start, now);
}

// ponytail: free/busy is re-checked right before booking, but two visitors in the same second could still both get a slot; Outlook shows the overlap.
async function book(lead, iso) {
  const t = new Date(iso);
  if (isNaN(t) || t.getTime() % (STEP * 60000) || t - Date.now() < 30 * 60000 || !bookable(t)) return { taken: true };
  const token = await graphToken();
  if ((await schedule(token, t, new Date(t.getTime() + STEP * 60000)))[0] !== "0") return { taken: true };
  const end = new Date(t.getTime() + LEN * 60000), mb = env("LEAD_MAILBOX");
  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mb)}/events`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: `Lead response audit · ${lead.c || lead.n}`,
      body: { contentType: "Text", content: [`${lead.n} · ${lead.c || "n/a"}`, lead.e, `Team size: ${lead.s || "n/a"}`, `Booked from gaspessential.com/${lead.p || "audit"}`].join("\n") },
      start: { dateTime: t.toISOString().slice(0, 19), timeZone: "UTC" }, end: { dateTime: end.toISOString().slice(0, 19), timeZone: "UTC" },
      attendees: [{ emailAddress: { address: lead.e, name: lead.n }, type: "required" }],
      isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness",
      transactionId: `${lead.id}-${t.getTime()}`  // Graph drops a repeat POST for the same lead + slot, so a double tap never double-books
    }),
    signal: T()
  });
  if (!r.ok) throw new Error(`event ${r.status} ${(await r.text()).slice(0, 200)}`);
  return { start: t.toISOString() };
}

// The token carries the lead the visitor already typed, so /api/book needs no storage and can't book for a stranger.
const key = () => crypto.createHash("sha256").update("gasp-book:" + env("MS_CLIENT_SECRET")).digest();
const b64 = s => Buffer.from(s).toString("base64url");
function sign(lead) {
  const body = b64(JSON.stringify({ ...lead, x: Math.floor(Date.now() / 1000) + TTL }));
  return body + "." + crypto.createHmac("sha256", key()).update(body).digest("base64url");
}
function verify(tok) {
  const [body, mac] = String(tok || "").split(".");
  if (!body || !mac || !ready()) return null;
  const want = crypto.createHmac("sha256", key()).update(body).digest();
  const got = Buffer.from(mac, "base64url");
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  const lead = JSON.parse(Buffer.from(body, "base64url").toString());
  return lead.x > Date.now() / 1000 ? lead : null;
}

module.exports = { ready, slots, book, sign, verify, pick };

// self-check: node api/_cal.js
if (require.main === module) {
  const assert = require("assert");
  const start = new Date("2026-11-03T14:00:00Z");           // Tue 8:00 AM Central
  const now = new Date("2026-11-03T13:00:00Z");
  const s = pick("0".repeat(9 * 48), start, now);
  assert.strictEqual(s[0], "2026-11-03T15:00:00.000Z");     // 9:00 AM CT is the first start
  assert.ok(s.includes("2026-11-03T22:30:00.000Z"));        // 4:30 PM CT is the last
  assert.ok(!s.includes("2026-11-03T23:00:00.000Z"));       // 5:00 PM is not offered
  assert.ok(!s.some(x => ["Sat", "Sun"].includes(new Date(x).toLocaleDateString("en-US", { timeZone: TZ, weekday: "short" }))));
  assert.strictEqual(new Set(s.map(x => local(new Date(x)).day)).size, 5);
  assert.ok(!pick("2" + "0".repeat(400), start, now).includes("2026-11-03T14:00:00.000Z"));
  assert.strictEqual(pick("0".repeat(48), start, new Date("2026-11-03T15:30:00Z"))[0], "2026-11-03T17:30:00.000Z"); // 2-hour notice
  process.env.MS_TENANT_ID = process.env.MS_CLIENT_ID = process.env.MS_CLIENT_SECRET = process.env.LEAD_MAILBOX = "x";
  const tok = sign({ n: "A", e: "a@b.co", id: "1" });
  assert.strictEqual(verify(tok).e, "a@b.co");
  assert.strictEqual(verify(tok.slice(0, -2) + "xx"), null);
  console.log("ok", s.length, "slots");
}
