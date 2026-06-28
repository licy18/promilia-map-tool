const api = window.overlayApi;
const overlayShared = window.OverlayShared;
const VISION_MIN_RENDER_CONFIDENCE = 0.45;

const state = {
  maps: [],
  mapId: 'xinaya',
  dataset: null,
  calibration: null,
  calibrationSource: 'manual',
  visionCalibration: null,
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
  calibrationMode: false,
  dragStart: null,
  draftRect: null,
  interactive: false,
  pointSearchCache: new WeakMap()
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

function getVisiblePoints() {
  if (!state.dataset) return [];
  return state.dataset.points
    .filter(point => point.inBounds && point.map)
    .filter(point => overlayShared.isPointVisibleByCategory(point, state.dataset, state.categoryVisibility))
    .filter(doesPointMatchSearch);
}

function getAllInBoundsCount() {
  if (!state.dataset || !Array.isArray(state.dataset.points)) return 0;
  return state.dataset.points.filter(point => point.inBounds && point.map).length;
}

function setInteraction(interactive) {
  state.interactive = Boolean(interactive);
  els.body.classList.toggle('interactive', state.interactive);
  els.body.classList.toggle('passthrough', !state.interactive);
  els.interactionStatus.textContent = state.interactive ? '可交互' : '鼠标穿透';
  setDebugStatus(state.interactive ? '已进入可交互' : '已进入鼠标穿透');
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
  const margin = 12;
  return point.x >= windowRect.x - margin
    && point.x <= windowRect.x + windowRect.width + margin
    && point.y >= windowRect.y - margin
    && point.y <= windowRect.y + windowRect.height + margin;
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

  els.hoverCard.innerHTML = `
    <div class="hover-title"><span style="background:${config.color}"></span>${escapeHtml(point.displayName || point.id)}</div>
    <div class="hover-row"><strong>分类</strong><span>${escapeHtml(point.categoryLabel || point.category)}</span></div>
    <div class="hover-row"><strong>原始 ID</strong><span>${escapeHtml(raw.id || '')}</span></div>
    <div class="hover-row"><strong>坐标</strong><span>${Number(point.map.lat).toFixed(2)}, ${Number(point.map.lng).toFixed(2)}</span></div>
    ${resourcePath ? `<div class="hover-row"><strong>资源</strong><span>${escapeHtml(resourcePath)}</span></div>` : ''}
    ${source.worldmap ? `<div class="hover-row"><strong>来源</strong><span>${escapeHtml(source.worldmap)}</span></div>` : ''}
  `;

  const padding = 14;
  const width = 320;
  const left = Math.min(window.innerWidth - width - padding, position.x + 18);
  const top = Math.min(window.innerHeight - 180, position.y + 18);
  els.hoverCard.style.left = `${Math.max(padding, left)}px`;
  els.hoverCard.style.top = `${Math.max(padding, top)}px`;
  els.hoverCard.hidden = false;
}

function hideHoverCard() {
  els.hoverCard.hidden = true;
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
    group.dataset.category = point.category || 'unknown';
    group.setAttribute('transform', `translate(${projected.x.toFixed(2)} ${projected.y.toFixed(2)})`);

    const halo = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    halo.classList.add('point-halo');
    halo.setAttribute('r', '8');
    halo.setAttribute('fill', config.color);

    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.classList.add('point-dot');
    dot.setAttribute('r', '4');
    dot.setAttribute('fill', config.color);

    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = buildPointTitle(point);

    group.append(halo, dot, title);
    group.addEventListener('mouseenter', event => showHoverCard(point, { x: event.clientX, y: event.clientY }));
    group.addEventListener('mousemove', event => showHoverCard(point, { x: event.clientX, y: event.clientY }));
    group.addEventListener('mouseleave', hideHoverCard);
    fragment.append(group);
  });

  els.svg.append(fragment);

  const allInBounds = getAllInBoundsCount();
  const categoryVisible = state.dataset.points
    .filter(point => point.inBounds && point.map)
    .filter(point => overlayShared.isPointVisibleByCategory(point, state.dataset, state.categoryVisibility)).length;
  els.renderStatus.textContent = state.searchKeyword.trim()
    ? `${renderedCount} / ${categoryVisible} 命中`
    : `${renderedCount} / ${allInBounds} 显示`;
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
  state.calibrationSource = 'manual';
  state.categoryVisibility = {};
  state.pointSearchCache = new WeakMap();
  els.renderStatus.textContent = '加载中';
  els.svg.replaceChildren();
  hideHoverCard();

  state.calibration = loadCalibration(mapId);
  renderCalibrationRect();

  try {
    state.dataset = await api.loadDataset(mapId);
    setDebugStatus(`已加载地图 ${mapId}`);
    renderCategories();
    renderPoints();
  } catch (error) {
    console.error(error);
    setDebugStatus(`地图 ${mapId} 加载失败`);
    els.categoryList.innerHTML = '<div class="empty-state">加载失败</div>';
    els.renderStatus.textContent = '加载失败';
  }
}

function setCalibrationRect(rect) {
  state.calibration = saveCalibration(state.mapId, rect);
  state.calibrationSource = 'manual';
  setCalibrationMode(false);
  setDebugStatus(`已保存校准 ${state.calibration.rect.width}x${state.calibration.rect.height}`);
  renderPoints();
}

function setCategoryVisible(category, visible) {
  state.categoryVisibility[category] = Boolean(visible);
  renderCategories();
  renderPoints();
}

function setSearchKeyword(keyword) {
  state.searchKeyword = keyword;
  els.searchInput.value = keyword;
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
    state.visionCalibration = calibration;
    state.calibrationSource = 'vision';
    setVisionStatus(`追踪 ${Math.round(confidence * 100)}%`, 'ready');
    renderPoints();
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

init().catch(error => {
  console.error(error);
  els.renderStatus.textContent = '初始化失败';
});
