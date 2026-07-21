# GeoDBManager

A professional, Docker-based web application for managing **Esri File Geodatabases** (.gdb).

## Features

- 🗄 Browse GDB tree: datasets → feature classes
- ✏️ Rename feature classes and datasets
- ➕ Add fields (with type, width, nullable, default value)
- ✏️ Rename fields
- 🗑 Delete fields
- ⚡ **Bulk operations**: add/rename/delete fields across all features in a dataset in one click
- 🔍 Filter fields by name/type
- 📊 Live operation results with success/fail breakdown

## Quick Start

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running

### Run

```bash
# Clone / navigate to project directory
cd GeoDBManager

# Build and start (first run takes ~2 minutes to download GDAL image)
docker compose up --build

# Open your browser
start http://localhost:8000
```

### Using your own GDB files

Place any `.gdb` folder inside `input_sample/` — they will be automatically detected and listed in the app.

```
GeoDBManager/
└── input_sample/
    ├── sample.gdb        ← already here
    └── my_project.gdb    ← add yours here
```

## Tech Stack

| Layer | Technology |
|---|---|
| Container | Docker + Docker Compose |
| Backend | Python 3.11, FastAPI, GDAL 3.8 (OpenFileGDB driver) |
| GDB Engine | GDAL/OGR (no ArcGIS license required) |
| Frontend | Vanilla HTML5 / CSS3 / JavaScript ES2022 modules |

## API Documentation

Interactive Swagger docs available at: http://localhost:8000/api/docs

## Development

```bash
# Rebuild after code changes
docker compose up --build

# View logs
docker compose logs -f

# Stop
docker compose down
```
