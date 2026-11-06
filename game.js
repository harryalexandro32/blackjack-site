(() => {
  const $ = id => document.getElementById(id);
  const SUITS = ["♠", "♥", "♦", "♣"];
  const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = ms => new Promise(r => setTimeout(r, reduced ? 0 : ms));

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };

  const opts = Object.assign({ decks: 6, h17: true, surrender: true, das: true, hint: false }, store.get("bj-opts", {}));
  const blankStats = () => ({ hands: 0, won: 0, lost: 0, push: 0, bj: 0, units: 0, book: 0, decisions: 0 });
  let stats = Object.assign(blankStats(), store.get("bj-stats", {}));

  let shoe = [], shoeSize = 0, cutAt = 0, shoeDecks = 0, needShuffle = true;
  let dealer = [], holeHidden = true, hands = [], active = 0;
  let phase = "idle"; // idle | insurance | player | dealer | over
  let insurance = null, busy = false, firstDecision = true;

  const { value, total, isBlackjack, dealerHits, settleHand, settleInsurance, ACTION_NAMES: NAMES } = window.BJRules;
  const isBJ = h => isBlackjack(h.cards, h.fromSplit);

  function rand(n) { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; }
  function buildShoe() {
    shoe = [];
    for (let d = 0; d < opts.decks; d++) for (const s of SUITS) for (const r of RANKS) shoe.push({ r, s });
    for (let i = shoe.length - 1; i > 0; i--) { const j = rand(i + 1); [shoe[i], shoe[j]] = [shoe[j], shoe[i]]; }
    shoeSize = shoe.length; shoeDecks = opts.decks;
    cutAt = Math.round(shoeSize * 0.25); // reshuffle when this many cards remain
    shoe.pop(); // burn card
    needShuffle = false;
  }
  const draw = () => shoe.pop();

  const strategy = (h, up) => window.BJRules.strategy(h.cards, up, {
    double: canDouble(h), split: canSplit(h), surrender: canSurrender(h), h17: opts.h17, das: opts.das
  });

  // ---------- rules checks ----------
  const cur = () => hands[active];
  function canDouble(h) { return h.cards.length === 2 && !h.splitAces && (!h.fromSplit || opts.das); }
  function canSplit(h) { return h.cards.length === 2 && value(h.cards[0]) === value(h.cards[1]) && hands.length < 4 && !h.splitAces; }
  function canSurrender(h) { return opts.surrender && hands.length === 1 && h.cards.length === 2 && !h.fromSplit && firstDecision; }

  // ---------- rendering ----------
  function cardEl(c, down) {
    const el = document.createElement("div");
    if (down) { el.className = "card back"; el.setAttribute("aria-label", "face-down card"); return el; }
    const red = c.s === "♥" || c.s === "♦", face = ["J","Q","K"].includes(c.r);
    el.className = "card" + (red ? " red" : "") + (face ? " face" : "");
    el.setAttribute("aria-label", c.r + " of " + ({ "♠": "spades", "♥": "hearts", "♦": "diamonds", "♣": "clubs" })[c.s]);
    el.innerHTML = `<div class="corner tl">${c.r}<span>${c.s}</span></div><div class="pip">${face ? c.r : c.s}</div><div class="corner br">${c.r}<span>${c.s}</span></div>`;
    return el;
  }
  function syncCards(container, cards, hideIdx) {
    // add only new cards so the deal animation plays once per card
    const kids = container.children;
    while (kids.length > cards.length) container.lastChild.remove();
    cards.forEach((c, i) => {
      const down = i === hideIdx;
      const ex = kids[i];
      if (ex && ex.dataset.key === c.r + c.s + down) return;
      const el = cardEl(c, down); el.dataset.key = c.r + c.s + down;
      if (ex) { el.style.animation = "none"; container.replaceChild(el, ex); } else container.appendChild(el);
    });
  }
  function totalText(cards) {
    if (!cards.length) return "";
    const { t, soft } = total(cards);
    if (t > 21) return "Bust · " + t;
    return (soft && t < 21 ? "Soft " : "") + t;
  }

  function render() {
    syncCards($("dealerCards"), dealer, holeHidden ? 1 : -1);
    $("dealerTotal").textContent = dealer.length ? (holeHidden ? totalText([dealer[0]]) + " showing" : (isBJ({ cards: dealer }) ? "Blackjack" : totalText(dealer))) : "";

    const wrap = $("hands");
    while (wrap.children.length > Math.max(hands.length, 1)) wrap.lastChild.remove();
    const list = hands.length ? hands : [{ cards: [] }];
    list.forEach((h, i) => {
      let el = wrap.children[i];
      if (!el) { el = document.createElement("div"); el.className = "hand"; el.innerHTML = `<div class="cards"></div><div class="zone-label"><span class="who"></span><span class="total"></span></div><span class="badge" hidden></span>`; wrap.appendChild(el); }
      el.classList.toggle("active", phase === "player" && i === active && hands.length > 1);
      syncCards(el.querySelector(".cards"), h.cards, -1);
      el.querySelector(".who").textContent = hands.length > 1 ? `Hand ${i + 1}` + (h.doubled ? " · doubled" : "") : (h.doubled ? "You · doubled" : "You");
      el.querySelector(".total").textContent = h.cards.length ? (isBJ(h) ? "Blackjack" : totalText(h.cards)) : "";
      const b = el.querySelector(".badge");
      b.hidden = !h.badge; if (h.badge) { b.textContent = h.badge.text; b.className = "badge " + h.badge.kind; }
    });

    const inPlay = phase === "player" && !busy, h = cur();
    const show = (id, on) => $(id).hidden = !on;
    show("btnDeal", phase === "idle" || phase === "over");
    $("btnDeal").disabled = busy;
    $("btnDeal").firstChild.textContent = phase === "over" ? "Next hand" : "Deal";
    show("btnInsYes", phase === "insurance"); show("btnInsNo", phase === "insurance");
    $("btnInsYes").firstChild.textContent = hands[0] && isBJ(hands[0]) ? "Take even money" : "Take insurance";
    ["btnHit", "btnStand", "btnDouble", "btnSplit"].forEach(id => show(id, phase === "player"));
    show("btnSurrender", phase === "player" && opts.surrender);
    $("btnHit").disabled = $("btnStand").disabled = !inPlay;
    $("btnDouble").disabled = !inPlay || !canDouble(h);
    $("btnSplit").disabled = !inPlay || !canSplit(h);
    $("btnSurrender").disabled = !inPlay || !canSurrender(h);

    $("hint").innerHTML = (opts.hint && inPlay) ? `Basic strategy: <b>${NAMES[strategy(h, dealer[0])]}</b>` : "";

    // header + stats
    const u = stats.units; $("netUnits").textContent = (u > 0 ? "+" : u < 0 ? "−" : "") + Math.abs(u).toFixed(Number.isInteger(u) ? 0 : 1);
    $("netUnits").style.color = u > 0 ? "var(--win)" : u < 0 ? "var(--lose)" : "";
    $("record").textContent = `${stats.won}–${stats.lost}–${stats.push}`;
    $("stHands").textContent = stats.hands; $("stWon").textContent = stats.won; $("stLost").textContent = stats.lost;
    $("stPush").textContent = stats.push; $("stBJ").textContent = stats.bj;
    $("stBook").textContent = stats.decisions ? Math.round(stats.book / stats.decisions * 100) + "%" : "–";
    const left = shoeSize ? shoe.length : 0;
    $("shoeLeft").textContent = shoeSize ? `· ${left} cards` : "";
    $("shoeFill").style.width = shoeSize ? (left / shoeSize * 100) + "%" : "100%";
    $("shoeCut").style.left = (shoeSize ? cutAt / shoeSize * 100 : 25) + "%";
    $("dealerRulePrint").textContent = `DEALER MUST ${opts.h17 ? "HIT" : "STAND ON"} SOFT 17 · INSURANCE PAYS 2 TO 1`;
    document.querySelectorAll(".panel select, .panel input").forEach(el => el.disabled = !(phase === "idle" || phase === "over") && el.id !== "optHint");
  }
  const say = t => $("msg").textContent = t;

  // ---------- game flow ----------
  async function deal() {
    if (busy || !(phase === "idle" || phase === "over")) return;
    busy = true;
    let shuffled = false;
    if (needShuffle || shoeDecks !== opts.decks || shoe.length <= cutAt) { buildShoe(); shuffled = true; }
    dealer = []; hands = [{ cards: [] }]; active = 0; holeHidden = true; insurance = null; firstDecision = true;
    phase = "dealing";
    say(shuffled ? "Fresh shoe shuffled." : "");
    for (const target of ["p", "d", "p", "d"]) {
      (target === "p" ? hands[0].cards : dealer).push(draw());
      render(); await wait(260);
    }
    const up = dealer[0];
    if (up.r === "A") {
      phase = "insurance"; busy = false;
      say(isBJ(hands[0]) ? "Dealer shows an ace. Even money?" : "Dealer shows an ace. Insurance?");
      render(); return;
    }
    await peekAndContinue();
  }

  async function peekAndContinue() {
    busy = true; phase = "dealing";
    const up = dealer[0];
    const peeks = value(up) >= 10;
    if (peeks) { say("Dealer checks for blackjack…"); render(); await wait(650); }
    if (peeks && isBJ({ cards: dealer })) {
      holeHidden = false; render();
      return settle("Dealer has blackjack.");
    }
    if (isBJ(hands[0])) { holeHidden = false; render(); await wait(300); return settle(); }
    if (insurance !== null) say("No dealer blackjack. Insurance loses."); else say(peeks ? "No dealer blackjack." : "");
    phase = "player"; busy = false; render();
  }

  function recordDecision(code) {
    if (phase !== "player") return;
    const best = strategy(cur(), dealer[0]);
    stats.decisions++; if (best === code) stats.book++;
    if (opts.hint && best !== code) say(`Book play was ${NAMES[best]}.`); else if (phase === "player") say("");
    firstDecision = false;
  }

  async function hit() {
    if (busy || phase !== "player") return;
    recordDecision("H");
    busy = true; cur().cards.push(draw()); render(); await wait(240);
    const t = total(cur().cards).t;
    if (t > 21) { cur().badge = { text: "Bust", kind: "lose" }; return nextHand(); }
    if (t === 21) return nextHand();
    busy = false; render();
  }
  async function stand() { if (busy || phase !== "player") return; recordDecision("S"); busy = true; return nextHand(); }
  async function dbl() {
    if (busy || phase !== "player" || !canDouble(cur())) return;
    recordDecision("D");
    busy = true; const h = cur(); h.doubled = true; h.cards.push(draw()); render(); await wait(300);
    if (total(h.cards).t > 21) h.badge = { text: "Bust", kind: "lose" };
    return nextHand();
  }
  async function surrender() {
    if (busy || phase !== "player" || !canSurrender(cur())) return;
    recordDecision("R");
    busy = true; cur().surrendered = true; cur().badge = { text: "Surrendered", kind: "push" };
    return nextHand();
  }
  async function split() {
    if (busy || phase !== "player" || !canSplit(cur())) return;
    recordDecision("P");
    busy = true;
    const h = cur(), aces = h.cards[0].r === "A";
    const second = { cards: [h.cards.pop()], fromSplit: true, splitAces: aces };
    h.fromSplit = true; h.splitAces = aces;
    hands.splice(active + 1, 0, second);
    render(); await wait(200);
    h.cards.push(draw()); render(); await wait(260);
    if (aces) {
      second.cards.push(draw()); render(); await wait(260);
      h.done = second.done = true;
      active = hands.indexOf(second); // both split-ace hands are finished
      return nextHand();
    }
    if (total(h.cards).t === 21) return nextHand();
    busy = false; render();
  }

  async function nextHand() {
    busy = true;
    while (true) {
      active++;
      if (active >= hands.length) break;
      const h = hands[active];
      if (h.cards.length === 1) { render(); await wait(250); h.cards.push(draw()); render(); await wait(260); }
      if (h.done) continue;
      if (total(h.cards).t === 21) continue;
      busy = false; render(); return;
    }
    active = hands.length - 1;
    await dealerPlay();
  }

  async function dealerPlay() {
    phase = "dealer"; busy = true; holeHidden = false; render(); await wait(450);
    const live = hands.some(h => !h.surrendered && total(h.cards).t <= 21);
    if (live) {
      while (true) {
        if (dealerHits(dealer, opts.h17)) { dealer.push(draw()); render(); await wait(480); }
        else break;
      }
    }
    settle();
  }

  function settle(lead) {
    const d = total(dealer).t, dBJ = isBJ({ cards: dealer });
    let net = 0, lines = [];
    if (insurance === true) net += settleInsurance(dealer);
    const x2 = h => h.doubled ? " ×2" : "";
    const BADGES = {
      blackjack: () => ({ text: "Blackjack!", kind: "win" }),
      win: h => ({ text: "Win" + x2(h), kind: "win" }),
      push: () => ({ text: "Push", kind: "push" }),
      lose: h => ({ text: "Lose" + x2(h), kind: "lose" }),
      bust: () => ({ text: "Bust", kind: "lose" }),
      surrender: () => ({ text: "Surrendered", kind: "push" })
    };
    hands.forEach(h => {
      const { units: r, outcome } = settleHand(h, dealer);
      if (outcome === "blackjack") stats.bj++;
      h.badge = BADGES[outcome](h);
      net += r; stats.hands++;
      if (r > 0) stats.won++; else if (r < 0) stats.lost++; else stats.push++;
    });
    stats.units += net;
    store.set("bj-stats", stats);
    if (!lead) lead = d > 21 ? `Dealer busts with ${d}.` : hands.every(h => h.surrendered || total(h.cards).t > 21) ? "" : `Dealer stands on ${d}.`;
    const sign = net > 0 ? `+${net}` : net < 0 ? `−${Math.abs(net)}` : "even";
    if (insurance === true) lines.push(dBJ ? "Insurance pays." : "Insurance lost.");
    say([lead, ...lines, `This round: ${sign}${net === 0 ? "" : (Math.abs(net) === 1 ? " unit" : " units")}.`].filter(Boolean).join(" "));
    phase = "over"; busy = false; render();
  }

  function takeInsurance(yes) {
    if (phase !== "insurance") return;
    insurance = yes;
    peekAndContinue();
  }

  // ---------- wiring ----------
  $("btnDeal").onclick = deal;
  $("btnHit").onclick = hit;
  $("btnStand").onclick = stand;
  $("btnDouble").onclick = dbl;
  $("btnSplit").onclick = split;
  $("btnSurrender").onclick = surrender;
  $("btnInsYes").onclick = () => takeInsurance(true);
  $("btnInsNo").onclick = () => takeInsurance(false);
  $("btnReset").onclick = () => { stats = blankStats(); store.set("bj-stats", stats); render(); };

  $("optDecks").value = String(opts.decks);
  $("optH17").checked = opts.h17; $("optSurrender").checked = opts.surrender;
  $("optDas").checked = opts.das; $("optHint").checked = opts.hint;
  const saveOpts = () => {
    opts.decks = +$("optDecks").value; opts.h17 = $("optH17").checked;
    opts.surrender = $("optSurrender").checked; opts.das = $("optDas").checked; opts.hint = $("optHint").checked;
    store.set("bj-opts", opts); render();
  };
  document.querySelectorAll(".panel select, .panel input").forEach(el => el.addEventListener("change", saveOpts));

  document.addEventListener("keydown", e => {
    if (e.target.closest("select, input") || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const map = { h: hit, s: stand, d: dbl, p: split, r: surrender, y: () => takeInsurance(true), n: () => takeInsurance(false) };
    if ((k === " " || k === "enter") && (phase === "idle" || phase === "over")) { e.preventDefault(); deal(); }
    else if (map[k]) map[k]();
  });

  say("Press Deal to start. Six decks, dealer hits soft 17 by default.");
  render();
})();
