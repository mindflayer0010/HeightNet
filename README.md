# HeightNet

HeightNet takes one remote sensing RGB image and turns it into a height map
and a textured 3D terrain scene.

It has two input modes:

- PNG or JPG: produces relative height. This has no real world metre scale.
- GeoTIFF: keeps the map location, uses a coarse ground elevation file, and
  produces an experimental metric DSM.

This is the working research prototype for SIH Problem Statement 26175.

## Demo use case

Use case shown in the demo:

- Search for a place on the map.
- Select a small area of interest.
- Fetch a real Sentinel-2 RGB GeoTIFF for that area.
- Run HeightNet to generate relative depth, AGL height, DSM, confidence, and a textured 3D terrain.
- Compare captures from different dates when Sentinel-2 scenes are available.
- Inspect the output in the browser workspace, export GeoTIFF/OBJ files, open the layers in QGIS, and validate against LiDAR DSM or GCP CSV data when reference data is available.

Reference demonstration video:

- YouTube: `PASTE_FINAL_YOUTUBE_LINK_HERE`

## Start here

Read these files in this order:

1. `GETTING_STARTED.md` is the copy and paste guide for a fresh repo pull.
2. `DATA_AND_MODELS.md` explains the data, model, checkpoints, and downloads.
3. `FEATURE_STATUS.md` says what works, what is still pending, and what we can
   honestly claim.
4. The commands below show the same workflow in short form.

## Install

Run this from the repository root:

```powershell
python -m pip install -e ".[model,remote,test]"
```

## Run with Docker

Docker runs the main workspace, API, and 3D viewer together. Large datasets and
checkpoints stay in the local `data/` folder instead of being copied into the
image:

```powershell
docker compose up --build
```

Then open <http://localhost:8000/>. See `DOCKER.md` for data mounts, model
checkpoints, Sentinel-2 downloads, and container commands.

## Start the map portal

The main HeightNet workspace provides one consistent flow for world-map
search, area selection, Sentinel-2 scene search, image upload, model execution,
2D inspection, and 3D terrain viewing.

Run it from the repository root:

```powershell
python scripts/serve_portal.py
```

Open `http://127.0.0.1:8000/`. The portal needs internet access for map tiles,
place search, and the Planetary Computer STAC search. It still needs the local
model checkpoint described below for an actual model run.

Run the tests:

```powershell
python -m pytest -q
```

## Download GAMUS

GAMUS is downloaded as matching triplets:

```text
RGB image + AGL height map + land cover map
```

Download a small training sample first:

```powershell
python scripts/download_gamus_subset.py `
  --split train `
  --count 20 `
  --workers 8
```

The files go into:

```text
data/gamus_raw/images/train
data/gamus_raw/heights/train
data/gamus_raw/classes/train
```

The full dataset is large. The current full split has 2,685 train scenes, 576
validation scenes, and 576 test scenes. Download the full set only when you
actually need to train or reproduce the benchmark:

```powershell
python scripts/download_gamus_subset.py --split train --count 2685
python scripts/download_gamus_subset.py --split val --count 576
python scripts/download_gamus_subset.py --split test --count 576
```

Dataset page: <https://huggingface.co/datasets/earthflow/GAMUS>

## Download a Sentinel-2 RGB GeoTIFF

The repository includes a Dehradun demo. For another Planetary Computer STAC
item, provide its item URL and an optional WGS84 bounding box:

```powershell
python scripts/download_sentinel2.py `
  --item-url "https://planetarycomputer.microsoft.com/api/stac/v1/collections/sentinel-2-l2a/items/ITEM_ID" `
  --output data/sentinel2_custom/custom_rgb.tif `
  --bbox 77.9 30.2 78.1 30.4
```

The three bands are written in red, green, blue order. The optional remote
dependencies from the install command are needed for this step.

## Run on PNG or JPG

This produces relative height only:

```powershell
python scripts/run_pipeline.py `
  --input path/to/image.png `
  --checkpoint data/gamus_raw/checkpoints/depth_anything_v2_gamus_fulltrain_epoch3_stable.pt `
  --output-dir data/pipeline_outputs
```

## Run on a Dehradun or any other GeoTIFF scene

The input and coarse ground files are kept out of Git because they are large.
Once you have a matching RGB GeoTIFF and NASADEM/SRTM ground raster, run:

```powershell
python scripts/run_pipeline.py `
  --input data/inputs/scene_rgb.tif `
  --checkpoint data/gamus_raw/checkpoints/depth_anything_v2_gamus_fulltrain_epoch3_stable.pt `
  --sure-calibration-report reports/sure_cal_256res_calibration.json `
  --semantic-checkpoint data/gamus_raw/checkpoints/gamus_semantic_head_fulltrain_epoch1.pt `
  --ground data/inputs/coarse_ground.tif `
  --output-dir data/outputs/demo `
  --output-prefix heightnet_dehradun_live_01
```

The GeoTIFF run writes relative depth, AGL, DSM, confidence, uncertainty, and
metadata files.

The final DSM is made like this:

```text
DSM = coarse ground elevation + predicted above ground height
```

## Check the outputs

```powershell
python scripts/validate_dsm_outputs.py `
  --input data/inputs/scene_rgb.tif `
  --agl data/outputs/demo/heightnet_dehradun_live_01_predicted_agl.tif `
  --ground data/inputs/coarse_ground.tif `
  --dsm data/outputs/demo/heightnet_dehradun_live_01_estimated_dsm.tif `
  --uncertainty data/outputs/demo/heightnet_dehradun_live_01_calibration_uncertainty.tif `
  --confidence data/outputs/demo/heightnet_dehradun_live_01_calibration_confidence.tif
```

This checks shape, CRS, pixel size, transform, nodata, and valid coverage. It
does not prove that the heights are correct. That needs a separate LiDAR,
reference DSM, or GCP comparison.

## Make a 3D terrain mesh

```powershell
python scripts/export_terrain_mesh.py `
  --rgb data/inputs/scene_rgb.tif `
  --elevation data/outputs/demo/heightnet_dehradun_live_01_estimated_dsm.tif `
  --output data/outputs/demo/heightnet_dehradun_live_01_terrain.obj `
  --stride 8 `
  --vertical-exaggeration 2.0
```

This creates an OBJ, MTL, texture PNG, and metadata JSON. The OBJ is for the
Three.js viewer or another 3D tool. QGIS can create its own terrain directly
from the DSM GeoTIFF.

## Open the browser viewer

```powershell
python -m http.server 8000
```

Open <http://localhost:8000/viewer/>. Choose the matching OBJ, MTL, texture,
and metadata files together.

## Run the HeightNet workspace

This is the first connected web flow. It uses the map to choose an area, finds
Sentinel-2 scenes, downloads the selected RGB GeoTIFF, and starts the existing
HeightNet pipeline as a background job.

```powershell
python scripts/serve_portal.py
```

Open <http://127.0.0.1:8000/>. The React workspace is now the main product
screen. The flow is:

```text
search place → select two map corners → find Sentinel-2 scenes
→ download RGB GeoTIFF → run HeightNet → open the generated terrain
```

After an area is selected, the workspace checks the source situation for that
AOI. A low-resolution DEM can be used as the ground baseline. A LiDAR DSM or
surveyed GCP file is kept separate and is only used when you deliberately run
validation. The same decision is saved in the run's source manifest so the
result does not lose where each layer came from.

When a mesh is generated, the result panel includes a link that opens the OBJ,
MTL, texture, and mesh metadata together in the Three.js viewer. The API only
serves files created inside the local job folder.

The root URL is the single main UI. Old `/classic/`, `/landing/`, and `/globe/`
links redirect back into this workspace so nobody has to deal with multiple
different interfaces.

## React workspace source

The UI is kept under `portal/workspace-src/`. It is a React/Vite
workspace with one shell for Map Acquisition, 2D raster inspection, 3D terrain,
layers, upload, and the live pipeline. Empty states are shown until real files
exist, so demo placeholders are not confused with model output.

Build it once:

```powershell
cd portal/workspace-src
npm install
npm run build
cd ../..
python scripts/serve_portal.py
```

The root URL and `/workspace/` both serve the React workspace. Upload a
PNG/JPG/GeoTIFF, run the model, and use the 3D Terrain view after the job
finishes. The workspace uses the same backend routes and job store for map
downloads, uploads, terrain generation, exports, and validation.

## Compare against reference data

For a reference DSM:

```powershell
python scripts/evaluate_reference.py `
  --prediction path/to/predicted_dsm.tif `
  --reference path/to/reference_dsm.tif `
  --output reports/reference_validation.json
```

For surveyed points, use a CSV with `id,x,y,reference_m`. The coordinates must
be in the prediction raster CRS:

```powershell
python scripts/evaluate_reference.py `
  --prediction path/to/predicted_dsm.tif `
  --gcp-csv path/to/gcp.csv `
  --calibration-fraction 0.7 `
  --output reports/gcp_validation.json
```

## Repository map

```text
backend/       Model, calibration, raster, evaluation, and mesh code
scripts/       Download, training, prediction, validation, and mesh commands
configs/       Scene splits and input templates
data/          Local datasets and generated outputs. Keep large files out of Git.
reports/       Evaluation reports and presentation material
viewer/        Small Three.js viewer
```

Generated caches and large local datasets are ignored by Git. Keep the trained
checkpoints and the split files if the model may need to be reproduced.
