(() => {
  const d = document, root = d.documentElement;
  root.classList.add("js");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const phone = matchMedia("(max-width: 899px)");
  const $$ = (s, r = d) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = t => 1 - Math.pow(1 - t, 3);
  const q = new URLSearchParams(location.search);
  const clean = v => (v || "").replace(/[<>{}$]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
  const bad = s => !s || /^\$|lead\.|first.?name|company/i.test(s);
  const name = clean(q.get("name")), co = clean(q.get("co"));
  const hi = d.getElementById("hi"); if (hi && !bad(name)) hi.textContent = `${name}, embrace your`;
  const cq = d.getElementById("closeq"); if (cq && !bad(co)) cq.textContent = `Who would ${co} hire first?`;
  const btn = d.querySelector(".menu-btn"), menu = d.querySelector(".menu");
  if (btn && menu) {
    const set = open => {
      root.classList.toggle("menu-open", open);
      btn.setAttribute("aria-expanded", String(open));
      btn.querySelector("span").textContent = open ? "Close" : "Menu";
      btn.querySelector("i").className = open ? "ph-fill ph-x" : "ph-fill ph-list";
      menu.toggleAttribute("inert", !open);
      if (open) menu.querySelector("a").focus({ preventScroll: true });
    };
    menu.setAttribute("inert", "");
    btn.addEventListener("click", () => set(!root.classList.contains("menu-open")));
    addEventListener("keydown", e => { if (e.key === "Escape" && root.classList.contains("menu-open")) { set(false); btn.focus(); } });
    phone.addEventListener("change", () => set(false));
  }
  if (!reduce) addEventListener("load", () => {
    $$("picture[data-boil]").forEach(pic => {
      const img = pic.querySelector("img"), src = pic.querySelector("source");
      const url = phone.matches ? pic.dataset.boilM : pic.dataset.boil;
      if (!url) return;
      const pre = new Image();
      pre.onload = () => { if (phone.matches && src) src.srcset = url; else { if (src) src.srcset = pic.dataset.boilM || src.srcset; img.src = url; } };
      pre.src = url;
    });
  });
  const counts = $$("[data-count]");
  const runCount = el => { const to = +el.dataset.count, suf = el.dataset.suf || "", t0 = performance.now(), dur = reduce ? 0 : 1400;
    const step = now => { const k = dur ? clamp((now - t0) / dur) : 1; el.textContent = Math.round(to * ease(k)) + suf; if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); };
  if ("IntersectionObserver" in window) { const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { runCount(e.target); io.unobserve(e.target); } }), { threshold: .5 }); counts.forEach(el => io.observe(el)); }
  else counts.forEach(runCount);
  if (reduce) { $$("[data-fly]").forEach(el => { el.style.opacity = 1; }); return; }
  const flyers = $$("[data-fly]").map(el => {
    const g = el.parentElement, i = [...g.children].indexOf(el), cols = getComputedStyle(g).gridTemplateColumns.split(" ").length || 1;
    return { el, lag: (i % cols) * .12 + Math.floor(i / cols) * .04, v: -1 };
  });
  const depths = $$(".depth").map(s => ({ s, q: s.querySelector(".q"), big: s.querySelector(".big") }));
  const frame = () => {
    const vh = innerHeight;
    if (!phone.matches) for (const f of flyers) {
      const r = f.el.getBoundingClientRect();
      if (r.top > vh * 1.2 || r.bottom < -vh * .2) { if (f.v !== 0 && r.top > vh) { f.el.style.opacity = 0; f.v = 0; } continue; }
      const p = ease(clamp((vh - r.top) / (vh * .55) - f.lag));
      if (Math.abs(p - f.v) < .002) continue; f.v = p;
      f.el.style.opacity = p.toFixed(3);
      f.el.style.transform = p > .999 ? "" : `translate3d(0,${((1 - p) * 70).toFixed(1)}px,${((1 - p) * -320).toFixed(1)}px) rotateX(${((1 - p) * 26).toFixed(2)}deg)`;
    } else for (const f of flyers) if (f.v !== 1) { f.el.style.opacity = ""; f.el.style.transform = ""; f.v = 1; }
    for (const o of depths) {
      const r = o.s.getBoundingClientRect(), span = r.height - vh;
      const p = clamp(-r.top / Math.max(1, span));
      const a = ease(clamp(p / .35)), b = ease(clamp((p - .3) / .45)), out = clamp((p - .88) / .12);
      if (o.q) { o.q.style.opacity = (a * (1 - b * .55) * (1 - out)).toFixed(3); o.q.style.transform = `translateZ(${((1 - a) * -400 + b * 120).toFixed(1)}px)`; }
      if (o.big) { o.big.style.opacity = (b * (1 - out)).toFixed(3); o.big.style.transform = `translateZ(${((1 - b) * -2200 + out * 500).toFixed(1)}px) rotateX(${((1 - b) * 22).toFixed(2)}deg)`; }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})();
