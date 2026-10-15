"""Train two reproducible sklearn Iris classifiers and export inert JSON coefficients."""

import argparse
import hashlib
import json
import math
from pathlib import Path

from sklearn.datasets import load_iris
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

FEATURE_NAMES = ["sepal_length", "sepal_width", "petal_length", "petal_width"]
CLASS_NAMES = ["setosa", "versicolor", "virginica"]


def train(output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    iris = load_iris()
    x_train, x_test, y_train, y_test = train_test_split(
        iris.data, iris.target, test_size=0.25, stratify=iris.target, random_state=42
    )
    for version, regularization in (("v1", 0.5), ("v2", 5.0)):
        pipeline = make_pipeline(StandardScaler(), LogisticRegression(C=regularization, max_iter=1000, random_state=42))
        pipeline.fit(x_train, y_train)
        scaler: StandardScaler = pipeline.named_steps["standardscaler"]
        classifier: LogisticRegression = pipeline.named_steps["logisticregression"]
        artifact = {
            "schemaVersion": 1,
            "model": {
                "type": "sklearn_iris_logistic_regression",
                "featureNames": FEATURE_NAMES,
                "classes": CLASS_NAMES,
                "coefficients": classifier.coef_.tolist(),
                "intercepts": classifier.intercept_.tolist(),
                "mean": scaler.mean_.tolist(),
                "scale": scaler.scale_.tolist(),
            },
        }
        for sample, sklearn_class in zip(x_test, pipeline.predict(x_test)):
            scaled = [(float(sample[i]) - artifact["model"]["mean"][i]) / artifact["model"]["scale"][i] for i in range(4)]
            scores = [sum(weight * scaled[i] for i, weight in enumerate(row)) + artifact["model"]["intercepts"][j]
                      for j, row in enumerate(artifact["model"]["coefficients"])]
            exported_class = max(range(3), key=lambda index: scores[index])
            if exported_class != sklearn_class or not all(math.isfinite(score) for score in scores):
                raise RuntimeError("Exported coefficients do not reproduce scikit-learn predictions")
        contents = (json.dumps(artifact, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")
        destination = output_dir / f"iris-{version}.json"
        destination.write_bytes(contents)
        print(f"{version}: accuracy={pipeline.score(x_test, y_test):.4f} sha256={hashlib.sha256(contents).hexdigest()} path={destination}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=Path("var/trained"))
    train(parser.parse_args().output_dir)
