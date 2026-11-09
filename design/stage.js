// Scales a fixed-size screen (tablet, desktop) to fit the window, so the
// mockups can be reviewed on a phone. Interaction keeps working: the screen is
// scaled with a CSS transform, not re-laid out.
function fitStage(width, height) {
  const stage = document.querySelector(".stage");
  const box = document.querySelector(".stage__box");
  const screen = document.querySelector(".stage__screen");
  if (!stage || !box || !screen) return;
  const style = getComputedStyle(stage);
  const inner = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const scale = Math.min(1, inner / width);
  screen.style.width = width + "px";
  screen.style.height = height + "px";
  screen.style.transform = "scale(" + scale + ")";
  box.style.width = width * scale + "px";
  box.style.height = height * scale + "px";
}

function initStage(width, height) {
  fitStage(width, height);
  window.addEventListener("resize", () => fitStage(width, height));
}
