/* =============================================================
   TikTok-Quantum – Client-side JavaScript
   ============================================================= */

'use strict';

/* ---- Navigation ---- */
document.querySelectorAll('.nav__item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    const viewId = item.dataset.view;
    switchView(viewId);
    document.querySelectorAll('.nav__item').forEach(n => n.classList.remove('nav__item--active'));
    item.classList.add('nav__item--active');
  });
});

function switchView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('view--active'));
  const target = document.getElementById(`view-${viewId}`);
  if (target) target.classList.add('view--active');

  if (viewId === 'glossary') renderGlossary();
}

/* ---- Feed: like + simulate buttons ---- */
document.querySelectorAll('.action-btn[data-action="like"]').forEach(btn => {
  let count = 0;
  btn.addEventListener('click', () => {
    count++;
    btn.classList.add('action-btn--liked');
    btn.querySelector('.action-btn__count').textContent = count;
    sparkle(btn);
  });
});

document.querySelectorAll('.action-btn[data-action="simulate"]').forEach(btn => {
  btn.addEventListener('click', () => {
    const cardId = btn.dataset.card;
    loadPreset(cardId);
    switchView('simulator');
    document.querySelectorAll('.nav__item').forEach(n => n.classList.remove('nav__item--active'));
    document.querySelector('[data-view="simulator"]').classList.add('nav__item--active');
  });
});

document.querySelectorAll('.action-btn[data-action="share"]').forEach(btn => {
  btn.addEventListener('click', () => {
    const cardId = btn.dataset.card;
    const url = `${location.origin}/#${cardId}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => showToast('Link copied!'));
    } else {
      showToast(`Share: ${url}`);
    }
  });
});

function sparkle(el) {
  const span = document.createElement('span');
  span.textContent = '✨';
  span.style.cssText = 'position:absolute;pointer-events:none;font-size:1.4rem;animation:float-up 0.8s ease forwards;';
  el.style.position = 'relative';
  el.appendChild(span);
  span.addEventListener('animationend', () => span.remove());

  if (!document.getElementById('float-kf')) {
    const style = document.createElement('style');
    style.id = 'float-kf';
    style.textContent = '@keyframes float-up{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-40px)}}';
    document.head.appendChild(style);
  }
}

/* ---- Quick state buttons (right sidebar) ---- */
document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const name = btn.dataset.state;
    const res = await fetch(`/api/qubit/state?name=${name}`);
    if (!res.ok) return;
    const data = await res.json();
    renderQuickResult(data);
  });
});

function renderQuickResult(data) {
  const el = document.getElementById('quick-result');
  const stateStr = data.state.map(a => formatComplex(a.re, a.im)).join(', ');
  const probStr = data.probabilities.map((p, i) => `|${i}⟩: ${(p * 100).toFixed(0)}%`).join('  ');
  el.textContent = `[${stateStr}]\n${probStr}`;
  if (data.bloch) {
    el.textContent += `\nθ=${data.bloch.theta.toFixed(2)} φ=${data.bloch.phi.toFixed(2)}`;
  }
}

function formatComplex(re, im) {
  const r = re.toFixed(3);
  const i = im.toFixed(3);
  if (Math.abs(im) < 0.001) return r;
  if (Math.abs(re) < 0.001) return `${i}i`;
  const sign = im >= 0 ? '+' : '-';
  return `${r}${sign}${Math.abs(im).toFixed(3)}i`;
}

/* ================================================================
   SIMULATOR
   ================================================================ */

const circuitSteps = [];   // [{ gate, targets, label }]

// ---- Gate palette click → open modal ----
document.querySelectorAll('.gate-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    pendingGate = btn.dataset.gate;
    openModal();
  });
});

let pendingGate = null;

function openModal() {
  const numQubits = parseInt(document.getElementById('sim-qubits').value, 10);
  const container = document.getElementById('modal-targets');
  container.innerHTML = '';

  for (let q = 0; q < numQubits; q++) {
    const t = document.createElement('button');
    t.className = 'qubit-toggle';
    t.dataset.qubit = q;
    t.textContent = `q${q}`;
    t.addEventListener('click', () => t.classList.toggle('qubit-toggle--selected'));
    container.appendChild(t);
  }

  document.getElementById('gate-modal').removeAttribute('hidden');
}

document.getElementById('modal-confirm').addEventListener('click', () => {
  const selected = [...document.querySelectorAll('.qubit-toggle--selected')].map(
    t => parseInt(t.dataset.qubit, 10)
  );
  if (selected.length === 0) { showToast('Select at least one qubit.'); return; }

  circuitSteps.push({ gate: pendingGate, targets: selected });
  renderCircuit();
  document.getElementById('gate-modal').setAttribute('hidden', '');
});

document.getElementById('modal-cancel').addEventListener('click', () => {
  document.getElementById('gate-modal').setAttribute('hidden', '');
});

function renderCircuit() {
  const el = document.getElementById('circuit-steps');
  if (circuitSteps.length === 0) {
    el.innerHTML = '<p class="circuit-empty">Click gates above to add them, then choose target qubits.</p>';
    return;
  }
  el.innerHTML = circuitSteps.map((s, i) => `
    <div class="circuit-step">
      <span class="circuit-step__gate">${s.gate}</span>
      <span class="circuit-step__targets">[q${s.targets.join(',q')}]</span>
      <button class="circuit-step__remove" data-index="${i}" title="Remove">✕</button>
    </div>
  `).join('');

  el.querySelectorAll('.circuit-step__remove').forEach(btn => {
    btn.addEventListener('click', () => {
      circuitSteps.splice(parseInt(btn.dataset.index, 10), 1);
      renderCircuit();
    });
  });
}

// ---- Run circuit ----
document.getElementById('btn-run').addEventListener('click', async () => {
  const numQubits = parseInt(document.getElementById('sim-qubits').value, 10);
  const body = {
    num_qubits: numQubits,
    gates: circuitSteps.map(s => ({ gate: s.gate, targets: s.targets })),
  };
  const res = await fetch('/api/circuit/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    showToast((data.errors || [data.error]).join('; '));
    return;
  }
  renderResults(data);
});

// ---- Clear circuit ----
document.getElementById('btn-clear').addEventListener('click', () => {
  circuitSteps.length = 0;
  renderCircuit();
  document.getElementById('sim-results').setAttribute('hidden', '');
});

// ---- Bell state preset ----
document.getElementById('btn-bell').addEventListener('click', () => {
  const numQubitsEl = document.getElementById('sim-qubits');
  numQubitsEl.value = '2';
  circuitSteps.length = 0;
  circuitSteps.push({ gate: 'H', targets: [0] });
  circuitSteps.push({ gate: 'CX', targets: [0, 1] });
  renderCircuit();
  document.getElementById('btn-run').click();
});

function renderResults(data) {
  const resultsEl = document.getElementById('sim-results');
  resultsEl.removeAttribute('hidden');

  // State vector
  const svEl = document.getElementById('state-vector');
  const n = data.num_qubits;
  const terms = data.state
    .map((a, i) => {
      const mag = Math.sqrt(a.re * a.re + a.im * a.im);
      if (mag < 0.001) return null;
      return `${formatComplex(a.re, a.im)} |${i.toString(2).padStart(n, '0')}⟩`;
    })
    .filter(Boolean);
  svEl.textContent = '|ψ⟩ = ' + (terms.join(' + ') || '0');

  // Probability bars
  const barsEl = document.getElementById('prob-bars');
  barsEl.innerHTML = data.probabilities.map((p, i) => `
    <div class="prob-row">
      <span class="prob-label">|${i.toString(2).padStart(n, '0')}⟩</span>
      <div class="prob-track">
        <div class="prob-fill" style="width:${(p * 100).toFixed(1)}%"></div>
      </div>
      <span class="prob-pct">${(p * 100).toFixed(1)}%</span>
    </div>
  `).join('');

  // Bloch angles for single qubit
  if (n === 1) {
    fetch('/api/qubit/state?name=zero').then(r => r.json()).then(() => {
      const amp = data.state[0];
      const amp1 = data.state[1];
      const theta = 2 * Math.acos(Math.min(1, Math.sqrt(amp.re ** 2 + amp.im ** 2)));
      const phi = Math.atan2(amp1.im, amp1.re) - Math.atan2(amp.im, amp.re);
      document.getElementById('bloch-info').textContent =
        `Bloch angles: θ = ${theta.toFixed(3)} rad,  φ = ${phi.toFixed(3)} rad`;
    });
  } else {
    document.getElementById('bloch-info').textContent = '';
  }
}

/* ================================================================
   GLOSSARY
   ================================================================ */

const GLOSSARY_TERMS = [
  { term: 'Qubit', math: '|ψ⟩ = α|0⟩ + β|1⟩', def: 'The basic unit of quantum information. Unlike a classical bit, a qubit can exist in a superposition of 0 and 1.' },
  { term: 'Superposition', math: '|+⟩ = (|0⟩+|1⟩)/√2', def: 'A qubit exists simultaneously in multiple states until measured. The Hadamard gate H creates equal superposition from |0⟩.' },
  { term: 'Entanglement', math: '|Φ⁺⟩ = (|00⟩+|11⟩)/√2', def: 'Two or more qubits are entangled when the quantum state cannot be written as a tensor product of individual states.' },
  { term: 'Quantum Gate', math: 'U†U = I', def: 'A unitary linear transformation applied to one or more qubits. All quantum gates are reversible (unitary).' },
  { term: 'Hadamard Gate (H)', math: 'H = (1/√2)[[1,1],[1,-1]]', def: 'Creates equal superposition. H|0⟩ = |+⟩, H|1⟩ = |−⟩. Applying H twice returns the original state.' },
  { term: 'Pauli-X Gate', math: 'X = [[0,1],[1,0]]', def: 'The quantum NOT gate. Flips |0⟩ to |1⟩ and vice versa. Equivalent to a 180° rotation about the X-axis on the Bloch sphere.' },
  { term: 'CNOT Gate', math: '|c,t⟩ → |c, c⊕t⟩', def: 'Controlled-NOT: flips the target qubit when the control qubit is |1⟩. Used to create entanglement.' },
  { term: 'Bloch Sphere', math: '|ψ⟩ = cos(θ/2)|0⟩ + e^{iφ}sin(θ/2)|1⟩', def: 'A unit sphere where every point represents a pure single-qubit state. The north pole is |0⟩, south pole is |1⟩.' },
  { term: 'Wave Function Collapse', math: 'P(0) = |α|²', def: 'Measuring a qubit irreversibly projects it to one of the basis states. The probability of each outcome is the squared magnitude of its amplitude.' },
  { term: 'Quantum Interference', math: 'H²= I', def: 'Quantum amplitudes can add constructively or destructively, like waves. Algorithms exploit this to amplify correct answers and cancel wrong ones.' },
  { term: 'Quantum Fourier Transform', math: 'QFT|j⟩ = (1/√N)Σ e^{2πijk/N}|k⟩', def: 'The quantum analogue of the discrete Fourier transform. A key subroutine in Shor\'s algorithm and quantum phase estimation.' },
  { term: 'Decoherence', math: 'ρ → Σ_k E_k ρ E_k†', def: 'The process by which a quantum system loses its quantum properties due to interaction with the environment. The main enemy of quantum computers.' },
  { term: 'T Gate (π/8 Gate)', math: 'T = diag(1, e^{iπ/4})', def: 'A single-qubit phase gate. Together with H and CNOT it forms a universal gate set for quantum computing.' },
  { term: 'Bell State', math: '|Φ⁺⟩=(|00⟩+|11⟩)/√2', def: 'One of four maximally entangled two-qubit states. Created by applying H to the first qubit and then a CNOT gate.' },
  { term: 'Toffoli Gate (CCX)', math: '|a,b,c⟩→|a,b,c⊕ab⟩', def: 'A three-qubit gate that flips the target qubit only when both control qubits are |1⟩. Universal for classical reversible computation.' },
];

let glossaryRendered = false;

function renderGlossary() {
  if (glossaryRendered) return;
  glossaryRendered = true;
  const dl = document.getElementById('glossary-list');
  dl.innerHTML = GLOSSARY_TERMS.map(t => `
    <div class="glossary-item">
      <dt>${t.term} <span class="math-snippet">${escHtml(t.math)}</span></dt>
      <dd>${escHtml(t.def)}</dd>
    </div>
  `).join('');
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ================================================================
   PRESET CIRCUITS  (from feed "simulate" button)
   ================================================================ */

const PRESETS = {
  superposition: [{ gate: 'H', targets: [0] }],
  entanglement:  [{ gate: 'H', targets: [0] }, { gate: 'CX', targets: [0, 1] }],
  interference:  [{ gate: 'H', targets: [0] }, { gate: 'H', targets: [0] }],
  pauli_gates:   [{ gate: 'X', targets: [0] }],
  measurement:   [{ gate: 'H', targets: [0] }],
  teleportation: [{ gate: 'H', targets: [0] }, { gate: 'CX', targets: [0, 1] }, { gate: 'CX', targets: [0, 1] }, { gate: 'H', targets: [0] }],
  grovers:       [{ gate: 'H', targets: [0] }, { gate: 'H', targets: [1] }, { gate: 'Z', targets: [0] }, { gate: 'Z', targets: [1] }, { gate: 'H', targets: [0] }, { gate: 'H', targets: [1] }],
  shor:          [{ gate: 'H', targets: [0] }, { gate: 'H', targets: [1] }, { gate: 'CX', targets: [0, 1] }],
};

function loadPreset(cardId) {
  const preset = PRESETS[cardId];
  if (!preset) return;

  circuitSteps.length = 0;
  const numQubits = Math.max(...preset.flatMap(s => s.targets)) + 1;
  document.getElementById('sim-qubits').value = String(Math.min(numQubits, 4));
  preset.forEach(s => circuitSteps.push(s));
  renderCircuit();
}

/* ================================================================
   TOAST NOTIFICATIONS
   ================================================================ */

function showToast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.style.cssText = [
      'position:fixed', 'bottom:2rem', 'left:50%', 'transform:translateX(-50%)',
      'background:rgba(30,30,45,0.95)', 'color:#f0f0ff', 'border:1px solid rgba(255,255,255,0.1)',
      'border-radius:12px', 'padding:0.65rem 1.4rem', 'font-size:0.88rem',
      'z-index:2000', 'transition:opacity 0.3s',
    ].join(';');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => { el.style.opacity = '0'; }, 2500);
}
