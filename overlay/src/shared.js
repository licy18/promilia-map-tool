const DEFAULT_HIDDEN_CATEGORIES = Object.freeze(['collect', 'npc', 'creature', 'spawner']);

const FILTER_GROUPS = Object.freeze([
  { key: 'explore', label: '探索', color: '#3498db' },
  { key: 'puzzle', label: '解谜', color: '#a55eea' },
  { key: 'creature', label: '生物', color: '#ff6b9d' },
  { key: 'other', label: '其他', color: '#95a5a6' }
]);

const MARKER_CONFIGS = Object.freeze({
  npc: { color: '#3498db', label: 'NPC', group: 'creature' },
  creature: { color: '#ff6b9d', label: '生物', group: 'creature' },
  capturable_kibo: { color: '#ff6b9d', label: '可捕捉奇波', group: 'creature' },
  shop: { color: '#16a085', label: '商店', group: 'other' },
  photo_spot: { color: '#00bcd4', label: '拍照点', group: 'other' },
  teleport: { color: '#9b59b6', label: '传送点', group: 'explore' },
  star_node: { color: '#00bfff', label: '星脉节点', group: 'explore' },
  puzzle_mechanism: { color: '#ffd700', label: '机关解谜', group: 'puzzle' },
  spirit_game: { color: '#ffd700', label: '息灵游戏', group: 'puzzle' },
  guiding_grass: { color: '#ffd700', label: '指路草', group: 'puzzle' },
  lost_spirit: { color: '#ffd700', label: '迷失息灵', group: 'puzzle' },
  fire_altar: { color: '#ffd700', label: '祭火之坛', group: 'puzzle' },
  radiant_altar: { color: '#ffd700', label: '辉印祭坛', group: 'puzzle' },
  spirit_pedal: { color: '#ffd700', label: '巡灵踏板', group: 'puzzle' },
  monument_array: { color: '#ffd700', label: '遗碑方阵', group: 'puzzle' },
  exploration_challenge: { color: '#ffd700', label: '探索挑战', group: 'explore' },
  transform_challenge: { color: '#ffd700', label: '变身挑战', group: 'explore' },
  bowling_challenge: { color: '#ffd700', label: '保龄球小游戏', group: 'explore' },
  kibo_rescue: { color: '#ffd700', label: '解救苗鸡', group: 'explore' },
  dulu_herding: { color: '#ffd700', label: '嘟噜回巢', group: 'explore' },
  repair_building: { color: '#ffd700', label: '建筑修复点', group: 'explore' },
  repair_elevator: { color: '#ffd700', label: '修复电梯', group: 'explore' },
  repair_bridge: { color: '#ffd700', label: '修复桥梁', group: 'explore' },
  singing_spirit: { color: '#ffd700', label: '歌唱息灵', group: 'explore' },
  challenge_mount: { color: '#ffd700', label: '坐骑挑战', group: 'explore' },
  repair_point: { color: '#ffd700', label: '修复点', group: 'explore' },
  field_building: { color: '#b08d57', label: '野外建筑', group: 'other' },
  collection_building: { color: '#b08d57', label: '采集建筑', group: 'other' },
  lumber_yard: { color: '#2ecc71', label: '伐木场', group: 'other' },
  quarry_yard: { color: '#95a5a6', label: '采石场', group: 'other' },
  mining_yard: { color: '#7f8c8d', label: '采矿场', group: 'other' },
  hunting_ground: { color: '#c0392b', label: '狩猎场', group: 'other' },
  elemental_altar: { color: '#e67e22', label: '元素祭坛', group: 'other' },
  fishing_ground: { color: '#3498db', label: '渔场', group: 'other' },
  picking_cabin: { color: '#27ae60', label: '采集小屋', group: 'other' },
  feeding_point: { color: '#ff9f43', label: '投食点', group: 'other' },
  airship: { color: '#2980b9', label: '飞空艇', group: 'other' },
  egg_point: { color: '#ffeaa7', label: '蛋点', group: 'creature' },
  decorative_egg: { color: '#ffeaa7', label: '装饰蛋', group: 'creature' },
  kibo_egg: { color: '#f8c291', label: '普通奇波蛋', group: 'creature' },
  mystery_egg: { color: '#d2b4de', label: '神秘奇波蛋', group: 'creature' },
  mating_point: { color: '#ff69b4', label: '交配点', group: 'creature' },
  rare_kibo: { color: '#ff6b9d', label: '稀有奇波', group: 'creature' },
  chipo_duel_center: { color: '#ff4500', label: '奇波对决中心', group: 'creature' },
  star_nest: { color: '#00bfff', label: '异脉星巢', group: 'other' },
  investigation_point: { color: '#8e44ad', label: '调查点', group: 'other' },
  sparkle_investigation: { color: '#8e44ad', label: '闪光调查点', group: 'other' },
  letter: { color: '#8e44ad', label: '信件', group: 'other' },
  fine_book: { color: '#6c5ce7', label: '精装典籍', group: 'other' },
  reading: { color: '#6c5ce7', label: '阅读物', group: 'other' },
  map_mark: { color: '#00d9ff', label: '地图标记', group: 'other' },
  interact: { color: '#9b59b6', label: '交互点', group: 'other' },
  spawner: { color: '#f39c12', label: '实体', group: 'other' },
  event: { color: '#e94560', label: '随机事件', group: 'explore' },
  collect: { color: '#e91e63', label: '采集物', group: 'explore' },
  fish: { color: '#3498db', label: '钓鱼点', group: 'other' },
  unknown: { color: '#95a5a6', label: '未知', group: 'other' }
});

function getBounds(dataset) {
  const bounds = dataset && dataset.transform && dataset.transform.bounds;
  if (!Array.isArray(bounds) || bounds.length < 2) {
    throw new Error('Dataset is missing transform.bounds');
  }

  const first = bounds[0];
  const second = bounds[1];
  if (!Array.isArray(first) || !Array.isArray(second) || first.length < 2 || second.length < 2) {
    throw new Error('Dataset transform.bounds must be [[minLat,minLng],[maxLat,maxLng]]');
  }

  return {
    minLat: Math.min(Number(first[0]), Number(second[0])),
    minLng: Math.min(Number(first[1]), Number(second[1])),
    maxLat: Math.max(Number(first[0]), Number(second[0])),
    maxLng: Math.max(Number(first[1]), Number(second[1]))
  };
}

function projectPointToRect(point, dataset, rect) {
  if (!point || !point.map || !rect) return null;

  const lat = Number(point.map.lat);
  const lng = Number(point.map.lng);
  const { minLat, minLng, maxLat, maxLng } = getBounds(dataset);
  const lngSpan = maxLng - minLng;
  const latSpan = maxLat - minLat;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lngSpan === 0 || latSpan === 0) {
    return null;
  }

  const xRatio = (lng - minLng) / lngSpan;
  const yRatio = (maxLat - lat) / latSpan;

  return {
    x: rect.x + xRatio * rect.width,
    y: rect.y + yRatio * rect.height,
    xRatio,
    yRatio
  };
}

function getMarkerConfig(target) {
  if (!target) return MARKER_CONFIGS.unknown;
  const key = typeof target === 'string'
    ? target
    : (target.category || target.markerType || target.type || target.markerCategory);
  const markerType = typeof target === 'object' ? target.markerType : '';
  const markerCategory = typeof target === 'object' ? target.markerCategory : '';

  return MARKER_CONFIGS[key]
    || MARKER_CONFIGS[markerType]
    || MARKER_CONFIGS[markerCategory]
    || MARKER_CONFIGS.unknown;
}

function getCategoryGroup(category) {
  if (!category) return 'other';
  if (typeof category === 'object' && category.markerCategory) {
    return category.markerCategory;
  }
  return getMarkerConfig(category).group || 'other';
}

function getHiddenCategorySet(dataset) {
  const hidden = Array.isArray(dataset && dataset.defaultHiddenCategories)
    ? dataset.defaultHiddenCategories
    : [];
  return new Set([...DEFAULT_HIDDEN_CATEGORIES, ...hidden]);
}

function isCategoryDefaultVisible(categoryKey, dataset, categoryMeta) {
  const hidden = getHiddenCategorySet(dataset);
  const group = getCategoryGroup(categoryMeta || categoryKey);
  return !hidden.has(categoryKey) && !hidden.has(group);
}

function isPointVisibleByCategory(point, dataset, visibility) {
  const category = point.category || point.type || 'unknown';
  if (Object.prototype.hasOwnProperty.call(visibility, category)) {
    return visibility[category] !== false;
  }
  const categoryMeta = Array.isArray(dataset.categories)
    ? dataset.categories.find(item => item.key === category)
    : null;
  return isCategoryDefaultVisible(category, dataset, categoryMeta || point);
}

function collectValues(value, output, depth = 0) {
  if (value === undefined || value === null || depth > 4) return;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    output.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectValues(item, output, depth + 1));
    return;
  }
  if (typeof value === 'object') {
    Object.values(value).forEach(item => collectValues(item, output, depth + 1));
  }
}

function getPointSearchText(point) {
  const values = [];
  collectValues({
    id: point.id,
    type: point.type,
    typeLabel: point.typeLabel,
    category: point.category,
    categoryLabel: point.categoryLabel,
    displayName: point.displayName,
    raw: point.raw,
    refs: point.refs,
    source: point.source,
    semantic: point.semantic,
    capture: point.capture
  }, values);
  return values.join(' ').toLowerCase();
}

function doesPointMatchSearch(point, keyword) {
  const normalized = String(keyword || '').trim().toLowerCase();
  if (!normalized) return true;
  const searchText = getPointSearchText(point);
  return normalized.split(/\s+/).every(part => searchText.includes(part));
}

const shared = {
  DEFAULT_HIDDEN_CATEGORIES,
  FILTER_GROUPS,
  MARKER_CONFIGS,
  getBounds,
  projectPointToRect,
  getMarkerConfig,
  getCategoryGroup,
  getHiddenCategorySet,
  isCategoryDefaultVisible,
  isPointVisibleByCategory,
  getPointSearchText,
  doesPointMatchSearch
};

if (typeof module !== 'undefined') {
  module.exports = shared;
}

if (typeof window !== 'undefined') {
  window.OverlayShared = shared;
}
