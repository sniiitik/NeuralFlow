"""Private FastAPI runtime; the Next.js control plane is its only intended caller."""

import math
import logging
import json
import time
import os
import hmac
from uuid import uuid4

from fastapi import FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .model import IrisModel, ModelFormatError, load_artifact

app = FastAPI(title="NeuralFlow inference runtime", docs_url=None, redoc_url=None, openapi_url=None)
loaded: dict[str, tuple[str, IrisModel]] = {}
telemetry_logger = logging.getLogger("neuralflow.runtime")
telemetry_logger.setLevel(logging.INFO)
if not telemetry_logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    telemetry_logger.addHandler(handler)
telemetry_logger.propagate = False


@app.middleware("http")
async def observe_request(request: Request, call_next):
    identifier = request_id(request.headers.get("x-request-id"))
    started = time.perf_counter()
    try:
        if request.url.path != "/healthz":
            expected = os.environ.get("INFERENCE_RUNTIME_TOKEN", "")
            supplied = request.headers.get("x-neuralflow-runtime-token", "")
            if len(expected) < 32 or not hmac.compare_digest(supplied, expected):
                response = JSONResponse(status_code=401, content={"code": "unauthorized", "error": "Runtime credential required"})
            else:
                response = await call_next(request)
        else:
            response = await call_next(request)
        status = response.status_code
    except Exception:
        status = 500
        raise
    finally:
        telemetry_logger.info(json.dumps({"event": "runtime_request", "request_id": identifier,
                                          "path": request.url.path, "status": status,
                                          "duration_ms": round((time.perf_counter() - started) * 1000, 3)}))
    response.headers["X-Request-ID"] = identifier
    return response


class ArtifactRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version_id: str = Field(min_length=1, max_length=128)
    version: str = Field(min_length=1, max_length=80)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    artifact_base64: str = Field(min_length=1, max_length=1_500_000)


class IrisFeatures(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    sepal_length: float = Field(gt=0, le=20)
    sepal_width: float = Field(gt=0, le=20)
    petal_length: float = Field(gt=0, le=20)
    petal_width: float = Field(gt=0, le=20)

    @field_validator("sepal_length", "sepal_width", "petal_length", "petal_width")
    @classmethod
    def finite(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("feature must be finite")
        return value


class PredictRequest(ArtifactRequest):
    features: IrisFeatures


def request_id(header: str | None) -> str:
    return header if header and len(header) <= 128 and header.isascii() else str(uuid4())


def get_model(body: ArtifactRequest) -> IrisModel:
    cached = loaded.get(body.version_id)
    if cached and cached[0] == body.sha256:
        return cached[1]
    if cached:
        raise ModelFormatError("version ID was previously loaded with a different checksum")
    model = load_artifact(body.artifact_base64, body.sha256)
    loaded[body.version_id] = (body.sha256, model)
    return model


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"code": "invalid_request", "error": "Invalid inference request", "issues": [
        {"field": ".".join(str(part) for part in issue["loc"]), "message": issue["msg"]} for issue in exc.errors()
    ], "request_id": request_id(request.headers.get("x-request-id"))})


@app.exception_handler(ModelFormatError)
async def format_error(request: Request, exc: ModelFormatError):
    return JSONResponse(status_code=422, content={"code": "invalid_artifact", "error": str(exc),
                                                  "request_id": request_id(request.headers.get("x-request-id"))})


@app.exception_handler(Exception)
async def internal_error(request: Request, exc: Exception):
    identifier = request_id(request.headers.get("x-request-id"))
    logging.exception("inference request failed: %s", identifier, exc_info=exc)
    return JSONResponse(status_code=500, content={"code": "internal_error", "error": "Inference failed",
                                                  "request_id": identifier})


@app.get("/healthz")
def health():
    return {"status": "ok"}


@app.get("/readyz")
def ready():
    return {"status": "ready", "loaded_versions": len(loaded)}


@app.post("/v1/models/load")
def load(body: ArtifactRequest, x_request_id: str | None = Header(default=None)):
    get_model(body)
    return {"status": "ready", "version_id": body.version_id, "version": body.version,
            "request_id": request_id(x_request_id)}


@app.get("/v1/models/{version_id}/readyz")
def model_ready(version_id: str, sha256: str):
    cached = loaded.get(version_id)
    if not cached or cached[0] != sha256:
        return JSONResponse(status_code=503, content={"status": "not_ready", "version_id": version_id})
    return {"status": "ready", "version_id": version_id, "sha256": sha256}


@app.post("/v1/predict")
def predict(body: PredictRequest, x_request_id: str | None = Header(default=None)):
    started = time.perf_counter()
    model = get_model(body)
    features = body.features
    label, probabilities = model.predict((features.sepal_length, features.sepal_width,
                                          features.petal_length, features.petal_width))
    return {"request_id": request_id(x_request_id), "version_id": body.version_id,
            "version": body.version, "prediction": label, "probabilities": probabilities,
            "inference_ms": round((time.perf_counter() - started) * 1000, 3)}
