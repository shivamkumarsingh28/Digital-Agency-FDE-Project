/*!
 * Saiam Chat Widget: single file, no dependencies, styles isolated in a Shadow DOM.
 *
 * Paste before </body> on any page:
 *   <script src="https://YOUR-CHAT-HOST/widget/saiam-chat-widget.js" async></script>
 *
 * Options (data-* attributes on the script tag):
 *   data-api          Base URL of the chatbot service. Default: the origin the script was loaded from.
 *   data-endpoint     Full URL to post chats to. Use this to go through YOUR backend (logged-in clients,
 *                     e.g. "/api/v1/ai/chat"). Default: <api>/api/v1/public/chat/stream (visitor-only).
 *   data-credentials  "same-origin" (default) | "include"  (cookies, for gateway mode)
 *   data-title        Header title.            default "Saiam Assistant"
 *   data-subtitle     Header subtitle.         default "Ask about our services"
 *   data-greeting     First bot message.
 *   data-suggestions  Quick questions, separated by "|".
 *   data-color        Brand colour (hex).      default "#10232e"
 *   data-accent       Accent colour (hex).     default "#f2a71b"
 *   data-position     "right" (default) | "left"
 *   data-mode         "bubble" (default) | "page"  (page = full-screen, used by /chat)
 *   data-open         "true" to open on load.
 * JS API: window.SaiamChat.open() / close() / toggle() / reset()
 */
(function () {
  "use strict";
  if (window.SaiamChat) return;

  // var script = document.currentScript || document.querySelector('script[src*="saiam-chat-widget"]');
  var script = ""
  var d = (script && script.dataset) || {};
  var origin = "";
  try { origin = new URL(script.src, location.href).origin; } catch (e) {}
  var cfg = {
    api: (d.api || origin).replace(/\/$/, ""),
    endpoint: d.endpoint || "",
    credentials: d.credentials || "same-origin",
    title: d.title || "Saiam Assistant",
    subtitle: d.subtitle || "Ask about our services",
    greeting: d.greeting || "Hi! I'm Saiam's AI assistant. Ask me about our services, pricing and process, or tell me about your project and I'll connect you with the team.",
    suggestions: (d.suggestions || "What services do you offer?|How much does a website cost?|I'd like a quote").split("|").filter(Boolean),
    color: d.color || "#32434d",
    accent: d.accent || "#774f04",
    position: d.position === "left" ? "left" : "right",
    mode: d.mode === "page" ? "page" : "bubble",
    open: d.open === "true"
  };
  cfg.url = cfg.endpoint || cfg.api + "/api/v1/public/chat/stream";
  console.log("Saiam Chat Widget config:", cfg);

  // ---------- storage (fails silently if blocked) ----------
  var store = {
    get: function (k) { try { return localStorage.getItem("saiam_" + k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem("saiam_" + k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem("saiam_" + k); } catch (e) {} }
  };
  var sid = store.get("sid");
  if (!sid) {
    sid = (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
    store.set("sid", sid);
  }
  var threadId = store.get("tid") || null;
  var history = [];
  try { history = JSON.parse(store.get("msgs") || "[]"); } catch (e) {}
  var busy = false;

  // ---------- helpers ----------
  function lum(hex) {
    var m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex); if (!m) return 0;
    return (0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16)) / 255;
  }
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function inline(s) {
    return s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  }
  function md(t) {
    var out = "", list = false;
    esc(t).split("\n").forEach(function (l) {
      var m = l.match(/^\s*[-*]\s+(.*)/);
      if (m) { if (!list) { out += "<ul>"; list = true; } out += "<li>" + inline(m[1]) + "</li>"; }
      else { if (list) { out += "</ul>"; list = false; } if (l.trim()) out += "<p>" + inline(l) + "</p>"; }
    });
    return out + (list ? "</ul>" : "");
  }

  // ---------- DOM (Shadow DOM isolates our CSS from the host site) ----------
  var host = document.createElement("div");
  host.setAttribute("data-saiam-chat", "");
  var root = host.attachShadow({ mode: "open" });
  var side = cfg.position;
  var css = [
    ":host{all:initial}",
    "*{box-sizing:border-box}",
    ".w{--c:" + cfg.color + ";--ct:" + (lum(cfg.color) > 0.6 ? "#10232e" : "#fff") + ";--a:" + cfg.accent + ";--at:" + (lum(cfg.accent) > 0.6 ? "#2a1c00" : "#fff") + ";--bg:#fff;--fg:#10232e;--mut:#5b6c76;--bot:#eef2f4;--line:#d9e1e5;",
    "font:14.5px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:var(--fg)}",
    "@media (prefers-color-scheme:dark){.w{--bg:#14232b;--fg:#e8eff2;--mut:#9fb1ba;--bot:#1f343e;--line:#2c4753}}",
    ".launch{position:fixed;bottom:20px;" + side + ":20px;z-index:2147483000;width:58px;height:58px;border-radius:50%;border:0;cursor:pointer;background:var(--c);color:var(--ct);box-shadow:0 6px 24px rgba(0,0,0,.28);display:grid;place-items:center}",
    ".launch:focus-visible,.send:focus-visible,.x:focus-visible,.sug:focus-visible,textarea:focus-visible{outline:2px solid var(--a);outline-offset:2px}",
    ".launch svg{width:26px;height:26px}.launch::after{content:'';position:absolute;top:4px;right:4px;width:11px;height:11px;border-radius:50%;background:var(--a);border:2px solid var(--bg)}",
    ".panel{position:fixed;z-index:2147483001;bottom:90px;" + side + ":20px;width:380px;max-width:calc(100vw - 24px);height:600px;max-height:calc(100vh - 110px);background:var(--bg);border:1px solid var(--line);border-radius:16px;box-shadow:0 12px 48px rgba(0,0,0,.3);display:none;flex-direction:column;overflow:hidden}",
    ".panel.on{display:flex}",
    ".page .panel{position:fixed;inset:0;width:auto;max-width:none;height:auto;max-height:none;border:0;border-radius:0;box-shadow:none;bottom:0}",
    ".page .launch,.page .x{display:none}",
    ".page .body,.page form{width:100%;max-width:760px;margin-inline:auto}",
    "@media (max-width:480px){.panel{inset:0;width:auto;max-width:none;height:auto;max-height:none;border-radius:0;bottom:0}}",
    "header{background:var(--c);color:var(--ct);padding:14px 16px;display:flex;align-items:center;gap:10px}",
    "header .t{flex:1;min-width:0}header b{display:block;font-size:15.5px}header span{font-size:12.5px;opacity:.8}",
    ".x{background:none;border:0;color:inherit;cursor:pointer;padding:6px;border-radius:8px;font-size:20px;line-height:1}",
    ".body{flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth}",
    ".m{max-width:86%;padding:9px 13px;border-radius:14px;overflow-wrap:anywhere}",
    ".m p{margin:0 0 6px}.m p:last-child{margin:0}.m ul{margin:4px 0;padding-left:18px}.m a{color:inherit;text-decoration:underline}",
    ".m.b{align-self:flex-start;background:var(--bot);border-bottom-left-radius:4px}",
    ".m.u{align-self:flex-end;background:var(--c);color:var(--ct);border-bottom-right-radius:4px}",
    ".m.e{background:#fbeadf;color:#a4410f}",
    ".dots{display:inline-flex;gap:4px;padding:3px 0}.dots i{width:6px;height:6px;border-radius:50%;background:var(--mut);animation:p 1.2s infinite}.dots i:nth-child(2){animation-delay:.15s}.dots i:nth-child(3){animation-delay:.3s}",
    "@keyframes p{0%,60%,100%{opacity:.25}30%{opacity:1}}@media (prefers-reduced-motion:reduce){.dots i{animation:none}}",
    ".sugs{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}",
    ".sug{background:none;border:1px solid var(--line);color:var(--fg);border-radius:999px;padding:5px 11px;cursor:pointer;font:inherit;font-size:13px}.sug:hover{border-color:var(--a)}",
    "form{display:flex;gap:8px;padding:10px 12px 12px;border-top:1px solid var(--line);align-items:flex-end}",
    "textarea{flex:1;resize:none;border:1px solid var(--line);border-radius:12px;padding:9px 12px;font:inherit;background:var(--bg);color:var(--fg);max-height:110px;min-height:40px}",
    ".send{background:var(--a);color:var(--at);border:0;border-radius:12px;height:40px;padding:0 14px;font:600 14px system-ui;cursor:pointer}.send:disabled{opacity:.5;cursor:default}",
    ".foot{text-align:center;font-size:11px;color:var(--mut);padding:0 0 8px}"
  ].join("");
  root.innerHTML =
    "<style>" + css + "</style>" +
    '<div class="w ' + (cfg.mode === "page" ? "page" : "") + '">' +
    '<button class="launch" type="button" aria-label="Open chat" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.4A8 8 0 1 1 21 12z"/></svg></button>' +
    '<section class="panel" role="dialog" aria-label="' + esc(cfg.title) + '">' +
    '<header><div class="t"><b>' + esc(cfg.title) + "</b><span>" + esc(cfg.subtitle) + '</span></div><button class="x" type="button" aria-label="Close chat">&times;</button></header>' +
    '<div class="body" aria-live="polite"></div>' +
    '<form><textarea rows="1" maxlength="2000" placeholder="Type your message" aria-label="Message"></textarea><button class="send" type="submit">Send</button></form>' +
    '<div class="foot">AI assistant. Answers may contain errors; ask for a human any time.</div>' +
    "</section></div>";

  var $ = function (s) { return root.querySelector(s); };
  var panel = $(".panel"), launch = $(".launch"), body = $(".body"), ta = $("textarea"), sendBtn = $(".send");

  function persist() { store.set("msgs", JSON.stringify(history.slice(-30))); store.set("tid", threadId || ""); }
  function scroll() { body.scrollTop = body.scrollHeight; }
  function bubble(cls, html) { var el = document.createElement("div"); el.className = "m " + cls; el.innerHTML = html; body.appendChild(el); scroll(); return el; }

  function render() {
    body.innerHTML = "";
    bubble("b", md(cfg.greeting));
    history.forEach(function (m) { bubble(m.r === "u" ? "u" : "b", m.r === "u" ? esc(m.t) : md(m.t)); });
    if (!history.length && cfg.suggestions.length) {
      var wrap = document.createElement("div"); wrap.className = "sugs";
      cfg.suggestions.forEach(function (s) {
        var b = document.createElement("button"); b.type = "button"; b.className = "sug"; b.textContent = s;
        b.onclick = function () { send(s); }; wrap.appendChild(b);
      });
      body.appendChild(wrap);
    }
    scroll();
  }

  function setOpen(on) {
    panel.classList.toggle("on", on);
    launch.setAttribute("aria-expanded", String(on));
    if (on) { setTimeout(function () { ta.focus(); scroll(); }, 30); }
  }

  // ---------- chat ----------
  function send(text) {
    text = (text || ta.value).trim();
    if (!text || busy) return;
    busy = true; sendBtn.disabled = true; ta.value = ""; ta.style.height = "";
    var s = body.querySelector(".sugs"); if (s) s.remove();
    history.push({ r: "u", t: text }); bubble("u", esc(text));
    var bot = bubble("b", '<span class="dots"><i></i><i></i><i></i></span>');
    var answer = "";

    fetch(cfg.url, {
      method: "POST", credentials: cfg.credentials,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, thread_id: threadId, session_id: sid })
    }).then(function (res) {
      if (!res.ok || !res.body) throw new Error(res.status === 429 ? "rate" : "http " + res.status);
      var reader = res.body.getReader(), dec = new TextDecoder(), buf = "";
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) return;
          buf += dec.decode(r.value, { stream: true });
          var frames = buf.split("\n\n"); buf = frames.pop();
          frames.forEach(function (fr) {
            if (fr.indexOf("data: ") !== 0) return;
            var raw = fr.slice(6).trim(); if (raw === "[DONE]") return;
            var ev; try { ev = JSON.parse(raw); } catch (e) { return; }
            if (ev.type === "thread") { threadId = ev.thread_id; }
            else if (ev.type === "token" || ev.token) { answer += (ev.text || ev.token); bot.innerHTML = md(answer); scroll(); }
            else if (ev.type === "error") { throw new Error(ev.message || "error"); }
          });
          return pump();
        });
      }
      return pump();
    }).then(function () {
      if (answer) history.push({ r: "b", t: answer });
      else bot.innerHTML = md("Sorry, I didn't get a response. Please try again.");
    }).catch(function (e) {
      bot.className = "m e";
      bot.textContent = e && e.message === "rate" ? "You're sending messages quickly. Please wait a moment and try again." :
        (answer ? answer + " (connection interrupted)" :
          (e && e.message && e.message !== "Failed to fetch" ?
            "Sorry, the assistant request failed: " + e.message :
            "Sorry, I couldn't reach the assistant. Please try again, or contact us through the website."));
    }).then(function () { busy = false; sendBtn.disabled = false; persist(); ta.focus(); });
  }

  // ---------- events ----------
  launch.onclick = function () { setOpen(!panel.classList.contains("on")); };
  $(".x").onclick = function () { setOpen(false); launch.focus(); };
  $("form").addEventListener("submit", function (e) { e.preventDefault(); send(); });
  ta.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
  ta.addEventListener("input", function () { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 110) + "px"; });
  root.addEventListener("keydown", function (e) { if (e.key === "Escape" && cfg.mode !== "page") setOpen(false); });

  window.SaiamChat = {
    open: function () { setOpen(true); }, close: function () { setOpen(false); },
    toggle: function () { setOpen(!panel.classList.contains("on")); },
    reset: function () { history = []; threadId = null; store.del("msgs"); store.del("tid"); render(); }
  };

  function mount() { document.body.appendChild(host); render(); if (cfg.mode === "page" || cfg.open) setOpen(true); }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
})();
