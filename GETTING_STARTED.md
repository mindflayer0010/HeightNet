# Getting started after pulling the repo

This is the guide for someone who has just cloned HeightNet and wants to run
it without guessing what to do.

## 1. Clone the repository

Open PowerShell and run:

```powershell
git clone https://github.com/INFERA-Vault/HeightNet.git HeightNet
cd HeightNet
```

If the folder already exists:

```powershell
cd D:\projects\HeightNet
git pull
```

## 2. Check Python

```powershell
python --version
```

Python 3.10 or newer is required. If `python` is not found, install Python
from <https://www.python.org/downloads/> and enable **Add Python to PATH**.

## 3. Create a private project environment

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks activation, run this once in the same terminal:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

## 4. Install the project

```powershell
python -m pip install --upgrade pip
python -m pip install -e ".[model,remote,test]"
```

## 5. Run a basic check

```powershell
python -m pytest -q
```

If Windows reports that the paging file is too small while loading Torch, the
machine needs more virtual memory. The project files are not the cause of that
error.

## 6. Get the trained model

The model weights are not stored in Git because they are large. Ask the team
for these files:

```text
depth_anything_v2_gamus_fulltrain_epoch3_stable.pt
gamus_semantic_head_fulltrain_epoch1.pt
```

Place them here:

```text
data/gamus_raw/checkpoints/depth_anything_v2_gamus_fulltrain_epoch3_stable.pt
data/gamus_raw/checkpoints/gamus_semantic_head_fulltrain_epoch1.pt
```

Check that they exist:

```powershell
Test-Path data/gamus_raw/checkpoints/depth_anything_v2_gamus_fulltrain_epoch3_stable.pt
Test-Path data/gamus_raw/checkpoints/gamus_semantic_head_fulltrain_epoch1.pt
```

Both commands must print `True`.

## 7. Download a small GAMUS sample

You do not need the full 80 GB dataset just to understand the project. Start
with 20 training scenes:

```powershell
python scripts/download_gamus_subset.py `
  --split train `
  --count 20 `
  --workers 8
```

Each scene has three matching files:

```text
RGB image + AGL height map + land cover map
```

For full retraining, download the complete train, validation, and test splits:

```powershell
python scripts/download_gamus_subset.py --split train --count 2685
python scripts/download_gamus_subset.py --split val --count 576
python scripts/download_gamus_subset.py --split test --count 576
```

The data is saved under `data/gamus_raw/`. It is ignored by Git and should not
be pushed to the repository.

## 8. Run on a normal image

Put any PNG or JPG inside a local folder, for example:

```text
D:\heightnet_inputs\sample.png
```

Run:

```powershell
python scripts/run_pipeline.py `
  --input D:\heightnet_inputs\sample.png `
  --checkpoint data/gamus_raw/checkpoints/depth_anything_v2_gamus_fulltrain_epoch3_stable.pt `
  --output-dir data/pipeline_outputs
```

This creates a relative height map. It is not in real metres because PNG and
JPG files do not contain map location and scale information.

## 9. Run on a GeoTIFF

A GeoTIFF must have a CRS and map transform. You also need a coarse ground
elevation raster covering the same area.

```powershell
python scripts/run_pipeline.py `
  --input D:\heightnet_inputs\scene_rgb.tif `
  --checkpoint data/gamus_raw/checkpoints/depth_anything_v2_gamus_fulltrain_epoch3_stable.pt `
  --sure-calibration-report reports/sure_cal_256res_calibration.json `
  --semantic-checkpoint data/gamus_raw/checkpoints/gamus_semantic_head_fulltrain_epoch1.pt `
  --ground D:\heightnet_inputs\coarse_ground.tif `
  --output-dir data/pipeline_outputs `
  --output-prefix my_scene
```

The important outputs are:

```text
my_scene_relative_depth.tif
my_scene_predicted_agl.tif
my_scene_estimated_dsm.tif
my_scene_calibration_uncertainty.tif
my_scene_calibration_confidence.tif
my_scene_pipeline_metadata.json
```

## 10. Make the 3D terrain

```powershell
python scripts/export_terrain_mesh.py `
  --rgb D:\heightnet_inputs\scene_rgb.tif `
  --elevation data\pipeline_outputs\my_scene_estimated_dsm.tif `
  --output data\pipeline_outputs\my_scene_terrain.obj `
  --stride 8 `
  --vertical-exaggeration 2.0
```

The OBJ, MTL, texture PNG, and metadata JSON must stay together.

## 11. Open the browser viewer

Start a local server:

```powershell
python -m http.server 8000
```

Open <http://localhost:8000/viewer/> in a browser. Select the matching OBJ,
MTL, texture, and metadata files.

## 12. Open the result in QGIS

Add the RGB GeoTIFF and the estimated DSM GeoTIFF as raster layers. Then open:

```text
View → 3D Map Views → New 3D Map View
```

In the settings window choose:

```text
Terrain type: DEM (Raster Layer)
Elevation: my_scene_estimated_dsm
Vertical scale: 2.0
```

Keep the RGB layer visible. It supplies the texture. The confidence layer is
only for checking where the calibration is more or less reliable.

## 13. Run the React workspace

The React workspace needs Node once to build its browser files:

```powershell
cd portal/workspace-src
npm install
npm run build
cd ../..
python scripts/serve_portal.py
```

Open `http://127.0.0.1:8000/`. Choose an input file and click
**Run model**. It uses the same backend and opens the same real terrain viewer.

The old simple portal remains available at `http://127.0.0.1:8000/classic/`.

When the run finishes, you can click the 2D result to inspect the generated
DSM height and local slope. To check accuracy, add a reference DSM GeoTIFF or a
GCP CSV and click **Run validation**. The GCP CSV must have `x,y,reference_m`
columns in the prediction raster CRS. The portal does not invent accuracy data:
without a real reference, it cannot produce a valid accuracy claim.

## What the project is doing

```text
RGB image
    ↓
relative depth from the trained model
    ↓
SURE-Cal changes the scale using land cover
    ↓
coarse ground elevation is added
    ↓
DSM GeoTIFF and 3D terrain mesh
```

## Common mistakes

**Model file not found**

The checkpoint has not been copied into `data/gamus_raw/checkpoints/`.

**Only relative output appears**

The input is not a georeferenced GeoTIFF, or calibration and ground files were
not supplied.

**The 3D view is blank**

Check that the DSM has a CRS, that the 3D terrain elevation is set to the DSM,
and that the map is zoomed to the layer extent.

**Hugging Face asks for a token**

The public model or data request is unauthenticated. The warning is usually
safe for a small run, but a token gives better download limits.
