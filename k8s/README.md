# Kubernetes Deployment (sbom-hub.com)

This folder contains production manifests for running the platform on Kubernetes.

## Why it may not run yet

- Kubernetes cannot pull images if they were not pushed to Docker Hub or another registry.
- `k8s/04-backend.yaml` and `k8s/05-frontend.yaml` include image placeholders that must be replaced.
- MongoDB is required and is included in `k8s/02-mongo.yaml`, but it must be applied in the cluster.
- Ingress and DNS must point to your ingress public IP for `sbom-hub.com` and `www.sbom-hub.com`.

## 1. Build and push images

Replace image placeholders in:
- `k8s/04-backend.yaml`
- `k8s/05-frontend.yaml`

Example tags:
- `registry.example.com/sbom/backend:1.0.0`
- `registry.example.com/sbom/frontend:1.0.0`
- `registry.example.com/sbom/scanner:1.0.0`

## 2. Apply manifests

```bash
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01-storage.yaml
kubectl apply -f k8s/02-mongo.yaml
kubectl apply -f k8s/03-rbac.yaml
kubectl apply -f k8s/04-backend.yaml
kubectl apply -f k8s/05-frontend.yaml
kubectl apply -f k8s/07-cluster-issuer.yaml
kubectl apply -f k8s/06-ingress.yaml
```

## One-command deploy

Run this from the project root on your master node:

DOCKERHUB_USER=yourdockerhub TAG=v1 LETSENCRYPT_EMAIL=you@sbom-hub.com ./k8s/deploy-to-hetzner.sh

## 3. DNS

Point both records to your ingress load balancer IP:
- `sbom-hub.com`
- `www.sbom-hub.com`

## 4. Verify

```bash
kubectl get pods -n sbom
kubectl get svc -n sbom
kubectl get ingress -n sbom
kubectl logs -n sbom deploy/sbom-backend
```

TLS checks:

```bash
kubectl get clusterissuer
kubectl describe certificate -n sbom
kubectl get secret -n sbom | grep tls
```

## Notes

- Frontend now calls `/api` by default, so ingress path routing is required.
- Backend is configured for Kubernetes job mode (`USE_K8S=true`) and shared workspace PVC.
- Update `email` in `k8s/07-cluster-issuer.yaml` before applying.
- cert-manager and ingress-nginx must already be installed in your cluster.
