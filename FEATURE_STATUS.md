# Feature status

This is the honest status of the project right now.

## Working now

- GAMUS data is handled as matching RGB, AGL, and class files.
- Depth Anything V2 has been fine tuned on the GAMUS training split.
- PNG and JPG inputs produce relative height products.
- GeoTIFF inputs keep their CRS and map transform.
- SURE-Cal applies class based calibration for the height estimate.
- The uncertainty gate can reduce the class correction when it is not reliable.
- NASADEM can be aligned to the input grid.
- The pipeline writes AGL and experimental DSM GeoTIFFs.
- The pipeline writes uncertainty and confidence GeoTIFFs.
- Outputs are checked for CRS, shape, transform, nodata, and valid coverage.
- The RGB image can be turned into a textured OBJ terrain mesh.
- QGIS can show the DSM as a 3D terrain surface.
- The browser viewer can load the OBJ, material, and texture files.
- The local portal can search an area, acquire Sentinel-2 RGB data, run the
  model as a background job, and open the generated terrain.
- The imported React workspace can upload an image, start the same job, show
  the real output links, and open the same viewer.
- Docker Compose can build and run the workspace, API, and viewer together
  while mounting large local data separately. The old globe URL redirects into
  Map Acquisition inside the workspace.
- The workspace can show real DSM/AGL statistics after a run.
- A click on the live 2D raster can read the generated DSM height and local
  slope from the output raster.
- A reference DSM GeoTIFF or GCP CSV can be uploaded and evaluated through the
  same portal. The report includes MAE, RMSE, bias, correlation, and a GCP
  calibration/holdout split when enough points are supplied.
- GAMUS held out evaluation reports contain MAE, RMSE, and comparison results.

## Current demo

The working example uses a Sentinel-2 RGB GeoTIFF and an aligned NASADEM ground
raster. Large example rasters are kept out of the clean repository:

```text
data/sentinel2_dehradun/dehradun_rgb.tif
data/sentinel2_dehradun/dehradun_nasadem_ground.tif
data/demo_qgis_dehradun_20260907/
```

The Dehradun DSM is suitable for showing the workflow and the 3D result. It
has not been checked against local LiDAR or surveyed heights.

## What is still missing

- A local LiDAR DSM, reference DSM, or surveyed GCP set for independent
  Dehradun validation.
- A final comparison table using the same surface type and height datum.
- A packaged standalone application for users who do not have Python.
- More testing on inputs with different band order, nodata, and image sizes.
- A cleaner confidence estimate based on an ensemble or calibrated semantic
  uncertainty rather than only calibration residuals.

## What we can claim

We can claim that the prototype accepts remote sensing images, predicts a
relative height signal, calibrates it, combines it with a coarse ground
surface, writes geospatial products, and creates a navigable terrain mesh.

We can also report the held out GAMUS benchmark results in the reports folder.
We should not claim high precision on a new location until a separate LiDAR,
reference DSM, or GCP comparison has been run.

## Next product order

```text
1. Supply independent LiDAR/reference DSM or surveyed GCP data for a target area
2. Run the new portal validation flow and review the report
3. Finish product packaging and broader input testing
```
