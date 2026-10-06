# HeightNet in Docker

Docker runs the Python API, the main React workspace, and the Three.js viewer
in one container. Map acquisition is part of the workspace. Large data and
model files stay on the host and are mounted into the container.

## Requirements

- Docker Desktop with Docker Compose
- Internet access for map tiles, place search, Sentinel-2 STAC access, and the
  first model dependency download
- Enough disk space for the Python/PyTorch image and any local datasets

## Start it

From the repository root:

```powershell
docker compose up --build
```

Open these pages in a browser:

```text
http://localhost:8000/           main HeightNet workspace
http://localhost:8000/workspace/ main workspace route
http://localhost:8000/viewer/    generated OBJ terrain viewer
```

The API health check is:

```text
http://localhost:8000/api/health
```

Stop the container with:

```powershell
docker compose down
```

## Add the model and data

The image deliberately does not contain GAMUS, Sentinel-2 scenes, checkpoints,
or generated outputs. Put them in the normal repository folders on the host:

```text
data/gamus_raw/                 GAMUS RGB, AGL, and class files
data/gamus_raw/checkpoints/     trained .pt files
data/inputs/                    uploaded RGB and coarse ground files
data/references/                LiDAR, reference DSM, or GCP files
data/outputs/                   generated GeoTIFFs and meshes
```

The container sees the same paths under `/app/data` automatically.

For example, after placing the trained files on the host, a model run can be
started inside the running container with:

```powershell
docker compose exec heightnet python scripts/run_pipeline.py `
  --input data/inputs/scene_rgb.tif `
  --checkpoint data/gamus_raw/checkpoints/depth_anything_v2_gamus_fulltrain_epoch3_stable.pt `
  --sure-calibration-report reports/sure_cal_256res_calibration.json `
  --semantic-checkpoint data/gamus_raw/checkpoints/gamus_semantic_head_fulltrain_epoch1.pt `
  --ground data/inputs/coarse_ground.tif `
  --output-dir data/outputs/demo `
  --output-prefix heightnet_scene_01
```

The output remains on the host under `data/outputs/demo`.

## Download data through the container

These commands use the same mounted host folders as the web portal:

```powershell
docker compose run --rm heightnet python scripts/download_gamus_subset.py `
  --split train `
  --count 20 `
  --workers 8
```

Sentinel-2 acquisition is normally done from the map portal. The command-line
form is also available when an item URL is known:

```powershell
docker compose run --rm heightnet python scripts/download_sentinel2.py `
  --item-url "https://planetarycomputer.microsoft.com/api/stac/v1/collections/sentinel-2-l2a/items/ITEM_ID" `
  --output data/inputs/scene_rgb.tif
```

If Hugging Face asks for authentication, create a `.env` file beside
`docker-compose.yml`:

```text
HF_TOKEN=your_token_here
```

Do not commit that file.

## Rebuild after code changes

```powershell
docker compose build --no-cache
docker compose up
```

The container is CPU-ready. GPU execution needs a separate NVIDIA Container
Toolkit setup and a CUDA-compatible PyTorch base image; it is not required for
the current demo workflow.
