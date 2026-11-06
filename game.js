(() => {
  const $ = id => document.getElementById(id);
  const SUITS = ["♠", "♥", "♦", "♣"];
  const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
  const MAX_BUY_IN = 1e9; // dollars
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = ms => new Promise(r => setTimeout(r, reduced ? 0 : ms));

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} }
  };

  const { value, total, isBlackjack, dealerHits, settleBet, settleInsuranceBet, shuffle, ACTION_NAMES: NAMES } = window.BJRules;
  const isBJ = h => isBlackjack(h.cards, h.fromSplit);

  const opts = Object.assign({ decks: 6, h17: true, surrender: true, das: true, hint: false }, store.get("bj-opts", {}));
  const blankStats = () => ({ hands: 0, won: 0, lost: 0, push: 0, bj: 0, book: 0, decisions: 0, peak: 0, bigWin: 0 });

  // All money is whole cents. session is null until the player buys in.
  // The saved copy is only written between rounds, so leaving mid-hand calls the hand off and refunds its bets.
  let session = store.get("bj-session", null);
  let stats = Object.assign(blankStats(), store.get("bj-stats", {}));
  let bet = session ? Math.min(session.lastBet || 0, wholeDollars(session.bankroll)) : 0;

  let shoe = [], shoeSize = 0, cutAt = 0, shoeDecks = 0, needShuffle = true;
  let dealer = [], holeHidden = true, hands = [], active = 0;
  let phase = "idle"; // idle | dealing | insurance | player | dealer | over
  let insurance = null, busy = false, firstDecision = true, resetArmed = 0;

  function wholeDollars(cents) { return Math.floor(cents / 100) * 100; }
  function fmt(cents, signed) {
    const abs = Math.abs(cents) / 100;
    const s = abs.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });
    return signed ? (cents > 0 ? "+" : cents < 0 ? "−" : "") + s : (cents < 0 ? "−" : "") + s;
  }
  const between = () => phase === "idle" || phase === "over";
  const broke = () => session && between() && session.bankroll < 100;

  function buildShoe() {
    shoe = [];
    for (let d = 0; d < opts.decks; d++) for (const s of SUITS) for (const r of RANKS) shoe.push({ r, s });
    shuffle(shoe, a => crypto.getRandomValues(a));
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
  const canAfford = cents => session.bankroll >= cents;
  function canDouble(h) { return h.cards.length === 2 && !h.splitAces && (!h.fromSplit || opts.das) && canAfford(h.bet); }
  function canSplit(h) { return h.cards.length === 2 && value(h.cards[0]) === value(h.cards[1]) && hands.length < 4 && !h.splitAces && canAfford(h.bet); }
  function canSurrender(h) { return opts.surrender && hands.length === 1 && h.cards.length === 2 && !h.fromSplit && firstDecision; }
  const insuranceCost = () => Math.round(hands[0].bet / 2);

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
    const seated = !!session;
    $("setup").hidden = seated;
    $("hands").hidden = !seated;

    syncCards($("dealerCards"), dealer, holeHidden ? 1 : -1);
    $("dealerTotal").textContent = dealer.length ? (holeHidden ? totalText([dealer[0]]) + " showing" : (isBJ({ cards: dealer }) ? "Blackjack" : totalText(dealer))) : "";

    const wrap = $("hands");
    while (wrap.children.length > Math.max(hands.length, 1)) wrap.lastChild.remove();
    const list = hands.length ? hands : [{ cards: [] }];
    list.forEach((h, i) => {
      let el = wrap.children[i];
      if (!el) { el = document.createElement("div"); el.className = "hand"; el.innerHTML = `<div class="cards"></div><div class="zone-label"><span class="who"></span><span class="total"></span></div><span class="stake"></span><span class="badge" hidden></span>`; wrap.appendChild(el); }
      el.classList.toggle("active", phase === "player" && i === active && hands.length > 1);
      syncCards(el.querySelector(".cards"), h.cards, -1);
      el.querySelector(".who").textContent = hands.length > 1 ? `Hand ${i + 1}` : "You";
      el.querySelector(".total").textContent = h.cards.length ? (isBJ(h) ? "Blackjack" : totalText(h.cards)) : "";
      el.querySelector(".stake").textContent = h.bet ? fmt(h.bet * (h.doubled ? 2 : 1)) + (h.doubled ? " · doubled" : "") : "";
      const b = el.querySelector(".badge");
      b.hidden = !h.badge; if (h.badge) { b.textContent = h.badge.text; b.className = "badge " + h.badge.kind; }
    });

    const inPlay = phase === "player" && !busy, h = cur();
    const show = (id, on) => $(id).hidden = !on;
    const canBet = seated && between() && !busy && !broke();
    show("betting", canBet);
    show("btnDeal", canBet);
    show("btnRebuy", broke());
    $("btnDeal").disabled = busy || bet < 100 || bet > (session ? session.bankroll : 0);
    $("btnDeal").firstChild.textContent = phase === "over" ? "Deal next hand" : "Deal";
    show("btnInsYes", phase === "insurance"); show("btnInsNo", phase === "insurance");
    if (phase === "insurance") {
      const even = isBJ(hands[0]);
      $("btnInsYes").firstChild.textContent = even ? "Take even money" : `Insure for ${fmt(insuranceCost())}`;
      $("btnInsYes").disabled = !canAfford(insuranceCost());
    }
    ["btnHit", "btnStand", "btnDouble", "btnSplit"].forEach(id => show(id, phase === "player"));
    show("btnSurrender", phase === "player" && opts.surrender);
    $("btnHit").disabled = $("btnStand").disabled = !inPlay;
    $("btnDouble").disabled = !inPlay || !canDouble(h);
    $("btnSplit").disabled = !inPlay || !canSplit(h);
    $("btnSurrender").disabled = !inPlay || !canSurrender(h);

    $("hint").innerHTML = (opts.hint && inPlay) ? `Basic strategy: <b>${NAMES[strategy(h, dealer[0])]}</b>` : "";

    // bet controls
    if (canBet) {
      const max = wholeDollars(session.bankroll);
      $("betAmt").textContent = fmt(bet);
      if (document.activeElement !== $("betInput")) $("betInput").value = bet ? bet / 100 : "";
      $("betInput").max = max / 100;
      document.querySelectorAll("#chips .chip").forEach(c => c.disabled = bet + c.dataset.chip * 100 > max);
      $("btnClearBet").disabled = bet === 0;
      $("btnAllIn").disabled = bet === max;
    }

    // header + stats
    $("bankroll").textContent = seated ? fmt(session.bankroll) : "–";
    const pl = seated ? session.bankroll - session.start : 0;
    $("sessionPL").textContent = seated ? fmt(pl, true) : "–";
    $("sessionPL").style.color = pl > 0 ? "var(--win)" : pl < 0 ? "var(--lose)" : "";
    $("record").textContent = `${stats.won}–${stats.lost}–${stats.push}`;
    $("stStart").textContent = seated ? fmt(session.start) : "–";
    $("stPeak").textContent = seated ? fmt(Math.max(stats.peak, session.start)) : "–";
    $("stBigWin").textContent = stats.bigWin ? fmt(stats.bigWin) : "–";
    $("stHands").textContent = stats.hands; $("stWon").textContent = stats.won; $("stLost").textContent = stats.lost;
    $("stPush").textContent = stats.push; $("stBJ").textContent = stats.bj;
    $("stBook").textContent = stats.decisions ? Math.round(stats.book / stats.decisions * 100) + "%" : "–";
    const left = shoeSize ? shoe.length : 0;
    $("shoeLeft").textContent = shoeSize ? `· ${left} cards` : "";
    $("shoeFill").style.width = shoeSize ? (left / shoeSize * 100) + "%" : "100%";
    $("shoeCut").style.left = (shoeSize ? cutAt / shoeSize * 100 : 25) + "%";
    $("dealerRulePrint").textContent = `DEALER MUST ${opts.h17 ? "HIT" : "STAND ON"} SOFT 17 · INSURANCE PAYS 2 TO 1`;
    document.querySelectorAll(".panel select, .panel input").forEach(el => el.disabled = !between() && el.id !== "optHint");
    $("btnReset").disabled = !seated || !between() || busy;
    $("btnReset").textContent = resetArmed ? "Tap again to reset" : "Reset session";
    $("btnReset").classList.toggle("armed", !!resetArmed);
  }
  const say = t => $("msg").textContent = t;

  function saveSession() {
    session.lastBet = bet;
    stats.peak = Math.max(stats.peak, session.bankroll);
    store.set("bj-session", session);
    store.set("bj-stats", stats);
  }

  // ---------- buy-in and betting ----------
  function sitDown(e) {
    e.preventDefault();
    const dollars = Math.floor(Number($("buyIn").value));
    if (!Number.isFinite(dollars) || dollars < 1) { $("buyErr").textContent = "Enter at least $1."; return; }
    if (dollars > MAX_BUY_IN) { $("buyErr").textContent = `The most you can buy in for is ${fmt(MAX_BUY_IN * 100)}.`; return; }
    $("buyErr").textContent = "";
    session = { start: dollars * 100, bankroll: dollars * 100, lastBet: 0 };
    stats = blankStats(); stats.peak = session.bankroll;
    bet = Math.min(2500, session.bankroll); // open with a $25 bet when the bankroll allows it
    dealer = []; hands = []; phase = "idle";
    saveSession();
    say(`You bought in for ${fmt(session.start)}. Place a bet and deal.`);
    render();
  }

  function setBet(cents) {
    if (!session || !between() || busy) return;
    bet = Math.max(0, Math.min(wholeDollars(cents), wholeDollars(session.bankroll)));
    render();
  }

  function resetSession() {
    if (!session || !between() || busy) return;
    if (!resetArmed) {
      resetArmed = setTimeout(() => { resetArmed = 0; render(); }, 4000);
      render(); return;
    }
    clearTimeout(resetArmed); resetArmed = 0;
    session = null; stats = blankStats(); bet = 0;
    dealer = []; hands = []; phase = "idle"; needShuffle = true;
    store.del("bj-session"); store.del("bj-stats");
    say("Session reset. Buy in to play again.");
    render();
    $("buyIn").focus();
  }

  // ---------- game flow ----------
  async function deal() {
    if (busy || !session || !between() || bet < 100 || bet > session.bankroll) return;
    busy = true;
    let shuffled = false;
    if (needShuffle || shoeDecks !== opts.decks || shoe.length <= cutAt) { buildShoe(); shuffled = true; }
    session.bankroll -= bet;
    dealer = []; hands = [{ cards: [], bet }]; active = 0; holeHidden = true; insurance = null; firstDecision = true;
    phase = "dealing";
    say(shuffled ? "Fresh shoe shuffled." : "");
    for (const target of ["p", "d", "p", "d"]) {
      (target === "p" ? hands[0].cards : dealer).push(draw());
      render(); await wait(260);
    }
    const up = dealer[0];
    if (up.r === "A") {
      phase = "insurance"; busy = false;
      say(isBJ(hands[0]) ? "Dealer shows an ace. Take even money?" : "Dealer shows an ace. Insurance?");
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
    if (insurance) say("No dealer blackjack. Insurance loses."); else say(peeks ? "No dealer blackjack." : "");
    phase = "player"; busy = false; render();
  }

  function recordDecision(code) {
    if (phase !== "player") return;
    const best = strategy(cur(), dealer[0]);
    stats.decisions++; if (best === code) stats.book++;
    if (opts.hint && best !== code) say(`Book play was ${NAMES[best]}.`); else say("");
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
    busy = true; const h = cur();
    session.bankroll -= h.bet; h.doubled = true;
    h.cards.push(draw()); render(); await wait(300);
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
    session.bankroll -= h.bet;
    const second = { cards: [h.cards.pop()], bet: h.bet, fromSplit: true, splitAces: aces };
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
      while (dealerHits(dealer, opts.h17)) { dealer.push(draw()); render(); await wait(480); }
    }
    settle();
  }

  function settle(lead) {
    const d = total(dealer).t, dBJ = isBJ({ cards: dealer });
    let net = 0;
    const lines = [];
    if (insurance) {
      const ins = settleInsuranceBet(hands[0].bet, dealer);
      session.bankroll += ins.returned; net += ins.profit;
      lines.push(dBJ ? `Insurance pays ${fmt(ins.profit)}.` : "Insurance lost.");
    }
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
      const { profit, returned, outcome } = settleBet(h, dealer);
      session.bankroll += returned; net += profit;
      if (outcome === "blackjack") stats.bj++;
      h.badge = BADGES[outcome](h);
      stats.hands++;
      if (profit > 0) stats.won++; else if (profit < 0) stats.lost++; else stats.push++;
    });
    stats.bigWin = Math.max(stats.bigWin, net);
    if (!lead) lead = d > 21 ? `Dealer busts with ${d}.` : hands.every(h => h.surrendered || total(h.cards).t > 21) ? "" : `Dealer stands on ${d}.`;
    const result = net > 0 ? `You win ${fmt(net)}.` : net < 0 ? `You lose ${fmt(-net)}.` : "You break even.";
    phase = "over";
    bet = Math.min(bet, wholeDollars(session.bankroll));
    saveSession();
    const tail = session.bankroll < 100 ? " You're out of chips." : "";
    say([lead, ...lines, result].filter(Boolean).join(" ") + tail);
    busy = false; render();
  }

  function takeInsurance(yes) {
    if (phase !== "insurance") return;
    if (yes && !canAfford(insuranceCost())) return;
    insurance = yes;
    if (yes) session.bankroll -= insuranceCost();
    peekAndContinue();
  }

  // ---------- wiring ----------
  $("setup").addEventListener("submit", sitDown);
  document.querySelectorAll("#quickBuy button").forEach(b => b.onclick = () => { $("buyIn").value = b.dataset.amt; $("buyErr").textContent = ""; });
  document.querySelectorAll("#chips .chip").forEach(c => c.onclick = () => setBet(bet + c.dataset.chip * 100));
  $("btnClearBet").onclick = () => setBet(0);
  $("btnAllIn").onclick = () => setBet(session ? session.bankroll : 0);
  $("betInput").addEventListener("input", () => { const v = Math.floor(Number($("betInput").value)); setBet(Number.isFinite(v) ? v * 100 : 0); });
  $("betInput").addEventListener("blur", render);
  $("btnRebuy").onclick = () => { session = null; stats = blankStats(); dealer = []; hands = []; phase = "idle"; store.del("bj-session"); store.del("bj-stats"); say(""); render(); $("buyIn").focus(); };

  $("btnDeal").onclick = deal;
  $("btnHit").onclick = hit;
  $("btnStand").onclick = stand;
  $("btnDouble").onclick = dbl;
  $("btnSplit").onclick = split;
  $("btnSurrender").onclick = surrender;
  $("btnInsYes").onclick = () => takeInsurance(true);
  $("btnInsNo").onclick = () => takeInsurance(false);
  $("btnReset").onclick = resetSession;

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
    if ((k === " " || k === "enter") && between() && session) { e.preventDefault(); deal(); }
    else if (map[k]) map[k]();
  });

  if (session) say(`Welcome back. Your bankroll is ${fmt(session.bankroll)}.`);
  render();
})();
