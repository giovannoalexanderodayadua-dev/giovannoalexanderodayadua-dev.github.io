/* ============================================================
   maz — landing page interactions
   ============================================================ */
(() => {
  "use strict";

  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  /* ---------- navbar: shrink + bg on scroll ---------- */
  const nav = $("#nav");
  const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 30);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------- mobile menu ---------- */
  const burger = $("#burger");
  const navLinks = $("#navLinks");
  burger.addEventListener("click", () => {
    const open = navLinks.classList.toggle("is-open");
    burger.classList.toggle("is-open", open);
  });
  $$(".nav__link", navLinks).forEach(a =>
    a.addEventListener("click", () => {
      navLinks.classList.remove("is-open");
      burger.classList.remove("is-open");
    })
  );

  /* ---------- active link on scroll (scroll-spy) ---------- */
  const sections = ["home", "about", "studio", "pricing"]
    .map(id => document.getElementById(id))
    .filter(Boolean);
  const links = $$(".nav__link");

  const spy = new IntersectionObserver(
    entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          links.forEach(l =>
            l.classList.toggle("is-active", l.getAttribute("href") === "#" + e.target.id)
          );
        }
      });
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );
  sections.forEach(s => spy.observe(s));

  /* ---------- reveal on scroll ---------- */
  const reveal = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((e, i) => {
        if (e.isIntersecting) {
          // small stagger for siblings entering together
          setTimeout(() => e.target.classList.add("is-in"), i * 70);
          obs.unobserve(e.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  $$("[data-reveal]").forEach(el => reveal.observe(el));

  /* ---------- animated stat counters ---------- */
  const counters = $$("[data-count]");
  const countObs = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const el = e.target;
        const target = +el.dataset.count;
        const dur = 1400;
        const start = performance.now();
        const tick = now => {
          const p = Math.min((now - start) / dur, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(target * eased);
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        obs.unobserve(el);
      });
    },
    { threshold: 0.6 }
  );
  counters.forEach(c => countObs.observe(c));

  /* ---------- cursor glow + card spotlight + hero parallax ---------- */
  const glow = $(".cursor-glow");
  const heroObject = $("#heroObject");
  const cards = $$(".card");
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  if (finePointer) {
    let tx = 0, ty = 0, cx = 0, cy = 0;

    window.addEventListener("mousemove", e => {
      tx = e.clientX;
      ty = e.clientY;

      // parallax for hero focus object
      if (heroObject) {
        const dx = (e.clientX / window.innerWidth - 0.5) * 30;
        const dy = (e.clientY / window.innerHeight - 0.5) * 30;
        heroObject.style.transform = `translateY(-50%) translate3d(${dx}px, ${dy}px, 0)`;
      }

      // card spotlight position
      cards.forEach(card => {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${e.clientX - r.left}px`);
        card.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
    });

    // smooth-follow glow
    const loop = () => {
      cx += (tx - cx) * 0.15;
      cy += (ty - cy) * 0.15;
      glow.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      requestAnimationFrame(loop);
    };
    loop();
  } else {
    glow.style.display = "none";
  }

  /* ---------- year + tiny console flourish ---------- */
  console.log("%cmaz", "font-size:32px;font-weight:800;color:#ff2bd0;");
  console.log("%cgame creation made easy with AI", "color:#2ce8ff;");
})();
