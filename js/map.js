/**
 * 地图初始化、加载、切换
 */

// 创建彩色占位背景
function createPlaceholder(mapId) {
    const config = MAP_CONFIGS[mapId];
    console.log(`🎨 创建占位背景：${config.name}, 颜色：${config.color}`);

    const canvas = document.createElement('canvas');
    canvas.width = config.width;
    canvas.height = config.height;
    const ctx = canvas.getContext('2d');

    // 渐变背景
    const gradient = ctx.createLinearGradient(0, 0, config.width, config.height);
    gradient.addColorStop(0, config.color);
    gradient.addColorStop(1, '#1a1a2e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, config.width, config.height);

    // 网格线
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    const gridSize = 128;
    for (let x = 0; x <= config.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, config.height);
        ctx.stroke();
    }
    for (let y = 0; y <= config.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(config.width, y);
        ctx.stroke();
    }

    // 图标
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = 'bold 120px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const icons = { shalulu: '🏡', xinaya: '🌱', fulisi: '🌾' };
    ctx.fillText(icons[mapId] || '🗺️', config.width / 2, config.height / 2 - 60);

    // 名称
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 36px Arial';
    ctx.fillText(config.name, config.width / 2, config.height / 2 + 20);
    ctx.font = '16px Arial';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('(占位背景)', config.width / 2, config.height / 2 + 50);

    return canvas.toDataURL('image/png');
}

// 修复：真正物理等比例缩放的引擎
window.updateAllRoutesThickness = function () {
    let scale = Math.pow(2, map.getZoom());
    let currentLineWeight = Math.max(0.5, Math.min(30, 5 * scale));
    let currentArrowSize = Math.max(2, Math.min(50, 12 * scale));
    let currentArrowWeight = Math.max(0.5, Math.min(10, 2 * scale));

    // 1. 更新正在手动绘制的线
    if (currentRouteLine) {
        currentRouteLine.setStyle({ weight: currentLineWeight });
    }
    if (currentRouteDecorator) {
        currentRouteDecorator.setPatterns([
            { offset: 25, repeat: 60, symbol: L.Symbol.arrowHead({ pixelSize: currentArrowSize, polygon: false, pathOptions: { stroke: true, weight: currentArrowWeight, color: currentRouteColor } }) }
        ]);
    }

    // 2. 更新内存里所有已经保存渲染的路线
    Object.values(allRoutes).forEach(route => {
        if (route.line) {
            route.line.setStyle({ weight: currentLineWeight });
        }
        if (route.decorator) {
            route.decorator.setPatterns([
                { offset: 25, repeat: 60, symbol: L.Symbol.arrowHead({ pixelSize: currentArrowSize, polygon: false, pathOptions: { stroke: true, weight: currentArrowWeight, color: route.color } }) }
            ]);
        }
    });
};

// 加载/切换地图
function loadMap(mapId, keepZoom = false) {
    const config = MAP_CONFIGS[mapId];

    console.log(`🔄 切换地图：${currentMapId} -> ${mapId}, keepZoom=${keepZoom}`);

    // 【关键】切换前保存当前地图的标记数据和视图
    if (currentMapId) {
        // 创建不含 popup 引用的数据副本（popup 是 DOM 对象，不能被 JSON 序列化）
        const markersToSave = {};
        Object.keys(markerData).forEach(key => {
            const { popup, ...markerDataWithoutPopup } = markerData[key];
            markersToSave[key] = markerDataWithoutPopup;
        });
        allMarkersData[currentMapId] = JSON.parse(JSON.stringify(markersToSave));

        // 只有在地图已初始化视图后才保存（避免首次加载时报错）
        try {
            mapViews[currentMapId] = {
                center: map.getCenter(),
                zoom: map.getZoom()
            };
            console.log(`💾 已保存 ${currentMapId} 的标记和视图 (zoom=${mapViews[currentMapId].zoom})`);
        } catch (e) {
            console.log(`⚠️ ${currentMapId} 地图视图未初始化，跳过保存`);
        }
    }

    currentMapId = mapId;
    currentMapConfig = config;

    // 保存当前地图 ID 到 localStorage
    localStorage.setItem('promilia-current-map', mapId);

    // 清除旧地图
    if (mapOverlay) {
        map.removeLayer(mapOverlay);
        mapOverlay = null;
    }
    if (tileOverlays.length > 0) {
        tileOverlays.forEach(tile => map.removeLayer(tile));
        tileOverlays = [];
    }
    if (tileLayer) {
        map.removeLayer(tileLayer);
        tileLayer = null;
    }

    // 清除旧标记（在加载新地图前清空集群）
    markers.clearLayers();
    Object.keys(markerData).forEach(key => delete markerData[key]);

    // 边界（Simple CRS: [[x1, y1], [x2, y2]]）
    const bounds = [[0, 0], [config.width, config.height]];

    // 根据地图类型加载（单张图片 or 单层瓦片 or 多层瓦片）
    if (config.type === 'tileLayer' && config.tileUrl) {
        // === 多层瓦片地图加载（Leaflet TileLayer） ===
        console.log(`🗺️ 加载多层瓦片地图：${config.name} (zoom ${config.minZoom}-${config.maxZoom})`);

        // 移除旧的 TileLayer
        if (tileLayer) {
            map.removeLayer(tileLayer);
            tileLayer = null;
        }

        // 移除旧的单层瓦片
        if (tileOverlays.length > 0) {
            tileOverlays.forEach(tile => map.removeLayer(tile));
            tileOverlays = [];
        }

        // 根据设定的原图宽度，反推出咱们真实的缩放层级偏移量
        // (比如 4096 / 256 = 16，log2(16) = 4。意味着 Leaflet 的 Zoom 0 相当于瓦片的 Zoom 4)
        const nativeZoomOffset = Math.round(Math.log2(config.width / 256));

        // 2. 将瓦片层级 (0 ~ maxZoom) 动态映射成 Leaflet 的物理层级 (用负数拉开视野)
        const leafletMinZoom = 0 - nativeZoomOffset;
        const leafletMaxNativeZoom = (config.maxZoom || 3) - nativeZoomOffset;

        tileLayer = L.tileLayer(config.tileUrl, {
            minZoom: leafletMinZoom,
            maxZoom: leafletMaxNativeZoom + 2,
            maxNativeZoom: leafletMaxNativeZoom,
            tileSize: 256,
            noWrap: true,
            bounds: [[0, 0], [config.height, config.width]],
            updateWhenIdle: false,
            updateWhenZooming: true,
            updateInterval: 50,
            keepBuffer: 10
        });

        // === 【新增 v3.7】强制锁死底层的最小缩放极值，拒绝滚轮无底线缩小喵！ ===
        // 直接把地图容器的下限，和咱们计算出的瓦片下限死死绑在一起！
        map.setMinZoom(leafletMinZoom);
        // ==========================================================

        // === 【终极版 v3.7】真·边缘超视距预加载 (EdgeBuffer 视网膜欺骗术) ===
        // 直接拦截底层视野计算器，骗它屏幕比实际大，强迫它提前下载视野外的瓦片喵！
        const originalGetBounds = tileLayer._getTiledPixelBounds;
        tileLayer._getTiledPixelBounds = function (center) {
            const bounds = originalGetBounds.call(this, center);

            // 256 是一张瓦片的像素大小。乘以 2 就是往外无死角扩充 2 圈！
            // 如果主人的电脑性能好，甚至可以把这里改成 256 * 3 或者 4，体验真正的绝对无缝！
            const expandPixels = 256 * 2;

            bounds.min.x -= expandPixels;
            bounds.min.y -= expandPixels;
            bounds.max.x += expandPixels;
            bounds.max.y += expandPixels;

            return bounds;
        };
        // ==========================================================

        // 核心黑科技：拦截寻址逻辑，接管 Y 轴翻转，干掉 404 报错
        tileLayer.getTileUrl = function (coords) {
            // 此时因为有 maxNativeZoom 保护，coords.z 绝对不会超过咱们切的最高层
            const tileZ = coords.z + nativeZoomOffset;
            const maxTiles = Math.pow(2, tileZ);
            const x = coords.x;

            // 【最关键的魔法】：Y轴翻转 (Leaflet 北向负数 转为咱们文件夹里自上而下正数)
            const y = coords.y + maxTiles;

            // 防爆框：如果算出来的坐标超出这层的格子，返回一张 1x1 透明图片，瞬间消灭控制台红字！
            if (x < 0 || x >= maxTiles || y < 0 || y >= maxTiles) {
                return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
            }

            // 给引擎返回正确的瓦片 URL
            return L.Util.template(this._url, {
                s: this._getSubdomain(coords),
                z: tileZ,
                x: x,
                y: y
            });
        };

        tileLayer.addTo(map);

        // 将算好的物理层级应用到大地图对象上
        map.setMinZoom(leafletMinZoom);
        map.setMaxZoom(leafletMaxNativeZoom + 2);

        // 设置视图到地图中心 (初始设为最远视角)
        const center = [config.height / 2, config.width / 2];
        map.setView(center, leafletMinZoom);

        console.log(`✅ 多层瓦片地图加载完成：${config.name}`);

    } else if (config.type === 'tiles' && config.tiles) {
        // === 单层瓦片地图加载（简单行列） ===
        console.log(`🗺️ 加载单层瓦片地图：${config.name} (${config.tileCols}x${config.tileRows} 瓦片)`);

        // 移除旧瓦片
        if (tileOverlays.length > 0) {
            tileOverlays.forEach(tile => map.removeLayer(tile));
            tileOverlays = [];
        }

        const tileSize = config.tileSize || 1024;
        const tileDir = config.tiles;

        // 按行列顺序加载瓦片
        for (let row = 0; row < config.tileRows; row++) {
            for (let col = 0; col < config.tileCols; col++) {
                const tileUrl = `${tileDir}/tile_${row}_${col}.png`;
                const tileBounds = [
                    [row * tileSize, col * tileSize],
                    [(row + 1) * tileSize, (col + 1) * tileSize]
                ];

                const testTile = new Image();
                testTile.onload = function () {
                    const tileOverlay = L.imageOverlay(tileUrl, tileBounds).addTo(map);
                    tileOverlays.push(tileOverlay);
                };
                testTile.onerror = function () {
                    console.log(`⚠️ 瓦片加载失败：${tileUrl}`);
                };
                testTile.src = tileUrl;
            }
        }

        // 超时保护（增加超时时间到 15 秒）
        let tileLoadTimeout = setTimeout(() => {
            if (tileOverlays.length === 0) {
                console.log(`⚠️ 瓦片加载超时（>15s），使用占位背景`);
                const placeholderImage = createPlaceholder(mapId);
                mapOverlay = L.imageOverlay(placeholderImage, bounds).addTo(map);
            } else {
                console.log(`✅ 单层瓦片地图加载完成：${tileOverlays.length} 张瓦片`);
            }
        }, 15000);

        // 检查是否所有瓦片都已加载
        const checkAllTilesLoaded = setInterval(() => {
            if (tileOverlays.length === config.tileRows * config.tileCols) {
                console.log(`✅ 所有瓦片加载完成，清除超时检查`);
                clearTimeout(tileLoadTimeout);
                clearInterval(checkAllTilesLoaded);
            }
        }, 500);

    } else {
        // === 单张图片地图加载 ===
        const mapImageUrl = config.image;
        const testImg = new Image();
        let imageLoaded = false;

        testImg.onload = function () {
            console.log(`✅ 地图图片加载成功：${mapImageUrl}`);
            imageLoaded = true;
            if (mapOverlay) map.removeLayer(mapOverlay);
            mapOverlay = L.imageOverlay(mapImageUrl, bounds).addTo(map);
        };
        testImg.onerror = function () {
            console.log(`⚠️ 地图图片加载失败 (${mapImageUrl})，使用占位背景`);
            imageLoaded = true;
            if (mapOverlay) map.removeLayer(mapOverlay);
            const placeholderImage = createPlaceholder(mapId);
            mapOverlay = L.imageOverlay(placeholderImage, bounds).addTo(map);
        };
        testImg.src = mapImageUrl;

        // 超时保护（增加超时时间到 15 秒）
        setTimeout(() => {
            if (!imageLoaded) {
                console.log(`⚠️ 地图图片超时（>15s），使用占位背景`);
                const placeholderImage = createPlaceholder(mapId);
                if (mapOverlay) map.removeLayer(mapOverlay);
                mapOverlay = L.imageOverlay(placeholderImage, bounds).addTo(map);
            }
            // 如果已加载成功，不执行任何操作（避免覆盖）
        }, 15000);  // 15 秒超时
    }

    // 恢复视图（如果有保存的视图）
    if (keepZoom && mapViews[mapId]) {
        console.log(`🔍 恢复 ${mapId} 的视图 (zoom=${mapViews[mapId].zoom})`);
        map.setView(mapViews[mapId].center, mapViews[mapId].zoom);
    } else {
        // 没有保存的视图时，总是 fitBounds（包括 keepZoom=true 但无缓存的情况）
        map.fitBounds(bounds);
    }

    // 更新 UI
    document.getElementById('current-map-name').textContent = config.name;
    document.getElementById('current-map-size').textContent = `${config.width}×${config.height}`;
    document.getElementById('map-select').value = mapId;

    // 加载标记
    loadMarkersForMap(mapId);
    updateStats();
    updateProgressStats();

    // 应用筛选状态
    updateFilterUI();
    updateMarkerVisibility();

    console.log(`✅ 地图加载完成：${config.name}`);
    showToast(`已切换至：${config.name}`, 'success');

    // 初始化路线粗细
    if (typeof updateAllRoutesThickness === 'function') {
        updateAllRoutesThickness();
    }

    // === 新增：切换地图后自动开启防误触模式 ===
    const browseToggle = document.getElementById('browse-mode-toggle');
    if (browseToggle && !browseToggle.checked) {
        browseToggle.checked = true;
        browseToggle.dispatchEvent(new Event('change')); // 触发刚才写的清理联动逻辑
    }
    // ==========================================
}

// 切换地图
window.switchMap = function (mapId) {
    // === 【修改 v3.7】温柔版防呆拦截：切地图前先问问主人要不要保存路线喵！ ===
    const routeToggle = document.getElementById('route-mode-toggle');
    if (routeToggle && routeToggle.checked && typeof currentRoutePoints !== 'undefined' && currentRoutePoints.length > 0) {
        if (!confirm('喵呜！您还有一条正在绘制的路线没有保存哦！\n切换地图会导致当前未画完的路线丢失，确定要放弃绘制并切换吗？')) {
            // 主人反悔了，咱们把下拉菜单悄悄变回原来的地图
            document.getElementById('map-select').value = currentMapId;
            return; // 拦截成功，强行打断施法！
        }
    }

    if (routeToggle && routeToggle.checked) {
        routeToggle.checked = false;
        routeToggle.dispatchEvent(new Event('change'));
    }
    // ========================================================================
    loadMap(mapId);
};

// === 【终极版 v3.7】正向同频丝滑缩放引擎喵！（去掉愚蠢的反向补偿>_<） ===
// 1. 监听滚轮触发的 0.25秒 CSS 原生缩放动画，直接同步缩放指令！
map.on('zoomanim', function (e) {
    let targetZoom = e.zoom;
    // 我们期望标签最终达到的视觉倍数
    let targetMarkerScale = Math.max(0.3, Math.min(1.5, Math.pow(1.5, targetZoom)));

    // 老老实实地开启同频 CSS 动画 (跟 Leaflet 底层默认动画曲线严丝合缝)
    document.documentElement.style.setProperty('--marker-transition', '0.25s cubic-bezier(0,0,0.25,1)');
    document.documentElement.style.setProperty('--marker-scale', targetMarkerScale);
});

// === 【新增 v3.7】根据层数动态调节瓦片预加载数量的聪明大脑喵！ ===
map.on('zoomend', function () {
    if (tileLayer) {
        // 获取当前绝对缩放层级
        let currentZoom = map.getZoom();

        // 核心算法：层级越大（看得越近），需要预加载的周围瓦片圈数就越多！
        // 限制在最小 2 圈，最大 8 圈的舒适区间内
        let dynamicBuffer = Math.max(2, Math.min(8, Math.round((currentZoom + 3) * 1.5)));

        tileLayer.options.keepBuffer = dynamicBuffer;
        // 可以解除下面这行注释来观察引擎的聪明表现喵~
        // console.log(`[引擎监控] 贴地飞行中，瓦片预加载缓冲已动态扩张为：${dynamicBuffer} 圈！`);
    }
});
// =======================================================

// === 【终极版 v3.7】正向同频丝滑缩放引擎喵！（去掉愚蠢的反向补偿>_<） ===
// 2. 动画结束瞬间的状态光速交接
map.on('zoomend', function () {
    let currentZoom = map.getZoom();
    let finalScale = Math.max(0.3, Math.min(1.5, Math.pow(1.5, currentZoom)));

    // 关闭动画，光速无缝替换！（因为此时地图底层的 paneScale 瞬间归零了）
    document.documentElement.style.setProperty('--marker-transition', '0s');
    document.documentElement.style.setProperty('--marker-scale', finalScale);

    // 同步更新路线粗细
    updateAllRoutesThickness();
});

// 3. 触控板无级缩放 (Pinch Zoom) 等实时事件的平滑处理
map.on('zoom', function () {
    // 如果正在进行 0.25s 的滚轮动画，绝对不要干扰它，全权交给上面的逆向引擎！
    if (map._animatingZoom) return;
    updateAllRoutesThickness();
});
// =======================================================

// 保存地图视图（缩放级别和中心点）- 按地图保存
let saveViewTimeout;
map.on('moveend zoomend', function () {
    clearTimeout(saveViewTimeout);
    saveViewTimeout = setTimeout(() => {
        const view = {
            center: map.getCenter(),
            zoom: map.getZoom()
        };
        // 保存到当前地图的视图
        mapViews[currentMapId] = view;
        // 同时保存到 localStorage（兼容旧版）
        localStorage.setItem('promilia-map-view', JSON.stringify(view));
        console.log(`💾 视图已保存：${currentMapId} (zoom=${view.zoom})`);
    }, 500);
});

// 恢复地图视图（从 localStorage）
function restoreView() {
    try {
        const saved = localStorage.getItem('promilia-map-view');
        if (saved) {
            const view = JSON.parse(saved);
            // 保存到 mapViews 供后续使用
            mapViews[currentMapId] = view;
            console.log(`🔍 恢复视图：zoom=${view.zoom}`);
        }
    } catch (e) {
        console.error('❌ 恢复视图失败:', e);
    }
}
