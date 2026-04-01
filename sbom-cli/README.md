# sbom-cli — Command-Line Interface

Command-line tool for interacting with SBOM Hub from the terminal.

## Features

- Scan projects for SBOM generation
- View scan history
- Download SBOM results in JSON format
- Analyze dependency information
- Generate detailed reports

## Usage

```bash
sbomhub scan <project-path>
sbomhub list
sbomhub download <scan-id>
sbomhub analyze <scan-id>
sbomhub report <scan-id>
```

## Configuration

Configure the SBOM Hub server endpoint:

```bash
export SBOMHUB_API=https://your-sbom-hub-instance.com
sbomhub scan /path/to/project
```

Or create a configuration file at `~/.sbomhub/config.json`:

```json
{
  "api": "https://your-sbom-hub-instance.com",
  "timeout": 300
}
```

## Cloud Deployment

The CLI communicates with a deployed SBOM Hub instance via REST API. Point it to your cloud-hosted SBOM Hub deployment to use all features.

