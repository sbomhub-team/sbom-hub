#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
K8S_DIR="$ROOT_DIR/k8s"
TMP_DIR="$K8S_DIR/.rendered"

DOCKERHUB_USER="${DOCKERHUB_USER:-}"
TAG="${TAG:-latest}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"

if [[ -z "$DOCKERHUB_USER" ]]; then
  echo "Missing DOCKERHUB_USER"
  echo "Example: DOCKERHUB_USER=myuser TAG=v1 LETSENCRYPT_EMAIL=me@sbom-hub.com ./k8s/deploy-to-hetzner.sh"
  exit 1
fi

if [[ -z "$LETSENCRYPT_EMAIL" ]]; then
  echo "Missing LETSENCRYPT_EMAIL"
  echo "Example: DOCKERHUB_USER=myuser TAG=v1 LETSENCRYPT_EMAIL=me@sbom-hub.com ./k8s/deploy-to-hetzner.sh"
  exit 1
fi

BACKEND_IMAGE="$DOCKERHUB_USER/sbom-backend:$TAG"
FRONTEND_IMAGE="$DOCKERHUB_USER/sbom-frontend:$TAG"
SCANNER_IMAGE="$DOCKERHUB_USER/sbom-scanner:$TAG"

echo "Building and pushing images..."
docker build -t "$BACKEND_IMAGE" "$ROOT_DIR/sbom-backend"
docker push "$BACKEND_IMAGE"

docker build -t "$FRONTEND_IMAGE" "$ROOT_DIR/sbom-frontend"
docker push "$FRONTEND_IMAGE"

docker build -t "$SCANNER_IMAGE" "$ROOT_DIR/sbom-job"
docker push "$SCANNER_IMAGE"

rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"

cp "$K8S_DIR/00-namespace.yaml" "$TMP_DIR/"
cp "$K8S_DIR/01-storage.yaml" "$TMP_DIR/"
cp "$K8S_DIR/02-mongo.yaml" "$TMP_DIR/"
cp "$K8S_DIR/03-rbac.yaml" "$TMP_DIR/"
cp "$K8S_DIR/04-backend.yaml" "$TMP_DIR/"
cp "$K8S_DIR/05-frontend.yaml" "$TMP_DIR/"
cp "$K8S_DIR/06-ingress.yaml" "$TMP_DIR/"
cp "$K8S_DIR/07-cluster-issuer.yaml" "$TMP_DIR/"

sed -i.bak "s|REPLACE_WITH_YOUR_BACKEND_IMAGE|$BACKEND_IMAGE|g" "$TMP_DIR/04-backend.yaml"
sed -i.bak "s|REPLACE_WITH_YOUR_SCANNER_IMAGE|$SCANNER_IMAGE|g" "$TMP_DIR/04-backend.yaml"
sed -i.bak "s|REPLACE_WITH_YOUR_FRONTEND_IMAGE|$FRONTEND_IMAGE|g" "$TMP_DIR/05-frontend.yaml"
sed -i.bak "s|admin@sbom-hub.com|$LETSENCRYPT_EMAIL|g" "$TMP_DIR/07-cluster-issuer.yaml"
rm -f "$TMP_DIR"/*.bak

echo "Applying Kubernetes manifests..."
kubectl apply -f "$TMP_DIR/00-namespace.yaml"
kubectl apply -f "$TMP_DIR/01-storage.yaml"
kubectl apply -f "$TMP_DIR/02-mongo.yaml"
kubectl apply -f "$TMP_DIR/03-rbac.yaml"
kubectl apply -f "$TMP_DIR/04-backend.yaml"
kubectl apply -f "$TMP_DIR/05-frontend.yaml"
kubectl apply -f "$TMP_DIR/07-cluster-issuer.yaml"
kubectl apply -f "$TMP_DIR/06-ingress.yaml"

echo "Waiting for deployments..."
kubectl rollout status deployment/sbom-mongo -n sbom --timeout=180s
kubectl rollout status deployment/sbom-backend -n sbom --timeout=300s
kubectl rollout status deployment/sbom-frontend -n sbom --timeout=300s

echo "Deployment finished. Current status:"
kubectl get pods -n sbom
kubectl get svc -n sbom
kubectl get ingress -n sbom
