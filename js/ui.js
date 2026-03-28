/**
 * UI 交互相关函数
 */

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

// 更新最后保存时间
function updateLastSaved() {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    document.getElementById('last-saved').textContent = time;
}

// 更新统计信息
function updateStats() {
    const total = Object.keys(markerData).length;
    document.getElementById('total-markers').textContent = total;
    document.getElementById('current-map-count').textContent = total;

    // 按分类统计（总数和已收集数）
    const counts = {
        chest: { total: 0, collected: 0 },      // 宝箱类
        puzzle: { total: 0, collected: 0 },      // 解谜类
        explore: { total: 0, collected: 0 },    // 探索类
        chipo: { total: 0, collected: 0 },      // 奇波类
        creature: { total: 0, collected: 0 },   // 生物类
        other: { total: 0, collected: 0 }       // 其他
    };

    Object.values(markerData).forEach(m => {
        const config = MARKER_CONFIGS[m.type];
        if (config && config.category) {
            counts[config.category].total++;
            if (isMarkerCollected(m.id)) {
                counts[config.category].collected++;
            }
        }
    });

    // 更新分类统计显示（格式：已收集/总数）
    const chestEl = document.getElementById('count-chest');
    const puzzleEl = document.getElementById('count-puzzle');
    const exploreEl = document.getElementById('count-explore');
    const chipoEl = document.getElementById('count-chipo');
    const creatureEl = document.getElementById('count-creature');
    const otherEl = document.getElementById('count-other');

    if (chestEl) chestEl.textContent = `${counts.chest.collected}/${counts.chest.total}`;
    if (puzzleEl) puzzleEl.textContent = `${counts.puzzle.collected}/${counts.puzzle.total}`;
    if (exploreEl) exploreEl.textContent = `${counts.explore.collected}/${counts.explore.total}`;
    if (chipoEl) chipoEl.textContent = `${counts.chipo.collected}/${counts.chipo.total}`;
    if (creatureEl) creatureEl.textContent = `${counts.creature.collected}/${counts.creature.total}`;
    if (otherEl) otherEl.textContent = `${counts.other.collected}/${counts.other.total}`;

    console.log('[updateStats] 分类统计已更新:', counts);
}

// 保存筛选状态到 localStorage
function saveFilterState() {
    localStorage.setItem('promilia-filter-state', JSON.stringify(filterState));
}

// 更新筛选器 UI 显示
function updateFilterUI() {
    document.querySelectorAll('#filter-types .marker-type').forEach(el => {
        const type = el.dataset.type;
        const isActive = filterState[type];
        el.classList.toggle('active', isActive);
    });
}
