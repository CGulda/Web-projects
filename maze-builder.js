let params = {
  rings: 16,
  algorithm: 'backtracker',
  sectors: 24,
  doublingSteps: 3,
  thickness: 2.5,
  centerRadius: 120,
  outerPadding: 10,
  seed: 666,
  showSolution: false,
  animated: false,
  rememberPaths: true,
  lookahead: 2,
};

let cells = [];
let ringSectorCounts = [];
let exitCell = null;
let solutionPath = [];
let centerEntrySector = 0;
let isGenerating = false;
let generationState = {
  stack: [],
  current: null,
  frontier: [],
  visited: new Set(),
};

function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent('canvas-wrapper');
  colorMode(HSL, 360, 100, 100, 1);
  updateControls();
  params.seed = floor(random(10000));
  document.getElementById('seed').value = params.seed;
  document.getElementById('seedValue').textContent = params.seed;
  generateMaze();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  redraw();
}

function saveAsPrintPNG() {
  const g = createGraphics(width, height);
  g.colorMode(HSL, 360, 100, 100, 1);
  g.background(255);
  g.translate(width / 2, height / 2);
  g.strokeWeight(params.thickness);
  g.noFill();
  drawMaze(g, true);
  if (params.showSolution) {
    drawSolution(g, true);
  }
  const dataURL = g.elt.toDataURL('image/png');
  downloadURI(dataURL, 'maze-print.png');
  g.remove();
}

function downloadURI(uri, name) {
  const link = document.createElement('a');
  link.href = uri;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function generateMaze() {
  randomSeed(params.seed);
  noiseSeed(params.seed);
  buildPolarGrid();
  isGenerating = true;
  generationState = { stack: [], current: null, frontier: [], visited: new Set() };
  loop();
}

function stepGeneration() {
  switch (params.algorithm) {
    case 'huntAndKill':
      stepHuntAndKill();
      break;
    case 'prim':
      stepPrim();
      break;
    default:
      stepBacktracker();
  }
}

function stepBacktracker() {
  const { stack } = generationState;

  if (!generationState.current) {
    generationState.current = getCell(1, 0);
    generationState.current.visited = true;
    stack.push(generationState.current);
  }

  if (stack.length === 0) {
    finishGeneration();
    return;
  }

  const current = stack[stack.length - 1];
  const neighbors = findUnvisitedNeighbors(current);

  if (neighbors.length) {
    const next = random(neighbors);
    removeWallBetween(current, next);
    next.visited = true;
    next.parent = current;
    stack.push(next);
  } else {
    stack.pop();
  }
}

function stepHuntAndKill() {
  const { stack } = generationState;

  if (!generationState.current) {
    generationState.current = getCell(1, 0);
    generationState.current.visited = true;
    generationState.huntPhase = false;
  }

  if (!generationState.huntPhase) {
    const neighbors = findUnvisitedNeighbors(generationState.current);
    if (neighbors.length) {
      const next = random(neighbors);
      removeWallBetween(generationState.current, next);
      next.visited = true;
      next.parent = generationState.current;
      generationState.current = next;
    } else {
      generationState.huntPhase = true;
      generationState.huntIndex = 0;
    }
  } else {
    let found = false;
    for (let i = generationState.huntIndex; i < cells.length; i++) {
      const cell = cells[i];
      if (cell.ring === 0 || cell.visited) continue;
      const visitedNeighbors = getNeighbors(cell).filter((n) => n.visited);
      if (visitedNeighbors.length) {
        const huntNeighbor = random(visitedNeighbors);
        removeWallBetween(cell, huntNeighbor);
        cell.visited = true;
        cell.parent = huntNeighbor;
        generationState.current = cell;
        generationState.huntPhase = false;
        generationState.huntIndex = 0;
        found = true;
        break;
      }
      generationState.huntIndex = i + 1;
    }
    if (!found) {
      finishGeneration();
    }
  }
}

function stepPrim() {
  const { frontier } = generationState;

  if (!generationState.current) {
    generationState.current = getCell(1, 0);
    generationState.current.visited = true;
    const neighbors = getNeighbors(generationState.current);
    neighbors.forEach((n) => {
      if (!n.visited && frontier.indexOf(n) === -1) {
        frontier.push(n);
      }
    });
  }

  if (frontier.length === 0) {
    finishGeneration();
    return;
  }

  const next = random(frontier);
  const visitedNeighbors = getNeighbors(next).filter((cell) => cell.visited);

  if (visitedNeighbors.length) {
    const connect = random(visitedNeighbors);
    removeWallBetween(next, connect);
    next.visited = true;
    next.parent = connect;
    generationState.frontier = frontier.filter((cell) => cell !== next);
    getNeighbors(next).forEach((neighbor) => {
      if (!neighbor.visited && generationState.frontier.indexOf(neighbor) === -1) {
        generationState.frontier.push(neighbor);
      }
    });
  } else {
    generationState.frontier = frontier.filter((cell) => cell !== next);
  }
}

function finishGeneration() {
  isGenerating = false;
  chooseExit();
  solutionPath = buildSolutionPath();
  loop();
}

function getNeighbors(cell) {
  const neighbors = [];
  const ring = cell.ring;
  const count = ringSectorCounts[ring];

  if (ring > 1) {
    const innerRing = ring - 1;
    const innerCount = ringSectorCounts[innerRing];
    const start = floor(cell.sector * innerCount / count);
    const end = floor((cell.sector + 1) * innerCount / count - 1e-6);
    for (let s = start; s <= end; s++) {
      neighbors.push(getCell(innerRing, s));
    }
  }

  if (ring < params.rings - 1) {
    const outerRing = ring + 1;
    const outerCount = ringSectorCounts[outerRing];
    const start = floor(cell.sector * outerCount / count);
    const end = floor((cell.sector + 1) * outerCount / count - 1e-6);
    for (let s = start; s <= end; s++) {
      neighbors.push(getCell(outerRing, s));
    }
  }

  if (ring > 0) {
    neighbors.push(getCell(ring, cell.sector - 1));
    neighbors.push(getCell(ring, cell.sector + 1));
  }

  return neighbors.filter(Boolean);
}

function buildSectorCounts() {
  ringSectorCounts = [];
  const groups = max(1, params.doublingSteps);
  const groupSize = ceil(params.rings / groups);

  for (let ring = 0; ring < params.rings; ring++) {
    if (ring === 0) {
      ringSectorCounts[ring] = 1;
    } else {
      const groupIndex = min(floor(ring / groupSize), groups - 1);
      ringSectorCounts[ring] = params.sectors * Math.pow(2, groupIndex);
    }
  }
}

function buildPolarGrid() {
  buildSectorCounts();
  cells = [];
  for (let ring = 0; ring < params.rings; ring++) {
    const count = ringSectorCounts[ring];
    for (let sector = 0; sector < count; sector++) {
      cells.push({
        ring,
        sector,
        visited: false,
        parent: null,
        walls: {
          inner: ring === 0 ? false : true,
          outer: true,
          left: ring === 0 ? false : true,
          right: ring === 0 ? false : true,
        }
      });
    }
  }
}

function chooseExit() {
  const outerRing = params.rings - 1;
  const count = ringSectorCounts[outerRing];
  const start = getCell(1, 0);
  let bestDist = -1;
  let bestCandidates = [];

  for (let sector = 0; sector < count; sector++) {
    const cell = getCell(outerRing, sector);
    cell.walls.outer = true;

    let distance = 0;
    let current = cell;
    while (current && current !== start) {
      current = current.parent;
      distance += 1;
    }

    if (current === start) {
      if (distance > bestDist) {
        bestDist = distance;
        bestCandidates = [cell];
      } else if (distance === bestDist) {
        bestCandidates.push(cell);
      }
    }
  }

  const chosen = bestCandidates.length ? random(bestCandidates) : getCell(outerRing, floor(random(count)));
  exitCell = chosen;
  exitCell.walls.outer = false;
}

function buildSolutionPath() {
  const path = [];
  let current = exitCell;
  while (current) {
    path.unshift(current);
    current = current.parent;
  }

  const firstRing1 = path.find((cell) => cell.ring === 1);
  if (firstRing1) {
    centerEntrySector = firstRing1.sector;
    firstRing1.walls.inner = false;
  }

  return path;
}

function getCell(ring, sector) {
  const count = ringSectorCounts[ring];
  const normalized = ((sector % count) + count) % count;
  let index = 0;
  for (let r = 0; r < ring; r++) {
    index += ringSectorCounts[r];
  }
  return cells[index + normalized];
}

function findUnvisitedNeighbors(cell) {
  const neighbors = [];
  const ring = cell.ring;
  const count = ringSectorCounts[ring];

  if (ring === 0 && cell.connected) {
    return neighbors;
  }

  if (ring > 1) {
    const innerRing = ring - 1;
    const innerCount = ringSectorCounts[innerRing];
    const start = floor(cell.sector * innerCount / count);
    const end = floor((cell.sector + 1) * innerCount / count - 1e-6);
    for (let s = start; s <= end; s++) {
      const neighbor = getCell(innerRing, s);
      if (!neighbor.visited) neighbors.push(neighbor);
    }
  }

  if (ring < params.rings - 1) {
    const outerRing = ring + 1;
    const outerCount = ringSectorCounts[outerRing];
    const start = floor(cell.sector * outerCount / count);
    const end = floor((cell.sector + 1) * outerCount / count - 1e-6);
    for (let s = start; s <= end; s++) {
      const neighbor = getCell(outerRing, s);
      if (!neighbor.visited) neighbors.push(neighbor);
    }
  }

  if (ring > 0) {
    const left = getCell(ring, cell.sector - 1);
    const right = getCell(ring, cell.sector + 1);
    if (left && !left.visited) neighbors.push(left);
    if (right && !right.visited) neighbors.push(right);
  }

  return neighbors;
}

function removeWallBetween(a, b) {
  if (b.ring === a.ring - 1) {
    a.walls.inner = false;
    b.walls.outer = false;
    if (b.ring === 0) {
      b.connected = true;
    }
  } else if (b.ring === a.ring + 1) {
    a.walls.outer = false;
    b.walls.inner = false;
    if (a.ring === 0) {
      a.connected = true;
    }
  } else if (b.ring === a.ring) {
    const count = ringSectorCounts[a.ring];
    if (((b.sector + count) % count) === ((a.sector + count - 1) % count)) {
      a.walls.left = false;
      b.walls.right = false;
    } else if (((b.sector + count) % count) === ((a.sector + 1) % count)) {
      a.walls.right = false;
      b.walls.left = false;
    }
  }
}

function drawMaze(gfx = window, printMode = false) {
  const centerR = params.centerRadius;
  const radiusStep = (min(width, height) / 2 - params.outerPadding - centerR) / (params.rings - 1);

  for (const cell of cells) {
    if (cell.ring === 0) continue;
    if (isGenerating && !cell.visited) continue;

    const count = ringSectorCounts[cell.ring];
    const r0 = centerR + (cell.ring - 1) * radiusStep;
    const r1 = centerR + cell.ring * radiusStep;
    const theta0 = cell.sector * TWO_PI / count;
    const theta1 = (cell.sector + 1) * TWO_PI / count;

    if (cell.walls.inner) {
      if (printMode) gfx.stroke(0);
      else gfx.stroke(255);
      gfx.arc(0, 0, r0 * 2, r0 * 2, theta0, theta1);
    }
    if (cell.walls.outer) {
      if (printMode) gfx.stroke(0);
      else gfx.stroke(255);
      gfx.arc(0, 0, r1 * 2, r1 * 2, theta0, theta1);
    }
    if (cell.walls.left) {
      if (printMode) gfx.stroke(0);
      else gfx.stroke(255);
      const x0 = r0 * cos(theta0);
      const y0 = r0 * sin(theta0);
      const x1 = r1 * cos(theta0);
      const y1 = r1 * sin(theta0);
      gfx.line(x0, y0, x1, y1);
    }
    if (cell.walls.right) {
      if (printMode) gfx.stroke(0);
      else gfx.stroke(255);
      const x0 = r0 * cos(theta1);
      const y0 = r0 * sin(theta1);
      const x1 = r1 * cos(theta1);
      const y1 = r1 * sin(theta1);
      gfx.line(x0, y0, x1, y1);
    }
  }

  gfx.noFill();
  if (printMode) gfx.stroke(0);
  else gfx.stroke(255);
  gfx.strokeWeight(params.thickness);
  const count = ringSectorCounts[1];
  const theta0 = centerEntrySector * TWO_PI / count;
  const theta1 = (centerEntrySector + 1) * TWO_PI / count;
  gfx.arc(0, 0, centerR * 2, centerR * 2, theta1, theta0 + TWO_PI);
}

function drawSolution(gfx = window, printMode = false) {
  if (!solutionPath.length) return;
  const centerR = params.centerRadius;
  const radiusStep = (min(width, height) / 2 - params.outerPadding - centerR) / (params.rings - 1);

  if (printMode) gfx.stroke(0);
  else gfx.stroke(40, 100, 80);
  gfx.strokeWeight(4);
  gfx.noFill();
  gfx.beginShape();
  for (const cell of solutionPath) {
    const point = getCellMidpoint(cell, centerR, radiusStep);
    gfx.vertex(point.x, point.y);
  }
  gfx.endShape();
}

function getCellMidpoint(cell, centerR, radiusStep) {
  if (cell.ring === 0) {
    return { x: 0, y: 0 };
  }
  const count = ringSectorCounts[cell.ring];
  const r0 = centerR + (cell.ring - 1) * radiusStep;
  const r1 = centerR + cell.ring * radiusStep;
  const rm = (r0 + r1) / 2;
  const theta = (cell.sector + 0.5) * TWO_PI / count;
  return { x: rm * cos(theta), y: rm * sin(theta) };
}
