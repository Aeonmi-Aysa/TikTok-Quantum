"""
QuantumCircuit – sequential composition of quantum gates.

A circuit holds an ordered list of (gate_matrix, target_qubits) operations
and applies them to an initial state when ``run()`` is called.

Example
-------
>>> from quantum import QuantumCircuit, Qubit, hadamard, cnot
>>> qc = QuantumCircuit(2)
>>> qc.h(0)          # Hadamard on qubit 0
>>> qc.cx(0, 1)      # CNOT – creates a Bell state
>>> result = qc.run()
>>> result.probabilities   # [0.5, 0, 0, 0.5]
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, List, Tuple

import numpy as np

from .qubit import Qubit
from . import gates as G


@dataclass
class _Operation:
    """One step in the circuit: a unitary matrix on specific qubit indices."""

    gate: np.ndarray
    targets: Tuple[int, ...]
    label: str = ""


class QuantumCircuit:
    """Simulate a sequence of quantum gates on n qubits."""

    def __init__(self, num_qubits: int) -> None:
        if num_qubits < 1:
            raise ValueError("A circuit needs at least one qubit.")
        self._n = num_qubits
        self._ops: List[_Operation] = []

    # ------------------------------------------------------------------
    # Low-level gate application
    # ------------------------------------------------------------------

    def apply(
        self,
        gate: np.ndarray,
        targets: Tuple[int, ...] | List[int],
        label: str = "",
    ) -> "QuantumCircuit":
        """Schedule a unitary *gate* on the listed *targets*.

        Parameters
        ----------
        gate:
            A 2^k × 2^k unitary matrix for k = len(targets).
        targets:
            Qubit indices (0-indexed) the gate acts on.
        label:
            Optional human-readable label shown in diagrams / API output.
        """
        targets = tuple(targets)
        k = len(targets)
        expected = 2 ** k
        if gate.shape != (expected, expected):
            raise ValueError(
                f"Gate shape {gate.shape} incompatible with {k} target qubit(s)."
            )
        for t in targets:
            if not 0 <= t < self._n:
                raise ValueError(
                    f"Target qubit {t} out of range [0, {self._n})."
                )
        self._ops.append(_Operation(gate, targets, label))
        return self

    # ------------------------------------------------------------------
    # Convenience gate methods
    # ------------------------------------------------------------------

    def h(self, qubit: int) -> "QuantumCircuit":
        """Apply Hadamard gate."""
        return self.apply(G.hadamard(), (qubit,), "H")

    def x(self, qubit: int) -> "QuantumCircuit":
        """Apply Pauli-X (NOT) gate."""
        return self.apply(G.pauli_x(), (qubit,), "X")

    def y(self, qubit: int) -> "QuantumCircuit":
        """Apply Pauli-Y gate."""
        return self.apply(G.pauli_y(), (qubit,), "Y")

    def z(self, qubit: int) -> "QuantumCircuit":
        """Apply Pauli-Z gate."""
        return self.apply(G.pauli_z(), (qubit,), "Z")

    def s(self, qubit: int) -> "QuantumCircuit":
        """Apply S gate (R(π/2))."""
        return self.apply(G.s_gate(), (qubit,), "S")

    def t(self, qubit: int) -> "QuantumCircuit":
        """Apply T gate (R(π/4))."""
        return self.apply(G.t_gate(), (qubit,), "T")

    def rx(self, qubit: int, theta: float) -> "QuantumCircuit":
        """Apply Rx rotation."""
        return self.apply(G.rotation_x(theta), (qubit,), f"Rx({theta:.2f})")

    def ry(self, qubit: int, theta: float) -> "QuantumCircuit":
        """Apply Ry rotation."""
        return self.apply(G.rotation_y(theta), (qubit,), f"Ry({theta:.2f})")

    def rz(self, qubit: int, theta: float) -> "QuantumCircuit":
        """Apply Rz rotation."""
        return self.apply(G.rotation_z(theta), (qubit,), f"Rz({theta:.2f})")

    def cx(self, control: int, target: int) -> "QuantumCircuit":
        """Apply CNOT (controlled-X) gate."""
        return self.apply(G.cnot(), (control, target), "CX")

    def swap_gate(self, a: int, b: int) -> "QuantumCircuit":
        """Apply SWAP gate."""
        return self.apply(G.swap(), (a, b), "SWAP")

    def toffoli_gate(
        self, control1: int, control2: int, target: int
    ) -> "QuantumCircuit":
        """Apply Toffoli (CCX) gate."""
        return self.apply(G.toffoli(), (control1, control2, target), "CCX")

    # ------------------------------------------------------------------
    # Execution
    # ------------------------------------------------------------------

    def run(self, initial: Qubit | None = None) -> Qubit:
        """Execute the circuit starting from *initial* state (default |0…0⟩).

        Returns
        -------
        Qubit
            The output quantum state after all gates have been applied.
        """
        dim = 2 ** self._n

        if initial is None:
            state = np.zeros(dim, dtype=complex)
            state[0] = 1.0  # |0…0⟩
        else:
            if initial.num_qubits != self._n:
                raise ValueError(
                    f"Initial state has {initial.num_qubits} qubits; "
                    f"circuit expects {self._n}."
                )
            state = initial.state

        for op in self._ops:
            state = self._apply_op(state, op)

        return Qubit(state)

    def _apply_op(self, state: np.ndarray, op: _Operation) -> np.ndarray:
        """Build the full 2^n-dimensional unitary and apply it."""
        n = self._n
        targets = op.targets
        k = len(targets)

        if k == n and set(targets) == set(range(n)):
            # Gate spans all qubits – apply directly (no embedding needed)
            return op.gate @ state

        # Build the full operator by tensor-embedding the gate on the
        # correct qubit positions.  We permute axes so the target qubits
        # are contiguous, apply, then permute back.
        #
        # Algorithm:
        #   1. Reshape state into (2, 2, …, 2) – one axis per qubit.
        #   2. Move target axes to the front.
        #   3. Reshape to (2^k, 2^(n-k)).
        #   4. Left-multiply by gate.
        #   5. Undo reshape and axis permutation.

        perm = list(targets) + [i for i in range(n) if i not in targets]
        inv_perm = [0] * n
        for new, old in enumerate(perm):
            inv_perm[old] = new

        tensor = state.reshape([2] * n)
        tensor = np.transpose(tensor, perm)
        tensor = tensor.reshape(2 ** k, 2 ** (n - k))
        tensor = op.gate @ tensor
        tensor = tensor.reshape([2] * n)
        tensor = np.transpose(tensor, inv_perm)
        return tensor.reshape(dim := 2 ** n)

    # ------------------------------------------------------------------
    # Introspection
    # ------------------------------------------------------------------

    @property
    def num_qubits(self) -> int:
        """Number of qubits in the circuit."""
        return self._n

    @property
    def depth(self) -> int:
        """Number of gate layers (sequential operations)."""
        return len(self._ops)

    def operations(self) -> list[dict]:
        """Return the circuit operations as a list of dicts (for the API)."""
        return [
            {"gate": op.label or "U", "targets": list(op.targets)}
            for op in self._ops
        ]

    def __repr__(self) -> str:  # pragma: no cover
        lines = [f"QuantumCircuit({self._n} qubits, depth={self.depth})"]
        for i, op in enumerate(self._ops):
            lines.append(f"  [{i}] {op.label or 'U'} on qubits {list(op.targets)}")
        return "\n".join(lines)
