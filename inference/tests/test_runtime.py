import base64
import hashlib
import json
import os

from fastapi.testclient import TestClient

os.environ["INFERENCE_RUNTIME_TOKEN"] = "phase7-test-runtime-token-minimum-32-characters"
from app.main import app, loaded

client = TestClient(app, headers={"X-NeuralFlow-Runtime-Token": os.environ["INFERENCE_RUNTIME_TOKEN"]})


def artifact(version_id: str, winning_class: int = 0):
    coefficients = [[0.0] * 4 for _ in range(3)]
    coefficients[winning_class][0] = 2.0
    payload = {"schemaVersion": 1, "model": {
        "type": "sklearn_iris_logistic_regression",
        "featureNames": ["sepal_length", "sepal_width", "petal_length", "petal_width"],
        "classes": ["setosa", "versicolor", "virginica"],
        "coefficients": coefficients, "intercepts": [0.0, 0.0, 0.0],
        "mean": [0.0] * 4, "scale": [1.0] * 4,
    }}
    raw = json.dumps(payload).encode()
    return {"version_id": version_id, "version": version_id,
            "sha256": hashlib.sha256(raw).hexdigest(), "artifact_base64": base64.b64encode(raw).decode()}


FEATURES = {"sepal_length": 5.1, "sepal_width": 3.5, "petal_length": 1.4, "petal_width": 0.2}


def test_health_and_readiness():
    assert client.get("/healthz").json() == {"status": "ok"}
    assert client.get("/readyz").json()["status"] == "ready"
    assert TestClient(app).get("/readyz").status_code == 401
    assert TestClient(app).post("/v1/models/load", json=artifact("unauthorized")).status_code == 401


def test_load_predict_and_version_selection():
    loaded.clear()
    first = artifact("first", 0)
    second = artifact("second", 2)
    assert client.post("/v1/models/load", json=first).status_code == 200
    assert client.get(f"/v1/models/first/readyz?sha256={first['sha256']}").json() == {
        "status": "ready", "version_id": "first", "sha256": first["sha256"]
    }
    assert client.get(f"/v1/models/first/readyz?sha256={'0' * 64}").status_code == 503
    one = client.post("/v1/predict", json={**first, "features": FEATURES}, headers={"X-Request-ID": "known-1"})
    two = client.post("/v1/predict", json={**second, "features": FEATURES})
    assert one.status_code == two.status_code == 200
    assert one.json()["prediction"] == "setosa"
    assert two.json()["prediction"] == "virginica"
    assert one.json()["version"] == "first"
    assert two.json()["version"] == "second"
    assert one.json()["request_id"] == "known-1"
    assert one.headers["x-request-id"] == "known-1"
    assert one.json()["inference_ms"] >= 0
    assert abs(sum(one.json()["probabilities"].values()) - 1) < 1e-10
    assert client.get("/readyz").json()["loaded_versions"] == 2


def test_invalid_inputs_and_artifacts():
    body = artifact("bad-input")
    assert client.post("/v1/predict", json={**body, "features": {**FEATURES, "petal_width": -1}}).status_code == 422
    assert client.post("/v1/predict", json={**body, "features": {**FEATURES, "petal_width": "0.2"}}).status_code == 422
    assert client.post("/v1/predict", json={**body, "features": {"sepal_length": 4}}).status_code == 422
    bad_digest = {**body, "version_id": "bad-digest", "sha256": "0" * 64}
    response = client.post("/v1/models/load", json=bad_digest)
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_artifact"
    bad_base64 = {**body, "version_id": "bad-base64", "artifact_base64": "%%%%"}
    assert client.post("/v1/models/load", json=bad_base64).status_code == 422


def test_conflicting_version_checksum():
    loaded.clear()
    assert client.post("/v1/models/load", json=artifact("immutable", 0)).status_code == 200
    response = client.post("/v1/models/load", json=artifact("immutable", 2))
    assert response.status_code == 422
