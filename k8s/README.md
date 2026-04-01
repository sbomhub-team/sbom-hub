# Kubernetes Deployment

This folder contains the Kubernetes manifests for deploying SBOM Hub on a production cluster.

## Prerequisites

Before deploying, ensure your cluster has:

- Kubernetes 1.20 or later
- cert-manager installed and configured
- ingress-nginx installed and configured
- Persistent volume provisioner (for MongoDB and workspace storage)
- Access to a container registry

## Deployment Order

The manifests must be applied in order:

```bash
# 1. Namespace and storage
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01-storage.yaml

# 2. Database
kubectl apply -f k8s/02-mongo.yaml

# 3. RBAC and permissions
kubectl apply -f k8s/03-rbac.yaml

# 4. Services and deployments
kubectl apply -f k8s/04-backend.yaml
kubectl apply -f k8s/05-frontend.yaml

# 5. TLS and ingress
kubectl apply -f k8s/07-cluster-issuer.yaml
kubectl apply -f k8s/06-ingress.yaml
```

## Configuration

Before applying the manifests, update the following:

### 1. Container Images

Update image references in `k8s/04-backend.yaml` and `k8s/05-frontend.yaml` to point to your container registry:

```yaml
image: your-registry/sbom-backend:v1.0.0
image: your-registry/sbom-frontend:v1.0.0
image: your-registry/sbom-scanner:v1.0.0
```

### 2. TLS Certificate

Edit `k8s/07-cluster-issuer.yaml` and set your email address for Let's Encrypt:

```yaml
spec:
  acme:
    email: your-email@example.com
```

### 3. Domain and Ingress

Edit `k8s/06-ingress.yaml` and configure:

```yaml
hosts:
  - host: your-domain.com
    paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: sbom-frontend
            port:
              number: 80
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: sbom-backend
            port:
              number: 3000
```

Point your DNS records to the Ingress LoadBalancer IP after deployment.

## Verification

After deployment, verify all components are running:

```bash
# Check pods
kubectl get pods -n sbom

# Check services
kubectl get svc -n sbom

# Check ingress
kubectl get ingress -n sbom

# View logs
kubectl logs -n sbom -l app=sbom-backend
kubectl logs -n sbom -l app=sbom-frontend

# Check TLS certificate status
kubectl describe certificate -n sbom
kubectl get secret -n sbom | grep tls
```

## Storage

The deployment includes:

- **MongoDB StatefulSet** - Persistent database for project data and results
- **Workspace PVC** - Shared storage for scan jobs and intermediate files

Both are configured with persistent volumes. Ensure your cluster has adequate storage capacity.

## Scaling

To adjust replica counts:

```bash
kubectl scale deployment/sbom-backend -n sbom --replicas=3
kubectl scale deployment/sbom-frontend -n sbom --replicas=2
```

Scanner jobs scale automatically based on demand - one job is created per scan request.

## Troubleshooting

### Pods not starting

```bash
kubectl describe pod <pod-name> -n sbom
kubectl logs <pod-name> -n sbom
```

### Ingress not routing

Verify the ingress controller is running:

```bash
kubectl get pods -n ingress-nginx
```

### Storage issues

Check PVC status:

```bash
kubectl get pvc -n sbom
kubectl describe pvc <pvc-name> -n sbom
```

### TLS certificates

Check certificate renewal:

```bash
kubectl describe certificate -n sbom
kubectl get clusterissuer
```

## Security Notes

- All traffic is encrypted with TLS
- Container images should be pulled from a secure, private registry
- Sensitive configuration is stored in Kubernetes Secrets
- RBAC policies restrict access to API resources
- Storage is encrypted at the cluster level

## Maintenance

### Backup MongoDB

```bash
kubectl exec -n sbom sbom-mongo-0 -- mongodump --out /backup
kubectl cp sbom/sbom-mongo-0:/backup ./mongo-backup
```

### Clean up scan jobs

Completed scan jobs are automatically cleaned up by Kubernetes. To manually clean:

```bash
kubectl delete jobs -n sbom --field-selector status.successful=1
```

### Rolling updates

Rolling updates are automatic when container images change. Monitor with:

```bash
kubectl rollout status deployment/sbom-backend -n sbom
```

