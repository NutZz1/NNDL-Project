"""
Simple namespaced ID allocator.

Problem: RDD2022, TACO, Crackseg9k, and the manhole set are converted by
independent scripts (possibly run in parallel). If each script starts
counting image_id/annotation_id from 1, merging them causes collisions.

Fix: reserve a fixed id block per source. 10 million ids per source is
comfortably larger than any of these datasets, so blocks never overlap.
"""

ID_BLOCK_SIZE = 10_000_000

SOURCE_BLOCK_INDEX = {
    "RDD2022": 0,
    "TACO": 1,          # now the complete Roboflow mirror, not the partial
                        # Flickr pull — same photos, same block, so nothing
                        # downstream that stored a TACO id has to change
    "Crackseg9k": 2,
    "RoboflowManhole": 3,
    # Added when the litter and hazard classes were widened. Each Roboflow
    # project gets its own block AND its own source_dataset value, so
    # per-source loss masking stays correct and ids can never collide.
    "TrashTrail": 4,
    "RoboflowManholeG8rvh": 5,
    "RoboflowManholeJinggai": 6,
    # Bridge-deck structural cracks, added to break the single-subset
    # (Rissbilder) concentration in crack_structural.
    "BridgeDeckCsust": 7,
}


def image_id_offset(source_dataset: str) -> int:
    if source_dataset not in SOURCE_BLOCK_INDEX:
        raise ValueError(f"Unknown source '{source_dataset}' — add it to "
                          f"SOURCE_BLOCK_INDEX in id_allocator.py")
    return SOURCE_BLOCK_INDEX[source_dataset] * ID_BLOCK_SIZE


def annotation_id_offset(source_dataset: str) -> int:
    # Annotations use the same block scheme but offset into a totally
    # separate numeric space so image ids and annotation ids never collide
    # with each other either (belt and suspenders — COCO doesn't require
    # this, but it makes debugging by-eye much easier).
    return (SOURCE_BLOCK_INDEX[source_dataset] * ID_BLOCK_SIZE) + 100_000_000


class LocalCounter:
    """Small helper: local running counter added to a fixed offset."""
    def __init__(self, offset: int):
        self.offset = offset
        self._next = 0

    def next(self) -> int:
        val = self.offset + self._next
        self._next += 1
        return val
