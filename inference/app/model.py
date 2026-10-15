"""Safe, constrained inference for the NeuralFlow Iris logistic regression JSON format."""

import base64
import binascii
import hashlib
import json
import math
from dataclasses import dataclass

FEATURE_NAMES = ("sepal_length", "sepal_width", "petal_length", "petal_width")
CLASS_NAMES = ("setosa", "versicolor", "virginica")
MAX_ARTIFACT_BYTES = 1024 * 1024


class ModelFormatError(ValueError):
    pass


def _vector(value: object, length: int, label: str, *, positive: bool = False) -> tuple[float, ...]:
    if not isinstance(value, list) or len(value) != length:
        raise ModelFormatError(f"{label} must contain {length} numbers")
    result = []
    for item in value:
        if isinstance(item, bool) or not isinstance(item, (int, float)) or not math.isfinite(item) or abs(item) > 1_000_000:
            raise ModelFormatError(f"{label} must contain bounded finite numbers")
        if positive and item < 0.000001:
            raise ModelFormatError(f"{label} must contain positive, nonzero-scale numbers")
        result.append(float(item))
    return tuple(result)


@dataclass(frozen=True)
class IrisModel:
    coefficients: tuple[tuple[float, ...], ...]
    intercepts: tuple[float, ...]
    mean: tuple[float, ...]
    scale: tuple[float, ...]

    def predict(self, features: tuple[float, ...]) -> tuple[str, dict[str, float]]:
        scaled = tuple((features[index] - self.mean[index]) / self.scale[index] for index in range(4))
        scores = [sum(weight * scaled[index] for index, weight in enumerate(row)) + self.intercepts[i]
                  for i, row in enumerate(self.coefficients)]
        maximum = max(scores)
        exponents = [math.exp(score - maximum) for score in scores]
        denominator = sum(exponents)
        probabilities = {name: exponents[index] / denominator for index, name in enumerate(CLASS_NAMES)}
        prediction = CLASS_NAMES[max(range(3), key=lambda index: scores[index])]
        return prediction, probabilities


def load_artifact(encoded: str, expected_sha256: str) -> IrisModel:
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ModelFormatError("artifact must be valid base64") from exc
    if not raw or len(raw) > MAX_ARTIFACT_BYTES:
        raise ModelFormatError("artifact must be between 1 byte and 1 MiB")
    if hashlib.sha256(raw).hexdigest() != expected_sha256:
        raise ModelFormatError("artifact checksum mismatch")
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise ModelFormatError("artifact must be UTF-8 JSON") from exc
    if not isinstance(payload, dict) or payload.get("schemaVersion") != 1 or not isinstance(payload.get("model"), dict):
        raise ModelFormatError("unsupported artifact schema")
    model = payload["model"]
    if model.get("type") != "sklearn_iris_logistic_regression":
        raise ModelFormatError("unsupported model type")
    if model.get("featureNames") != list(FEATURE_NAMES) or model.get("classes") != list(CLASS_NAMES):
        raise ModelFormatError("unexpected features or classes")
    coefficients = model.get("coefficients")
    if not isinstance(coefficients, list) or len(coefficients) != 3:
        raise ModelFormatError("coefficients must be a 3 by 4 matrix")
    return IrisModel(
        coefficients=tuple(_vector(row, 4, "coefficients") for row in coefficients),
        intercepts=_vector(model.get("intercepts"), 3, "intercepts"),
        mean=_vector(model.get("mean"), 4, "mean"),
        scale=_vector(model.get("scale"), 4, "scale", positive=True),
    )
