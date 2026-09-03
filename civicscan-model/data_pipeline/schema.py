"""
CivicScan — Unified COCO Schema Definitions
=============================================
This is the SINGLE SOURCE OF TRUTH for the class taxonomy and schema shape.
Every converter script MUST import from here rather than hardcoding category
ids/names. If the taxonomy changes, it changes in exactly one place.

Locked schema decisions (do not change without team sync — Member B's
loss-masking code and Member C's calibration code both depend on this shape):
  - `valid_categories` lives on the IMAGE, not the annotation. It lists every
    category id that the SOURCE DATASET is capable of annotating, regardless
    of whether that class actually appears in this particular image. This is
    what makes per-source loss masking possible downstream.
  - `geo` is null for all training data (RDD2022 / TACO / Crackseg9k /
    Roboflow manhole are static datasets with no real GPS). It only gets
    populated by Member C's live deployment pipeline, which reuses this same
    schema with source_dataset="live_deployment".
  - `illegal_dumping` is deliberately NOT a detector class. It is a post-
    inference aggregation rule (cluster of litter detections) that lives in
    Member C's module, not something we ask the model to learn directly,
    since TACO does not natively annotate it.
"""

from dataclasses import dataclass, field
from typing import Optional


# ---------------------------------------------------------------------------
# 1. Unified category taxonomy (final ids — do not renumber once conversion
#    starts, downstream configs will reference these ids directly)
# ---------------------------------------------------------------------------

CATEGORIES = [
    {"id": 1, "name": "crack_longitudinal", "supercategory": "road_damage"},
    {"id": 2, "name": "crack_transverse",   "supercategory": "road_damage"},
    {"id": 3, "name": "crack_alligator",    "supercategory": "road_damage"},
    {"id": 4, "name": "pothole",            "supercategory": "road_damage"},
    {"id": 5, "name": "crack_structural",   "supercategory": "structural_damage"},
    {"id": 6, "name": "litter",             "supercategory": "civic_waste"},
    {"id": 7, "name": "manhole_damaged",    "supercategory": "hazard"},
    {"id": 8, "name": "manhole_missing",    "supercategory": "hazard"},
]

CATEGORY_NAME_TO_ID = {c["name"]: c["id"] for c in CATEGORIES}
CATEGORY_ID_TO_NAME = {c["id"]: c["name"] for c in CATEGORIES}

# Which category ids each source dataset is capable of annotating.
# This is what gets written into each image's `valid_categories` field.
# NOTE: illegal_dumping is intentionally excluded — see module docstring.
SOURCE_VALID_CATEGORIES = {
    "RDD2022":  [1, 2, 3, 4],
    "TACO":     [6],
    "Crackseg9k": [5],
    "RoboflowManhole": [7, 8],
    "TrashTrail": [6],
    "RoboflowManholeG8rvh": [7, 8],
    "RoboflowManholeJinggai": [7, 8],
    "BridgeDeckCsust": [5],
}

# Known license per source. All four are now confirmed from the source of
# record (repo README / dataset site / Dataverse metadata / the license file
# shipped inside the export) — see the per-entry notes.
SOURCE_LICENSES = {
    "RDD2022": "CC_BY_SA_4.0",           # CONFIRMED: sekilab/RoadDamageDetector
                                           # README, "License" section
    "TACO": "CC_BY_4.0",                  # CONFIRMED: tacodataset.org — annotations
                                           # are CC BY 4.0; NOTE individual images may
                                           # carry different original licenses (referenced
                                           # per-image in the annotation file) since they're
                                           # sourced from Flickr/various — spot check a sample
    "Crackseg9k": "CC0_1.0",              # CONFIRMED: Harvard Dataverse metadata for
                                           # doi:10.7910/DVN/EGIEBY ("Crackseg9k: A
                                           # Collection of Crack Segmentation Datasets")
                                           # reports license CC0 1.0. That is the umbrella
                                           # deposit; the 10 merged sub-datasets (Crack500,
                                           # DeepCrack, Cracktree200, GAPS384, Volker,
                                           # Rissbilder, noncrack, Masonry, Ceramic, CFD)
                                           # each have their own upstream terms — cite the
                                           # Dataverse deposit, and cite the sub-datasets
                                           # individually in the report
    # The three sources below were added to widen `litter` and the two
    # hazard classes; each is a Roboflow Universe project whose listing
    # states CC BY 4.0.
    "TrashTrail": "CC_BY_4.0",            # CONFIRMED: Universe listing for
                                           # andrew-watson-yz64n/trash-trail-litter
    "RoboflowManholeG8rvh": "CC_BY_4.0",  # CONFIRMED: Universe listing for
                                           # manhole-projet/manhole-g8rvh
    "RoboflowManholeJinggai": "CC_BY_4.0",  # CONFIRMED: Universe listing for
                                           # 123-g4ip5/-rqltz
    "BridgeDeckCsust": "CC_BY_4.0",       # CONFIRMED: Universe listing for
                                           # csustcv/bridge-detection-p4vmv
    "RoboflowManhole": "CC_BY_4.0",       # CONFIRMED: README.dataset.txt shipped
                                           # inside the export ("Manhole Cover Dataset
                                           # YOLO", universe.roboflow.com/
                                           # create-dataset-for-yolo/
                                           # manhole-cover-dataset-yolo) states
                                           # "License: CC BY 4.0"
}

VALID_CAPTURE_CONTEXTS = {
    "vehicle_windshield", "handheld", "drone", "static_camera", "unknown"
}


# ---------------------------------------------------------------------------
# 2. Python-side dataclasses mirroring the JSON schema (useful for building
#    converters without hand-writing dicts everywhere)
# ---------------------------------------------------------------------------

@dataclass
class UnifiedImage:
    id: int
    file_name: str
    width: int
    height: int
    source_dataset: str          # e.g. "RDD2022"
    source_domain: str           # supercategory-level tag, e.g. "road_damage"
    valid_categories: list       # list[int]
    capture_context: str = "unknown"
    license: str = "UNKNOWN"
    lat: Optional[float] = None
    lon: Optional[float] = None

    def to_dict(self):
        return {
            "id": self.id,
            "file_name": self.file_name,
            "width": self.width,
            "height": self.height,
            "source_dataset": self.source_dataset,
            "source_domain": self.source_domain,
            "valid_categories": self.valid_categories,
            "capture_context": self.capture_context,
            "geo": {"lat": self.lat, "lon": self.lon},
            "license": self.license,
        }


@dataclass
class UnifiedAnnotation:
    id: int
    image_id: int
    category_id: int
    bbox: list                     # [x, y, w, h] absolute pixel coords, COCO style
    area: float
    segmentation: Optional[list] = None   # polygon(s), null unless from Crackseg9k
    iscrowd: int = 0

    def to_dict(self):
        return {
            "id": self.id,
            "image_id": self.image_id,
            "category_id": self.category_id,
            "bbox": self.bbox,
            "segmentation": self.segmentation,
            "area": self.area,
            "iscrowd": self.iscrowd,
        }


def new_unified_dataset_dict():
    """Empty top-level COCO-style dict, categories pre-filled."""
    return {
        "images": [],
        "annotations": [],
        "categories": CATEGORIES,
    }


def source_domain_for(source_dataset: str) -> str:
    """Map a source dataset name to its supercategory tag for source_domain."""
    mapping = {
        "RDD2022": "road_damage",
        "TACO": "civic_waste",
        "Crackseg9k": "structural_damage",
        "RoboflowManhole": "hazard",
        "TrashTrail": "civic_waste",
        "RoboflowManholeG8rvh": "hazard",
        "RoboflowManholeJinggai": "hazard",
        "BridgeDeckCsust": "structural_damage",
    }
    if source_dataset not in mapping:
        raise ValueError(f"Unknown source_dataset '{source_dataset}', "
                          f"add it to source_domain_for() in schema.py")
    return mapping[source_dataset]
