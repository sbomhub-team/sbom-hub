# sbom-cli — Command-Line Interface

Node.js CLI tool for SBOM Hub, enabling terminal-based SBOM generation and management.

## Installation

```bash
npm install -g sbomhub
# or
npm install sbomhub
```

## Usage

```bash
sbomhub scan /path/to/project
sbomhub list                    # View past scans
sbomhub download <scan-id>      # Download SBOM as JSON/SPDX
sbomhub analyze <scan-id>       # Show dependency insights
```

## Development

```bash
npm install
npm link  # Makes `sbomhub` command globally available locally

sbomhub --help
```

## Build

```bash
npm run build
npm publish  # to npm registry
```

## Configuration

The CLI reads the API endpoint from:

```bash
SBOMHUB_API=http://localhost:3000 sbomhub scan ...
# or ~/.sbomhub/config.json
```

## Entrypoint

- Primary: `bin/sbomhub.js`
- Communicates with backend API (REST)
- Generates local SBOM reports and downloads

See `package.json` for available npm scripts.
