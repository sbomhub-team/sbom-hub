# sbom-scanner — SBOM Generation Service

The scanner service generates Software Bills of Materials (SBOM) for uploaded projects.

## Purpose

- Analyzes project structure and dependencies
- Generates SPDX JSON format SBOM output
- Runs as ephemeral Kubernetes Jobs (one job per scan)
- Processes projects from shared workspace storage

## Cloud Deployment

The backend service creates a Kubernetes Job for each scan request, using this image as the container:

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
        image: sbomhub/sbom-scanner:latest
        volumeMounts:
        - name: workspace
          mountPath: /workspace
```

The Job:
- Receives project files from the shared workspace PVC
- Generates SBOM analysis
- Writes results back to the workspace
- Exits upon completion
- Is automatically cleaned up by Kubernetes garbage collection

No manual scanning or configuration is required. All scanning is orchestrated automatically by the backend service.

