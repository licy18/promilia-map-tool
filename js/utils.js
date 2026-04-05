/**
 * 工具函数 - 统计、数据迁移等
 */

// 保存收集状态
const saveCollectedMarkers = () => {
    localStorage.setItem('promilia-collected-markers', JSON.stringify(collectedMarkers));
};

// 数据迁移
const migrateData = (data) => {
    const dataVersion = data.version || 0;

    // 版本 0 到版本 1 的迁移
    if (dataVersion < 1) {
        // 确保 routes 字段存在
        if (!data.routes) {
            data.routes = {};
        }
        // 确保 routeCounter 字段存在
        if (!data.routeCounter) {
            data.routeCounter = 0;
        }
        data.version = 1;
    }

    return data;
};

// 预计算统计信息
const precomputeStats = () => {
    const stats = {
        total: Object.keys(markerData).length,
        collected: 0,
        byType: {},
        byCategory: {}
    };

    // 初始化类型和分类统计
    Object.keys(MARKER_CONFIGS).forEach(type => {
        stats.byType[type] = { total: 0, collected: 0 };
        const category = MARKER_CONFIGS[type].category;
        if (!stats.byCategory[category]) {
            stats.byCategory[category] = { total: 0, collected: 0 };
        }
    });

    // 计算统计信息
    Object.values(markerData).forEach(marker => {
        const isCollected = collectedMarkers[marker.id] === true;
        if (isCollected) {
            stats.collected++;
        }

        // 按类型统计
        if (stats.byType[marker.type]) {
            stats.byType[marker.type].total++;
            if (isCollected) {
                stats.byType[marker.type].collected++;
            }
        }

        // 按分类统计
        const category = MARKER_CONFIGS[marker.type]?.category;
        if (category && stats.byCategory[category]) {
            stats.byCategory[category].total++;
            if (isCollected) {
                stats.byCategory[category].collected++;
            }
        }
    });

    precomputedStats = stats;
    lastPrecomputed = Date.now();
};

// 获取预计算的统计信息
const getStats = () => {
    // 如果预计算数据不存在或超过5秒，重新计算
    if (!precomputedStats.total || (Date.now() - lastPrecomputed) > 5000) {
        precomputeStats();
    }
    return precomputedStats;
};

// 检查标记是否已收集
const isMarkerCollected = (markerId) => {
    return collectedMarkers[markerId] === true;
};

// 批量切换收集状态
const batchToggleCollected = (markerIds, collect) => {
    markerIds.forEach(id => {
        collectedMarkers[id] = collect;
    });
    saveCollectedMarkers();
    precomputeStats();
    updateProgressStats();
    
    // 刷新地图上所有标记的显示
    refreshAllMarkers();
    
    // 如果设置为不显示已收集标记，且批量标记为已收集，则更新标记可见性
    if (!showCollectedMarkers && collect) {
        updateMarkerVisibility();
    } else if (!showCollectedMarkers && !collect) {
        // 如果批量取消收集，也需要更新标记可见性
        updateMarkerVisibility();
    }
};

// 清除所有收集状态
const clearCollectedMarkers = () => {
    collectedMarkers = {};
    saveCollectedMarkers();
    precomputeStats();
    updateProgressStats();
    
    // 刷新地图上所有标记的显示
    refreshAllMarkers();
    
    // 如果设置为不显示已收集标记，清除所有收集状态后需要更新标记可见性
    if (!showCollectedMarkers) {
        updateMarkerVisibility();
    }
};

// 刷新地图上所有标记的图标和弹出框
const refreshAllMarkers = () => {
    // 遍历所有标记数据
    Object.values(markerData).forEach(marker => {
        const id = marker.id;
        if (clusterEnabled) {
            markers.eachLayer(layer => {
                if (layer.getPopup() && layer.getPopup().getContent().includes(id)) {
                    layer.setPopupContent(createPopupContent(marker));
                    layer.setIcon(createMarkerIcon(marker.type, id));
                }
            });
        } else {
            map.eachLayer(layer => {
                if (layer instanceof L.Marker && layer.getPopup() && layer.getPopup().getContent().includes(id)) {
                    layer.setPopupContent(createPopupContent(marker));
                    layer.setIcon(createMarkerIcon(marker.type, id));
                }
            });
        }
    });
    
    // 更新统计
    if (typeof updateStats === 'function') {
        updateStats();
    }
};

// 计算收集进度（使用预计算数据）
const calculateProgress = () => {
    const stats = getStats();
    const total = stats.total;
    const collected = stats.collected;
    const percentage = total > 0 ? Math.round((collected / total) * 100) : 0;
    return { total, collected, percentage };
};

// 按类型计算收集进度（使用预计算数据）
const calculateTypeProgress = (type) => {
    const stats = getStats();
    const typeStats = stats.byType[type] || { total: 0, collected: 0 };
    const total = typeStats.total;
    const collected = typeStats.collected;
    const percentage = total > 0 ? Math.round((collected / total) * 100) : 0;
    return { total, collected, percentage };
};

// 按分类计算收集进度（使用预计算数据）
const calculateCategoryProgress = (category) => {
    const stats = getStats();
    const categoryStats = stats.byCategory[category] || { total: 0, collected: 0 };
    const total = categoryStats.total;
    const collected = categoryStats.collected;
    const percentage = total > 0 ? Math.round((collected / total) * 100) : 0;
    return { total, collected, percentage };
};

// 获取所有标记
const getAllMarkers = () => {
    const storageKey = currentMapConfig.storageKey;
    const savedData = localStorage.getItem(storageKey);
    if (savedData) {
        try {
            const data = JSON.parse(savedData);
            // data.markers 是对象，需要转换为数组
            const markersObj = data.markers || {};
            return Object.values(markersObj);
        } catch (e) {
            console.error('加载标记数据失败:', e);
            return [];
        }
    }
    return [];
};

// 显示提示信息
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = type;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// 缩放控制
function zoomIn() {
    map.zoomIn();
    updateZoomSlider();
}

function zoomOut() {
    map.zoomOut();
    updateZoomSlider();
}

// 更新滑动条值
function updateZoomSlider() {
    const slider = document.getElementById('zoom-slider');
    if (slider) {
        slider.value = map.getZoom();
    }
}

// 一键回正到地图中心
window.resetMapCenter = function () {
    if (typeof currentMapConfig !== 'undefined') {
        // flyToBounds 会自动计算最佳全景缩放比例，并自带极度丝滑的飞行过渡动画喵！
        map.flyToBounds([[0, 0], [currentMapConfig.height, currentMapConfig.width]], {
            duration: 0.6, // 0.6秒的飞行时间，优雅从容
            easeLinearity: 0.25
        });
        showToast('已为您切换回全局视野喵！', 'success');
    }
};

// 全图导出
window.exportData = function() {
    // 导出所有地图的完整数据
    const exportData = {
        version: '1.3',
        exportedAt: new Date().toISOString(),
        toolName: '普罗米利亚地图标记工具',
        collectedMarkers: collectedMarkers, // 添加收集状态
        maps: {}
    };
    
    // 先保存当前地图（确保最新数据写入 localStorage）
    saveCurrentMapMarkers();
    
    // 收集所有地图的数据（直接从 localStorage 读取）
    let totalMarkers = 0;
    let totalRoutes = 0;
    Object.keys(MAP_CONFIGS).forEach(mapId => {
        const config = MAP_CONFIGS[mapId];
        const storageKey = config.storageKey;
        
        try {
            const saved = localStorage.getItem(storageKey);
            let markers = [];
            let routes = [];
            
            if (saved) {
                const data = JSON.parse(saved);
                markers = Object.values(data.markers || {});
                routes = Object.values(data.routes || {});
            }
            
            exportData.maps[mapId] = {
                mapName: config.name,
                markers: markers,
                markerCount: markers.length,
                routes: routes,
                routeCount: routes.length
            };
            
            totalMarkers += markers.length;
            totalRoutes += routes.length;
            console.log(`📊 ${config.name}: ${markers.length} 个标记, ${routes.length} 条路线`);
        } catch (e) {
            console.error(`❌ 读取 ${config.name} 失败:`, e);
            exportData.maps[mapId] = {
                mapName: config.name,
                markers: [],
                markerCount: 0,
                routes: [],
                routeCount: 0,
                error: e.message
            };
        }
    });
    
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `promilia-all-maps-${Date.now()}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    
    showToast(`已导出 ${totalMarkers} 个标记和 ${totalRoutes} 条路线（${Object.keys(exportData.maps).length} 张地图）`, 'success');
};

// 单图导出 - 导出当前地图的标记和路线
window.exportSingleMapData = function() {
    // 先保存当前地图数据
    saveCurrentMapMarkers();
    
    const storageKey = currentMapConfig.storageKey;
    const saved = localStorage.getItem(storageKey);
    
    if (!saved) {
        showToast('当前地图没有数据可导出', 'error');
        return;
    }
    
    try {
        const mapData = JSON.parse(saved);
        const markers = Object.values(mapData.markers || {});
        const routes = Object.values(mapData.routes || {});
        
        if (markers.length === 0 && routes.length === 0) {
            showToast('当前地图没有标记或路线可导出', 'error');
            return;
        }
        
        // 构建单图导出数据
        const exportData = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            toolName: '普罗米利亚地图标记工具',
            exportType: 'single-map',
            collectedMarkers: collectedMarkers, // 添加收集状态
            mapInfo: {
                mapId: currentMapId,
                mapName: currentMapConfig.name,
                width: currentMapConfig.width,
                height: currentMapConfig.height
            },
            markers: markers,
            routes: routes,
            markerCount: markers.length,
            routeCount: routes.length
        };
        
        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `promilia-${currentMapId}-${Date.now()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        
        showToast(`已导出 ${markers.length} 个标记和 ${routes.length} 条路线（${currentMapConfig.name}）`, 'success');
        console.log(`📤 单图导出: ${currentMapConfig.name}, ${markers.length} 标记, ${routes.length} 路线`);
    } catch (e) {
        console.error('单图导出失败:', e);
        showToast('导出失败：' + e.message, 'error');
    }
};

// 单图导入 - 导入单图导出的数据到当前地图
window.importSingleMapData = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // 清空文件输入，允许重复选择同一文件
    event.target.value = '';
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importData = JSON.parse(e.target.result);
            
            // 验证数据格式
            if (importData.exportType !== 'single-map') {
                showToast('请选择单图导出的文件格式', 'error');
                return;
            }
            
            if (!importData.mapInfo || !importData.markers) {
                showToast('无效的单图导出文件格式', 'error');
                return;
            }
            
            const sourceMapName = importData.mapInfo.mapName;
            const sourceMapId = importData.mapInfo.mapId;
            const currentMapName = currentMapConfig.name;
            
            // 检查地图差异
            let confirmMessage = '';
            if (sourceMapId !== currentMapId) {
                confirmMessage = `⚠️ 地图差异警告\n\n`;
                confirmMessage += `导入来源：${sourceMapName}\n`;
                confirmMessage += `当前地图：${currentMapName}\n\n`;
                confirmMessage += `地图名称不同，是否仍要导入？\n\n`;
            } else {
                confirmMessage = `确认导入到当前地图\n\n`;
                confirmMessage += `地图：${currentMapName}\n`;
            }
            
            const markerCount = importData.markerCount || importData.markers.length || 0;
            const routeCount = importData.routeCount || (importData.routes ? importData.routes.length : 0);
            confirmMessage += `标记数量：${markerCount} 个\n`;
            confirmMessage += `路线数量：${routeCount} 条\n\n`;
            
            // 检查导入模式
            const importMode = document.querySelector('input[name="import-mode"]:checked').value;
            confirmMessage += `导入模式：${importMode === 'override' ? '覆盖导入（清除现有数据）' : '增量导入（保留现有数据）'}\n\n`;
            confirmMessage += `点击"确定"开始导入`;
            
            if (!confirm(confirmMessage)) {
                return;
            }
            
            // 执行导入
            performSingleMapImport(importData, importMode);
            
        } catch (parseErr) {
            console.error('解析单图导入文件失败:', parseErr);
            showToast('解析文件失败：' + parseErr.message, 'error');
        }
    };
    reader.readAsText(file);
};

// 执行单图导入
function performSingleMapImport(importData, importMode) {
    const storageKey = currentMapConfig.storageKey;
    
    try {
        // 导入收集状态（如果有）
        if (importData.collectedMarkers) {
            if (importMode === 'override') {
                collectedMarkers = importData.collectedMarkers;
            } else {
                Object.assign(collectedMarkers, importData.collectedMarkers);
            }
            saveCollectedMarkers();
            console.log('✅ 导入收集状态');
        }
        
        // 读取现有数据（仅在增量导入时需要）
        let existingData = {};
        if (importMode !== 'override') {
            const saved = localStorage.getItem(storageKey);
            if (saved) {
                existingData = JSON.parse(saved);
            }
        }
        
        // 准备新数据
        const newMarkers = {};
        let counter = 0;
        let importedMarkerCount = 0;
        
        // 处理标记数据
        importData.markers.forEach(marker => {
            // 覆盖导入：导入所有标记
            // 增量导入：只导入不存在的标记
            if (importMode === 'override' || !existingData.markers || !existingData.markers[marker.id]) {
                newMarkers[marker.id] = marker;
                importedMarkerCount++;
            }
            // 更新计数器
            if (marker.id) {
                const idNum = parseInt(marker.id.split('_').pop());
                if (idNum >= counter) {
                    counter = idNum + 1;
                }
            }
        });
        
        // 处理路线数据
        let newRoutes = {};
        let routeCounter = 0;
        let importedRouteCount = 0;
        
        if (importData.routes) {
            importData.routes.forEach(route => {
                // 覆盖导入：导入所有路线
                // 增量导入：只导入不存在的路线
                if (importMode === 'override' || !existingData.routes || !existingData.routes[route.id]) {
                    newRoutes[route.id] = route;
                    importedRouteCount++;
                }
                // 更新路线计数器
                if (route.id) {
                    const idNum = parseInt(route.id.split('_').pop());
                    if (idNum >= routeCounter) {
                        routeCounter = idNum + 1;
                    }
                }
            });
        }
        
        // 保存数据
        if (importMode === 'override') {
            // 覆盖导入：完全替换数据
            existingData = {
                markers: newMarkers,
                counter: counter,
                routes: newRoutes,
                routeCounter: routeCounter,
                version: DATA_VERSION
            };
        } else {
            // 增量导入：合并数据
            if (!existingData.markers) {
                existingData.markers = {};
            }
            Object.assign(existingData.markers, newMarkers);
            if (counter > (existingData.counter || 0)) {
                existingData.counter = counter;
            }
            
            if (!existingData.routes) {
                existingData.routes = {};
            }
            Object.assign(existingData.routes, newRoutes);
            if (routeCounter > (existingData.routeCounter || 0)) {
                existingData.routeCounter = routeCounter;
            }
        }
        
        // 确保版本字段存在
        if (!existingData.version) {
            existingData.version = DATA_VERSION;
        }
        
        localStorage.setItem(storageKey, JSON.stringify(existingData));
        
        // 刷新当前地图显示
        loadMarkersForMap(currentMapId);
        if (typeof loadRoutesForMap === 'function') {
            loadRoutesForMap(currentMapId);
        }
        
        showToast(`成功导入 ${importedMarkerCount} 个标记和 ${importedRouteCount} 条路线到 ${currentMapConfig.name}`, 'success');
        console.log(`📥 单图导入完成: ${importedMarkerCount} 标记, ${importedRouteCount} 路线`);
        
    } catch (e) {
        console.error('单图导入失败:', e);
        showToast('导入失败：' + e.message, 'error');
    }
}

// 全图导入（支持本地导出文件和云端备份文件）
window.importData = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importData = JSON.parse(e.target.result);
            
            // 检查导入模式
            const importMode = document.querySelector('input[name="import-mode"]:checked').value;
            
            let totalImported = 0;
            let totalRoutesImported = 0;
            let mapsImported = 0;
            
            // 导入收集状态（如果有）
            if (importData.collectedMarkers) {
                if (importMode === 'override') {
                    collectedMarkers = importData.collectedMarkers;
                } else {
                    Object.assign(collectedMarkers, importData.collectedMarkers);
                }
                saveCollectedMarkers();
                console.log('✅ 导入收集状态');
            }
            
            // 导入每个地图的数据
            if (importData.maps) {
                Object.keys(importData.maps).forEach(mapId => {
                    const mapData = importData.maps[mapId];
                    const config = MAP_CONFIGS[mapId];
                    
                    if (config) {
                        const storageKey = config.storageKey;
                        
                        try {
                            // 读取现有数据（仅在增量导入时需要）
                            let existingData = {};
                            if (importMode !== 'override') {
                                const saved = localStorage.getItem(storageKey);
                                if (saved) {
                                    existingData = JSON.parse(saved);
                                }
                            }
                            
                            // 准备新数据
                            const newMarkers = {};
                            let counter = 0;
                            
                            // 处理标记数据
                            mapData.markers.forEach(marker => {
                                // 覆盖导入：导入所有标记
                                // 增量导入：只导入不存在的标记
                                if (importMode === 'override' || !existingData.markers || !existingData.markers[marker.id]) {
                                    newMarkers[marker.id] = marker;
                                    totalImported++;
                                }
                                // 更新计数器
                                if (marker.id) {
                                    const idNum = parseInt(marker.id.split('_').pop());
                                    if (idNum >= counter) {
                                        counter = idNum + 1;
                                    }
                                }
                            });
                            
                            // 处理路线数据
                            let newRoutes = {};
                            let routeCounter = 0;
                            
                            if (mapData.routes) {
                                mapData.routes.forEach(route => {
                                    // 覆盖导入：导入所有路线
                                    // 增量导入：只导入不存在的路线
                                    if (importMode === 'override' || !existingData.routes || !existingData.routes[route.id]) {
                                        newRoutes[route.id] = route;
                                        totalRoutesImported++;
                                    }
                                    // 更新路线计数器
                                    if (route.id) {
                                        const idNum = parseInt(route.id.split('_').pop());
                                        if (idNum >= routeCounter) {
                                            routeCounter = idNum + 1;
                                        }
                                    }
                                });
                            }
                            
                            // 保存数据
                            if (importMode === 'override') {
                                // 覆盖导入：完全替换数据
                                existingData = {
                                    markers: newMarkers,
                                    counter: counter,
                                    routes: newRoutes,
                                    routeCounter: routeCounter,
                                    version: DATA_VERSION
                                };
                            } else {
                                // 增量导入：合并数据
                                if (!existingData.markers) {
                                    existingData.markers = {};
                                }
                                Object.assign(existingData.markers, newMarkers);
                                if (counter > (existingData.counter || 0)) {
                                    existingData.counter = counter;
                                }
                                
                                if (!existingData.routes) {
                                    existingData.routes = {};
                                }
                                Object.assign(existingData.routes, newRoutes);
                                if (routeCounter > (existingData.routeCounter || 0)) {
                                    existingData.routeCounter = routeCounter;
                                }
                                
                                // 确保版本字段存在
                                if (!existingData.version) {
                                    existingData.version = DATA_VERSION;
                                }
                            }
                            
                            localStorage.setItem(storageKey, JSON.stringify(existingData));
                            mapsImported++;
                            
                            console.log(`✅ 导入 ${mapData.markers.length} 个标记到 ${config.name}`);
                        } catch (e) {
                            console.error(`❌ 导入 ${config.name} 失败:`, e);
                        }
                    }
                });
            } else if (importData.markers) {
                // 兼容旧版单地图格式
                const storageKey = currentMapConfig.storageKey;
                
                try {
                    let existingData = {};
                    const saved = localStorage.getItem(storageKey);
                    if (saved) {
                        existingData = JSON.parse(saved);
                    }
                    
                    const newMarkers = {};
                    let counter = existingData.counter || 0;
                    
                    importData.markers.forEach(marker => {
                        if (importMode === 'override' || !existingData.markers || !existingData.markers[marker.id]) {
                            newMarkers[marker.id] = marker;
                            totalImported++;
                            // 更新计数器
                            if (marker.id) {
                                const idNum = parseInt(marker.id.split('_').pop());
                                if (idNum >= counter) {
                                    counter = idNum + 1;
                                }
                            }
                        }
                    });
                    
                    // 处理路线数据（旧版格式可能没有路线）
                    let newRoutes = {};
                    let routeCounter = existingData.routeCounter || 0;
                    
                    if (importData.routes) {
                        importData.routes.forEach(route => {
                            if (importMode === 'override' || !existingData.routes || !existingData.routes[route.id]) {
                                newRoutes[route.id] = route;
                                totalRoutesImported++;
                                // 更新路线计数器
                                if (route.id) {
                                    const idNum = parseInt(route.id.split('_').pop());
                                    if (idNum >= routeCounter) {
                                        routeCounter = idNum + 1;
                                    }
                                }
                            }
                        });
                    }
                    
                    if (importMode === 'override') {
                        existingData.markers = newMarkers;
                        existingData.counter = counter;
                        existingData.routes = newRoutes;
                        existingData.routeCounter = routeCounter;
                    } else {
                        if (!existingData.markers) {
                            existingData.markers = {};
                        }
                        Object.assign(existingData.markers, newMarkers);
                        if (counter > (existingData.counter || 0)) {
                            existingData.counter = counter;
                        }
                        
                        if (!existingData.routes) {
                            existingData.routes = {};
                        }
                        Object.assign(existingData.routes, newRoutes);
                        if (routeCounter > (existingData.routeCounter || 0)) {
                            existingData.routeCounter = routeCounter;
                        }
                    }
                    
                    if (!existingData.version) {
                        existingData.version = DATA_VERSION;
                    }
                    
                    localStorage.setItem(storageKey, JSON.stringify(existingData));
                    mapsImported++;
                    
                    console.log(`✅ 导入 ${importData.markers.length} 个标记到当前地图`);
                } catch (e) {
                    console.error('❌ 导入失败:', e);
                }
            }
            
            showToast(`已导入 ${totalImported} 个标记和 ${totalRoutesImported} 条路线（${mapsImported} 张地图）`, 'success');
            
            // 重新加载当前地图
            loadMarkersForMap(currentMapId);
        } catch (e) {
            console.error('❌ 解析导入文件失败:', e);
            showToast('导入失败：文件格式错误', 'error');
        }
    };
    reader.readAsText(file);
};
