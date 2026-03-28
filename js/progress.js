/**
 * 收集进度统计和批量收集功能
 */

// 初始化标记类型下拉列表
function initBatchTypeSelect() {
    const selectEl = document.getElementById('batch-type-select');
    if (!selectEl) return;

    // 清空现有选项（保留"全部类型"）
    while (selectEl.options.length > 1) {
        selectEl.remove(1);
    }

    // 按分类组织标记类型
    const categories = {};
    Object.keys(MARKER_CONFIGS).forEach(type => {
        const config = MARKER_CONFIGS[type];
        const category = config.category || 'other';
        if (!categories[category]) {
            categories[category] = [];
        }
        categories[category].push({ type, name: config.label });
    });

    // 添加分类和类型选项
    Object.keys(categories).forEach(category => {
        // 添加分类分隔符
        const optgroup = document.createElement('optgroup');
        optgroup.label = CATEGORY_CONFIGS[category].label;
        selectEl.appendChild(optgroup);

        // 添加该分类下的所有类型
        categories[category].forEach(item => {
            const option = document.createElement('option');
            option.value = item.type;
            option.textContent = item.name;
            optgroup.appendChild(option);
        });
    });
}

// 按类型批量收集标记
window.batchCollectByType = function() {
    const selectEl = document.getElementById('batch-type-select');
    if (!selectEl) return;

    const selectedType = selectEl.value;
    const markerIds = [];

    // 收集指定类型的标记
    Object.values(markerData).forEach(marker => {
        if (selectedType === 'all' || marker.type === selectedType) {
            markerIds.push(marker.id);
        }
    });

    if (markerIds.length === 0) {
        showToast('没有找到指定类型的标记', 'error');
        return;
    }

    batchToggleCollected(markerIds, true);
    updateStats();
    showToast(`已收集 ${markerIds.length} 个标记`, 'success');
};

// 按类型批量取消收集标记
window.batchUncollectByType = function() {
    const selectEl = document.getElementById('batch-type-select');
    if (!selectEl) return;

    const selectedType = selectEl.value;
    const markerIds = [];

    // 收集指定类型的标记
    Object.values(markerData).forEach(marker => {
        if (selectedType === 'all' || marker.type === selectedType) {
            markerIds.push(marker.id);
        }
    });

    if (markerIds.length === 0) {
        showToast('没有找到指定类型的标记', 'error');
        return;
    }

    batchToggleCollected(markerIds, false);
    updateStats();
    showToast(`已取消 ${markerIds.length} 个标记的收集状态`, 'success');
};

// 批量收集所有标记
window.batchCollectAll = function() {
    const allMarkers = getAllMarkers();
    const markerIds = allMarkers.map(marker => marker.id);
    batchToggleCollected(markerIds, true);
    updateStats(); // 更新分类统计面板
    showToast('已标记所有标记为已收集', 'success');
};

// 批量取消所有收集
window.batchUncollectAll = function() {
    const allMarkers = getAllMarkers();
    const markerIds = allMarkers.map(marker => marker.id);
    batchToggleCollected(markerIds, false);
    updateStats(); // 更新分类统计面板
    showToast('已取消所有标记的收集状态', 'success');
};

// 更新进度统计显示
const updateProgressStats = () => {
    const progress = calculateProgress();
    const progressElement = document.getElementById('collection-progress');
    if (progressElement) {
        progressElement.innerHTML = `
            <div style="margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; font-size: 0.85em; margin-bottom: 4px;">
                    <span>收集进度</span>
                    <span>${progress.collected}/${progress.total} (${progress.percentage}%)</span>
                </div>
                <div style="height: 6px; background: #0f3460; border-radius: 3px; overflow: hidden;">
                    <div style="height: 100%; width: ${progress.percentage}%; background: #00d9ff; transition: width 0.3s ease;"></div>
                </div>
            </div>
        `;
    }

    // 更新按类型的进度
    const typeProgressElement = document.getElementById('type-progress');
    if (typeProgressElement) {
        let html = '';
        Object.keys(MARKER_CONFIGS).forEach(type => {
            const typeProgress = calculateTypeProgress(type);
            if (typeProgress.total > 0) {
                html += `
                    <div style="margin-bottom: 6px;">
                        <div style="display: flex; justify-content: space-between; font-size: 0.75em; margin-bottom: 2px;">
                            <span>${MARKER_CONFIGS[type].label}</span>
                            <span>${typeProgress.collected}/${typeProgress.total}</span>
                        </div>
                        <div style="height: 4px; background: #0f3460; border-radius: 2px; overflow: hidden;">
                            <div style="height: 100%; width: ${typeProgress.percentage}%; background: ${MARKER_CONFIGS[type].color}; transition: width 0.3s ease;"></div>
                        </div>
                    </div>
                `;
            }
        });
        typeProgressElement.innerHTML = html;
    }

    // 更新按分类的进度
    const categoryProgressElement = document.getElementById('category-progress');
    if (categoryProgressElement) {
        let html = '';
        Object.keys(CATEGORY_CONFIGS).forEach(category => {
            const categoryProgress = calculateCategoryProgress(category);
            if (categoryProgress.total > 0) {
                html += `
                    <div style="margin-bottom: 6px;">
                        <div style="display: flex; justify-content: space-between; font-size: 0.75em; margin-bottom: 2px;">
                            <span>${CATEGORY_CONFIGS[category].label}</span>
                            <span>${categoryProgress.collected}/${categoryProgress.total}</span>
                        </div>
                        <div style="height: 4px; background: #0f3460; border-radius: 2px; overflow: hidden;">
                            <div style="height: 100%; width: ${categoryProgress.percentage}%; background: ${CATEGORY_CONFIGS[category].color}; transition: width 0.3s ease;"></div>
                        </div>
                    </div>
                `;
            }
        });
        categoryProgressElement.innerHTML = html;
    }
};
