"""Mirror of data_pipeline/schema.py. Ids are LOCKED — do not renumber.

COCO category ids are 1..8. Models are 0-indexed internally. The shift happens
in exactly one place: CivicScanCocoDataset. Nothing else may shift ids.
"""

CATEGORIES = [
    {"id": 1, "name": "crack_longitudinal", "supercategory": "road_damage"},
    {"id": 2, "name": "crack_transverse", "supercategory": "road_damage"},
    {"id": 3, "name": "crack_alligator", "supercategory": "road_damage"},
    {"id": 4, "name": "pothole", "supercategory": "road_damage"},
    {"id": 5, "name": "crack_structural", "supercategory": "structural_damage"},
    {"id": 6, "name": "litter", "supercategory": "civic_waste"},
    {"id": 7, "name": "manhole_damaged", "supercategory": "hazard"},
    {"id": 8, "name": "manhole_missing", "supercategory": "hazard"},
]

NUM_CLASSES = len(CATEGORIES)
CAT_IDS = [c["id"] for c in CATEGORIES]
CAT_ID_TO_IDX = {c["id"]: i for i, c in enumerate(CATEGORIES)}
IDX_TO_CAT_ID = {i: c["id"] for i, c in enumerate(CATEGORIES)}
CLASS_NAMES = [c["name"] for c in CATEGORIES]
DOMAINS = [c["supercategory"] for c in CATEGORIES]

SOURCE_VALID_CATEGORIES = {
    "RDD2022": [1, 2, 3, 4],
    "TACO": [6],
    "TrashTrail": [6],
    "Crackseg9k": [5],
    "BridgeDeckCsust": [5],
    "RoboflowManhole": [7, 8],
    "RoboflowManholeG8rvh": [7, 8],
    "RoboflowManholeJinggai": [7, 8],
}

EXPECTED_SPLIT_COUNTS = {
    "train": {"images": 22870, "annotations": 34155},
    "val": {"images": 4718, "annotations": 7136},
    "test": {"images": 4672, "annotations": 7001},
}
