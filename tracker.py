import argparse
import asyncio
import json
import math
import subprocess
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

PROJECT_ROOT = Path(__file__).resolve().parent
CACHE_VERSION = 2
DEFAULT_MINIMAP_ROI = (78, 189, 31, 143)
DEFAULT_WS_HOST = "localhost"
DEFAULT_WS_PORT = 8765
DEFAULT_CONTROL_HOST = "127.0.0.1"
DEFAULT_CONTROL_PORT = 8766
MIN_HOMOGRAPHY_INLIERS = 10
MAX_REPROJECTION_ERROR = 7.0
LOCAL_REFERENCE_ZOOMS = (8, 7)
LOCAL_TILE_LIMITS = {8: 196, 7: 144}
LOCAL_TILE_MARGINS = {8: 2, 7: 1}

MAP_CONFIGS = {
    "shalulu": {
        "label": "夏露露村",
        "type": "image",
        "image": "maps/shalulu.png",
        "width": 2048,
        "height": 2048,
        "bounds": [[0, 0], [2048, 2048]],
        "maxJump": 180,
        "globalFeatures": 4500,
    },
    "xinaya": {
        "label": "新芽山谷",
        "type": "tileLayer",
        "tileUrl": "https://wiki-dev-patch-oss.oss-cn-hangzhou.aliyuncs.com/res/ap/map/xysg/cbt2/G/{z}/tile-{x}_{y}.png",
        "globalZoom": 6,
        "maxZoom": 8,
        "tileSize": 256,
        "bounds": [[-8192, -8192], [8192, 8192]],
        "maxJump": 900,
        "globalFeatures": 12000,
    },
    "fulisi": {
        "label": "弗利斯",
        "type": "tileLayer",
        "tileUrl": "https://wiki-dev-patch-oss.oss-cn-hangzhou.aliyuncs.com/res/ap/map/fls/cbt2/G/{z}/tile-{x}_{y}.png",
        "globalZoom": 6,
        "maxZoom": 8,
        "tileSize": 256,
        "bounds": [[-8192, -8192], [8192, 8192]],
        "maxJump": 900,
        "globalFeatures": 12000,
    },
}

current_payload = {
    "type": "status",
    "status": "starting",
    "source": "minimap-vision",
    "message": "小地图追踪启动中",
}
payload_lock = threading.Lock()
overlay_process = None
overlay_process_lock = threading.Lock()


def set_current_payload(payload):
    with payload_lock:
        current_payload.clear()
        current_payload.update(payload)


def get_current_payload():
    with payload_lock:
        return dict(current_payload)


def is_overlay_running():
    with overlay_process_lock:
        return overlay_process is not None and overlay_process.poll() is None


def overlay_status_payload():
    with overlay_process_lock:
        running = overlay_process is not None and overlay_process.poll() is None
        return {
            "ok": True,
            "running": running,
            "pid": overlay_process.pid if running else None,
        }


def start_overlay():
    global overlay_process

    overlay_dir = PROJECT_ROOT / "overlay"
    electron_exe = overlay_dir / "node_modules" / "electron" / "dist" / "electron.exe"
    if not electron_exe.exists():
        return {
            "ok": False,
            "message": "覆盖层 Electron 依赖未安装，请先在 overlay 目录运行 npm install",
        }

    with overlay_process_lock:
        if overlay_process is not None and overlay_process.poll() is None:
            return {
                "ok": True,
                "running": True,
                "alreadyRunning": True,
                "pid": overlay_process.pid,
            }

        creationflags = subprocess.CREATE_NO_WINDOW if sys.platform.startswith("win") else 0
        overlay_process = subprocess.Popen(
            [str(electron_exe), "."],
            cwd=str(overlay_dir),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags,
        )
        return {
            "ok": True,
            "running": True,
            "alreadyRunning": False,
            "pid": overlay_process.pid,
        }


class ControlRequestHandler(BaseHTTPRequestHandler):
    server_version = "AzPrMapControl/0.1"

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/overlay/status":
            self.send_json(overlay_status_payload())
            return
        self.send_json({"ok": False, "message": "Not found"}, status=404)

    def do_POST(self):
        if self.path == "/api/overlay/start":
            length = int(self.headers.get("Content-Length") or 0)
            if length:
                self.rfile.read(length)
            payload = start_overlay()
            self.send_json(payload, status=200 if payload.get("ok") else 500)
            return
        self.send_json({"ok": False, "message": "Not found"}, status=404)

    def log_message(self, _format, *_args):
        return


def start_control_http(host, port):
    server = ThreadingHTTPServer((host, port), ControlRequestHandler)
    print(f"[控制服务] HTTP 启动：http://{host}:{port}")
    server.serve_forever()


def parse_roi(value):
    parts = [part.strip() for part in str(value).split(",")]
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("ROI 格式应为 y1,y2,x1,x2")
    numbers = tuple(int(part) for part in parts)
    y1, y2, x1, x2 = numbers
    if y2 <= y1 or x2 <= x1:
        raise argparse.ArgumentTypeError("ROI 必须满足 y2 > y1 且 x2 > x1")
    return numbers


def normalize_bounds(bounds):
    first, second = bounds
    min_lat = min(float(first[0]), float(second[0]))
    max_lat = max(float(first[0]), float(second[0]))
    min_lng = min(float(first[1]), float(second[1]))
    max_lng = max(float(first[1]), float(second[1]))
    return min_lat, min_lng, max_lat, max_lng


def tracker_cache_root():
    return PROJECT_ROOT / "cache" / "tracker"


def reference_root(map_id):
    return tracker_cache_root() / map_id


def reference_paths(map_id, kind):
    root = reference_root(map_id) / kind
    return {
        "dir": root,
        "image": root / "reference.png",
        "manifest": root / "manifest.json",
        "features": root / "features.npz",
    }


def tile_units_for_zoom(config, zoom):
    return config["tileSize"] * (2 ** (config["maxZoom"] - zoom))


def native_tile_range(map_id, zoom):
    config = MAP_CONFIGS[map_id]
    units = tile_units_for_zoom(config, zoom)
    min_lat, min_lng, max_lat, max_lng = normalize_bounds(config["bounds"])
    min_x = math.floor(min_lng / units)
    max_x = math.ceil(max_lng / units) - 1
    min_y = math.floor(-max_lat / units)
    max_y = math.ceil(-min_lat / units) - 1
    return finalize_tile_range({
        "zoom": zoom,
        "tileUnits": units,
        "minX": int(min_x),
        "maxX": int(max_x),
        "minY": int(min_y),
        "maxY": int(max_y),
    })


def finalize_tile_range(tile_range):
    tile_range = dict(tile_range)
    tile_range["columns"] = int(tile_range["maxX"] - tile_range["minX"] + 1)
    tile_range["rows"] = int(tile_range["maxY"] - tile_range["minY"] + 1)
    return tile_range


def clamp_tile_range(tile_range, limit):
    return {
        "zoom": tile_range["zoom"],
        "tileUnits": tile_range["tileUnits"],
        "minX": max(tile_range["minX"], limit["minX"]),
        "maxX": min(tile_range["maxX"], limit["maxX"]),
        "minY": max(tile_range["minY"], limit["minY"]),
        "maxY": min(tile_range["maxY"], limit["maxY"]),
    }


def tile_count(tile_range):
    return max(0, int(tile_range.get("columns", 0))) * max(0, int(tile_range.get("rows", 0)))


def tile_range_for_bounds(map_id, zoom, bounds, margin_tiles=0):
    config = MAP_CONFIGS[map_id]
    units = tile_units_for_zoom(config, zoom)
    min_lat, min_lng, max_lat, max_lng = normalize_bounds([
        [bounds["minLat"], bounds["minLng"]],
        [bounds["maxLat"], bounds["maxLng"]],
    ])
    candidate = {
        "zoom": zoom,
        "tileUnits": units,
        "minX": math.floor(min_lng / units) - margin_tiles,
        "maxX": math.ceil(max_lng / units) - 1 + margin_tiles,
        "minY": math.floor(-max_lat / units) - margin_tiles,
        "maxY": math.ceil(-min_lat / units) - 1 + margin_tiles,
    }
    return finalize_tile_range(clamp_tile_range(candidate, native_tile_range(map_id, zoom)))


def tile_range_to_bounds(tile_range):
    units = float(tile_range["tileUnits"])
    min_lng = tile_range["minX"] * units
    max_lng = (tile_range["maxX"] + 1) * units
    max_lat = -tile_range["minY"] * units
    min_lat = -(tile_range["maxY"] + 1) * units
    return [[min_lat, min_lng], [max_lat, max_lng]]


def summarize_tile_range(tile_range):
    return (
        f"z{tile_range['zoom']} {tile_range['columns']}x{tile_range['rows']} "
        f"x{tile_range['minX']}..{tile_range['maxX']} y{tile_range['minY']}..{tile_range['maxY']}"
    )


def download_tile(url, target, timeout=20):
    if target.exists() and target.stat().st_size > 0:
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "AzPrMapTracker/0.2"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        target.write_bytes(response.read())
    return True


def build_tile_mosaic(map_id, zoom, tile_range, paths, progress=False):
    config = MAP_CONFIGS[map_id]
    tile_size = config["tileSize"]
    tile_dir = reference_root(map_id) / f"tiles-z{zoom}"
    paths["dir"].mkdir(parents=True, exist_ok=True)

    downloaded = 0
    done = 0
    total = tile_count(tile_range)
    for y in range(tile_range["minY"], tile_range["maxY"] + 1):
        for x in range(tile_range["minX"], tile_range["maxX"] + 1):
            tile_url = config["tileUrl"].format(z=zoom, x=x, y=y)
            tile_path = tile_dir / f"tile-{x}_{y}.png"
            try:
                if download_tile(tile_url, tile_path):
                    downloaded += 1
            except Exception as error:
                print(f"[缓存] 瓦片 {x},{y} 下载失败: {error}")
            done += 1
            if progress and (done == total or done % 16 == 0):
                print(f"[缓存] {map_id} {summarize_tile_range(tile_range)} {done}/{total}，新下载 {downloaded}")

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


def write_manifest(paths, manifest):
    paths["dir"].mkdir(parents=True, exist_ok=True)
    paths["manifest"].write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def read_manifest(paths):
    if not paths["manifest"].exists():
        return None
    try:
        return json.loads(paths["manifest"].read_text(encoding="utf-8"))
    except Exception:
        return None


def ensure_image_reference(map_id, force=False):
    config = MAP_CONFIGS[map_id]
    source = PROJECT_ROOT / config["image"]
    if not source.exists():
        raise FileNotFoundError(str(source))

    paths = reference_paths(map_id, "image")
    manifest = read_manifest(paths)
    if manifest and not force and manifest.get("version") == CACHE_VERSION and Path(manifest["referenceImage"]).exists():
        return manifest

    with Image.open(source) as image:
        width, height = image.size
    manifest = {
        "mapId": map_id,
        "cacheKind": "source-image",
        "referenceImage": str(source),
        "featuresPath": str(paths["features"]),
        "width": width,
        "height": height,
        "bounds": config["bounds"],
        "version": CACHE_VERSION,
    }
    write_manifest(paths, manifest)
    return manifest


def ensure_global_tile_reference(map_id, force=False):
    config = MAP_CONFIGS[map_id]
    zoom = config["globalZoom"]
    paths = reference_paths(map_id, f"global-z{zoom}")
    manifest = read_manifest(paths)
    if manifest and not force and manifest.get("version") == CACHE_VERSION and paths["image"].exists():
        return manifest

    tile_range = native_tile_range(map_id, zoom)
    print(f"[缓存] 构建 {MAP_CONFIGS[map_id]['label']} 全局粗参考：{summarize_tile_range(tile_range)}")
    reference, missing, downloaded = build_tile_mosaic(map_id, zoom, tile_range, paths, progress=True)
    manifest = {
        "mapId": map_id,
        "cacheKind": "global-tiles",
        "tileUrl": config["tileUrl"],
        "zoom": zoom,
        "tileSize": config["tileSize"],
        "tileRange": tile_range,
        "referenceImage": str(paths["image"]),
        "featuresPath": str(paths["features"]),
        "width": reference.width,
        "height": reference.height,
        "bounds": config["bounds"],
        "missingTiles": missing,
        "downloadedTiles": downloaded,
        "version": CACHE_VERSION,
    }
    write_manifest(paths, manifest)
    return manifest


def local_bounds_around(point, half_span):
    return {
        "minLat": point["lat"] - half_span,
        "maxLat": point["lat"] + half_span,
        "minLng": point["lng"] - half_span,
        "maxLng": point["lng"] + half_span,
    }


def ensure_local_tile_reference(map_id, zoom, bounds, force=False):
    margin = LOCAL_TILE_MARGINS.get(zoom, 1)
    tile_range = tile_range_for_bounds(map_id, zoom, bounds, margin_tiles=margin)
    total = tile_count(tile_range)
    limit = LOCAL_TILE_LIMITS.get(zoom, 96)
    if total <= 0 or total > limit:
        return None

    key = f"local-z{zoom}-x{tile_range['minX']}_{tile_range['maxX']}-y{tile_range['minY']}_{tile_range['maxY']}"
    paths = reference_paths(map_id, key)
    manifest = read_manifest(paths)
    if manifest and not force and manifest.get("version") == CACHE_VERSION and paths["image"].exists():
        return manifest

    print(f"[缓存] 构建高清局部参考：{map_id} {summarize_tile_range(tile_range)}")
    reference, missing, downloaded = build_tile_mosaic(map_id, zoom, tile_range, paths, progress=False)
    manifest = {
        "mapId": map_id,
        "cacheKind": "local-tiles",
        "tileUrl": MAP_CONFIGS[map_id]["tileUrl"],
        "zoom": zoom,
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
    }
    write_manifest(paths, manifest)
    return manifest


def ensure_reference(map_id, force=False):
    if MAP_CONFIGS[map_id]["type"] == "image":
        return ensure_image_reference(map_id, force=force)
    return ensure_global_tile_reference(map_id, force=force)


def load_or_build_features(manifest, nfeatures=None):
    features_path = Path(manifest["featuresPath"])
    if features_path.exists():
        try:
            data = np.load(features_path, allow_pickle=False)
            points = data["kp_points"].astype(np.float32)
            descriptors = data["descriptors"].astype(np.float32)
            if len(points) > 0 and descriptors.size > 0:
                return points, descriptors
        except Exception:
            pass

    image = cv2.imread(str(manifest["referenceImage"]), cv2.IMREAD_GRAYSCALE)
    if image is None:
        raise RuntimeError(f"无法读取参考图：{manifest['referenceImage']}")
    area = image.shape[0] * image.shape[1]
    feature_count = int(nfeatures or max(3000, min(14000, area / 1400)))
    sift = cv2.SIFT_create(nfeatures=feature_count)
    keypoints, descriptors = sift.detectAndCompute(image, None)
    if descriptors is None or not keypoints:
        raise RuntimeError("参考图没有可用 SIFT 特征")

    points = np.float32([kp.pt for kp in keypoints])
    features_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(features_path, kp_points=points, descriptors=descriptors.astype(np.float32))
    return points, descriptors.astype(np.float32)


def reference_pixel_to_map(manifest, x, y):
    min_lat, min_lng, max_lat, max_lng = normalize_bounds(manifest["bounds"])
    width = float(manifest["width"])
    height = float(manifest["height"])
    return {
        "lat": max_lat - (float(y) / height) * (max_lat - min_lat),
        "lng": min_lng + (float(x) / width) * (max_lng - min_lng),
    }


def is_inside_map(map_id, point):
    min_lat, min_lng, max_lat, max_lng = normalize_bounds(MAP_CONFIGS[map_id]["bounds"])
    return min_lat <= point["lat"] <= max_lat and min_lng <= point["lng"] <= max_lng


def clamp01(value):
    return max(0.0, min(1.0, float(value)))


def score_homography(src, dst, matrix, mask):
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

    median_error = float(np.median(inlier_errors))
    inlier_ratio = inliers / max(1, total)
    inlier_score = clamp01(inliers / 34)
    ratio_score = clamp01(inlier_ratio / 0.58)
    error_score = clamp01(1.0 - median_error / MAX_REPROJECTION_ERROR)
    confidence = (0.40 * inlier_score) + (0.30 * ratio_score) + (0.30 * error_score)
    if median_error > MAX_REPROJECTION_ERROR:
        confidence *= 0.35

    return {
        "inliers": inliers,
        "matches": total,
        "inlierRatio": float(inlier_ratio),
        "medianError": median_error,
        "confidence": clamp01(confidence),
    }


def match_reference(kp_mini, des_mini, kp_ref, des_ref, matcher, ratio=0.72):
    if des_mini is None or len(kp_mini) < 8:
        return None, {"reason": "小地图特征不足", "matches": 0}

    matches = matcher.knnMatch(des_mini.astype(np.float32), des_ref, k=2)
    good = [pair[0] for pair in matches if len(pair) == 2 and pair[0].distance < ratio * pair[1].distance]
    if len(good) < 10:
        return None, {"reason": f"匹配不足: {len(good)}", "matches": len(good)}

    src = np.float32([kp_mini[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    dst = np.float32([kp_ref[m.trainIdx] for m in good]).reshape(-1, 1, 2)
    matrix, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
    quality = score_homography(src, dst, matrix, mask)
    if not quality:
        return None, {"reason": "透视矩阵质量不足", "matches": len(good)}
    return matrix, quality


def find_window_by_title(title):
    import win32gui

    candidates = []
    needle = title.lower()

    def enum_handler(hwnd, _ctx):
        if not win32gui.IsWindowVisible(hwnd):
            return True
        window_title = win32gui.GetWindowText(hwnd).strip()
        if window_title and needle in window_title.lower():
            candidates.append(hwnd)
        return True

    win32gui.EnumWindows(enum_handler, None)
    return candidates[0] if candidates else None


def screenshot_bitblt(hwnd, x, y, width, height):
    import win32con
    import win32gui
    import win32ui

    hwindc = win32gui.GetWindowDC(hwnd)
    srcdc = win32ui.CreateDCFromHandle(hwindc)
    memdc = srcdc.CreateCompatibleDC()
    bmp = win32ui.CreateBitmap()
    bmp.CreateCompatibleBitmap(srcdc, width, height)
    memdc.SelectObject(bmp)
    try:
        memdc.BitBlt((0, 0), (width, height), srcdc, (x, y), win32con.SRCCOPY)
        bmpstr = bmp.GetBitmapBits(True)
        frame = np.frombuffer(bmpstr, dtype=np.uint8).reshape((height, width, 4))
        return cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)
    finally:
        srcdc.DeleteDC()
        memdc.DeleteDC()
        win32gui.ReleaseDC(hwnd, hwindc)
        win32gui.DeleteObject(bmp.GetHandle())


def get_screen_frame(args):
    try:
        import pyautogui
    except ImportError as error:
        raise RuntimeError("缺少截图依赖 pyautogui，请先运行 pip install -r requirements.txt") from error

    y1, y2, x1, x2 = args.minimap_roi
    width = x2 - x1
    height = y2 - y1
    if args.screenshot_mode == "window":
        import win32gui

        hwnd = find_window_by_title(args.window_title)
        if hwnd:
            if args.screenshot_method == "bitblt":
                try:
                    return screenshot_bitblt(hwnd, x1, y1, width, height)
                except Exception as error:
                    print(f"[截图] BitBlt 失败，回退前台截图：{error}")
            left, top, right, bottom = win32gui.GetWindowRect(hwnd)
            screenshot = pyautogui.screenshot(region=(left + x1, top + y1, width, height))
            return cv2.cvtColor(np.array(screenshot), cv2.COLOR_RGB2BGR)
        print(f"[截图] 找不到窗口：{args.window_title}，回退全屏 ROI")

    screenshot = pyautogui.screenshot(region=(x1, y1, width, height))
    return cv2.cvtColor(np.array(screenshot), cv2.COLOR_RGB2BGR)


def build_minimap_mask(width, height, center_hole_radius):
    mask = np.zeros((height, width), dtype=np.uint8)
    cv2.circle(mask, (width // 2, height // 2), min(width, height) // 2, 255, -1)
    cv2.rectangle(mask, (0, 0), (int(1.5 * (width // 4)), int(1.5 * (height // 4))), 0, -1)
    if center_hole_radius > 0:
        cv2.circle(mask, (width // 2, height // 2), center_hole_radius, 0, -1)
    return mask


def preprocess_minimap(frame, base_mask, zoom):
    gray = cv2.cvtColor(cv2.bitwise_and(frame, frame, mask=base_mask), cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(4, 4))
    gray = clahe.apply(gray)
    gray[base_mask == 0] = 0
    feature_mask = base_mask
    if zoom != 1.0:
        gray = cv2.resize(gray, None, fx=zoom, fy=zoom, interpolation=cv2.INTER_CUBIC)
        feature_mask = cv2.resize(base_mask, (gray.shape[1], gray.shape[0]), interpolation=cv2.INTER_NEAREST)
    return gray, feature_mask


def make_location_payload(map_id, point, confidence, quality, source, reset=False):
    return {
        "type": "location",
        "mapId": map_id,
        "source": "minimap-vision",
        "coordinateSpace": "map",
        "lat": float(point["lat"]),
        "lng": float(point["lng"]),
        "confidence": float(confidence),
        "state": "tracking",
        "matches": int(quality.get("matches", 0)),
        "inliers": int(quality.get("inliers", 0)),
        "reprojectionError": float(quality.get("medianError", 0.0)),
        "method": source,
        "reset": bool(reset),
        "timestamp": int(time.time() * 1000),
    }


def make_status_payload(map_id, status, message, diagnostic=None):
    diagnostic = diagnostic or {}
    return {
        "type": "status",
        "mapId": map_id,
        "source": "minimap-vision",
        "status": status,
        "message": message,
        "confidence": float(diagnostic.get("confidence", 0) or 0),
        "matches": int(diagnostic.get("matches", 0) or 0),
        "timestamp": int(time.time() * 1000),
    }


class MinimapTracker:
    def __init__(self, args):
        self.args = args
        self.map_id = args.map_id
        self.config = MAP_CONFIGS[self.map_id]
        self.sift = cv2.SIFT_create(nfeatures=args.frame_features)
        self.matcher = cv2.FlannBasedMatcher(dict(algorithm=1, trees=5), dict(checks=args.matcher_checks))
        self.global_manifest = ensure_reference(self.map_id, force=args.force_cache)
        self.global_features = load_or_build_features(self.global_manifest, self.config.get("globalFeatures"))
        self.local_feature_cache = {}
        self.last_point = None
        self.last_payload_at = 0.0
        self.lost_count = 0
        self.frame_count = 0
        self.base_mask = None

    def load_local_features(self, manifest):
        key = manifest["featuresPath"]
        if key not in self.local_feature_cache:
            self.local_feature_cache[key] = load_or_build_features(manifest, nfeatures=4500)
        return self.local_feature_cache[key]

    def attempt_with_manifest(self, gray, feature_mask, manifest, features, source):
        keypoints, descriptors = self.sift.detectAndCompute(gray, feature_mask)
        matrix, diagnostic = match_reference(keypoints, descriptors, features[0], features[1], self.matcher, ratio=self.args.ratio)
        if matrix is None:
            return None, diagnostic

        center = np.float32([[[gray.shape[1] / 2, gray.shape[0] / 2]]])
        mapped = cv2.perspectiveTransform(center, matrix)
        ref_x = float(mapped[0][0][0])
        ref_y = float(mapped[0][0][1])
        if ref_x < 0 or ref_y < 0 or ref_x > manifest["width"] or ref_y > manifest["height"]:
            diagnostic["reason"] = "中心点越出参考图"
            return None, diagnostic

        point = reference_pixel_to_map(manifest, ref_x, ref_y)
        if not is_inside_map(self.map_id, point):
            diagnostic["reason"] = "地图坐标越界"
            return None, diagnostic

        return {
            "point": point,
            "confidence": diagnostic["confidence"],
            "quality": diagnostic,
            "source": source,
            "manifest": manifest,
        }, diagnostic

    def attempt_local(self, gray, feature_mask, seed_point):
        if self.config["type"] != "tileLayer" or not seed_point:
            return None, {"reason": "无局部种子", "matches": 0}

        bounds = local_bounds_around(seed_point, self.args.local_half_span)
        last_diagnostic = {"reason": "高清局部参考不可用", "matches": 0}
        for zoom in LOCAL_REFERENCE_ZOOMS:
            manifest = ensure_local_tile_reference(self.map_id, zoom, bounds, force=False)
            if not manifest:
                last_diagnostic = {"reason": f"z{zoom} 局部范围过大", "matches": 0}
                continue
            features = self.load_local_features(manifest)
            result, diagnostic = self.attempt_with_manifest(gray, feature_mask, manifest, features, f"local-z{zoom}")
            if result and result["confidence"] >= self.args.min_local_confidence:
                return result, diagnostic
            last_diagnostic = diagnostic
        return None, last_diagnostic

    def attempt_global(self, gray, feature_mask):
        return self.attempt_with_manifest(
            gray,
            feature_mask,
            self.global_manifest,
            self.global_features,
            f"global-z{self.global_manifest.get('zoom', 'image')}",
        )

    def stabilize(self, result):
        point = result["point"]
        if not self.last_point:
            self.last_point = point
            return point, True

        distance = math.hypot(point["lat"] - self.last_point["lat"], point["lng"] - self.last_point["lng"])
        max_jump = self.args.max_jump or self.config.get("maxJump", 900)
        if max_jump > 0 and distance > max_jump:
            return None, False

        alpha = self.args.smoothing
        smoothed = {
            "lat": self.last_point["lat"] + alpha * (point["lat"] - self.last_point["lat"]),
            "lng": self.last_point["lng"] + alpha * (point["lng"] - self.last_point["lng"]),
        }
        self.last_point = smoothed
        return smoothed, False

    def process_frame(self, frame):
        if self.base_mask is None or self.base_mask.shape[:2] != frame.shape[:2]:
            self.base_mask = build_minimap_mask(frame.shape[1], frame.shape[0], self.args.center_hole)
        gray, feature_mask = preprocess_minimap(frame, self.base_mask, self.args.minimap_zoom)

        self.frame_count += 1
        result = None
        diagnostic = None

        if self.last_point:
            result, diagnostic = self.attempt_local(gray, feature_mask, self.last_point)

        if result is None:
            result, diagnostic = self.attempt_global(gray, feature_mask)
            if result and self.config["type"] == "tileLayer":
                refined, refined_diagnostic = self.attempt_local(gray, feature_mask, result["point"])
                if refined:
                    result, diagnostic = refined, refined_diagnostic

        if result is None:
            self.lost_count += 1
            return None, diagnostic or {"reason": "未匹配", "matches": 0}, gray

        point, reset = self.stabilize(result)
        if point is None:
            self.lost_count += 1
            return None, {"reason": "跳变拦截", **result["quality"]}, gray

        self.lost_count = 0
        result["point"] = point
        result["reset"] = reset
        return result, diagnostic, gray

    def run(self):
        label = self.config["label"]
        print(f"[视觉引擎] 小地图追踪启动：{label} ({self.map_id})")
        print(f"[视觉引擎] 参考源：{self.global_manifest['cacheKind']} {self.global_manifest.get('zoom', '')}")
        set_current_payload(make_status_payload(self.map_id, "ready", "小地图追踪已就绪"))

        while True:
            if self.frame_count % max(1, self.args.frame_skip + 1) != 0:
                self.frame_count += 1
                time.sleep(0.01)
                continue

            try:
                frame = get_screen_frame(self.args)
                result, diagnostic, preview = self.process_frame(frame)
                if result:
                    payload = make_location_payload(
                        self.map_id,
                        result["point"],
                        result["confidence"],
                        result["quality"],
                        result["source"],
                        reset=result.get("reset", False),
                    )
                    set_current_payload(payload)
                    if time.time() - self.last_payload_at > 0.75:
                        print(
                            f"🎯 [{result['source']}] {payload['confidence']:.2f} "
                            f"lat={payload['lat']:.1f} lng={payload['lng']:.1f} "
                            f"inliers={payload['inliers']}"
                        )
                        self.last_payload_at = time.time()
                else:
                    message = diagnostic.get("reason", "小地图匹配失败") if diagnostic else "小地图匹配失败"
                    set_current_payload(make_status_payload(self.map_id, "lost", message, diagnostic))
                    if self.lost_count % 10 == 1:
                        print(f"📉 [小地图] {message}")

                if not self.args.no_preview:
                    cv2.imshow("Minimap Tracking (Press Q)", preview)
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        break
                time.sleep(self.args.interval)
            except KeyboardInterrupt:
                break
            except Exception as error:
                set_current_payload(make_status_payload(self.map_id, "error", str(error)))
                print(f"[视觉引擎] 错误：{error}")
                time.sleep(max(0.25, self.args.interval))

        cv2.destroyAllWindows()


async def ws_server(websocket):
    print("[通信服务] 网页端已连接")
    try:
        while True:
            await websocket.send(json.dumps(get_current_payload(), ensure_ascii=False))
            await asyncio.sleep(0.1)
    except Exception:
        print("[通信服务] 网页端连接断开")


async def main_ws(host, port):
    try:
        import websockets
    except ImportError as error:
        raise RuntimeError("缺少通信依赖 websockets，请先运行 pip install -r requirements.txt") from error

    print(f"[通信服务] WebSocket 启动：ws://{host}:{port}")
    async with websockets.serve(ws_server, host, port):
        await asyncio.Future()


def start_ws(host, port):
    asyncio.run(main_ws(host, port))


def parse_args():
    parser = argparse.ArgumentParser(description="Azur Promilia 小地图视觉追踪器")
    parser.add_argument("--map-id", choices=sorted(MAP_CONFIGS.keys()), default="shalulu")
    parser.add_argument("--minimap-roi", type=parse_roi, default=DEFAULT_MINIMAP_ROI, help="格式：y1,y2,x1,x2")
    parser.add_argument("--minimap-zoom", type=float, default=0.95)
    parser.add_argument("--center-hole", type=int, default=15)
    parser.add_argument("--screenshot-mode", choices=["fullscreen", "window"], default="fullscreen")
    parser.add_argument("--screenshot-method", choices=["bitblt", "pyautogui"], default="bitblt")
    parser.add_argument("--window-title", default="Promilia")
    parser.add_argument("--ws-host", default=DEFAULT_WS_HOST)
    parser.add_argument("--ws-port", type=int, default=DEFAULT_WS_PORT)
    parser.add_argument("--control-host", default=DEFAULT_CONTROL_HOST)
    parser.add_argument("--control-port", type=int, default=DEFAULT_CONTROL_PORT)
    parser.add_argument("--control-only", action="store_true", help="只启动网页控制接口")
    parser.add_argument("--no-control", action="store_true", help="不启动网页控制接口")
    parser.add_argument("--interval", type=float, default=0.033)
    parser.add_argument("--frame-skip", type=int, default=2)
    parser.add_argument("--frame-features", type=int, default=3500)
    parser.add_argument("--matcher-checks", type=int, default=64)
    parser.add_argument("--ratio", type=float, default=0.72)
    parser.add_argument("--min-local-confidence", type=float, default=0.46)
    parser.add_argument("--local-half-span", type=float, default=512.0)
    parser.add_argument("--max-jump", type=float, default=0.0, help="0 表示使用地图默认值")
    parser.add_argument("--smoothing", type=float, default=0.62)
    parser.add_argument("--force-cache", action="store_true")
    parser.add_argument("--build-cache", action="store_true", help="只构建全局参考缓存后退出")
    parser.add_argument("--no-preview", action="store_true")
    return parser.parse_args()


def main():
    args = parse_args()
    args.smoothing = max(0.0, min(1.0, args.smoothing))
    if args.control_only:
        start_control_http(args.control_host, args.control_port)
        return 0

    if not args.no_control:
        threading.Thread(target=start_control_http, args=(args.control_host, args.control_port), daemon=True).start()

    tracker = MinimapTracker(args)
    if args.build_cache:
        print(f"[缓存] {args.map_id} 全局参考已就绪：{tracker.global_manifest['referenceImage']}")
        return 0

    threading.Thread(target=start_ws, args=(args.ws_host, args.ws_port), daemon=True).start()
    tracker.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
