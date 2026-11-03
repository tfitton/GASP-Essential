/* GASP! Essential · /audit reply clock.
   The board counts how long a Friday 4:58 PM inquiry waits (time-lapse), then shows the Monday reply.
   LED glyphs + dot board ported to vanilla canvas from OriginKit "Pixel LED Display" (static mode, no scroll).
   Reduced motion = the final frame only. */
(() => {
  const fig = document.querySelector(".test"), cv = fig && fig.querySelector("canvas.led");
  if (!cv) return;
  const state = fig.querySelector(".state span");
  const END = Number(cv.dataset.end) || 3844;          // minutes: Fri 4:58 PM to Mon 9:02 AM
  const RUN = 6200, HOLD = 3600;                        // ms of time-lapse, ms holding the reply
  const ON = "#E84B1C", OFF = "rgba(232,75,28,.13)";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 5x7 column glyphs (OriginKit Pixel LED Display font, the characters this board needs)
  const F = { "0": [0x3e, 0x51, 0x49, 0x45, 0x3e], "1": [0x00, 0x42, 0x7f, 0x40, 0x00], "2": [0x42, 0x61, 0x51, 0x49, 0x46],
    "3": [0x21, 0x41, 0x45, 0x4b, 0x31], "4": [0x18, 0x14, 0x12, 0x7f, 0x10], "5": [0x27, 0x45, 0x45, 0x45, 0x39],
    "6": [0x3c, 0x4a, 0x49, 0x49, 0x30], "7": [0x01, 0x71, 0x09, 0x05, 0x03], "8": [0x36, 0x49, 0x49, 0x49, 0x36],
    "9": [0x06, 0x49, 0x49, 0x29, 0x1e], "H": [0x7f, 0x08, 0x08, 0x08, 0x7f], "M": [0x7f, 0x02, 0x04, 0x02, 0x7f], " ": [] };
  const cols = s => { const c = []; [...s].forEach((ch, i) => { if (ch === " ") { c.push(0, 0, 0); return; } c.push(...F[ch]); if (i < s.length - 1) c.push(0); }); return c; };
  const label = m => { const h = Math.floor(m / 60), mm = m % 60; return `${String(h).padStart(2, "0")}H ${String(mm).padStart(2, "0")}M`; };

  const ctx = cv.getContext("2d");
  let W = 0, H = 0, dpr = 1;
  function size() { dpr = Math.min(2, devicePixelRatio || 1); W = cv.width = Math.round(cv.clientWidth * dpr); H = cv.height = Math.round(cv.clientHeight * dpr); }
  function draw(m) {
    const c = cols(label(m)), n = c.length, rows = 7;
    const cell = Math.min(H / rows, W / (n + 2)), r = cell * .36, total = Math.floor(W / cell);
    const x0 = (W - total * cell) / 2, y0 = (H - rows * cell) / 2, lead = Math.floor((total - n) / 2);
    ctx.clearRect(0, 0, W, H);
    for (const lit of [false, true]) {
      ctx.beginPath();
      for (let i = 0; i < total; i++) {
        const bits = c[i - lead] || 0;
        for (let y = 0; y < rows; y++) {
          if (!!((bits >> y) & 1) !== lit) continue;
          const px = x0 + i * cell + cell / 2, py = y0 + y * cell + cell / 2;
          ctx.moveTo(px + r, py); ctx.arc(px, py, r, 0, Math.PI * 2);
        }
      }
      ctx.fillStyle = lit ? ON : OFF; ctx.fill();
    }
  }
  let mins = 0, t0 = 0, on = true, replied = false;
  function setReplied(v) { replied = v; fig.classList.toggle("replied", v); state.textContent = v ? "Replied Mon 9:02 AM" : "No reply yet"; }
  function frame(now) {
    if (on) {
      if (!t0) t0 = now;
      const e = now - t0;
      if (e < RUN) { const k = e / RUN; mins = Math.round(END * k * k * k); if (replied) setReplied(false); }
      else { mins = END; if (!replied) setReplied(true); if (e > RUN + HOLD) t0 = now; }
      draw(mins);
    }
    requestAnimationFrame(frame);
  }
  size();
  if ("ResizeObserver" in window) new ResizeObserver(() => { size(); draw(mins); }).observe(cv);
  if (reduce) { mins = END; setReplied(true); draw(mins); return; }
  if ("IntersectionObserver" in window) new IntersectionObserver(es => es.forEach(x => { on = x.isIntersecting; if (on) t0 = 0; }), { threshold: .3 }).observe(fig);
  requestAnimationFrame(frame);
})();
