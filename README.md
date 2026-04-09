# SBOM Hub — Automatic Software Bill of Materials Generation

# SBOM Hub 

Is a cloud-native platform that automatically generates Software Bills of Materials (SBOM) in SPDX JSON format. It addresses the complexity of SBOM creation across different technologies and is motivated by the **EU Cyber Resilience Act (CRA)**, which mandates SBOMs by 2027.


---

## Overview

SBOM Hub is a service-oriented system designed to automate the generation of SBOMs from different input sources such as GitHub repositories and ZIP files.  

The platform leverages cloud-native technologies to ensure scalability, automation, and reliability in real-world environments.

---

## Key Features

- Automated SBOM generation (no manual intervention)
- Supports multiple input types:
  - GitHub repositories
  - ZIP files
- Outputs:
  - SPDX JSON (standard format)
  - Human-readable TXT reports
- Kubernetes-based job execution (ephemeral Pods)
- Real-time job status tracking
- Authentication system (login/signup)
- CI/CD integration using GitHub Actions
- Cloud-native architecture

---

## System Architecture

The system follows a cloud-native, distributed architecture:

- **Frontend**: React-based dashboard (React + Vite)
- **Backend**: Node.js + Express API  
- **Scanner**: Python + Syft (SBOM generation)  
- **Orchestration**: Kubernetes Jobs  
- **Storage**:
  - PVC (temporary data exchange)
  - MongoDB (final data storage)  
- **CI/CD**: GitHub Actions  
- **Deployment**: Kubernetes cluster (Hetzner)

---

## Workflow

1. User submits a project (GitHub URL or ZIP)
2. Backend validates input
3. Kubernetes Job is created
4. Scanner Pod runs SBOM generation
5. Output is written to shared PVC
6. Backend reads results and stores them in MongoDB
7. User retrieves SBOM and report

---

## Technologies Used

| Component         | Technology            | Description                                   |
|------------------|---------------------|-----------------------------------------------|
| Frontend         | React + Vite        | Web dashboard, served via Nginx               |
| Backend          | Node.js + Express   | REST API and system orchestration             |
| Scanner          | Python + Syft       | Runs as ephemeral Kubernetes Jobs             |
| Containerization | Docker              | Packaging and environment consistency         |
| Orchestration    | Kubernetes          | Job execution, scaling, and resource management|
| Database         | MongoDB + PVC       | Persistent storage for results and metadata   |
| CI/CD            | GitHub Actions      | Automated build and deployment pipelines      |
| Infrastructure   | Hetzner Cloud       | Cloud environment for Kubernetes cluster      |
| CLI              | Node.js             | Command-line interface for terminal users     |

---

## CI/CD Pipeline

The project uses GitHub Actions to automate:

- Build process
- Docker image creation
- Deployment to Kubernetes

This ensures:
- Faster updates
- Reduced human errors
- Consistent deployments

---

## Evaluation

The system was evaluated based on:

- Execution time
- CPU and memory usage
- Concurrency (parallel job handling)

Results show that the system performs efficiently and scales well in real-world conditions.

---

## Thesis Information

- Program: Smart IoT Systems and Networking  
- University: Metropolia UAS  
- Collaboration: Nokia (SBOM-QA Project)  
- Year: 2025–2026  

---

## Related Project

- SBOM-QA Benchmarking Project:  
  https://nokia.github.io/SBOM-QA/

---

## Future Work

- Support for additional tools (ORT , SCANOSS)
- Advanced vulnerability analysis
- Improved ecosystem detection
- Enhanced dashboard for analytics

---

## License

This project is developed for academic purposes.  
License details can be added based on future use.

---

## Authors & Supervisors

Authors: **Elham Rastighahfarokhi** & **Mehdi Nourivahid** & **Mostafa Sharghi** 
Metropolia University of Applied Sciences  
Supervisor: **Markku Niiranen**
Technical lead: **Gergely Csatari**

---

## References

- SPDX Specification: https://spdx.dev
- Syft Scanner: https://github.com/anchore/syft
- Kubernetes: https://kubernetes.io
- EU Cyber Resilience Act (CRA): https://www.europarl.europa.eu
