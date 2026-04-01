# sbom-frontend — Web Dashboard

React + Vite web interface for SBOM Hub.

## Features

- 🎨 **Modern UI** — Built with React and Tailwind CSS
- 📱 **Responsive** — Works on desktop and mobile
- 🔄 **Real-time Updates** — Connects to backend API
- 📊 **SBOM Visualization** — Browse deps, licenses, vulnerabilities
- ⚡ **Fast** — Vite for hot module replacement

## Development

```bash
npm install
npm run dev
# Opens http://localhost:5173
```

## Build for Production

```bash
npm run build
# Creates dist/ folder for serving
```

## Docker

```bash
docker build -t sbomhub/sbom-frontend .
docker run -p 80:80 sbomhub/sbom-frontend
```

## Configuration

The frontend connects to the backend API at:

```javascript
// src/api.js
const API_BASE = process.env.REACT_APP_API || '/api'
```

In Kubernetes, the ingress routes `/api` to the backend service and `/` to the frontend service.

## Kubernetes

See [k8s/05-frontend.yaml](../k8s/05-frontend.yaml) for deployment manifest.

The frontend runs as a static web server (Nginx in the Docker image) and the ingress handles routing.
