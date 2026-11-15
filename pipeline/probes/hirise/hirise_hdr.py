import rasterio, time
B = "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/"
F = {
 "dtm_soc006": "JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif",
 "ortho_soc007": "JEZ_hirise_soc_007_orthoMosaic_25cm_Ortho_blend120.tif",
 "ortho_soc006": "JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first.tif",
}
env = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif", GDAL_HTTP_MULTIRANGE="YES")
with rasterio.Env(**env):
    for k, f in F.items():
        t0 = time.time()
        with rasterio.open("/vsicurl/" + B + f) as d:
            p = d.profile
            print(f"== {k}  ({time.time()-t0:.1f}s to open)")
            print(" size", d.width, d.height, "dtype", d.dtypes[0], "bands", d.count, "nodata", d.nodata)
            print(" transform", tuple(d.transform)[:6])
            print(" crs", d.crs.to_proj4())
            print(" tiled", p.get("tiled"), "block", d.block_shapes[0], "compress", p.get("compress"), "interleave", p.get("interleave"))
            print(" overviews", d.overviews(1), "area_or_point", d.tags().get("AREA_OR_POINT"))
            print(" tags", {kk: v for kk, v in d.tags().items() if kk != "AREA_OR_POINT"}, "mask_flags", d.mask_flag_enums)
