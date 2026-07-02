const api = window.overlayApi;
const overlayShared = window.OverlayShared;
const VISION_MIN_RENDER_CONFIDENCE = 0.45;
const VISION_RENDER_MARGIN = 160;
const VISION_STATIONARY_RENDER_EPSILON = 2.0;
const VISION_HOVER_RENDER_EPSILON = 8.0;
const HOVER_HIDE_DELAY_MS = 180;
const CAPTURE_FILTER_ANY = '__all-capturable__';
const CAPTURE_COLLAPSED_LIMIT = 4;

const state = {
  maps: [],
  mapId: 'xinaya',
  dataset: null,
  calibration: null,
  calibrationSource: 'manual',
  visionCalibration: null,
  renderedVisionCalibration: null,
  visionTracking: false,
  visionDepsOk: false,
  visionWindows: [],
  categoryVisibility: {},
  collapsedGroups: (() => {
    try {
      return JSON.parse(localStorage.getItem('overlay-category-collapsed') || '{}') || {};
    } catch (_error) {
      return {};
    }
  })(),
  searchKeyword: '',
  captureFilter: '',
  pointState: { completed: new Set(), hidden: new Set() },
  calibrationMode: false,
  dragStart: null,
  draftRect: null,
  interactive: false,
  passthroughHotspot: false,
  pointSearchCache: new WeakMap(),
  activePoint: null,
  activeCardPosition: null,
  hoverCardHovered: false,
  hoverHideTimer: null,
  expandedCaptureLists: new Set()
};

const els = {
  body: document.body,
  svg: document.getElementById('point-layer'),
  panel: document.getElementById('control-panel'),
  mapSelect: document.getElementById('map-select'),
  interactionStatus: document.getElementById('interaction-status'),
  toggleInteraction: document.getElementById('toggle-interaction'),
  calibrationRect: document.getElementById('calibration-rect'),
  draftRect: document.getElementById('draft-rect'),
  calibrationStatus: document.getElementById('calibration-status'),
  calibrationToggle: document.getElementById('calibration-toggle'),
  calibrationReset: document.getElementById('calibration-reset'),
  visionStatus: document.getElementById('vision-status'),
  visionDepsBtn: document.getElementById('vision-deps-btn'),
  visionDepsStatus: document.getElementById('vision-deps-status'),
  visionWindowSelect: document.getElementById('vision-window-select'),
  visionWindowRefresh: document.getElementById('vision-window-refresh'),
  visionCacheBtn: document.getElementById('vision-cache-btn'),
  visionCacheStatus: document.getElementById('vision-cache-status'),
  visionToggle: document.getElementById('vision-toggle'),
  searchInput: document.getElementById('search-input'),
  searchClear: document.getElementById('search-clear'),
  captureFilterSelect: document.getElementById('capture-filter-select'),
  captureFilterClear: document.getElementById('capture-filter-clear'),
  captureFilterStatus: document.getElementById('capture-filter-status'),
  pointStateStatus: document.getElementById('point-state-status'),
  pointStateClearCompleted: document.getElementById('point-state-clear-completed'),
  pointStateRestoreHidden: document.getElementById('point-state-restore-hidden'),
  categoryList: document.getElementById('category-list'),
  renderStatus: document.getElementById('render-status'),
  debugStatus: document.getElementById('debug-status'),
  hoverCard: document.getElementById('hover-card'),
  quitOverlay: document.getElementById('quit-overlay')
};

function setDebugStatus(message) {
  const now = new Date();
  els.debugStatus.textContent = `${now.toLocaleTimeString('zh-CN', { hour12: false })} ${message}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function calibrationKey(mapId) {
  return `overlay-calibration:${mapId}`;
}

function categoryVisibilityKey(mapId) {
  return `overlay-category-visibility:${mapId}`;
}

function pointStateKey(mapId) {
  return `overlay-point-state:${mapId}`;
}

function loadCategoryVisibility(mapId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(categoryVisibilityKey(mapId)) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([key]) => key)
        .map(([key, value]) => [key, Boolean(value)])
    );
  } catch (_error) {
    return {};
  }
}

function saveCategoryVisibility() {
  if (!state.mapId) return;
  localStorage.setItem(categoryVisibilityKey(state.mapId), JSON.stringify(state.categoryVisibility));
}

function pruneCategoryVisibilityToDataset() {
  if (!state.dataset || !Array.isArray(state.dataset.categories)) return;
  const validKeys = new Set(state.dataset.categories.map(category => category.key).filter(Boolean));
  let changed = false;
  for (const key of Object.keys(state.categoryVisibility)) {
    if (!validKeys.has(key)) {
      delete state.categoryVisibility[key];
      changed = true;
    }
  }
  if (changed) saveCategoryVisibility();
}

function createEmptyPointState() {
  return { completed: new Set(), hidden: new Set() };
}

function normalizePointStateRecord(record) {
  const completed = Array.isArray(record && record.completed) ? record.completed : [];
  const hidden = Array.isArray(record && record.hidden) ? record.hidden : [];
  return {
    completed: new Set(completed.map(String).filter(Boolean)),
    hidden: new Set(hidden.map(String).filter(Boolean))
  };
}

function loadPointState(mapId) {
  try {
    return normalizePointStateRecord(JSON.parse(localStorage.getItem(pointStateKey(mapId)) || 'null'));
  } catch (_error) {
    return createEmptyPointState();
  }
}

function savePointState() {
  if (!state.mapId) return;
  const payload = {
    mapId: state.mapId,
    completed: Array.from(state.pointState.completed).sort(),
    hidden: Array.from(state.pointState.hidden).sort(),
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(pointStateKey(state.mapId), JSON.stringify(payload));
}

function getPointKey(point) {
  if (!point) return '';
  if (point.id !== undefined && point.id !== null) return String(point.id);

  const rawId = point.raw && point.raw.id;
  const source = point.source && (point.source.worldmap || point.source.file || point.source.map);
  if (rawId !== undefined && rawId !== null && source) return `${source}:${rawId}`;
  if (rawId !== undefined && rawId !== null) return String(rawId);

  const lat = point.map && Number.isFinite(Number(point.map.lat)) ? Number(point.map.lat).toFixed(3) : '';
  const lng = point.map && Number.isFinite(Number(point.map.lng)) ? Number(point.map.lng).toFixed(3) : '';
  return [point.category || point.type || 'unknown', point.displayName || '', lat, lng].join(':');
}

function escapeAttributeSelector(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function isPointCompleted(point) {
  return state.pointState.completed.has(getPointKey(point));
}

function isPointHidden(point) {
  return state.pointState.hidden.has(getPointKey(point));
}

function setPointCompleted(point, completed) {
  const key = getPointKey(point);
  if (!key) return;
  if (completed) {
    state.pointState.completed.add(key);
  } else {
    state.pointState.completed.delete(key);
  }
  savePointState();
  renderPointStatePanel();
  renderCaptureFilter();
}

function setPointHidden(point, hidden) {
  const key = getPointKey(point);
  if (!key) return;
  if (hidden) {
    state.pointState.hidden.add(key);
  } else {
    state.pointState.hidden.delete(key);
  }
  savePointState();
  renderPointStatePanel();
  renderCaptureFilter();
}

function prunePointStateToDataset() {
  if (!state.dataset || !Array.isArray(state.dataset.points)) return;
  const validKeys = new Set(state.dataset.points.map(getPointKey).filter(Boolean));
  let changed = false;

  for (const key of Array.from(state.pointState.completed)) {
    if (!validKeys.has(key)) {
      state.pointState.completed.delete(key);
      changed = true;
    }
  }
  for (const key of Array.from(state.pointState.hidden)) {
    if (!validKeys.has(key)) {
      state.pointState.hidden.delete(key);
      changed = true;
    }
  }

  if (changed) {
    savePointState();
    renderPointStatePanel();
    renderCaptureFilter();
  }
}

function normalizeRect(rect) {
  const x = Number(rect.x);
  const y = Number(rect.y);
  const width = Number(rect.width);
  const height = Number(rect.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height)
  };
}

function loadCalibration(mapId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(calibrationKey(mapId)) || 'null');
    if (!parsed || parsed.mapId !== mapId) return null;
    const rect = normalizeRect(parsed.rect || {});
    if (!rect || rect.width < 16 || rect.height < 16) return null;
    return { mapId, rect, updatedAt: parsed.updatedAt || null };
  } catch (_error) {
    return null;
  }
}

function saveCalibration(mapId, rect) {
  const normalized = normalizeRect(rect);
  if (!normalized) return null;
  const payload = {
    mapId,
    rect: normalized,
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(calibrationKey(mapId), JSON.stringify(payload));
  return payload;
}

function clearCalibration(mapId) {
  localStorage.removeItem(calibrationKey(mapId));
  state.calibration = null;
  state.renderedVisionCalibration = null;
  if (state.calibrationSource === 'manual') {
    state.calibrationSource = state.visionCalibration ? 'vision' : 'manual';
  }
}

function saveCollapsedGroups() {
  localStorage.setItem('overlay-category-collapsed', JSON.stringify(state.collapsedGroups));
}

function getCategoryMeta(category) {
  if (!state.dataset || !Array.isArray(state.dataset.categories)) return null;
  return state.dataset.categories.find(item => item.key === category) || null;
}

function getPointSearchText(point) {
  if (!state.pointSearchCache.has(point)) {
    state.pointSearchCache.set(point, overlayShared.getPointSearchText(point));
  }
  return state.pointSearchCache.get(point);
}

function doesPointMatchSearch(point) {
  const normalized = state.searchKeyword.trim().toLowerCase();
  if (!normalized) return true;
  const searchText = getPointSearchText(point);
  return normalized.split(/\s+/).every(part => searchText.includes(part));
}

function getCaptureEntries(point) {
  const entries = point && point.capture && point.capture.entries;
  return Array.isArray(entries) ? entries : [];
}

function getCaptureName(entry) {
  return String(entry?.kiboName || entry?.petId || '').trim();
}

function hasCaptureEntries(point) {
  return getCaptureEntries(point).length > 0;
}

function doesPointMatchCaptureFilter(point) {
  if (!state.captureFilter) return true;
  const entries = getCaptureEntries(point);
  if (state.captureFilter === CAPTURE_FILTER_ANY) return entries.length > 0;
  return entries.some(entry => getCaptureName(entry) === state.captureFilter);
}

function getCaptureFilterStats() {
  const stats = {
    totalPoints: 0,
    options: []
  };
  if (!state.dataset || !Array.isArray(state.dataset.points)) return stats;

  const byName = new Map();
  state.dataset.points
    .filter(point => point.inBounds && point.map)
    .forEach(point => {
      const entries = getCaptureEntries(point);
      if (!entries.length) return;
      stats.totalPoints += 1;

      const namesInPoint = new Set(entries.map(getCaptureName).filter(Boolean));
      namesInPoint.forEach(name => {
        const item = byName.get(name) || { name, points: 0 };
        item.points += 1;
        byName.set(name, item);
      });
    });

  stats.options = Array.from(byName.values())
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'zh-CN'));
  return stats;
}

function getCaptureFilterPointCount(filterValue) {
  if (!state.dataset || !Array.isArray(state.dataset.points)) return 0;
  return state.dataset.points
    .filter(point => point.inBounds && point.map)
    .filter(point => !isPointHidden(point))
    .filter(point => {
      if (!filterValue) return hasCaptureEntries(point);
      if (filterValue === CAPTURE_FILTER_ANY) return hasCaptureEntries(point);
      return getCaptureEntries(point).some(entry => getCaptureName(entry) === filterValue);
    }).length;
}

function renderCaptureFilter() {
  const stats = getCaptureFilterStats();
  const validValues = new Set(stats.options.map(item => item.name));
  if (state.captureFilter && state.captureFilter !== CAPTURE_FILTER_ANY && !validValues.has(state.captureFilter)) {
    state.captureFilter = '';
  }

  const options = [];
  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = '全部点位';
  options.push(allOption);

  const captureOption = document.createElement('option');
  captureOption.value = CAPTURE_FILTER_ANY;
  captureOption.textContent = `全部可捕捉 (${stats.totalPoints})`;
  options.push(captureOption);

  stats.options.forEach(item => {
    const option = document.createElement('option');
    option.value = item.name;
    option.textContent = `${item.name} (${item.points})`;
    options.push(option);
  });

  els.captureFilterSelect.replaceChildren(...options);
  els.captureFilterSelect.value = state.captureFilter;
  els.captureFilterClear.disabled = !state.captureFilter;

  if (!state.captureFilter) {
    els.captureFilterStatus.textContent = `${stats.totalPoints} 可捕捉`;
  } else if (state.captureFilter === CAPTURE_FILTER_ANY) {
    els.captureFilterStatus.textContent = `${getCaptureFilterPointCount(CAPTURE_FILTER_ANY)} 点`;
  } else {
    els.captureFilterStatus.textContent = `${getCaptureFilterPointCount(state.captureFilter)} 点`;
  }
}

function formatCaptureSource(entry) {
  const source = entry.randomGroupId
    ? `随机组 ${entry.randomGroupId}${entry.timeKeys?.length ? ` / 时段 ${entry.timeKeys.join('/')}` : ''}`
    : '固定敌人组';
  const groups = entry.groupIds?.length ? `敌人组 ${entry.groupIds.join('/')}` : '';
  const packs = entry.enemyPackIds?.length ? `敌人包 ${entry.enemyPackIds.join('/')}` : '';
  return [source, groups, packs].filter(Boolean).join('，');
}

function isCaptureListExpanded(point) {
  return state.expandedCaptureLists.has(getPointKey(point));
}

function getRenderedCaptureEntryCount(point) {
  const entries = getCaptureEntries(point);
  if (entries.length <= CAPTURE_COLLAPSED_LIMIT || isCaptureListExpanded(point)) return entries.length;
  return CAPTURE_COLLAPSED_LIMIT;
}

function createCaptureHtml(point) {
  const entries = getCaptureEntries(point);
  if (!entries.length) return '';
  const expanded = isCaptureListExpanded(point);
  const visibleEntries = expanded ? entries : entries.slice(0, CAPTURE_COLLAPSED_LIMIT);
  const hiddenCount = entries.length - visibleEntries.length;
  const items = visibleEntries.map(entry => {
    const probability = entry.probabilityPercent || '未知概率';
    const enemyNames = entry.enemyNames?.length ? ` / ${entry.enemyNames.join('、')}` : '';
    const weight = entry.weights?.length ? ` (${entry.weights.join('、')})` : '';
    return `
      <div class="capture-item">
        <div class="capture-main">
          <strong>${escapeHtml(getCaptureName(entry) || entry.petId || '')}</strong>
          <span>${escapeHtml(enemyNames)}</span>
        </div>
        <div class="capture-prob">${escapeHtml(probability)}${escapeHtml(weight)}</div>
        <div class="capture-source">${escapeHtml(formatCaptureSource(entry))}</div>
      </div>
    `;
  }).join('');
  const toggle = entries.length > CAPTURE_COLLAPSED_LIMIT
    ? `<button class="capture-toggle" type="button" data-point-action="toggle-capture-list">${expanded ? '收起列表' : `展开其余 ${hiddenCount} 条`}</button>`
    : '';
  return `
    <div class="capture-list${expanded ? ' is-expanded' : ''}">
      <div class="capture-title">可捕捉奇波 <span>${entries.length} 种</span></div>
      <div class="capture-items${expanded ? ' is-expanded' : ''}">
        ${items}
      </div>
      ${toggle}
    </div>
  `;
}

function getVisiblePoints() {
  if (!state.dataset) return [];
  return state.dataset.points
    .filter(point => point.inBounds && point.map)
    .filter(point => !isPointHidden(point))
    .filter(doesPointMatchCaptureFilter)
    .filter(point => overlayShared.isPointVisibleByCategory(point, state.dataset, state.categoryVisibility))
    .filter(doesPointMatchSearch);
}

function getAllInBoundsCount() {
  if (!state.dataset || !Array.isArray(state.dataset.points)) return 0;
  return state.dataset.points.filter(point => point.inBounds && point.map).length;
}

function getDisplayableInBoundsCount() {
  if (!state.dataset || !Array.isArray(state.dataset.points)) return 0;
  return state.dataset.points.filter(point => point.inBounds && point.map && !isPointHidden(point)).length;
}

function renderPointStatePanel() {
  const completed = state.pointState.completed.size;
  const hidden = state.pointState.hidden.size;
  els.pointStateStatus.textContent = `${completed} 完成 / ${hidden} 隐藏`;
  els.pointStateClearCompleted.disabled = completed === 0;
  els.pointStateRestoreHidden.disabled = hidden === 0;
}

function setInteraction(interactive) {
  state.interactive = Boolean(interactive);
  els.body.classList.toggle('interactive', state.interactive);
  els.body.classList.toggle('passthrough', !state.interactive);
  els.interactionStatus.textContent = state.interactive ? '可交互' : '鼠标穿透';
  if (state.interactive) setPassthroughHotspot(false);
  setDebugStatus(state.interactive ? '已进入可交互' : '已进入鼠标穿透');
}

function isInsideElementRect(event, element, margin = 0) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return event.clientX >= rect.left - margin
    && event.clientX <= rect.right + margin
    && event.clientY >= rect.top - margin
    && event.clientY <= rect.bottom + margin;
}

function setPassthroughHotspot(active) {
  const next = Boolean(active) && !state.interactive;
  if (state.passthroughHotspot === next) return;
  state.passthroughHotspot = next;
  els.body.classList.toggle('passthrough-hotspot', next);
  api.setPassthroughHotspot?.(next).catch(error => console.error(error));
}

function updatePassthroughHotspot(event) {
  if (state.interactive) {
    setPassthroughHotspot(false);
    return;
  }
  setPassthroughHotspot(isInsideElementRect(event, els.toggleInteraction, 12));
}

function setCalibrationMode(enabled) {
  state.calibrationMode = Boolean(enabled);
  els.body.classList.toggle('calibrating', state.calibrationMode);
  els.calibrationToggle.textContent = state.calibrationMode ? '完成' : '开始';
  setDebugStatus(state.calibrationMode ? '校准模式：拖拽地图矩形' : '校准模式结束');
  if (!state.calibrationMode) {
    state.dragStart = null;
    state.draftRect = null;
    renderDraftRect();
  }
}

function setVisionStatus(text, tone = 'idle') {
  els.visionStatus.textContent = text;
  els.visionStatus.dataset.tone = tone;
}

function setVisionDepsStatus(text, ok = false) {
  els.visionDepsStatus.textContent = text;
  els.visionDepsStatus.dataset.ready = ok ? 'true' : 'false';
}

function setVisionCacheStatus(text, ok = false) {
  els.visionCacheStatus.textContent = text;
  els.visionCacheStatus.dataset.ready = ok ? 'true' : 'false';
}

function formatVisionSource(source) {
  const text = String(source || '');
  const zoom = text.match(/-z(\d+)/i)?.[1];
  if (text.includes('frame-flow')) return '光流';
  if (text.includes('local')) return zoom ? `高清 z${zoom}` : '高清';
  if (text.includes('global')) return zoom ? `全局 z${zoom}` : '全局';
  return '追踪';
}

function hasVisionCalibration() {
  return Boolean(state.visionCalibration && state.visionCalibration.mapId === state.mapId);
}

function hasManualCalibration() {
  return Boolean(state.calibration && state.calibration.rect);
}

function hasActiveCalibration() {
  return (state.calibrationSource === 'vision' && hasVisionCalibration())
    || (state.calibrationSource === 'manual' && hasManualCalibration());
}

function getMatrixValue(matrix, row, col) {
  return Number(Array.isArray(matrix[row]) ? matrix[row][col] : matrix[row * 3 + col]);
}

function transformPoint(matrix, x, y) {
  const a = getMatrixValue(matrix, 0, 0);
  const b = getMatrixValue(matrix, 0, 1);
  const c = getMatrixValue(matrix, 0, 2);
  const d = getMatrixValue(matrix, 1, 0);
  const e = getMatrixValue(matrix, 1, 1);
  const f = getMatrixValue(matrix, 1, 2);
  const g = getMatrixValue(matrix, 2, 0);
  const h = getMatrixValue(matrix, 2, 1);
  const i = getMatrixValue(matrix, 2, 2);
  const w = g * x + h * y + i;
  if (!Number.isFinite(w) || Math.abs(w) < 1e-8) return null;
  return {
    x: (a * x + b * y + c) / w,
    y: (d * x + e * y + f) / w
  };
}

function projectMapPointToReference(point, reference) {
  if (!point || !point.map || !reference) return null;
  const bounds = reference.bounds || state.dataset?.transform?.bounds;
  if (!Array.isArray(bounds) || bounds.length < 2) return null;
  const minLat = Math.min(Number(bounds[0][0]), Number(bounds[1][0]));
  const maxLat = Math.max(Number(bounds[0][0]), Number(bounds[1][0]));
  const minLng = Math.min(Number(bounds[0][1]), Number(bounds[1][1]));
  const maxLng = Math.max(Number(bounds[0][1]), Number(bounds[1][1]));
  const lat = Number(point.map.lat);
  const lng = Number(point.map.lng);
  const width = Number(reference.width);
  const height = Number(reference.height);
  if (![minLat, maxLat, minLng, maxLng, lat, lng, width, height].every(Number.isFinite)) return null;
  const xRatio = (lng - minLng) / (maxLng - minLng);
  const yRatio = (maxLat - lat) / (maxLat - minLat);
  return {
    x: xRatio * width,
    y: yRatio * height,
    xRatio,
    yRatio
  };
}

function isPointInsideWindow(point, windowRect) {
  if (!point || !windowRect) return false;
  const margin = VISION_RENDER_MARGIN;
  return point.x >= windowRect.x - margin
    && point.x <= windowRect.x + windowRect.width + margin
    && point.y >= windowRect.y - margin
    && point.y <= windowRect.y + windowRect.height + margin
    && point.x >= -margin
    && point.x <= window.innerWidth + margin
    && point.y >= -margin
    && point.y <= window.innerHeight + margin;
}

function getCalibrationSamplePoints(calibration) {
  if (!calibration || !calibration.reference) return [];
  const polygon = Array.isArray(calibration.referencePolygon) ? calibration.referencePolygon : [];
  const points = polygon
    .map(point => ({ x: Number(point.x), y: Number(point.y) }))
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (points.length) {
    const center = points.reduce((acc, point) => ({
      x: acc.x + point.x / points.length,
      y: acc.y + point.y / points.length
    }), { x: 0, y: 0 });
    return [...points, center];
  }

  const width = Number(calibration.reference.width);
  const height = Number(calibration.reference.height);
  if (![width, height].every(Number.isFinite)) return [];
  return [
    { x: width * 0.25, y: height * 0.25 },
    { x: width * 0.75, y: height * 0.25 },
    { x: width * 0.75, y: height * 0.75 },
    { x: width * 0.25, y: height * 0.75 },
    { x: width * 0.5, y: height * 0.5 }
  ];
}

function getCalibrationMaxScreenDelta(previous, next) {
  if (!previous || !next || !previous.homographyRefToScreen || !next.homographyRefToScreen) {
    return Number.POSITIVE_INFINITY;
  }
  const samples = getCalibrationSamplePoints(next);
  if (!samples.length) return Number.POSITIVE_INFINITY;

  let maxDelta = 0;
  for (const sample of samples) {
    const before = transformPoint(previous.homographyRefToScreen, sample.x, sample.y);
    const after = transformPoint(next.homographyRefToScreen, sample.x, sample.y);
    if (!before || !after) return Number.POSITIVE_INFINITY;
    const delta = Math.hypot(after.x - before.x, after.y - before.y);
    if (!Number.isFinite(delta)) return Number.POSITIVE_INFINITY;
    maxDelta = Math.max(maxDelta, delta);
  }
  return maxDelta;
}

function shouldRenderVisionCalibration(calibration) {
  if (!state.renderedVisionCalibration) return true;
  if (state.calibrationSource !== 'vision') return true;
  const maxDelta = getCalibrationMaxScreenDelta(state.renderedVisionCalibration, calibration);
  const epsilon = els.hoverCard.hidden ? VISION_STATIONARY_RENDER_EPSILON : VISION_HOVER_RENDER_EPSILON;
  return maxDelta >= epsilon;
}

function projectPoint(point) {
  if (state.calibrationSource === 'vision' && hasVisionCalibration()) {
    const calibration = state.visionCalibration;
    const referencePoint = projectMapPointToReference(point, calibration.reference);
    const matrix = calibration.homographyRefToScreen;
    if (!referencePoint || !matrix) return null;
    const projected = transformPoint(matrix, referencePoint.x, referencePoint.y);
    if (!projected || !isPointInsideWindow(projected, calibration.windowRect)) return null;
    return projected;
  }

  if (state.calibrationSource === 'manual' && hasManualCalibration()) {
    const rect = state.calibration.rect;
    const projected = overlayShared.projectPointToRect(point, state.dataset, rect);
    if (!projected) return null;
    if (projected.x < rect.x - 1 || projected.x > rect.x + rect.width + 1) return null;
    if (projected.y < rect.y - 1 || projected.y > rect.y + rect.height + 1) return null;
    return projected;
  }

  return null;
}

function renderCalibrationRect() {
  if (state.calibrationSource === 'vision' && hasVisionCalibration()) {
    const confidence = Math.round((state.visionCalibration.confidence || 0) * 100);
    els.calibrationRect.hidden = true;
    els.calibrationStatus.textContent = `自动 ${confidence}%`;
    return;
  }

  if (!state.calibration) {
    els.calibrationRect.hidden = true;
    els.calibrationStatus.textContent = '未校准';
    return;
  }

  const { x, y, width, height } = state.calibration.rect;
  Object.assign(els.calibrationRect.style, {
    left: `${x}px`,
    top: `${y}px`,
    width: `${width}px`,
    height: `${height}px`
  });
  els.calibrationRect.hidden = false;
  els.calibrationStatus.textContent = `${width} × ${height}`;
}

function renderDraftRect() {
  if (!state.draftRect) {
    els.draftRect.hidden = true;
    return;
  }
  const { x, y, width, height } = state.draftRect;
  Object.assign(els.draftRect.style, {
    left: `${x}px`,
    top: `${y}px`,
    width: `${width}px`,
    height: `${height}px`
  });
  els.draftRect.hidden = false;
}

function renderCategories() {
  if (!state.dataset || !Array.isArray(state.dataset.categories)) {
    els.categoryList.innerHTML = '<div class="empty-state">暂无分类</div>';
    return;
  }

  const categories = state.dataset.categories
    .slice()
    .sort((a, b) => (b.inBounds || 0) - (a.inBounds || 0) || String(a.label).localeCompare(String(b.label), 'zh-CN'));

  const grouped = overlayShared.FILTER_GROUPS.map(group => ({
    ...group,
    categories: categories.filter(category => overlayShared.getCategoryGroup(category) === group.key)
  })).filter(group => group.categories.length > 0);

  els.categoryList.innerHTML = '';
  grouped.forEach(group => {
    const collapsed = state.collapsedGroups[group.key] === true;
    const groupEl = document.createElement('section');
    groupEl.className = 'category-group';
    groupEl.classList.toggle('is-collapsed', collapsed);

    const header = document.createElement('div');
    header.className = 'category-group-header';
    const groupInput = document.createElement('input');
    groupInput.type = 'checkbox';
    groupInput.title = `${group.label}显示开关`;

    const groupToggle = document.createElement('button');
    groupToggle.type = 'button';
    groupToggle.className = 'category-collapse-toggle';
    groupToggle.setAttribute('aria-expanded', String(!collapsed));
    groupToggle.title = collapsed ? '展开分类' : '折叠分类';

    const groupChevron = document.createElement('span');
    groupChevron.className = 'category-chevron';

    const groupName = document.createElement('span');
    groupName.className = 'category-group-name';
    groupName.textContent = group.label;
    groupToggle.append(groupChevron, groupName);

    const groupCount = document.createElement('span');
    groupCount.className = 'category-count';
    groupCount.textContent = String(group.categories.reduce((sum, category) => sum + (category.inBounds || 0), 0));
    header.append(groupInput, groupToggle, groupCount);

    const children = document.createElement('div');
    children.className = 'category-children';
    children.hidden = collapsed;

    const childInputs = group.categories.map(category => {
      const checked = Object.prototype.hasOwnProperty.call(state.categoryVisibility, category.key)
        ? state.categoryVisibility[category.key] !== false
        : overlayShared.isCategoryDefaultVisible(category.key, state.dataset, category);

      const row = document.createElement('label');
      row.className = 'category-item';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = category.key;
      input.checked = checked;

      const swatch = document.createElement('span');
      swatch.className = 'category-swatch';
      swatch.style.background = overlayShared.getMarkerConfig(category).color;

      const name = document.createElement('span');
      name.className = 'category-name';
      name.textContent = category.label || category.key;

      const count = document.createElement('span');
      count.className = 'category-count';
      count.textContent = String(category.inBounds || 0);

      row.append(input, swatch, name, count);
      children.append(row);

      input.addEventListener('change', () => {
        state.categoryVisibility[category.key] = input.checked;
        saveCategoryVisibility();
        renderCategories();
        renderPoints();
      });

      return input;
    });

    const checkedCount = childInputs.filter(input => input.checked).length;
    groupInput.checked = checkedCount === childInputs.length;
    groupInput.indeterminate = checkedCount > 0 && checkedCount < childInputs.length;
    groupInput.addEventListener('change', () => {
      group.categories.forEach(category => {
        state.categoryVisibility[category.key] = groupInput.checked;
      });
      saveCategoryVisibility();
      renderCategories();
      renderPoints();
    });

    const toggleGroupCollapse = () => {
      state.collapsedGroups[group.key] = !collapsed;
      saveCollapsedGroups();
      setDebugStatus(state.collapsedGroups[group.key] ? `已折叠 ${group.label}` : `已展开 ${group.label}`);
      renderCategories();
    };
    header.addEventListener('click', event => {
      if (event.target.closest('input')) return;
      toggleGroupCollapse();
    });

    groupEl.append(header, children);
    els.categoryList.append(groupEl);
  });
}

function buildPointTitle(point) {
  const raw = point.raw || {};
  const source = point.source || {};
  return [
    point.displayName || point.id,
    point.categoryLabel || point.category,
    raw.id ? `ID ${raw.id}` : '',
    source.worldmap || ''
  ].filter(Boolean).join('\n');
}

function showHoverCard(point, position) {
  const raw = point.raw || {};
  const refs = point.refs || {};
  const source = point.source || {};
  const config = overlayShared.getMarkerConfig(point);
  const resourcePath = refs.worldResource?.resPath || refs.worldItem?.resPath || refs.playable?.objectResourcePaths?.[0] || '';
  const completed = isPointCompleted(point);

  cancelHoverHide();
  state.activePoint = point;
  state.activeCardPosition = position;

  els.hoverCard.innerHTML = `
    <div class="hover-title"><span style="background:${config.color}"></span>${escapeHtml(point.displayName || point.id)}</div>
    <div class="hover-row"><strong>分类</strong><span>${escapeHtml(point.categoryLabel || point.category)}</span></div>
    ${createCaptureHtml(point)}
    <div class="hover-row"><strong>原始 ID</strong><span>${escapeHtml(raw.id || '')}</span></div>
    <div class="hover-row"><strong>坐标</strong><span>${Number(point.map.lat).toFixed(2)}, ${Number(point.map.lng).toFixed(2)}</span></div>
    ${resourcePath ? `<div class="hover-row"><strong>资源</strong><span>${escapeHtml(resourcePath)}</span></div>` : ''}
    ${source.worldmap ? `<div class="hover-row"><strong>来源</strong><span>${escapeHtml(source.worldmap)}</span></div>` : ''}
    <div class="hover-actions">
      <button class="text-button hover-action" type="button" data-point-action="toggle-completed">${completed ? '标记未完成' : '标记已完成'}</button>
      <button class="text-button danger hover-action" type="button" data-point-action="hide">隐藏</button>
    </div>
  `;

  const padding = 14;
  const width = 320;
  const captureEntries = getCaptureEntries(point);
  const captureEntryCount = getRenderedCaptureEntryCount(point);
  const expandedCapture = captureEntries.length > CAPTURE_COLLAPSED_LIMIT && isCaptureListExpanded(point);
  const captureHeight = expandedCapture
    ? 230
    : (captureEntryCount ? 38 + captureEntryCount * 54 + (captureEntries.length > CAPTURE_COLLAPSED_LIMIT ? 34 : 0) : 0);
  const height = Math.min(window.innerHeight - padding * 2, 176 + captureHeight);
  const left = Math.min(window.innerWidth - width - padding, position.x + 18);
  const top = Math.min(window.innerHeight - height - padding, position.y + 18);
  els.hoverCard.style.left = `${Math.max(padding, left)}px`;
  els.hoverCard.style.top = `${Math.max(padding, top)}px`;
  els.hoverCard.hidden = false;
}

function hideHoverCard() {
  cancelHoverHide();
  state.activePoint = null;
  state.activeCardPosition = null;
  state.hoverCardHovered = false;
  els.hoverCard.hidden = true;
}

function cancelHoverHide() {
  if (!state.hoverHideTimer) return;
  window.clearTimeout(state.hoverHideTimer);
  state.hoverHideTimer = null;
}

function scheduleHideHoverCard() {
  cancelHoverHide();
  state.hoverHideTimer = window.setTimeout(() => {
    if (!state.hoverCardHovered) hideHoverCard();
  }, HOVER_HIDE_DELAY_MS);
}

function refreshRenderedPointState(point) {
  const key = getPointKey(point);
  const selector = `[data-point-key="${escapeAttributeSelector(key)}"]`;
  const element = els.svg.querySelector(selector);
  if (element) {
    element.classList.toggle('is-completed', isPointCompleted(point));
  }
}

function handleHoverCardAction(action) {
  const point = state.activePoint;
  if (!point) return;
  const name = point.displayName || point.id || '点位';

  if (action === 'toggle-completed') {
    const completed = !isPointCompleted(point);
    setPointCompleted(point, completed);
    refreshRenderedPointState(point);
    setDebugStatus(completed ? `已标记完成：${name}` : `已标记未完成：${name}`);
    showHoverCard(point, state.activeCardPosition || { x: window.innerWidth / 2, y: window.innerHeight / 2 });
    return;
  }

  if (action === 'toggle-capture-list') {
    const key = getPointKey(point);
    if (state.expandedCaptureLists.has(key)) {
      state.expandedCaptureLists.delete(key);
    } else {
      state.expandedCaptureLists.add(key);
    }
    showHoverCard(point, state.activeCardPosition || { x: window.innerWidth / 2, y: window.innerHeight / 2 });
    return;
  }

  if (action === 'hide') {
    setPointHidden(point, true);
    setDebugStatus(`已隐藏：${name}`);
    renderPoints();
  }
}

function renderPoints() {
  els.svg.replaceChildren();
  hideHoverCard();
  renderCalibrationRect();

  if (!state.dataset) {
    els.renderStatus.textContent = '未加载';
    return;
  }
  if (!hasActiveCalibration()) {
    els.renderStatus.textContent = `${getAllInBoundsCount()} 点，待校准`;
    return;
  }

  const points = getVisiblePoints();
  const fragment = document.createDocumentFragment();
  let renderedCount = 0;

  points.forEach(point => {
    const projected = projectPoint(point);
    if (!projected) return;
    renderedCount += 1;

    const config = overlayShared.getMarkerConfig(point);
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.classList.add('map-point');
    group.classList.toggle('is-completed', isPointCompleted(point));
    group.dataset.category = point.category || 'unknown';
    group.dataset.pointKey = getPointKey(point);
    group.setAttribute('transform', `translate(${projected.x.toFixed(2)} ${projected.y.toFixed(2)})`);
    group.setAttribute('aria-label', buildPointTitle(point));

    const halo = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    halo.classList.add('point-halo');
    halo.setAttribute('r', '8');
    halo.setAttribute('fill', config.color);

    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.classList.add('point-dot');
    dot.setAttribute('r', '4');
    dot.setAttribute('fill', config.color);

    group.append(halo, dot);
    group.addEventListener('mouseenter', event => showHoverCard(point, { x: event.clientX, y: event.clientY }));
    group.addEventListener('mousemove', event => {
      if (!state.hoverCardHovered) showHoverCard(point, { x: event.clientX, y: event.clientY });
    });
    group.addEventListener('mouseleave', scheduleHideHoverCard);
    fragment.append(group);
  });

  els.svg.append(fragment);

  const allInBounds = getDisplayableInBoundsCount();
  const categoryVisible = state.dataset.points
    .filter(point => point.inBounds && point.map)
    .filter(point => !isPointHidden(point))
    .filter(doesPointMatchCaptureFilter)
    .filter(point => overlayShared.isPointVisibleByCategory(point, state.dataset, state.categoryVisibility)).length;
  const hasFilter = state.searchKeyword.trim() || state.captureFilter;
  els.renderStatus.textContent = hasFilter
    ? `${renderedCount} / ${categoryVisible} 命中`
    : `${renderedCount} / ${allInBounds} 显示`;
  if (state.calibrationSource === 'vision' && hasVisionCalibration()) {
    state.renderedVisionCalibration = state.visionCalibration;
  }
}

async function selectMap(mapId, options = {}) {
  if (options.stopVision !== false && state.visionTracking) {
    await stopVisionTracking(true);
  }
  state.mapId = mapId;
  if (els.mapSelect.value !== mapId) {
    els.mapSelect.value = mapId;
  }
  state.dataset = null;
  state.visionCalibration = null;
  state.renderedVisionCalibration = null;
  state.calibrationSource = 'manual';
  state.categoryVisibility = loadCategoryVisibility(mapId);
  state.captureFilter = '';
  state.pointSearchCache = new WeakMap();
  state.pointState = loadPointState(mapId);
  state.expandedCaptureLists.clear();
  els.renderStatus.textContent = '加载中';
  els.svg.replaceChildren();
  hideHoverCard();
  renderCaptureFilter();
  renderPointStatePanel();

  state.calibration = loadCalibration(mapId);
  renderCalibrationRect();

  try {
    state.dataset = await api.loadDataset(mapId);
    pruneCategoryVisibilityToDataset();
    prunePointStateToDataset();
    setDebugStatus(`已加载地图 ${mapId}`);
    renderCaptureFilter();
    renderCategories();
    renderPointStatePanel();
    renderPoints();
  } catch (error) {
    console.error(error);
    setDebugStatus(`地图 ${mapId} 加载失败`);
    els.categoryList.innerHTML = '<div class="empty-state">加载失败</div>';
    renderCaptureFilter();
    els.renderStatus.textContent = '加载失败';
  }
}

function setCalibrationRect(rect) {
  state.calibration = saveCalibration(state.mapId, rect);
  state.calibrationSource = 'manual';
  state.renderedVisionCalibration = null;
  setCalibrationMode(false);
  setDebugStatus(`已保存校准 ${state.calibration.rect.width}x${state.calibration.rect.height}`);
  renderPoints();
}

function setCategoryVisible(category, visible) {
  state.categoryVisibility[category] = Boolean(visible);
  saveCategoryVisibility();
  renderCategories();
  renderPoints();
}

function setSearchKeyword(keyword) {
  state.searchKeyword = keyword;
  els.searchInput.value = keyword;
  renderPoints();
}

function setCaptureFilter(value) {
  state.captureFilter = String(value || '');
  if (els.captureFilterSelect.value !== state.captureFilter) {
    els.captureFilterSelect.value = state.captureFilter;
  }
  renderCaptureFilter();
  renderPoints();
}

function updateWindowSelect(windows) {
  state.visionWindows = windows || [];
  const previous = els.visionWindowSelect.value;
  const options = [(() => {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '选择游戏窗口';
    return option;
  })()];
  state.visionWindows.forEach(windowInfo => {
    const option = document.createElement('option');
    option.value = windowInfo.id;
    option.textContent = `${windowInfo.title} (${windowInfo.width}x${windowInfo.height})`;
    options.push(option);
  });
  els.visionWindowSelect.replaceChildren(...options);
  if (previous && state.visionWindows.some(item => item.id === previous)) {
    els.visionWindowSelect.value = previous;
  } else {
    const recommended = state.visionWindows.find(item => /promilia|azur|蓝色星原/i.test(item.title));
    if (recommended) els.visionWindowSelect.value = recommended.id;
  }
}

async function checkVisionDeps() {
  setVisionDepsStatus('检查中');
  const result = await api.vision.checkDeps();
  state.visionDepsOk = Boolean(result.ok);
  if (result.ok) {
    setVisionDepsStatus('已就绪', true);
    setVisionStatus('可用', 'ready');
    await refreshVisionWindows();
  } else {
    const missing = result.missing && result.missing.length ? result.missing.join(', ') : '未知';
    setVisionDepsStatus(`缺少 ${missing}`);
    setVisionStatus('缺依赖', 'warn');
  }
  return result;
}

async function installVisionDeps() {
  setVisionDepsStatus('安装中');
  setVisionStatus('安装中', 'busy');
  const result = await api.vision.installDeps();
  if (result.ok) {
    state.visionDepsOk = true;
    setVisionDepsStatus('已就绪', true);
    setVisionStatus('可用', 'ready');
    await refreshVisionWindows();
  } else {
    setVisionDepsStatus('安装失败');
    setVisionStatus('安装失败', 'error');
  }
  return result;
}

async function refreshVisionWindows() {
  setVisionStatus('读窗口', 'busy');
  const result = await api.vision.listWindows();
  if (result.ok) {
    updateWindowSelect(result.windows);
    setVisionStatus(result.windows.length ? '可选择' : '无窗口', result.windows.length ? 'ready' : 'warn');
  } else {
    updateWindowSelect([]);
    setVisionStatus('窗口失败', 'error');
    setDebugStatus(result.error || '窗口列表读取失败');
  }
  return result;
}

async function buildVisionCache() {
  setVisionCacheStatus('构建中');
  setVisionStatus('缓存中', 'busy');
  const result = await api.vision.buildCache(state.mapId);
  if (result.ok) {
    setVisionCacheStatus('已就绪', true);
    setVisionStatus('缓存就绪', 'ready');
  } else {
    setVisionCacheStatus('缓存失败');
    setVisionStatus('缓存失败', 'error');
  }
  return result;
}

async function startVisionTracking() {
  const windowId = els.visionWindowSelect.value;
  if (!windowId) {
    setVisionStatus('选窗口', 'warn');
    setDebugStatus('请选择游戏窗口');
    return;
  }
  state.visionCalibration = null;
  state.renderedVisionCalibration = null;
  state.calibrationSource = 'vision';
  state.visionTracking = true;
  els.visionToggle.textContent = '停止自动';
  setVisionStatus('启动中', 'busy');
  renderPoints();
  const result = await api.vision.start({
    mapId: state.mapId,
    windowId,
    mode: 'low-frequency'
  });
  if (!result.started) {
    state.visionTracking = false;
    state.calibrationSource = hasManualCalibration() ? 'manual' : 'vision';
    els.visionToggle.textContent = '开始自动';
    setVisionStatus('启动失败', 'error');
    setDebugStatus(result.error || '自动校准启动失败');
  }
}

async function stopVisionTracking(resetCalibration = false) {
  await api.vision.stop();
  state.visionTracking = false;
  els.visionToggle.textContent = '开始自动';
  if (resetCalibration) {
    state.visionCalibration = null;
    state.renderedVisionCalibration = null;
    state.calibrationSource = hasManualCalibration() ? 'manual' : 'vision';
  }
  setVisionStatus('已停止', 'idle');
  renderPoints();
}

async function toggleVisionTracking() {
  if (state.visionTracking) {
    await stopVisionTracking(false);
  } else {
    await startVisionTracking();
  }
}

function handleVisionEvent(payload) {
  if (!payload || typeof payload !== 'object') return;

  if (payload.type === 'install-log') {
    setDebugStatus(payload.line.slice(0, 80));
    return;
  }
  if (payload.type === 'install') {
    setVisionStatus(payload.state === 'ready' ? '可用' : payload.state === 'error' ? '安装失败' : '安装中', payload.state === 'error' ? 'error' : 'busy');
    return;
  }
  if (payload.type === 'cache-progress') {
    if (payload.mapId && payload.mapId !== state.mapId) return;
    if (payload.state === 'downloading' && payload.total) {
      setVisionCacheStatus(`${payload.done}/${payload.total}`);
    } else if (payload.state === 'refining') {
      setVisionCacheStatus(payload.message || '高清瓦片');
      if (state.visionTracking) setVisionStatus('高清缓存', 'busy');
    } else if (payload.state === 'ready') {
      setVisionCacheStatus('已就绪', true);
    } else if (payload.state === 'error') {
      setVisionCacheStatus('缓存失败');
    } else if (payload.message) {
      setVisionCacheStatus(payload.message);
    }
    return;
  }
  if (payload.type === 'cache') {
    if (payload.mapId && payload.mapId !== state.mapId) return;
    setVisionCacheStatus(payload.ok ? '已就绪' : '缓存失败', Boolean(payload.ok));
    setVisionStatus(payload.ok ? '缓存就绪' : '缓存失败', payload.ok ? 'ready' : 'error');
    return;
  }
  if (payload.type === 'status') {
    if (payload.mapId && payload.mapId !== state.mapId) return;
    const labels = {
      starting: '启动中',
      ready: '已就绪',
      tracking: '追踪中',
      low_confidence: '低置信',
      lost: '丢失',
      error: '错误',
      stopped: '已停止'
    };
    const tones = {
      tracking: 'ready',
      ready: 'ready',
      low_confidence: 'warn',
      lost: 'warn',
      error: 'error'
    };
    setVisionStatus(labels[payload.status] || payload.status || '状态', tones[payload.status] || 'idle');
    if (payload.message) setDebugStatus(payload.message);
    if (payload.status === 'stopped' || payload.status === 'error') {
      state.visionTracking = false;
      els.visionToggle.textContent = '开始自动';
    }
    return;
  }
  if (payload.type === 'calibration' && payload.calibration) {
    const calibration = payload.calibration;
    if (calibration.mapId !== state.mapId) return;
    const confidence = Number(calibration.confidence || 0);
    if (payload.status !== 'tracking' || confidence < VISION_MIN_RENDER_CONFIDENCE) {
      setVisionStatus(`低置信 ${Math.round(confidence * 100)}%`, 'warn');
      if (payload.message) setDebugStatus(payload.message);
      return;
    }
    const needsRender = shouldRenderVisionCalibration(calibration);
    state.visionCalibration = calibration;
    state.calibrationSource = 'vision';
    const source = formatVisionSource(calibration.source);
    const inliers = Number(calibration.inliers || 0);
    const suffix = inliers ? ` · ${inliers}` : '';
    setVisionStatus(`${source} ${Math.round(confidence * 100)}%${suffix}`, 'ready');
    if (needsRender) {
      renderPoints();
      state.renderedVisionCalibration = calibration;
    }
  }
}

function isPanelTarget(target) {
  return Boolean(target.closest('#control-panel'));
}

function getPointerRect(start, event) {
  const x1 = start.x;
  const y1 = start.y;
  const x2 = event.clientX;
  const y2 = event.clientY;
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1)
  };
}

function bindEvents() {
  document.addEventListener('pointerdown', event => {
    const target = event.target.closest('button, select, input, label');
    if (target) {
      setDebugStatus(`收到点击：${target.id || target.tagName.toLowerCase()}`);
    }
  }, true);
  document.addEventListener('pointermove', updatePassthroughHotspot, true);
  document.addEventListener('pointerleave', () => setPassthroughHotspot(false), true);

  els.mapSelect.addEventListener('change', async event => {
    setDebugStatus(`切换地图：${event.target.value}`);
    await selectMap(event.target.value);
  });
  els.toggleInteraction.addEventListener('click', () => {
    setDebugStatus('切换交互模式');
    api.toggleInteraction();
  });
  els.quitOverlay.addEventListener('click', () => api.quit());

  els.calibrationToggle.addEventListener('click', () => {
    if (state.visionTracking) stopVisionTracking(true);
    setCalibrationMode(!state.calibrationMode);
  });
  els.calibrationReset.addEventListener('click', () => {
    clearCalibration(state.mapId);
    setDebugStatus('已清除校准');
    renderPoints();
  });

  els.searchInput.addEventListener('input', event => setSearchKeyword(event.target.value));
  els.searchInput.addEventListener('keydown', event => {
    if (event.key === 'Escape') setSearchKeyword('');
  });
  els.searchClear.addEventListener('click', () => {
    setDebugStatus('清空搜索');
    setSearchKeyword('');
  });
  els.captureFilterSelect.addEventListener('change', event => {
    const value = event.target.value;
    setDebugStatus(value ? `奇波筛选：${value === CAPTURE_FILTER_ANY ? '全部可捕捉' : value}` : '清除奇波筛选');
    setCaptureFilter(value);
  });
  els.captureFilterClear.addEventListener('click', () => {
    setDebugStatus('清除奇波筛选');
    setCaptureFilter('');
  });
  els.pointStateClearCompleted.addEventListener('click', () => {
    state.pointState.completed.clear();
    savePointState();
    renderPointStatePanel();
    setDebugStatus('已清空完成标记');
    renderPoints();
  });
  els.pointStateRestoreHidden.addEventListener('click', () => {
    state.pointState.hidden.clear();
    savePointState();
    renderPointStatePanel();
    renderCaptureFilter();
    setDebugStatus('已恢复隐藏点位');
    renderPoints();
  });
  els.hoverCard.addEventListener('mouseenter', () => {
    state.hoverCardHovered = true;
    cancelHoverHide();
  });
  els.hoverCard.addEventListener('mouseleave', () => {
    state.hoverCardHovered = false;
    scheduleHideHoverCard();
  });
  els.hoverCard.addEventListener('click', event => {
    const button = event.target.closest('[data-point-action]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    handleHoverCardAction(button.dataset.pointAction);
  });

  els.visionDepsBtn.addEventListener('click', async () => {
    if (state.visionDepsOk) {
      await checkVisionDeps();
    } else {
      const result = await checkVisionDeps();
      if (!result.ok) await installVisionDeps();
    }
  });
  els.visionWindowRefresh.addEventListener('click', refreshVisionWindows);
  els.visionCacheBtn.addEventListener('click', buildVisionCache);
  els.visionToggle.addEventListener('click', toggleVisionTracking);

  window.addEventListener('resize', renderPoints);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state.calibrationMode) {
      setCalibrationMode(false);
    }
  });

  document.addEventListener('pointerdown', event => {
    if (!state.calibrationMode || isPanelTarget(event.target)) return;
    state.dragStart = { x: event.clientX, y: event.clientY };
    state.draftRect = { x: event.clientX, y: event.clientY, width: 0, height: 0 };
    renderDraftRect();
  });

  document.addEventListener('pointermove', event => {
    if (!state.dragStart) return;
    state.draftRect = getPointerRect(state.dragStart, event);
    renderDraftRect();
  });

  document.addEventListener('pointerup', event => {
    if (!state.dragStart) return;
    const rect = getPointerRect(state.dragStart, event);
    state.dragStart = null;
    state.draftRect = null;
    renderDraftRect();

    if (rect.width >= 80 && rect.height >= 80) {
      setCalibrationRect(rect);
    }
  });
}

async function init() {
  bindEvents();
  api.onInteractionChanged(payload => setInteraction(payload.interactive));
  api.vision.onEvent(handleVisionEvent);
  const interaction = await api.getInteraction();
  setInteraction(interaction.interactive);

  state.maps = await api.listMaps();
  els.mapSelect.replaceChildren(...state.maps.map(map => {
    const option = document.createElement('option');
    option.value = map.id;
    option.textContent = map.label;
    return option;
  }));

  els.mapSelect.value = state.mapId;
  await selectMap(state.mapId, { stopVision: false });
  checkVisionDeps().catch(error => {
    console.error(error);
    setVisionStatus('检查失败', 'error');
  });
}

window.selectMap = selectMap;
window.setCalibrationRect = setCalibrationRect;
window.setCategoryVisible = setCategoryVisible;
window.setSearchKeyword = setSearchKeyword;
window.setCaptureFilter = setCaptureFilter;

init().catch(error => {
  console.error(error);
  els.renderStatus.textContent = '初始化失败';
});
