/* GASP! Essential · lead form. Posts to /api/lead (Conversions API + email alert), fires the
   matching browser Lead event with the same event_id so Meta counts it once, then lets the visitor
   pick a time right here (/api/book, no second form). If the calendar isn't connected it links to the booking page. */
(() => {
  const form = document.querySelector("form.lead");
  if (!form) return;
  const t0 = performance.now();
  const msg = form.querySelector(".msg");
  const btn = form.querySelector('button[type="submit"]');
  const cookie = k => (document.cookie.match(new RegExp("(?:^|; )" + k + "=([^;]*)")) || [])[1] || "";
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const say = (t, err) => { msg.textContent = t; msg.classList.toggle("err", !!err); };
  const qs = new URLSearchParams(location.search);
  const fbc = cookie("_fbc") || (qs.get("fbclid") ? `fb.1.${Date.now()}.${qs.get("fbclid")}` : "");
  const QUALIFIED = ["10-25", "26-50"];
  const EMAIL = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  const event_id = uid(); // one id per form view, reused on retry so Meta never double counts (X's conversion_id too)
  // X event ids from Events Manager > Add event (install with pixel AND Conversion API, so both halves share the event); empty = not fired
  const X_LEAD = "", X_QUALIFIED = "";
  const twclid = qs.get("twclid") || cookie("gasp_twclid");
  const page = form.dataset.page || "site";

  form.querySelectorAll("[required]").forEach(el => {
    el.setAttribute("aria-describedby", "lead-msg");
    el.addEventListener("input", () => el.removeAttribute("aria-invalid"));
    el.addEventListener("change", () => el.removeAttribute("aria-invalid"));
  });

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
  const openLink = booking => {
    const a = el("a", "btn"); a.href = booking; a.target = "_blank"; a.rel = "noopener";
    a.innerHTML = '<span class="t">Open the calendar</span><svg class="b" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg>';
    const c = el("div", "ctas"); c.appendChild(a); return c;
  };
  const CT = { timeZone: "America/Chicago" };
  const dayKey = new Intl.DateTimeFormat("en-US", { ...CT, weekday: "short", month: "short", day: "numeric" });
  const dayTab = new Intl.DateTimeFormat("en-US", { ...CT, weekday: "short" });
  const dayNum = new Intl.DateTimeFormat("en-US", { ...CT, day: "numeric" });
  const clock = new Intl.DateTimeFormat("en-US", { ...CT, hour: "numeric", minute: "2-digit" });

  /* Pick a time: day selector (vanilla port of OriginKit "Shuttle segmented control": a glass block glides
     under the chosen day over a dot grid, 0.24 s on cubic-bezier(.35,.8,.5,1); equal-width days so the block
     moves on transform only) and a grid of open times. One tap books it. */
  function picker(ok, f, j) {
    const first = (f.name || "").trim().split(/\s+/)[0];
    ok.replaceChildren(el("h3", "", `${first ? first + ", pick" : "Pick"} a time.`));
    const groups = new Map();
    for (const iso of j.slots) { const d = new Date(iso), k = dayKey.format(d); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(d); }
    const days = [...groups.values()];
    const shuttle = el("div", "shuttle"); shuttle.setAttribute("role", "radiogroup"); shuttle.setAttribute("aria-label", "Day");
    shuttle.style.setProperty("--n", days.length);
    const blk = el("i", "blk"); blk.setAttribute("aria-hidden", "true"); shuttle.appendChild(blk);
    const times = el("div", "times");
    const note = el("p", "tz mono", "Central time · 15 minutes");
    const tabs = days.map((d, i) => {
      const b = el("button"); b.type = "button"; b.setAttribute("role", "radio");
      b.append(el("span", "", dayTab.format(d[0])), el("b", "", dayNum.format(d[0])));
      b.setAttribute("aria-label", dayKey.format(d[0]));
      b.addEventListener("click", () => choose(i));
      b.addEventListener("keydown", e => {
        const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: days.length - 1 }[e.key];
        if (to === undefined) return;
        e.preventDefault(); const k = (to + days.length) % days.length; choose(k); tabs[k].focus();
      });
      shuttle.appendChild(b); return b;
    });
    function choose(i) {
      tabs.forEach((t, k) => { t.setAttribute("aria-checked", String(k === i)); t.tabIndex = k === i ? 0 : -1; });
      blk.style.transform = `translateX(${i * 100}%)`;
      times.replaceChildren(...days[i].map(d => {
        const b = el("button", "", clock.format(d)); b.type = "button";
        b.addEventListener("click", () => book(d, b));
        return b;
      }));
    }
    async function book(d, b) {
      if (ok.dataset.busy) return; ok.dataset.busy = "1";
      b.classList.add("on"); say("Booking…");
      let r, k = {};
      try { r = await fetch("/api/book", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: j.book_token, slot: d.toISOString() }) }); k = await r.json().catch(() => ({})); }
      catch (_) { r = null; }
      delete ok.dataset.busy;
      if (r && r.ok && k.ok) {
        ok.replaceChildren(el("h3", "", "You're booked."), el("p", "booked mono", `${dayKey.format(d)} · ${clock.format(d)} CT · invite sent to ${f.email}`));
        say(""); ok.focus(); return;
      }
      if (r && r.status === 409 && k.slots && k.slots.length) { j.slots = k.slots; picker(ok, f, j); say("That time just went. Pick another.", true); return; }
      b.classList.remove("on");
      say("That didn't book. Use the calendar instead.", true);
      if (j.booking_url && !ok.querySelector(".ctas")) ok.appendChild(openLink(j.booking_url));
    }
    ok.append(shuttle, times, note);
    if (j.booking_url) {
      const other = el("a", "other mono", "None of these work"); other.href = j.booking_url; other.target = "_blank"; other.rel = "noopener";
      ok.appendChild(other);
    }
    choose(0);
  }

  const done = (f, j) => {
    form.classList.add("done"); say("");
    const ok = el("div", "ok"); ok.setAttribute("role", "status"); ok.tabIndex = -1;
    const booking = /^https:\/\//i.test(j.booking_url || "") ? j.booking_url : null;
    j.booking_url = booking;
    if (Array.isArray(j.slots) && j.slots.length && j.book_token) picker(ok, f, j);
    else {
      const first = (f.name || "").trim().split(/\s+/)[0];
      ok.appendChild(el("h3", "", booking ? `${first ? first + ", pick" : "Pick"} a time.` : "Got it. I'll reply today."));
      if (booking) ok.appendChild(openLink(booking));
    }
    form.prepend(ok); ok.focus({ preventScroll: false });
  };

  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (btn.disabled) return;
    const f = Object.fromEntries(new FormData(form));
    let bad = null;
    for (const el of form.querySelectorAll("[required]")) {
      const ok = el.type === "email" ? EMAIL.test(el.value.trim()) : !!el.value.trim();
      if (ok) el.removeAttribute("aria-invalid"); else el.setAttribute("aria-invalid", "true");
      if (!ok && !bad) bad = el;
    }
    if (bad) { bad.focus(); say("A couple of fields still need you.", true); return; }

    btn.disabled = true; say("Sending…");
    let j;
    try {
      const r = await fetch("/api/lead", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, event_id, fbp: cookie("_fbp"), fbc, twclid, page, url: location.href, t: Math.round(performance.now() - t0) })
      });
      j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "send");
    } catch (err) {
      btn.disabled = false;
      say("That didn't go through. Email tyler.fitton@gaspessential.com and I'll book you myself.", true);
      return;
    }
    // sent: everything below is presentation and tracking, never an error state
    try {
      if (window.fbq) {
        fbq("track", "Lead", { content_name: page }, { eventID: event_id });
        if (QUALIFIED.includes(f.size)) fbq("trackCustom", "QualifiedLead", { content_name: page }, { eventID: event_id + "-q" });
      }
    } catch (_) {}
    try { if (window.lintrk) lintrk("track", { conversion_id: 30134252 }); } catch (_) {}
    try {
      if (window.twq && X_LEAD) twq("event", X_LEAD, { conversion_id: event_id });
      if (window.twq && X_QUALIFIED && QUALIFIED.includes(f.size)) twq("event", X_QUALIFIED, { conversion_id: event_id + "-q" });
    } catch (_) {}
    done(f, j);
  });
})();
