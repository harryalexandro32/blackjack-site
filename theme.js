// Classic (green felt) or Dark (charcoal) look, remembered on this device.
// Loaded in <head> so the page never flashes the wrong colours, then adds a switch to the header.
(function () {
  const KEY = "cr-theme", root = document.documentElement;
  let theme = "classic";
  try { theme = localStorage.getItem(KEY) === "dark" ? "dark" : "classic"; } catch {}
  const apply = () => {
    root.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === "dark" ? "#0d0e10" : "#2b1910";
  };
  apply();
  document.addEventListener("DOMContentLoaded", () => {
    const bar = document.querySelector(".bar-in");
    if (!bar) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "theme-btn";
    const draw = () => {
      b.textContent = theme === "dark" ? "☀" : "☾";
      b.setAttribute("aria-label", theme === "dark" ? "Switch to the classic green look" : "Switch to dark mode");
      b.title = theme === "dark" ? "Classic look" : "Dark mode";
    };
    b.onclick = () => {
      theme = theme === "dark" ? "classic" : "dark";
      try { localStorage.setItem(KEY, theme); } catch {}
      apply(); draw();
    };
    draw();
    bar.appendChild(b);
  });
})();
