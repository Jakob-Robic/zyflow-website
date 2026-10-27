document.querySelectorAll(".faq__q").forEach((btn) => {
  btn.addEventListener("click", () => {
    const item = btn.closest(".faq__item");
    const open = item.classList.contains("is-open");

    document.querySelectorAll(".faq__item").forEach((el) => {
      el.classList.remove("is-open");
      const q = el.querySelector(".faq__q");
      if (q) q.setAttribute("aria-expanded", "false");
    });

    if (!open) {
      item.classList.add("is-open");
      btn.setAttribute("aria-expanded", "true");
    }
  });
});

/**
 * Cream light / olive dark — drove by header .theme-toggle (moon/sun).
 * Click animates a circular reveal from the pressed control (View Transitions).
 */
(function initTheme() {
  const STORAGE_KEY = "zyflow-theme";
  const root = document.documentElement;
  const buttons = Array.from(document.querySelectorAll(".theme-toggle [data-theme]"));

  function normalize(value) {
    // "auto" follows the OS (design-system tokens ship all three selectors).
    return value === "dark" || value === "auto" ? value : "light";
  }

  function readStored() {
    try {
      return normalize(localStorage.getItem(STORAGE_KEY));
    } catch (_e) {
      return "light";
    }
  }

  function syncControls(theme) {
    buttons.forEach((btn) => {
      const on = btn.getAttribute("data-theme") === theme;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function applyTheme(theme) {
    const next = normalize(theme);
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (_e) {
      /* ignore quota / private mode */
    }
    syncControls(next);
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function setThemeOrigin(fromEl) {
    const rect = fromEl?.getBoundingClientRect?.();
    if (!rect) {
      root.style.removeProperty("--theme-x");
      root.style.removeProperty("--theme-y");
      return;
    }
    root.style.setProperty("--theme-x", `${rect.left + rect.width / 2}px`);
    root.style.setProperty("--theme-y", `${rect.top + rect.height / 2}px`);
  }

  function setTheme(theme, { animate = false, fromEl = null } = {}) {
    const next = normalize(theme);
    const current = normalize(root.getAttribute("data-theme") || readStored());
    if (next === current) {
      syncControls(next);
      return;
    }

    const run = () => applyTheme(next);

    if (
      !animate ||
      prefersReducedMotion() ||
      typeof document.startViewTransition !== "function"
    ) {
      run();
      return;
    }

    setThemeOrigin(fromEl);
    root.classList.add("theme-transitioning");
    const transition = document.startViewTransition(run);
    transition.finished.finally(() => {
      root.classList.remove("theme-transitioning");
      root.style.removeProperty("--theme-x");
      root.style.removeProperty("--theme-y");
    });
  }

  setTheme(root.getAttribute("data-theme") || readStored(), { animate: false });

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      setTheme(btn.getAttribute("data-theme"), { animate: true, fromEl: btn });
    });
  });
})();

/**
 * Active nav link from body[data-nav].
 */
(function initNavActive() {
  const key = document.body.getAttribute("data-nav");
  if (!key) return;
  document.querySelectorAll("[data-nav-link]").forEach((link) => {
    const active = link.getAttribute("data-nav-link") === key;
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
})();

/**
 * Mobile nav panel — hamburger toggle, focus trap, Escape / outside close.
 */
(function initNavMenu() {
  const nav = document.querySelector(".nav");
  const toggle = document.querySelector("[data-nav-menu-toggle]");
  const panel = document.querySelector("[data-nav-panel]");
  if (!nav || !toggle || !panel) return;

  const mq = window.matchMedia("(max-width: 1100px)");
  let lastFocus = null;

  function focusableIn(root) {
    return Array.from(
      root.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
  }

  function setOpen(open) {
    const openLabel =
      toggle.getAttribute("data-label-open") ||
      toggle.getAttribute("aria-label") ||
      "Menu";
    const closeLabel =
      toggle.getAttribute("data-label-close") ||
      (document.documentElement.lang === "sl" ? "Zapri meni" : "Close menu");
    if (!toggle.getAttribute("data-label-open")) {
      toggle.setAttribute("data-label-open", openLabel);
    }
    if (open) {
      lastFocus = document.activeElement;
      nav.classList.add("is-open");
      panel.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", closeLabel);
      const items = focusableIn(panel);
      if (items[0]) items[0].focus();
      else toggle.focus();
    } else {
      nav.classList.remove("is-open");
      panel.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", openLabel);
      if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
      else toggle.focus();
    }
  }

  function isOpen() {
    return nav.classList.contains("is-open");
  }

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!mq.matches) return;
    setOpen(!isOpen());
  });

  panel.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      if (isOpen()) setOpen(false);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (!isOpen()) return;

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }

    if (event.key !== "Tab") return;

    const items = focusableIn(panel);
    const controls = [toggle, ...items];
    if (!controls.length) return;

    const first = controls[0];
    const last = controls[controls.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || active === toggle)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });

  document.addEventListener("click", (event) => {
    if (!isOpen()) return;
    if (nav.contains(event.target)) return;
    setOpen(false);
  });

  function onViewportChange() {
    if (!mq.matches && isOpen()) setOpen(false);
  }

  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", onViewportChange);
  } else if (typeof mq.addListener === "function") {
    mq.addListener(onViewportChange);
  }
})();

/**
 * Active legal document switcher from body[data-legal].
 */
(function initLegalActive() {
  const key = document.body.getAttribute("data-legal");
  if (!key) return;
  document.querySelectorAll("[data-legal-link]").forEach((link) => {
    const active = link.getAttribute("data-legal-link") === key;
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
})();

/**
 * Tours page category + region filter (supports ?type= and ?region=).
 */
(function initToursFilter() {
  const bar = document.querySelector(".tours-filter");
  const grid = document.querySelector("[data-tours-grid]");
  if (!bar || !grid) return;

  const buttons = Array.from(bar.querySelectorAll("[data-filter]"));
  const cards = Array.from(grid.querySelectorAll(".tour-card[data-category]"));
  const empty = document.querySelector("[data-tours-empty]");
  const filtersWrap = document.querySelector("[data-tours-filters]");
  const typeChip = document.querySelector("[data-tours-type-clear]");
  const typeLabel = document.querySelector("[data-tours-type-label]");
  const typeLabels = document.querySelector("[data-tours-type-labels]");
  const regionChip = document.querySelector("[data-tours-region-clear]");
  const regionLabel = document.querySelector("[data-tours-region-label]");
  const regionLabels = document.querySelector("[data-tours-region-labels]");

  /* Only categories that are actually rendered (a route exists). A stale
     ?type=commute link then falls through to the full list instead of an empty grid. */
  const VALID_TYPES = new Set(
    buttons
      .map((btn) => btn.getAttribute("data-filter") || "")
      .filter((value) => value && value !== "all")
  );
  const VALID_REGIONS = new Set(["slovenia", "croatia", "austria", "italy"]);
  /* Only Slovenia routes are live for now; other region deep-links are ignored. */
  const LIVE_REGIONS = new Set(["slovenia"]);

  const params = new URLSearchParams(window.location.search);
  let typeFilter = "all";
  let regionFilter = "";

  const typeParam = (params.get("type") || "").toLowerCase();
  const staleType = Boolean(typeParam) && !VALID_TYPES.has(typeParam);
  if (VALID_TYPES.has(typeParam)) typeFilter = typeParam;

  const regionParam = (params.get("region") || "").toLowerCase();
  if (VALID_REGIONS.has(regionParam) && LIVE_REGIONS.has(regionParam)) {
    regionFilter = regionParam;
  }

  function typeDisplayName(key) {
    const el = typeLabels?.querySelector(`[data-type-key="${key}"]`);
    return el?.textContent?.trim() || key;
  }

  function regionDisplayName(key) {
    const el = regionLabels?.querySelector(`[data-region-key="${key}"]`);
    return el?.textContent?.trim() || key;
  }

  function syncUrl() {
    const url = new URL(window.location.href);
    if (typeFilter === "all") url.searchParams.delete("type");
    else url.searchParams.set("type", typeFilter);
    if (!regionFilter) url.searchParams.delete("region");
    else url.searchParams.set("region", regionFilter);
    const qs = url.searchParams.toString();
    window.history.replaceState({}, "", url.pathname + (qs ? `?${qs}` : "") + url.hash);
  }

  function syncChips() {
    const hasType = typeFilter !== "all";
    const hasRegion = Boolean(regionFilter);

    if (typeChip) {
      typeChip.hidden = !hasType;
      if (hasType && typeLabel) typeLabel.textContent = typeDisplayName(typeFilter);
    }
    if (regionChip) {
      regionChip.hidden = !hasRegion;
      if (hasRegion && regionLabel) regionLabel.textContent = regionDisplayName(regionFilter);
    }
    if (filtersWrap) filtersWrap.hidden = !(hasType || hasRegion);
  }

  function apply() {
    let visible = 0;
    cards.forEach((card) => {
      const cat = card.getAttribute("data-category") || "";
      const regions = (card.getAttribute("data-region") || "").toLowerCase().split(/\s+/).filter(Boolean);
      const typeOk = typeFilter === "all" || cat === typeFilter;
      const regionOk = !regionFilter || regions.includes(regionFilter);
      const match = typeOk && regionOk;
      card.classList.toggle("is-filtered-out", !match);
      if (match) visible += 1;
    });
    if (empty) empty.hidden = visible > 0;
    syncChips();
  }

  function setActiveType(filter, { updateHistory = true } = {}) {
    typeFilter = VALID_TYPES.has(filter) || filter === "all" ? filter : "all";
    buttons.forEach((b) => {
      const on = (b.getAttribute("data-filter") || "all") === typeFilter;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (updateHistory) syncUrl();
    apply();
  }

  function clearType() {
    setActiveType("all");
  }

  function clearRegion() {
    regionFilter = "";
    syncUrl();
    apply();
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      setActiveType(btn.getAttribute("data-filter") || "all");
    });
  });

  typeChip?.addEventListener("click", clearType);
  regionChip?.addEventListener("click", clearRegion);

  // Activate type from URL (same as clicking the matching button).
  // A type with no routes is dropped from the URL so the address matches the full list.
  setActiveType(typeFilter, { updateHistory: staleType });
})();

/**
 * Scroll fade-in for main sections (+ staggered children where useful).
 */
(function initScrollReveal() {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sections = Array.from(document.querySelectorAll("main > .section"));
  if (sections.length === 0) return;

  const childSelectors = [
    ".tour-card",
    ".cat-card",
    ".feature-card",
    ".journal__story",
    ".faq__item",
    ".social-video",
    ".tours-qual",
    ".tour-meta__box",
    ".tour-article__figure",
    ".blog-feature",
    ".blog-story",
    ".article__quote",
    ".about-value",
    ".about-member",
    ".contact-social",
  ].join(", ");

  /* Sections with torn dividers / tall card grids: keep shell static, animate children */
  const staticShellSections = new Set(["why", "testimonial", "tours-grid", "tour-quote", "about-values", "about-hero"]);

  sections.forEach((section) => {
    const isStaticShell = [...staticShellSections].some((name) =>
      section.classList.contains(name)
    );

    if (isStaticShell) {
      section.classList.add("reveal-shell");
    } else {
      section.classList.add("reveal");
    }

    const isToursGrid = section.classList.contains("tours-grid");
    section.querySelectorAll(childSelectors).forEach((child, i) => {
      child.classList.add("reveal", "reveal--child");
      /* Tours grid: stagger within each row; other sections: sequential cap */
      const delay = isToursGrid ? (i % 3) * 90 : Math.min(i * 80, 320);
      child.style.setProperty("--reveal-delay", `${delay}ms`);
    });
    section.querySelectorAll(".featured-tour__polaroid, .about-hero__polaroid, .app-banner__polaroid").forEach((polaroid, i) => {
      polaroid.classList.add("reveal--fly");
      polaroid.style.setProperty("--reveal-delay", `${180 + i * 140}ms`);
    });
    section.querySelectorAll(".why__item").forEach((item, i) => {
      item.classList.add("reveal--from-right");
      item.style.setProperty("--reveal-delay", `${120 + i * 140}ms`);
    });
    section.querySelectorAll(".why__left, .testimonial__panel").forEach((block, i) => {
      block.classList.add("reveal", "reveal--child");
      block.style.setProperty("--reveal-delay", `${i * 100}ms`);
    });
  });

  const sectionTargets = document.querySelectorAll(
    "main > .section.reveal, main > .section.reveal-shell"
  );
  /* Children observed on their own so tall grids fade in as you scroll */
  const childTargets = document.querySelectorAll("main .reveal--child");

  function show(el) {
    el.classList.add("is-visible");
    /* Cascade only for motion tied to the section moment (polaroids / why fly-ins) */
    el.querySelectorAll(".reveal--fly, .reveal--from-right").forEach((child) => {
      child.classList.add("is-visible");
    });
  }

  if (reducedMotion) {
    document
      .querySelectorAll(".reveal, .reveal-shell, .reveal--fly, .reveal--from-right")
      .forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        show(entry.target);
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -6% 0px", threshold: [0, 0.08, 0.2] }
  );

  sectionTargets.forEach((el) => {
    if (el.classList.contains("hero") || el.classList.contains("tours-hero") || el.classList.contains("tour-hero") || el.classList.contains("blog-hero") || el.classList.contains("article") || el.classList.contains("about-hero") || el.classList.contains("contact-hero") || el.classList.contains("contact-form") || el.classList.contains("legal-hub") || el.classList.contains("legal-doc")) {
      show(el);
      return;
    }
    observer.observe(el);
  });

  childTargets.forEach((el) => observer.observe(el));

  /* Fallback for environments where IO misses programmatic / nested scrolls */
  function revealInView() {
    const vh = window.innerHeight;
    childTargets.forEach((el) => {
      if (el.classList.contains("is-visible")) return;
      const rect = el.getBoundingClientRect();
      const visiblePx = Math.min(rect.bottom, vh * 0.94) - Math.max(rect.top, 0);
      if (visiblePx / Math.max(rect.height, 1) >= 0.12) {
        show(el);
        observer.unobserve(el);
      }
    });
  }

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    /* setTimeout — rAF can stall in background / embedded preview tabs */
    setTimeout(() => {
      ticking = false;
      revealInView();
    }, 32);
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  revealInView();
})();

/**
 * Trust carousel
 * Configure on <section class="trust">:
 *   data-carousel-mode="marquee" | "fade"   (default: marquee)
 *   data-carousel-speed="35"                marquee loop duration in seconds
 *   data-carousel-interval="4200"           fade dwell time in ms
 */
(function initTrustCarousel() {
  const section = document.querySelector(".trust[data-section='home.trust']");
  const root = document.querySelector("[data-trust-carousel]");
  if (!section || !root) return;

  const track = root.querySelector("[data-trust-track]");
  const dotsWrap = root.querySelector("[data-trust-dots]");
  if (!track) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const modeAttr = (section.getAttribute("data-carousel-mode") || "marquee").toLowerCase();
  const mode = reducedMotion && modeAttr === "marquee" ? "static" : modeAttr;
  const speed = Number(section.getAttribute("data-carousel-speed") || 35);
  const interval = Number(section.getAttribute("data-carousel-interval") || 4200);

  root.dataset.mode = mode === "fade" ? "fade" : mode === "static" ? "static" : "marquee";
  root.style.setProperty("--trust-speed", `${Math.max(12, speed)}s`);

  const originals = Array.from(track.querySelectorAll("[data-trust-slide]"));
  if (originals.length === 0) return;

  if (mode === "marquee") {
    // Duplicate slides for seamless loop (transform -50%)
    originals.forEach((slide) => {
      const clone = slide.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      clone.removeAttribute("data-trust-slide");
      track.appendChild(clone);
    });
    return;
  }

  if (mode === "static") {
    track.style.width = "100%";
    track.style.justifyContent = "center";
    track.style.flexWrap = "wrap";
    return;
  }

  // Fade mode
  if (dotsWrap) {
    dotsWrap.hidden = false;
    dotsWrap.replaceChildren();
  }

  let index = 0;
  let timer = null;

  function show(i) {
    index = (i + originals.length) % originals.length;
    originals.forEach((slide, n) => {
      const active = n === index;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", active ? "false" : "true");
    });
    if (dotsWrap) {
      dotsWrap.querySelectorAll(".trust-carousel__dot").forEach((dot, n) => {
        dot.classList.toggle("is-active", n === index);
        dot.setAttribute("aria-selected", n === index ? "true" : "false");
      });
    }
  }

  originals.forEach((slide, n) => {
    slide.setAttribute("role", "group");
    slide.setAttribute("aria-roledescription", "slide");
    slide.setAttribute("aria-label", `${n + 1} of ${originals.length}`);

    if (dotsWrap) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "trust-carousel__dot";
      dot.setAttribute("aria-label", `Show award ${n + 1}`);
      dot.addEventListener("click", () => {
        show(n);
        restart();
      });
      dotsWrap.appendChild(dot);
    }
  });

  function restart() {
    clearInterval(timer);
    timer = setInterval(() => show(index + 1), Math.max(2000, interval));
  }

  root.addEventListener("mouseenter", () => clearInterval(timer));
  root.addEventListener("mouseleave", restart);
  root.addEventListener("focusin", () => clearInterval(timer));
  root.addEventListener("focusout", restart);

  show(0);
  if (!reducedMotion) restart();
})();

/**
 * App download modal — open from [data-app-modal-open], close on X / backdrop / Escape.
 */
(function initAppModal() {
  const dialog = document.getElementById("app-modal");
  if (!dialog || typeof dialog.showModal !== "function") return;

  function openModal(event) {
    event.preventDefault();
    if (dialog.open) return;
    dialog.showModal();
    const closeBtn = dialog.querySelector("[data-app-modal-close]");
    closeBtn?.focus();
  }

  function closeModal() {
    if (dialog.open) dialog.close();
  }

  document.querySelectorAll("[data-app-modal-open]").forEach((el) => {
    el.addEventListener("click", openModal);
  });

  dialog.querySelectorAll("[data-app-modal-close]").forEach((el) => {
    el.addEventListener("click", closeModal);
  });

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeModal();
  });

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeModal();
  });
})();

/**
 * Horizontal snap slider for why / app-flow steps on tablet & phone.
 */
(function initSnapSliders() {
  const mq = window.matchMedia("(max-width: 1100px)");
  const isSl = document.documentElement.lang === "sl";

  const configs = [
    {
      list: ".why__list",
      item: ".why__item",
      dotsClass: "why__dots",
      dotClass: "why__dot",
      label: isSl ? "Korak" : "Step",
    },
  ];

  configs.forEach((cfg) => {
    document.querySelectorAll(cfg.list).forEach((list) => {
      const items = Array.from(list.querySelectorAll(cfg.item));
      if (items.length < 2) return;

      list.setAttribute("tabindex", "0");
      list.setAttribute("role", "region");
      list.setAttribute("aria-roledescription", "carousel");

      const dots = document.createElement("div");
      dots.className = cfg.dotsClass;
      dots.setAttribute("role", "tablist");
      dots.setAttribute("aria-label", cfg.label);

      items.forEach((item, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = cfg.dotClass;
        btn.setAttribute("role", "tab");
        btn.setAttribute("aria-label", `${cfg.label} ${i + 1}`);
        btn.addEventListener("click", () => {
          item.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
        });
        dots.appendChild(btn);
      });
      list.insertAdjacentElement("afterend", dots);

      function sync() {
        if (!mq.matches) {
          dots.hidden = true;
          return;
        }
        dots.hidden = false;
        const mid = list.getBoundingClientRect().left + list.clientWidth / 2;
        let best = 0;
        let bestDist = Infinity;
        items.forEach((item, i) => {
          const r = item.getBoundingClientRect();
          const d = Math.abs(r.left + r.width / 2 - mid);
          if (d < bestDist) {
            bestDist = d;
            best = i;
          }
        });
        dots.querySelectorAll(`.${cfg.dotClass}`).forEach((dot, i) => {
          const on = i === best;
          dot.classList.toggle("is-active", on);
          dot.setAttribute("aria-selected", on ? "true" : "false");
        });
      }

      let ticking = false;
      list.addEventListener(
        "scroll",
        () => {
          if (ticking) return;
          ticking = true;
          requestAnimationFrame(() => {
            sync();
            ticking = false;
          });
        },
        { passive: true }
      );

      mq.addEventListener("change", sync);
      window.addEventListener("resize", sync, { passive: true });
      sync();
    });
  });
})();

/** Preselect contact topic from ?topic= when arriving from business / press CTAs. */
(function initContactTopic() {
  const select = document.getElementById("contact-topic");
  if (!select) return;
  const topic = new URLSearchParams(window.location.search).get("topic");
  if (!topic) return;
  if ([...select.options].some((opt) => opt.value === topic)) {
    select.value = topic;
  }
})();

/** Journal hub filters (?country=&region=&type=&act=&topic=). No-JS visitors still see every card. */
(function initBlogFilter() {
  const bar = document.querySelector("[data-blog-filters]");
  const grid = document.querySelector("[data-blog-grid]");
  if (!bar || !grid) return;

  const cards = Array.from(document.querySelectorAll("[data-blog-card]"));
  const empty = document.querySelector("[data-blog-empty]");
  const state = { country: "all", region: "all", type: "all", act: "all", topic: "all" };
  const params = new URLSearchParams(window.location.search);
  for (const key of Object.keys(state)) {
    const value = params.get(key);
    if (value) state[key] = value;
  }

  function apply() {
    let shown = 0;
    for (const card of cards) {
      const listOf = (name) => (card.getAttribute(name) || "").split(/\s+/).filter(Boolean);
      const ok =
        (state.country === "all" || card.getAttribute("data-country") === state.country) &&
        (state.region === "all" || card.getAttribute("data-region") === state.region) &&
        (state.type === "all" || card.getAttribute("data-type") === state.type) &&
        (state.act === "all" || listOf("data-activities").includes(state.act)) &&
        (state.topic === "all" || listOf("data-tags").includes(state.topic));
      card.hidden = !ok;
      if (ok) shown += 1;
    }
    if (empty) empty.hidden = shown !== 0;
    bar.querySelectorAll("[data-blog-filter]").forEach((btn) => {
      const group = btn.getAttribute("data-blog-filter");
      const on = (btn.getAttribute("data-value") || "all") === state[group];
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  bar.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-blog-filter]");
    if (!btn || !bar.contains(btn)) return;
    const group = btn.getAttribute("data-blog-filter");
    if (!group || !Object.prototype.hasOwnProperty.call(state, group)) return;
    state[group] = btn.getAttribute("data-value") || "all";
    const next = new URLSearchParams();
    for (const key of Object.keys(state)) {
      if (state[key] && state[key] !== "all") next.set(key, state[key]);
    }
    const query = next.toString();
    history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
    apply();
  });

  apply();
})();
