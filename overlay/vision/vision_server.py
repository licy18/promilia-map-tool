import argparse
import importlib.util
import json
import math
import os
import sys
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
CACHE_VERSION = 3
MIN_TRACKING_CONFIDENCE = 0.45
MIN_REFINED_CONFIDENCE = 0.52
LOCAL_REFERENCE_ZOOMS = (8, 7)
MAX_LOCAL_TILES = 96
LOCAL_REFERENCE_MARGIN_TILES = 2
MAX_REPROJECTION_ERROR = 8.0
MAX_FLOW_ERROR = 4.0
MIN_FLOW_INLIERS = 40

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


def ensure_local_reference(project_root, map_id, zoom, map_bounds):
    if MAP_CONFIGS[map_id]["type"] != "tileLayer":
        return None

    tile_range = get_tile_range_for_map_bounds(
        project_root,
        map_id,
        zoom,
        map_bounds,
        margin_tiles=LOCAL_REFERENCE_MARGIN_TILES,
    )
    if tile_range["columns"] <= 0 or tile_range["rows"] <= 0:
        return None
    if tile_count(tile_range) > MAX_LOCAL_TILES:
        return None

    paths = get_local_reference_paths(project_root, map_id, zoom, tile_range)
    if paths["manifest"].exists() and paths["image"].exists():
        try:
            manifest = json.loads(paths["manifest"].read_text(encoding="utf-8"))
            if manifest.get("version") == CACHE_VERSION:
                return manifest
        except Exception:
            pass

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
    features_path = paths["features"]
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

    sift = cv2.SIFT_create(nfeatures=10000)
    keypoints, descriptors = sift.detectAndCompute(reference, None)
    if descriptors is None or not keypoints:
        raise RuntimeError("Reference image has no SIFT features")

    kp_points = np.float32([kp.pt for kp in keypoints])
    paths["dir"].mkdir(parents=True, exist_ok=True)
    np.savez_compressed(features_path, kp_points=kp_points, descriptors=descriptors.astype(np.float32))
    return kp_points, descriptors.astype(np.float32)


def get_window_rect(hwnd):
    import win32gui
    left, top, right, bottom = win32gui.GetWindowRect(hwnd)
    return {
        "x": int(left),
        "y": int(top),
        "width": int(right - left),
        "height": int(bottom - top),
    }


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
    }


def command_track(args):
    require_runtime_deps()
    import cv2
    import numpy as np

    project_root = project_root_from_args(args)
    manifest = ensure_reference(project_root, args.map_id, force=False)
    kp_ref, des_ref = load_or_build_features(project_root, args.map_id, manifest)
    reference_payload = make_reference_payload(manifest)

    sift = cv2.SIFT_create(nfeatures=3500)
    matcher = cv2.FlannBasedMatcher(dict(algorithm=1, trees=5), dict(checks=64))
    hwnd = int(args.window_id, 0)
    interval = max(0.2, float(args.interval))
    lost_count = 0
    last_good = None

    emit({"type": "status", "status": "ready", "mapId": args.map_id, "message": "视觉追踪已就绪"})
    while True:
        try:
            frame, rect, capture_method = capture_window(hwnd)
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            keypoints, descriptors = sift.detectAndCompute(gray, None)

            if descriptors is None or len(keypoints) < 8:
                lost_count += 1
                emit({"type": "status", "status": "lost", "mapId": args.map_id, "message": "当前画面特征不足", "lostCount": lost_count})
                time.sleep(interval)
                continue

            matches = matcher.knnMatch(descriptors.astype(np.float32), des_ref, k=2)
            good = [pair[0] for pair in matches if len(pair) == 2 and pair[0].distance < 0.72 * pair[1].distance]
            if len(good) < 12:
                lost_count += 1
                emit({
                    "type": "status",
                    "status": "low_confidence" if good else "lost",
                    "mapId": args.map_id,
                    "message": f"匹配不足: {len(good)}",
                    "matches": len(good),
                    "lostCount": lost_count,
                })
                time.sleep(interval)
                continue

            src = np.float32([keypoints[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
            dst = np.float32([kp_ref[m.trainIdx] for m in good]).reshape(-1, 1, 2)
            h_local, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
            if h_local is None or mask is None:
                lost_count += 1
                emit({"type": "status", "status": "lost", "mapId": args.map_id, "message": "无法计算透视矩阵", "matches": len(good), "lostCount": lost_count})
                time.sleep(interval)
                continue

            inliers = int(mask.ravel().sum())
            confidence = max(0.0, min(1.0, (inliers / max(18, len(good))) * min(1.0, inliers / 36)))
            status = "tracking" if confidence >= MIN_TRACKING_CONFIDENCE else "low_confidence"
            lost_count = 0 if status == "tracking" else lost_count + 1
            if status != "tracking":
                emit({
                    "type": "status",
                    "status": "low_confidence",
                    "mapId": args.map_id,
                    "message": f"低置信度: {confidence:.2f}",
                    "confidence": float(confidence),
                    "matches": len(good),
                    "inliers": inliers,
                    "lostCount": lost_count,
                    "captureMethod": capture_method,
                })
                time.sleep(interval)
                continue

            translation = np.array([[1.0, 0.0, -rect["x"]], [0.0, 1.0, -rect["y"]], [0.0, 0.0, 1.0]], dtype=np.float64)
            h_screen_to_ref = h_local.astype(np.float64).dot(translation)
            h_ref_to_screen = np.linalg.inv(h_screen_to_ref)
            screen_polygon = [
                [rect["x"], rect["y"]],
                [rect["x"] + rect["width"], rect["y"]],
                [rect["x"] + rect["width"], rect["y"] + rect["height"]],
                [rect["x"], rect["y"] + rect["height"]],
            ]
            reference_polygon = transform_points(h_screen_to_ref, screen_polygon)

            calibration = {
                "mapId": args.map_id,
                "confidence": float(confidence),
                "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "reference": reference_payload,
                "homographyScreenToRef": matrix_to_list(h_screen_to_ref),
                "homographyRefToScreen": matrix_to_list(h_ref_to_screen),
                "visiblePolygon": [{"x": float(x), "y": float(y)} for x, y in screen_polygon],
                "referencePolygon": reference_polygon,
                "windowRect": rect,
                "matches": len(good),
                "inliers": inliers,
                "captureMethod": capture_method,
                "status": status,
            }
            last_good = calibration if status == "tracking" else last_good
            emit({"type": "calibration", "status": status, "calibration": calibration})
            time.sleep(interval)
        except KeyboardInterrupt:
            return 0
        except Exception as error:
            emit({"type": "status", "status": "error", "mapId": args.map_id, "message": str(error), "trace": traceback.format_exc()})
            time.sleep(interval)
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
