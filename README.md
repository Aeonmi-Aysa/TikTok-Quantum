# TikTok-Quantum ⚛️

**Quantum mathematics and qubits meets TikTok.**

A TikTok-style vertical-scroll web app that teaches quantum computing through
an interactive feed of concept cards, a live quantum circuit simulator, and a
comprehensive glossary — all backed by a pure-Python quantum simulation engine.

![TikTok Quantum feed](https://github.com/user-attachments/assets/7005707e-0ec1-49c1-aede-60e0913c0f10)

---

## Features

| Feature | Description |
|---|---|
| 📱 **TikTok-style feed** | Vertical snap-scroll cards for 8 core quantum concepts |
| ⚗️ **Circuit simulator** | Build and run real quantum circuits (up to 8 qubits) in the browser |
| 📚 **Quantum glossary** | 15+ defined terms with mathematical notation |
| ❤️ **Like, share, simulate** | TikTok-style interaction buttons on every card |
| ⚡ **Quick Simulate** | Instantly visualise |0⟩, |1⟩, |+⟩, |−⟩ state vectors |

### Quantum concepts covered

- **Superposition** – |ψ⟩ = α|0⟩ + β|1⟩, Hadamard gate, Bloch sphere
- **Entanglement** – Bell states, spooky action at a distance
- **Interference** – constructive / destructive amplitude cancellation
- **Pauli Gates** – X, Y, Z rotations
- **Measurement** – wave-function collapse, Born rule
- **Quantum Teleportation** – Bell pair + classical bits
- **Grover's Algorithm** – O(√N) unstructured search
- **Shor's Algorithm** – QFT-based integer factoring

---

## Project structure

```
TikTok-Quantum/
├── app.py                  # Flask web application & REST API
├── requirements.txt
├── quantum/
│   ├── __init__.py
│   ├── qubit.py            # Qubit class (state vectors, Bloch sphere, measurement)
│   ├── gates.py            # Standard quantum gates (H, X, Y, Z, CNOT, SWAP, Toffoli …)
│   └── circuit.py          # QuantumCircuit – sequential gate composition & simulation
├── templates/
│   └── index.html          # Jinja2 template for the TikTok-style feed
├── static/
│   ├── css/style.css
│   └── js/app.js
└── tests/
    ├── test_qubit.py
    ├── test_gates.py
    ├── test_circuit.py
    └── test_app.py
```

---

## Getting started

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run the development server
python app.py

# 3. Open in your browser
open http://localhost:5000
```

---

## REST API

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | TikTok-style feed (HTML) |
| `/api/cards` | GET | All concept cards (JSON) |
| `/api/cards/<id>` | GET | Single concept card |
| `/api/qubit/state?name=plus` | GET | State vector + Bloch angles for a named state |
| `/api/circuit/run` | POST | Run a custom quantum circuit |
| `/api/bell` | GET | Simulate the Bell state |Φ⁺⟩ |

### Example – run a circuit

```bash
curl -s -X POST http://localhost:5000/api/circuit/run \
  -H 'Content-Type: application/json' \
  -d '{"num_qubits":2,"gates":[{"gate":"H","targets":[0]},{"gate":"CX","targets":[0,1]}]}'
```

```json
{
  "num_qubits": 2,
  "state": [{"re": 0.707, "im": 0.0}, {"re": 0.0, "im": 0.0},
            {"re": 0.0, "im": 0.0}, {"re": 0.707, "im": 0.0}],
  "probabilities": [0.5, 0.0, 0.0, 0.5],
  "operations": [{"gate": "H", "targets": [0]}, {"gate": "CX", "targets": [0, 1]}]
}
```

---

## Running tests

```bash
pytest tests/ -v
```

All 101 tests pass covering the `Qubit`, `Gates`, `QuantumCircuit` modules and the Flask API.

---

## Quantum library quick-start

```python
from quantum import Qubit, QuantumCircuit

# Create a Bell state |Φ⁺⟩ = (|00⟩ + |11⟩)/√2
qc = QuantumCircuit(2)
qc.h(0)        # Hadamard on qubit 0 → superposition
qc.cx(0, 1)   # CNOT → entanglement

result = qc.run()
print(result.probabilities)  # [0.5, 0.0, 0.0, 0.5]

# Bloch sphere angles for a single qubit
q = Qubit.plus()
theta, phi = q.bloch_angles()   # (π/2, 0)
```

### Supported gates

| Gate | Function | Description |
|---|---|---|
| H | `hadamard()` | Hadamard – creates superposition |
| X | `pauli_x()` | Pauli-X (NOT / bit-flip) |
| Y | `pauli_y()` | Pauli-Y |
| Z | `pauli_z()` | Pauli-Z (phase-flip) |
| S | `s_gate()` | Phase gate R(π/2) |
| T | `t_gate()` | T gate R(π/4) |
| Rx/Ry/Rz | `rotation_x/y/z(θ)` | Bloch-sphere rotations |
| CX | `cnot()` | Controlled-NOT |
| SWAP | `swap()` | Qubit swap |
| CCX | `toffoli()` | Toffoli (3-qubit) |
| CU | `controlled(U)` | Controlled-U for any 2×2 gate |
