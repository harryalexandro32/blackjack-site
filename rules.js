// Pure blackjack rules: card values, hand totals, dealer drawing, settlement and basic strategy.
// No DOM here, so the same file runs in the browser (window.BJRules) and in Node (tests).
(function (root) {
  const value = c => c.r === "A" ? 11 : (["J", "Q", "K", "10"].includes(c.r) ? 10 : +c.r);

  function total(cards) {
    let t = 0, aces = 0;
    for (const c of cards) { t += value(c); if (c.r === "A") aces++; }
    while (t > 21 && aces) { t -= 10; aces--; }
    return { t, soft: aces > 0 };
  }

  // A split hand that makes 21 in two cards is 21, not blackjack.
  const isBlackjack = (cards, fromSplit = false) => cards.length === 2 && total(cards).t === 21 && !fromSplit;

  function dealerHits(cards, h17) {
    const { t, soft } = total(cards);
    return t < 17 || (h17 && t === 17 && soft);
  }

  // Units won or lost by one player hand. Doubled hands count twice, blackjack pays 3:2, surrender loses half.
  // Returns { units, outcome } where outcome is "blackjack" | "win" | "push" | "lose" | "bust" | "surrender".
  function settleHand(hand, dealerCards) {
    const m = hand.doubled ? 2 : 1;
    const p = total(hand.cards).t, d = total(dealerCards).t;
    const dBJ = isBlackjack(dealerCards);
    if (hand.surrendered) return { units: -0.5, outcome: "surrender" };
    if (isBlackjack(hand.cards, hand.fromSplit)) return dBJ ? { units: 0, outcome: "push" } : { units: 1.5, outcome: "blackjack" };
    if (dBJ) return { units: -1, outcome: "lose" };
    if (p > 21) return { units: -m, outcome: "bust" };
    if (d > 21 || p > d) return { units: m, outcome: "win" };
    if (p === d) return { units: 0, outcome: "push" };
    return { units: -m, outcome: "lose" };
  }

  // Insurance is half a unit paying 2:1.
  const settleInsurance = dealerCards => isBlackjack(dealerCards) ? 1 : -0.5;

  // Multi-deck basic strategy with late surrender. allowed = { double, split, surrender, h17, das }.
  // Returns "H" | "S" | "D" | "P" | "R".
  function strategy(cards, up, allowed) {
    const u = value(up), { t, soft } = total(cards);
    const { h17, das } = allowed;
    const D = x => allowed.double ? "D" : x;
    if (allowed.split) {
      const v = value(cards[0]);
      if (v === 11) return "P";
      if (v === 8) return (h17 && u === 11 && allowed.surrender) ? "R" : "P";
      if (v === 9 && u !== 7 && u !== 10 && u !== 11) return "P";
      if (v === 7 && u <= 7) return "P";
      if (v === 6 && u <= 6 && (das || u >= 3)) return "P";
      if (v === 4 && das && (u === 5 || u === 6)) return "P";
      if ((v === 2 || v === 3) && u <= 7 && (das || u >= 4)) return "P";
    }
    if (soft) {
      if (t >= 20) return "S";
      if (t === 19) return (h17 && u === 6) ? D("S") : "S";
      if (t === 18) {
        if (u >= 3 && u <= 6) return D("S");
        if (u === 2) return h17 ? D("S") : "S";
        if (u === 7 || u === 8) return "S";
        return "H";
      }
      if (t === 17) return (u >= 3 && u <= 6) ? D("H") : "H";
      if (t === 15 || t === 16) return (u >= 4 && u <= 6) ? D("H") : "H";
      if (t === 13 || t === 14) return (u >= 5 && u <= 6) ? D("H") : "H";
      return "H";
    }
    if (allowed.surrender) {
      if (t === 16 && u >= 9) return "R";
      if (t === 15 && (u === 10 || (h17 && u === 11))) return "R";
      if (t === 17 && h17 && u === 11) return "R";
    }
    if (t >= 17) return "S";
    if (t >= 13) return u <= 6 ? "S" : "H";
    if (t === 12) return (u >= 4 && u <= 6) ? "S" : "H";
    if (t === 11) return (u <= 10 || h17) ? D("H") : "H";
    if (t === 10) return u <= 9 ? D("H") : "H";
    if (t === 9) return (u >= 3 && u <= 6) ? D("H") : "H";
    return "H";
  }

  const ACTION_NAMES = { H: "Hit", S: "Stand", D: "Double", P: "Split", R: "Surrender" };

  const api = { value, total, isBlackjack, dealerHits, settleHand, settleInsurance, strategy, ACTION_NAMES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BJRules = api;
})(typeof window !== "undefined" ? window : globalThis);
