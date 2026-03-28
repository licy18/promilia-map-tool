/**
 * 筛选功能、分类折叠
 */

// 为所有标记类型初始化筛选状态（默认全部启用）
if (!filterState.all) {
    filterState.all = true;
}
Object.keys(MARKER_CONFIGS).forEach(type => {
    if (filterState[type] === undefined) {
        filterState[type] = true;
    }
});

// 分类展开状态（用于 UI）- 默认全折叠，优先从本地读取记忆
const defaultCategoryExpanded = {
    'chest': false,
    'explore': false,
    'creature': false,
    'chipo': false,
    'puzzle': false,
    'other': false,
    'chest-filter': false,
    'explore-filter': false,
    'creature-filter': false,
    'chipo-filter': false,
    'puzzle-filter': false,
    'other-filter': false
};
// 合并默认值和本地存储值
Object.keys(defaultCategoryExpanded).forEach(key => {
    if (categoryExpanded[key] === undefined) {
        categoryExpanded[key] = defaultCategoryExpanded[key];
    }
});

// 筛选器点击事件（支持分类折叠）- 只匹配筛选器区域内的元素
document.querySelectorAll('#filter-types .marker-type').forEach(el => {
    el.addEventListener('click', function (e) {
        e.stopPropagation();  // 防止触发分类折叠
        const type = this.dataset.type;

        if (type === 'all') {
            // 点击"全部"：切换所有筛选
            const newState = !filterState.all;
            Object.keys(filterState).forEach(k => {
                if (k !== 'all') filterState[k] = newState;
            });
            filterState.all = newState;
            document.querySelectorAll('#filter-types .marker-type').forEach(e => {
                e.classList.toggle('active', newState);
            });
        } else {
            // 点击具体类型：切换该类型
            filterState[type] = !filterState[type];
            this.classList.toggle('active');

            // 更新"全部"状态
            const allActive = Object.values(filterState).every(v => v);
            filterState.all = allActive;
            document.querySelector('#filter-types .marker-type[data-type="all"]').classList.toggle('active', allActive);
        }

        updateMarkerVisibility();
        saveFilterState();
        console.log(`🔍 筛选状态：`, filterState);
    });
});

// 分类折叠初始化与事件监听
document.querySelectorAll('.category-header').forEach(header => {
    const category = header.dataset.category;
    const content = document.querySelector(`.category-content[data-category="${category}"]`);

    // 1. 网页加载瞬间：根据本地记忆或默认状态，自动应用折叠/展开样式
    if (categoryExpanded[category]) {
        header.classList.remove('collapsed');
        content.classList.remove('collapsed');
    } else {
        header.classList.add('collapsed');
        content.classList.add('collapsed');
    }

    // 2. 绑定点击事件：点击后立刻将新状态存入本地缓存
    header.addEventListener('click', function () {
        // 切换展开/折叠状态
        this.classList.toggle('collapsed');
        content.classList.toggle('collapsed');

        // 获取当前最新状态并存入字典
        const isExpanded = !this.classList.contains('collapsed');
        categoryExpanded[category] = isExpanded;

        // 写入 localStorage (仅保存在本地)
        localStorage.setItem('promilia-category-expanded', JSON.stringify(categoryExpanded));

        console.log(`📂 分类 ${category}: ${isExpanded ? '展开' : '折叠'} (已保存至本地)`);
    });
});

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
                    icon: createMarkerIcon(data.type, data.id)
                });
                marker.bindPopup(createPopupContent(data));
                data.popup = marker.getPopup(); // <=== 【新增修复：交接遥控器】
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
                    icon: createMarkerIcon(data.type, data.id)
                });
                marker.bindPopup(createPopupContent(data));
                data.popup = marker.getPopup(); // <=== 【新增修复：交接遥控器】
                map.addLayer(marker);
            }
        });
    }
}

// 聚合开关事件监听（Issue #1）
const clusterToggle = document.getElementById('cluster-toggle');
if (clusterToggle) {
    // 设置初始状态
    clusterToggle.checked = clusterEnabled;

    // 监听开关变化
    clusterToggle.addEventListener('change', function () {
        clusterEnabled = this.checked;
        localStorage.setItem('promilia-cluster-enabled', clusterEnabled);

        if (clusterEnabled) {
            // 启用聚合：将标记移到集群
            console.log('✅ 启用标记聚合');
            map.eachLayer(layer => {
                if (layer instanceof L.Marker) {
                    map.removeLayer(layer);
                    markers.addLayer(layer);
                }
            });
            map.addLayer(markers);
            showToast('已启用标记聚合', 'success');
        } else {
            // 禁用聚合：将标记移到地图
            console.log('⚠️ 禁用标记聚合（标记将直接显示在地图上）');
            markers.eachLayer(layer => {
                markers.removeLayer(layer);
                map.addLayer(layer);
            });
            map.removeLayer(markers);
            showToast('已禁用标记聚合', 'success');
        }
        console.log('✅ 聚合开关已初始化');
    });
}
