#!/bin/bash

# SBOM Frontend - Quick Commands Reference
# Use these commands to manage your application

set -e

COLOR_GREEN='\033[0;32m'
COLOR_BLUE='\033[0;34m'
COLOR_YELLOW='\033[1;33m'
COLOR_RED='\033[0;31m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${COLOR_BLUE}=== $1 ===${NC}"
}

print_success() {
    echo -e "${COLOR_GREEN}✓ $1${NC}"
}

print_info() {
    echo -e "${COLOR_YELLOW}ℹ $1${NC}"
}

print_error() {
    echo -e "${COLOR_RED}✗ $1${NC}"
}

# Get command from arguments
COMMAND=${1:-help}

case $COMMAND in
    build)
        print_header "Building Docker Image"
        docker build -t sbom-frontend:latest .
        print_success "Image built: sbom-frontend:latest"
        docker images | grep sbom-frontend
        ;;
    
    run)
        print_header "Starting Container"
        docker run -d --name sbom-frontend -p 3000:3000 sbom-frontend:latest
        sleep 2
        print_success "Container started on http://localhost:3000"
        docker ps | grep sbom-frontend || true
        ;;
    
    compose-up)
        print_header "Starting with Docker Compose"
        docker-compose up -d
        sleep 2
        print_success "Application running on http://localhost:3000"
        docker-compose ps
        ;;
    
    compose-down)
        print_header "Stopping Docker Compose"
        docker-compose down
        print_success "Stopped"
        ;;
    
    logs)
        print_header "Viewing Container Logs"
        docker logs -f sbom-frontend
        ;;
    
    stop)
        print_header "Stopping Container"
        docker stop sbom-frontend || true
        docker rm sbom-frontend || true
        print_success "Container stopped"
        ;;
    
    clean)
        print_header "Cleaning Up Docker Resources"
        docker stop sbom-frontend || true
        docker rm sbom-frontend || true
        docker image rm sbom-frontend:latest || true
        print_success "Cleaned up"
        ;;
    
    k8s-deploy)
        print_header "Deploying to Kubernetes"
        kubectl apply -f k8s-deployment.yaml
        sleep 2
        print_success "Deployment created"
        kubectl get all -n sbom
        ;;
    
    k8s-status)
        print_header "Kubernetes Deployment Status"
        kubectl get deployments -n sbom
        kubectl get pods -n sbom
        kubectl get svc -n sbom
        ;;
    
    k8s-logs)
        print_header "Kubernetes Pod Logs"
        kubectl logs -n sbom -l app=sbom-frontend -f
        ;;
    
    k8s-delete)
        print_header "Deleting Kubernetes Namespace"
        kubectl delete namespace sbom
        print_success "Namespace deleted"
        ;;
    
    list)
        print_header "Available Commands"
        echo "
Development:
  ./manage.sh build          - Build Docker image
  ./manage.sh run            - Run container

Docker Compose:
  ./manage.sh compose-up     - Start with Docker Compose
  ./manage.sh compose-down   - Stop Docker Compose
  ./manage.sh logs           - View container logs
  ./manage.sh stop           - Stop container
  ./manage.sh clean          - Remove all Docker resources

Kubernetes:
  ./manage.sh k8s-deploy     - Deploy to Kubernetes
  ./manage.sh k8s-status     - Check deployment status
  ./manage.sh k8s-logs       - View pod logs
  ./manage.sh k8s-delete     - Delete deployment

Other:
  ./manage.sh list           - Show this help message
  ./manage.sh help           - Show this help message
        "
        ;;
    
    help)
        print_header "SBOM Frontend Management"
        echo "
Usage: ./manage.sh [command]

Quick Start:
  1. Build image:      ./manage.sh build
  2. Run locally:      ./manage.sh run
  3. Access:          http://localhost:3000

For more info, run:   ./manage.sh list
        "
        ;;
    
    *)
        print_error "Unknown command: $COMMAND"
        echo "Run './manage.sh list' for available commands"
        exit 1
        ;;
esac
