/**
 * 全局状态变量
 */

// 地图相关状态
let currentMapId = localStorage.getItem('promilia-current-map') || 'shalulu';
let mapConfigs = {};
let mapViews = {};

// 标记相关状态
let markerData = {};
let allMarkersData = {};
let markerIdCounter = 0;

// 收集状态
let collectedMarkers = JSON.parse(localStorage.getItem('promilia-collected-markers') || '{}');

// 路线相关状态
let allRoutes = {};
let routeCounter = 0;
let currentRouteColor = '#FF3333';
let currentRoutePoints = [];
let currentRouteLine = null;
let currentRouteDecorator = null;
let currentRouteStartMarker = null;

// 筛选状态
let filterState = JSON.parse(localStorage.getItem('promilia-filter-state') || '{}');
let categoryExpanded = JSON.parse(localStorage.getItem('promilia-category-expanded') || '{}');
let clusterEnabled = localStorage.getItem('promilia-cluster-enabled') !== 'false';

// 预计算和缓存
let precomputedStats = {};
let lastPrecomputed = 0;

// 当前选中的标记类型（默认不选择，避免误触）
let currentMarkerType = null;

// 批量选择模式
let batchSelectionMode = false;
let selectedMarkers = new Set();

// 隐藏的标记层（用于筛选）
const hiddenMarkers = new Map();

// 全局地图和标记集群变量（leaflet 对象）
let map;
let markers;
let mapOverlay = null;
let tileOverlays = [];
let tileLayer = null;
