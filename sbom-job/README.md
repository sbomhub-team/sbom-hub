# sbom-job — Scanner Image

Python-based SBOM scanner that runs as a Kubernetes job per scan request.

## Purpose

- Receives a project as input (file upload via shared PVC)
- Uses **Syft** CLI to analyze dependencies
- Generates SPDX JSON SBOM output
- Returns results to shared workspace for backend to retrieve

## Components

- **sbom_generator.py** — Main entry point, orchestrates scanning
- **Dockerfile** — Builds image with Python 3.11, Syft, and dependencies

## Docker

```bash
docker build -t sbomhub/sbom-scanner .
docker run -v /host/workspace:/app/workspace sbomhub/sbom-scanner
```

## Kubernetes

The backend (`sbom-backend`) spawns this image dynamically as a Job:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: sbom-scan-{{uuid}}
spec:
  template:
    spec:
      containers:
      - name: scanner
        image: sbomhub/sbom-scanner:latest  # or specific tag
        env:
        - name: PROJECT_PATH
          value: /workspace/{{uuid}}/project
        volumeMounts:
        - name: workspace
          mountPath: /workspace
```

## Build & Deploy

Pushed to Docker Hub via CI/CD:

```bash
git push sbom-job/**  # Triggers GitHub Actions → builds & pushes sbomhub/sbom-scanner
```

Backend is notified via `kubectl set env SCANNER_IMAGE=sbomhub/sbom-scanner:{{tag}}`.
