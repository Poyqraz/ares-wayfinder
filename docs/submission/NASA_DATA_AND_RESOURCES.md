# NASA Data and Resources

Ares Wayfinder is built on public NASA and USGS data. The ARES-1 science team's research tables
were transcribed from the same NASA records, and the catalog build checks them against those
records.
The URLs and DOIs below are copied from the repository's own source records:
- `science/sources.json`;
- `web/public/data/regional/d3d62fc34c56/regional.json`;
- `web/public/data/m0a/f8de9017164a/sources.json`;
- `web/public/data/hirise/roi_a/376dcb1220c4/manifest.json`;
- the ARES-1 catalog source register in `ares1/bundle/572fba1ce61f/manifest.json`.

Where a value is not in those files, the table says "see repo source register".

No NASA logos are used anywhere in the app, video or slides.

## Data used in the app

| # | Data | Agency | Mission / instrument | Product ID | URL or DOI | Used for |
|---|---|---|---|---|---|---|
| 1 | Controlled CTX orthomosaic, 6 m | USGS Astrogeology / NASA (Mars 2020 TRN products; also served by NASA Mars Trek) | Mars Reconnaissance Orbiter (MRO) / Context Camera (CTX) | `JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0` | https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif · DOI 10.5066/P9GV1ND3 **[TEAM TO CONFIRM: this DOI comes from the team brief and is not yet in any repo file]** | Regional orbital map in Mission Control |
| 2 | JPL CTX DEM mosaic, 20 m | NASA / USGS Astrogeology (PDS) | MRO / CTX (stereo) | `urn:nasa:pds:mars2020_ctx_basemap_2021:data:m20_ctxdem_mosaic` (`M20_JezeroCrater_CTXDEM_20m.tif`) | https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXDEM_20m.tif · cite Mangold et al. 2021, https://doi.org/10.1126/science.abl4051 | ROI-A engineering demo terrain |
| 3 | JPL CTX orthoimage mosaic, 5 m | NASA / USGS Astrogeology (PDS) | MRO / CTX | `urn:nasa:pds:mars2020_ctx_basemap_2021:data:m20_ctxortho_mosaic` (`M20_JezeroCrater_CTXortho_mosaic_5m.tif`) | https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXortho_mosaic_5m.tif · cite Mangold et al. 2021 | ROI-A imagery (display only) |
| 4 | HiRISE DTM mosaic, 1 m | USGS Astrogeology / NASA | MRO / High Resolution Imaging Science Experiment (HiRISE) | `JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40` | https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif · https://doi.org/10.5066/P9REJ9JN (Fergason et al. 2020) | M0–A analysis grid (averaged to 2 m); elevation, slope, hillshade; routes |
| 5 | HiRISE orthomosaic, 25 cm | USGS Astrogeology / NASA | MRO / HiRISE | `JEZ_hirise_soc_007_orthoMosaic_25cm_Ortho_blend120` | https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_007_orthoMosaic_25cm_Ortho_blend120.tif · https://doi.org/10.5066/P9QJDP48 (Fergason et al. 2020) | M0–A image texture (1 m, display only); ROI-A HiRISE display layer |
| 6 | Mars 2020 Three Forks sample depot tables | NASA PDS Geosciences Node | Mars 2020 Perseverance / sample depot | `urn-nasa-pds-mars2020_sample_depot_three_forks`: `sample_tube_locations`, `sample_tube_identifiers`, `sample_tube_targets` (CSV + PDS4 labels) | https://pds-geosciences.wustl.edu/m2020/urn-nasa-pds-mars2020_sample_depot_three_forks/miscellaneous/sample_metadata/ (files `sample_tube_locations.csv`, `sample_tube_identifiers.csv`, `sample_tube_targets.csv` and their `.xml` labels) | Science Atlas: 10 depot tubes; M0 depot-drop rover positions |
| 7 | Mars 2020 Sample Dossier, Initial Reports (volumes 1–5) | NASA PDS Geosciences Node | Mars 2020 Perseverance / sampling system | `urn-nasa-pds-mars2020_sample_dossier`, `initial_reports_volume1.pdf` … `initial_reports_volume5.pdf` | https://pds-geosciences.wustl.edu/m2020/urn-nasa-pds-mars2020_sample_dossier/initial_reports/ | Science Atlas: sample cores and sealing records; Skinner Ridge sampling rover position (route goal) |
| 8 | MMGIS M20 rover waypoints | NASA / JPL | Mars 2020 Perseverance | `M20_waypoints.json` | https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json | M0, A and Bright Angel (C) waypoints on the regional map; M0 rover position (route start) |
| 9 | MEDA derived pressure, sol 516 | NASA PDS Atmospheres Node | Mars 2020 Perseverance / Mars Environmental Dynamics Analyzer (MEDA) | `urn:nasa:pds:mars2020_meda`, product `WE__0516___________DER_PS__________________P01` | https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_derived_env/sol_0420_0539/sol_0516/ · bundle DOI https://doi.org/10.17189/1522849 (Rodriguez-Manfredi & de la Torre Juarez 2021) | Science Atlas: pressure time series at the rover (a point record, never turned into a map) |
| 10 | Mars Rock Samples page | NASA Science | Mars 2020 Perseverance | web page (HTML snapshot stored in repo) | https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples/ | Science Atlas: sample cards; cross-check of names, sols and dates |
| 11 | PDS Analyst's Notebook, Three Forks Depot page | NASA PDS Geosciences Node (Analyst's Notebook) | Mars 2020 Perseverance | help page (HTML snapshot stored in repo) | https://an.rsl.wustl.edu/help/Content/About%20the%20mission/M20/Return%20sample%20science/Three%20Forks%20Depot.htm | Science Atlas: depot sample drop timestamps |

## Data used only for checks (not shown as a layer)

| Data | Agency | Mission / instrument | Product ID | URL or DOI | Used for |
|---|---|---|---|---|---|
| Mars 2020 TRN CTX DTM mosaic, 20 m | USGS Astrogeology / NASA | MRO / CTX (stereo), tied to MGS MOLA | `JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0` | https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif | Independent elevation cross-check for ROI-A |
| Independent HiRISE stereo elevation models (pairs W and DL) | USGS Astrogeology / NASA | MRO / HiRISE | see repo source register | see repo source register | Route sensitivity test: how far the M0–A route moves on other elevation models |

## Literature and models

| Reference | Used for |
|---|---|
| Mangold et al. (2021), *Science*, https://doi.org/10.1126/science.abl4051 | Citation for the JPL CTX DEM and ortho mosaics (ROI-A) |
| Fergason, Galuszka, Hare, Mayer, Redding & Smith (2020), USGS Astrogeology, DOIs 10.5066/P9REJ9JN and 10.5066/P9QJDP48 | Citation for the HiRISE DTM and orthomosaic |
| Minetti et al. (2002) | Slope cost curve. Earth treadmill walking data; **not validated for suited Mars EVA** |
| Tobler (1993) | Alternative slope cost curve, same caveat |
| NASA PDS, *Mars 2020 Initial Reports, Volume 2* (sheets 16-1 Shuyak, 17-1 Mageik), https://pds-geosciences.wustl.edu/missions/mars2020/ | Mission B (Amalik): rover positions during sampling, sols, lithology, the Novarupta abrasion patch. Read and transcribed; the Mageik record was already in the ARES-1 catalog. |
| Bosak et al. (2024), *AGU Advances*, doi:10.1029/2024AV001241; Hurowitz et al. (2025), *Nature*, doi:10.1038/s41586-025-09413-0 | Cited by the ARES-1 science team for Bright Angel context. Cited only; we did not download or process them |

## Software

- **Open-source libraries.** The app uses React, three.js, Vite and zustand. The data pipeline uses
  Python with GDAL/rasterio and SciPy.
- **No NASA software** is redistributed. **[TEAM TO CONFIRM]**
