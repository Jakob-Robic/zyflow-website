/**
 * Town page swipe rows: the arrows scroll the row by one card, and switch off
 * at either end. The row itself scrolls natively (touch, trackpad, keyboard).
 */
(function () {
  function setup(block) {
    const track = block.querySelector("[data-rail-track]");
    const prev = block.querySelector("[data-rail-prev]");
    const next = block.querySelector("[data-rail-next]");
    if (!track || !prev || !next) return;

    function step() {
      const card = track.firstElementChild;
      if (!card) return track.clientWidth;
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return card.getBoundingClientRect().width + gap;
    }
    const count = block.querySelector("[data-rail-count]");
    const total = track.children.length;
    function update() {
      const max = track.scrollWidth - track.clientWidth;
      if (count) {
        // "1–2 / 7": which cards are in view, so a row of whole cards still says there are more.
        const size = step();
        const perView = Math.max(1, Math.floor((track.clientWidth + 1) / size));
        const first = Math.min(total, Math.round(track.scrollLeft / size) + 1);
        const last = Math.min(total, first + perView - 1);
        count.textContent = total > perView ? (first === last ? `${first} / ${total}` : `${first}–${last} / ${total}`) : "";
      }
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= max - 2;
      // The row fades out only on a side that still has cards to show.
      track.classList.toggle("is-scrolled", track.scrollLeft > 2);
      track.classList.toggle("is-at-end", track.scrollLeft >= max - 2);
    }
    prev.addEventListener("click", () => track.scrollBy({ left: -step(), behavior: "smooth" }));
    next.addEventListener("click", () => track.scrollBy({ left: step(), behavior: "smooth" }));
    track.addEventListener("scroll", update, { passive: true });
    // Distance from the screen edge to the content column. On phones the row
    // uses it to run edge to edge while its first card stays on the column.
    function gutter() {
      const left = block.getBoundingClientRect().left;
      track.style.setProperty("--town-gutter", `${Math.max(0, Math.round(left))}px`);
    }
    new ResizeObserver(() => {
      gutter();
      update();
    }).observe(block);
    gutter();
    update();
  }

  function boot() {
    document.querySelectorAll("[data-rail]").forEach(setup);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
