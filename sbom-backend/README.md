# sbom-backend — REST API

The backend service provides the REST API for SBOM Hub and orchestrates scanning jobs on Kubernetes.

## Functionality

- REST API for SBOM generation requests
- Workspace and project management
- Kubernetes Job orchestration for scanner pods
- MongoDB integration for persistent storage
- Environment-based configuration for scanner image selection

## Cloud Deployment

This service is deployed as a Kubernetes Deployment in the `sbom` namespace. See [k8s/04-backend.yaml](../k8s/04-backend.yaml) for deployment configuration.

The service requires:
- Kubernetes API access (RBAC configured)
- MongoDB connection
- Persistent volume for shared workspace
- `SCANNER_IMAGE` environment variable pointing to the scanner image

