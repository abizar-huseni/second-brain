// Runs before the page paints so there is no flash of the wrong theme.
// Kept as a file (not inline) so a strict Content-Security-Policy can still allow it.
(function () {
  var d = document.documentElement;
  var pref = "system";
  try {
    pref = localStorage.getItem("theme") || "system";
  } catch (e) {}
  var dark = pref === "dark" || (pref !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  d.dataset.theme = dark ? "dark" : "light";
  d.style.colorScheme = dark ? "dark" : "light";
})();
