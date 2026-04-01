# SBOM Hub — Automatic Software Bill of Materials Generation

**SBOM Hub** is a cloud-based platform that automatically generates Software Bills of Materials (SBOM) in SPDX JSON format. It addresses the complexity of SBOM creation across different technologies and is motivated by the **EU Cyber Resilience Act (CRA)**, which mandates SBOMs by 2027.

## Features

- 🔄 **Automatic SBOM Generation** — Upload a project and get a complete SBOM
- 📊 **Analysis & Insights** — Detailed breakdowns of dependencies and security metadata
- 🎯 **Multiple Formats** — SPDX JSON output with structured insights
- 🖥️ **Web UI** — Interactive React-based dashboard
- 💻 **CLI Tool** — `sbomhub` command for terminal-based generation and reporting
- ☸️ **Cloud Ready** — Kubernetes-native deployment with automated scanning

---

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────┐
│                    User                                 │
├─────────────────────────────────────────────────────────┤
│ Browser (React UI) ←→ CLI Tool (Node.js)                │
└──────────────┬──────────────────────────────────────────┘
               │ HTTPS
┌──────────────▼──────────────────────────────────────────┐
│              sbom-backend (Node.js)                      │
│  • REST API for SBOM generation                         │
│  • Workspace management                                 │
│  • Kubernetes job orchestration                         │
└──────────────┬──────────────────────────────────────────┘
               │ triggers Docker image
┌──────────────▼──────────────────────────────────────────┐
│        sbom-scanner (Python + Syft)                     │
│  • Runs in Kubernetes as ephemeral jobs                 │
│  • Uses Syft for SBOM scanning                          │
│  • Analyzes project dependencies                        │
└──────────────┬──────────────────────────────────────────┘
               │ reads/writes
┌──────────────▼──────────────────────────────────────────┐
│         MongoDB + PVC Storage                           │
│  • Persists SBOM results and metadata                   │
│  • Shared workspace for scan jobs                       │
└─────────────────────────────────────────────────────────┘
```

### Services

| Service | Language | Purpose |
|---------|----------|---------|
| **sbom-frontend** | React + Vite | Web dashboard UI |
| **sbom-backend** | Node.js/Express | REST API & job orchestration |
| **sbom-scanner** | Python | SBOM generation via Syft |
| **sbom-cli** | Node.js | Command-line tool |

---

## Quick Start

### Prerequisites

- Docker & Docker Hub account
- Kubernetes cluster (or local `kubectl` for testing)
- Node.js 18+ (for local development)
- Git

### Local Development

#### 1. Clone and setup

```bash
git clone https://github.com/sbomhub-team/sbom-hub.git
cd sbom-hub

# Install frontend dependencies
cd sbom-frontend && npm install && cd ..

# Install backend dependencies
cd sbom-backend && npm install && cd ..
```

#### 2. Run locally (Docker Compose)

```bash
# From project root
docker-compose -f sbom-backend/docker-compose.yml up
docker-compose -f sbom-frontend/docker-compose.yml up
```

Services will be available at:
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000`

---

## CI/CD Pipeline

SBOM Hub uses **GitHub Actions** for automated building, testing, and deployment.

### Three Workflows

#### 1. **Deploy Scanner** (`→ sbomhub/sbom-scanner`)
- **Trigger**: Push to `sbom-job/**` or manual trigger
- **Steps**:
  1. Checkout repo
  2. Parse `secrets.SECRET` (bundled credentials)
  3. Build Docker image from `./sbom-job/Dockerfile`
  4. Push to Docker Hub as `sbomhub/sbom-scanner:tag` and `:latest`
  5. SSH into K8s cluster, update backend's `SCANNER_IMAGE` env var
  6. Wait for pod rollout to complete

#### 2. **Deploy Backend** (`→ sbomhub/sbom-backend`)
- **Trigger**: Push to `sbom-backend/**`, `k8s/04-backend.yaml`, or workflow file
- **Steps**:
  1. Checkout, parse secrets, generate short SHA tag
  2. Build multi-platform Docker image (`linux/amd64`)
  3. Push to Docker Hub as `sbomhub/sbom-backend:tag` and `:latest`
  4. SSH into K8s:
     - `kubectl set image` — rolling update of backend pods
     - `kubectl set env SCANNER_IMAGE=...` — ensure scanner image is known
     - `kubectl rollout status` — wait for pods to become ready (240s timeout)
     - `kubectl get pods` — verify final state

#### 3. **Deploy Frontend** (`→ sbomhub/sbom-frontend`)
- **Trigger**: Push to `sbom-frontend/**`, `k8s/05-frontend.yaml`, or workflow file
- **Steps**: Same as backend, but:
  - Builds `./sbom-frontend/` with Vite
  - Pushes as `sbomhub/sbom-frontend:tag`
  - Updates K8s `sbom-frontend` deployment

### Secret Configuration

Workflows read credentials from a single bundled GitHub secret named `SECRET`:

```
DOCKERHUB_USERNAME=sbomhub
DOCKERHUB_TOKEN=<your_pat>
SSH_HOST=37.27.196.84
SSH_USER=root
SSH_PORT=22
SSH_PRIVATE_KEY<<KEY
-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----
KEY
```

Set this in: **Settings → Secrets and variables → Actions → New repository secret**

### Testing the Pipeline

**Option A: Manual trigger**
```
GitHub → Actions → Choose workflow → Run workflow → main
```

**Option B: Auto-trigger via push**
```bash
cd sbom-hub
echo "# test" >> sbom-frontend/README.md
git add sbom-frontend/README.md
git commit -m "test: trigger CI"
git push origin main
```

Monitor at: **GitHub → Actions → [workflow name]**

---

## Kubernetes Deployment

### Full docs: [k8s/README.md](k8s/README.md)

Quick deploy:

```bash
# Set your config
export DOCKERHUB_USER=sbomhub
export TAG=v1.0.0
export LETSENCRYPT_EMAIL=your@email.com

# Deploy to Hetzner (or any cluster)
./k8s/deploy-to-hetzner.sh
```

Verify:

```bash
kubectl get pods -n sbom
kubectl logs -n sbom deploy/sbom-backend
```

---

## Project Structure

```
sbom-hub/
├── README.md                          # This file
├── .github/
│   └── workflows/
│       ├── deploy-scanner.yml         # Scanner CI/CD
│       ├── deploy-backend.yml         # Backend CI/CD
│       └── deploy-frontend.yml        # Frontend CI/CD
├── sbom-frontend/                     # React dashboard
│   ├── src/
│   ├── Dockerfile
│   └── package.json
├── sbom-backend/                      # Node.js API
│   ├── server.js
│   ├── Dockerfile
│   └── package.json
├── sbom-job/                          # Python scanner
│   ├── sbom_generator.py
│   └── Dockerfile
├── sbom-cli/                          # Terminal CLI
│   ├── package.json
│   └── bin/sbomhub.js
└── k8s/                               # Kubernetes manifests
    ├── 00-namespace.yaml
    ├── 02-mongo.yaml
    ├── 04-backend.yaml
    ├── 05-frontend.yaml
    ├── 06-ingress.yaml
    └── README.md                      # Deployment instructions
```

---

## Contributing

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/your-feature`)
3. **Commit** changes (`git commit -m "feat: add thing"`)
4. **Push** (`git push origin feature/your-feature`)
5. **Open a Pull Request**

All PRs trigger the CI pipeline automatically.

---

## License & Attribution

This project is a thesis project by the **SBOMHub Team**:
- Elahm Rastighahfarokhi
- Mehdi Nourivahid
- Mostafa Sharghi

Motivated by the **EU Cyber Resilience Act (CRA)**.

---

## Links

- 🔗 **Live Demo**: https://sbom-hub.com
- 📚 **SPDX Spec**: https://spdx.dev
- 🏴‍☠️ **Syft (scanner)**: https://github.com/anchore/syft
- ☸️ **Kubernetes**: https://kubernetes.io