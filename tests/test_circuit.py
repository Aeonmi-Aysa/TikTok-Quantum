"""Tests for quantum.circuit"""

import math
import numpy as np
import pytest

from quantum.circuit import QuantumCircuit
from quantum.qubit import Qubit
from quantum import gates as G


class TestCircuitConstruction:
    def test_single_qubit(self):
        qc = QuantumCircuit(1)
        assert qc.num_qubits == 1
        assert qc.depth == 0

    def test_invalid_num_qubits(self):
        with pytest.raises(ValueError):
            QuantumCircuit(0)

    def test_operations_empty(self):
        qc = QuantumCircuit(2)
        assert qc.operations() == []


class TestCircuitGates:
    def test_h_on_zero_gives_superposition(self):
        qc = QuantumCircuit(1)
        qc.h(0)
        result = qc.run()
        s = 1 / math.sqrt(2)
        assert np.allclose(result.state, [s, s])

    def test_x_on_zero_gives_one(self):
        qc = QuantumCircuit(1)
        qc.x(0)
        result = qc.run()
        assert np.allclose(result.state, [0, 1])

    def test_hh_is_identity(self):
        qc = QuantumCircuit(1)
        qc.h(0).h(0)
        result = qc.run()
        assert np.allclose(result.state, [1, 0])

    def test_bell_state(self):
        qc = QuantumCircuit(2)
        qc.h(0)
        qc.cx(0, 1)
        result = qc.run()
        s = 1 / math.sqrt(2)
        # |Φ⁺⟩ = (|00⟩ + |11⟩)/√2
        assert np.allclose(result.state, [s, 0, 0, s])

    def test_bell_state_probabilities(self):
        qc = QuantumCircuit(2)
        qc.h(0).cx(0, 1)
        result = qc.run()
        probs = result.probabilities
        assert np.allclose(probs, [0.5, 0.0, 0.0, 0.5])

    def test_swap_gate(self):
        qc = QuantumCircuit(2)
        qc.x(0)               # |10⟩
        qc.swap_gate(0, 1)    # → |01⟩
        result = qc.run()
        assert np.allclose(result.state, [0, 1, 0, 0])

    def test_toffoli_gate(self):
        qc = QuantumCircuit(3)
        qc.x(0).x(1)                    # |110⟩
        qc.toffoli_gate(0, 1, 2)        # → |111⟩
        result = qc.run()
        assert np.allclose(result.state[-1], 1.0)


class TestCircuitApply:
    def test_apply_out_of_range(self):
        qc = QuantumCircuit(2)
        with pytest.raises(ValueError):
            qc.apply(G.pauli_x(), (5,))

    def test_apply_wrong_shape(self):
        qc = QuantumCircuit(2)
        with pytest.raises(ValueError):
            qc.apply(G.hadamard(), (0, 1))  # 2×2 gate on 2 targets expects 4×4

    def test_depth_increments(self):
        qc = QuantumCircuit(1)
        qc.h(0).x(0).z(0)
        assert qc.depth == 3

    def test_operations_list(self):
        qc = QuantumCircuit(2)
        qc.h(0).cx(0, 1)
        ops = qc.operations()
        assert len(ops) == 2
        assert ops[0] == {"gate": "H", "targets": [0]}
        assert ops[1] == {"gate": "CX", "targets": [0, 1]}


class TestCircuitInitialState:
    def test_custom_initial_state(self):
        q_one = Qubit.one()
        qc = QuantumCircuit(1)
        qc.x(0)  # X|1⟩ = |0⟩
        result = qc.run(initial=q_one)
        assert np.allclose(result.state, [1, 0])

    def test_wrong_num_qubits_raises(self):
        q = Qubit([1, 0, 0, 0])  # 2-qubit state
        qc = QuantumCircuit(1)
        with pytest.raises(ValueError):
            qc.run(initial=q)


class TestRotationGates:
    def test_rx_pi_equals_ix(self):
        """Rx(π) = -i·X (up to global phase)"""
        qc = QuantumCircuit(1)
        qc.rx(0, math.pi)
        result = qc.run()
        # Rx(π)|0⟩ = -i|1⟩  →  probability of |1⟩ = 1
        assert abs(result.probabilities[1] - 1.0) < 1e-10

    def test_ry_pi_equals_iy(self):
        """Ry(π)|0⟩ = |1⟩"""
        qc = QuantumCircuit(1)
        qc.ry(0, math.pi)
        result = qc.run()
        assert abs(result.probabilities[1] - 1.0) < 1e-10

    def test_rz_does_not_change_zero_probs(self):
        """Rz only adds a relative phase; |0⟩ probabilities stay the same."""
        qc = QuantumCircuit(1)
        qc.rz(0, 1.23)
        result = qc.run()
        assert np.allclose(result.probabilities, [1.0, 0.0])
