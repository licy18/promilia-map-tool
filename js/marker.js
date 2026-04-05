/**
 * 标记增删改查、图标创建、弹窗、收集
 */

// 创建自定义标记图标
function createMarkerIcon(type, markerId) {
    const config = MARKER_CONFIGS[type];
    const isCollected = markerId ? isMarkerCollected(markerId) : false;
    const opacity = isCollected ? '0.5' : '1';

    // 处理未知标记类型
    if (!config) {
        const html = `
            <div style="
                width: 40px;
                height: 40px;
                background: #999;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 3px solid white;
                box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                opacity: ${opacity};
            ">
                <i class="fas fa-question" style="color: white; font-size: 18px;"></i>
            </div>
        `;

        return L.divIcon({
            html: html,
            className: 'custom-marker',
            iconSize: [40, 40],
            iconAnchor: [20, 20],
            popupAnchor: [0, -20]
        });
    }

    // 如果配置了图片图标（AP 专用标记）
    if (config.useImage && config.imagePath) {
        const html = `
            <div style="
                width: 40px;
                height: 40px;
                background: white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 3px solid ${config.color};
                box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                overflow: hidden;
                opacity: ${opacity};
            ">
                <img src="${config.imagePath}" style="width: 28px; height: 28px; object-fit: contain;" alt="${config.label}" />
            </div>
        `;

        return L.divIcon({
            html: html,
            className: 'custom-marker-image',
            iconSize: [40, 40],
            iconAnchor: [20, 20],
            popupAnchor: [0, -20]
        });
    }

    // 默认使用 FontAwesome 图标
    const html = `
        <div style="
            width: 40px;
            height: 40px;
            background: ${config.color};
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 3px solid white;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            opacity: ${opacity};
        ">
            <i class="fas ${config.icon}" style="color: white; font-size: 18px;"></i>
        </div>
    `;

    return L.divIcon({
        html: html,
        className: 'custom-marker',
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -20]
    });
}

// 创建弹窗内容
function createPopupContent(data) {
    const config = MARKER_CONFIGS[data.type] || { icon: 'fa-question', color: '#999', label: '未知标记' };
    const isCollected = isMarkerCollected(data.id);
    return `
        <div class="popup-content">
            <h3><i class="fas ${config.icon}" style="color: ${config.color};"></i> ${config.label} ${isCollected ? '<i class="fas fa-check-circle" style="color: #00ff88; margin-left: 5px;"></i>' : ''}</h3>
            <p style="font-size: 0.85em; color: #888;">
                坐标：${data.lat.toFixed(1)}, ${data.lng.toFixed(1)}
            </p>
            <div style="display: flex; align-items: center; justify-content: space-between; margin: 10px 0;">
                <span style="font-size: 0.85em;">已收集</span>
                <label class="switch">
                    <input type="checkbox" ${isCollected ? 'checked' : ''} onchange="event.stopPropagation(); toggleMarkerCollect('${data.id}')">
                    <span class="slider"></span>
                </label>
            </div>
            <textarea placeholder="添加备注..." id="note-${data.id}">${data.note || ''}</textarea>
            <div class="popup-actions">
                <button class="btn-save" onclick="event.stopPropagation(); saveMarkerNote('${data.id}')">
                    <i class="fas fa-save"></i> 保存
                </button>
                <button class="btn-delete" onclick="event.stopPropagation(); deleteMarker('${data.id}')">
                    <i class="fas fa-trash"></i> 删除
                </button>
            </div>
        </div>
    `;
}

// 添加标记
function addMarker(latlng, type = currentMarkerType) {
    const id = 'marker_' + Date.now() + '_' + markerIdCounter++;
    const marker = L.marker(latlng, {
        icon: createMarkerIcon(type, id),
        draggable: false // 初始设置为不可拖动
    });

    const data = {
        id: id,
        type: type,
        lat: latlng.lat,
        lng: latlng.lng,
        note: '',
        createdAt: new Date().toISOString(),
        popup: null  // 保存弹窗引用
    };

    markerData[id] = data;

    // 绑定弹窗并保存引用
    const popup = marker.bindPopup(createPopupContent(data));
    data.popup = popup.getPopup();

    // 绑定右键点击事件
    marker.on('contextmenu', function(e) {
        // 阻止默认行为
        if (e.originalEvent) {
            e.originalEvent.preventDefault();
            e.originalEvent.stopPropagation(); // 阻止事件冒泡，防止触发地图的右键菜单
            showContextMenu(e.originalEvent.pageX, e.originalEvent.pageY, id);
        } else {
            // 处理没有originalEvent的情况
            const containerPoint = map.latLngToContainerPoint(e.latlng);
            const x = containerPoint.x + window.scrollX;
            const y = containerPoint.y + window.scrollY;
            showContextMenu(x, y, id);
        }
    });

    // 根据聚合状态决定添加到集群还是直接添加到地图
    if (clusterEnabled) {
        markers.addLayer(marker);
    } else {
        map.addLayer(marker);
    }

    // 自动保存
    saveToLocalStorage();
    updateStats();

    console.log(`✅ 添加标记：${id} (${type})，聚合：${clusterEnabled ? '启用' : '禁用'}`);
    return marker;
}

// 保存标记备注
window.saveMarkerNote = function (id) {
    const note = document.getElementById(`note-${id}`).value;
    if (markerData[id]) {
        markerData[id].note = note;
        saveToLocalStorage();

        // 更新弹窗中的备注显示
        const popup = markerData[id].popup;
        if (popup) {
            popup.setContent(createPopupContent(markerData[id]));
        }

        showToast('备注已保存', 'success');
    }
};

// 删除标记
window.deleteMarker = function (id) {
    if (markerData[id]) {
        delete markerData[id];

        // 从集群或地图中移除标记（根据聚合状态）
        if (clusterEnabled) {
            // 从集群中移除
            markers.eachLayer(layer => {
                if (layer.getPopup() && layer.getPopup().getContent().includes(id)) {
                    markers.removeLayer(layer);
                }
            });
        } else {
            // 从地图中直接移除
            map.eachLayer(layer => {
                if (layer instanceof L.Marker && layer.getPopup() && layer.getPopup().getContent().includes(id)) {
                    map.removeLayer(layer);
                }
            });
        }

        saveToLocalStorage();
        updateStats();
        showToast('标记已删除', 'success');
    }
};

// 切换标记收集状态
window.toggleMarkerCollect = function (id) {
    console.log('[toggleMarkerCollect] 切换标记收集状态:', id);
    // 直接切换收集状态
    collectedMarkers[id] = !collectedMarkers[id];
    const isCollected = collectedMarkers[id];
    const statusText = isCollected ? '已标记为已收集' : '已取消收集';

    console.log('[toggleMarkerCollect] 当前收集状态:', isCollected, 'collectedMarkers:', collectedMarkers);

    // 保存收集状态
    if (typeof saveCollectedMarkers === 'function') {
        saveCollectedMarkers();
    }

    // 更新标记弹窗
    if (markerData[id]) {
        if (clusterEnabled) {
            markers.eachLayer(layer => {
                if (layer.getPopup() && layer.getPopup().getContent().includes(id)) {
                    layer.setPopupContent(createPopupContent(markerData[id]));
                    layer.setIcon(createMarkerIcon(markerData[id].type, id));
                }
            });
        } else {
            map.eachLayer(layer => {
                if (layer instanceof L.Marker && layer.getPopup() && layer.getPopup().getContent().includes(id)) {
                    layer.setPopupContent(createPopupContent(markerData[id]));
                    layer.setIcon(createMarkerIcon(markerData[id].type, id));
                }
            });
        }
    }

    // 更新分类统计面板
    console.log('[toggleMarkerCollect] 调用updateStats()');
    updateStats();

    // 如果设置为不显示已收集标记，无论标记的收集状态如何变化，都需要更新标记可见性
    if (!showCollectedMarkers) {
        updateMarkerVisibility();
    }

    showToast(`标记${statusText}`, 'success');
};

// 加载指定地图的标记
function loadMarkersForMap(mapId) {
    console.log(`📍 加载地图标记：${mapId}`);

    // 清空当前标记
    markers.clearLayers();
    Object.keys(markerData).forEach(key => delete markerData[key]);

    // 从 localStorage 加载（每次都从 localStorage 加载，确保数据最新）
    const storageKey = mapConfigs[mapId].storageKey;
    let markersToLoad = {};

    try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            let data = JSON.parse(saved);
            // 数据迁移
            data = migrateData(data);
            markerIdCounter = data.counter || 0;
            routeCounter = data.routeCounter || 0;
            markersToLoad = data.markers || {};
            console.log(`  ✅ 从 localStorage 加载：${Object.keys(markersToLoad).length} 个标记 (版本: ${data.version})`);
        } else {
            console.log(`  ℹ️ 无存储数据，初始化空数据`);
        }
    } catch (e) {
        console.error(`❌ 加载标记失败 (${mapId}):`, e);
    }

    // 保存到内存和当前 markerData
    allMarkersData[mapId] = markersToLoad;
    Object.assign(markerData, markersToLoad);

    // 添加到地图（根据聚合状态决定添加到集群还是直接添加到地图）
    Object.values(markerData).forEach(marker => {
        // 检查筛选状态
        if (!filterState[marker.type]) {
            return;
        }

        const m = L.marker([marker.lat, marker.lng], {
            icon: createMarkerIcon(marker.type, marker.id),
            draggable: false // 初始设置为不可拖动
        });
        const popup = m.bindPopup(createPopupContent(marker));
        marker.popup = popup.getPopup();  // 重新建立 popup 引用

        // 绑定右键点击事件
        m.on('contextmenu', function(e) {
            // 阻止默认行为
            if (e.originalEvent) {
                e.originalEvent.preventDefault();
                e.originalEvent.stopPropagation(); // 阻止事件冒泡，防止触发地图的右键菜单
                showContextMenu(e.originalEvent.pageX, e.originalEvent.pageY, marker.id);
            } else {
                // 处理没有originalEvent的情况
                const containerPoint = map.latLngToContainerPoint(e.latlng);
                const x = containerPoint.x + window.scrollX;
                const y = containerPoint.y + window.scrollY;
                showContextMenu(x, y, marker.id);
            }
        });

        if (clusterEnabled) {
            markers.addLayer(m);
        } else {
            map.addLayer(m);
        }
    });

    // 确保集群已添加到地图
    if (clusterEnabled && !map.hasLayer(markers)) {
        map.addLayer(markers);
    }

    console.log(`✅ 加载完成：${Object.keys(markerData).length} 个标记 (${mapId})，聚合：${clusterEnabled ? '启用' : '禁用'}`);
    updateStats();

    // === 新增：加载并重新在地图上画出路线 ===
    // 1. 先把地图上旧的路线全拔掉
    Object.values(allRoutes).forEach(r => {
        if (r.line) map.removeLayer(r.line);
        if (r.decorator) map.removeLayer(r.decorator);
    });
    // 2. 清空内存数据
    allRoutes = {};

    try {
        const storageKey = mapConfigs[mapId].storageKey;
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            const data = JSON.parse(saved);
            if (data.routeCounter) routeCounter = data.routeCounter;
            const loadedRoutes = data.routes || {};

            // 3. 遍历读取的数据，重新在地图上作画！
            Object.values(loadedRoutes).forEach(routeData => {
                const line = L.polyline(routeData.points, {
                    color: routeData.color,
                    weight: 6,
                    opacity: 1.0
                });

                // 计算当前缩放级别下的箭头参数
                let currentZoom = map.getZoom();
                let zoomDiff = currentZoom - (-1); // ARROW_STANDARD_ZOOM = -1
                let zoomScale = Math.pow(2, zoomDiff);
                let currentRepeat = Math.max(20, 60 * zoomScale);
                let currentOffset = Math.max(10, 25 * zoomScale);
                let currentArrowSize = Math.max(2, Math.min(50, 12 * Math.pow(2, currentZoom)));
                let currentArrowWeight = Math.max(0.5, Math.min(10, 2 * Math.pow(2, currentZoom)));

                const decorator = L.polylineDecorator(line, {
                    patterns: [
                        { offset: currentOffset, repeat: currentRepeat, symbol: L.Symbol.arrowHead({ pixelSize: currentArrowSize, polygon: false, pathOptions: { stroke: true, weight: currentArrowWeight, color: routeData.color } }) }
                    ]
                });

                if (routeData.visible) {
                    line.addTo(map);
                    decorator.addTo(map);
                }

                allRoutes[routeData.id] = {
                    id: routeData.id,
                    name: routeData.name,
                    color: routeData.color,
                    visible: routeData.visible,
                    line: line,
                    decorator: decorator
                };
            });
        }
    } catch (e) { console.error('加载路线失败:', e); }

    // 4. 刷新侧边栏的路线列表
    if (typeof renderRouteList === 'function') renderRouteList();
    // 【新增：地图加载完路线后，立刻计算正确的物理粗细】
    if (typeof updateAllRoutesThickness === 'function') updateAllRoutesThickness();
}

// 保存当前地图的标记
function saveCurrentMapMarkers() {
    const storageKey = mapConfigs[currentMapId].storageKey;
    try {
        // 创建不含 popup 引用的数据副本（popup 是 DOM 对象，不能被 JSON 序列化）
        const markersToSave = {};
        Object.keys(markerData).forEach(key => {
            const { popup, ...markerDataWithoutPopup } = markerData[key];
            markersToSave[key] = markerDataWithoutPopup;
        });

        // === 新增：提取路线的纯数据以便保存 ===
        const routesToSave = {};
        Object.keys(allRoutes).forEach(key => {
            const r = allRoutes[key];
            routesToSave[key] = {
                id: r.id,
                name: r.name,
                color: r.color,
                visible: r.visible,
                points: r.line.getLatLngs() // 核心：只提取所有坐标点！
            };
        });
        // ===================================

        const data = {
            version: DATA_VERSION,
            markers: markersToSave,
            routes: routesToSave, // === 新增：把路线数据塞进保险箱 ===
            counter: markerIdCounter,
            routeCounter: routeCounter,
            savedAt: new Date().toISOString()
        };
        localStorage.setItem(storageKey, JSON.stringify(data));
        allMarkersData[currentMapId] = markersToSave;
        updateLastSaved();
        console.log(`💾 已保存 ${currentMapId} 的 ${Object.keys(markersToSave).length} 个标记`);
    } catch (e) {
        console.error('❌ 保存失败:', e);
        showToast('保存失败：存储空间不足', 'error');
    }
}

// 保存到 localStorage 别名
const saveToLocalStorage = saveCurrentMapMarkers;

// 更新标记可见性（支持聚合/非聚合模式）
function updateMarkerVisibility() {
    if (clusterEnabled) {
        // === 聚合模式：从集群中移除再重新添加 ===
        markers.eachLayer(layer => {
            if (layer instanceof L.Marker) {
                markers.removeLayer(layer);
            }
        });

        // 根据筛选状态重新添加到集群
        Object.values(markerData).forEach(data => {
            if (filterState[data.type]) {
                const marker = L.marker([data.lat, data.lng], {
                    icon: createMarkerIcon(data.type, data.id),
                    draggable: false // 初始设置为不可拖动
                });
                marker.bindPopup(createPopupContent(data));
                data.popup = marker.getPopup(); // <=== 【新增修复：交接遥控器】
                
                // 绑定右键点击事件
                marker.on('contextmenu', function(e) {
                    // 阻止默认行为
                    if (e.originalEvent) {
                        e.originalEvent.preventDefault();
                        e.originalEvent.stopPropagation(); // 阻止事件冒泡，防止触发地图的右键菜单
                        showContextMenu(e.originalEvent.pageX, e.originalEvent.pageY, data.id);
                    } else {
                        // 处理没有originalEvent的情况
                        const containerPoint = map.latLngToContainerPoint(e.latlng);
                        const x = containerPoint.x + window.scrollX;
                        const y = containerPoint.y + window.scrollY;
                        showContextMenu(x, y, data.id);
                    }
                });
                
                markers.addLayer(marker);
            }
        });
    } else {
        // === 非聚合模式：从地图中移除再重新添加 ===
        map.eachLayer(layer => {
            if (layer instanceof L.Marker) {
                map.removeLayer(layer);
            }
        });

        // 根据筛选状态重新添加到地图
        Object.values(markerData).forEach(data => {
            if (filterState[data.type]) {
                const marker = L.marker([data.lat, data.lng], {
                    icon: createMarkerIcon(data.type, data.id),
                    draggable: false // 初始设置为不可拖动
                });
                marker.bindPopup(createPopupContent(data));
                data.popup = marker.getPopup(); // <=== 【新增修复：交接遥控器】
                
                // 绑定右键点击事件
                marker.on('contextmenu', function(e) {
                    // 阻止默认行为
                    if (e.originalEvent) {
                        e.originalEvent.preventDefault();
                        e.originalEvent.stopPropagation(); // 阻止事件冒泡，防止触发地图的右键菜单
                        showContextMenu(e.originalEvent.pageX, e.originalEvent.pageY, data.id);
                    } else {
                        // 处理没有originalEvent的情况
                        const containerPoint = map.latLngToContainerPoint(e.latlng);
                        const x = containerPoint.x + window.scrollX;
                        const y = containerPoint.y + window.scrollY;
                        showContextMenu(x, y, data.id);
                    }
                });
                
                map.addLayer(marker);
            }
        });
    }
}

// 全局变量，用于存储当前右键点击的标记ID
let currentContextMarkerId = null;

// 显示右键菜单
function showContextMenu(x, y, markerId) {
    const contextMenu = document.getElementById('context-menu');
    const collectStatus = document.getElementById('collect-status');
    
    // 存储当前标记ID
    currentContextMarkerId = markerId;
    
    // 更新已收集状态
    const isCollected = isMarkerCollected(markerId);
    collectStatus.textContent = isCollected ? '未收集' : '已收集';
    
    // 定位菜单
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.style.display = 'block';
    
    // 点击其他区域关闭菜单
    setTimeout(() => {
        document.addEventListener('click', hideContextMenu);
    }, 10);
}

// 隐藏右键菜单
function hideContextMenu() {
    const contextMenu = document.getElementById('context-menu');
    contextMenu.style.display = 'none';
    currentContextMarkerId = null;
    
    // 移除点击事件监听器
    document.removeEventListener('click', hideContextMenu);
}

// 处理菜单点击事件
function handleContextMenuAction(action) {
    if (!currentContextMarkerId) return;
    
    switch (action) {
        case 'toggle-collect':
            toggleMarkerCollect(currentContextMarkerId);
            break;
        case 'move':
            startMoveMarker(currentContextMarkerId);
            break;
        case 'delete':
            deleteMarker(currentContextMarkerId);
            break;
    }
    
    hideContextMenu();
}

// 开始移动标记
function startMoveMarker(markerId) {
    // 找到对应的标记
    let targetMarker = null;
    
    if (clusterEnabled) {
        markers.eachLayer(layer => {
            if (layer instanceof L.Marker && layer.getPopup() && layer.getPopup().getContent().includes(markerId)) {
                targetMarker = layer;
            }
        });
    } else {
        map.eachLayer(layer => {
            if (layer instanceof L.Marker && layer.getPopup() && layer.getPopup().getContent().includes(markerId)) {
                targetMarker = layer;
            }
        });
    }
    
    if (targetMarker) {
        // 设置为可拖动
        targetMarker.dragging.enable();
        
        // 绑定拖动结束事件
        targetMarker.on('dragend', function(e) {
            const newLatLng = e.target.getLatLng();
            updateMarkerPosition(markerId, newLatLng);
            // 拖动结束后禁用拖动
            targetMarker.dragging.disable();
        });
        
        showToast('请拖动标记到新位置', 'info');
    }
}

// 更新标记位置
function updateMarkerPosition(markerId, latlng) {
    if (markerData[markerId]) {
        markerData[markerId].lat = latlng.lat;
        markerData[markerId].lng = latlng.lng;
        saveToLocalStorage();
        showToast('标记位置已更新', 'success');
        
        // 更新弹窗内容
        const popup = markerData[markerId].popup;
        if (popup) {
            popup.setContent(createPopupContent(markerData[markerId]));
        }
    }
}

// 初始化右键菜单事件
function initContextMenu() {
    const contextMenu = document.getElementById('context-menu');
    if (contextMenu) {
        contextMenu.addEventListener('click', function(e) {
            e.stopPropagation();
            const action = e.target.closest('.context-menu-item')?.dataset.action;
            if (action) {
                handleContextMenuAction(action);
            }
        });
    }
}

// 页面加载完成后初始化右键菜单
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', initContextMenu);
    window.addEventListener('DOMContentLoaded', initMapContextMenu);
}

// 全局变量，用于存储当前右键点击的地图位置
let currentMapContextLatLng = null;

// 初始化空白区域右键菜单
function initMapContextMenu() {
    const mapContextMenu = document.getElementById('map-context-menu');
    if (mapContextMenu) {
        // 点击菜单外部关闭菜单
        document.addEventListener('click', function(e) {
            if (!mapContextMenu.contains(e.target) && mapContextMenu.style.display === 'block') {
                hideMapContextMenu();
            }
        });
    }
}

// 显示空白区域右键菜单
function showMapContextMenu(x, y, latlng) {
    const mapContextMenu = document.getElementById('map-context-menu');
    const menuContent = mapContextMenu.querySelector('.map-context-menu-content');
    
    // 存储当前点击位置
    currentMapContextLatLng = latlng;
    
    // 生成菜单内容
    generateMapContextMenu(menuContent);
    
    // 定位菜单并检测边界
    positionMapContextMenu(mapContextMenu, x, y);
    
    // 显示菜单
    mapContextMenu.style.display = 'block';
}

// 隐藏空白区域右键菜单
function hideMapContextMenu() {
    const mapContextMenu = document.getElementById('map-context-menu');
    if (mapContextMenu) {
        mapContextMenu.style.display = 'none';
        currentMapContextLatLng = null;
    }
}

// 生成空白区域右键菜单内容
function generateMapContextMenu(menuContent) {
    // 清空菜单内容
    menuContent.innerHTML = '';
    
    // 存储所有分类项和子菜单的引用
    const categoryItems = [];
    
    // 按分类组织标记类型
    const markersByCategory = {};
    for (const [type, config] of Object.entries(MARKER_CONFIGS)) {
        const category = config.category;
        if (!markersByCategory[category]) {
            markersByCategory[category] = [];
        }
        markersByCategory[category].push({ type, config });
    }
    
    // 生成菜单
    for (const [categoryId, markers] of Object.entries(markersByCategory)) {
        const categoryConfig = CATEGORY_CONFIGS[categoryId];
        if (!categoryConfig) continue;
        
        // 创建分类项
        const categoryItem = document.createElement('div');
        categoryItem.className = 'map-context-category';
        categoryItem.innerHTML = `
            <div style="display: flex; align-items: center;">
                <i class="fas ${categoryConfig.icon}" style="color: ${categoryConfig.color};"></i>
                <span>${categoryConfig.label}</span>
            </div>
            <i class="fas fa-chevron-right category-arrow"></i>
        `;
        
        // 创建子菜单
        const submenu = document.createElement('div');
        submenu.className = 'map-context-submenu';
        
        // 存储分类项和子菜单的引用
        categoryItems.push({ categoryItem, submenu });
        
        // 生成子菜单项
        markers.forEach(({ type, config }) => {
            const subitem = document.createElement('div');
            subitem.className = 'map-context-subitem';
            subitem.dataset.type = type;
            subitem.innerHTML = `
                <i class="fas ${config.icon}" style="color: ${config.color};"></i>
                <span>${config.label}</span>
            `;
            
            // 绑定点击事件
            subitem.addEventListener('click', function() {
                addMarkerAtPosition(type);
                hideMapContextMenu();
            });
            
            submenu.appendChild(subitem);
        });
        
        // 绑定分类项点击事件
        categoryItem.addEventListener('click', function(e) {
            e.stopPropagation();
            
            const isExpanded = this.classList.contains('expanded');
            
            // 收起所有子菜单
            categoryItems.forEach(({ categoryItem: item, submenu: sm }) => {
                item.classList.remove('expanded');
                sm.classList.remove('show');
                // 确保子菜单完全隐藏
                sm.style.display = 'none';
            });
            
            // 切换当前子菜单状态
            if (!isExpanded) {
                // 展开当前子菜单
                this.classList.add('expanded');
                submenu.classList.add('show');
                submenu.style.display = 'block';
                
                // 强制计算子菜单的实际高度
                submenu.style.visibility = 'hidden';
                const submenuHeight = submenu.offsetHeight;
                const submenuWidth = submenu.offsetWidth || 180;
                submenu.style.visibility = 'visible';
                
                // 计算子菜单位置，确保在窗口内
                const rect = this.getBoundingClientRect();
                const windowWidth = window.innerWidth;
                const windowHeight = window.innerHeight;
                
                // 调整子菜单位置
                let top = 0;
                let left = rect.width;
                
                // 检查右侧边界
                if (rect.right + submenuWidth > windowWidth) {
                    left = -submenuWidth;
                }
                
                // 检查底部边界
                if (rect.top + submenuHeight > windowHeight) {
                    // 计算需要向上调整的距离
                    const overflow = rect.top + submenuHeight - windowHeight + 10;
                    top = -overflow;
                    // 确保子菜单不会超出顶部边界
                    if (rect.top + top < 0) {
                        top = -rect.top + 10;
                    }
                }
                
                submenu.style.top = top + 'px';
                submenu.style.left = left + 'px';
            }
        });
        
        menuContent.appendChild(categoryItem);
        menuContent.appendChild(submenu);
    }
}

// 定位空白区域右键菜单并检测边界
function positionMapContextMenu(menu, x, y) {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const menuWidth = menu.offsetWidth || 200;
    const menuHeight = menu.offsetHeight || 300;
    
    // 调整菜单位置，确保不超出窗口边界
    let adjustedX = x;
    let adjustedY = y;
    
    if (x + menuWidth > windowWidth) {
        adjustedX = windowWidth - menuWidth - 10;
    }
    
    if (y + menuHeight > windowHeight) {
        adjustedY = windowHeight - menuHeight - 10;
    }
    
    menu.style.left = adjustedX + 'px';
    menu.style.top = adjustedY + 'px';
}

// 在指定位置添加标记
function addMarkerAtPosition(type) {
    if (currentMapContextLatLng) {
        addMarker(currentMapContextLatLng, type);
        showToast(`已添加 ${MARKER_CONFIGS[type].label} 标记`, 'success');
    }
}
