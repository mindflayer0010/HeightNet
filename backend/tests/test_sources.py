from __future__ import annotations

from backend.acquisition import sources


def test_discover_sources_separates_ground_from_validation(tmp_path) -> None:
    gcp_dir = tmp_path / "data" / "gcps"
    gcp_dir.mkdir(parents=True)
    (gcp_dir / "survey.csv").write_text("x,y,reference_m\n1,2,100\n", encoding="utf-8")

    result = sources.discover_sources(
        tmp_path,
        (77.1, 30.1, 77.2, 30.2),
        include_remote_catalog=False,
    )

    records = result["sources"]
    assert any(record["role"] == "calibration_reference" for record in records)
    assert any(record["role"] == "coarse_ground" for record in records)
    assert result["summary"]["gcp_upload_supported"] is True
    assert result["rules"]["coarse_dem_is_not_lidar_truth"] is True


def test_collection_bbox_supports_stac_bbox_shapes() -> None:
    collection = {"extent": {"spatial": {"bbox": [[77.0, 30.0, 77.5, 30.5]]}}}
    assert sources._collection_bbox(collection) == [77.0, 30.0, 77.5, 30.5]


def test_opentopography_match_is_reported_as_validation_reference(monkeypatch) -> None:
    monkeypatch.setattr(
        sources,
        "_load_opentopography_catalog",
        lambda bbox: [
            {
                "name": "Test airborne LiDAR DSM 2m",
                "alternateName": "Test LiDAR",
                "identifier": {"value": "test-lidar"},
            }
        ],
    )

    matches = sources._opentopography_matches((77.1, 30.1, 77.2, 30.2))

    assert len(matches) == 1
    assert matches[0].status == "available"
    assert matches[0].role == "validation_reference"
    assert matches[0].resolution_m == 2.0
