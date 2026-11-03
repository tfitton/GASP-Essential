/* GASP! Essential · POST /api/book  {token, slot}
   Books the audit time the visitor picked right after the lead form. The token (signed by /api/lead) holds the
   name and email they already typed, so they never type them twice. Calendar logic lives in _cal.js. */
const cal = require("./_cal");

const ALLOWED = /^https:\/\/(www\.)?gaspessential\.com$|^https:\/\/gasp-essential-[a-z0-9-]+\.vercel\.app$|^http:\/\/localhost(:\d+)?$/i;

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ ok: false }); }
  const origin = String(req.headers.origin || "");
  if (!ALLOWED.test(origin)) return res.status(403).json({ ok: false });  // browsers always send Origin on a POST; none means a script
  let b;
  try { b = req.body; } catch { b = null; }
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
  const lead = b && typeof b === "object" ? cal.verify(b.token) : null;
  if (!lead) return res.status(400).json({ ok: false, error: "token" });
  try {
    const r = await cal.book(lead, String(b.slot || ""));
    if (r.taken) {
      const slots = await cal.slots().catch(() => []);
      return res.status(409).json({ ok: false, error: "taken", slots });
    }
    console.log("BOOKED", JSON.stringify({ email: lead.e, company: lead.c, start: r.start, event_id: lead.id }));
    return res.status(200).json({ ok: true, start: r.start });
  } catch (e) {
    console.error("book failed:", e.message);
    return res.status(502).json({ ok: false, error: "book" });
  }
};
