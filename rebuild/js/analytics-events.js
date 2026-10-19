/**
 * dataLayer helpers + form conversion hooks for GTM / GA4 / Meta / ChatGPT Ads.
 */
(function () {
  var OPPREF_KEY = "zyflow_oppref";

  function dataLayerPush(payload) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);
  }

  function eventId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "evt_" + Date.now() + "_" + Math.random().toString(16).slice(2);
  }

  /** Preserve ChatGPT Ads click reference across navigation. */
  function captureOppref() {
    try {
      var params = new URLSearchParams(window.location.search);
      var oppref = params.get("oppref");
      if (oppref) {
        sessionStorage.setItem(OPPREF_KEY, oppref);
      }
    } catch (_) {
      /* ignore */
    }
  }

  function getOppref() {
    try {
      var params = new URLSearchParams(window.location.search);
      return params.get("oppref") || sessionStorage.getItem(OPPREF_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  /**
   * Single conversion event GTM maps to:
   * - GA4: contact_submit
   * - Meta: Lead
   * - ChatGPT Ads: lead_created
   */
  function pushContactSubmit(detail) {
    var id = eventId();
    dataLayerPush({
      event: "contact_submit",
      event_id: id,
      form_id: "contact",
      form_topic: (detail && detail.topic) || "",
      oppref: getOppref(),
    });
    return id;
  }

  function pushNewsletterSubscribe() {
    dataLayerPush({
      event: "newsletter_subscribe",
      event_id: eventId(),
      form_id: "footer_newsletter",
      oppref: getOppref(),
    });
  }

  function linkLabel(el) {
    if (!el) return "";
    var aria = el.getAttribute("aria-label");
    if (aria) return aria.trim();
    return (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
  }

  function ctaLocation(el) {
    if (!el) return "unknown";
    if (el.closest("#app-modal")) return "app_modal";
    if (el.closest(".nav")) return "nav";
    if (el.closest(".footer")) return "footer";
    if (el.closest(".announcement")) return "announcement";
    if (el.closest(".app-banner")) return "app_banner";
    if (el.closest(".app-stage")) return "app_stage";
    if (el.closest(".hero")) return "hero";
    if (el.closest(".features")) return "features";
    if (el.closest(".tour-hero") || el.closest(".tour-aside")) return "tour";
    return "page";
  }

  function storePlatform(href) {
    if (!href) return "";
    if (href.indexOf("apps.apple.com") !== -1) return "ios";
    if (href.indexOf("play.google.com") !== -1) return "android";
    return "other";
  }

  /** Download / Get the app CTAs that open the modal (or similar intent). */
  function pushAppCtaClick(el) {
    dataLayerPush({
      event: "app_cta_click",
      event_id: eventId(),
      cta_location: ctaLocation(el),
      cta_label: linkLabel(el),
      link_url: el.getAttribute("href") || "",
      oppref: getOppref(),
    });
  }

  function attributionUtms() {
    if (window.ZyflowAttribution && typeof window.ZyflowAttribution.getAttribution === "function") {
      return window.ZyflowAttribution.getAttribution();
    }
    return { utm_source: "", utm_medium: "", utm_campaign: "" };
  }

  function decorateStoreLink(el) {
    if (!window.ZyflowAttribution || typeof window.ZyflowAttribution.decorateAnchor !== "function") {
      return el.getAttribute("href") || "";
    }
    var consented = !!(
      window.ZyflowPosthog &&
      window.ZyflowPosthog.hasAnalyticsConsent &&
      window.ZyflowPosthog.hasAnalyticsConsent()
    );
    var distinctId =
      consented && window.ZyflowPosthog.getDistinctId
        ? window.ZyflowPosthog.getDistinctId()
        : "";
    return window.ZyflowAttribution.decorateAnchor(el, {
      utms: attributionUtms(),
      analyticsConsent: consented,
      distinctId: distinctId,
    });
  }

  /** Real App Store / Google Play outbound clicks. */
  function pushAppStoreClick(el) {
    var href = decorateStoreLink(el);
    var store = storePlatform(href);
    var placement = ctaLocation(el);
    var utms = attributionUtms();
    dataLayerPush({
      event: "app_store_click",
      event_id: eventId(),
      store: store,
      cta_location: placement,
      cta_label: linkLabel(el),
      link_url: href,
      oppref: getOppref(),
    });
    if (window.ZyflowPosthog && typeof window.ZyflowPosthog.capture === "function") {
      window.ZyflowPosthog.capture("app_store_click", {
        store: store,
        utm_source: utms.utm_source,
        utm_medium: utms.utm_medium,
        utm_campaign: utms.utm_campaign,
        placement: placement,
      });
    }
  }

  function initAppDownloadTracking() {
    document.addEventListener(
      "click",
      function (e) {
        var open = e.target.closest("[data-app-modal-open]");
        if (open) {
          pushAppCtaClick(open);
          return;
        }

        var store = e.target.closest(
          'a[href*="apps.apple.com"], a[href*="play.google.com"]'
        );
        if (store) {
          pushAppStoreClick(store);
        }
      },
      true
    );
  }

  function isLocalHost() {
    var h = location.hostname;
    return h === "localhost" || h === "127.0.0.1";
  }

  function setFormStatus(form, message, isError) {
    var existing = form.querySelector(".form-status");
    if (!existing) {
      existing = document.createElement("p");
      existing.className = "form-status";
      existing.setAttribute("role", "status");
      form.appendChild(existing);
    }
    existing.textContent = message;
    existing.dataset.state = isError ? "error" : "ok";
  }

  function formMessage(form, key, fallback) {
    var el = form.querySelector('[data-form-msg="' + key + '"]');
    if (el && el.textContent && el.textContent.trim()) return el.textContent.trim();
    return fallback;
  }

  function honeypotValue(form) {
    var input = form.querySelector('input[name="website"]');
    return input ? String(input.value || "").trim() : "";
  }

  function turnstileSiteKey() {
    return (
      (window.ZYFLOW_ANALYTICS && window.ZYFLOW_ANALYTICS.turnstileSiteKey) || ""
    );
  }

  function loadTurnstileScript() {
    if (window.turnstile) return Promise.resolve();
    if (window.__zyflowTurnstileLoading) return window.__zyflowTurnstileLoading;
    window.__zyflowTurnstileLoading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = function () {
        var n = 0;
        var wait = function () {
          if (window.turnstile) {
            resolve();
            return;
          }
          n += 1;
          if (n > 50) {
            reject(new Error("turnstile"));
            return;
          }
          setTimeout(wait, 40);
        };
        wait();
      };
      s.onerror = function () {
        reject(new Error("turnstile"));
      };
      document.head.appendChild(s);
    });
    return window.__zyflowTurnstileLoading;
  }

  function initTurnstileWidgets() {
    var key = turnstileSiteKey();
    if (!key) return;
    var slots = document.querySelectorAll(".js-turnstile");
    if (!slots.length) return;
    loadTurnstileScript()
      .then(function () {
        slots.forEach(function (slot) {
          if (slot.dataset.widgetId) return;
          slot.hidden = false;
          var id = window.turnstile.render(slot, { sitekey: key });
          if (id) slot.dataset.widgetId = String(id);
        });
      })
      .catch(function () {
        console.warn("[Zyflow] Turnstile widget failed to load");
      });
  }

  function getTurnstileToken(form) {
    if (!turnstileSiteKey()) return "";
    var input = form.querySelector('input[name="cf-turnstile-response"]');
    if (input && input.value) return input.value;
    var slot = form.querySelector(".js-turnstile");
    if (slot && slot.dataset.widgetId && window.turnstile && window.turnstile.getResponse) {
      try {
        return window.turnstile.getResponse(slot.dataset.widgetId) || "";
      } catch (_) {
        return "";
      }
    }
    return "";
  }

  function waitForTurnstileToken(form) {
    if (!turnstileSiteKey()) return Promise.resolve("");
    initTurnstileWidgets();
    return new Promise(function (resolve, reject) {
      var start = Date.now();
      var tick = function () {
        var token = getTurnstileToken(form);
        if (token) {
          resolve(token);
          return;
        }
        if (Date.now() - start > 8000) {
          reject({ status: 400, error: "Verification failed" });
          return;
        }
        setTimeout(tick, 150);
      };
      tick();
    });
  }

  function resetTurnstile(form) {
    var slot = form.querySelector(".js-turnstile");
    if (!slot || !slot.dataset.widgetId || !window.turnstile || !window.turnstile.reset) return;
    try {
      window.turnstile.reset(slot.dataset.widgetId);
    } catch (_) {
      /* ignore */
    }
  }

  function formErrorKey(status, error) {
    if (status === 429 || error === "Too many requests") return "rateLimit";
    if (status === 400 && error === "Verification failed") return "verify";
    if (error === "Verification failed") return "verify";
    if (
      status === 400 ||
      error === "Valid email required" ||
      error === "Name, email and message are required" ||
      error === "Input too long" ||
      error === "Invalid input"
    ) {
      return "validation";
    }
    return "error";
  }

  function initContactForm() {
    var form = document.querySelector("form.contact-form__form");
    if (!form || form.dataset.analyticsBound === "1") return;
    form.dataset.analyticsBound = "1";

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      var first = (form.querySelector("#contact-first") || {}).value || "";
      var last = (form.querySelector("#contact-last") || {}).value || "";
      var email = (form.querySelector("#contact-email") || {}).value || "";
      var phone = (form.querySelector("#contact-phone") || {}).value || "";
      var topic = (form.querySelector("#contact-topic") || {}).value || "";
      var message = (form.querySelector("#contact-message") || {}).value || "";
      var name = (first + " " + last).trim();
      var subject = topic || "(no subject)";
      var btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;

      waitForTurnstileToken(form)
        .then(function (token) {
          return fetch("/api/contact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: name,
              subject: subject,
              email: email.trim(),
              message: message.trim() + (phone ? "\n\nPhone: " + phone.trim() : ""),
              website: honeypotValue(form),
              turnstileToken: token,
            }),
          });
        })
        .then(function (r) {
          return r.json().then(function (data) {
            return { ok: r.ok && data && data.success, status: r.status, data: data };
          });
        })
        .then(function (result) {
          if (result.ok) {
            pushContactSubmit({ topic: topic });
            setFormStatus(form, formMessage(form, "success", "Thanks — we got your message."), false);
            form.reset();
            resetTurnstile(form);
            return;
          }
          var err = (result.data && result.data.error) || "Failed";
          throw { status: result.status, error: err };
        })
        .catch(function (err) {
          if (isLocalHost() && !(err && err.status)) {
            pushContactSubmit({ topic: topic });
            setFormStatus(
              form,
              "Local preview: event tracked (API unavailable).",
              false
            );
            return;
          }
          var key = formErrorKey(err && err.status, err && err.error);
          var fallback =
            key === "rateLimit"
              ? "Too many attempts. Please wait a few minutes."
              : key === "verify"
                ? "Please complete the verification and try again."
                : key === "validation"
                  ? "Please check your details and try again."
                  : "Something went wrong. Please try again.";
          setFormStatus(form, formMessage(form, key, fallback), true);
        })
        .finally(function () {
          if (btn) btn.disabled = false;
        });
    });
  }

  function initNewsletterForm() {
    var form = document.querySelector("form.footer__email");
    if (!form || form.dataset.analyticsBound === "1") return;
    form.dataset.analyticsBound = "1";

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      var input = form.querySelector("#footer-email");
      var email = input ? input.value.trim() : "";
      if (!email) return;
      var btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;

      waitForTurnstileToken(form)
        .then(function (token) {
          return fetch("/api/waitlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: email,
              website: honeypotValue(form),
              turnstileToken: token,
            }),
          });
        })
        .then(function (r) {
          return r.json().then(function (data) {
            return { ok: r.ok && data && data.success, status: r.status, data: data };
          });
        })
        .then(function (result) {
          if (result.ok) {
            pushNewsletterSubscribe();
            if (input) input.value = "";
            resetTurnstile(form);
            setFormStatus(form, formMessage(form, "success", "Thanks — you’re on the list."), false);
            return;
          }
          var err = (result.data && result.data.error) || "Failed";
          throw { status: result.status, error: err };
        })
        .catch(function (err) {
          if (isLocalHost() && !(err && err.status)) {
            pushNewsletterSubscribe();
            if (input) input.value = "";
            setFormStatus(form, formMessage(form, "success", "Thanks — you’re on the list."), false);
            return;
          }
          var key = formErrorKey(err && err.status, err && err.error);
          var fallback =
            key === "rateLimit"
              ? "Too many attempts. Please wait a few minutes."
              : key === "verify"
                ? "Please complete the verification and try again."
                : key === "validation"
                  ? "Please enter a valid email address."
                  : "Something went wrong. Please try again.";
          setFormStatus(form, formMessage(form, key, fallback), true);
        })
        .finally(function () {
          if (btn) btn.disabled = false;
        });
    });
  }

  captureOppref();
  initAppDownloadTracking();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      initTurnstileWidgets();
      initContactForm();
      initNewsletterForm();
    });
  } else {
    initTurnstileWidgets();
    initContactForm();
    initNewsletterForm();
  }

  window.ZyflowAnalytics = {
    pushContactSubmit: pushContactSubmit,
    pushNewsletterSubscribe: pushNewsletterSubscribe,
    pushAppCtaClick: pushAppCtaClick,
    pushAppStoreClick: pushAppStoreClick,
    getOppref: getOppref,
  };
})();
