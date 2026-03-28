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
};

// 清除所有收集状态
const clearCollectedMarkers = () => {
    collectedMarkers = {};
    saveCollectedMarkers();
    precomputeStats();
    updateProgressStats();
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
