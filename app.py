"""
TikTok-Quantum Flask application.

Serves a TikTok-style vertical-scroll feed of quantum computing concepts
and exposes a REST API for interactive quantum circuit simulation.
"""

from __future__ import annotations

import math

from flask import Flask, jsonify, render_template, request

from quantum import Qubit, QuantumCircuit, hadamard, pauli_x, cnot
from quantum import gates as G

app = Flask(__name__)


# ---------------------------------------------------------------------------
# Quantum concept cards shown in the TikTok-style feed
# ---------------------------------------------------------------------------

CARDS: list[dict] = [
    {
        "id": "superposition",
        "title": "⚛️ Superposition",
        "emoji": "🌀",
        "tagline": "A qubit can be 0 AND 1 at the same time",
        "body": (
            "Unlike a classical bit that is strictly 0 or 1, a qubit lives in a "
            "superposition of both states simultaneously.\n\n"
            "Mathematically: |ψ⟩ = α|0⟩ + β|1⟩\n"
            "where |α|² + |β|² = 1.\n\n"
            "The Hadamard gate H creates equal superposition:\n"
            "H|0⟩ = (|0⟩ + |1⟩)/√2  →  50 % chance of measuring 0 or 1."
        ),
        "circuit": "H on |0⟩",
        "tags": ["#QuantumPhysics", "#Superposition", "#QubitLife"],
    },
    {
        "id": "entanglement",
        "title": "🔗 Entanglement",
        "emoji": "💫",
        "tagline": "Two qubits, one shared destiny",
        "body": (
            "Entanglement links two (or more) qubits so that measuring one "
            "instantly determines the state of the other – no matter the distance.\n\n"
            "Bell state: |Φ⁺⟩ = (|00⟩ + |11⟩)/√2\n"
            "Circuit: H on qubit 0, then CNOT(0→1).\n\n"
            "Einstein called it 'spooky action at a distance' 👻"
        ),
        "circuit": "H|0⟩ → CNOT(0,1)",
        "tags": ["#Entanglement", "#BellState", "#SpookyAction"],
    },
    {
        "id": "interference",
        "title": "〰️ Interference",
        "emoji": "〰️",
        "tagline": "Quantum paths add and cancel like waves",
        "body": (
            "Quantum amplitudes are complex numbers that can constructively "
            "or destructively interfere with each other.\n\n"
            "H·H = I (two Hadamards cancel out), demonstrating that wrong "
            "paths are cancelled while correct answers are amplified.\n\n"
            "This is the secret weapon of quantum algorithms!"
        ),
        "circuit": "H·H = I",
        "tags": ["#Interference", "#QuantumWaves", "#QuantumAlgorithm"],
    },
    {
        "id": "pauli_gates",
        "title": "🎮 Pauli Gates",
        "emoji": "🎮",
        "tagline": "The X, Y, Z rotations of the Bloch sphere",
        "body": (
            "The three Pauli gates rotate a qubit on its Bloch sphere:\n\n"
            "• X (NOT gate): flips |0⟩↔|1⟩\n"
            "• Y: combines bit-flip and phase-flip\n"
            "• Z: flips phase |1⟩ → −|1⟩\n\n"
            "They satisfy X·Y·Z = i·I and anti-commute pairwise."
        ),
        "circuit": "X, Y, Z on |0⟩",
        "tags": ["#PauliGates", "#BlochSphere", "#QuantumGates"],
    },
    {
        "id": "measurement",
        "title": "📏 Measurement",
        "emoji": "📏",
        "tagline": "Observing a qubit collapses its wave-function",
        "body": (
            "Measuring a qubit in state α|0⟩ + β|1⟩ yields:\n"
            "  • 0 with probability |α|²\n"
            "  • 1 with probability |β|²\n\n"
            "After measurement the qubit is permanently in the measured state.\n"
            "This irreversibility is what makes quantum cryptography secure!"
        ),
        "circuit": "measure |+⟩",
        "tags": ["#Measurement", "#WaveFunction", "#QuantumCrypto"],
    },
    {
        "id": "teleportation",
        "title": "🛸 Quantum Teleportation",
        "emoji": "🛸",
        "tagline": "Transmit a qubit state without moving the qubit",
        "body": (
            "Using a shared Bell pair and two classical bits, Alice can send "
            "any qubit state to Bob – instantly and securely.\n\n"
            "Steps:\n"
            "1. Create Bell pair shared between Alice & Bob.\n"
            "2. Alice entangles her data qubit with her half.\n"
            "3. Alice measures and sends 2 classical bits.\n"
            "4. Bob applies corrections based on those bits.\n\n"
            "No physical qubit travels – only information!"
        ),
        "circuit": "Bell pair + CNOT + H + measure",
        "tags": ["#QuantumTeleportation", "#BellPair", "#MindBlown"],
    },
    {
        "id": "grovers",
        "title": "🔍 Grover's Algorithm",
        "emoji": "🔍",
        "tagline": "Search a database in √N steps",
        "body": (
            "Classical search of N items needs O(N) steps.\n"
            "Grover's quantum algorithm needs only O(√N).\n\n"
            "Key steps:\n"
            "1. Put all N states in equal superposition (H gates).\n"
            "2. Apply the oracle (marks the target state).\n"
            "3. Apply the diffusion operator (amplifies the target).\n"
            "4. Repeat ~π/4·√N times.\n\n"
            "For 1 million items: ~1 000 vs ~785 steps 🚀"
        ),
        "circuit": "H^n → Oracle → Diffusion (×√N)",
        "tags": ["#GroversAlgorithm", "#QuantumSearch", "#Speedup"],
    },
    {
        "id": "shor",
        "title": "🔐 Shor's Algorithm",
        "emoji": "🔐",
        "tagline": "Factoring integers exponentially faster",
        "body": (
            "RSA encryption relies on the hardness of factoring large numbers.\n"
            "Shor's algorithm (1994) factors an N-bit integer in O(N³) quantum gates – "
            "vs. sub-exponential classical algorithms.\n\n"
            "Core trick: Quantum Fourier Transform (QFT) finds the period of "
            "f(x) = aˣ mod N in polynomial time.\n\n"
            "A large enough quantum computer would break RSA – motivating "
            "post-quantum cryptography."
        ),
        "circuit": "QFT-based period finding",
        "tags": ["#ShorsAlgorithm", "#QFT", "#PostQuantum"],
    },
]


# ---------------------------------------------------------------------------
# Routes – HTML pages
# ---------------------------------------------------------------------------


@app.get("/")
def index():
    """Serve the TikTok-style feed."""
    return render_template("index.html", cards=CARDS)


# ---------------------------------------------------------------------------
# Routes – JSON API
# ---------------------------------------------------------------------------


@app.get("/api/cards")
def api_cards():
    """Return all concept card data."""
    return jsonify(CARDS)


@app.get("/api/cards/<card_id>")
def api_card(card_id: str):
    """Return a single concept card."""
    card = next((c for c in CARDS if c["id"] == card_id), None)
    if card is None:
        return jsonify({"error": f"Card '{card_id}' not found."}), 404
    return jsonify(card)


@app.get("/api/qubit/state")
def api_qubit_state():
    """Return the state vector and probabilities for a standard state.

    Query parameters:
        name (str): one of zero, one, plus, minus (default: zero)
    """
    name = request.args.get("name", "zero").lower()
    factories = {
        "zero": Qubit.zero,
        "one": Qubit.one,
        "plus": Qubit.plus,
        "minus": Qubit.minus,
    }
    if name not in factories:
        return jsonify({"error": f"Unknown state '{name}'. Use: {list(factories)}."}), 400

    q = factories[name]()
    state = q.state
    probs = q.probabilities
    theta, phi = q.bloch_angles()
    return jsonify(
        {
            "name": name,
            "state": [{"re": float(a.real), "im": float(a.imag)} for a in state],
            "probabilities": [float(p) for p in probs],
            "bloch": {"theta": theta, "phi": phi},
        }
    )


@app.post("/api/circuit/run")
def api_circuit_run():
    """Run a quantum circuit supplied as JSON.

    Request body (JSON)::

        {
          "num_qubits": 2,
          "gates": [
            {"gate": "H",  "targets": [0]},
            {"gate": "CX", "targets": [0, 1]}
          ]
        }

    Response::

        {
          "num_qubits": 2,
          "state": [{"re": …, "im": …}, …],
          "probabilities": […],
          "operations": […]
        }
    """
    data = request.get_json(force=True, silent=True) or {}

    num_qubits = int(data.get("num_qubits", 1))
    if not 1 <= num_qubits <= 8:
        return jsonify({"error": "num_qubits must be between 1 and 8."}), 400

    gate_specs = data.get("gates", [])

    GATE_MAP = {
        "H": lambda t: (G.hadamard(), t),
        "X": lambda t: (G.pauli_x(), t),
        "Y": lambda t: (G.pauli_y(), t),
        "Z": lambda t: (G.pauli_z(), t),
        "S": lambda t: (G.s_gate(), t),
        "T": lambda t: (G.t_gate(), t),
        "CX": lambda t: (G.cnot(), t),
        "SWAP": lambda t: (G.swap(), t),
        "CCX": lambda t: (G.toffoli(), t),
        "I": lambda t: (G.identity(), t),
    }

    qc = QuantumCircuit(num_qubits)
    errors = []
    for i, spec in enumerate(gate_specs):
        name = str(spec.get("gate", "")).upper()
        targets = spec.get("targets", [])
        if name not in GATE_MAP:
            errors.append(f"Step {i}: unknown gate '{name}'.")
            continue
        try:
            gate, tgts = GATE_MAP[name](targets)
            qc.apply(gate, tgts, label=name)
        except (ValueError, IndexError):
            errors.append(f"Step {i}: invalid gate configuration for '{name}'.")

    if errors:
        return jsonify({"errors": errors}), 400

    try:
        result = qc.run()
    except Exception:  # pragma: no cover
        return jsonify({"error": "Circuit execution failed."}), 500

    state = result.state
    probs = result.probabilities
    return jsonify(
        {
            "num_qubits": num_qubits,
            "state": [{"re": float(a.real), "im": float(a.imag)} for a in state],
            "probabilities": [float(p) for p in probs],
            "operations": qc.operations(),
        }
    )


@app.get("/api/bell")
def api_bell():
    """Simulate the Bell state |Φ⁺⟩ = (|00⟩ + |11⟩)/√2."""
    qc = QuantumCircuit(2)
    qc.h(0)
    qc.cx(0, 1)
    result = qc.run()
    probs = result.probabilities
    return jsonify(
        {
            "description": "Bell state |Φ⁺⟩ = (|00⟩ + |11⟩)/√2",
            "state": [
                {"re": float(a.real), "im": float(a.imag)} for a in result.state
            ],
            "probabilities": {
                "|00⟩": float(probs[0]),
                "|01⟩": float(probs[1]),
                "|10⟩": float(probs[2]),
                "|11⟩": float(probs[3]),
            },
        }
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":  # pragma: no cover
    import os
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(debug=debug, port=5000)
