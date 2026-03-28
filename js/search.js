/**
 * 标记搜索、关键词高亮、追踪
 */

// 备注搜索与全局追踪核心引擎
window.searchMarkers = function () {
    const keyword = document.getElementById('marker-search-input').value.trim().toLowerCase();
    const resultsContainer = document.getElementById('search-results');

    if (!keyword) {
        resultsContainer.innerHTML = '<div style="color: #888; font-size: 0.8em; text-align: center; padding: 10px;">请输入关键词进行搜索喵~</div>';
        return;
    }

    let resultsHTML = '';
    let count = 0;

    // 遍历当前地图的所有标记
    Object.values(markerData).forEach(marker => {
        // 只搜索有备注且包含关键词的标记
        if (marker.note && marker.note.toLowerCase().includes(keyword)) {
            count++;
            const config = MARKER_CONFIGS[marker.type] || { label: '未知', color: '#999', icon: 'fa-question' };

            // 高亮关键词的小黑科技
            const highlightedNote = marker.note.replace(new RegExp(keyword, 'gi'), match => `<span style="color: #e94560; font-weight: bold; background: rgba(233,69,96,0.2); border-radius: 2px;">${match}</span>`);

            resultsHTML += `
                        <div onclick="focusSearchResult('${marker.id}')" style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px; border-left: 4px solid ${config.color}; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'; this.style.transform='translateX(2px)';" onmouseout="this.style.background='rgba(255,255,255,0.05)'; this.style.transform='translateX(0)';">
                                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <i class="fas ${config.icon}" style="color: ${config.color}; font-size: 1.1em;"></i>
                                            <span style="font-weight: bold; color: #eee; font-size: 0.9em;">${config.label}</span>
                                        </div>
                                        <i class="fas fa-location-arrow" style="color: #00d9ff; font-size: 0.8em; opacity: 0.6;"></i>
                                    </div>
                                    <div style="color: #aaa; font-size: 0.85em; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                                        ${highlightedNote}
                                    </div>
                                </div>
                            `;
        }
    });

    if (count === 0) {
        resultsContainer.innerHTML = '<div style="color: #f39c12; font-size: 0.85em; text-align: center; padding: 15px;"><i class="fas fa-ghost" style="font-size: 2em; margin-bottom: 10px; opacity: 0.5; display: block;"></i>未找到匹配的备注内容！</div>';
    } else {
        resultsContainer.innerHTML = `<div style="color: #00d9ff; font-size: 0.8em; margin-bottom: 8px; padding-left: 5px;"><i class="fas fa-crosshairs"></i> 侦测到 ${count} 个目标：</div>` + resultsHTML;
    }
};

// 监听输入框的回车键，丝滑触发搜索
document.getElementById('marker-search-input').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') searchMarkers();
});

// 追踪引擎：点击列表自动平移、破开聚合簇并打开弹窗
window.focusSearchResult = function (id) {
    const markerInfo = markerData[id];
    if (!markerInfo) return;

    // 防呆设计：如果当前类型被筛选器隐藏了，拦截并提示
    if (!filterState[markerInfo.type]) {
        showToast('该标记目前被【筛选显示】隐藏了，请先勾选显示该类型喵！', 'error');
        // 给对应的分类头部闪烁一下提示
        const config = MARKER_CONFIGS[markerInfo.type];
        if (config && config.category) {
            const header = document.querySelector(`.category-header[data-category="${config.category}-filter"]`);
            if (header) {
                header.style.background = '#e94560';
                setTimeout(() => header.style.background = '#0f3460', 500);
            }
        }
        return;
    }

    // 第一阶段：战术飞行（平滑移动视角，缩放到能看清的级别）
    map.flyTo([markerInfo.lat, markerInfo.lng], 1, { duration: 1.5 });

    // 第二阶段：精准打击（等飞行动画快结束时触发）
    setTimeout(() => {
        let targetLayer = null;

        if (clusterEnabled) {
            // 聚合模式：深潜寻找（支持破开层层叠加的 Cluster）
            markers.eachLayer(layer => {
                if (layer.getPopup() && layer.getPopup().getContent().includes(id)) {
                    targetLayer = layer;
                }
            });

            if (targetLayer) {
                // 终极黑科技：利用 MarkerCluster 原生的 zoomToShowLayer 方法
                // 它会自动放大并拨开周围聚集的标记，然后我们给它加上 openPopup
                markers.zoomToShowLayer(targetLayer, () => {
                    targetLayer.openPopup();
                });
            }
        } else {
            // 非聚合模式：直接遍历地图表层
            map.eachLayer(layer => {
                if (layer instanceof L.Marker && layer.getPopup() && layer.getPopup().getContent().includes(id)) {
                    targetLayer = layer;
                }
            });
            if (targetLayer) targetLayer.openPopup();
        }
    }, 1600); // 给 flyTo 动画留足时间
};
