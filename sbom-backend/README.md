# sbom-backend — REST API & Orchestration

Node.js/Express backend service that provides:

- **REST API** — POST project files to `/api/scan` for SBOM generation
- **Workspace Management** — Stores upload history and results in MongoDB
- **Kubernetes Job Orchestration** — Spawns `sbom-scanner` pod for each scan
- **Environment Config** — Reads `SCANNER_IMAGE` env var to know which scanner Docker image to run

## Development

```bash
npm install
npm start
# Server listens on :3000
```

## Docker

```bash
docker build -t sbomhub/sbom-backend .
docker run -e SCANNER_IMAGE=sbomhub/sbom-scanner:latest sbomhub/sbom-backend
```

## Kubernetes

See [k8s/04-backend.yaml](../k8s/04-backend.yaml) for deployment manifest.

The backend pod needs:
- `SCANNER_IMAGE` env var set to the scanner image tag
- Access to Kubernetes API (RBAC configured in `k8s/03-rbac.yaml`)
- MongoDB connection (address from `k8s/02-mongo.yaml`)
- Shared PVC for workspace `/app/workspace`
