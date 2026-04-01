# ---- Stage 1: get Syft binary ----
FROM anchore/syft:latest AS syft

# ---- Stage 2: main image ----
FROM python:3.11-slim

# Use HTTPS for Debian repos and install git + unzip
RUN apt-get update \
 && apt-get install -y git unzip curl \
 && rm -rf /var/lib/apt/lists/*

# Copy Syft binary from Anchore image
COPY --from=syft /syft /usr/local/bin/syft

# Set working directory
WORKDIR /app

# Copy the SBOM generator Python script
COPY sbom_generator.py .

# Default command
ENTRYPOINT ["python", "sbom_generator.py"]
