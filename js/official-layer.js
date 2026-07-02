/**
 * 官方点位只读图层
 */

let officialLayerGroup = null;
let officialPointDataCache = {};
let officialLayerEnabled = localStorage.getItem('promilia-official-layer-enabled') !== 'false';
let officialClusterEnabled = localStorage.getItem('promilia-official-cluster-enabled') !== 'false';
let officialCategoryFilters = JSON.parse(localStorage.getItem('promilia-official-category-filters') || '{}');
let currentOfficialDataset = null;
let officialSearchKeyword = '';

const OFFICIAL_FILTER_GROUPS = [
    { key: 'explore', label: '探索', icon: 'fa-compass' },
    { key: 'puzzle', label: '解谜', icon: 'fa-puzzle-piece' },
    { key: 'creature', label: '生物', icon: 'fa-paw' },
    { key: 'other', label: '其他', icon: 'fa-layer-group' }
];

function getOfficialMarkerConfig(target) {
    const fallback = { icon: 'fa-circle', color: '#95a5a6', label: '未知', category: 'other' };
    const officialConfigs = {
        npc: { icon: 'fa-user', color: '#3498db', label: 'NPC', category: 'creature' },
        creature: { icon: 'fa-paw', color: '#ff6b9d', label: '生物', category: 'creature' },
        shop: { icon: 'fa-store', color: '#16a085', label: '商店', category: 'other' },
        photo_spot: { icon: 'fa-camera', color: '#00bcd4', label: '拍照点', category: 'other' },
        teleport: { icon: 'fa-door-open', color: '#9b59b6', label: '传送点', category: 'explore' },
        star_node: { icon: 'fa-door-open', color: '#00bfff', label: '星脉节点', category: 'explore' },
        puzzle_mechanism: { icon: 'fa-trophy', color: '#ffd700', label: '机关解谜', category: 'puzzle' },
        spirit_game: { icon: 'fa-trophy', color: '#ffd700', label: '息灵游戏', category: 'puzzle' },
        guiding_grass: { icon: 'fa-trophy', color: '#ffd700', label: '指路草', category: 'puzzle' },
        lost_spirit: { icon: 'fa-trophy', color: '#ffd700', label: '迷失息灵', category: 'puzzle' },
        fire_altar: { icon: 'fa-trophy', color: '#ffd700', label: '祭火之坛', category: 'puzzle' },
        radiant_altar: { icon: 'fa-trophy', color: '#ffd700', label: '辉印祭坛', category: 'puzzle' },
        spirit_pedal: { icon: 'fa-trophy', color: '#ffd700', label: '巡灵踏板', category: 'puzzle' },
        monument_array: { icon: 'fa-trophy', color: '#ffd700', label: '遗碑方阵', category: 'puzzle' },
        exploration_challenge: { icon: 'fa-trophy', color: '#ffd700', label: '探索挑战', category: 'explore' },
        transform_challenge: { icon: 'fa-trophy', color: '#ffd700', label: '变身挑战', category: 'explore' },
        bowling_challenge: { icon: 'fa-trophy', color: '#ffd700', label: '保龄球小游戏', category: 'explore' },
        kibo_rescue: { icon: 'fa-trophy', color: '#ffd700', label: '解救苗鸡', category: 'explore' },
        dulu_herding: { icon: 'fa-trophy', color: '#ffd700', label: '嘟噜回巢', category: 'explore' },
        repair_building: { icon: 'fa-trophy', color: '#ffd700', label: '建筑修复点', category: 'explore' },
        repair_elevator: { icon: 'fa-trophy', color: '#ffd700', label: '修复电梯', category: 'explore' },
        repair_bridge: { icon: 'fa-trophy', color: '#ffd700', label: '修复桥梁', category: 'explore' },
        singing_spirit: { icon: 'fa-trophy', color: '#ffd700', label: '歌唱息灵', category: 'explore' },
        challenge_mount: { icon: 'fa-trophy', color: '#ffd700', label: '坐骑挑战', category: 'explore' },
        repair_point: { icon: 'fa-trophy', color: '#ffd700', label: '修复点', category: 'explore' },
        field_building: { icon: 'fa-warehouse', color: '#b08d57', label: '野外建筑', category: 'other' },
        collection_building: { icon: 'fa-warehouse', color: '#b08d57', label: '采集建筑', category: 'other' },
        lumber_yard: { icon: 'fa-tree', color: '#2ecc71', label: '伐木场', category: 'other' },
        quarry_yard: { icon: 'fa-mountain', color: '#95a5a6', label: '采石场', category: 'other' },
        mining_yard: { icon: 'fa-gem', color: '#7f8c8d', label: '采矿场', category: 'other' },
        hunting_ground: { icon: 'fa-bullseye', color: '#c0392b', label: '狩猎场', category: 'other' },
        elemental_altar: { icon: 'fa-fire', color: '#e67e22', label: '元素祭坛', category: 'other' },
        fishing_ground: { icon: 'fa-fish', color: '#3498db', label: '渔场', category: 'other' },
        picking_cabin: { icon: 'fa-leaf', color: '#27ae60', label: '采集小屋', category: 'other' },
        feeding_point: { icon: 'fa-utensils', color: '#ff9f43', label: '投食点', category: 'other' },
        airship: { icon: 'fa-plane', color: '#2980b9', label: '飞空艇', category: 'other' },
        capturable_kibo: { icon: 'fa-paw', color: '#ff6b9d', label: '可捕捉奇波', category: 'creature' },
        egg_point: { icon: 'fa-egg', color: '#ffeaa7', label: '蛋点', category: 'creature' },
        decorative_egg: { icon: 'fa-egg', color: '#ffeaa7', label: '装饰蛋', category: 'creature' },
        kibo_egg: { icon: 'fa-egg', color: '#f8c291', label: '普通奇波蛋', category: 'creature' },
        mystery_egg: { icon: 'fa-egg', color: '#d2b4de', label: '神秘奇波蛋', category: 'creature' },
        mating_point: { icon: 'fa-heart', color: '#ff69b4', label: '交配点', category: 'creature' },
        rare_kibo: { icon: 'fa-paw', color: '#ff6b9d', label: '稀有奇波', category: 'creature' },
        chipo_duel_center: { icon: 'fa-fist-raised', color: '#ff4500', label: '奇波对决中心', category: 'creature' },
        star_nest: { icon: 'fa-map-marker-alt', color: '#00bfff', label: '异脉星巢', category: 'other' },
        investigation_point: { icon: 'fa-search', color: '#8e44ad', label: '调查点', category: 'other' },
        sparkle_investigation: { icon: 'fa-search', color: '#8e44ad', label: '闪光调查点', category: 'other' },
        letter: { icon: 'fa-envelope', color: '#8e44ad', label: '信件', category: 'other' },
        fine_book: { icon: 'fa-book', color: '#6c5ce7', label: '精装典籍', category: 'other' },
        reading: { icon: 'fa-book-open', color: '#6c5ce7', label: '阅读物', category: 'other' },
        map_mark: { icon: 'fa-map-marker-alt', color: '#00d9ff', label: '地图标记', category: 'other' },
        interact: { icon: 'fa-hand-pointer', color: '#9b59b6', label: '交互点', category: 'other' },
        spawner: { icon: 'fa-cube', color: '#f39c12', label: '实体', category: 'other' },
        event: { icon: 'fa-bolt', color: '#e94560', label: '随机事件', category: 'explore' },
        unknown: fallback
    };
    const markerType = typeof target === 'string'
        ? target
        : (target && (target.markerType || target.type || target.category));
    const markerCategory = typeof target === 'object' && target
        ? (target.markerCategory || '')
        : '';
    const category = typeof target === 'object' && target
        ? (target.category || markerType)
        : markerType;

    if (category && officialConfigs[category]) {
        return officialConfigs[category];
    }
    if (markerType && officialConfigs[markerType]) {
        return officialConfigs[markerType];
    }
    if (markerType && typeof MARKER_CONFIGS !== 'undefined' && MARKER_CONFIGS[markerType]) {
        return MARKER_CONFIGS[markerType];
    }
    if (markerCategory && typeof CATEGORY_CONFIGS !== 'undefined' && CATEGORY_CONFIGS[markerCategory]) {
        return CATEGORY_CONFIGS[markerCategory];
    }
    if (category && typeof CATEGORY_CONFIGS !== 'undefined' && CATEGORY_CONFIGS[category]) {
        return CATEGORY_CONFIGS[category];
    }
    return fallback;
}

function getOfficialFilterGroupConfig(key) {
    return OFFICIAL_FILTER_GROUPS.find(group => group.key === key) || OFFICIAL_FILTER_GROUPS[OFFICIAL_FILTER_GROUPS.length - 1];
}

function getOfficialCategoryGroupKey(category) {
    const markerCategory = typeof category === 'object' && category ? category.markerCategory : '';
    return markerCategory || getOfficialMarkerConfig(category).category || 'other';
}

function getOfficialLayerColor(target) {
    return getOfficialMarkerConfig(target).color || '#95a5a6';
}

function getOfficialLayerIcon(target) {
    return getOfficialMarkerConfig(target).icon || 'fa-circle';
}

function escapeOfficialHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatOfficialVector(vector) {
    if (!vector) return '无';
    return `${vector.x}, ${vector.y}, ${vector.z}`;
}

function formatOfficialCaptureSource(entry) {
    const source = entry.randomGroupId
        ? `随机组 ${entry.randomGroupId}${entry.timeKeys?.length ? ` / 时段 ${entry.timeKeys.join('/')}` : ''}`
        : '固定敌人组';
    const groups = entry.groupIds?.length ? `敌人组 ${entry.groupIds.join('/')}` : '';
    const packs = entry.enemyPackIds?.length ? `敌人包 ${entry.enemyPackIds.join('/')}` : '';
    return [source, groups, packs].filter(Boolean).join('，');
}

function createOfficialCaptureHtml(point) {
    const entries = point.capture?.entries || [];
    if (entries.length === 0) return '';
    const items = entries.map(entry => {
        const probability = entry.probabilityPercent || '未知概率';
        const enemyNames = entry.enemyNames?.length ? ` / ${entry.enemyNames.join('、')}` : '';
        const weight = entry.weights?.length ? ` (${entry.weights.join('、')})` : '';
        return `
            <div class="official-capture-item">
                <div>
                    <strong>${escapeOfficialHtml(entry.kiboName || entry.petId)}</strong>
                    <span>${escapeOfficialHtml(enemyNames)}</span>
                </div>
                <div class="official-capture-prob">${escapeOfficialHtml(probability)}${escapeOfficialHtml(weight)}</div>
                <div class="official-capture-source">${escapeOfficialHtml(formatOfficialCaptureSource(entry))}</div>
            </div>
        `;
    }).join('');
    return `
        <div class="official-capture-list">
            <div class="official-capture-title"><i class="fas fa-paw"></i> 可捕捉奇波</div>
            ${items}
        </div>
    `;
}

function createOfficialPopup(point, dataset) {
    const source = point.source || {};
    const raw = point.raw || {};
    const refs = point.refs || {};
    const semantic = point.semantic || {};
    const color = getOfficialLayerColor(point);
    return `
        <div class="popup-content official-popup">
            <h3><i class="fas ${getOfficialLayerIcon(point)}" style="color: ${color};"></i> ${escapeOfficialHtml(point.displayName || point.id)}</h3>
            <p><strong>分类：</strong>${escapeOfficialHtml(point.categoryLabel || point.typeLabel || point.type)}</p>
            ${semantic.source ? `<p><strong>语义来源：</strong>${escapeOfficialHtml(semantic.source)}${semantic.elementLabel ? ` / ${escapeOfficialHtml(semantic.elementLabel)}属性` : ''}</p>` : ''}
            ${createOfficialCaptureHtml(point)}
            <p><strong>地图坐标：</strong>${point.map.lat.toFixed(2)}, ${point.map.lng.toFixed(2)}</p>
            <p><strong>游戏坐标：</strong>${escapeOfficialHtml(formatOfficialVector(point.game))}</p>
            <p><strong>原始表 ID：</strong>${escapeOfficialHtml(raw.id)}</p>
            <p><strong>来源：</strong>${escapeOfficialHtml(source.worldmap)} / ${escapeOfficialHtml(source.worldArea)}</p>
            ${refs.filterMark ? `<p><strong>地图标记：</strong>${escapeOfficialHtml(refs.filterMark.name || refs.filterMark.id)} (${escapeOfficialHtml(refs.filterMark.id)})</p>` : ''}
            ${refs.spawner ? `<p><strong>Spawner：</strong>${escapeOfficialHtml(refs.spawner.name || refs.spawner.id)} (${escapeOfficialHtml(refs.spawner.id)})</p>` : ''}
            ${refs.worldResource ? `<p><strong>资源：</strong>${escapeOfficialHtml(refs.worldResource.name || refs.worldResource.id)} (${escapeOfficialHtml(refs.worldResource.id)})</p>` : ''}
            ${refs.worldItem ? `<p><strong>物件资源：</strong>world_item ${escapeOfficialHtml(refs.worldItem.id)}</p>` : ''}
            ${refs.playable ? `<p><strong>玩法：</strong>playable ${escapeOfficialHtml(refs.playable.id)} / type ${escapeOfficialHtml(refs.playable.type)}</p>` : ''}
            ${refs.playable?.objectResourcePaths?.length ? `<p><strong>玩法对象：</strong>${escapeOfficialHtml(refs.playable.objectResourcePaths.join(' / '))}</p>` : ''}
            ${refs.commonWorldRepair ? `<p><strong>修复玩法：</strong>common_world_repair ${escapeOfficialHtml(refs.commonWorldRepair.id)}</p>` : ''}
            <p><strong>场景：</strong>${escapeOfficialHtml(dataset.sceneId)}　<strong>区域：</strong>${escapeOfficialHtml(raw.worldAreaIds || '')}</p>
            <p><strong>spawnerId：</strong>${escapeOfficialHtml(raw.spawnerId)}　<strong>filterMark：</strong>${escapeOfficialHtml(raw.filterMark)}</p>
        </div>
    `;
}

async function getOfficialPointDataset(config) {
    const officialData = config && config.officialData;
    if (!officialData) return null;

    const key = officialData.key || currentMapId;
    if (officialPointDataCache[key]) return officialPointDataCache[key];

    if (window.OFFICIAL_POINT_DATA && window.OFFICIAL_POINT_DATA[key]) {
        officialPointDataCache[key] = window.OFFICIAL_POINT_DATA[key];
        return officialPointDataCache[key];
    }

    if (!officialData.url) return null;

    const response = await fetch(officialData.url, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    officialPointDataCache[key] = await response.json();
    return officialPointDataCache[key];
}

function clearOfficialLayer() {
    if (officialLayerGroup) {
        if (map.hasLayer(officialLayerGroup)) {
            map.removeLayer(officialLayerGroup);
        }
        officialLayerGroup = null;
    }
}

function updateOfficialLayerStatus(text) {
    const statusEl = document.getElementById('official-layer-status');
    if (statusEl) statusEl.textContent = text;
}

function isOfficialCategoryDefaultHidden(category, dataset = currentOfficialDataset) {
    const hidden = dataset && Array.isArray(dataset.defaultHiddenCategories)
        ? dataset.defaultHiddenCategories
        : [];
    if (hidden.includes(category)) return true;
    const categoryMeta = dataset?.categories?.find(item => item.key === category);
    const groupKey = categoryMeta ? getOfficialCategoryGroupKey(categoryMeta) : '';
    return Boolean(groupKey && hidden.includes(groupKey));
}

function isOfficialCategoryChecked(category, dataset = currentOfficialDataset) {
    if (Object.prototype.hasOwnProperty.call(officialCategoryFilters, category)) {
        return officialCategoryFilters[category] !== false;
    }
    return !isOfficialCategoryDefaultHidden(category, dataset);
}

function isOfficialCategoryVisible(point, dataset = currentOfficialDataset) {
    const category = point.category || point.type || 'unknown';
    if (!Object.prototype.hasOwnProperty.call(officialCategoryFilters, category)) {
        const hidden = dataset && Array.isArray(dataset.defaultHiddenCategories)
            ? dataset.defaultHiddenCategories
            : [];
        if (hidden.includes(point.markerCategory)) return false;
    }
    return isOfficialCategoryChecked(category, dataset);
}

function getOfficialPointSearchText(point) {
    const refs = point.refs || {};
    const raw = point.raw || {};
    const source = point.source || {};
    const semantic = point.semantic || {};
    const capture = point.capture || {};
    const captureEntries = capture.entries || [];
    return [
        point.id,
        point.type,
        point.typeLabel,
        point.category,
        point.categoryLabel,
        point.displayName,
        raw.id,
        raw.spawnerId,
        raw.expandId,
        raw.filterMark,
        raw.interactOptions,
        raw.interactOverrideParams,
        refs.filterMark?.id,
        refs.filterMark?.name,
        refs.spawner?.id,
        refs.spawner?.name,
        refs.worldResource?.id,
        refs.worldResource?.name,
        refs.worldResource?.resPath,
        refs.worldItem?.id,
        refs.worldItem?.resPath,
        refs.playable?.id,
        refs.playable?.type,
        ...(refs.playable?.objectNames || []),
        ...(refs.playable?.objectSpawnerIds || []),
        ...(refs.playable?.objectResourcePaths || []),
        semantic.source,
        semantic.note,
        semantic.text,
        semantic.captureSummary,
        capture.summary,
        ...(capture.names || []),
        ...captureEntries.flatMap(entry => [
            entry.petId,
            entry.kiboName,
            ...(entry.enemyIds || []),
            ...(entry.enemyNames || []),
            ...(entry.enemyPackIds || []),
            ...(entry.groupIds || []),
            entry.probabilityPercent,
            entry.sourceField,
            entry.sourceValue,
            entry.randomGroupId,
            ...(entry.timeKeys || []),
            entry.randomSourceField,
            ...(entry.weights || [])
        ]),
        source.worldmap,
        source.worldArea,
        source.filterMark,
        source.spawner,
        source.worldResource,
        source.worldItem,
        source.playable
    ].filter(value => value !== undefined && value !== null).join(' ').toLowerCase();
}

function getOfficialSearchParts() {
    return officialSearchKeyword.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function isOfficialPointSearchMatch(point) {
    const parts = getOfficialSearchParts();
    if (parts.length === 0) return true;
    const text = getOfficialPointSearchText(point);
    return parts.every(part => text.includes(part));
}

function isOfficialCaptureSearchMatch(point) {
    const parts = getOfficialSearchParts();
    if (parts.length === 0 || !point.capture?.entries?.length) return false;
    const text = [
        point.capture.summary,
        ...(point.capture.names || []),
        ...point.capture.entries.flatMap(entry => [
            entry.petId,
            entry.kiboName,
            ...(entry.enemyNames || []),
            entry.probabilityPercent
        ])
    ].filter(value => value !== undefined && value !== null).join(' ').toLowerCase();
    return parts.every(part => text.includes(part));
}

function createOfficialMarker(point, dataset) {
    const color = getOfficialLayerColor(point);
    const marker = L.marker([point.map.lat, point.map.lng], {
        icon: L.divIcon({
            className: 'official-point-icon',
            html: `<span style="background:${color}"><i class="fas ${getOfficialLayerIcon(point)}"></i></span>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
            popupAnchor: [0, -10]
        }),
        keyboard: false
    });
    marker.bindPopup(createOfficialPopup(point, dataset));
    return marker;
}

function renderOfficialFilters(dataset) {
    const container = document.getElementById('official-filter-list');
    if (!container) return;

    if (!dataset || !Array.isArray(dataset.categories) || dataset.categories.length === 0) {
        container.innerHTML = '<div class="official-filter-empty">暂无分类</div>';
        return;
    }

    const categories = dataset.categories
        .slice()
        .sort((a, b) => b.inBounds - a.inBounds || a.label.localeCompare(b.label, 'zh-CN'));

    const groupedCategories = OFFICIAL_FILTER_GROUPS.map(group => ({
        ...group,
        categories: categories.filter(category => getOfficialCategoryGroupKey(category) === group.key)
    })).filter(group => group.categories.length > 0);

    container.innerHTML = groupedCategories.map(group => {
        const groupCount = group.categories.reduce((sum, category) => sum + category.inBounds, 0);
        const children = group.categories.map(category => {
            const checked = isOfficialCategoryChecked(category.key, dataset) ? 'checked' : '';
            const color = getOfficialLayerColor(category);
            return `
                <label class="official-filter-item">
                    <input type="checkbox" class="official-category-filter" value="${escapeOfficialHtml(category.key)}" ${checked}>
                    <span class="official-filter-swatch" style="background:${color}"></span>
                    <span class="official-filter-name">${escapeOfficialHtml(category.label)}</span>
                    <span class="official-filter-count">${category.inBounds}</span>
                </label>
            `;
        }).join('');
        return `
            <section class="official-filter-group">
                <label class="official-filter-group-header">
                    <input type="checkbox" class="official-group-filter" value="${escapeOfficialHtml(group.key)}">
                    <span class="official-filter-group-icon"><i class="fas ${group.icon}"></i></span>
                    <span class="official-filter-group-name">${escapeOfficialHtml(group.label)}</span>
                    <span class="official-filter-count">${groupCount}</span>
                </label>
                <div class="official-filter-children">${children}</div>
            </section>
        `;
    }).join('');

    container.querySelectorAll('.official-filter-group').forEach(groupEl => {
        const groupInput = groupEl.querySelector('.official-group-filter');
        const childInputs = Array.from(groupEl.querySelectorAll('.official-category-filter'));
        const checkedCount = childInputs.filter(input => input.checked).length;
        groupInput.checked = checkedCount === childInputs.length;
        groupInput.indeterminate = checkedCount > 0 && checkedCount < childInputs.length;
        groupInput.addEventListener('change', function () {
            childInputs.forEach(input => {
                officialCategoryFilters[input.value] = this.checked;
            });
            localStorage.setItem('promilia-official-category-filters', JSON.stringify(officialCategoryFilters));
            renderOfficialLayer(currentOfficialDataset);
        });
    });

    container.querySelectorAll('.official-category-filter').forEach(input => {
        input.addEventListener('change', function () {
            officialCategoryFilters[this.value] = this.checked;
            localStorage.setItem('promilia-official-category-filters', JSON.stringify(officialCategoryFilters));
            renderOfficialLayer(currentOfficialDataset);
        });
    });
}

function renderOfficialLayer(dataset) {
    clearOfficialLayer();
    currentOfficialDataset = dataset;
    if (!dataset || !Array.isArray(dataset.points)) {
        updateOfficialLayerStatus('当前地图暂无官方点位');
        renderOfficialFilters(dataset);
        return;
    }

    renderOfficialFilters(dataset);

    const allInBoundsPoints = dataset.points.filter(point => point.inBounds && point.map);
    const searchActive = getOfficialSearchParts().length > 0;
    const categoryVisiblePoints = allInBoundsPoints.filter(point => (
        isOfficialCategoryVisible(point, dataset) ||
        (searchActive && isOfficialCaptureSearchMatch(point))
    ));
    const visiblePoints = categoryVisiblePoints.filter(point => isOfficialPointSearchMatch(point));
    const useCluster = officialClusterEnabled && typeof L.markerClusterGroup === 'function';
    officialLayerGroup = useCluster
        ? L.markerClusterGroup({
            showCoverageOnHover: false,
            spiderfyOnMaxZoom: true,
            removeOutsideVisibleBounds: false,
            chunkedLoading: true,
            maxClusterRadius: 48
        })
        : L.layerGroup();

    visiblePoints.forEach(point => {
        createOfficialMarker(point, dataset).addTo(officialLayerGroup);
    });

    officialLayerGroup.addTo(map);
    const searchText = officialSearchKeyword.trim()
        ? `，搜索命中 ${visiblePoints.length} / ${categoryVisiblePoints.length}`
        : '';
    updateOfficialLayerStatus(`${visiblePoints.length} / ${allInBoundsPoints.length} 个显示${searchText}`);
}

window.loadOfficialLayerForMap = async function (mapId) {
    clearOfficialLayer();
    if (!officialLayerEnabled) {
        updateOfficialLayerStatus('已隐藏');
        return;
    }

    const config = MAP_CONFIGS[mapId];
    if (!config || !config.officialData) {
        updateOfficialLayerStatus('当前地图暂无官方点位');
        return;
    }

    updateOfficialLayerStatus('加载中...');
    try {
        const dataset = await getOfficialPointDataset(config);
        renderOfficialLayer(dataset);
    } catch (error) {
        console.error('官方点位加载失败:', error);
        updateOfficialLayerStatus('加载失败');
    }
};

window.initOfficialLayerUI = function () {
    const toggle = document.getElementById('official-layer-toggle');
    if (!toggle) return;

    toggle.checked = officialLayerEnabled;
    toggle.addEventListener('change', function () {
        officialLayerEnabled = this.checked;
        localStorage.setItem('promilia-official-layer-enabled', officialLayerEnabled ? 'true' : 'false');
        loadOfficialLayerForMap(currentMapId);
    });

    const clusterToggle = document.getElementById('official-cluster-toggle');
    if (clusterToggle) {
        clusterToggle.checked = officialClusterEnabled;
        clusterToggle.addEventListener('change', function () {
            officialClusterEnabled = this.checked;
            localStorage.setItem('promilia-official-cluster-enabled', officialClusterEnabled ? 'true' : 'false');
            renderOfficialLayer(currentOfficialDataset);
        });
    }

    const searchInput = document.getElementById('official-search-input');
    const searchClear = document.getElementById('official-search-clear');
    if (searchInput) {
        searchInput.value = officialSearchKeyword;
        searchInput.addEventListener('input', function () {
            officialSearchKeyword = this.value;
            renderOfficialLayer(currentOfficialDataset);
        });
        searchInput.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                this.value = '';
                officialSearchKeyword = '';
                renderOfficialLayer(currentOfficialDataset);
            }
        });
    }
    if (searchClear) {
        searchClear.addEventListener('click', function () {
            officialSearchKeyword = '';
            if (searchInput) searchInput.value = '';
            renderOfficialLayer(currentOfficialDataset);
        });
    }
};
