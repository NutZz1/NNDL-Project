"""
Single audit surface for every Roboflow-derived source in the pipeline.

Four of our sources now come from Roboflow Universe forks, all exported in
the same COCO shape. Rather than scatter class mappings through four
converters, every mapping decision lives here, in one table, so it can be
reviewed without reading any conversion code.

Read this file to answer "why is that Roboflow class in that CivicScan
class?" — nothing downstream may hardcode a mapping.

Each entry:
    source_dataset   value written to the image's `source_dataset` field.
                     MUST exist in schema.source_domain_for() and in
                     utils/id_allocator.SOURCE_BLOCK_INDEX.
    project          the forked project slug in our workspace
    universe_url     where it came from (provenance for the report)
    img_prefix       prepended to file_name in the unified JSON
    capture_context  one of schema.VALID_CAPTURE_CONTEXTS
    license          license string written per image
    class_map        exact Roboflow class name -> our class name, or None to
                     skip that class. Case and spelling vary between
                     sources ("Broken" vs "broke", "Uncovered" vs "uncover")
                     and are reproduced here verbatim.
    flatten_all_to   alternative to class_map: map EVERY class to this one
                     CivicScan class. Only legitimate where the taxonomy
                     decision is genuinely "all of these are one class"
                     (TACO's 59 litter types). Exactly one of class_map /
                     flatten_all_to must be set.
"""

ROBOFLOW_SOURCES = {

    # ---------------------------------------------------------------
    # LITTER
    # ---------------------------------------------------------------
    "taco_mirror": {
        "source_dataset": "TACO",
        "project": "taco-litter-wmiuo",
        "universe_url": "https://universe.roboflow.com/taco-2we3b/taco-litter",
        "img_prefix": "taco_",
        # TACO is a genuine mix of contexts (street, beach, park, close
        # range) with no per-image capture metadata to separate them.
        "capture_context": "unknown",
        "license": "TACO_CC_BY_4.0",
        # The locked taxonomy flattens all 59 TACO fine categories into one
        # `litter` class, so an explicit 59-row map would be 59 identical
        # rows. Flatten is the honest encoding of that decision.
        "flatten_all_to": "litter",
        "class_map": None,
        "notes": "Complete mirror of official TACO (1499/1500 images, "
                 "4782/4784 annotations). REPLACES the partial 968-image "
                 "Flickr pull — same photos, dead links recovered. Do not "
                 "merge the two, they would double-count.",
    },

    "trash_trail": {
        "source_dataset": "TrashTrail",
        "project": "trash-trail-litter-dmsiz",
        "universe_url": "https://universe.roboflow.com/andrew-watson-yz64n/trash-trail-litter",
        "img_prefix": "trashtrail_",
        # MIXED, and not what the first look suggested. Sample images are
        # elevated/oblique street views with litter at a distance, which is
        # closer to our deployment domain than TACO's close-ups — but the
        # dedup pass revealed that a large share are FIXED-CCTV frames:
        # burned-in "02-27-2023 Mon 12:48:54" timestamps and a "Camera 01"
        # watermark, with pairs seconds apart in which a person has moved
        # while the litter has not. Others are hand-held. There is no
        # per-image metadata to separate them, so "unknown" is the only
        # honest tag; do not treat this source as uniformly hand-held.
        "capture_context": "unknown",
        "license": "TrashTrail_CC_BY_4.0",
        "flatten_all_to": None,
        # All 8 map to `litter`. Listed explicitly rather than flattened so
        # that a NEW class appearing in a future export is caught as unknown
        # instead of being silently swallowed.
        "class_map": {
            "glass": "litter",
            "cigarette_butt": "litter",
            "film_flexible": "litter",
            "foam": "litter",
            "paper_card": "litter",
            "rigid_container": "litter",
            "small_rigid": "litter",
            "textile": "litter",
            # Roboflow's dummy category-0 row, confirmed unused by any
            # annotation in the export. Skipped generically by
            # roboflow_common; listed here so the audit trail is complete.
            "litter": None,
        },
        "notes": "Independent of TACO (0/16 sampled images overlap). Itself "
                 "an aggregation of >=3 sub-sources by filename "
                 "(yolov7trash_IMG_*, yolov7trash_trash-*, litter2_*), so "
                 "split grouping keys on those prefixes. WARNING: filename "
                 "sequence grouping is NOT sufficient here — near-duplicate "
                 "CCTV frames were found under NON-adjacent IMG numbers "
                 "(IMG_8575 vs IMG_0018 at hash distance 8), so the "
                 "converter's perceptual dedup is what actually protects "
                 "against those frames splitting across train/test. Keep "
                 "--dedup-within ON. Distance histogram of the 315 drops: "
                 "24 at <=2 (true dupes), 258 at 5-8 (near-duplicate frames "
                 "plus a small number of false positives on low-texture road "
                 "surfaces).",
    },

    # ---------------------------------------------------------------
    # STRUCTURAL (BRIDGE)
    # ---------------------------------------------------------------
    "bridge_csust": {
        "source_dataset": "BridgeDeckCsust",
        "project": "bridge-detection-p4vmv-otawr",
        "universe_url": "https://universe.roboflow.com/csustcv/bridge-detection-p4vmv",
        "img_prefix": "bridgecsust_",
        # Inspection photography of bridge structure: girders, soffits,
        # bearing seats, box-girder interiors, underside-of-deck views.
        "capture_context": "handheld",
        "license": "BridgeDeckCsust_CC_BY_4.0",
        "flatten_all_to": None,
        # CRACK ONLY. Spall, Rust, Efflorescence, Rebar and Scaling are all
        # genuine structural damage, but they are NOT cracks. Folding them
        # into crack_structural would repeat exactly the category error the
        # previous round was spent removing (road pavement sitting in a
        # structural class). `defect` is unspecific and cannot be assumed to
        # be a crack.
        #
        # The upstream project carries case and spelling duplicates of
        # several classes. Every one is listed explicitly rather than relying
        # on case-normalisation, so the filter is auditable and a NEW class
        # in a future export is still caught as unknown.
        "class_map": {
            "Crack": "crack_structural",     # 2,332 instances upstream
            "crack": "crack_structural",     #   201 instances upstream
            "defect": None,                  # 2,248 — unspecific, skipped
            "Rebar": None,                   # 1,523
            "Efflorescence": None,           # 1,323
            "Rust": None,                    #   832
            "Spall": None,                   #   663
            "Scaling": None,                 #   206
            "defectww": None,                #    21 — spelling duplicate
            "defectwww": None,               #    11 — spelling duplicate
            "Spallingw": None,               #     3 — spelling duplicate
            "bridge-cracks": None,           # Roboflow dummy category-0 row
        },
        "notes": "2,972 images / 9,363 annotations upstream, of which 2,533 "
                 "are crack-class. Hash-checked at ~97% new against existing "
                 "crack_structural holdings; 1 true duplicate in 30 samples "
                 "(distance 1 vs Volker_DSC01650), with a 4-8 distance tail "
                 "identified as low-texture concrete false positives. "
                 "CAVEAT: appears to be a SINGLE inspection campaign — one "
                 "lighting setup, one photographer's conventions, likely few "
                 "physical structures. Do not assume it generalises across "
                 "bridge types, materials or lighting.",
    },

    # ---------------------------------------------------------------
    # MANHOLE / HAZARD
    # ---------------------------------------------------------------
    "manhole_yolo": {
        # The original manhole source, kept here so all four Roboflow
        # sources are described in one place.
        "source_dataset": "RoboflowManhole",
        "project": None,  # not forked; downloaded export on disk
        "universe_url": "https://universe.roboflow.com/create-dataset-for-yolo/"
                        "manhole-cover-dataset-yolo",
        "img_prefix": "manhole_",
        "capture_context": "handheld",
        "license": "RoboflowManhole_CC_BY_4.0",
        "flatten_all_to": None,
        "class_map": {
            "Broken": "manhole_damaged",
            # Cover present but displaced / not seated (verified on sample
            # crops) — a damaged cover, not a missing one.
            "Lose": "manhole_damaged",
            "Uncovered": "manhole_missing",
            "Good": None,
            # Roboflow's dummy category 0, never used by real annotations.
            "Broken-Lose-Uncovered-Good": None,
        },
        "notes": "1427 images / 951 kept annotations.",
    },

    "manhole_g8rvh": {
        "source_dataset": "RoboflowManholeG8rvh",
        "project": "manhole-g8rvh-frolw",
        "universe_url": "https://universe.roboflow.com/manhole-projet/manhole-g8rvh",
        "img_prefix": "manholeg8_",
        # Mostly Google Street View frames of US suburban streets, plus a
        # minority of close-range phone photos.
        "capture_context": "vehicle_windshield",
        "license": "RoboflowManholeG8rvh_CC_BY_4.0",
        "flatten_all_to": None,
        "class_map": {
            "broke": "manhole_damaged",
            "uncover": "manhole_missing",
            "good": None,
            "good-lose-broke": None,   # Roboflow dummy category 0
        },
        "notes": "~97% of its photos are NOT in our existing manhole source "
                 "(2/78 sampled overlap). Yield is modest: 149 broke, 53 "
                 "uncover.",
    },

    "manhole_jinggai": {
        "source_dataset": "RoboflowManholeJinggai",
        "project": "-rqltz-wvcr2",
        "universe_url": "https://universe.roboflow.com/123-g4ip5/-rqltz",
        "img_prefix": "manholejg_",
        "capture_context": "handheld",
        "license": "RoboflowManholeJinggai_CC_BY_4.0",
        "flatten_all_to": None,
        # ---- MAPPING DECISIONS, all reversible by editing this block ----
        "class_map": {
            "broke": "manhole_damaged",
            "lose": "manhole_damaged",       # matches "Lose" in manhole_yolo
            "uncovered": "manhole_missing",
            # CONFIRMED, no change: crops show the cover lifted off or slid
            # aside with the HOLE EXPOSED, matching the `Uncovered` ->
            # manhole_missing logic used by the other manhole sources.
            # Two documented caveats, neither blocking:
            #   - this source's own `uncovered` (405) describes the same
            #     physical state as `open` (495) — redundant labels for one
            #     condition. Both correctly land on manhole_missing. A
            #     future source-mapping cleanup could consolidate them;
            #     deliberately NOT done here.
            #   - a minority of `open` instances show workers actively
            #     lifting a cover (maintenance in progress, not a fault).
            #     Not separable from the labels.
            "open": "manhole_missing",
            "good": None,
            # CONFIRMED from crops of the actual annotation boxes: covers
            # standing proud of the surrounding surface — raised concrete
            # collars, protruding above pavement, tilted up on one edge with
            # a clear step. None read as "domed but flush and driveable", so
            # this is a hazard, not a benign cover.
            # Roughly a quarter sit in grass verges, soil or newly-poured
            # plinths rather than the carriageway. Accepted as noise and
            # mapped wholesale: a raised cover in a verge is still a
            # pedestrian trip hazard. Do NOT split this label by surface.
            "raised": "manhole_damaged",
            # CONFIRMED from crops: the INVERSE of `raised` — covers sunken
            # or settled below road level, ringed by cracked and crumbling
            # asphalt, several in visible craters with rutted collars. Not a
            # load rating and not a property of an intact cover.
            # The name is most likely a mistranslation (plausibly 塌陷
            # collapse/subsidence, or 下沉 sinking). That uncertainty is a
            # documentation note only — the mapping rests on the image
            # evidence, not on resolving the word.
            "load": "manhole_damaged",
            # SKIPPED: bare numeric labels, no recoverable meaning.
            "0": None,
            "1": None,
            "2": None,
            # Roboflow's dummy category-0 row (named after the project's
            # annotation group), confirmed unused by any annotation.
            "123": None,
        },
        "notes": "42% of its photos duplicate our existing manhole source, "
                 "so conversion MUST dedup against it (--dedup-against) or "
                 "identical photos land in different splits.",
    },
}


def get(name: str) -> dict:
    if name not in ROBOFLOW_SOURCES:
        raise KeyError(f"Unknown Roboflow source '{name}'. "
                       f"Known: {sorted(ROBOFLOW_SOURCES)}")
    cfg = ROBOFLOW_SOURCES[name]
    if bool(cfg.get("class_map")) == bool(cfg.get("flatten_all_to")):
        raise ValueError(f"Source '{name}' must set exactly one of "
                         f"class_map / flatten_all_to")
    return cfg
