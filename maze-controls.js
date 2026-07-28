function updateControls() {
  document.getElementById('rings').value = params.rings;
  document.getElementById('ringsValue').textContent = params.rings;
  document.getElementById('algorithm').value = params.algorithm;
  document.getElementById('sectors').value = params.sectors;
  document.getElementById('sectorsValue').textContent = params.sectors;
  document.getElementById('doublingSteps').value = params.doublingSteps;
  document.getElementById('stepsValue').textContent = params.doublingSteps;
  document.getElementById('thickness').value = params.thickness;
  document.getElementById('centerRadius').value = params.centerRadius;
  document.getElementById('seed').value = params.seed;
  document.getElementById('seedValue').textContent = params.seed;
  document.getElementById('toggleSolution').textContent = params.showSolution ? 'Hide solution' : 'Show solution';
}

function syncControl(id, prop, cast = Number) {
  const control = document.getElementById(id);
  control.addEventListener('input', (event) => {
    params[prop] = cast(event.target.value);
    updateControls();
    generateMaze();
  });
}

document.getElementById('regenerate').addEventListener('click', () => generateMaze());
document.getElementById('savePNG').addEventListener('click', () => saveAsPrintPNG());
document.getElementById('playToggle').addEventListener('click', () => {
  if (!playMode) enterPlayMode(); else exitPlayMode();
});
document.getElementById('rememberPaths').addEventListener('change', (e) => {
  params.rememberPaths = e.target.checked;
});
document.getElementById('lookahead').addEventListener('input', (e) => {
  params.lookahead = Number(e.target.value);
});
document.getElementById('algorithm').addEventListener('change', (event) => {
  params.algorithm = event.target.value;
  updateControls();
  generateMaze();
});
syncControl('rings', 'rings', Number);
syncControl('sectors', 'sectors', Number);
syncControl('doublingSteps', 'doublingSteps', Number);
syncControl('thickness', 'thickness', Number);
syncControl('centerRadius', 'centerRadius', Number);
document.getElementById('toggleSolution').addEventListener('click', () => {
  params.showSolution = !params.showSolution;
  updateControls();
  redraw();
});
document.getElementById('seed').addEventListener('input', (event) => {
  params.seed = Number(event.target.value);
  updateControls();
  generateMaze();
});
document.getElementById('animated').addEventListener('change', (event) => {
  params.animated = event.target.checked;
});

updateControls();
