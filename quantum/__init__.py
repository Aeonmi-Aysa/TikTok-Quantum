"""
TikTok-Quantum: Quantum mathematics and qubits meets TikTok.

Provides simulation of qubits, quantum gates, and quantum circuits
that power the interactive TikTok-style quantum learning feed.
"""

from .qubit import Qubit
from .gates import (
    hadamard,
    pauli_x,
    pauli_y,
    pauli_z,
    phase,
    t_gate,
    cnot,
    swap,
    toffoli,
)
from .circuit import QuantumCircuit

__all__ = [
    "Qubit",
    "hadamard",
    "pauli_x",
    "pauli_y",
    "pauli_z",
    "phase",
    "t_gate",
    "cnot",
    "swap",
    "toffoli",
    "QuantumCircuit",
]
