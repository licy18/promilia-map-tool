/**
 * 地图端位置追踪体验层
 */

(function () {

const TRACKER_STORAGE_KEYS = {
    enabled: 'promilia-tracker-enabled',
    source: 'promilia-tracker-source',
    follow: 'promilia-tracker-follow',
    trail: 'promilia-tracker-trail',
    url: 'promilia-tracker-url',
    radius: 'promilia-tracker-nearby-radius',
    smoothing: 'promilia-tracker-smoothing',
    maxJump: 'promilia-tracker-max-jump'
};

const TRACKER_SOURCE_LABELS = {
    websocket: 'WebSocket',
    'minimap-vision': '小地图视觉',
    manual: '手动',
    debug: '调试'
};

const TRACKER_MIN_CONFIDENCE = 0.25;
const TRACKER_MAX_TRAIL_POINTS = 360;
const TRACKER_DEFAULT_SMOOTHING = 0.65;
const TRACKER_DEFAULT_MAX_JUMP = 900;

const TRACKER_SOURCE_PROFILES = {
    websocket: { minConfidence: 0.25, timeoutMs: 5000, useStabilizer: true },
    'minimap-vision': { minConfidence: 0.35, timeoutMs: 3500, useStabilizer: true },
    manual: { minConfidence: 0, timeoutMs: Infinity, useStabilizer: false },
    debug: { minConfidence: 0, timeoutMs: Infinity, useStabilizer: false }
};

let trackerMarker = null;
let trackerTrailLine = null;
let trackerWebSocket = null;
let trackerReconnectTimer = null;
let trackerDebugTimer = null;
let trackerFreshnessTimer = null;
let trackerPickingLocation = false;

let trackerState = {
    enabled: localStorage.getItem(TRACKER_STORAGE_KEYS.enabled) === 'true',
    source: localStorage.getItem(TRACKER_STORAGE_KEYS.source) || 'websocket',
    follow: localStorage.getItem(TRACKER_STORAGE_KEYS.follow) === 'true',
    trailEnabled: localStorage.getItem(TRACKER_STORAGE_KEYS.trail) !== 'false',
    url: localStorage.getItem(TRACKER_STORAGE_KEYS.url) || 'ws://localhost:8765',
    nearbyRadius: Number(localStorage.getItem(TRACKER_STORAGE_KEYS.radius)) || 250,
    smoothing: getStoredTrackerNumber(TRACKER_STORAGE_KEYS.smoothing, TRACKER_DEFAULT_SMOOTHING, 0, 1),
    maxJump: getStoredTrackerNumber(TRACKER_STORAGE_KEYS.maxJump, TRACKER_DEFAULT_MAX_JUMP, 0),
    lastLocation: null,
    lastUpdateAt: 0,
    trailPoints: [],
    filteredCount: 0
};

function isSocketTrackerSource(source = trackerState.source) {
    return source === 'websocket' || source === 'minimap-vision';
}

function getTrackerSourceLabel(source) {
    return TRACKER_SOURCE_LABELS[source] || source || '-';
}

function getTrackerProfile(source = trackerState.source) {
    return TRACKER_SOURCE_PROFILES[source] || TRACKER_SOURCE_PROFILES.websocket;
}

function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, numeric));
}

function getStoredTrackerNumber(key, fallback, min = -Infinity, max = Infinity) {
    const rawValue = localStorage.getItem(key);
    if (rawValue === null || rawValue === '') return fallback;
    return clampNumber(rawValue, min, max, fallback);
}

function getFiniteNumber(...values) {
    for (const value of values) {
        if (value === null || value === undefined || value === '') continue;
        const numeric = Number(value);
        if (Number.isFinite(numeric)) return numeric;
    }
    return null;
}

function normalizeConfidence(value) {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.max(0, Math.min(1, numeric > 1 ? numeric / 100 : numeric));
}

function formatTrackerConfidence(confidence) {
    if (confidence === null || confidence === undefined) return '-';
    return `${Math.round(confidence * 100)}%`;
}

function formatTrackerTime(timestamp = Date.now()) {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function formatTrackerCoords(location) {
    if (!location) return '-';
    return `${location.lat.toFixed(1)}, ${location.lng.toFixed(1)}`;
}

function setTrackerText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function setTrackerStatus(status, tone = 'idle') {
    const statusEl = document.getElementById('tracker-status');
    if (!statusEl) return;
    statusEl.textContent = status;
    statusEl.className = `tracker-status tracker-status-${tone}`;
}

function syncTrackerPanel() {
    const enabledToggle = document.getElementById('tracker-toggle');
    const sourceSelect = document.getElementById('tracker-source');
    const followToggle = document.getElementById('tracker-follow-toggle');
    const trailToggle = document.getElementById('tracker-trail-toggle');
    const urlInput = document.getElementById('tracker-url');
    const radiusInput = document.getElementById('tracker-nearby-radius');
    const smoothingInput = document.getElementById('tracker-smoothing');
    const maxJumpInput = document.getElementById('tracker-max-jump');
    const socketFields = document.getElementById('tracker-socket-fields');

    if (enabledToggle) enabledToggle.checked = trackerState.enabled;
    if (sourceSelect) sourceSelect.value = trackerState.source;
    if (followToggle) followToggle.checked = trackerState.follow;
    if (trailToggle) trailToggle.checked = trackerState.trailEnabled;
    if (urlInput) urlInput.value = trackerState.url;
    if (radiusInput) radiusInput.value = trackerState.nearbyRadius;
    if (smoothingInput) smoothingInput.value = trackerState.smoothing;
    if (maxJumpInput) maxJumpInput.value = trackerState.maxJump;
    if (socketFields) socketFields.style.display = isSocketTrackerSource() ? 'grid' : 'none';

    setTrackerText('tracker-source-label', getTrackerSourceLabel(trackerState.source));
    setTrackerText('tracker-confidence', formatTrackerConfidence(trackerState.lastLocation?.confidence));
    setTrackerText('tracker-coords', formatTrackerCoords(trackerState.lastLocation));
    setTrackerText('tracker-updated-at', trackerState.lastUpdateAt ? formatTrackerTime(trackerState.lastUpdateAt) : '-');
    setTrackerText('tracker-filtered-count', String(trackerState.filteredCount));
}

function createTrackerIcon(location) {
    const staleClass = location?.stale ? ' tracker-marker-stale' : '';
    const sourceLabel = getTrackerSourceLabel(location?.source || trackerState.source);
    return L.divIcon({
        className: 'tracker-marker',
        html: `
            <div class="tracker-marker-dot${staleClass}">
                <i class="fas fa-location-arrow"></i>
                <span>${sourceLabel}</span>
            </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        popupAnchor: [0, -16]
    });
}

function createTrackerPopup(location) {
    const stateLabel = location.state || 'tracking';
    return `
        <div class="popup-content tracker-popup">
            <h3><i class="fas fa-location-arrow"></i> 当前位置</h3>
            <p><strong>来源：</strong>${getTrackerSourceLabel(location.source)}</p>
            <p><strong>状态：</strong>${stateLabel}</p>
            <p><strong>坐标层：</strong>${location.coordinateSpace || 'map'} / ${location.coordinateMethod || '-'}</p>
            <p><strong>置信度：</strong>${formatTrackerConfidence(location.confidence)}</p>
            <p><strong>坐标：</strong>${formatTrackerCoords(location)}</p>
            ${location.smoothed ? `<p><strong>原始坐标：</strong>${location.rawLat.toFixed(1)}, ${location.rawLng.toFixed(1)}</p>` : ''}
            <p><strong>时间：</strong>${formatTrackerTime(location.updatedAt)}</p>
        </div>
    `;
}

function updateTrackerMarker(location) {
    const latLng = L.latLng(location.lat, location.lng);

    if (!trackerMarker) {
        trackerMarker = L.marker(latLng, {
            icon: createTrackerIcon(location),
            zIndexOffset: 2000,
            keyboard: false
        }).addTo(map);
    } else {
        trackerMarker.setLatLng(latLng);
        trackerMarker.setIcon(createTrackerIcon(location));
    }

    trackerMarker.bindPopup(createTrackerPopup(location));
}

function updateTrackerTrail(location) {
    if (!trackerState.trailEnabled) {
        clearTrackerTrailLayer(false);
        return;
    }

    const latLng = L.latLng(location.lat, location.lng);
    const lastPoint = trackerState.trailPoints[trackerState.trailPoints.length - 1];
    if (!lastPoint || lastPoint.distanceTo(latLng) > 1) {
        trackerState.trailPoints.push(latLng);
    }

    if (trackerState.trailPoints.length > TRACKER_MAX_TRAIL_POINTS) {
        trackerState.trailPoints.splice(0, trackerState.trailPoints.length - TRACKER_MAX_TRAIL_POINTS);
    }

    if (!trackerTrailLine) {
        trackerTrailLine = L.polyline(trackerState.trailPoints, {
            color: '#00ff88',
            weight: 3,
            opacity: 0.72,
            interactive: false,
            pane: 'overlayPane'
        }).addTo(map);
    } else {
        trackerTrailLine.setLatLngs(trackerState.trailPoints);
    }
}

function clearTrackerTrailLayer(clearPoints = true) {
    if (trackerTrailLine) {
        map.removeLayer(trackerTrailLine);
        trackerTrailLine = null;
    }
    if (clearPoints) {
        trackerState.trailPoints = [];
    }
}

function normalizeTrackerPayload(payload) {
    if (!payload || typeof payload !== 'object') return null;

    const data = payload.data || payload.location || payload.position || payload;
    const mapPoint = data.map || payload.map || null;
    const gamePoint = data.game || payload.game || null;
    const imagePoint = data.image || data.pixel || payload.image || payload.pixel || null;
    const mapId = payload.mapId || data.mapId || currentMapId;
    const source = payload.source || data.source || trackerState.source;
    const coordinateSpace = String(payload.coordinateSpace || data.coordinateSpace || data.space || 'map').toLowerCase();
    const confidence = normalizeConfidence(payload.confidence ?? data.confidence ?? data.score);
    const baseLocation = {
        source,
        coordinateSpace,
        mapId,
        confidence,
        state: payload.state || data.state || 'tracking',
        matches: getFiniteNumber(payload.matches, data.matches, data.goodMatches),
        reset: Boolean(payload.reset || data.reset),
        raw: payload
    };

    let mapped = null;
    if (coordinateSpace === 'game' || coordinateSpace === 'world') {
        mapped = typeof window.gameToMap === 'function'
            ? window.gameToMap(gamePoint || data, mapId)
            : null;
    } else if (coordinateSpace === 'image' || coordinateSpace === 'pixel' || coordinateSpace === 'legacy-shalulu') {
        mapped = typeof window.imageToMap === 'function'
            ? window.imageToMap(imagePoint || data, mapId)
            : null;
    } else if (coordinateSpace === 'native') {
        mapped = window.CoordinateSystem?.nativeToMap
            ? window.CoordinateSystem.nativeToMap(data, mapId)
            : null;
    } else {
        mapped = window.CoordinateSystem?.convertPoint
            ? window.CoordinateSystem.convertPoint(mapPoint || data, { from: 'map', to: 'map', mapId })
            : null;
    }

    if (mapped && Number.isFinite(mapped.lat) && Number.isFinite(mapped.lng)) {
        return {
            ...baseLocation,
            lat: Number(mapped.lat),
            lng: Number(mapped.lng),
            coordinateMethod: mapped.method || coordinateSpace,
            calibration: mapped.calibration || null
        };
    }

    return null;
}

function getTrackerTimeoutMs(location = trackerState.lastLocation) {
    return getTrackerProfile(location?.source || trackerState.source).timeoutMs;
}

function shouldBypassStabilizer(location) {
    if (!getTrackerProfile(location.source).useStabilizer) return true;
    if (location.reset) return true;
    return ['manual', 'debug', 'teleport'].includes(location.state);
}

function resetTrackerStabilizer(options = {}) {
    trackerState.filteredCount = 0;
    if (options.clearLocation) {
        if (trackerMarker) {
            map.removeLayer(trackerMarker);
            trackerMarker = null;
        }
        clearTrackerTrailLayer(true);
        trackerState.lastLocation = null;
        trackerState.lastUpdateAt = 0;
        updateNearbyTrackerList(null);
        syncTrackerPanel();
    }
}

function stabilizeTrackerLocation(location) {
    const now = Date.now();
    const rawLat = location.lat;
    const rawLng = location.lng;
    const lastLocation = trackerState.lastLocation;
    const timeoutMs = getTrackerTimeoutMs(location);
    const staleGap = Number.isFinite(timeoutMs) && trackerState.lastUpdateAt && (now - trackerState.lastUpdateAt > timeoutMs);

    location.rawLat = rawLat;
    location.rawLng = rawLng;
    location.stale = false;

    if (shouldBypassStabilizer(location) || !lastLocation || staleGap) {
        return location;
    }

    const rawDistance = getDistanceBetween(location, lastLocation);
    const maxJump = clampNumber(trackerState.maxJump, 0, Infinity, TRACKER_DEFAULT_MAX_JUMP);
    if (maxJump > 0 && rawDistance > maxJump) {
        trackerState.filteredCount++;
        setTrackerStatus(`跳变拦截 ${Math.round(rawDistance)}`, 'warn');
        setTrackerText('tracker-filtered-count', String(trackerState.filteredCount));
        return null;
    }

    const smoothing = clampNumber(trackerState.smoothing, 0, 1, TRACKER_DEFAULT_SMOOTHING);
    location.lat = lastLocation.lat + smoothing * (rawLat - lastLocation.lat);
    location.lng = lastLocation.lng + smoothing * (rawLng - lastLocation.lng);
    location.smoothed = smoothing < 1;
    return location;
}

function acceptTrackerLocation(payload) {
    const location = normalizeTrackerPayload(payload);
    if (!location) {
        setTrackerStatus('无坐标', 'warn');
        return false;
    }

    if (location.mapId && location.mapId !== currentMapId) {
        const targetName = MAP_CONFIGS[location.mapId]?.name || location.mapId;
        setTrackerStatus(`地图不匹配：${targetName}`, 'warn');
        return false;
    }

    const minConfidence = getTrackerProfile(location.source).minConfidence ?? TRACKER_MIN_CONFIDENCE;
    if (location.confidence !== null && location.confidence < minConfidence) {
        setTrackerStatus('低置信度', 'warn');
        setTrackerText('tracker-confidence', formatTrackerConfidence(location.confidence));
        return false;
    }

    const rawLatLng = L.latLng(location.lat, location.lng);
    if (typeof isInsideCurrentMapBounds === 'function' && !isInsideCurrentMapBounds(rawLatLng)) {
        setTrackerStatus('坐标越界', 'warn');
        return false;
    }

    const stabilizedLocation = stabilizeTrackerLocation(location);
    if (!stabilizedLocation) {
        return false;
    }

    location.updatedAt = Date.now();
    trackerState.lastLocation = location;
    trackerState.lastUpdateAt = location.updatedAt;
    const acceptedLatLng = L.latLng(location.lat, location.lng);

    updateTrackerMarker(location);
    updateTrackerTrail(location);
    updateNearbyTrackerList(location);

    if (trackerState.follow) {
        map.panTo(acceptedLatLng, { animate: true, duration: 0.25 });
    }

    const confidenceText = location.confidence === null ? '' : ` ${formatTrackerConfidence(location.confidence)}`;
    setTrackerStatus(`${location.state || 'tracking'}${confidenceText}`, 'ok');
    syncTrackerPanel();
    return true;
}

function getDistanceBetween(a, b) {
    const dLat = Number(a.lat) - Number(b.lat);
    const dLng = Number(a.lng) - Number(b.lng);
    return Math.sqrt(dLat * dLat + dLng * dLng);
}

function getTrackerNearbyUserMarkers(location) {
    return Object.values(markerData || {})
        .filter(marker => !isMarkerCollected(marker.id))
        .map(marker => {
            const config = MARKER_CONFIGS[marker.type] || {};
            return {
                kind: 'user',
                id: marker.id,
                label: marker.note || config.label || marker.type,
                typeLabel: config.label || marker.type,
                lat: marker.lat,
                lng: marker.lng,
                color: config.color || '#00d9ff',
                icon: config.icon || 'fa-map-marker-alt',
                distance: getDistanceBetween(location, marker),
                focus: () => map.flyTo([marker.lat, marker.lng], Math.max(map.getZoom(), -1), { duration: 0.4 })
            };
        });
}

function getTrackerNearbyOfficialPoints(location) {
    if (typeof currentOfficialDataset === 'undefined' || !currentOfficialDataset?.points) {
        return [];
    }

    return currentOfficialDataset.points
        .filter(point => point.inBounds && point.map)
        .filter(point => typeof isOfficialCategoryVisible !== 'function' || isOfficialCategoryVisible(point, currentOfficialDataset))
        .map(point => {
            const config = typeof getOfficialMarkerConfig === 'function'
                ? getOfficialMarkerConfig(point)
                : { color: '#95a5a6', icon: 'fa-circle', label: point.categoryLabel || point.typeLabel || point.type };
            return {
                kind: 'official',
                id: point.id,
                label: point.displayName || point.categoryLabel || point.typeLabel || point.id,
                typeLabel: point.categoryLabel || point.typeLabel || point.type,
                lat: point.map.lat,
                lng: point.map.lng,
                color: config.color || '#95a5a6',
                icon: config.icon || 'fa-circle',
                distance: getDistanceBetween(location, point.map),
                focus: () => map.flyTo([point.map.lat, point.map.lng], Math.max(map.getZoom(), -1), { duration: 0.4 })
            };
        });
}

function updateNearbyTrackerList(location = trackerState.lastLocation) {
    const listEl = document.getElementById('tracker-nearby-list');
    if (!listEl) return;

    if (!location) {
        listEl.innerHTML = '<div class="tracker-empty">等待位置</div>';
        return;
    }

    const radius = Number(trackerState.nearbyRadius) || 250;
    const nearby = [
        ...getTrackerNearbyUserMarkers(location),
        ...getTrackerNearbyOfficialPoints(location)
    ]
        .filter(item => Number.isFinite(item.distance) && item.distance <= radius)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 8);

    if (!nearby.length) {
        listEl.innerHTML = '<div class="tracker-empty">附近暂无点位</div>';
        return;
    }

    listEl.innerHTML = nearby.map((item, index) => `
        <button type="button" class="tracker-nearby-item" data-index="${index}">
            <span class="tracker-nearby-icon" style="background:${item.color}">
                <i class="fas ${item.icon}"></i>
            </span>
            <span class="tracker-nearby-main">
                <span class="tracker-nearby-name">${escapeTrackerHtml(item.label)}</span>
                <span class="tracker-nearby-type">${item.kind === 'official' ? '官方' : '标记'} / ${escapeTrackerHtml(item.typeLabel)}</span>
            </span>
            <span class="tracker-nearby-distance">${Math.round(item.distance)}</span>
        </button>
    `).join('');

    listEl.querySelectorAll('.tracker-nearby-item').forEach(button => {
        button.addEventListener('click', function () {
            nearby[Number(this.dataset.index)]?.focus();
        });
    });
}

function escapeTrackerHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function connectTrackerSocket() {
    closeTrackerSocket();
    setTrackerStatus('连接中', 'warn');

    try {
        trackerWebSocket = new WebSocket(trackerState.url);
    } catch (error) {
        console.error('追踪器连接创建失败:', error);
        setTrackerStatus('连接失败', 'bad');
        return;
    }

    const socket = trackerWebSocket;

    socket.onopen = function () {
        if (trackerWebSocket !== socket) return;
        setTrackerStatus('已连接', 'ok');
        showToast('追踪坐标源已连接', 'success');
    };

    socket.onmessage = function (event) {
        if (trackerWebSocket !== socket) return;
        try {
            const payload = JSON.parse(event.data);
            if (payload.type === 'connection' || payload.type === 'status') {
                setTrackerStatus(payload.status || '已连接', payload.status === 'lost' ? 'warn' : 'ok');
                return;
            }
            acceptTrackerLocation(payload);
        } catch (error) {
            console.error('解析追踪坐标失败:', error);
            setTrackerStatus('数据错误', 'bad');
        }
    };

    socket.onerror = function () {
        if (trackerWebSocket !== socket) return;
        setTrackerStatus('连接错误', 'bad');
    };

    socket.onclose = function () {
        if (trackerWebSocket !== socket) return;
        closeTrackerSocket(false);
        if (!trackerState.enabled || !isSocketTrackerSource()) {
            setTrackerStatus('未连接', 'idle');
            return;
        }
        setTrackerStatus('重连中', 'warn');
        trackerReconnectTimer = setTimeout(connectTrackerSocket, 3000);
    };
}

function closeTrackerSocket(clearReconnect = true) {
    if (clearReconnect && trackerReconnectTimer) {
        clearTimeout(trackerReconnectTimer);
        trackerReconnectTimer = null;
    }

    if (trackerWebSocket) {
        const socket = trackerWebSocket;
        trackerWebSocket = null;
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        try {
            socket.close();
        } catch (error) {
            console.warn('关闭追踪连接失败:', error);
        }
    }
}

function startDebugTracker() {
    stopDebugTracker();
    const bounds = getMapBounds(currentMapConfig);
    const center = bounds.getCenter();
    const width = Math.abs(bounds.getEast() - bounds.getWest());
    const height = Math.abs(bounds.getNorth() - bounds.getSouth());
    let step = 0;

    trackerDebugTimer = setInterval(() => {
        step += 0.08;
        acceptTrackerLocation({
            type: 'location',
            source: 'debug',
            mapId: currentMapId,
            confidence: 1,
            state: 'debug',
            lat: center.lat + Math.sin(step * 0.7) * height * 0.18,
            lng: center.lng + Math.cos(step) * width * 0.18
        });
    }, 550);

    setTrackerStatus('调试中', 'ok');
}

function stopDebugTracker() {
    if (trackerDebugTimer) {
        clearInterval(trackerDebugTimer);
        trackerDebugTimer = null;
    }
}

function startTrackerFreshnessTimer() {
    if (trackerFreshnessTimer) return;
    trackerFreshnessTimer = setInterval(() => {
        if (!trackerState.enabled || !trackerState.lastUpdateAt) return;
        const timeoutMs = getTrackerTimeoutMs();
        if (!Number.isFinite(timeoutMs)) return;
        const age = Date.now() - trackerState.lastUpdateAt;
        if (age > timeoutMs) {
            setTrackerStatus('信号中断', 'warn');
            if (trackerState.lastLocation && trackerMarker) {
                trackerState.lastLocation.stale = true;
                trackerMarker.setIcon(createTrackerIcon(trackerState.lastLocation));
            }
        }
    }, 1000);
}

function stopTrackerFreshnessTimer() {
    if (trackerFreshnessTimer) {
        clearInterval(trackerFreshnessTimer);
        trackerFreshnessTimer = null;
    }
}

function startTrackerSource(options = {}) {
    closeTrackerSocket();
    stopDebugTracker();
    startTrackerFreshnessTimer();
    resetTrackerStabilizer({ clearLocation: Boolean(options.clearLocation) });

    if (!trackerState.enabled) {
        setTrackerStatus('未开启', 'idle');
        return;
    }

    if (isSocketTrackerSource()) {
        connectTrackerSocket();
    } else if (trackerState.source === 'debug') {
        startDebugTracker();
    } else {
        setTrackerStatus('手动模式', 'ok');
    }
}

function stopTrackerSource(removeVisuals = true) {
    closeTrackerSocket();
    stopDebugTracker();
    stopTrackerFreshnessTimer();
    trackerPickingLocation = false;

    if (removeVisuals && trackerMarker) {
        map.removeLayer(trackerMarker);
        trackerMarker = null;
    }
    if (removeVisuals) {
        clearTrackerTrailLayer(true);
        trackerState.lastLocation = null;
        trackerState.lastUpdateAt = 0;
        updateNearbyTrackerList(null);
    }

    setTrackerStatus('未开启', 'idle');
    syncTrackerPanel();
}

function persistTrackerState() {
    localStorage.setItem(TRACKER_STORAGE_KEYS.enabled, trackerState.enabled ? 'true' : 'false');
    localStorage.setItem(TRACKER_STORAGE_KEYS.source, trackerState.source);
    localStorage.setItem(TRACKER_STORAGE_KEYS.follow, trackerState.follow ? 'true' : 'false');
    localStorage.setItem(TRACKER_STORAGE_KEYS.trail, trackerState.trailEnabled ? 'true' : 'false');
    localStorage.setItem(TRACKER_STORAGE_KEYS.url, trackerState.url);
    localStorage.setItem(TRACKER_STORAGE_KEYS.radius, String(trackerState.nearbyRadius));
    localStorage.setItem(TRACKER_STORAGE_KEYS.smoothing, String(trackerState.smoothing));
    localStorage.setItem(TRACKER_STORAGE_KEYS.maxJump, String(trackerState.maxJump));
}

function activateManualTrackerSource() {
    trackerState.source = 'manual';
    closeTrackerSocket();
    stopDebugTracker();
    persistTrackerState();
    syncTrackerPanel();
    if (trackerState.enabled) {
        setTrackerStatus('手动模式', 'ok');
    }
}

window.toggleTracker = function () {
    const toggle = document.getElementById('tracker-toggle');
    trackerState.enabled = Boolean(toggle?.checked);
    persistTrackerState();

    if (trackerState.enabled) {
        startTrackerSource();
        showToast('已开启位置追踪', 'success');
    } else {
        stopTrackerSource(true);
        showToast('已关闭位置追踪', 'info');
    }
};

window.focusTrackerLocation = function () {
    if (!trackerState.lastLocation) {
        showToast('还没有可定位的位置', 'info');
        return;
    }
    map.flyTo([trackerState.lastLocation.lat, trackerState.lastLocation.lng], Math.max(map.getZoom(), -1), { duration: 0.45 });
};

window.setTrackerToMapCenter = function () {
    activateManualTrackerSource();
    const center = map.getCenter();
    acceptTrackerLocation({
        type: 'location',
        source: 'manual',
        mapId: currentMapId,
        confidence: 1,
        state: 'manual',
        lat: center.lat,
        lng: center.lng
    });
};

window.pickTrackerLocationOnMap = function () {
    activateManualTrackerSource();
    if (!trackerState.enabled) {
        const toggle = document.getElementById('tracker-toggle');
        if (toggle) toggle.checked = true;
        trackerState.enabled = true;
        persistTrackerState();
        startTrackerSource();
    }

    const routeToggle = document.getElementById('route-mode-toggle');
    if (routeToggle && routeToggle.checked) {
        routeToggle.checked = false;
        routeToggle.dispatchEvent(new Event('change'));
    }
    const browseToggle = document.getElementById('browse-mode-toggle');
    if (browseToggle && !browseToggle.checked) {
        browseToggle.checked = true;
        browseToggle.dispatchEvent(new Event('change'));
    }

    trackerPickingLocation = true;
    setTrackerStatus('等待点选', 'warn');
    showToast('在地图上点选当前位置', 'info');
    map.once('click', function (event) {
        trackerPickingLocation = false;
        acceptTrackerLocation({
            type: 'location',
            source: 'manual',
            mapId: currentMapId,
            confidence: 1,
            state: 'manual',
            lat: event.latlng.lat,
            lng: event.latlng.lng
        });
    });
};

window.clearTrackerTrail = function () {
    clearTrackerTrailLayer(true);
    showToast('追踪轨迹已清除', 'success');
};

window.isTrackerPickingLocation = function () {
    return trackerPickingLocation;
};

window.updateTrackerLocation = function (payload) {
    return acceptTrackerLocation(payload);
};

window.syncTrackerToCurrentMap = function () {
    if (trackerMarker) {
        map.removeLayer(trackerMarker);
        trackerMarker = null;
    }
    clearTrackerTrailLayer(true);
    trackerState.lastLocation = null;
    trackerState.lastUpdateAt = 0;
    resetTrackerStabilizer();
    updateNearbyTrackerList(null);
    syncTrackerPanel();
    if (trackerState.enabled && trackerState.source === 'debug') {
        startDebugTracker();
    }
};

window.initTrackerUI = function () {
    if (document.getElementById('tracker-panel')) {
        syncTrackerPanel();
        return;
    }

    const sidebar = document.getElementById('sidebar');
    const anchor = sidebar?.querySelector('.map-switcher');
    if (!sidebar || !anchor) return;

    const trackerSection = document.createElement('section');
    trackerSection.className = 'section tracker-panel';
    trackerSection.id = 'tracker-panel';
    trackerSection.innerHTML = `
        <h2><i class="fas fa-location-arrow"></i> 位置追踪</h2>
        <div class="tracker-card">
            <div class="tracker-row tracker-row-main">
                <label class="tracker-label">追踪</label>
                <label class="switch">
                    <input type="checkbox" id="tracker-toggle" onchange="toggleTracker()">
                    <span class="slider"></span>
                </label>
            </div>
            <label class="tracker-field">
                <span>坐标源</span>
                <select id="tracker-source">
                    <option value="websocket">WebSocket 坐标流</option>
                    <option value="minimap-vision">小地图视觉流</option>
                    <option value="manual">手动校准</option>
                    <option value="debug">调试轨迹</option>
                </select>
            </label>
            <div id="tracker-socket-fields" class="tracker-field">
                <span>地址</span>
                <input type="text" id="tracker-url" spellcheck="false">
            </div>
            <div class="tracker-toggle-grid">
                <label><input type="checkbox" id="tracker-follow-toggle"> 跟随</label>
                <label><input type="checkbox" id="tracker-trail-toggle"> 轨迹</label>
            </div>
            <div class="tracker-actions">
                <button type="button" onclick="focusTrackerLocation()" title="定位到当前位置"><i class="fas fa-crosshairs"></i></button>
                <button type="button" onclick="setTrackerToMapCenter()" title="使用地图中心"><i class="fas fa-bullseye"></i></button>
                <button type="button" onclick="pickTrackerLocationOnMap()" title="点选当前位置"><i class="fas fa-map-pin"></i></button>
                <button type="button" onclick="clearTrackerTrail()" title="清除轨迹"><i class="fas fa-eraser"></i></button>
            </div>
            <div class="tracker-status-grid">
                <span>状态</span><strong id="tracker-status" class="tracker-status tracker-status-idle">未开启</strong>
                <span>来源</span><strong id="tracker-source-label">-</strong>
                <span>置信度</span><strong id="tracker-confidence">-</strong>
                <span>坐标</span><strong id="tracker-coords">-</strong>
                <span>更新</span><strong id="tracker-updated-at">-</strong>
                <span>过滤</span><strong id="tracker-filtered-count">0</strong>
            </div>
            <div class="tracker-tuning-grid">
                <label>
                    <span>平滑</span>
                    <input type="number" id="tracker-smoothing" min="0" max="1" step="0.05">
                </label>
                <label>
                    <span>跳变阈值</span>
                    <input type="number" id="tracker-max-jump" min="0" step="50">
                </label>
            </div>
            <label class="tracker-field tracker-radius-field">
                <span>附近半径</span>
                <input type="number" id="tracker-nearby-radius" min="10" step="10">
            </label>
            <div id="tracker-nearby-list" class="tracker-nearby-list">
                <div class="tracker-empty">等待位置</div>
            </div>
        </div>
    `;

    anchor.insertAdjacentElement('afterend', trackerSection);

    const sourceSelect = document.getElementById('tracker-source');
    const followToggle = document.getElementById('tracker-follow-toggle');
    const trailToggle = document.getElementById('tracker-trail-toggle');
    const urlInput = document.getElementById('tracker-url');
    const radiusInput = document.getElementById('tracker-nearby-radius');
    const smoothingInput = document.getElementById('tracker-smoothing');
    const maxJumpInput = document.getElementById('tracker-max-jump');

    sourceSelect?.addEventListener('change', function () {
        trackerState.source = this.value;
        persistTrackerState();
        syncTrackerPanel();
        if (trackerState.enabled) startTrackerSource({ clearLocation: true });
    });

    followToggle?.addEventListener('change', function () {
        trackerState.follow = this.checked;
        persistTrackerState();
    });

    trailToggle?.addEventListener('change', function () {
        trackerState.trailEnabled = this.checked;
        persistTrackerState();
        if (!trackerState.trailEnabled) clearTrackerTrailLayer(false);
        if (trackerState.trailEnabled && trackerState.lastLocation) updateTrackerTrail(trackerState.lastLocation);
    });

    urlInput?.addEventListener('change', function () {
        trackerState.url = this.value.trim() || 'ws://localhost:8765';
        persistTrackerState();
        if (trackerState.enabled && isSocketTrackerSource()) connectTrackerSocket();
    });

    radiusInput?.addEventListener('change', function () {
        trackerState.nearbyRadius = Math.max(10, Number(this.value) || 250);
        persistTrackerState();
        syncTrackerPanel();
        updateNearbyTrackerList();
    });

    smoothingInput?.addEventListener('change', function () {
        trackerState.smoothing = clampNumber(this.value, 0, 1, TRACKER_DEFAULT_SMOOTHING);
        persistTrackerState();
        syncTrackerPanel();
    });

    maxJumpInput?.addEventListener('change', function () {
        trackerState.maxJump = clampNumber(this.value, 0, Infinity, TRACKER_DEFAULT_MAX_JUMP);
        persistTrackerState();
        syncTrackerPanel();
    });

    syncTrackerPanel();
    if (trackerState.enabled) startTrackerSource();
};

})();
