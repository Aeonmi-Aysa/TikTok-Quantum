"""
Standard quantum gates as NumPy 2-D complex matrices.

Single-qubit gates operate on a 2×2 matrix.
Two-qubit gates (CNOT, SWAP) are 4×4.
Three-qubit gates (Toffoli) are 8×8.

Each function returns a numpy.ndarray that can be applied with
``QuantumCircuit`` or directly via numpy matrix multiplication.
"""

from __future__ import annotations

import cmath
import numpy as np


# ---------------------------------------------------------------------------
# Single-qubit gates
# ---------------------------------------------------------------------------


def hadamard() -> np.ndarray:
    """Hadamard gate – creates superposition.

    H = (1/√2) [[1,  1],
                 [1, -1]]
    """
    s = 1 / cmath.sqrt(2)
    return np.array([[s, s], [s, -s]], dtype=complex)


def pauli_x() -> np.ndarray:
    """Pauli-X gate (quantum NOT / bit-flip).

    X = [[0, 1],
         [1, 0]]
    """
    return np.array([[0, 1], [1, 0]], dtype=complex)


def pauli_y() -> np.ndarray:
    """Pauli-Y gate.

    Y = [[0, -i],
         [i,  0]]
    """
    return np.array([[0, -1j], [1j, 0]], dtype=complex)


def pauli_z() -> np.ndarray:
    """Pauli-Z gate (phase-flip).

    Z = [[1,  0],
         [0, -1]]
    """
    return np.array([[1, 0], [0, -1]], dtype=complex)


def phase(phi: float) -> np.ndarray:
    """General phase-shift gate R(φ).

    R(φ) = [[1,           0        ],
            [0, exp(i·φ)  ]]

    Parameters
    ----------
    phi:
        Phase angle in radians.
    """
    return np.array([[1, 0], [0, cmath.exp(1j * phi)]], dtype=complex)


def t_gate() -> np.ndarray:
    """T gate (π/8 gate) – R(π/4)."""
    return phase(cmath.pi / 4)


def s_gate() -> np.ndarray:
    """S gate – R(π/2)."""
    return phase(cmath.pi / 2)


def identity(n: int = 1) -> np.ndarray:
    """Identity gate on n qubits (2^n × 2^n identity matrix)."""
    return np.eye(2 ** n, dtype=complex)


def rotation_x(theta: float) -> np.ndarray:
    """Rotation about the X-axis by angle θ.

    Rx(θ) = cos(θ/2)·I − i·sin(θ/2)·X
    """
    c = cmath.cos(theta / 2)
    s = cmath.sin(theta / 2)
    return np.array([[c, -1j * s], [-1j * s, c]], dtype=complex)


def rotation_y(theta: float) -> np.ndarray:
    """Rotation about the Y-axis by angle θ.

    Ry(θ) = cos(θ/2)·I − i·sin(θ/2)·Y
    """
    c = float(cmath.cos(theta / 2).real)
    s = float(cmath.sin(theta / 2).real)
    return np.array([[c, -s], [s, c]], dtype=complex)


def rotation_z(theta: float) -> np.ndarray:
    """Rotation about the Z-axis by angle θ.

    Rz(θ) = exp(−iθ/2)·|0⟩⟨0| + exp(iθ/2)·|1⟩⟨1|
    """
    return np.array(
        [[cmath.exp(-1j * theta / 2), 0], [0, cmath.exp(1j * theta / 2)]],
        dtype=complex,
    )


# ---------------------------------------------------------------------------
# Two-qubit gates
# ---------------------------------------------------------------------------


def cnot() -> np.ndarray:
    """Controlled-NOT (CX) gate.

    Flips the target qubit when the control qubit is |1⟩.

    Basis order: |00⟩, |01⟩, |10⟩, |11⟩
    """
    return np.array(
        [[1, 0, 0, 0],
         [0, 1, 0, 0],
         [0, 0, 0, 1],
         [0, 0, 1, 0]],
        dtype=complex,
    )


def swap() -> np.ndarray:
    """SWAP gate – exchanges two qubits.

    Basis order: |00⟩, |01⟩, |10⟩, |11⟩
    """
    return np.array(
        [[1, 0, 0, 0],
         [0, 0, 1, 0],
         [0, 1, 0, 0],
         [0, 0, 0, 1]],
        dtype=complex,
    )


def controlled(gate: np.ndarray) -> np.ndarray:
    """Build a controlled-U gate from a 2×2 single-qubit gate U.

    CU = [[I, 0],
          [0, U]]
    """
    if gate.shape != (2, 2):
        raise ValueError("controlled() requires a 2×2 single-qubit gate.")
    cu = np.zeros((4, 4), dtype=complex)
    cu[0, 0] = 1
    cu[1, 1] = 1
    cu[2:, 2:] = gate
    return cu


# ---------------------------------------------------------------------------
# Three-qubit gates
# ---------------------------------------------------------------------------


def toffoli() -> np.ndarray:
    """Toffoli (CCX / CCNOT) gate – flips target when both controls are |1⟩.

    Basis order: |000⟩ … |111⟩
    """
    m = np.eye(8, dtype=complex)
    m[6, 6] = 0
    m[7, 7] = 0
    m[6, 7] = 1
    m[7, 6] = 1
    return m


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------


def tensor_product(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Compute the Kronecker (tensor) product of two gate matrices."""
    return np.kron(a, b)


def is_unitary(gate: np.ndarray, tol: float = 1e-9) -> bool:
    """Return True if *gate* is a unitary matrix within tolerance *tol*."""
    n = gate.shape[0]
    product = gate @ gate.conj().T
    return bool(np.allclose(product, np.eye(n), atol=tol))
