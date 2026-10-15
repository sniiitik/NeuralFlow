FROM python:3.11-slim AS runtime
WORKDIR /service
ENV PYTHONPATH=/service
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
USER 65532:65532
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM python:3.11-slim AS trainer
WORKDIR /service
COPY requirements-train.txt ./
RUN pip install --no-cache-dir -r requirements-train.txt
COPY train_iris.py ./
CMD ["python", "train_iris.py", "--output-dir", "/output"]

FROM runtime AS test
USER root
COPY requirements-test.txt ./
RUN pip install --no-cache-dir -r requirements-test.txt
COPY tests ./tests
CMD ["pytest", "-q", "tests"]
