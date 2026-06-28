/**
 * Coordinate conversion helpers for tracker and future coordinate sources.
 */

(function () {

const MIN_CALIBRATION_POINTS = 3;
const calibrationCache = new Map();

function finiteNumber(...values) {
    for (const value of values) {
        if (value === null || value === undefined || value === '') continue;
        const numeric = Number(value);
        if (Number.isFinite(numeric)) return numeric;
    }
    return null;
}

function getMapConfig(mapId = currentMapId) {
    if (typeof MAP_CONFIGS !== 'undefined' && MAP_CONFIGS[mapId]) {
        return MAP_CONFIGS[mapId];
    }
    if (typeof mapConfigs !== 'undefined' && mapConfigs[mapId]) {
        return mapConfigs[mapId];
    }
    return null;
}

function getBoundsArray(config) {
    if (config && Array.isArray(config.bounds) && config.bounds.length === 2) {
        return config.bounds;
    }
    return [[0, 0], [config?.height || 0, config?.width || 0]];
}

function getBoundsMetrics(config) {
    const bounds = getBoundsArray(config);
    const minLat = Math.min(bounds[0][0], bounds[1][0]);
    const maxLat = Math.max(bounds[0][0], bounds[1][0]);
    const minLng = Math.min(bounds[0][1], bounds[1][1]);
    const maxLng = Math.max(bounds[0][1], bounds[1][1]);
    return {
        minLat,
        maxLat,
        minLng,
        maxLng,
        latSpan: maxLat - minLat,
        lngSpan: maxLng - minLng
    };
}

function coerceMapPoint(point) {
    const source = point?.map || point || {};
    const lat = finiteNumber(source.lat, source.latitude, source.mapLat);
    const lng = finiteNumber(source.lng, source.lon, source.longitude, source.mapLng);
    if (lat === null || lng === null) return null;
    return { lat, lng, method: 'map' };
}

function imageToMap(point, mapId = currentMapId) {
    const config = getMapConfig(mapId);
    if (!config) return null;

    const source = point?.image || point?.pixel || point || {};
    const x = finiteNumber(source.x, source.pixelX, source.imageX, source.rawX);
    const y = finiteNumber(source.y, source.pixelY, source.imageY, source.rawY);
    if (x === null || y === null) return null;

    const width = Number(config.width) || 1;
    const height = Number(config.height) || 1;
    const bounds = getBoundsMetrics(config);

    return {
        lat: bounds.maxLat - (y / height) * bounds.latSpan,
        lng: bounds.minLng + (x / width) * bounds.lngSpan,
        method: 'image'
    };
}

function mapToImage(point, mapId = currentMapId) {
    const config = getMapConfig(mapId);
    const mapPoint = coerceMapPoint(point);
    if (!config || !mapPoint) return null;

    const width = Number(config.width) || 1;
    const height = Number(config.height) || 1;
    const bounds = getBoundsMetrics(config);

    return {
        x: ((mapPoint.lng - bounds.minLng) / bounds.lngSpan) * width,
        y: ((bounds.maxLat - mapPoint.lat) / bounds.latSpan) * height,
        method: 'image'
    };
}

function nativeToMap(point) {
    const source = point?.native || point || {};
    const lat = finiteNumber(source.lat, source.y, source.z);
    const lng = finiteNumber(source.lng, source.x);
    if (lat === null || lng === null) return null;
    return { lat, lng, method: 'native' };
}

function mapToNative(point) {
    const mapPoint = coerceMapPoint(point);
    if (!mapPoint) return null;
    return {
        x: mapPoint.lng,
        y: mapPoint.lat,
        lat: mapPoint.lat,
        lng: mapPoint.lng,
        method: 'native'
    };
}

function solve3(matrix, vector) {
    const m = matrix.map(row => row.slice());
    const v = vector.slice();

    for (let i = 0; i < 3; i++) {
        let pivot = i;
        for (let row = i + 1; row < 3; row++) {
            if (Math.abs(m[row][i]) > Math.abs(m[pivot][i])) pivot = row;
        }
        if (Math.abs(m[pivot][i]) < 1e-9) return null;

        [m[i], m[pivot]] = [m[pivot], m[i]];
        [v[i], v[pivot]] = [v[pivot], v[i]];

        const divisor = m[i][i];
        for (let col = i; col < 3; col++) m[i][col] /= divisor;
        v[i] /= divisor;

        for (let row = 0; row < 3; row++) {
            if (row === i) continue;
            const factor = m[row][i];
            for (let col = i; col < 3; col++) {
                m[row][col] -= factor * m[i][col];
            }
            v[row] -= factor * v[i];
        }
    }

    return v;
}

function fitAffine(points, targetGetter) {
    const ata = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const atb = [0, 0, 0];

    points.forEach(point => {
        const row = [point.game.x, point.game.z, 1];
        const value = targetGetter(point);
        for (let i = 0; i < 3; i++) {
            atb[i] += row[i] * value;
            for (let j = 0; j < 3; j++) {
                ata[i][j] += row[i] * row[j];
            }
        }
    });

    return solve3(ata, atb);
}

function getOfficialDatasetForMap(mapId) {
    const config = getMapConfig(mapId);
    const officialKey = config?.officialData?.key || mapId;

    if (typeof currentMapId !== 'undefined' &&
        currentMapId === mapId &&
        typeof currentOfficialDataset !== 'undefined' &&
        currentOfficialDataset?.points) {
        return currentOfficialDataset;
    }

    if (window.OFFICIAL_POINT_DATA && window.OFFICIAL_POINT_DATA[officialKey]) {
        return window.OFFICIAL_POINT_DATA[officialKey];
    }

    return null;
}

function buildGameCalibration(mapId = currentMapId) {
    const dataset = getOfficialDatasetForMap(mapId);
    if (!dataset?.points) return null;

    const cached = calibrationCache.get(mapId);
    if (cached?.dataset === dataset) return cached.calibration;

    const points = dataset.points.filter(point =>
        point.inBounds &&
        point.map &&
        point.game &&
        Number.isFinite(Number(point.game.x)) &&
        Number.isFinite(Number(point.game.z)) &&
        Number.isFinite(Number(point.map.lat)) &&
        Number.isFinite(Number(point.map.lng))
    ).map(point => ({
        game: {
            x: Number(point.game.x),
            z: Number(point.game.z)
        },
        map: {
            lat: Number(point.map.lat),
            lng: Number(point.map.lng)
        }
    }));

    if (points.length < MIN_CALIBRATION_POINTS) return null;

    const latCoefficients = fitAffine(points, point => point.map.lat);
    const lngCoefficients = fitAffine(points, point => point.map.lng);
    if (!latCoefficients || !lngCoefficients) return null;

    let totalError = 0;
    let maxError = 0;
    points.forEach(point => {
        const mapped = applyGameAffine(point.game, latCoefficients, lngCoefficients);
        const error = Math.hypot(mapped.lat - point.map.lat, mapped.lng - point.map.lng);
        totalError += error;
        maxError = Math.max(maxError, error);
    });

    const calibration = {
        mapId,
        pointCount: points.length,
        latCoefficients,
        lngCoefficients,
        meanError: totalError / points.length,
        maxError
    };
    calibrationCache.set(mapId, { dataset, calibration });
    return calibration;
}

function applyGameAffine(point, latCoefficients, lngCoefficients) {
    return {
        lat: latCoefficients[0] * point.x + latCoefficients[1] * point.z + latCoefficients[2],
        lng: lngCoefficients[0] * point.x + lngCoefficients[1] * point.z + lngCoefficients[2]
    };
}

function gameToMap(point, mapId = currentMapId) {
    const source = point?.game || point || {};
    const x = finiteNumber(source.x, source.gameX, source.worldX);
    const z = finiteNumber(source.z, source.gameZ, source.worldZ);
    if (x === null || z === null) return null;

    const calibration = buildGameCalibration(mapId);
    if (!calibration) return null;

    return {
        ...applyGameAffine({ x, z }, calibration.latCoefficients, calibration.lngCoefficients),
        method: 'official-affine',
        calibration
    };
}

function mapToGame(point, mapId = currentMapId) {
    const mapPoint = coerceMapPoint(point);
    const calibration = buildGameCalibration(mapId);
    if (!mapPoint || !calibration) return null;

    const [a, b, c] = calibration.latCoefficients;
    const [d, e, f] = calibration.lngCoefficients;
    const determinant = a * e - b * d;
    if (Math.abs(determinant) < 1e-9) return null;

    const lat = mapPoint.lat - c;
    const lng = mapPoint.lng - f;
    return {
        x: (lat * e - b * lng) / determinant,
        z: (a * lng - lat * d) / determinant,
        method: 'official-affine',
        calibration
    };
}

function convertPoint(point, options = {}) {
    const mapId = options.mapId || currentMapId;
    const from = String(options.from || 'map').toLowerCase();
    const to = String(options.to || 'map').toLowerCase();

    if (to === 'map' || to === 'leaflet') {
        if (from === 'map' || from === 'leaflet') return coerceMapPoint(point);
        if (from === 'image' || from === 'pixel' || from === 'legacy-shalulu') return imageToMap(point, mapId);
        if (from === 'game' || from === 'world') return gameToMap(point, mapId);
        if (from === 'native') return nativeToMap(point, mapId);
        return coerceMapPoint(point);
    }

    if (from !== 'map' && from !== 'leaflet') {
        const mapped = convertPoint(point, { from, to: 'map', mapId });
        if (!mapped) return null;
        return convertPoint(mapped, { from: 'map', to, mapId });
    }

    if (to === 'image' || to === 'pixel' || to === 'legacy-shalulu') return mapToImage(point, mapId);
    if (to === 'game' || to === 'world') return mapToGame(point, mapId);
    if (to === 'native') return mapToNative(point, mapId);
    return coerceMapPoint(point);
}

function clearCoordinateCalibration(mapId) {
    if (mapId) {
        calibrationCache.delete(mapId);
    } else {
        calibrationCache.clear();
    }
}

window.CoordinateSystem = {
    convertPoint,
    gameToMap,
    mapToGame,
    imageToMap,
    mapToImage,
    nativeToMap,
    mapToNative,
    buildGameCalibration,
    clearCoordinateCalibration
};

window.gameToMap = gameToMap;
window.mapToGame = mapToGame;
window.imageToMap = imageToMap;
window.mapToImage = mapToImage;

})();
