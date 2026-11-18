/**
 * /tours filters and "Show more" (Routes ↔ Places, 2026-11-18).
 *
 * Filters: ?type= (style: tour, alpine, gravel, commute), ?country=, ?region=, ?kind=
 * (signed | loop) and ?length= (under-30, 30-60, 60-100, 100-plus). The address is
 * shareable; the page's canonical stays the plain /tours, so filtered URLs never compete
 * in search. Every route card is in the HTML (crawlable); cards after the first page are
 * hidden until "Show more", and without JavaScript all of them show.
 *
 * The parsing and matching are plain functions, exported for node --test
 * (rebuild/scripts/test-routes-places.js).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof document !== "undefined") api.init(document, root);
})(typeof window !== "undefined" ? window : this, function () {
  var GROUPS = ["type", "country", "region", "kind", "length"];

  /**
   * Query string → filter state. `valid` maps each group to the values the page offers;
   * an unknown value is dropped (and reported in `dropped` so the address can be cleaned).
   * Legacy links used ?region=<country> (?region=slovenia): read as the country.
   */
  function parseFilterParams(search, valid) {
    var params = new URLSearchParams(search || "");
    var state = { type: "", country: "", region: "", kind: "", length: "" };
    var dropped = [];
    GROUPS.forEach(function (group) {
      var value = (params.get(group) || "").trim().toLowerCase();
      if (!value) return;
      if (group === "region" && !(valid.region || []).includes(value) && (valid.country || []).includes(value)) {
        if (!state.country) state.country = value;
        dropped.push("region");
        return;
      }
      if (group === "type" && value === "all") return;
      if ((valid[group] || []).includes(value)) state[group] = value;
      else dropped.push(group);
    });
    return { state: state, dropped: dropped };
  }

  /** Filter state → query string in a fixed order (no leading "?"; empty when nothing is set). */
  function serializeFilterParams(state) {
    var params = new URLSearchParams();
    GROUPS.forEach(function (group) {
      if (state[group]) params.set(group, state[group]);
    });
    return params.toString();
  }

  /** Does a card (its data-* values) pass the filters? */
  function cardMatches(card, state) {
    var regions = String(card.region || "").split(/\s+/).filter(Boolean);
    return (
      (!state.type || card.category === state.type) &&
      (!state.country || card.country === state.country) &&
      (!state.region || regions.includes(state.region)) &&
      (!state.kind || card.kind === state.kind) &&
      (!state.length || card.length === state.length)
    );
  }

  function hasFilters(state) {
    return GROUPS.some(function (group) {
      return Boolean(state[group]);
    });
  }

  function init(doc, win) {
    var grid = doc.querySelector("[data-tours-grid]");
    var bar = doc.querySelector("[data-tours-type]");
    if (!grid || !bar) return;

    var cards = Array.prototype.slice.call(grid.querySelectorAll(".tour-card"));
    var typeButtons = Array.prototype.slice.call(bar.querySelectorAll("[data-filter]"));
    var groupButtons = Array.prototype.slice.call(doc.querySelectorAll("[data-tours-filter]"));
    var empty = doc.querySelector("[data-tours-empty]");
    var activeRow = doc.querySelector("[data-tours-filters]");
    var chipsWrap = doc.querySelector("[data-tours-chips]");
    var clearButtons = Array.prototype.slice.call(doc.querySelectorAll("[data-tours-clear]"));
    var more = doc.querySelector("[data-tours-more]");
    var status = doc.querySelector("[data-tours-status]");
    var pageSize = Number(grid.getAttribute("data-page-size")) || 24;

    var valid = { type: [], country: [], region: [], kind: [], length: [] };
    typeButtons.forEach(function (btn) {
      var v = btn.getAttribute("data-filter");
      if (v && v !== "all") valid.type.push(v);
    });
    groupButtons.forEach(function (btn) {
      var v = btn.getAttribute("data-value");
      if (v) valid[btn.getAttribute("data-tours-filter")].push(v);
    });

    var parsed = parseFilterParams(win.location.search, valid);
    var state = parsed.state;
    var shown = pageSize;

    function labelFor(group, value) {
      if (group === "type") {
        var t = bar.querySelector('[data-filter="' + value + '"] span');
        return t ? t.textContent.trim() : value;
      }
      var b = doc.querySelector('[data-tours-filter="' + group + '"][data-value="' + value + '"]');
      return b ? b.textContent.trim() : value;
    }

    function syncUrl() {
      var url = new URL(win.location.href);
      GROUPS.forEach(function (g) {
        url.searchParams.delete(g);
      });
      var qs = serializeFilterParams(state);
      // Keep any other parameter (utm_…) as it was.
      var rest = url.searchParams.toString();
      var all = [qs, rest].filter(Boolean).join("&");
      win.history.replaceState({}, "", url.pathname + (all ? "?" + all : "") + url.hash);
    }

    function syncButtons() {
      typeButtons.forEach(function (b) {
        var on = (b.getAttribute("data-filter") || "all") === (state.type || "all");
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      groupButtons.forEach(function (b) {
        var on = (b.getAttribute("data-value") || "") === state[b.getAttribute("data-tours-filter")];
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }

    function syncChips() {
      if (!activeRow || !chipsWrap) return;
      chipsWrap.textContent = "";
      GROUPS.forEach(function (group) {
        if (!state[group]) return;
        var chip = doc.createElement("button");
        chip.type = "button";
        chip.className = "badge badge--pill tours-filters__chip";
        chip.setAttribute("data-chip-group", group);
        var name = doc.createElement("span");
        name.textContent = labelFor(group, state[group]);
        var x = doc.createElement("span");
        x.setAttribute("aria-hidden", "true");
        x.textContent = " ×";
        chip.appendChild(name);
        chip.appendChild(x);
        chip.setAttribute("aria-label", (activeRow.getAttribute("data-remove-label") || "Remove filter") + ": " + name.textContent);
        chip.addEventListener("click", function () {
          state[group] = "";
          update();
        });
        chipsWrap.appendChild(chip);
      });
      activeRow.hidden = !hasFilters(state);
    }

    function cardData(card) {
      return {
        category: card.getAttribute("data-category") || "",
        country: card.getAttribute("data-country") || "",
        region: card.getAttribute("data-region") || "",
        kind: card.getAttribute("data-kind") || "",
        length: card.getAttribute("data-length") || "",
      };
    }

    function apply(announce) {
      var matching = 0;
      cards.forEach(function (card) {
        var ok = cardMatches(cardData(card), state);
        card.classList.toggle("is-filtered-out", !ok);
        if (ok) {
          matching += 1;
          card.classList.toggle("is-paged-out", matching > shown);
        } else {
          card.classList.remove("is-paged-out");
        }
      });
      if (empty) empty.hidden = matching > 0;
      if (more) more.hidden = matching <= shown;
      // The count is announced on a change, not when the page opens.
      if (status && announce !== false) {
        var one = status.getAttribute("data-one") || "route";
        var other = status.getAttribute("data-other") || "routes";
        status.textContent = matching + " " + (matching === 1 ? one : other);
      }
      return matching;
    }

    function update() {
      shown = pageSize;
      syncButtons();
      syncChips();
      syncUrl();
      apply();
    }

    typeButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var v = btn.getAttribute("data-filter") || "all";
        state.type = v === "all" ? "" : v;
        update();
      });
    });
    groupButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        state[btn.getAttribute("data-tours-filter")] = btn.getAttribute("data-value") || "";
        update();
      });
    });
    clearButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        GROUPS.forEach(function (g) {
          state[g] = "";
        });
        update();
        var first = bar.querySelector('[data-filter="all"]');
        if (first) first.focus();
      });
    });
    if (more) {
      more.addEventListener("click", function () {
        var before = cards.filter(function (c) {
          return !c.classList.contains("is-filtered-out") && !c.classList.contains("is-paged-out");
        }).length;
        shown += pageSize;
        apply();
        // Move focus to the first newly shown card so keyboard users land on it.
        var visible = cards.filter(function (c) {
          return !c.classList.contains("is-filtered-out") && !c.classList.contains("is-paged-out");
        });
        var next = visible[before] && visible[before].querySelector("a");
        if (next) next.focus();
      });
    }

    syncButtons();
    syncChips();
    // A stale value (a style with no routes, an old ?region=slovenia) is cleaned from the address.
    if (parsed.dropped.length) syncUrl();
    apply(false);
  }

  return {
    GROUPS: GROUPS,
    parseFilterParams: parseFilterParams,
    serializeFilterParams: serializeFilterParams,
    cardMatches: cardMatches,
    hasFilters: hasFilters,
    init: init,
  };
});
