# SBOM Hub — Automatic Software Bill of Materials Generation

**SBOM Hub** is a cloud-based platform that automatically generates Software Bills of Materials (SBOM) in SPDX JSON format. It addresses the complexity of SBOM creation across different technologies and is motivated by the **EU Cyber Resilience Act (CRA)**, which mandates SBOMs by 2027.

## Features

- **Automatic SBOM Generation** — Upload a project and get a complete SBOM
- **Analysis & Insights** — Detailed breakdowns of dependencies and security metadata
- **Multiple Formats** — SPDX JSON output with structured insights
- **Web UI** — Interactive React-based dashboard
- **CLI Tool** — `sbomhub` command for terminal-based generation and reporting
- **Cloud Native** — Kubernetes-native deployment with automated scanning

---

## Architecture

SBOM Hub is a distributed cloud-native platform designed to run on Kubernetes:

```
┌─────────────────────────────────────────────────────────┐
│                  End User                               │
├─────────────────────────────────────────────────────────┤
│ Web Browser or CLI Tool (Node.js)                       │
└──────────────┬──────────────────────────────────────────┘
               │ HTTPS to Ingress
┌──────────────▼──────────────────────────────────────────┐
│         SBOM Hub Backend (Kubernetes)                   │
│  REST API for SBOM generation                          │
│  Workspace management                                   │
│  Kubernetes job orchestration                           │
└──────────────┬──────────────────────────────────────────┘
               │ spawns Jobs
┌──────────────▼──────────────────────────────────────────┐
│    SBOM Scanner Pod (Ephemeral, Per-Request)            │
│  Python + Syft for dependency analysis                 │
│  Generates SPDX JSON SBOM                              │
└──────────────┬──────────────────────────────────────────┘
               │ persists to
┌──────────────▼──────────────────────────────────────────┐
│      MongoDB + Persistent Volume Storage                │
│  Results, metadata, and user projects                  │
└─────────────────────────────────────────────────────────┘
```

### Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Frontend | React + Vite | Web dashboard UI (served via Nginx) |
| Backend | Node.js/Express | REST API & Kubernetes job orchestration |
| Scanner | Python + Syft | SBOM generation (runs as ephemeral K8s Jobs) |
| CLI | Node.js | Command-line interface for terminal users |
| Data | MongoDB + PVC | Persistent storage for results and projects |

---

## Usage

### Web Dashboard

Visit the SBOM Hub dashboard UI, upload your project, and download the SBOM JSON.

### Command-Line Interface

```bash
sbomhub scan /path/to/project
sbomhub list
sbomhub download <scan-id>
```

---

## Cloud-Native Deployment

SBOM Hub is designed to run on Kubernetes clusters. All deployment manifests are provided in `k8s/` directory.

### Quick Deploy

See [k8s/README.md](k8s/README.md) for complete deployment instructions.

Requirements:
- Kubernetes cluster (1.20+)
- cert-manager (for TLS)
- ingress-nginx (for routing)
- Persistent volumes for MongoDB and workspace storage

### Deployment Flow

1. Docker images are automatically built and pushed to the registry via CI/CD
2. Kubernetes manifests define services, deployments, storage, and ingress
3. Deploy all manifests to activate the platform
4. Users connect via the web dashboard or CLI

---

## CI/CD Pipeline (Internal)

SBOM Hub uses GitHub Actions for automated image building and deployment. The source code is proprietary and available only to the development team.

### Automated Workflows

Three workflows orchestrate the build and deployment pipeline:

1. **Deploy Scanner** — Builds the Syft-based SBOM scanner image
2. **Deploy Backend** — Builds the REST API and orchestration service
3. **Deploy Frontend** — Builds the React web dashboard

All images are pushed to Docker Hub and automatically updated in the Kubernetes cluster.

---

## Project Structure

```
sbom-hub/
├── README.md                          # This file
├── k8s/                               # Kubernetes deployment manifests
│   ├── 00-namespace.yaml
│   ├── 01-storage.yaml
│   ├── 02-mongo.yaml
│   ├── 03-rbac.yaml
│   ├── 04-backend.yaml
│   ├── 05-frontend.yaml
│   ├── 06-ingress.yaml
│   ├── 07-cluster-issuer.yaml
│   ├── deploy-to-hetzner.sh
│   └── README.md
├── .github/
│   └── workflows/                     # Automated CI/CD (internal)
│       ├── deploy-scanner.yml
│       ├── deploy-backend.yml
│       └── deploy-frontend.yml
└── Source code directories            # Proprietary, not available publicly
```

---

## Security & Privacy

- SBOM Hub is a **closed-source** commercial platform
- Source code is available only to authorized team members
- All deployments use HTTPS with Let's Encrypt TLS
- Projects and results are stored in encrypted persistent volumes
- Scanning jobs run in isolated, ephemeral Kubernetes pods
- No data is shared with third parties

---

## Support & Licensing

For deployment, licensing, or technical support, contact the SBOM Hub team.

---

## Attribution

SBOM Hub is developed by the **SBOMHub Team**:
- Elahm Rastighahfarokhi
- Mehdi Nourivahid
- Mostafa Sharghi

---

## References

- SPDX Specification: https://spdx.dev
- Syft Scanner: https://github.com/anchore/syft
- Kubernetes: https://kubernetes.io
- EU Cyber Resilience Act (CRA): https://www.europarl.europa.eu

---

## Links

- 🔗 **Live Demo**: https://sbom-hub.com
- 📚 **SPDX Spec**: https://spdx.dev
- 🏴‍☠️ **Syft (scanner)**: https://github.com/anchore/syft
- ☸️ **Kubernetes**: https://kubernetes.io