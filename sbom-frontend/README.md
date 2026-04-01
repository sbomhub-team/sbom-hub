# sbom-frontend — Web Dashboard

The frontend service provides the user-facing web interface for SBOM Hub.

## Features

- Interactive web dashboard for project uploads
- Real-time SBOM visualization
- Dependency and license information display
- Download SBOM in SPDX JSON format
- Responsive design for desktop and mobile

## Cloud Deployment

This service is deployed as a Kubernetes Deployment in the `sbom` namespace. See [k8s/05-frontend.yaml](../k8s/05-frontend.yaml) for deployment configuration.

The service is exposed through an Ingress that:
- Routes requests to the Kubernetes Service
- Handles HTTPS/TLS via cert-manager
- Proxies `/api` requests to the backend service
- Serves static assets for the React dashboard

The frontend connects to the backend API at `/api` endpoint as configured in the Kubernetes Ingress rules.

