import argparse
import importlib.util
import json
import math
import os
import sys
import threading
import time
import traceback
import urllib.request
from pathlib import Path


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


REQUIRED_DEPS = [
    ("cv2", "opencv-python"),
    ("numpy", "numpy"),
    ("PIL", "Pillow"),
]

WINDOWS_DEPS = [
    ("dxcam", "dxcam"),
    ("win32api", "pywin32"),
    ("win32gui", "pywin32"),
]

DX_CAMERA = None
CACHE_VERSION = 4
MIN_TRACKING_CONFIDENCE = 0.45
MIN_REFINED_CONFIDENCE = 0.52
MIN_HOMOGRAPHY_INLIERS = 18
MAX_TRACK_SIFT_DIMENSION = 1280
MAX_CONSECUTIVE_FLOW_FRAMES = 10
LOCAL_REFERENCE_ZOOMS = (8, 7)
MAX_LOCAL_TILES_BY_ZOOM = {
    8: 196,
    7: 144,
}
LOCAL_REFERENCE_MARGIN_TILES_BY_ZOOM = {
    8: 2,
    7: 1,
}
MAX_REPROJECTION_ERROR = 8.0
MAX_FLOW_ERROR = 4.0
MIN_FLOW_INLIERS = 40
MAX_FLOW_FRAMES_DURING_RELOCK = 45

MAP_CONFIGS = {
    "shalulu": {
        "label": "夏露露村",
        "type": "image",
        "image": "maps/shalulu.png",
        "bounds": [[0, 0], [2048, 2048]],
    },
    "xinaya": {
        "label": "新芽山谷",
        "type": "tileLayer",
        "tileUrl": "https://wiki-dev-patch-oss.oss-cn-hangzhou.aliyuncs.com/res/ap/map/xysg/cbt2/G/{z}/tile-{x}_{y}.png",
        "zoom": 6,
        "maxZoom": 8,
        "tileSize": 256,
        "bounds": [[-8192, -8192], [8192, 8192]],
    },
    "fulisi": {
        "label": "弗利斯",
        "type": "tileLayer",
        "tileUrl": "https://wiki-dev-patch-oss.oss-cn-hangzhou.aliyuncs.com/res/ap/map/fls/cbt2/G/{z}/tile-{x}_{y}.png",
        "zoom": 6,
        "maxZoom": 8,
        "tileSize": 256,
        "bounds": [[-8192, -8192], [8192, 8192]],
    },
}


def emit(payload):
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def project_root_from_args(args):
    return Path(args.project_root).resolve()


def cache_root(project_root):
    return project_root / "overlay" / "cache" / "vision"


def get_config_bounds(project_root, map_id):
    official_path = project_root / "data" / "official" / f"{map_id}-worldmap.json"
    if official_path.exists():
        try:
            dataset = json.loads(official_path.read_text(encoding="utf-8"))
            bounds = dataset.get("transform", {}).get("bounds")
            if isinstance(bounds, list) and len(bounds) >= 2:
                return bounds
        except Exception:
            pass
    return MAP_CONFIGS[map_id]["bounds"]


def normalize_bounds(bounds):
    first, second = bounds[0], bounds[1]
    min_lat = min(float(first[0]), float(second[0]))
    max_lat = max(float(first[0]), float(second[0]))
    min_lng = min(float(first[1]), float(second[1]))
    max_lng = max(float(first[1]), float(second[1]))
    return min_lat, min_lng, max_lat, max_lng


def check_deps_payload(include_windows=True):
    modules = list(REQUIRED_DEPS)
    if include_windows and sys.platform.startswith("win"):
        modules.extend(WINDOWS_DEPS)

    missing = []
    seen_packages = set()
    for module_name, package_name in modules:
        if importlib.util.find_spec(module_name) is None and package_name not in seen_packages:
            missing.append(package_name)
            seen_packages.add(package_name)

    return {
        "type": "deps",
        "ok": len(missing) == 0,
        "missing": missing,
        "python": sys.executable,
        "version": sys.version.split()[0],
    }


def command_check_deps(_args):
    emit(check_deps_payload())
    return 0


def require_runtime_deps():
    payload = check_deps_payload()
    if not payload["ok"]:
        raise RuntimeError("Missing dependencies: " + ", ".join(payload["missing"]))


def command_list_windows(_args):
    require_runtime_deps()
    import win32gui

    windows = []

    def enum_handler(hwnd, _ctx):
        if not win32gui.IsWindowVisible(hwnd):
            return True
        title = win32gui.GetWindowText(hwnd).strip()
        if not title:
            return True
        left, top, right, bottom = win32gui.GetWindowRect(hwnd)
        width = right - left
        height = bottom - top
        if width < 160 or height < 120:
            return True
        windows.append({
            "id": str(hwnd),
            "title": title,
            "x": int(left),
            "y": int(top),
            "width": int(width),
            "height": int(height),
        })
        return True

    win32gui.EnumWindows(enum_handler, None)
    windows.sort(key=lambda item: (0 if any(key.lower() in item["title"].lower() for key in ["promilia", "azur", "蓝色星原"]) else 1, item["title"].lower()))
    emit({"type": "windows", "windows": windows})
    return 0


def get_reference_paths(project_root, map_id):
    root = cache_root(project_root) / map_id
    return {
        "dir": root,
        "image": root / "reference.png",
        "manifest": root / "manifest.json",
        "features": root / "features.npz",
        "local": root / "local",
    }


def get_local_reference_paths(project_root, map_id, zoom, tile_range):
    root = get_reference_paths(project_root, map_id)["local"] / f"z{zoom}" / (
        f"x{tile_range['minX']}_{tile_range['maxX']}_y{tile_range['minY']}_{tile_range['maxY']}"
    )
    return {
        "dir": root,
        "image": root / "reference.png",
        "manifest": root / "manifest.json",
        "features": root / "features.npz",
    }


def read_manifest(project_root, map_id):
    paths = get_reference_paths(project_root, map_id)
    if paths["manifest"].exists():
        try:
            return json.loads(paths["manifest"].read_text(encoding="utf-8"))
        except Exception:
            return None
    return None


def write_manifest(project_root, map_id, manifest):
    paths = get_reference_paths(project_root, map_id)
    paths["dir"].mkdir(parents=True, exist_ok=True)
    paths["manifest"].write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def ensure_shalulu_reference(project_root):
    from PIL import Image

    source = project_root / MAP_CONFIGS["shalulu"]["image"]
    if not source.exists():
        raise FileNotFoundError(str(source))
    with Image.open(source) as image:
        width, height = image.size

    manifest = {
        "mapId": "shalulu",
        "source": str(source),
        "referenceImage": str(source),
        "width": width,
        "height": height,
        "bounds": get_config_bounds(project_root, "shalulu"),
        "version": CACHE_VERSION,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "cacheKind": "source-image",
    }
    write_manifest(project_root, "shalulu", manifest)
    return manifest


def tile_units_for_zoom(map_id, zoom):
    config = MAP_CONFIGS[map_id]
    max_zoom = config["maxZoom"]
    tile_size = config["tileSize"]
    return tile_size * (2 ** (max_zoom - zoom))


def get_native_tile_range(project_root, map_id, zoom=None):
    config = MAP_CONFIGS[map_id]
    zoom = config["zoom"] if zoom is None else zoom
    tile_units = tile_units_for_zoom(map_id, zoom)
    min_lat, min_lng, max_lat, max_lng = normalize_bounds(get_config_bounds(project_root, map_id))
    min_x = math.floor(min_lng / tile_units)
    max_x = math.ceil(max_lng / tile_units) - 1
    min_y = math.floor(-max_lat / tile_units)
    max_y = math.ceil(-min_lat / tile_units) - 1
    return {
        "zoom": zoom,
        "tileUnits": tile_units,
        "minX": int(min_x),
        "maxX": int(max_x),
        "minY": int(min_y),
        "maxY": int(max_y),
        "columns": int(max_x - min_x + 1),
        "rows": int(max_y - min_y + 1),
    }


def clamp_tile_range(tile_range, limit):
    return {
        "zoom": tile_range["zoom"],
        "tileUnits": tile_range["tileUnits"],
        "minX": max(tile_range["minX"], limit["minX"]),
        "maxX": min(tile_range["maxX"], limit["maxX"]),
        "minY": max(tile_range["minY"], limit["minY"]),
        "maxY": min(tile_range["maxY"], limit["maxY"]),
    }


def finalize_tile_range(tile_range):
    tile_range = dict(tile_range)
    tile_range["columns"] = int(tile_range["maxX"] - tile_range["minX"] + 1)
    tile_range["rows"] = int(tile_range["maxY"] - tile_range["minY"] + 1)
    return tile_range


def tile_count(tile_range):
    return max(0, int(tile_range.get("columns", 0))) * max(0, int(tile_range.get("rows", 0)))


def max_local_tiles_for_zoom(zoom):
    return MAX_LOCAL_TILES_BY_ZOOM.get(int(zoom), 96)


def local_reference_margin_for_zoom(zoom):
    return LOCAL_REFERENCE_MARGIN_TILES_BY_ZOOM.get(int(zoom), 1)


def summarize_tile_range(tile_range):
    return (
        f"z{tile_range['zoom']} "
        f"{tile_range['columns']}x{tile_range['rows']} "
        f"x{tile_range['minX']}..{tile_range['maxX']} "
        f"y{tile_range['minY']}..{tile_range['maxY']}"
    )


def get_tile_range_for_map_bounds(project_root, map_id, zoom, map_bounds, margin_tiles=0):
    min_lat, min_lng, max_lat, max_lng = normalize_bounds([[map_bounds["minLat"], map_bounds["minLng"]], [map_bounds["maxLat"], map_bounds["maxLng"]]])
    tile_units = tile_units_for_zoom(map_id, zoom)
    tile_range = {
        "zoom": zoom,
        "tileUnits": tile_units,
        "minX": math.floor(min_lng / tile_units) - margin_tiles,
        "maxX": math.ceil(max_lng / tile_units) - 1 + margin_tiles,
        "minY": math.floor(-max_lat / tile_units) - margin_tiles,
        "maxY": math.ceil(-min_lat / tile_units) - 1 + margin_tiles,
    }
    full_range = get_native_tile_range(project_root, map_id, zoom)
    return finalize_tile_range(clamp_tile_range(tile_range, full_range))


def get_local_tile_range(project_root, map_id, zoom, map_bounds):
    tile_range = get_tile_range_for_map_bounds(
        project_root,
        map_id,
        zoom,
        map_bounds,
        margin_tiles=local_reference_margin_for_zoom(zoom),
    )
    if tile_range["columns"] <= 0 or tile_range["rows"] <= 0:
        return None, f"z{zoom} 局部范围为空"
    tile_total = tile_count(tile_range)
    max_tiles = max_local_tiles_for_zoom(zoom)
    if tile_total > max_tiles:
        return None, f"z{zoom} 局部范围过大: {tile_range['columns']}x{tile_range['rows']}={tile_total} > {max_tiles}"
    return tile_range, None


def tile_range_to_bounds(tile_range):
    units = float(tile_range["tileUnits"])
    min_lng = tile_range["minX"] * units
    max_lng = (tile_range["maxX"] + 1) * units
    max_lat = -tile_range["minY"] * units
    min_lat = -(tile_range["maxY"] + 1) * units
    return [[min_lat, min_lng], [max_lat, max_lng]]


def download_tile(url, target, timeout=20):
    if target.exists() and target.stat().st_size > 0:
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "AzPrMapOverlay/0.1"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        target.write_bytes(response.read())
    return True


def build_tile_mosaic(project_root, map_id, zoom, tile_range, paths, progress=False):
    from PIL import Image

    config = MAP_CONFIGS[map_id]
    tile_size = config["tileSize"]
    tile_dir = get_reference_paths(project_root, map_id)["dir"] / f"tiles-z{zoom}"
    paths["dir"].mkdir(parents=True, exist_ok=True)

    total = tile_range["columns"] * tile_range["rows"]
    downloaded = 0
    done = 0
    for y in range(tile_range["minY"], tile_range["maxY"] + 1):
        for x in range(tile_range["minX"], tile_range["maxX"] + 1):
            tile_url = config["tileUrl"].format(z=zoom, x=x, y=y)
            tile_path = tile_dir / f"tile-{x}_{y}.png"
            try:
                if download_tile(tile_url, tile_path):
                    downloaded += 1
            except Exception as error:
                emit({
                    "type": "cache-progress",
                    "mapId": map_id,
                    "state": "warning",
                    "message": f"瓦片 {x},{y} 下载失败: {error}",
                })
            done += 1
            if progress and (done == total or done % 16 == 0):
                emit({
                    "type": "cache-progress",
                    "mapId": map_id,
                    "state": "downloading",
                    "done": done,
                    "total": total,
                    "downloaded": downloaded,
                })

    reference = Image.new("RGB", (tile_range["columns"] * tile_size, tile_range["rows"] * tile_size), (0, 0, 0))
    missing = 0
    for y in range(tile_range["minY"], tile_range["maxY"] + 1):
        for x in range(tile_range["minX"], tile_range["maxX"] + 1):
            tile_path = tile_dir / f"tile-{x}_{y}.png"
            if not tile_path.exists() or tile_path.stat().st_size == 0:
                missing += 1
                continue
            try:
                with Image.open(tile_path) as tile:
                    paste_x = (x - tile_range["minX"]) * tile_size
                    paste_y = (y - tile_range["minY"]) * tile_size
                    reference.paste(tile.convert("RGB"), (paste_x, paste_y))
            except Exception:
                missing += 1

    reference.save(paths["image"])
    if paths["features"].exists():
        paths["features"].unlink()
    return reference, missing, downloaded


def build_tile_reference(project_root, map_id):
    config = MAP_CONFIGS[map_id]
    zoom = config["zoom"]
    tile_size = config["tileSize"]
    tile_range = get_native_tile_range(project_root, map_id, zoom)
    paths = get_reference_paths(project_root, map_id)
    reference, missing, _downloaded = build_tile_mosaic(project_root, map_id, zoom, tile_range, paths, progress=True)
    manifest = {
        "mapId": map_id,
        "tileUrl": config["tileUrl"],
        "zoom": zoom,
        "maxZoom": config["maxZoom"],
        "tileSize": tile_size,
        "tileRange": tile_range,
        "referenceImage": str(paths["image"]),
        "width": reference.width,
        "height": reference.height,
        "bounds": get_config_bounds(project_root, map_id),
        "missingTiles": missing,
        "version": CACHE_VERSION,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "cacheKind": "downloaded-tiles",
    }
    write_manifest(project_root, map_id, manifest)
    return manifest


def ensure_local_reference(project_root, map_id, zoom, map_bounds, allow_build=True):
    if MAP_CONFIGS[map_id]["type"] != "tileLayer":
        return None

    tile_range, _reason = get_local_tile_range(project_root, map_id, zoom, map_bounds)
    if not tile_range:
        return None
    tile_total = tile_count(tile_range)
    max_tiles = max_local_tiles_for_zoom(zoom)

    paths = get_local_reference_paths(project_root, map_id, zoom, tile_range)
    if paths["manifest"].exists() and paths["image"].exists():
        try:
            manifest = json.loads(paths["manifest"].read_text(encoding="utf-8"))
            if manifest.get("version") == CACHE_VERSION:
                return manifest
        except Exception:
            pass
    if not allow_build:
        return None

    emit({
        "type": "cache-progress",
        "mapId": map_id,
        "state": "refining",
        "message": f"加载高清瓦片 {summarize_tile_range(tile_range)}",
        "zoom": zoom,
        "total": tile_total,
    })
    reference, missing, downloaded = build_tile_mosaic(project_root, map_id, zoom, tile_range, paths, progress=False)
    manifest = {
        "mapId": map_id,
        "tileUrl": MAP_CONFIGS[map_id]["tileUrl"],
        "zoom": zoom,
        "maxZoom": MAP_CONFIGS[map_id]["maxZoom"],
        "tileSize": MAP_CONFIGS[map_id]["tileSize"],
        "tileRange": tile_range,
        "referenceImage": str(paths["image"]),
        "featuresPath": str(paths["features"]),
        "width": reference.width,
        "height": reference.height,
        "bounds": tile_range_to_bounds(tile_range),
        "missingTiles": missing,
        "downloadedTiles": downloaded,
        "maxTiles": max_tiles,
        "version": CACHE_VERSION,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "cacheKind": "local-tiles",
    }
    paths["manifest"].write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def ensure_reference(project_root, map_id, force=False):
    if map_id not in MAP_CONFIGS:
        raise ValueError(f"Unsupported map id: {map_id}")

    manifest = read_manifest(project_root, map_id)
    if manifest and not force:
        image_path = Path(manifest["referenceImage"])
        if image_path.exists() and manifest.get("version") == CACHE_VERSION:
            return manifest

    emit({"type": "cache-progress", "mapId": map_id, "state": "building", "message": "构建参考图"})
    if map_id == "shalulu":
        manifest = ensure_shalulu_reference(project_root)
    else:
        manifest = build_tile_reference(project_root, map_id)
    emit({"type": "cache-progress", "mapId": map_id, "state": "ready", "manifest": manifest})
    return manifest


def command_build_cache(args):
    project_root = project_root_from_args(args)
    manifest = ensure_reference(project_root, args.map_id, force=args.force)
    emit({"type": "cache", "ok": True, "mapId": args.map_id, "manifest": manifest})
    return 0


def load_or_build_features(project_root, map_id, manifest):
    import cv2
    import numpy as np

    paths = get_reference_paths(project_root, map_id)
    features_path = Path(manifest.get("featuresPath") or paths["features"])
    if features_path.exists():
        try:
            data = np.load(features_path, allow_pickle=False)
            kp_points = data["kp_points"].astype(np.float32)
            descriptors = data["descriptors"].astype(np.float32)
            if len(kp_points) > 0 and descriptors.size > 0:
                return kp_points, descriptors
        except Exception:
            pass

    image_path = Path(manifest["referenceImage"])
    reference = cv2.imread(str(image_path), cv2.IMREAD_GRAYSCALE)
    if reference is None:
        raise RuntimeError(f"Cannot read reference image: {image_path}")

    area = reference.shape[0] * reference.shape[1]
    nfeatures = int(max(3000, min(14000, area / 1400)))
    sift = cv2.SIFT_create(nfeatures=nfeatures)
    keypoints, descriptors = sift.detectAndCompute(reference, None)
    if descriptors is None or not keypoints:
        raise RuntimeError("Reference image has no SIFT features")

    kp_points = np.float32([kp.pt for kp in keypoints])
    features_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(features_path, kp_points=kp_points, descriptors=descriptors.astype(np.float32))
    return kp_points, descriptors.astype(np.float32)


def load_cached_features(project_root, map_id, manifest):
    import numpy as np

    paths = get_reference_paths(project_root, map_id)
    features_path = Path(manifest.get("featuresPath") or paths["features"])
    if not features_path.exists():
        return None
    try:
        data = np.load(features_path, allow_pickle=False)
        kp_points = data["kp_points"].astype(np.float32)
        descriptors = data["descriptors"].astype(np.float32)
        if len(kp_points) > 0 and descriptors.size > 0:
            return kp_points, descriptors
    except Exception:
        return None
    return None


def make_reference_matcher(des_ref, checks=48):
    import cv2
    import numpy as np

    matcher = cv2.FlannBasedMatcher(dict(algorithm=1, trees=4), dict(checks=checks))
    matcher.add([np.ascontiguousarray(des_ref.astype(np.float32))])
    matcher.train()
    return matcher


class ReferenceMatchCache:
    def __init__(self, project_root, map_id):
        self.project_root = project_root
        self.map_id = map_id
        self.cache = {}

    def _key(self, manifest):
        features_path = manifest.get("featuresPath") or get_reference_paths(self.project_root, self.map_id)["features"]
        return (
            str(Path(features_path)),
            str(manifest.get("version", "")),
            str(manifest.get("generatedAt", "")),
        )

    def get(self, manifest, build_features=False):
        key = self._key(manifest)
        if key in self.cache:
            return self.cache[key]

        if build_features:
            kp_ref, des_ref = load_or_build_features(self.project_root, self.map_id, manifest)
        else:
            loaded = load_cached_features(self.project_root, self.map_id, manifest)
            if not loaded:
                return None
            kp_ref, des_ref = loaded

        matcher = make_reference_matcher(des_ref)
        payload = {
            "keypoints": kp_ref,
            "matcher": matcher,
            "descriptors": int(len(des_ref)),
        }
        self.cache[key] = payload
        return payload


class LocalReferenceBuilder:
    def __init__(self, project_root, map_id):
        self.project_root = project_root
        self.map_id = map_id
        self.lock = threading.Lock()
        self.inflight = set()

    def request(self, map_bounds):
        if MAP_CONFIGS[self.map_id]["type"] != "tileLayer":
            return False

        for zoom in LOCAL_REFERENCE_ZOOMS:
            tile_range, _reason = get_local_tile_range(self.project_root, self.map_id, zoom, map_bounds)
            if not tile_range:
                continue
            paths = get_local_reference_paths(self.project_root, self.map_id, zoom, tile_range)
            if paths["manifest"].exists() and paths["image"].exists() and paths["features"].exists():
                return False

            key = (
                int(zoom),
                int(tile_range["minX"]),
                int(tile_range["maxX"]),
                int(tile_range["minY"]),
                int(tile_range["maxY"]),
            )
            with self.lock:
                if key in self.inflight:
                    return False
                self.inflight.add(key)

            thread = threading.Thread(
                target=self._build,
                args=(zoom, map_bounds, key),
                daemon=True,
            )
            thread.start()
            return True
        return False

    def _build(self, zoom, map_bounds, key):
        try:
            manifest = ensure_local_reference(self.project_root, self.map_id, zoom, map_bounds, allow_build=True)
            if manifest:
                load_or_build_features(self.project_root, self.map_id, manifest)
                emit({
                    "type": "cache-progress",
                    "mapId": self.map_id,
                    "state": "ready",
                    "message": f"高清 z{zoom} 已就绪",
                    "zoom": zoom,
                })
        except Exception as error:
            emit({
                "type": "cache-progress",
                "mapId": self.map_id,
                "state": "error",
                "message": f"高清 z{zoom} 构建失败: {error}",
                "zoom": zoom,
            })
        finally:
            with self.lock:
                self.inflight.discard(key)


class GlobalRelockWorker:
    def __init__(self, project_root, map_id, manifest, base_reference, feature_cache, local_builder):
        self.project_root = project_root
        self.map_id = map_id
        self.manifest = manifest
        self.base_reference = base_reference
        self.feature_cache = feature_cache
        self.local_builder = local_builder
        self.lock = threading.Lock()
        self.inflight = False
        self.result = None
        self.request_id = 0

    def is_busy(self):
        with self.lock:
            return self.inflight

    def take_result(self):
        with self.lock:
            result = self.result
            self.result = None
            return result

    def start(self, gray, mask, rect, capture_method, allow_local_refine):
        with self.lock:
            if self.inflight:
                return False
            self.inflight = True
            self.request_id += 1
            request_id = self.request_id

        gray_snapshot = gray.copy()
        mask_snapshot = mask.copy() if mask is not None else None
        rect_snapshot = dict(rect)
        thread = threading.Thread(
            target=self._run,
            args=(request_id, gray_snapshot, mask_snapshot, rect_snapshot, capture_method, bool(allow_local_refine)),
            daemon=True,
        )
        thread.start()
        return True

    def _run(self, request_id, gray, mask, rect, capture_method, allow_local_refine):
        import cv2

        started_at = time.monotonic()
        calibration = None
        diagnostic = None
        try:
            sift = cv2.SIFT_create(nfeatures=3600)
            keypoints, descriptors = detect_frame_features(sift, gray, mask)
            if descriptors is not None and len(keypoints) >= 8:
                base_calibration, base_diagnostic = attempt_reference_match(
                    self.map_id,
                    self.manifest,
                    self.base_reference["keypoints"],
                    None,
                    keypoints,
                    descriptors,
                    self.base_reference["matcher"],
                    rect,
                    capture_method,
                    f"global-z{self.manifest.get('zoom', MAP_CONFIGS[self.map_id].get('zoom', '-'))}",
                    MIN_TRACKING_CONFIDENCE,
                )
                diagnostic = base_diagnostic
                calibration = base_calibration

                if calibration and MAP_CONFIGS[self.map_id]["type"] == "tileLayer":
                    refined_bounds = calibration_to_expanded_map_bounds(self.project_root, calibration, factor=0.20)
                    if allow_local_refine:
                        try:
                            refined, refined_diagnostic = attempt_local_match(
                                self.project_root,
                                self.map_id,
                                refined_bounds,
                                keypoints,
                                descriptors,
                                self.feature_cache,
                                rect,
                                capture_method,
                                "global-local-refine",
                                allow_build=False,
                                build_features=False,
                            )
                            if refined:
                                calibration = refined
                                diagnostic = refined_diagnostic
                            else:
                                self.local_builder.request(refined_bounds)
                        except Exception:
                            self.local_builder.request(refined_bounds)
                    else:
                        self.local_builder.request(refined_bounds)
            else:
                diagnostic = {"ok": False, "reason": "当前画面特征不足", "matches": 0}
        except Exception as error:
            diagnostic = {"ok": False, "reason": f"全局重锁失败: {error}", "matches": 0}

        payload = {
            "requestId": request_id,
            "calibration": calibration,
            "diagnostic": diagnostic,
            "gray": gray,
            "mask": mask,
            "rect": rect,
            "durationMs": int((time.monotonic() - started_at) * 1000),
        }
        with self.lock:
            self.result = payload
            self.inflight = False


def detect_frame_features(sift, gray, mask=None, max_dimension=MAX_TRACK_SIFT_DIMENSION):
    import cv2

    height, width = gray.shape[:2]
    scale = min(1.0, float(max_dimension) / max(1, max(width, height)))
    if scale < 0.999:
        scaled_size = (max(1, int(round(width * scale))), max(1, int(round(height * scale))))
        small_gray = cv2.resize(gray, scaled_size, interpolation=cv2.INTER_AREA)
        small_mask = cv2.resize(mask, scaled_size, interpolation=cv2.INTER_NEAREST) if mask is not None else None
        keypoints, descriptors = sift.detectAndCompute(small_gray, small_mask)
        if keypoints:
            inverse = 1.0 / scale
            for keypoint in keypoints:
                keypoint.pt = (keypoint.pt[0] * inverse, keypoint.pt[1] * inverse)
                keypoint.size *= inverse
        return keypoints, descriptors
    return sift.detectAndCompute(gray, mask)


def get_window_rect(hwnd):
    import win32gui
    left, top, right, bottom = win32gui.GetWindowRect(hwnd)
    return {
        "x": int(left),
        "y": int(top),
        "width": int(right - left),
        "height": int(bottom - top),
    }


def get_window_title(hwnd):
    import win32gui
    return win32gui.GetWindowText(hwnd).strip()


def make_tracking_mask(frame, window_title=""):
    import cv2
    import numpy as np

    height, width = frame.shape[:2]
    mask = np.full((height, width), 255, dtype=np.uint8)

    border = max(4, min(14, int(min(width, height) * 0.01)))
    mask[:border, :] = 0
    mask[-border:, :] = 0
    mask[:, :border] = 0
    mask[:, -border:] = 0

    # The overlay control panel sits on the right and is captured by DXGI.
    # It is static relative to the screen, so it must not drive matching or flow.
    if width >= 900:
        panel_width = min(380, max(300, int(width * 0.19)))
        mask[:, width - panel_width:] = 0

    # Game map/HUD chrome is also mostly static relative to the screen.
    # Keep the central map texture dominant for SIFT and LK flow.
    top_hud = min(96, max(48, int(height * 0.075)))
    bottom_hud = min(64, max(28, int(height * 0.045)))
    side_hud = min(96, max(28, int(width * 0.04)))
    mask[:top_hud, :] = 0
    mask[height - bottom_hud:, :] = 0
    mask[:, :side_hud] = 0

    title = window_title.lower()
    if "chrome" in title or "地图标记工具" in window_title:
        top_guard = min(86, max(60, int(height * 0.075)))
        left_guard = min(330, max(240, int(width * 0.16)))
        mask[:top_guard, :] = 0
        mask[:, :left_guard] = 0

    # Remove tiny isolated islands after hard UI cuts.
    kernel = np.ones((9, 9), dtype=np.uint8)
    return cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)


def get_screen_bounds():
    import win32api
    import win32con

    return {
        "x": int(win32api.GetSystemMetrics(win32con.SM_XVIRTUALSCREEN)),
        "y": int(win32api.GetSystemMetrics(win32con.SM_YVIRTUALSCREEN)),
        "width": int(win32api.GetSystemMetrics(win32con.SM_CXVIRTUALSCREEN)),
        "height": int(win32api.GetSystemMetrics(win32con.SM_CYVIRTUALSCREEN)),
    }


def clamp_rect_to_screen(rect):
    bounds = get_screen_bounds()
    left = max(rect["x"], bounds["x"])
    top = max(rect["y"], bounds["y"])
    right = min(rect["x"] + rect["width"], bounds["x"] + bounds["width"])
    bottom = min(rect["y"] + rect["height"], bounds["y"] + bounds["height"])
    if right <= left or bottom <= top:
        raise RuntimeError("Window is outside the visible desktop")
    return {
        "x": int(left),
        "y": int(top),
        "width": int(right - left),
        "height": int(bottom - top),
    }


def is_probably_blank_frame(frame):
    import cv2

    if frame is None or frame.size == 0:
        return True
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    mean, stddev = cv2.meanStdDev(gray)
    return float(stddev[0][0]) < 2.0 and (float(mean[0][0]) < 8.0 or float(mean[0][0]) > 247.0)


def capture_dxgi_rect(rect):
    global DX_CAMERA
    import dxcam

    capture_rect = clamp_rect_to_screen(rect)
    if DX_CAMERA is None:
        DX_CAMERA = dxcam.create(output_color="BGR")
    left = capture_rect["x"]
    top = capture_rect["y"]
    right = left + capture_rect["width"]
    bottom = top + capture_rect["height"]
    frame = DX_CAMERA.grab(region=(left, top, right, bottom))
    if frame is None:
        raise RuntimeError("DXGI capture returned no frame")
    if is_probably_blank_frame(frame):
        raise RuntimeError("DXGI capture returned a blank frame")
    return frame, capture_rect


def capture_screen_rect(rect):
    import cv2
    import numpy as np
    from PIL import ImageGrab

    capture_rect = clamp_rect_to_screen(rect)
    bbox = (
        capture_rect["x"],
        capture_rect["y"],
        capture_rect["x"] + capture_rect["width"],
        capture_rect["y"] + capture_rect["height"],
    )
    image = ImageGrab.grab(bbox=bbox)
    frame = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    if is_probably_blank_frame(frame):
        raise RuntimeError("Screen capture returned a blank frame")
    return frame, capture_rect


def capture_window(hwnd):
    rect = get_window_rect(hwnd)
    if rect["width"] <= 0 or rect["height"] <= 0:
        raise RuntimeError("Window has invalid size")

    try:
        frame, capture_rect = capture_dxgi_rect(rect)
        return frame, capture_rect, "dxgi"
    except Exception as dxgi_error:
        frame, capture_rect = capture_screen_rect(rect)
        return frame, capture_rect, f"screen-after-dxgi-error: {dxgi_error}"


def matrix_to_list(matrix):
    return [[float(matrix[row, col]) for col in range(3)] for row in range(3)]


def transform_points(matrix, points):
    import cv2
    import numpy as np

    pts = np.float32(points).reshape(-1, 1, 2)
    mapped = cv2.perspectiveTransform(pts, matrix).reshape(-1, 2)
    return [{"x": float(x), "y": float(y)} for x, y in mapped]


def make_reference_payload(manifest):
    return {
        "width": int(manifest["width"]),
        "height": int(manifest["height"]),
        "bounds": manifest["bounds"],
        "mapId": manifest["mapId"],
        "zoom": manifest.get("zoom"),
        "cacheKind": manifest.get("cacheKind"),
    }


def clamp01(value):
    return max(0.0, min(1.0, float(value)))


def screen_polygon_from_rect(rect):
    return [
        [rect["x"], rect["y"]],
        [rect["x"] + rect["width"], rect["y"]],
        [rect["x"] + rect["width"], rect["y"] + rect["height"]],
        [rect["x"], rect["y"] + rect["height"]],
    ]


def reference_pixel_to_map(reference, x, y):
    min_lat, min_lng, max_lat, max_lng = normalize_bounds(reference["bounds"])
    width = float(reference["width"])
    height = float(reference["height"])
    return {
        "lat": max_lat - (float(y) / height) * (max_lat - min_lat),
        "lng": min_lng + (float(x) / width) * (max_lng - min_lng),
    }


def reference_polygon_to_map_bounds(reference, polygon):
    points = [reference_pixel_to_map(reference, point["x"], point["y"]) for point in polygon]
    return {
        "minLat": min(point["lat"] for point in points),
        "maxLat": max(point["lat"] for point in points),
        "minLng": min(point["lng"] for point in points),
        "maxLng": max(point["lng"] for point in points),
    }


def expand_map_bounds(project_root, map_id, bounds, factor=0.35, min_padding=384.0):
    full_min_lat, full_min_lng, full_max_lat, full_max_lng = normalize_bounds(get_config_bounds(project_root, map_id))
    lat_span = max(1.0, bounds["maxLat"] - bounds["minLat"])
    lng_span = max(1.0, bounds["maxLng"] - bounds["minLng"])
    lat_pad = max(min_padding, lat_span * factor)
    lng_pad = max(min_padding, lng_span * factor)
    return {
        "minLat": max(full_min_lat, bounds["minLat"] - lat_pad),
        "maxLat": min(full_max_lat, bounds["maxLat"] + lat_pad),
        "minLng": max(full_min_lng, bounds["minLng"] - lng_pad),
        "maxLng": min(full_max_lng, bounds["maxLng"] + lng_pad),
    }


def score_homography(src, dst, matrix, mask):
    import cv2
    import numpy as np

    if matrix is None or mask is None or not np.isfinite(matrix).all():
        return None

    inlier_mask = mask.ravel().astype(bool)
    inliers = int(inlier_mask.sum())
    total = int(len(src))
    if total <= 0 or inliers < MIN_HOMOGRAPHY_INLIERS:
        return None

    projected = cv2.perspectiveTransform(src, matrix)
    errors = np.linalg.norm(projected.reshape(-1, 2) - dst.reshape(-1, 2), axis=1)
    inlier_errors = errors[inlier_mask]
    if len(inlier_errors) == 0:
        return None
    inlier_dst = dst.reshape(-1, 2)[inlier_mask]
    ref_min_x = float(np.min(inlier_dst[:, 0]))
    ref_max_x = float(np.max(inlier_dst[:, 0]))
    ref_min_y = float(np.min(inlier_dst[:, 1]))
    ref_max_y = float(np.max(inlier_dst[:, 1]))

    median_error = float(np.median(inlier_errors))
    mean_error = float(np.mean(inlier_errors))
    normalized = matrix.astype(np.float64)
    if abs(normalized[2, 2]) > 1e-8:
        normalized = normalized / normalized[2, 2]
    linear = normalized[:2, :2]
    determinant = float(np.linalg.det(linear))
    perspective = float(math.hypot(normalized[2, 0], normalized[2, 1]))
    geometry_ok = np.isfinite(determinant) and abs(determinant) > 1e-7 and perspective < 0.01

    inlier_ratio = inliers / max(1, total)
    inlier_score = clamp01(inliers / 48)
    ratio_score = clamp01(inlier_ratio / 0.62)
    error_score = clamp01(1.0 - (median_error / MAX_REPROJECTION_ERROR))
    geometry_score = 1.0 if geometry_ok else 0.0
    confidence = (0.34 * inlier_score) + (0.28 * ratio_score) + (0.28 * error_score) + (0.10 * geometry_score)
    if median_error > MAX_REPROJECTION_ERROR:
        confidence *= 0.35
    if not geometry_ok:
        confidence *= 0.5

    return {
        "inliers": inliers,
        "total": total,
        "inlierRatio": float(inlier_ratio),
        "medianError": median_error,
        "meanError": mean_error,
        "referenceBoundsPx": {
            "minX": ref_min_x,
            "maxX": ref_max_x,
            "minY": ref_min_y,
            "maxY": ref_max_y,
        },
        "determinant": determinant,
        "perspective": perspective,
        "confidence": clamp01(confidence),
        "geometryOk": bool(geometry_ok),
    }


def match_reference(keypoints, descriptors, kp_ref, des_ref, matcher, ratio=0.72):
    import cv2
    import numpy as np

    if descriptors is None or len(keypoints) < 8:
        return {"ok": False, "reason": "当前画面特征不足", "matches": 0}

    query = np.ascontiguousarray(descriptors.astype(np.float32))
    if des_ref is None:
        matches = matcher.knnMatch(query, k=2)
    else:
        matches = matcher.knnMatch(query, des_ref, k=2)
    good = [pair[0] for pair in matches if len(pair) == 2 and pair[0].distance < ratio * pair[1].distance]
    if len(good) < 12:
        return {"ok": False, "reason": f"匹配不足: {len(good)}", "matches": len(good)}

    src = np.float32([keypoints[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    dst = np.float32([kp_ref[m.trainIdx] for m in good]).reshape(-1, 1, 2)
    matrix, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
    quality = score_homography(src, dst, matrix, mask)
    if not quality:
        return {"ok": False, "reason": "无法计算透视矩阵", "matches": len(good)}

    return {
        "ok": True,
        "matrix": matrix,
        "matches": len(good),
        **quality,
    }


def build_calibration_from_match(map_id, rect, reference_payload, match, capture_method, source):
    import numpy as np

    translation = np.array([[1.0, 0.0, -rect["x"]], [0.0, 1.0, -rect["y"]], [0.0, 0.0, 1.0]], dtype=np.float64)
    h_screen_to_ref = match["matrix"].astype(np.float64).dot(translation)
    h_ref_to_screen = np.linalg.inv(h_screen_to_ref)
    screen_polygon = screen_polygon_from_rect(rect)
    reference_polygon = transform_points(h_screen_to_ref, screen_polygon)

    return {
        "mapId": map_id,
        "confidence": float(match["confidence"]),
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "reference": reference_payload,
        "homographyScreenToRef": matrix_to_list(h_screen_to_ref),
        "homographyRefToScreen": matrix_to_list(h_ref_to_screen),
        "visiblePolygon": [{"x": float(x), "y": float(y)} for x, y in screen_polygon],
        "referencePolygon": reference_polygon,
        "matchedReferenceBounds": match.get("referenceBoundsPx"),
        "windowRect": rect,
        "matches": int(match["matches"]),
        "inliers": int(match["inliers"]),
        "inlierRatio": float(match["inlierRatio"]),
        "reprojectionError": float(match["medianError"]),
        "captureMethod": capture_method,
        "source": source,
        "status": "tracking",
    }


def attempt_reference_match(map_id, reference_manifest, kp_ref, des_ref, keypoints, descriptors, matcher, rect, capture_method, source, min_confidence):
    reference_payload = make_reference_payload(reference_manifest)
    match = match_reference(keypoints, descriptors, kp_ref, des_ref, matcher)
    if not match.get("ok"):
        return None, match
    if match["confidence"] < min_confidence:
        match["reason"] = f"低置信度: {match['confidence']:.2f}"
        return None, match
    calibration = build_calibration_from_match(map_id, rect, reference_payload, match, capture_method, source)
    return calibration, match


def choose_local_reference(project_root, map_id, map_bounds, allow_build=True):
    for zoom in LOCAL_REFERENCE_ZOOMS:
        manifest = ensure_local_reference(project_root, map_id, zoom, map_bounds, allow_build=allow_build)
        if manifest:
            return manifest
    return None


def attempt_local_match(
    project_root,
    map_id,
    map_bounds,
    keypoints,
    descriptors,
    feature_cache,
    rect,
    capture_method,
    source,
    allow_build=True,
    build_features=False,
):
    last_diagnostic = {"ok": False, "reason": "局部参考区域过大或不可用", "matches": 0}
    for zoom in LOCAL_REFERENCE_ZOOMS:
        _tile_range, range_reason = get_local_tile_range(project_root, map_id, zoom, map_bounds)
        if range_reason:
            last_diagnostic = {"ok": False, "reason": range_reason, "matches": 0}
            continue
        manifest = ensure_local_reference(project_root, map_id, zoom, map_bounds, allow_build=allow_build)
        if not manifest:
            last_diagnostic = {
                "ok": False,
                "reason": f"z{zoom} 高清局部缓存未就绪",
                "matches": 0,
            }
            continue
        reference = feature_cache.get(manifest, build_features=build_features)
        if not reference:
            last_diagnostic = {
                "ok": False,
                "reason": f"z{zoom} 高清特征未就绪",
                "matches": 0,
            }
            continue
        calibration, diagnostic = attempt_reference_match(
            map_id,
            manifest,
            reference["keypoints"],
            None,
            keypoints,
            descriptors,
            reference["matcher"],
            rect,
            capture_method,
            f"{source}-z{zoom}",
            MIN_REFINED_CONFIDENCE,
        )
        if calibration:
            return calibration, diagnostic
        last_diagnostic = diagnostic
    return None, last_diagnostic


def calibration_to_expanded_map_bounds(project_root, calibration, factor=0.35):
    matched_bounds = calibration.get("matchedReferenceBounds")
    if matched_bounds:
        reference = calibration["reference"]
        points = [
            reference_pixel_to_map(reference, matched_bounds["minX"], matched_bounds["minY"]),
            reference_pixel_to_map(reference, matched_bounds["maxX"], matched_bounds["maxY"]),
        ]
        bounds = {
            "minLat": min(point["lat"] for point in points),
            "maxLat": max(point["lat"] for point in points),
            "minLng": min(point["lng"] for point in points),
            "maxLng": max(point["lng"] for point in points),
        }
    else:
        bounds = reference_polygon_to_map_bounds(calibration["reference"], calibration["referencePolygon"])
    return expand_map_bounds(project_root, calibration["mapId"], bounds, factor=factor)


def matrix_from_list(matrix):
    import numpy as np

    return np.array(matrix, dtype=np.float64)


def attempt_optical_flow(prev_gray, gray, prev_rect, rect, last_good, prev_mask=None, mask=None):
    import cv2
    import numpy as np

    if prev_gray is None or prev_rect is None or last_good is None:
        return None
    if prev_gray.shape[:2] != gray.shape[:2]:
        return None

    corners = cv2.goodFeaturesToTrack(prev_gray, maxCorners=900, qualityLevel=0.01, minDistance=8, blockSize=7, mask=prev_mask)
    if corners is None or len(corners) < MIN_FLOW_INLIERS:
        return None

    next_points, status, _error = cv2.calcOpticalFlowPyrLK(
        prev_gray,
        gray,
        corners,
        None,
        winSize=(21, 21),
        maxLevel=3,
        criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01),
    )
    if next_points is None or status is None:
        return None

    good_prev = corners[status.ravel() == 1].reshape(-1, 2)
    good_next = next_points[status.ravel() == 1].reshape(-1, 2)
    if mask is not None and len(good_next):
        xs = np.clip(np.round(good_next[:, 0]).astype(np.int32), 0, mask.shape[1] - 1)
        ys = np.clip(np.round(good_next[:, 1]).astype(np.int32), 0, mask.shape[0] - 1)
        inside_mask = mask[ys, xs] > 0
        good_prev = good_prev[inside_mask]
        good_next = good_next[inside_mask]
    if len(good_prev) < MIN_FLOW_INLIERS:
        return None

    affine, mask = cv2.estimateAffinePartial2D(good_next, good_prev, method=cv2.RANSAC, ransacReprojThreshold=MAX_FLOW_ERROR)
    if affine is None or mask is None:
        return None

    inlier_mask = mask.ravel().astype(bool)
    inliers = int(inlier_mask.sum())
    if inliers < MIN_FLOW_INLIERS:
        return None

    predicted_prev = cv2.transform(good_next.reshape(-1, 1, 2), affine).reshape(-1, 2)
    errors = np.linalg.norm(predicted_prev - good_prev, axis=1)
    median_error = float(np.median(errors[inlier_mask]))
    if median_error > MAX_FLOW_ERROR:
        return None

    affine3 = np.array([[affine[0, 0], affine[0, 1], affine[0, 2]], [affine[1, 0], affine[1, 1], affine[1, 2]], [0.0, 0.0, 1.0]], dtype=np.float64)
    current_screen_to_local = np.array([[1.0, 0.0, -rect["x"]], [0.0, 1.0, -rect["y"]], [0.0, 0.0, 1.0]], dtype=np.float64)
    prev_local_to_screen = np.array([[1.0, 0.0, prev_rect["x"]], [0.0, 1.0, prev_rect["y"]], [0.0, 0.0, 1.0]], dtype=np.float64)
    current_screen_to_prev_screen = prev_local_to_screen.dot(affine3).dot(current_screen_to_local)
    previous_screen_to_ref = matrix_from_list(last_good["homographyScreenToRef"])
    h_screen_to_ref = previous_screen_to_ref.dot(current_screen_to_prev_screen)

    try:
        h_ref_to_screen = np.linalg.inv(h_screen_to_ref)
    except np.linalg.LinAlgError:
        return None

    ratio = inliers / max(1, len(good_prev))
    inlier_score = min(1.0, inliers / 260)
    ratio_score = min(1.0, ratio / 0.85)
    error_score = clamp01(1.0 - median_error / (MAX_FLOW_ERROR * 1.6))
    confidence = clamp01((0.35 * inlier_score) + (0.35 * ratio_score) + (0.30 * error_score))
    if confidence < MIN_TRACKING_CONFIDENCE:
        return None

    screen_polygon = screen_polygon_from_rect(rect)
    reference_polygon = transform_points(h_screen_to_ref, screen_polygon)
    reference_xs = [point["x"] for point in reference_polygon]
    reference_ys = [point["y"] for point in reference_polygon]
    return {
        **last_good,
        "confidence": float(confidence),
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "homographyScreenToRef": matrix_to_list(h_screen_to_ref),
        "homographyRefToScreen": matrix_to_list(h_ref_to_screen),
        "visiblePolygon": [{"x": float(x), "y": float(y)} for x, y in screen_polygon],
        "referencePolygon": reference_polygon,
        "matchedReferenceBounds": {
            "minX": float(min(reference_xs)),
            "maxX": float(max(reference_xs)),
            "minY": float(min(reference_ys)),
            "maxY": float(max(reference_ys)),
        },
        "windowRect": rect,
        "matches": int(len(good_prev)),
        "inliers": inliers,
        "inlierRatio": float(ratio),
        "reprojectionError": median_error,
        "captureMethod": "optical-flow",
        "source": "frame-flow",
        "status": "tracking",
    }


def command_track(args):
    require_runtime_deps()
    import cv2

    project_root = project_root_from_args(args)
    manifest = ensure_reference(project_root, args.map_id, force=False)
    feature_cache = ReferenceMatchCache(project_root, args.map_id)
    local_builder = LocalReferenceBuilder(project_root, args.map_id)
    base_reference = feature_cache.get(manifest, build_features=True)
    if not base_reference:
        raise RuntimeError("参考地图特征不可用")
    relock_worker = GlobalRelockWorker(project_root, args.map_id, manifest, base_reference, feature_cache, local_builder)

    hwnd = int(args.window_id, 0)
    interval = max(0.04, float(args.interval))
    global_every = max(1, int(args.global_every))
    global_interval = max(interval, float(getattr(args, "global_interval", 0.35)))
    local_refine_interval = max(0.0, float(getattr(args, "local_refine_interval", 3.0)))
    lost_count = 0
    last_good = None
    prev_gray = None
    prev_rect = None
    prev_mask = None
    frame_index = 0
    consecutive_flow_frames = 0
    next_global_at = 0.0
    next_local_refine_at = time.monotonic() + local_refine_interval
    window_title = get_window_title(hwnd)

    emit({"type": "status", "status": "ready", "mapId": args.map_id, "message": "视觉追踪已就绪"})
    while True:
        loop_started = time.monotonic()
        try:
            frame, rect, capture_method = capture_window(hwnd)
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            mask = make_tracking_mask(frame, window_title)
            calibration = None
            diagnostic = None
            frame_index += 1
            now = time.monotonic()
            frame_due_for_global = frame_index % global_every == 0
            should_global_sample = last_good is None or lost_count > 0 or now >= next_global_at or frame_due_for_global
            anchor_locked = False
            relock_result = relock_worker.take_result()
            if relock_result:
                diagnostic = relock_result.get("diagnostic") or diagnostic
                relock_calibration = relock_result.get("calibration")
                if relock_calibration:
                    forwarded = attempt_optical_flow(
                        relock_result.get("gray"),
                        gray,
                        relock_result.get("rect"),
                        rect,
                        relock_calibration,
                        prev_mask=relock_result.get("mask"),
                        mask=mask,
                    )
                    if forwarded:
                        source = relock_calibration.get("source") or "global"
                        forwarded["source"] = f"{source}-flow-forward"
                        forwarded["captureMethod"] = f"{relock_calibration.get('captureMethod', capture_method)}+optical-flow"
                        forwarded["confidence"] = min(float(forwarded.get("confidence", 0)), float(relock_calibration.get("confidence", 0)))
                        calibration = forwarded
                    else:
                        calibration = relock_calibration
                    calibration["relockDurationMs"] = relock_result.get("durationMs")
                    anchor_locked = True

            flow_calibration = None
            flow_limit = MAX_FLOW_FRAMES_DURING_RELOCK if relock_worker.is_busy() else MAX_CONSECUTIVE_FLOW_FRAMES
            if calibration is None and lost_count == 0 and consecutive_flow_frames < flow_limit:
                flow_calibration = attempt_optical_flow(prev_gray, gray, prev_rect, rect, last_good, prev_mask=prev_mask, mask=mask)
            if flow_calibration:
                calibration = flow_calibration
                diagnostic = {"ok": True, "reason": "帧间光流", "matches": calibration["matches"]}

            if (should_global_sample or calibration is None) and not relock_worker.is_busy():
                allow_local_refine = local_refine_interval > 0 and time.monotonic() >= next_local_refine_at
                if relock_worker.start(gray, mask, rect, capture_method, allow_local_refine):
                    next_global_at = time.monotonic() + global_interval
                    if allow_local_refine:
                        next_local_refine_at = time.monotonic() + local_refine_interval
                    if calibration is None:
                        diagnostic = {"ok": False, "reason": "全局重锁中", "matches": 0}

            if calibration and calibration.get("source") == "frame-flow":
                if consecutive_flow_frames + 1 >= flow_limit and not relock_worker.is_busy():
                    diagnostic = diagnostic or {"ok": False, "matches": 0}
                    diagnostic["reason"] = diagnostic.get("reason") or "等待全局重锁"
                    calibration = None

            if calibration is None:
                lost_count += 1
                if diagnostic is None:
                    diagnostic = {"reason": "当前画面特征不足", "matches": 0}
                status = "low_confidence" if diagnostic.get("matches", 0) else "lost"
                emit({
                    "type": "status",
                    "status": status,
                    "mapId": args.map_id,
                    "message": diagnostic.get("reason") or "低置信度",
                    "confidence": float(diagnostic.get("confidence", 0) or 0),
                    "matches": int(diagnostic.get("matches", 0) or 0),
                    "inliers": int(diagnostic.get("inliers", 0) or 0),
                    "reprojectionError": float(diagnostic.get("medianError", 0) or 0),
                    "lostCount": lost_count,
                    "captureMethod": capture_method,
                })
                prev_gray = gray
                prev_rect = rect
                prev_mask = mask
                time.sleep(max(0.0, interval - (time.monotonic() - loop_started)))
                continue

            lost_count = 0
            last_good = calibration
            consecutive_flow_frames = consecutive_flow_frames + 1 if calibration.get("source") == "frame-flow" else 0
            if anchor_locked:
                consecutive_flow_frames = 0
            prev_gray = gray
            prev_rect = rect
            prev_mask = mask
            emit({"type": "calibration", "status": "tracking", "calibration": calibration})
            time.sleep(max(0.0, interval - (time.monotonic() - loop_started)))
        except KeyboardInterrupt:
            return 0
        except Exception as error:
            emit({"type": "status", "status": "error", "mapId": args.map_id, "message": str(error), "trace": traceback.format_exc()})
            time.sleep(max(0.0, interval - (time.monotonic() - loop_started)))
            if last_good:
                emit({"type": "calibration", "status": "lost", "calibration": last_good})


def command_self_test(args):
    project_root = project_root_from_args(args)
    results = []
    for map_id in ["shalulu", "xinaya", "fulisi"]:
        config = MAP_CONFIGS[map_id]
        bounds = config["bounds"]
        min_lat = min(bounds[0][0], bounds[1][0])
        max_lat = max(bounds[0][0], bounds[1][0])
        min_lng = min(bounds[0][1], bounds[1][1])
        max_lng = max(bounds[0][1], bounds[1][1])
        if max_lat <= min_lat or max_lng <= min_lng:
            raise RuntimeError(f"Invalid bounds for {map_id}")
        results.append({"mapId": map_id, "bounds": bounds, "ok": True})

    payload = {"type": "self-test", "ok": True, "metadata": results}
    if args.metadata_only:
        emit(payload)
        return 0

    require_runtime_deps()
    import cv2
    import numpy as np

    manifest = ensure_reference(project_root, "shalulu", force=False)
    image = cv2.imread(str(Path(manifest["referenceImage"])), cv2.IMREAD_GRAYSCALE)
    if image is None:
        raise RuntimeError("Cannot load shalulu reference")
    crop = image[420:980, 620:1260]
    transform = np.float32([[1.0, 0.0, 45.0], [0.0, 1.0, 35.0]])
    sample = cv2.warpAffine(crop, transform, (crop.shape[1] + 90, crop.shape[0] + 70))
    sift = cv2.SIFT_create(nfeatures=3000)
    kp_ref, des_ref = sift.detectAndCompute(image, None)
    kp_sample, des_sample = sift.detectAndCompute(sample, None)
    matcher = cv2.FlannBasedMatcher(dict(algorithm=1, trees=5), dict(checks=64))
    matches = matcher.knnMatch(des_sample, des_ref, k=2)
    good = [pair[0] for pair in matches if len(pair) == 2 and pair[0].distance < 0.72 * pair[1].distance]
    if len(good) < 12:
        raise RuntimeError(f"Synthetic match failed: {len(good)} matches")
    src = np.float32([kp_sample[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    dst = np.float32([kp_ref[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
    matrix, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
    inliers = int(mask.ravel().sum()) if mask is not None else 0
    if matrix is None or inliers < 10:
        raise RuntimeError("Synthetic homography failed")
    payload["synthetic"] = {"matches": len(good), "inliers": inliers}
    emit(payload)
    return 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", default=str(Path(__file__).resolve().parents[2]))
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("check-deps")
    sub.add_parser("list-windows")

    build = sub.add_parser("build-cache")
    build.add_argument("--map-id", required=True, choices=sorted(MAP_CONFIGS.keys()))
    build.add_argument("--force", action="store_true")

    track = sub.add_parser("track")
    track.add_argument("--map-id", required=True, choices=sorted(MAP_CONFIGS.keys()))
    track.add_argument("--window-id", required=True)
    track.add_argument("--interval", default="0.25")
    track.add_argument("--global-every", default="2")
    track.add_argument("--global-interval", default="0.28")
    track.add_argument("--local-refine-interval", default="1.25")

    self_test = sub.add_parser("self-test")
    self_test.add_argument("--metadata-only", action="store_true")

    args = parser.parse_args()
    try:
        if args.command == "check-deps":
            return command_check_deps(args)
        if args.command == "list-windows":
            return command_list_windows(args)
        if args.command == "build-cache":
            return command_build_cache(args)
        if args.command == "track":
            return command_track(args)
        if args.command == "self-test":
            return command_self_test(args)
    except Exception as error:
        emit({"type": "error", "ok": False, "message": str(error), "trace": traceback.format_exc()})
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
