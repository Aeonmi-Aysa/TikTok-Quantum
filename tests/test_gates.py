"""Tests for quantum.gates"""

import math
import numpy as np
import pytest

from quantum import gates as G


class TestGateShapes:
    def test_hadamard_shape(self):
        assert G.hadamard().shape == (2, 2)

    def test_pauli_x_shape(self):
        assert G.pauli_x().shape == (2, 2)

    def test_pauli_y_shape(self):
        assert G.pauli_y().shape == (2, 2)

    def test_pauli_z_shape(self):
        assert G.pauli_z().shape == (2, 2)

    def test_cnot_shape(self):
        assert G.cnot().shape == (4, 4)

    def test_swap_shape(self):
        assert G.swap().shape == (4, 4)

    def test_toffoli_shape(self):
        assert G.toffoli().shape == (8, 8)


class TestGatesUnitary:
    """All standard gates must be unitary: U†U = I."""

    @pytest.mark.parametrize("gate_fn", [
        G.hadamard, G.pauli_x, G.pauli_y, G.pauli_z,
        G.s_gate, G.t_gate, G.cnot, G.swap, G.toffoli,
        lambda: G.phase(math.pi / 3),
        lambda: G.rotation_x(1.0),
        lambda: G.rotation_y(1.0),
        lambda: G.rotation_z(1.0),
    ])
    def test_unitary(self, gate_fn):
        assert G.is_unitary(gate_fn()), f"{gate_fn} is not unitary"


class TestHadamard:
    def test_h_creates_superposition(self):
        h = G.hadamard()
        state = h @ np.array([1, 0], dtype=complex)  # H|0⟩
        s = 1 / math.sqrt(2)
        assert np.allclose(state, [s, s])

    def test_h_squared_is_identity(self):
        h = G.hadamard()
        assert np.allclose(h @ h, np.eye(2))


class TestPauliGates:
    def test_x_flips(self):
        x = G.pauli_x()
        assert np.allclose(x @ np.array([1, 0], dtype=complex), [0, 1])
        assert np.allclose(x @ np.array([0, 1], dtype=complex), [1, 0])

    def test_z_phase_flip(self):
        z = G.pauli_z()
        assert np.allclose(z @ np.array([0, 1], dtype=complex), [0, -1])

    def test_xyz_product(self):
        """X·Y·Z = i·I"""
        result = G.pauli_x() @ G.pauli_y() @ G.pauli_z()
        assert np.allclose(result, 1j * np.eye(2))


class TestCNOT:
    def test_cnot_flips_target_when_control_one(self):
        cx = G.cnot()
        # |10⟩ → |11⟩
        state_10 = np.array([0, 0, 1, 0], dtype=complex)
        assert np.allclose(cx @ state_10, [0, 0, 0, 1])

    def test_cnot_no_flip_when_control_zero(self):
        cx = G.cnot()
        # |01⟩ → |01⟩
        state_01 = np.array([0, 1, 0, 0], dtype=complex)
        assert np.allclose(cx @ state_01, [0, 1, 0, 0])


class TestSWAP:
    def test_swap_gate(self):
        s = G.swap()
        state_01 = np.array([0, 1, 0, 0], dtype=complex)  # |01⟩
        assert np.allclose(s @ state_01, [0, 0, 1, 0])    # → |10⟩


class TestToffoli:
    def test_toffoli_flips_target(self):
        t = G.toffoli()
        # |110⟩ = index 6 → |111⟩ = index 7
        state = np.zeros(8, dtype=complex)
        state[6] = 1.0
        result = t @ state
        assert np.allclose(result[7], 1.0)
        assert np.allclose(result[6], 0.0)

    def test_toffoli_no_flip_without_both_controls(self):
        t = G.toffoli()
        state = np.zeros(8, dtype=complex)
        state[5] = 1.0  # |101⟩ – only one control
        assert np.allclose(t @ state, state)


class TestControlled:
    def test_controlled_x_equals_cnot(self):
        cx_built = G.controlled(G.pauli_x())
        assert np.allclose(cx_built, G.cnot())

    def test_controlled_requires_2x2(self):
        with pytest.raises(ValueError):
            G.controlled(G.cnot())


class TestTensorProduct:
    def test_tensor_hi_is_2qb_identity(self):
        # H ⊗ I applied twice to |+0⟩ should return |+0⟩
        hi = G.tensor_product(G.hadamard(), G.identity())
        assert hi.shape == (4, 4)


class TestPhaseGate:
    def test_phase_zero_is_identity(self):
        assert np.allclose(G.phase(0), np.eye(2))

    def test_phase_pi_is_pauli_z(self):
        assert np.allclose(G.phase(math.pi), G.pauli_z())
