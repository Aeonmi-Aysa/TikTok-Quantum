"""Tests for the Flask application routes and API."""

import json
import math
import pytest

from app import app as flask_app


@pytest.fixture
def client():
    flask_app.config["TESTING"] = True
    with flask_app.test_client() as c:
        yield c


class TestIndexRoute:
    def test_index_returns_200(self, client):
        res = client.get("/")
        assert res.status_code == 200

    def test_index_contains_quantum(self, client):
        res = client.get("/")
        assert b"Quantum" in res.data

    def test_index_contains_tiktok_ui_elements(self, client):
        res = client.get("/")
        assert b"feed" in res.data.lower() or b"card" in res.data.lower()


class TestCardsAPI:
    def test_get_all_cards(self, client):
        res = client.get("/api/cards")
        assert res.status_code == 200
        data = json.loads(res.data)
        assert isinstance(data, list)
        assert len(data) > 0

    def test_cards_have_required_fields(self, client):
        res = client.get("/api/cards")
        cards = json.loads(res.data)
        for card in cards:
            assert "id" in card
            assert "title" in card
            assert "body" in card

    def test_get_single_card(self, client):
        res = client.get("/api/cards/superposition")
        assert res.status_code == 200
        data = json.loads(res.data)
        assert data["id"] == "superposition"

    def test_get_nonexistent_card(self, client):
        res = client.get("/api/cards/nonexistent")
        assert res.status_code == 404


class TestQubitStateAPI:
    def test_zero_state(self, client):
        res = client.get("/api/qubit/state?name=zero")
        assert res.status_code == 200
        data = json.loads(res.data)
        assert data["name"] == "zero"
        assert len(data["state"]) == 2
        assert abs(data["state"][0]["re"] - 1.0) < 1e-10
        assert abs(data["state"][1]["re"]) < 1e-10

    def test_plus_state_equal_probs(self, client):
        res = client.get("/api/qubit/state?name=plus")
        data = json.loads(res.data)
        probs = data["probabilities"]
        assert abs(probs[0] - 0.5) < 1e-10
        assert abs(probs[1] - 0.5) < 1e-10

    def test_bloch_in_response(self, client):
        res = client.get("/api/qubit/state?name=zero")
        data = json.loads(res.data)
        assert "bloch" in data
        assert "theta" in data["bloch"]
        assert "phi" in data["bloch"]

    def test_unknown_state(self, client):
        res = client.get("/api/qubit/state?name=unknown")
        assert res.status_code == 400

    def test_default_is_zero(self, client):
        res = client.get("/api/qubit/state")
        data = json.loads(res.data)
        assert data["name"] == "zero"


class TestCircuitRunAPI:
    def test_simple_hadamard(self, client):
        body = {"num_qubits": 1, "gates": [{"gate": "H", "targets": [0]}]}
        res = client.post("/api/circuit/run", json=body)
        assert res.status_code == 200
        data = json.loads(res.data)
        assert abs(data["probabilities"][0] - 0.5) < 1e-10
        assert abs(data["probabilities"][1] - 0.5) < 1e-10

    def test_bell_state(self, client):
        body = {
            "num_qubits": 2,
            "gates": [
                {"gate": "H", "targets": [0]},
                {"gate": "CX", "targets": [0, 1]},
            ],
        }
        res = client.post("/api/circuit/run", json=body)
        assert res.status_code == 200
        data = json.loads(res.data)
        probs = data["probabilities"]
        assert abs(probs[0] - 0.5) < 1e-10
        assert abs(probs[3] - 0.5) < 1e-10

    def test_unknown_gate_returns_400(self, client):
        body = {"num_qubits": 1, "gates": [{"gate": "FAKE", "targets": [0]}]}
        res = client.post("/api/circuit/run", json=body)
        assert res.status_code == 400

    def test_too_many_qubits_returns_400(self, client):
        body = {"num_qubits": 9, "gates": []}
        res = client.post("/api/circuit/run", json=body)
        assert res.status_code == 400

    def test_empty_circuit(self, client):
        body = {"num_qubits": 2, "gates": []}
        res = client.post("/api/circuit/run", json=body)
        assert res.status_code == 200
        data = json.loads(res.data)
        # |00⟩ probability should be 1
        assert abs(data["probabilities"][0] - 1.0) < 1e-10

    def test_operations_returned(self, client):
        body = {"num_qubits": 1, "gates": [{"gate": "X", "targets": [0]}]}
        res = client.post("/api/circuit/run", json=body)
        data = json.loads(res.data)
        assert data["operations"] == [{"gate": "X", "targets": [0]}]


class TestBellAPI:
    def test_bell_endpoint(self, client):
        res = client.get("/api/bell")
        assert res.status_code == 200
        data = json.loads(res.data)
        assert "probabilities" in data
        assert abs(data["probabilities"]["|00⟩"] - 0.5) < 1e-10
        assert abs(data["probabilities"]["|11⟩"] - 0.5) < 1e-10
