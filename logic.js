// © 2025 Yazan Obeidat
// This code is licensed under CC BY-NC-SA 4.0.
// Commercial use is strictly prohibited without a separate license.
/******************************************************
 * GLOBALS & CANVAS
 ******************************************************/
const canvas = document.getElementById("fieldCanvas");
const ctx = canvas.getContext("2d");

// Phase 3: Zoom & Pan globals
let viewScale = 1;
let viewOffset = { x: 0, y: 0 };
let isPanning = false;
let panStart = { x: 0, y: 0 };

// Phase 4: Heatmap performance
const offscreen = document.createElement('canvas');
const offCtx = offscreen.getContext('2d');
// ratio of offscreen→main resolution; 0.5 = half-res (4× fewer pixels)
let heatmapScale = 0.5;

// Phase 5: Magnetic field
let isMagField = false;
let fieldB     = 0;      // in tesla

// Phase 6: Graphing & Export
let simData = [];   // will hold { t, flux, energy }
let fluxChart, energyChart;

let chargeUnit = 'uC';   // 'uC' or 'nC'

// Phase 9: GIF Recording
let capturer;

let isRecording = false;

// 1. Define every step of the tutorial:
const tutorialSteps = [
  { element: '#btnClear',        intro: 'Remove all charges from the canvas.' },
  { element: '#btnSave',         intro: 'Save your current charges as JSON text.' },
  { element: '#btnLoad',         intro: 'Load charges by pasting JSON here.' },
  { element: '#saveData',        intro: 'This textarea shows/supplies the JSON.' },
  { element: '#btnDarkMode',     intro: 'Toggle between light and dark themes.' },
  { element: '#btnUndo',         intro: 'Undo the last add/remove action.' },
  { element: '#btnRedo',         intro: 'Redo the last undone action.' },
  { element: '#chkStreamlines',  intro: 'Show or hide field streamlines.' },
  { element: '#chkArrows',       intro: 'Show or hide vector arrows.' },
  { element: '#chkPotential',    intro: 'Toggle the background potential heatmap.' },
  { element: '#chkColorArrows',  intro: 'Color-code arrows by field strength.' },
  { element: '#chkMouseProbe',   intro: 'Hover to probe E, V, and F at your cursor.' },
  { element: '#chkSystemEnergy', intro: 'Display the system’s total potential energy.' },
  { element: '#rngLines',        intro: 'Adjust the number of lines per µC.' },
  { element: '#rngArrowSpace',   intro: 'Adjust arrow spacing on the grid.' },
  { element: '#rngArrowScale',   intro: 'Scale the arrow lengths.' },
  { element: '#rngHeatRes',      intro: 'Control heatmap resolution/performance.' },
  { element: '#inpChargeMag',    intro: 'Set magnitude for new charges (µC).' },
  { element: '#btnPlaceDipole',  intro: 'Place a +q/–q dipole in the center.' },
  { element: '#chkFluxMode',     intro: 'Draw a polygon to compute electric flux.' },
  { element: '#chkMoving',       intro: 'Run/pause the RK4 moving-charges sim.' },
  { element: '#inpFieldAmp',     intro: 'Set amplitude of the time-varying E-field.' },
  { element: '#inpFieldFreq',    intro: 'Set frequency of the time-varying E-field.' },
  { element: '#chkTimeField',    intro: 'Enable/disable the sinusoidal E-field.' },
  { element: '#inpFieldB',       intro: 'Set the uniform B-field strength (µT).' },
  { element: '#chkMagField',     intro: 'Enable/disable the magnetic Lorentz force.' },
  { element: '#btnShowGraphs',   intro: 'View graphs of flux and energy over time.' },
  { element: '#btnExportCSV',    intro: 'Download the recorded data as a CSV file.' },
  { element: '#btnTutorial',     intro: 'Restart this guided walkthrough at any time.' }
];
// Modal and Tip
const fluxTip = document.getElementById("fluxTip");
const congratsModal = document.getElementById("congratsModal");
const closeCongratsBtn = document.getElementById("closeCongratsBtn");

// Dynamic resizing
function resizeCanvas() {
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  draw();
}
window.addEventListener('resize', resizeCanvas);

/******************************************************
 * BASIC SIM/PHYSICS SETTINGS
 ******************************************************/
const k = 8.99e9; // Coulomb constant
let charges = []; 
let undoStack = [];
let redoStack = [];
let draggingCharge = null;
let offsetX = 0, offsetY = 0;

// Toggles
let isShowStreamlines = true;
let isShowArrows = true;
let isShowPotential = false;
let isColorArrows = false;
let isMouseProbe = false;
let isSystemEnergy = false;
let isFluxMode = false;
let polygonPoints = [];
let polygonClosed = false;
let isMoving = false;
let simRequest = null;

// Time-varying field
let isTimeField = false;
let fieldAmp = 500;
let fieldFreq = 1;
let simTime = 0;

// Sliders
let linesPerCharge = 12;
let arrowGridSpacing = 50;
let arrowScale = 3e-5;

// Time step
const dt = 0.03;

// Streamlines
const startRadius = 14;
const stepSize = 2;
const maxSteps = 600;

/******************************************************
 * HTML Refs
 ******************************************************/
const saveDataArea = document.getElementById("saveData");
const magInput = document.getElementById("inpChargeMag");
const fieldAmpInput = document.getElementById("inpFieldAmp");
const fieldFreqInput = document.getElementById("inpFieldFreq");
const timeFieldCheck = document.getElementById("chkTimeField");

/******************************************************
 * ON LOAD
 ******************************************************/
window.onload = () => {
  initUI();
  resizeCanvas();  // ✅ canvas.width/height set here

  // Now you can safely create capturer
  capturer = new CCapture({
    format:      'gif',
    workersPath: 'https://cdn.jsdelivr.net/npm/ccapture.js@1.1.0/build/',
    framerate:   30,
    verbose:     true,
    width:       canvas.width,
    height:      canvas.height
  });
};

// GLOBAL SCOPE, before initUI() runs
function stopSimulation() {
  if (simRequest) {
    cancelAnimationFrame(simRequest);
    simRequest = null;
  }
}


/******************************************************
 * INIT UI
 ******************************************************/
function initUI() {
  // --- existing bindings ---
  document.getElementById("btnClear").addEventListener("click", clearCharges);
  document.getElementById("btnSave").addEventListener("click", saveCharges);
  document.getElementById("btnLoad").addEventListener("click", loadCharges);

  document.getElementById("chkStreamlines").addEventListener("change", e => { isShowStreamlines = e.target.checked; draw(); });
  document.getElementById("chkArrows").addEventListener("change", e => { isShowArrows = e.target.checked; draw(); });
  document.getElementById("chkPotential").addEventListener("change", e => { isShowPotential = e.target.checked; draw(); });
  document.getElementById("chkColorArrows").addEventListener("change", e => { isColorArrows = e.target.checked; draw(); });
  document.getElementById("chkMouseProbe").addEventListener("change", e => { isMouseProbe = e.target.checked; if (!isMouseProbe) clearProbeLines(); draw(); });
  document.getElementById("chkSystemEnergy").addEventListener("change", e => { isSystemEnergy = e.target.checked; draw(); });

  document.getElementById("rngLines").addEventListener("input", () => {
    linesPerCharge = parseInt(document.getElementById("rngLines").value);
    document.getElementById("lblLines").textContent = linesPerCharge;
    draw();
  });
  document.getElementById("rngArrowSpace").addEventListener("input", () => {
    arrowGridSpacing = parseInt(document.getElementById("rngArrowSpace").value);
    document.getElementById("lblArrowSpace").textContent = arrowGridSpacing;
    draw();
  });
  document.getElementById("rngArrowScale").addEventListener("input", () => {
    const val = parseInt(document.getElementById("rngArrowScale").value);
    arrowScale = val * 1e-6;
    document.getElementById("lblArrowScale").textContent = `${arrowScale}`;
    draw();
  });

  document.getElementById("btnPlaceDipole").addEventListener("click", placeDipole);

  document.getElementById("chkFluxMode").addEventListener("change", e => {
    isFluxMode = e.target.checked;
    polygonPoints = [];
    polygonClosed = false;
    document.getElementById("fluxInfo").textContent = "";
    updateFluxTip();
    draw();
  });

  document.getElementById("chkMoving").addEventListener("change", e => {
    isMoving = e.target.checked;
    if (isMoving) startSimulation();
    else stopSimulation();
  });

  // Time‐varying E-field inputs
  fieldAmpInput.addEventListener("input", () => { fieldAmp = parseFloat(fieldAmpInput.value); });
  fieldFreqInput.addEventListener("input", () => { fieldFreq = parseFloat(fieldFreqInput.value); });
  timeFieldCheck.addEventListener("change", e => { isTimeField = e.target.checked; });

  // MAG FIELD: wire up B‐field UI
  const bInput = document.getElementById('inpFieldB');
  document.getElementById('chkMagField').addEventListener('change', e => {
    isMagField = e.target.checked;
    draw();
  });
  bInput.addEventListener('input', () => {
    // convert µT → T
    fieldB = parseFloat(bInput.value) * 1e-6;
  });

  if (closeCongratsBtn) {
    closeCongratsBtn.addEventListener("click", () => { congratsModal.style.display = "none"; });
  }

  // --- Dark Mode ---
  const btnDark = document.getElementById('btnDarkMode');
  if (localStorage.dark === 'true') document.body.classList.add('dark-mode');
  btnDark.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.dark = isDark;
  });

  // --- Undo / Redo ---
  document.getElementById('btnUndo').addEventListener('click', undo);
  document.getElementById('btnRedo').addEventListener('click', redo);
  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault(); undo();
    }
    if ((e.ctrlKey || e.metaKey) && (
         e.key.toLowerCase() === 'y' ||
         (e.shiftKey && e.key.toLowerCase() === 'z')
       )) {
      e.preventDefault(); redo();
    }
  });

  // --- ZOOM with wheel ---
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const { x: wx, y: wy } = getMousePos(e);
    const prevScale = viewScale;
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    viewScale *= zoomFactor;
    viewOffset.x -= (wx * (viewScale - prevScale));
    viewOffset.y -= (wy * (viewScale - prevScale));
    draw();
  });

  // --- PAN with middle-button drag ---
  canvas.addEventListener('mousedown', e => {
    if (e.button === 1) {
      isPanning = true;
      panStart.x = e.clientX - viewOffset.x;
      panStart.y = e.clientY - viewOffset.y;
      canvas.style.cursor = 'move';
    }
  });
  window.addEventListener('mousemove', e => {
    if (isPanning) {
      viewOffset.x = e.clientX - panStart.x;
      viewOffset.y = e.clientY - panStart.y;
      draw();
    }
  });
  window.addEventListener('mouseup', e => {
    if (isPanning && e.button === 1) {
      isPanning = false;
      canvas.style.cursor = 'crosshair';
    }
  });

  // --- Heatmap resolution slider ---
  document.getElementById('rngHeatRes').addEventListener('input', e => {
    heatmapScale = parseFloat(e.target.value);
    document.getElementById('lblHeatRes').textContent = heatmapScale + '×';
    draw();
  });
    
  // Show Graphs & Export CSV
    document.getElementById('btnShowGraphs').addEventListener('click', showGraphs);
    document.getElementById('btnCloseGraphs').addEventListener('click', () => {
      document.getElementById('graphModal').style.display = 'none';
    });
    document.getElementById('btnExportCSV').addEventListener('click', exportCSV);  
      // TUTORIAL MODE
  document.getElementById('btnTutorial').addEventListener('click', startTutorial);
  // Unit toggle
const unitRadios = document.getElementsByName('unitCharge');
unitRadios.forEach(r => {
  r.addEventListener('change', () => {
    chargeUnit = r.value;
    document.getElementById('currentUnit').textContent =
      (chargeUnit === 'uC' ? 'µC' : 'nC');
    draw();
  });
});
// RECORDING CONTROLS
document.getElementById('btnStartRec').addEventListener('click', () => {
  if (!isRecording) {
    capturer.start();
    isRecording = true;
    // Immediately capture one frame so width/height get recorded
    capturer.capture(canvas);
    console.log('Recording started');
  }
});

document.getElementById('btnStopRec').addEventListener('click', () => {
  if (isRecording) {
    capturer.stop();
    capturer.save();   // triggers download of GIF
    isRecording = false;
    console.log('Recording stopped, downloading GIF');
  }
});

tippy('[data-tippy-content]', {
  delay: [500, 0],
  placement: 'right',
  theme: 'light-border',
});
}

/******************************************************
 * NEW: Flux Tip and Congrats Modal
 ******************************************************/
function updateFluxTip() {
  if (fluxTip) {
    fluxTip.style.display = isFluxMode ? "block" : "none";
  }
}
function showCongratsModal() {
  if (congratsModal) {
    congratsModal.style.display = "block";
  }
}

/******************************************************
 * MOUSE EVENTS
 ******************************************************/
// MOUSE EVENTS (updated for unit‐aware addCharge)
canvas.addEventListener("mousedown", e => {
  const { x, y } = getMousePos(e);

  if (isFluxMode) {
    if (e.shiftKey) {
      if (polygonPoints.length > 2) {
        polygonClosed = true;
        draw();
        showCongratsModal();
      }
    } else {
      polygonPoints.push({ x, y });
      polygonClosed = false;
      draw();
    }
    return;
  }

  for (let i = charges.length - 1; i >= 0; i--) {
    const c = charges[i];
    if (distance(x, y, c.x, c.y) < 15) {
      draggingCharge = c;
      offsetX = x - c.x;
      offsetY = y - c.y;
      return;
    }
  }
});

canvas.addEventListener("mousemove", e => {
  if (draggingCharge) {
    const { x, y } = getMousePos(e);
    draggingCharge.x = x - offsetX;
    draggingCharge.y = y - offsetY;
    draggingCharge.vx = 0;
    draggingCharge.vy = 0;
    draw();
  } else if (isMouseProbe) {
    updateMouseProbe(e);
  }
});

canvas.addEventListener("mouseup", () => {
  draggingCharge = null;
});

// Left‐click to add charge (unit & sign handled inside addCharge)
canvas.addEventListener("click", e => {
  if (!draggingCharge && !isFluxMode) {
    addCharge(e);
  }
});

// Right‐click to add negative charge
canvas.addEventListener("contextmenu", e => {
  e.preventDefault();
  if (!isFluxMode) {
    addCharge(e);
  }
});

// Double‐click to delete charge
canvas.addEventListener('dblclick', e => {
  const { x, y } = getMousePos(e);
  for (let i = 0; i < charges.length; i++) {
    if (distance(x, y, charges[i].x, charges[i].y) < 10) {
      removeChargeAt(i);
      return;
    }
  }
});

/******************************************************
 * ADD / CLEAR CHARGES
 ******************************************************/
function addCharge(e) {
  const { x, y } = getMousePos(e);

  // 1. Read the raw magnitude from the input
  const raw = parseFloat(document.getElementById('inpChargeMag').value);

  // 2. Convert to coulombs based on unit
  const baseQ = (chargeUnit === 'uC' ? raw * 1e-6 : raw * 1e-9);

  // 3. Determine sign: right-click → negative
  const sign = (e.type === 'contextmenu') ? -1 : 1;
  const q = baseQ * sign;

  // 4. Create the charge with much smaller mass for higher acceleration
  const charge = {
    x,
    y,
    q,
    vx: 0,
    vy: 0,
    m: 1e-6,      // ← lighter mass so F = ma yields large a
    netFx: 0,
    netFy: 0
  };

  // 5. Add to arrays and record for undo
  charges.push(charge);
  undoStack.push({ type: 'add', charge });
  redoStack = [];

  draw();
}

function removeChargeAt(index) {
  const [removed] = charges.splice(index, 1);
  undoStack.push({ type: 'remove', charge: removed, index });
  redoStack = [];
  draw();
}

function clearCharges() {
  charges = [];
  polygonPoints = [];
  polygonClosed = false;
  document.getElementById("fluxInfo").textContent = "";
  draw();
}

/******************************************************
 * SAVE / LOAD
 ******************************************************/
function saveCharges() {
  const dataStr = JSON.stringify(charges);
  saveDataArea.value = dataStr;
}
function loadCharges() {
  try {
    const arr = JSON.parse(saveDataArea.value);
    if (Array.isArray(arr)) {
      charges = arr;
      draw();
    }
  } catch (err) {
    alert("Invalid JSON data!");
  }
}

function undo() {
  if (!undoStack.length) return;
  const action = undoStack.pop();
  if (action.type === 'add') {
    // remove the added charge
    const idx = charges.indexOf(action.charge);
    if (idx !== -1) charges.splice(idx, 1);
  } else if (action.type === 'remove') {
    // re-insert the removed charge
    charges.splice(action.index, 0, action.charge);
  }
  redoStack.push(action);
  draw();
}

function redo() {
  if (!redoStack.length) return;
  const action = redoStack.pop();
  if (action.type === 'add') {
    // re-add the charge
    charges.push(action.charge);
  } else if (action.type === 'remove') {
    // remove it again
    const idx = charges.indexOf(action.charge);
    if (idx !== -1) charges.splice(idx, 1);
  }
  undoStack.push(action);
  draw();
}

/******************************************************
 * DIPLOLE
 ******************************************************/
function placeDipole() {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const d = 30;
  const qVal = 1e-6;

  charges.push({ x: cx + d, y: cy, q: qVal, vx: 0, vy: 0, m: 1, netFx: 0, netFy: 0 });
  charges.push({ x: cx - d, y: cy, q: -qVal, vx: 0, vy: 0, m: 1, netFx: 0, netFy: 0 });
  draw();
  updateDipoleInfo();
  charges.push({ x: cx + d, y: cy, q: qVal, vx: -10, vy: 0, m: 1, netFx: 0, netFy: 0 });
charges.push({ x: cx - d, y: cy, q: -qVal, vx: 10, vy: 0, m: 1, netFx: 0, netFy: 0 });

}

function updateDipoleInfo() {
  let px = 0, py = 0;
  charges.forEach(c => {
    px += c.q * c.x;
    py += c.q * c.y;
  });
  document.getElementById("dipoleInfo").textContent =
    `Dipole p ~ ( ${formatNumber(px)}, ${formatNumber(py)} ) C·px`;
}

/******************************************************
 * FLUX
 ******************************************************/
function computeFlux() {
  if (!polygonClosed || polygonPoints.length < 3) {
    return 0;
  }
  const eps0 = 8.854e-12;
  let qEnc = 0;
  charges.forEach(c => {
    if (isPointInPolygon(c.x, c.y, polygonPoints)) {
      qEnc += c.q;
    }
  });
  return qEnc / eps0; // 2D approx
}

function isPointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > py) !== (yj > py)) &&
      (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/******************************************************
 * MOVING CHARGES - RK4
 ******************************************************/
function startSimulation() {
  // Give every existing, still charge a small random velocity
  charges.forEach(c => {
    if (c.vx === 0 && c.vy === 0) {
      c.vx = (Math.random() - 0.5) * 5;
      c.vy = (Math.random() - 0.5) * 5;
    }
  });

  // Then launch the RK4 loop
  if (!simRequest) simStep();
}


function simStep() {
  simTime += dt;
  runRK4(dt);

  // Record flux & energy
  const fluxVal   = computeFlux();
  const energyVal = computeSystemEnergy();
  simData.push({ t: simTime, flux: fluxVal, energy: energyVal });

  draw();
  if (isRecording) {
    capturer.capture(canvas);
  }
  if (isMoving) {
    simRequest = requestAnimationFrame(simStep);
  } else simRequest = null;
}

function exportCSV() {
  if (!simData.length) return alert('No data to export!');
  const rows = [
    ['time', 'flux', 'energy'],
    ...simData.map(d => [d.t.toFixed(3), d.flux.toExponential(3), d.energy.toExponential(3)])
  ];
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'sim_data.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function showGraphs() {
  if (!simData.length) return alert('No data to graph! Run simulation first.');
  // Prepare labels & datasets
  const labels = simData.map(d => d.t.toFixed(2));
  const fluxDs = simData.map(d => d.flux);
  const enDs   = simData.map(d => d.energy);

  // Destroy existing if any
  if (fluxChart)  fluxChart.destroy();
  if (energyChart) energyChart.destroy();

  // Flux chart
  fluxChart = new Chart(document.getElementById('chartFlux').getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{ label: 'Flux', data: fluxDs, fill: false }]
    },
    options: { scales: { x: { title: { display: true, text: 'Time (s)' } } } }
  });

  // Energy chart
  energyChart = new Chart(document.getElementById('chartEnergy').getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{ label: 'System Energy', data: enDs, fill: false }]
    },
    options: { scales: { x: { title: { display: true, text: 'Time (s)' } } } }
  });

  document.getElementById('graphModal').style.display = 'block';
}

/******************************************************
 * EXTERNAL TIME-VARYING FIELD
 ******************************************************/
function externalE(t) {
  if (!isTimeField) return { x: 0, y: 0 };
  const omega = 2 * Math.PI * fieldFreq;
  const val = fieldAmp * Math.sin(omega * t);
  return { x: val, y: 0 };
}

/******************************************************
 * RUNGE-KUTTA 4
 ******************************************************/
function runRK4(h) {
  // 1) Save initial states
  let initialStates = charges.map(c => ({
    x:  c.x, 
    y:  c.y, 
    vx: c.vx || 0, 
    vy: c.vy || 0
  }));

  // 2) Compute RK4 k1→k4
  computeForcesGlobal(simTime);
  let k1 = charges.map((c,i) => computeDeriv(c, i, simTime));

  charges.forEach((c,i) => applyDelta(c, initialStates[i], k1[i], h/2));
  computeForcesGlobal(simTime + h/2);
  let k2 = charges.map((c,i) => computeDeriv(c, i, simTime + h/2));

  charges.forEach((c,i) => revertToInitialAndApplyDelta(c, initialStates[i], k2[i], h/2));
  computeForcesGlobal(simTime + h/2);
  let k3 = charges.map((c,i) => computeDeriv(c, i, simTime + h/2));

  charges.forEach((c,i) => revertToInitialAndApplyDelta(c, initialStates[i], k3[i], h));
  computeForcesGlobal(simTime + h);
  let k4 = charges.map((c,i) => computeDeriv(c, i, simTime + h));

  // 3) Apply final RK4 sums to x, y, vx, vy
  charges.forEach((c,i) => {
    let init = initialStates[i];
    c.x  = init.x  + (h/6)*(k1[i].dx  + 2*k2[i].dx  + 2*k3[i].dx  + k4[i].dx);
    c.y  = init.y  + (h/6)*(k1[i].dy  + 2*k2[i].dy  + 2*k3[i].dy  + k4[i].dy);
    c.vx = init.vx + (h/6)*(k1[i].dvx + 2*k2[i].dvx + 2*k3[i].dvx + k4[i].dvx);
    c.vy = init.vy + (h/6)*(k1[i].dvy + 2*k2[i].dvy + 2*k3[i].dvy + k4[i].dvy);
  });

  // 4) Elastic collisions between charged “spheres”
  const R = 10;    // radius in px
  const e = 1.0;   // restitution coefficient
  for (let i = 0; i < charges.length; i++) {
    for (let j = i + 1; j < charges.length; j++) {
      const c1 = charges[i], c2 = charges[j];
      const dx = c2.x - c1.x, dy = c2.y - c1.y;
      const dist = Math.hypot(dx, dy);
      const minD = 2 * R;
      if (dist < minD && dist > 0) {
        // 4a) Separate them to just-touch
        const overlap = (minD - dist) / 2;
        const nx = dx / dist, ny = dy / dist;
        c1.x -= nx * overlap;  c1.y -= ny * overlap;
        c2.x += nx * overlap;  c2.y += ny * overlap;

        // 4b) Compute normal relative velocity
        const dvx = c2.vx - c1.vx, dvy = c2.vy - c1.vy;
        const vrel = dvx * nx + dvy * ny;
        if (vrel < 0) {
          // 4c) Impulse magnitude
          const j = -(1 + e) * vrel / (1/c1.m + 1/c2.m);
          // 4d) Apply impulse
          c1.vx -= (j * nx) / c1.m;
          c1.vy -= (j * ny) / c1.m;
          c2.vx += (j * nx) / c2.m;
          c2.vy += (j * ny) / c2.m;
        }
      }
    }
  }

  // 5) Dynamic edge‐bounce using world‐coords
  const minXb = -viewOffset.x / viewScale + R;
  const maxXb = (canvas.width  - viewOffset.x) / viewScale - R;
  const minYb = -viewOffset.y / viewScale + R;
  const maxYb = (canvas.height - viewOffset.y) / viewScale - R;

  charges.forEach(c => {
    if (c.x < minXb) { c.x = minXb; c.vx *= -0.7; }
    if (c.x > maxXb) { c.x = maxXb; c.vx *= -0.7; }
    if (c.y < minYb) { c.y = minYb; c.vy *= -0.7; }
    if (c.y > maxYb) { c.y = maxYb; c.vy *= -0.7; }
  });
}

/******************************************************
 * UTILS FOR RK4
 ******************************************************/
function computeForcesGlobal(t) {
  // reset forces
  charges.forEach(c => { c.netFx = 0; c.netFy = 0; });

  // Coulomb pairwise
  for (let i = 0; i < charges.length; i++) {
  for (let j = i + 1; j < charges.length; j++) {
    const ci = charges[i], cj = charges[j];
    const dx = cj.x - ci.x, dy = cj.y - ci.y;
    const r2 = dx*dx + dy*dy;
    if (r2 < 1) continue;
    const r    = Math.sqrt(r2);
    // ← note the minus here
    const Fmag = (k * ci.q * cj.q) / r2;
    const Fx   = -Fmag * (dx / r);
    const Fy   = -Fmag * (dy / r);

    ci.netFx += Fx;
    ci.netFy += Fy;
    cj.netFx -= Fx;
    cj.netFy -= Fy;
  }
}

  // External electric field
  let Eext = externalE(t);
  charges.forEach(c => {
    c.netFx += c.q * Eext.x;
    c.netFy += c.q * Eext.y;
  });

  // **Magnetic (Lorentz) force: F = q·(v × B), with B = (0,0,fieldB)**
  if (isMagField) {
    charges.forEach(c => {
      // v = (vx, vy), so v×B = ( vy·B, -vx·B, 0 )
      const Fx_m = c.q * (c.vy * fieldB);
      const Fy_m = c.q * (-c.vx * fieldB);
      c.netFx += Fx_m;
      c.netFy += Fy_m;
    });
  }
}

function computeDeriv(c, i, t) {
  let ax = c.netFx / (c.m || 1);
  let ay = c.netFy / (c.m || 1);
  return { dx: c.vx, dy: c.vy, dvx: ax, dvy: ay };
}
function applyDelta(c, init, k, fraction) {
  c.x = init.x + k.dx * fraction;
  c.y = init.y + k.dy * fraction;
  c.vx = init.vx + k.dvx * fraction;
  c.vy = init.vy + k.dvy * fraction;
}
function revertToInitialAndApplyDelta(c, init, k, fraction) {
  c.x = init.x + k.dx * fraction;
  c.y = init.y + k.dy * fraction;
  c.vx = init.vx + k.dvx * fraction;
  c.vy = init.vy + k.dvy * fraction;
}

/******************************************************
 * DRAW EVERYTHING
 ******************************************************/
function draw() {
  // 1) Reset any existing transform & clear the full canvas
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 2) Apply our view transform (scale & translate)
  ctx.setTransform(viewScale, 0, 0, viewScale, viewOffset.x, viewOffset.y);

  // 3) All your original draw calls, unchanged
  if (isShowPotential) {
    drawPotentialMap();
  }
  if (isShowArrows) {
    drawFieldArrows();
  }
  if (isShowStreamlines) {
    drawStreamlines();
  }
  drawChargesWithVelocity();
  updateDipoleInfo();

  if (polygonPoints.length > 0) {
    drawPolygon();
    if (polygonClosed) {
      const fluxVal = computeFlux();
      document.getElementById("fluxInfo").textContent = 
        `Flux = ${formatNumber(fluxVal)}`;
    } else {
      document.getElementById("fluxInfo").textContent = "";
    }
  } else {
    document.getElementById("fluxInfo").textContent = "";
  }

  if (isSystemEnergy) {
    const U = computeSystemEnergy();
    document.getElementById("calcEnergy").textContent = 
      `System Potential Energy: ${formatNumber(U)} J`;
  } else {
    document.getElementById("calcEnergy").textContent = "";
  }
}

/******************************************************
 * DRAW INDIVIDUAL THINGS
 ******************************************************/
function drawPolygon() {
  if (polygonPoints.length < 1) return;
  ctx.beginPath();
  ctx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
  for (let i = 1; i < polygonPoints.length; i++) {
    ctx.lineTo(polygonPoints[i].x, polygonPoints[i].y);
  }
  if (polygonClosed) ctx.closePath();
  ctx.strokeStyle = "magenta";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawChargesWithVelocity() {
  charges.forEach(c => {
    // Draw the charge circle
    ctx.beginPath();
    ctx.arc(c.x, c.y, 10, 0, 2 * Math.PI);
    ctx.fillStyle = (c.q > 0) ? "red" : "blue";
    ctx.fill();
    ctx.stroke();

    // Draw the +/– symbol
    ctx.fillStyle = "white";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(c.q > 0 ? "+" : "–", c.x, c.y);

    // --- New: Draw the numeric charge label above ---
    // Choose multiplier & unit string
    const mult    = (chargeUnit === 'uC' ? 1e6 : 1e9);
    const unitStr = (chargeUnit === 'uC' ? 'µC' : 'nC');
    const val     = Math.abs(c.q) * mult;
    const label   = `${formatNumber(val)}${unitStr}`;

    ctx.fillStyle   = "black";
    ctx.font        = "12px Arial";
    ctx.textAlign   = "center";
    ctx.textBaseline= "bottom";
    ctx.fillText(label, c.x, c.y - 12);

    // Draw velocity arrow if moving
    if (isMoving) {
      const vx    = c.vx || 0;
      const vy    = c.vy || 0;
      const speed = Math.sqrt(vx*vx + vy*vy);
      if (speed > 1e-3) {
        const scale = 2;
        const x2    = c.x + vx * scale;
        const y2    = c.y + vy * scale;
        drawVelArrow(c.x, c.y, x2, y2, "green");
      }
    }
  });
}

function drawVelArrow(x1, y1, x2, y2, color) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - 8 * Math.cos(angle - Math.PI / 6), y2 - 8 * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - 8 * Math.cos(angle + Math.PI / 6), y2 - 8 * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}
/******************************************************
 * FIELD & POTENTIAL
 ******************************************************/
function getFieldAt(x, y) {
  let Ex = 0, Ey = 0;
  charges.forEach(ch => {
    const dx = x - ch.x, dy = y - ch.y;
    const r2 = dx * dx + dy * dy;
    if (r2 < 1) return;
    const r = Math.sqrt(r2);
    const E_mag = (k * ch.q) / r2;
    Ex += E_mag * (dx / r);
    Ey += E_mag * (dy / r);
  });

  if (isTimeField) {
    let Eext = externalE(simTime);
    Ex += Eext.x;
    Ey += Eext.y;
  }
  return { x: Ex, y: Ey };
}

function getPotentialAt(x, y) {
  let V = 0;
  charges.forEach(ch => {
    const dx = x - ch.x, dy = y - ch.y;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r < 1) return;
    V += (k * ch.q) / r;
  });
  return V;
}

/******************************************************
 * EXTERNAL FIELD
 ******************************************************/
function externalE(t) {
  if (!isTimeField) return { x: 0, y: 0 };
  let omega = 2 * Math.PI * fieldFreq;
  let val = fieldAmp * Math.sin(omega * t);
  return { x: val, y: 0 };
}

/******************************************************
 * POTENTIAL HEATMAP
 ******************************************************/
function drawPotentialMap() {
  const W = canvas.width;
  const H = canvas.height;
  const w = Math.round(W * heatmapScale);
  const h = Math.round(H * heatmapScale);

  // 1) Resize offscreen buffer
  offscreen.width  = w;
  offscreen.height = h;

  // 2) Compute the low-res heatmap
  const img = offCtx.createImageData(w, h);
  const data = img.data;
  const maxV = 3000;
  let idx = 0;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      // map offscreen pixel → world coords
      const x = px / heatmapScale;
      const y = py / heatmapScale;
      const V = getPotentialAt(x, y);
      const clamped = Math.max(-maxV, Math.min(maxV, V));
      const ratio = (clamped + maxV) / (2 * maxV);

      let r,g,b;
      if (ratio < 0.5) {
        const sub = ratio / 0.5;
        r = 255 * sub; g = 255 * sub; b = 255;
      } else {
        const sub = (ratio - 0.5) / 0.5;
        r = 255; g = 255 * (1 - sub); b = 255 * (1 - sub);
      }

      data[idx++] = r;
      data[idx++] = g;
      data[idx++] = b;
      data[idx++] = 255;
    }
  }
  offCtx.putImageData(img, 0, 0);

  // 3) Draw the up-scaled buffer onto main canvas
  ctx.save();
  ctx.globalAlpha = 0.6;                // optional transparency
  ctx.imageSmoothingEnabled = true;     // smooth out pixels
  ctx.drawImage(offscreen,
                0, 0, w, h,           // source
                0, 0, W, H);          // destination full size
  ctx.restore();
}

/******************************************************
 * FIELD ARROWS
 ******************************************************/
function drawFieldArrows() {
  // 1) Figure out what world coords you’re seeing
  const W = canvas.width, H = canvas.height;
  const minX = -viewOffset.x / viewScale;
  const minY = -viewOffset.y / viewScale;
  const maxX = (W - viewOffset.x)  / viewScale;
  const maxY = (H - viewOffset.y)  / viewScale;

  // 2) Find the first grid point ≥ minX (aligned to arrowGridSpacing)
  const startX = Math.floor(minX / arrowGridSpacing) * arrowGridSpacing + arrowGridSpacing/2;
  const startY = Math.floor(minY / arrowGridSpacing) * arrowGridSpacing + arrowGridSpacing/2;

  // 3) Scan in steps of arrowGridSpacing across the visible world‐range
  for (let gx = startX; gx <= maxX; gx += arrowGridSpacing) {
    for (let gy = startY; gy <= maxY; gy += arrowGridSpacing) {
      const E = getFieldAt(gx, gy);
      const mag = Math.hypot(E.x, E.y);
      if (mag < 1e-3) continue;

      const x2 = gx + E.x * arrowScale;
      const y2 = gy + E.y * arrowScale;
      const color = isColorArrows
        ? getArrowColor(mag, 0, /* recompute maxField if you want color */)
        : "rgba(0,0,0,0.7)";

      drawArrow(gx, gy, x2, y2, color);
    }
  }
}

function getArrowColor(value, minVal, maxVal) {
  let ratio = (value - minVal) / (maxVal - minVal);
  if (ratio < 0) ratio = 0;
  if (ratio > 1) ratio = 1;
  let r, g, b;
  if (ratio < 0.5) {
    const sub = ratio / 0.5;
    r = 0; g = 255 * sub; b = 255 * (1 - sub);
  } else {
    const sub = (ratio - 0.5) / 0.5;
    r = 255 * sub; g = 255 * (1 - sub); b = 0;
  }
  return `rgb(${r},${g},${b})`;
}

function drawArrow(x1, y1, x2, y2, color) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - 8 * Math.cos(angle - Math.PI / 6), y2 - 8 * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - 8 * Math.cos(angle + Math.PI / 6), y2 - 8 * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/******************************************************
 * STREAMLINES
 ******************************************************/
function drawStreamlines() {
  charges.forEach(c => {
    const baseCharge = 1e-6;
    let nLines = Math.round(linesPerCharge * Math.abs(c.q / baseCharge));
    if (nLines < 1) nLines = 1;
    const sign = (c.q >= 0) ? 1 : -1; // <<<<< detect sign early
    for (let i = 0; i < nLines; i++) {
      let angle = (2 * Math.PI * i) / nLines;
      const startX = c.x + startRadius * Math.cos(angle);
      const startY = c.y + startRadius * Math.sin(angle);
      traceFieldLine(startX, startY, sign); // <<<<< pass sign here
    }
  });
}

function traceFieldLine(x, y, sign = 1) {
  const path = [];
  let curX = x, curY = y;

  for (let i = 0; i < maxSteps; i++) {
    path.push({ x: curX, y: curY });

    const E = getFieldAt(curX, curY);
    const mag = Math.sqrt(E.x * E.x + E.y * E.y);
    if (mag < 1e-4) break;

    const Ex = (sign * E.x) / mag;
    const Ey = (sign * E.y) / mag;

    curX += Ex * stepSize;
    curY += Ey * stepSize;

        // compute world-coordinate bounds of the visible area
    const worldMinX = -viewOffset.x / viewScale;
    const worldMinY = -viewOffset.y / viewScale;
    const worldMaxX = (canvas.width - viewOffset.x)  / viewScale;
    const worldMaxY = (canvas.height - viewOffset.y) / viewScale;

    // terminate line when it leaves the visible area
    if (
      curX < worldMinX || curX > worldMaxX ||
      curY < worldMinY || curY > worldMaxY
    ) break;

    // Stop if approaching a charge
    for (let c of charges) {
      if (distance(curX, curY, c.x, c.y) < 10) {
        break;
      }
    }
  }

  drawPath(path);
}


function drawPath(points) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.strokeStyle = "black";
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

/******************************************************
 * MOUSE PROBE
 ******************************************************/
function updateMouseProbe(e) {
  const { x, y } = getMousePos(e);
  const E = getFieldAt(x, y);
  const Emag = Math.sqrt(E.x * E.x + E.y * E.y);
  const V = getPotentialAt(x, y);
  const qTest = 1e-6;
  const Fmag = Emag * qTest;

  document.getElementById("calcMouse").textContent =
    `Mouse @ (${Math.round(x)}, ${Math.round(y)})`;
  document.getElementById("calcE").textContent =
    `E = ${formatNumber(Emag)} N/C`;
  document.getElementById("calcV").textContent =
    `V = ${formatNumber(V)} V`;
  document.getElementById("calcF").textContent =
    `F_on_1µC = ${formatNumber(Fmag)} N`;
}

function clearProbeLines() {
  document.getElementById("calcMouse").textContent = "";
  document.getElementById("calcE").textContent = "";
  document.getElementById("calcV").textContent = "";
  document.getElementById("calcF").textContent = "";
}

/******************************************************
 * SYSTEM ENERGY
 ******************************************************/
function computeSystemEnergy() {
  let U = 0;
  for (let i = 0; i < charges.length; i++) {
    for (let j = i + 1; j < charges.length; j++) {
      const c1 = charges[i], c2 = charges[j];
      const r = distance(c1.x, c1.y, c2.x, c2.y);
      if (r < 1) continue;
      U += (k * c1.q * c2.q) / r;
    }
  }
  return U;
}

/******************************************************
 * UTILITIES
 ******************************************************/
function distance(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

function getMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  // screen coords
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  // world coords
  return {
    x: (sx - viewOffset.x) / viewScale,
    y: (sy - viewOffset.y) / viewScale
  };
}

function formatNumber(value) {
  if (Math.abs(value) < 0.001 || Math.abs(value) > 1e5) {
    return value.toExponential(2);
  } else {
    return value.toFixed(2);
  }
}
// 2. Define the helper to start Intro.js
function startTutorial() {
  introJs()
    .setOptions({
      steps: tutorialSteps,
      showStepNumbers: true,
      exitOnEsc: true,
      exitOnOverlayClick: false,
      nextLabel: 'Next →',
      prevLabel: '← Back',
      skipLabel: 'Skip',
      doneLabel: 'Done'
    })
    .start();
}
