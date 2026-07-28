let playMode = false;
let moveQueue = [];
let lastMoveTime = 0;
let moveDelay = 200;

let player = {
  cell: null,
  orientation: 0,
  angle: 0,
  forwardIndex: 0,
  visited: new Set(),
  path: [],
};

function draw() {
  background(11);
  translate(width / 2, height / 2);
  strokeWeight(params.thickness);
  noFill();

  if (playMode) {
    drawMaze();
    if (document.getElementById('showStep')?.checked) {
      drawPlayerPath();
    }
    drawPlayer();
    if (params.showSolution) drawSolution();
    
    if (moveQueue.length > 0 && millis() - lastMoveTime > moveDelay) {
      const nextCell = moveQueue.shift();
      player.cell = nextCell;
      lastMoveTime = millis();
    }
  } else {
    drawMaze();
    if (params.showSolution) drawSolution();
  }

  if (isGenerating && params.animated) {
    stepGeneration();
  } else if (isGenerating && !params.animated) {
    while (isGenerating) {
      stepGeneration();
    }
  } else {
    noLoop();
  }
}

function getAccessibleNeighbors(cell) {
  const out = [];
  const ring = cell.ring;
  const count = ringSectorCounts[ring];

  if (ring > 0 && !cell.walls.inner) {
    const innerRing = ring - 1;
    const innerCount = ringSectorCounts[innerRing];
    const s = floor(cell.sector * innerCount / count);
    out.push(getCell(innerRing, s));
  }

  if (ring < params.rings - 1 && !cell.walls.outer) {
    const outerRing = ring + 1;
    const outerCount = ringSectorCounts[outerRing];
    const s = floor(cell.sector * outerCount / count);
    out.push(getCell(outerRing, s));
  }

  if (!cell.walls.left) out.push(getCell(ring, cell.sector - 1));
  if (!cell.walls.right) out.push(getCell(ring, cell.sector + 1));

  return out.filter(Boolean);
}

function computePlayerVisibility() {
  for (const c of cells) {
    c.playerVisible = false;
    if (!params.rememberPaths) c.playerVisited = false;
  }

  if (!player.cell) return;
  const start = player.cell;
  start.playerVisible = true;
  start.playerVisited = true;

  for (let dirIndex = 0; dirIndex < 4; dirIndex++) {
    let next = null;
    if (dirIndex === 0 && !start.walls.inner) next = getAccessibleNeighbors(start).find((n) => n.ring === start.ring - 1);
    if (dirIndex === 2 && !start.walls.outer) next = getAccessibleNeighbors(start).find((n) => n.ring === start.ring + 1);
    if (dirIndex === 1 && !start.walls.right) next = getAccessibleNeighbors(start).find((n) => n.ring === start.ring && n.sector === ((start.sector + 1) % ringSectorCounts[start.ring]));
    if (dirIndex === 3 && !start.walls.left) next = getAccessibleNeighbors(start).find((n) => n.ring === start.ring && n.sector === ((start.sector - 1 + ringSectorCounts[start.ring]) % ringSectorCounts[start.ring]))

    if (!next) continue;

    let cur = next;
    while (cur) {
      cur.playerVisible = true;
      cur.playerVisited = true;
      const opens = getAccessibleNeighbors(cur).length;
      if (opens !== 2) {
        const look = Number(document.getElementById('lookahead').value) || params.lookahead;
        for (const out of getAccessibleNeighbors(cur)) {
          let p = out;
          let l = 0;
          while (p && l < look) {
            p.playerVisible = true;
            p.playerVisited = true;
            const nexts = getAccessibleNeighbors(p).filter((x) => x !== cur);
            p = nexts.length ? nexts[0] : null;
            l++;
          }
        }
        break;
      }
      const nexts = getAccessibleNeighbors(cur).filter((x) => !x.playerVisited || x === start);
      let candidate = null;
      candidate = nexts.find((n) => n.ring === cur.ring - 1) || nexts.find((n) => n.ring === cur.ring + 1) || nexts[0];
      if (!candidate) break;
      cur = candidate;
    }
  }
}

function enterPlayMode() {
  if (isGenerating) return;
  playMode = true;
  player.cell = exitCell || getCell(params.rings - 1, 0);
  player.orientation = 0;
  player.angle = 0;
  player.forwardIndex = 0;
  player.visited = new Set();
  player.path = [player.cell];
  moveQueue = [];
  lastMoveTime = millis();
  for (const c of cells) {
    c.playerVisited = false;
    c.playerVisible = false;
  }
  computePlayerVisibility();
  loop();
}

function exitPlayMode() {
  playMode = false;
  player.cell = null;
  for (const c of cells) {
    c.playerVisible = false;
  }
  redraw();
}

function getDirectionTargets(cell, orientation) {
  if (!cell) return [];

  if (orientation === 0 && cell.ring > 0 && !cell.walls.inner) {
    const innerRing = cell.ring - 1;
    const innerCount = ringSectorCounts[innerRing];
    const count = ringSectorCounts[cell.ring];
    const start = floor(cell.sector * innerCount / count);
    const end = floor((cell.sector + 1) * innerCount / count - 1e-6);
    const targets = [];
    for (let sector = start; sector <= end; sector++) {
      targets.push(getCell(innerRing, sector));
    }
    return targets.filter(Boolean);
  }

  if (orientation === 2 && cell.ring < params.rings - 1 && !cell.walls.outer) {
    const outerRing = cell.ring + 1;
    const outerCount = ringSectorCounts[outerRing];
    const count = ringSectorCounts[cell.ring];
    const start = floor(cell.sector * outerCount / count);
    const end = floor((cell.sector + 1) * outerCount / count - 1e-6);
    const targets = [];
    for (let sector = start; sector <= end; sector++) {
      targets.push(getCell(outerRing, sector));
    }
    return targets.filter(Boolean);
  }

  if (orientation === 1 && !cell.walls.right) {
    return [getCell(cell.ring, cell.sector + 1)].filter(Boolean);
  }

  if (orientation === 3 && !cell.walls.left) {
    return [getCell(cell.ring, cell.sector - 1)].filter(Boolean);
  }

  return [];
}

function snapPlayerToOrientation(orientation) {
  if (!player.cell) return;

  const targets = getDirectionTargets(player.cell, orientation);
  if (!targets.length) return;

  const centerR = params.centerRadius;
  const radiusStep = (min(width, height) / 2 - params.outerPadding - centerR) / (params.rings - 1);
  const p = getCellMidpoint(player.cell, centerR, radiusStep);
  const q = getCellMidpoint(targets[0], centerR, radiusStep);

  player.orientation = orientation;
  player.angle = atan2(q.y - p.y, q.x - p.x) + HALF_PI;
}

function movePlayerForward() {
  if (!player.cell) return;

  let current = player.cell;
  let previous = null;
  let corridor = [];
  let steps = 0;

  while (steps < 64) {
    const options = getAccessibleNeighbors(current).filter((neighbor) => neighbor !== previous);

    if (options.length === 0) {
      break;
    }

    if (options.length > 1) {
      break;
    }

    previous = current;
    current = options[0];
    current.playerVisited = true;
    corridor.push(current);
    steps += 1;
  }

  if (corridor.length === 0) {
    const initialTargets = getDirectionTargets(current, player.orientation);
    if (initialTargets.length === 0) return;

    previous = current;
    current = initialTargets[0];
    current.playerVisited = true;
    corridor.push(current);

    while (steps < 64) {
      const options = getAccessibleNeighbors(current).filter((neighbor) => neighbor !== previous);

      if (options.length !== 1) {
        break;
      }

      previous = current;
      current = options[0];
      current.playerVisited = true;
      corridor.push(current);
      steps += 1;
    }
  }

  if (corridor.length === 0) return;

  if (document.getElementById('showStep')?.checked) {
    moveQueue.push(...corridor);
    lastMoveTime = millis();
  } else {
    player.cell = current;
  }
  
  player.path.push(...corridor);
  player.forwardIndex = 0;

  computePlayerVisibility();
  loop();
}

function movePlayerBack() {
  player.orientation = (player.orientation + 2) % 4;
  movePlayerForward();
}

function turnPlayerLeft() {
  const nextOrientation = (player.orientation + 1) % 4;
  snapPlayerToOrientation(nextOrientation);
  player.forwardIndex = 0;
  computePlayerVisibility();
  loop();
}

function turnPlayerRight() {
  const nextOrientation = (player.orientation + 3) % 4;
  snapPlayerToOrientation(nextOrientation);
  player.forwardIndex = 0;
  computePlayerVisibility();
  loop();
}

function drawPlayerPath() {
  if (!player.path.length) return;
  const centerR = params.centerRadius;
  const radiusStep = (min(width, height) / 2 - params.outerPadding - centerR) / (params.rings - 1);
  
  stroke(100, 150, 200, 150);
  strokeWeight(1.5);
  noFill();
  beginShape();
  
  for (const cell of player.path) {
    const p = getCellMidpoint(cell, centerR, radiusStep);
    vertex(p.x, p.y);
  }
  
  endShape();
}

function drawPlayer() {
  if (!player.cell) return;
  const centerR = params.centerRadius;
  const radiusStep = (min(width, height) / 2 - params.outerPadding - centerR) / (params.rings - 1);
  const p = getCellMidpoint(player.cell, centerR, radiusStep);

  push();
  translate(p.x, p.y);
  rotate(player.angle);
  noStroke();
  fill(170);
  triangle(-5, 7, 5, 7, 0, -8);
  pop();
}

window.addEventListener('keydown', (e) => {
  if (!playMode) return;
  const key = e.key.toLowerCase();

  if (key === 'a' || key === 'arrowleft') {
    e.preventDefault();
    turnPlayerLeft();
  }
  if (key === 'd' || key === 'arrowright') {
    e.preventDefault();
    turnPlayerRight();
  }
  if (key === 'w' || key === 'arrowup') {
    e.preventDefault();
    movePlayerForward();
  }
  if (key === 's' || key === 'arrowdown') {
    e.preventDefault();
    movePlayerBack();
  }
});
