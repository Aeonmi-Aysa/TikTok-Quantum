"""
Qubit – the fundamental unit of quantum information.

A qubit state is represented as a complex column vector in C^2:
    |ψ⟩ = α|0⟩ + β|1⟩    where  |α|² + |β|² = 1

For an n-qubit system the state lives in C^(2^n).
"""

from __future__ import annotations

import cmath
import random
from typing import Sequence

import numpy as np


class Qubit:
    """Represents a single- or multi-qubit pure quantum state."""

    # ------------------------------------------------------------------
    # Construction helpers
    # ------------------------------------------------------------------

    def __init__(self, state: Sequence[complex] | np.ndarray) -> None:
        """Create a qubit from an arbitrary (normalised) state vector.

        Parameters
        ----------
        state:
            A 1-D array-like of complex amplitudes whose length must be a
            power of 2.  The vector is normalised automatically.
        """
        vec = np.array(state, dtype=complex)
        if vec.ndim != 1:
            raise ValueError("State vector must be 1-D.")
        n = len(vec)
        if n == 0 or (n & (n - 1)) != 0:
            raise ValueError(
                f"State vector length must be a power of 2, got {n}."
            )
        norm = np.linalg.norm(vec)
        if norm == 0:
            raise ValueError("State vector must not be the zero vector.")
        self._state = vec / norm
        self._num_qubits = int(np.log2(n))

    @classmethod
    def zero(cls) -> "Qubit":
        """Return the |0⟩ basis state."""
        return cls([1.0 + 0j, 0.0 + 0j])

    @classmethod
    def one(cls) -> "Qubit":
        """Return the |1⟩ basis state."""
        return cls([0.0 + 0j, 1.0 + 0j])

    @classmethod
    def plus(cls) -> "Qubit":
        """Return the |+⟩ = (|0⟩ + |1⟩)/√2 state."""
        s = 1 / cmath.sqrt(2)
        return cls([s, s])

    @classmethod
    def minus(cls) -> "Qubit":
        """Return the |−⟩ = (|0⟩ − |1⟩)/√2 state."""
        s = 1 / cmath.sqrt(2)
        return cls([s, -s])

    @classmethod
    def from_bloch(cls, theta: float, phi: float) -> "Qubit":
        """Construct a single qubit from Bloch-sphere angles.

        Parameters
        ----------
        theta:
            Polar angle in radians (0 = |0⟩, π = |1⟩).
        phi:
            Azimuthal angle in radians.
        """
        alpha = cmath.cos(theta / 2)
        beta = cmath.exp(1j * phi) * cmath.sin(theta / 2)
        return cls([alpha, beta])

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def state(self) -> np.ndarray:
        """The normalised complex state vector."""
        return self._state.copy()

    @property
    def num_qubits(self) -> int:
        """Number of qubits in this register."""
        return self._num_qubits

    @property
    def probabilities(self) -> np.ndarray:
        """Measurement probabilities for each computational basis state."""
        return (np.abs(self._state) ** 2).real

    # ------------------------------------------------------------------
    # Tensor product
    # ------------------------------------------------------------------

    def tensor(self, other: "Qubit") -> "Qubit":
        """Return the tensor (Kronecker) product |self⟩ ⊗ |other⟩."""
        return Qubit(np.kron(self._state, other._state))

    # ------------------------------------------------------------------
    # Measurement
    # ------------------------------------------------------------------

    def measure(self) -> int:
        """Simulate a projective measurement in the computational basis.

        Returns
        -------
        int
            The measured basis-state index (0 … 2^n − 1).
        """
        probs = self.probabilities
        outcomes = list(range(len(probs)))
        return random.choices(outcomes, weights=probs)[0]

    def measure_bit(self, bit: int) -> int:
        """Measure a single qubit within the register (0-indexed from MSB).

        Returns 0 or 1 and collapses the state accordingly.
        """
        n = self._num_qubits
        if not 0 <= bit < n:
            raise ValueError(f"Qubit index {bit} out of range [0, {n}).")

        dim = 2 ** n
        mask = 1 << (n - 1 - bit)

        # Split into |0⟩ and |1⟩ sectors for the chosen qubit
        prob0 = sum(
            abs(self._state[i]) ** 2 for i in range(dim) if not (i & mask)
        )
        prob1 = 1.0 - prob0

        outcome = random.choices([0, 1], weights=[prob0, prob1])[0]

        # Project and renormalise
        new_state = np.zeros(dim, dtype=complex)
        for i in range(dim):
            bit_val = 1 if (i & mask) else 0
            if bit_val == outcome:
                new_state[i] = self._state[i]

        norm = np.linalg.norm(new_state)
        self._state = new_state / norm
        return outcome

    # ------------------------------------------------------------------
    # Bloch-sphere representation (single-qubit only)
    # ------------------------------------------------------------------

    def bloch_angles(self) -> tuple[float, float]:
        """Return (θ, φ) Bloch-sphere angles for a single-qubit state."""
        if self._num_qubits != 1:
            raise ValueError("Bloch angles defined only for single qubits.")
        alpha, beta = self._state
        theta = float(2 * np.arccos(np.clip(abs(alpha), 0, 1)))
        phi = float(np.angle(beta) - np.angle(alpha)) if abs(beta) > 1e-10 else 0.0
        return theta, phi

    # ------------------------------------------------------------------
    # Dunder helpers
    # ------------------------------------------------------------------

    def __repr__(self) -> str:  # pragma: no cover
        terms = []
        n = self._num_qubits
        for idx, amp in enumerate(self._state):
            if abs(amp) < 1e-10:
                continue
            label = format(idx, f"0{n}b")
            terms.append(f"({amp:.3f})|{label}⟩")
        return " + ".join(terms) if terms else "0"

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Qubit):
            return NotImplemented
        return bool(np.allclose(self._state, other._state))
