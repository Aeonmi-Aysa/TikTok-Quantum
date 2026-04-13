"""Tests for quantum.qubit"""

import cmath
import math
import pytest
import numpy as np

from quantum.qubit import Qubit


class TestQubitConstruction:
    def test_zero_state(self):
        q = Qubit.zero()
        assert np.allclose(q.state, [1, 0])

    def test_one_state(self):
        q = Qubit.one()
        assert np.allclose(q.state, [0, 1])

    def test_plus_state(self):
        q = Qubit.plus()
        s = 1 / math.sqrt(2)
        assert np.allclose(q.state, [s, s])

    def test_minus_state(self):
        q = Qubit.minus()
        s = 1 / math.sqrt(2)
        assert np.allclose(q.state, [s, -s])

    def test_auto_normalises(self):
        q = Qubit([3, 4])  # not normalised
        assert abs(np.linalg.norm(q.state) - 1.0) < 1e-10

    def test_from_bloch_zero(self):
        q = Qubit.from_bloch(0, 0)
        assert np.allclose(q.state, [1, 0], atol=1e-10)

    def test_from_bloch_one(self):
        q = Qubit.from_bloch(math.pi, 0)
        assert np.allclose(abs(q.state[1]), 1.0, atol=1e-10)

    def test_invalid_length(self):
        with pytest.raises(ValueError):
            Qubit([1, 0, 0])  # length 3 is not a power of 2

    def test_zero_vector_rejected(self):
        with pytest.raises(ValueError):
            Qubit([0, 0])

    def test_2d_rejected(self):
        with pytest.raises(ValueError):
            Qubit(np.array([[1, 0], [0, 1]]))

    def test_num_qubits_single(self):
        assert Qubit.zero().num_qubits == 1

    def test_num_qubits_two(self):
        q = Qubit([1, 0, 0, 0])
        assert q.num_qubits == 2


class TestQubitProbabilities:
    def test_zero_state_probs(self):
        q = Qubit.zero()
        assert np.allclose(q.probabilities, [1.0, 0.0])

    def test_plus_state_probs(self):
        q = Qubit.plus()
        assert np.allclose(q.probabilities, [0.5, 0.5])

    def test_probs_sum_to_one(self):
        q = Qubit([1, 2, 3, 4])
        assert abs(sum(q.probabilities) - 1.0) < 1e-10


class TestQubitTensor:
    def test_zero_tensor_zero(self):
        q0 = Qubit.zero()
        result = q0.tensor(q0)
        assert np.allclose(result.state, [1, 0, 0, 0])
        assert result.num_qubits == 2

    def test_zero_tensor_one(self):
        q = Qubit.zero().tensor(Qubit.one())
        assert np.allclose(q.state, [0, 1, 0, 0])


class TestQubitMeasure:
    def test_zero_always_measures_zero(self):
        for _ in range(20):
            assert Qubit.zero().measure() == 0

    def test_one_always_measures_one(self):
        for _ in range(20):
            assert Qubit.one().measure() == 1

    def test_measure_in_range(self):
        q = Qubit([1, 0, 0, 0])  # |00⟩
        outcomes = {q.measure() for _ in range(10)}
        assert outcomes <= {0}

    def test_measure_bit_collapses(self):
        q = Qubit.zero()
        result = q.measure_bit(0)
        assert result == 0

    def test_measure_bit_out_of_range(self):
        with pytest.raises(ValueError):
            Qubit.zero().measure_bit(1)


class TestBlochAngles:
    def test_zero_bloch(self):
        theta, phi = Qubit.zero().bloch_angles()
        assert abs(theta) < 1e-10

    def test_one_bloch(self):
        theta, _ = Qubit.one().bloch_angles()
        assert abs(theta - math.pi) < 1e-10

    def test_bloch_multi_qubit_raises(self):
        with pytest.raises(ValueError):
            Qubit([1, 0, 0, 0]).bloch_angles()


class TestQubitEquality:
    def test_same_states_equal(self):
        assert Qubit.zero() == Qubit.zero()

    def test_different_states_not_equal(self):
        assert Qubit.zero() != Qubit.one()

    def test_non_qubit_not_equal(self):
        assert Qubit.zero().__eq__("not a qubit") is NotImplemented
