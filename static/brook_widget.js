/* ============================================================
   Brook Widget — Westbrook Dental Group
   3-location bot with location picker on open.
   Secrets injected server-side by Railway.
   ============================================================ */
(function () {
  if (window.__brookWidgetLoaded) return;
  window.__brookWidgetLoaded = true;

  const BROOK_API = "{{BROOK_API}}";
  const BROOK_KEY = "{{BROOK_KEY}}";

  const ACCENT      = "#8b3e3b";
  const ACCENT_DARK = "#6e2f2d";
  const BOT_NAME    = "Brook";
  const GROUP_NAME  = "Westbrook Dental Group";
  const BOOK_URL    = "https://westbrookdental.ca/appointment/";

  const LOCATIONS = {
    st_marys: {
      label:   "St. Mary's Road",
      address: "249 St. Mary's Road",
      phone:   "(204) 694-1400",
      phoneRaw:"2046941400",
      mapUrl:  "https://www.google.com/maps/search/?api=1&query=249+St+Marys+Road+Winnipeg",
      hours: {
        Monday: "8am - 5pm", Tuesday: "8am - 5pm", Wednesday: "8am - 5pm",
        Thursday: "8am - 5pm", Friday: "8am - 5pm",
        Saturday: "Select Saturdays (call to confirm)", Sunday: "Closed"
      }
    },
    keewatin: {
      label:   "Keewatin Street",
      address: "100 Keewatin Street",
      phone:   "(204) 633-6200",
      phoneRaw:"2046336200",
      mapUrl:  "https://www.google.com/maps/search/?api=1&query=100+Keewatin+Street+Winnipeg",
      hours: {
        Monday: "10am - 5pm", Tuesday: "9am - 7pm", Wednesday: "9am - 5pm",
        Thursday: "9am - 7pm", Friday: "9am - 4pm", Saturday: "9am - 4pm", Sunday: "Closed"
      }
    },
    sargent: {
      label:   "Sargent Avenue",
      address: "D-819 Sargent Avenue",
      phone:   "(204) 786-7625",
      phoneRaw:"2047867625",
      mapUrl:  "https://www.google.com/maps/search/?api=1&query=819+Sargent+Avenue+Winnipeg",
      hours: {
        Monday: "Closed", Tuesday: "9am - 4pm", Wednesday: "9am - 4pm",
        Thursday: "12pm - 7pm", Friday: "12pm - 5pm", Saturday: "9am - 4pm", Sunday: "Closed"
      }
    }
  };

  function isOpen(locKey) {
    const now  = new Date();
    const day  = now.toLocaleDateString("en-US", { weekday: "long" });
    const h    = now.getHours() + now.getMinutes() / 60;
    const ranges = {
      st_marys: { Monday:[8,17],Tuesday:[8,17],Wednesday:[8,17],Thursday:[8,17],Friday:[8,17] },
      keewatin: { Monday:[10,17],Tuesday:[9,19],Wednesday:[9,17],Thursday:[9,19],Friday:[9,16],Saturday:[9,16] },
      sargent:  { Tuesday:[9,16],Wednesday:[9,16],Thursday:[12,19],Friday:[12,17],Saturday:[9,16] }
    };
    const r = (ranges[locKey] || {})[day];
    return r ? h >= r[0] && h < r[1] : false;
  }

  /* ── STYLES ─────────────────────────────────────────────── */
  const css = `
  #bk-bubble {
    position:fixed; bottom:var(--bk-bottom,24px); right:var(--bk-right,24px);
    width:54px; height:54px; background:${ACCENT};
    border-radius:50%; cursor:pointer;
    display:flex; align-items:center; justify-content:center; font-size:23px;
    box-shadow:0 4px 20px rgba(139,62,59,0.4);
    z-index:2147483647; transition:transform 0.2s;
    border:none; outline:none;
  }
  #bk-bubble:hover { transform:scale(1.08); }

  #bk-window {
    display:none; position:fixed; bottom:24px; right:24px;
    width:380px; height:540px; background:white; border-radius:18px;
    box-shadow:0 8px 40px rgba(0,0,0,0.15);
    flex-direction:column; z-index:2147483647;
    overflow:hidden; font-family:system-ui,sans-serif;
  }
  #bk-header {
    background:${ACCENT}; color:white; padding:12px 16px;
    display:flex; align-items:center; justify-content:space-between; flex-shrink:0;
  }
  #bk-header-info { display:flex; align-items:center; gap:10px; }
  #bk-avatar {
    width:34px; height:34px; border-radius:50%;
    background:rgba(255,255,255,0.2);
    display:flex; align-items:center; justify-content:center;
    font-size:16px; flex-shrink:0;
  }
  #bk-name   { font-size:14px; font-weight:600; }
  #bk-sub    { font-size:11px; color:rgba(255,255,255,0.7); margin-top:1px; }
  #bk-close {
    background:none; border:none; cursor:pointer;
    color:rgba(255,255,255,0.7); padding:4px; display:flex; align-items:center;
  }
  #bk-close:hover { color:white; }

  #bk-location-screen {
    flex:1; padding:20px 16px;
    display:flex; flex-direction:column; gap:12px; justify-content:center;
  }
  #bk-location-hint {
    font-size:13px; color:#888; text-align:center; margin-bottom:4px;
  }
  .bk-loc-btn {
    padding:14px 16px; border-radius:12px;
    border:1.5px solid #e8d0cf; font-size:14px; cursor:pointer;
    background:white; color:#1a1a1a; transition:all 0.2s;
    text-align:left; display:flex; align-items:center; gap:12px;
    font-family:system-ui,sans-serif;
  }
  .bk-loc-btn:hover { background:${ACCENT}; color:white; border-color:${ACCENT}; }
  .bk-loc-name  { font-weight:600; font-size:14px; }
  .bk-loc-addr  { font-size:11px; color:#888; margin-top:2px; }
  .bk-loc-btn:hover .bk-loc-addr { color:rgba(255,255,255,0.75); }

  #bk-chat-screen {
    display:none; flex:1; flex-direction:column; min-height:0;
  }
  #bk-msgs {
    flex:1; overflow-y:auto; padding:16px;
    display:flex; flex-direction:column; gap:10px;
    min-height:0; scroll-behavior:smooth;
  }
  .bk-msg {
    max-width:82%; padding:10px 14px;
    border-radius:14px; font-size:13px; line-height:1.5;
  }
  .bk-msg.bk-bot  { background:#f5ecea; color:#1a1a1a; align-self:flex-start; border-bottom-left-radius:4px; }
  .bk-msg.bk-user { background:${ACCENT}; color:white; align-self:flex-end; border-bottom-right-radius:4px; }

  .bk-btns { display:flex; flex-wrap:wrap; gap:8px; margin-top:2px; align-self:flex-start; }
  .bk-btn {
    padding:7px 14px; border-radius:20px;
    border:1.5px solid #e8d0cf; font-size:12px; cursor:pointer;
    background:white; color:#1a1a1a; transition:all 0.2s;
    text-decoration:none; display:inline-block; font-family:system-ui,sans-serif;
  }
  .bk-btn:hover { background:${ACCENT}; color:white; border-color:${ACCENT}; }
  .bk-btn.bk-emergency { border-color:#c0392b; color:#c0392b; }
  .bk-btn.bk-emergency:hover { background:#c0392b; color:white; }

  .bk-typing span {
    display:inline-block; animation:bkBlink 1.4s infinite; font-size:20px; line-height:1;
  }
  .bk-typing span:nth-child(2) { animation-delay:0.2s; }
  .bk-typing span:nth-child(3) { animation-delay:0.4s; }
  @keyframes bkBlink { 0%,80%,100%{opacity:0;} 40%{opacity:1;} }

  #bk-hours-bar {
    padding:6px 16px; border-top:1px solid #f0e8e7;
    display:flex; gap:8px; flex-shrink:0;
  }
  .bk-hours-btn {
    padding:6px 12px; border-radius:20px;
    border:1.5px solid #e8d0cf; font-size:11px; cursor:pointer;
    background:white; color:#555; transition:all 0.2s;
    font-family:system-ui,sans-serif;
  }
  .bk-hours-btn:hover { background:${ACCENT}; color:white; border-color:${ACCENT}; }

  #bk-input-area {
    padding:10px 14px; border-top:1px solid #f0e8e7;
    display:flex; gap:8px; align-items:center; flex-shrink:0;
  }
  #bk-input {
    flex:1; padding:10px 14px; border:1.5px solid #e8d0cf;
    border-radius:20px; outline:none; font-size:13px;
    transition:border 0.2s; font-family:system-ui,sans-serif;
  }
  #bk-input:focus { border-color:${ACCENT}; }
  #bk-send {
    background:${ACCENT}; color:white; border:none;
    border-radius:50%; width:36px; height:36px; cursor:pointer;
    font-size:15px; display:flex; align-items:center; justify-content:center;
    flex-shrink:0; transition:opacity 0.2s;
  }
  #bk-send:hover { opacity:0.88; }
  #bk-footer {
    padding:4px; text-align:center; font-size:9px; color:#ccc;
    border-top:1px solid #faf5f5;
  }

  @media (max-width:480px) {
    #bk-window { width:100vw; height:100dvh; bottom:0; right:0; border-radius:0; }
    #bk-bubble { bottom:16px; right:16px; }
  }
  `;

  const styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ── HTML ───────────────────────────────────────────────── */
  const html = `
  <button id="bk-bubble" onclick="window.__bk.toggle()">🦷</button>

  <div id="bk-window">
    <div id="bk-header">
      <div id="bk-header-info">
        <div id="bk-avatar">🦷</div>
        <div>
          <div id="bk-name">${BOT_NAME}</div>
          <div id="bk-sub">${GROUP_NAME}</div>
        </div>
      </div>
      <button id="bk-close" onclick="window.__bk.toggle()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <div id="bk-location-screen">
      <div id="bk-location-hint">Select your location to get started</div>
      <button class="bk-loc-btn" onclick="window.__bk.pickLocation('st_marys')">
        <span style="font-size:20px;">📍</span>
        <div>
          <div class="bk-loc-name">St. Mary's Road</div>
          <div class="bk-loc-addr">249 St. Mary's Road</div>
        </div>
      </button>
      <button class="bk-loc-btn" onclick="window.__bk.pickLocation('keewatin')">
        <span style="font-size:20px;">📍</span>
        <div>
          <div class="bk-loc-name">Keewatin Street</div>
          <div class="bk-loc-addr">100 Keewatin Street</div>
        </div>
      </button>
      <button class="bk-loc-btn" onclick="window.__bk.pickLocation('sargent')">
        <span style="font-size:20px;">📍</span>
        <div>
          <div class="bk-loc-name">Sargent Avenue</div>
          <div class="bk-loc-addr">D-819 Sargent Avenue</div>
        </div>
      </button>
    </div>

    <div id="bk-chat-screen">
      <div id="bk-msgs"></div>
      <div id="bk-hours-bar">
        <button class="bk-hours-btn" onclick="window.__bk.showHours()">🕐 Hours</button>
      </div>
      <div id="bk-input-area">
        <input id="bk-input" type="text" placeholder="Ask Brook anything..."
               onkeypress="if(event.key==='Enter') window.__bk.send()" />
        <button id="bk-send" onclick="window.__bk.send()">➤</button>
      </div>
    </div>

    <div id="bk-footer">
      <a href="https://anzo.ca" target="_blank" style="color:#bbb;text-decoration:none;font-size:9px;letter-spacing:0.08em;">Powered by Anzo</a>
    </div>
  </div>
  `;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);

  /* ── STATE ──────────────────────────────────────────────── */
  let history     = [];
  let currentLoc  = null;
  let started     = false;

  /* ── PUBLIC API ─────────────────────────────────────────── */
  window.__bk = {

    toggle() {
      const win    = document.getElementById("bk-window");
      const bubble = document.getElementById("bk-bubble");
      const open   = win.style.display === "flex";
      if (open) {
        win.style.display    = "none";
        bubble.style.display = "flex";
      } else {
        win.style.display    = "flex";
        bubble.style.display = "none";
      }
    },

    pickLocation(locKey) {
      currentLoc = locKey;
      const loc  = LOCATIONS[locKey];
      document.getElementById("bk-location-screen").style.display = "none";
      document.getElementById("bk-chat-screen").style.display     = "flex";
      document.getElementById("bk-sub").textContent = loc.label;
      history = [];
      const open = isOpen(locKey);
      const greeting = open
        ? `Hey! 👋 I'm ${BOT_NAME}, your assistant for ${GROUP_NAME} — ${loc.label}. How can I help you today?`
        : `Hey! 👋 I'm ${BOT_NAME}. The ${loc.label} location is currently closed, but I'm here to help. You can book online anytime and our team will confirm during business hours.`;
      this.addMsg(greeting, "bot");
      this.showFirstButtons();
      setTimeout(() => document.getElementById("bk-input").focus(), 200);
    },

    addMsg(text, sender) {
      const msgs = document.getElementById("bk-msgs");
      const div  = document.createElement("div");
      div.className    = `bk-msg bk-${sender}`;
      div.textContent  = text;
      div.style.opacity    = "0";
      div.style.transform  = "translateY(8px)";
      div.style.transition = "opacity 0.3s ease, transform 0.3s ease";
      msgs.appendChild(div);
      requestAnimationFrame(() => setTimeout(() => {
        div.style.opacity   = "1";
        div.style.transform = "translateY(0)";
        msgs.scrollTop = msgs.scrollHeight;
      }, 10));
      return div;
    },

    showFirstButtons() {
      const loc  = LOCATIONS[currentLoc];
      const msgs = document.getElementById("bk-msgs");
      const div  = document.createElement("div");
      div.className = "bk-btns";
      div.appendChild(this._makeLink(BOOK_URL, "📅 Book Appointment"));
      if (isOpen(currentLoc)) {
        div.appendChild(this._makeLink(`tel:${loc.phoneRaw}`, "📞 Call"));
      }
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
    },

    showBookCall() {
      const loc  = LOCATIONS[currentLoc];
      const msgs = document.getElementById("bk-msgs");
      const div  = document.createElement("div");
      div.className = "bk-btns";
      div.appendChild(this._makeLink(BOOK_URL, "📅 Book Appointment"));
      if (isOpen(currentLoc)) div.appendChild(this._makeLink(`tel:${loc.phoneRaw}`, "📞 Call"));
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
    },

    showCallOnly() {
      const loc  = LOCATIONS[currentLoc];
      const msgs = document.getElementById("bk-msgs");
      const div  = document.createElement("div");
      div.className = "bk-btns";
      const a = this._makeLink(`tel:${loc.phoneRaw}`, "📞 Call Now — Emergency");
      a.classList.add("bk-emergency");
      div.appendChild(a);
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
    },

    showMapButton() {
      const loc  = LOCATIONS[currentLoc];
      const msgs = document.getElementById("bk-msgs");
      const div  = document.createElement("div");
      div.className = "bk-btns";
      div.appendChild(this._makeLink(loc.mapUrl, "📍 Get Directions"));
      div.appendChild(this._makeLink(BOOK_URL, "📅 Book Appointment"));
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
    },

    showHours() {
      const loc   = LOCATIONS[currentLoc];
      const msgs  = document.getElementById("bk-msgs");
      const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
      let rows = "";
      for (const [day, time] of Object.entries(loc.hours)) {
        const isToday = day === today;
        rows += `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f0e8e7;font-weight:${isToday?"bold":"normal"};color:${isToday?"#1a1a1a":"#555"};">
          <span>${isToday ? "📍 " + day + " (Today)" : day}</span><span>${time}</span></div>`;
      }
      const card = document.createElement("div");
      card.style.cssText = "background:#f5ecea;border-radius:12px;padding:12px 14px;font-size:12px;max-width:82%;align-self:flex-start;margin-top:4px;";
      card.innerHTML = `<div style="font-weight:bold;margin-bottom:8px;color:#1a1a1a;">🕐 ${loc.label} Hours</div>${rows}<div style="margin-top:8px;font-size:11px;color:#aaa;">Hours may vary on holidays — call us to confirm.</div>`;
      msgs.appendChild(card);
      const div = document.createElement("div");
      div.className = "bk-btns";
      div.appendChild(this._makeLink(BOOK_URL, "📅 Book Appointment"));
      if (isOpen(currentLoc)) div.appendChild(this._makeLink(`tel:${loc.phoneRaw}`, "📞 Call"));
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
    },

    async send() {
      const input = document.getElementById("bk-input");
      const msg   = input.value.trim();
      if (!msg) return;
      this.addMsg(msg, "user");
      input.value = "";

      const loc    = LOCATIONS[currentLoc];
      const lower  = msg.toLowerCase();
      const typing = this.addMsg("", "bot");
      typing.innerHTML = '<span class="bk-typing"><span>.</span><span>.</span><span>.</span></span>';

      let data;
      try {
        const ctrl    = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 15000);
        const res     = await fetch(`${BROOK_API}/brook/chat`, {
          method:  "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": BROOK_KEY },
          body:    JSON.stringify({ message: msg, history, location: currentLoc }),
          signal:  ctrl.signal
        });
        clearTimeout(timeout);
        data = await res.json();
      } catch(_) {
        typing.textContent = isOpen(currentLoc)
          ? `I'm having trouble right now. Please give us a call at ${loc.phone}.`
          : "I'm having trouble right now. Please book online and we'll confirm during business hours.";
        this.showBookCall();
        return;
      }

      typing.textContent = data.reply;
      const msgs = document.getElementById("bk-msgs");
      setTimeout(() => { msgs.scrollTop = msgs.scrollHeight; }, 150);

      history.push({ role: "user",      content: msg });
      history.push({ role: "assistant", content: data.reply });

      const replyL = data.reply.toLowerCase();

      if (replyL.includes("call us immediately") || replyL.includes("emergency room") || replyL.includes("call 911")) {
        this.showCallOnly(); return;
      }
      if (lower.includes("hour") || lower.includes("open") || lower.includes("close") ||
          lower.includes("when do you") || lower.includes("what time")) {
        this.showHours(); return;
      }
      if (replyL.includes("address") || replyL.includes("located") ||
          replyL.includes("st. mary") || replyL.includes("keewatin") || replyL.includes("sargent")) {
        this.showMapButton(); return;
      }
      if (replyL.includes("book") || replyL.includes("appointment") ||
          replyL.includes("online") || replyL.includes("call") || replyL.includes("phone")) {
        this.showBookCall();
      }
    },

    _makeLink(href, label, extraClass) {
      const a       = document.createElement("a");
      a.className   = "bk-btn" + (extraClass ? " " + extraClass : "");
      a.href        = href;
      a.textContent = label;
      a.target      = "_blank";
      return a;
    }
  };

})();
