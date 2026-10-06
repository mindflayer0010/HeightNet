# Data and models

This file explains what the folders mean and which model files are being used.

## GAMUS data

Each GAMUS scene has three matching files:

```text
images  = RGB satellite image
heights = above ground height map, also called AGL
classes = land cover labels
```

The full working split is:

```text
Train:      2,685 scenes
Validation:   576 scenes
Test:        576 scenes
```

The same split names exist under `images`, `heights`, and `classes`:

```text
data/gamus_raw/images/train
data/gamus_raw/heights/train
data/gamus_raw/classes/train
```

Download complete scene triplets in batches with:

```powershell
python scripts/download_gamus_subset.py --split train --count 20
```

Change `--count` when more data is needed. The script skips complete scenes
already present locally. The full dataset is roughly 80 GB, so it is not part
of the Git repository.

Dataset page: <https://huggingface.co/datasets/earthflow/GAMUS>

## The depth model

The base model is `Depth Anything V2 Small`.

It was fine tuned on GAMUS RGB and AGL pairs so it sees top down remote sensing
images instead of only ordinary camera images.

The checkpoint used by the current pipeline is:

```text
data/gamus_raw/checkpoints/depth_anything_v2_gamus_fulltrain_epoch3_stable.pt
```

This model first produces relative structural depth. Relative means that it
can tell what looks higher or lower, but it does not know the real height in
metres by itself.

## The semantic head

The semantic head estimates land cover such as buildings, trees, roads, and
ground. Its current checkpoint is:

```text
data/gamus_raw/checkpoints/gamus_semantic_head_fulltrain_epoch1.pt
```

It was trained on the GAMUS training scenes while the depth backbone was kept
frozen.

## SURE-Cal

SURE-Cal is our calibration layer. It takes the relative depth and changes its
scale using the land cover prediction.

```text
relative depth
    ↓
class based correction
    ↓
confidence check
    ↓
calibrated above ground height
```

If the class based correction looks unreliable, the result moves back towards
the safer global calibration. The current calibration report is:

```text
reports/sure_cal_256res_calibration.json
```

The current uncertainty is based on calibration residuals weighted by semantic
class probabilities. It is a warning signal, not a guaranteed probability of
error.

## Coarse ground elevation

For GeoTIFF input, the pipeline needs a coarse ground raster such as NASADEM.
That raster supplies the base elevation. The model supplies the above ground
part:

```text
final DSM = coarse ground elevation + model predicted AGL
```

The Dehradun demo uses:

```text
data/sentinel2_dehradun/dehradun_nasadem_ground.tif
```

## What is needed after training

The raw GAMUS files are needed for retraining and reproducibility. They are
not needed for normal inference or QGIS viewing. For normal use, the important
files are the checkpoints, calibration report, input image, and coarse ground
raster.
