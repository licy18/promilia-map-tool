/**
 * 入口文件 - 初始化应用
 */

console.log('🚀 普罗米利亚地图标记工具 v' + TOOL_VERSION);
console.log('🔄 初始化中...');

// 分类展开状态 - 默认全折叠已经在 filter.js 处理了

// 初始化批量收集下拉
initBatchTypeSelect();

// 监听路线开关已经在 route.js 处理了

// 监听标记类型选择
document.querySelectorAll('#marker-types .marker-type').forEach(el => {
    el.addEventListener('click', function (e) {
        e.stopPropagation();  // 防止触发分类折叠

        // === 【新增 v3.7】温柔版防呆拦截：选新标记前也问问主人喵！ ===
        const routeToggle = document.getElementById('route-mode-toggle');
        if (routeToggle && routeToggle.checked && typeof currentRoutePoints !== 'undefined' && currentRoutePoints.length > 0) {
            if (!confirm('喵呜！您还有一条正在绘制的路线没有保存哦！\n选择新标记会导致当前未画完的路线丢失，确定要放弃绘制吗？')) {
                return; // 主人反悔了，拦截点击
            }
        }
        // ============================================================

        document.querySelectorAll('#marker-types .marker-type').forEach(e => e.classList.remove('active'));
        this.classList.add('active');
        currentMarkerType = this.dataset.type;

        // 保存到 localStorage
        localStorage.setItem('promilia-marker-type', currentMarkerType);
        const browseToggle = document.getElementById('browse-mode-toggle');
        if (browseToggle && browseToggle.checked) {
            browseToggle.checked = false;
            showToast('已退出浏览模式', 'success');
        }

        // === 新增：互斥 -> 选择标记时，自动关闭路线画笔模式 ===
        // （喵呜：此处直接使用上方刚才声明过的 routeToggle 变量即可！）
        if (routeToggle && routeToggle.checked) {
            routeToggle.checked = false;
            routeToggle.dispatchEvent(new Event('change')); // 触发路线面板收起逻辑
        }
        // ====================================================

        // 更新提示信息
        const tipEl = document.getElementById('marker-tip');
        const config = MARKER_CONFIGS[currentMarkerType];
        tipEl.textContent = `当前类型：${config.label}，点击地图添加标记`;
        tipEl.style.color = config.color;

        console.log(`📍 切换标记类型：${currentMarkerType}`);
    });
});

// === 新增：防误触（浏览模式）的互斥与清理逻辑 ===
const browseToggle = document.getElementById('browse-mode-toggle');
if (browseToggle) {
    browseToggle.addEventListener('change', function () {
        if (this.checked) {
            // === 【修改 v3.7】温柔版防呆拦截：开启浏览模式前问问主人喵！ ===
            const routeToggle = document.getElementById('route-mode-toggle');
            if (routeToggle && routeToggle.checked && typeof currentRoutePoints !== 'undefined' && currentRoutePoints.length > 0) {
                if (!confirm('喵呜！您还有一条正在绘制的路线没有保存哦！\n开启浏览模式会导致当前未画完的路线丢失，确定要放弃绘制吗？')) {
                    this.checked = false; // 主人反悔了，把开关拨回去
                    return; // 拦截成功，强行打断施法！
                }
            }

            // 1. 互斥：开启浏览时，自动关闭路线画笔
            if (routeToggle && routeToggle.checked) {
                routeToggle.checked = false;
                routeToggle.dispatchEvent(new Event('change')); // 触发路线收起、隐藏判定线的联动逻辑
            }

            // 2. 清除选中的宝箱标记
            document.querySelectorAll('#marker-types .marker-type').forEach(e => e.classList.remove('active'));
            currentMarkerType = null;
            localStorage.removeItem('promilia-marker-type');

            // 3. 更新提示文字
            const tipEl = document.getElementById('marker-tip');
            if (tipEl) {
                tipEl.textContent = '浏览模式：点击地图不会添加标记';
                tipEl.style.color = '#888';
            }
            showToast('已进入防误触浏览模式', 'success');
        }
    });
}
// ==========================================

// 恢复上次选择的标记类型
function restoreMarkerType() {
    const savedType = localStorage.getItem('promilia-marker-type');
    if (savedType && MARKER_CONFIGS[savedType]) {
        currentMarkerType = savedType;
        // 更新 UI
        document.querySelectorAll('#marker-types .marker-type').forEach(el => {
            el.classList.remove('active');
            if (el.dataset.type === savedType) {
                el.classList.add('active');
            }
        });
        // 更新提示信息
        const config = MARKER_CONFIGS[currentMarkerType];
        const tipEl = document.getElementById('marker-tip');
        tipEl.textContent = `当前类型：${config.label}，点击地图添加标记`;
        tipEl.style.color = config.color;
        console.log(`🔍 恢复标记类型：${currentMarkerType}`);
    }
}
restoreMarkerType();

// 聚合计数器开关事件已经在 filter.js 处理了

// 应用启动
console.log('📍 初始化地图...');

// 创建地图（使用简单坐标系）
map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -3,
    maxZoom: 2,
    zoomControl: false, // 禁用默认缩放控制
    attributionControl: false // 方案1：通过配置参数隐藏右下角链接标签
});

// 标记集群
console.log('📌 初始化标记集群...');
markers = L.markerClusterGroup({
    showCoverageOnHover: true,
    zoomToBoundsOnClick: true,
    spiderfyOnMaxZoom: true,
    // === 【新增 v3.7】打破视野限制，防止扒拉地图时标签突然"蹦"出来喵！ ===
    removeOutsideVisibleBounds: false, // 牺牲一点点内存，换取绝对丝滑的沉浸感！
    chunkedLoading: true // 开启分块加载，保护显卡不被海量标签卡死
    // ========================================================
});

// 根据聚合状态决定是否添加到地图
if (clusterEnabled) {
    map.addLayer(markers);
    console.log('✅ 标记聚合已启用');
} else {
    console.log('⚠️ 标记聚合已禁用（标记将直接显示在地图上）');
}

// 加载当前地图
// 【重要】mapConfig 是 map-manager.js 里已经初始化好了 currentMapConfig
console.log(`✅ 应用启动完成`);
restoreView();
restoreMarkerType();
initCosConfigUI();
initBatchTypeSelect();

// 初始化地图（使用保存的地图 ID，保持缩放）
loadMap(currentMapId, true);

// 绑定地图事件（必须在 map 初始化后调用）
if (typeof bindMapEvents === 'function') bindMapEvents();
if (typeof bindRouteEvents === 'function') bindRouteEvents();
if (typeof bindRadarEvents === 'function') bindRadarEvents();
if (typeof initRouteEvents === 'function') initRouteEvents();
if (typeof initRadarLayer === 'function') initRadarLayer();

// 初始化滑动条值
setTimeout(updateZoomSlider, 500);

// 绑定缩放按钮事件
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
if (zoomInBtn) zoomInBtn.addEventListener('click', zoomIn);
if (zoomOutBtn) zoomOutBtn.addEventListener('click', zoomOut);

// 智能清空数据处理
window.executeClearData = function () {
    const scope = document.querySelector('input[name="clear-scope"]:checked').value;
    const clearMarkers = document.getElementById('clear-target-markers').checked;
    const clearRoutes = document.getElementById('clear-target-routes').checked;

    // 产品经理的安全校验规则：不勾选绝对不给过！
    if (!clearMarkers && !clearRoutes) {
        showToast('喵呜！至少要勾选一项要清空的内容吧？什么都不选我怎么干活喵！', 'error');
        return;
    }

    const scopeText = scope === 'current' ? `【当前地图：${currentMapConfig.name}】` : '【所有地图的全部区域】';
    let targetText = [];
    if (clearMarkers) targetText.push('标点');
    if (clearRoutes) targetText.push('路线');

    // 二次确认，明确告知用户将发生什么
    if (!confirm(`⚠️ 危险操作确认 ⚠️\n\n即将彻底清空 ${scopeText} 上的 ${targetText.join(' 和 ')} 数据。\n此操作不可逆，确定要执行吗喵？`)) {
        return;
    }

    // 1. 处理【当前地图】的内存数据
    if (clearMarkers) {
        markers.clearLayers();
        for (let key in markerData) delete markerData[key];
        markerIdCounter = 0;
    }

    if (clearRoutes && typeof allRoutes !== 'undefined') {
        Object.values(allRoutes).forEach(route => {
            if (route.line) map.removeLayer(route.line);
            if (route.decorator) map.removeLayer(route.decorator);
        });
        for (let key in allRoutes) delete allRoutes[key];
        routeCounter = 0;
    }

    // 将当前地图被掏空的数据保存覆盖进本地缓存
    saveCurrentMapMarkers();

    // 2. 处理【所有地图】的跨界清除
    if (scope === 'all') {
        Object.keys(MAP_CONFIGS).forEach(mapId => {
            if (mapId === currentMapId) return; // 当前地图刚处理过，跳过

            const storageKey = MAP_CONFIGS[mapId].storageKey;
            try {
                const saved = localStorage.getItem(storageKey);
                if (saved) {
                    let data = JSON.parse(saved);
                    if (clearMarkers) {
                        data.markers = {};
                        data.counter = 0;
                        if (allMarkersData[mapId]) allMarkersData[mapId] = {};
                    }
                    if (clearRoutes) {
                        data.routes = {};
                        data.routeCounter = 0;
                    }
                    // 重新写入覆盖掉旧缓存
                    localStorage.setItem(storageKey, JSON.stringify(data));
                }
            } catch (e) { console.error('清理历史地图数据失败:', e); }
        });
    }

    // 关掉面板并给予正反馈
    document.getElementById('clear-data-modal').style.display = 'none';
    showToast('数据已按您的吩咐精准清理完毕喵！', 'success');

    // 为了保证界面绝对干净（解决非聚合模式下的残影），强制重载视觉层
    setTimeout(() => {
        location.reload();
    }, 500);
};
// ===========================================

// 用户面板开关
document.getElementById('user-toggle-btn').addEventListener('click', function() {
    const panel = document.getElementById('user-panel');
    panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
});

console.log('✅ 普罗米利亚地图标记工具启动完成');
showToast('普罗米利亚地图工具已就绪', 'success');
