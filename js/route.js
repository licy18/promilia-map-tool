/**
 * 路线绘制、撤销、渲染、存储
 */

// 获取路线开关元素（全局可访问）
function getRouteToggle() {
    return document.getElementById('route-mode-toggle');
}

// 初始化路线相关事件（在 main.js 中调用）
function initRouteEvents() {
    // 监听路线开关
    const routeToggle = getRouteToggle();
    const routeTools = document.getElementById('route-tools');

    if (!routeToggle) {
        console.warn('⚠️ 路线开关元素未找到');
        return;
    }

    routeToggle.addEventListener('change', function () {
        const isRouteMode = this.checked;

        if (isRouteMode) {
            // === 修改 1：互斥逻辑 -> 打开路线模式时，强制关闭浏览模式 ===
            const browseToggle = document.getElementById('browse-mode-toggle');
            if (browseToggle && browseToggle.checked) {
                browseToggle.checked = false;
            }
            // === 修改 2：清除选中的宝箱标记，确保不会乱点 ===
            document.querySelectorAll('#marker-types .marker-type').forEach(e => e.classList.remove('active'));
            currentMarkerType = null;

            const tipEl = document.getElementById('marker-tip');
            if (tipEl) {
                tipEl.textContent = '当前为路线绘制模式';
                tipEl.style.color = '#FF3333';
            }

            if (routeTools) routeTools.style.display = 'block'; // 显示颜色面板
            const routeDrawPanel = document.getElementById('route-draw-panel');
            if (routeDrawPanel) routeDrawPanel.style.display = 'flex'; // 【新增】显示悬浮控制台
            showToast('已进入路线绘制模式', 'success');
        } else {
            if (routeTools) routeTools.style.display = 'none'; // 隐藏颜色面板
            const routeDrawPanel = document.getElementById('route-draw-panel');
            if (routeDrawPanel) routeDrawPanel.style.display = 'none'; // 【新增】隐藏悬浮控制台

            // === 【新增 v3.7】中途被关闭画笔（或被其他操作强行切断）时，无情清空未保存的路线！ ===
            if (typeof currentRoutePoints !== 'undefined' && currentRoutePoints.length > 0) {
                if (currentRouteLine) map.removeLayer(currentRouteLine);
                if (currentRouteDecorator) map.removeLayer(currentRouteDecorator);
                if (currentRouteStartMarker) map.removeLayer(currentRouteStartMarker);

                currentRoutePoints = [];
                currentRouteLine = null;
                currentRouteDecorator = null;
                currentRouteStartMarker = null;

                showToast('未保存，本次绘线已自动清空喵！', 'error');
            }
            // =========================================================================
        }
        // === 核心黑科技修复：关闭画笔时，让所有隐形判定线"变空气"，允许鼠标穿透！ ===
        Object.values(allRoutes).forEach(route => {
            if (route.hitArea && route.hitArea.getElement()) {
                route.hitArea.getElement().style.pointerEvents = isRouteMode ? 'visiblePainted' : 'none';
            }
        });
    });

    // 监听颜色选择
    document.querySelectorAll('.route-color-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            // 移除所有按钮的 active 状态
            document.querySelectorAll('.route-color-btn').forEach(b => b.classList.remove('active'));
            // 给当前点的按钮加上 active
            this.classList.add('active');
            // 保存选中的颜色
            currentRouteColor = this.dataset.color;
            console.log('🎨 选择路线颜色：', currentRouteColor);
        });
    });
}

// === 新增：路线绘制的核心变量与按钮逻辑 ===

// === 新增：撤销与完成逻辑 ===
window.undoLastRoutePoint = function () {
    if (currentRoutePoints.length === 0) return;

    currentRoutePoints.pop(); // 移除最后一个坐标

    // 如果只剩下一个点（只有起点圆点）
    if (currentRoutePoints.length === 1) {
        if (currentRouteLine) map.removeLayer(currentRouteLine);
        if (currentRouteDecorator) map.removeLayer(currentRouteDecorator);
        currentRouteLine = null;
        currentRouteDecorator = null;
    }
    // 如果一个点都没了
    else if (currentRoutePoints.length === 0) {
        if (currentRouteStartMarker) map.removeLayer(currentRouteStartMarker);
        currentRouteStartMarker = null;
    }
    // 还有线段，重新渲染
    else {
        if (currentRouteLine) {
            currentRouteLine.setLatLngs(currentRoutePoints);
            // 重新生成箭头
            if (currentRouteDecorator) map.removeLayer(currentRouteDecorator);
            currentRouteDecorator = L.polylineDecorator(currentRouteLine, {
                patterns: [
                    { offset: 25, repeat: 60, symbol: L.Symbol.arrowHead({ pixelSize: 15, polygon: false, pathOptions: { stroke: true, weight: 3, color: currentRouteColor } }) }
                ]
            }).addTo(map);
        }
    }
    showToast('已撤销上一个点喵~', 'info');
    // 【新增：撤回后重新计算粗细】
    if (typeof updateAllRoutesThickness === 'function') updateAllRoutesThickness();
};

// === 修复：全局安全的完成绘制逻辑 ===
window.finishRouteDrawing = function () {
    if (currentRoutePoints.length < 2) {
        showToast('路线至少需要两个节点哦！', 'error');
        return;
    }

    // 弹窗询问路线名称
    let defaultName = '路线 ' + (Object.keys(allRoutes).length + 1);
    let routeName = prompt('请给这条路线起个响亮的名字吧：', defaultName);

    // 如果用户点了取消，说明他还没画完，直接 return 让他继续画
    if (routeName === null) return;
    if (routeName.trim() === '') routeName = '未命名路线';

    const routeId = 'route_' + Date.now() + '_' + routeCounter++;

    // 保存到内存中，并多存一个 name 和 visible 状态
    allRoutes[routeId] = {
        id: routeId,
        name: routeName,
        line: currentRouteLine,
        decorator: currentRouteDecorator,
        color: currentRouteColor,
        visible: true // 默认可见
    };

    // 清理起点提示标记
    if (currentRouteStartMarker) map.removeLayer(currentRouteStartMarker);

    // 清空画笔状态
    currentRoutePoints = [];
    currentRouteLine = null;
    currentRouteDecorator = null;
    currentRouteStartMarker = null;

    // 刷新侧边栏列表并保存！
    renderRouteList();
    saveToLocalStorage();
    showToast(`路线 [${routeName}] 保存成功！`, 'success');

    // 顺便把画笔开关关掉，自动收起面板，体验丝滑
    const routeToggle = getRouteToggle();
    if (routeToggle && routeToggle.checked) {
        routeToggle.checked = false;
        routeToggle.dispatchEvent(new Event('change'));
    }
};

// === 修复：全局安全的取消绘制逻辑 ===
window.cancelRouteDrawing = function () {
    if (currentRouteLine) map.removeLayer(currentRouteLine);
    if (currentRouteDecorator) map.removeLayer(currentRouteDecorator);
    if (currentRouteStartMarker) map.removeLayer(currentRouteStartMarker);

    currentRoutePoints = [];
    currentRouteLine = null;
    currentRouteDecorator = null;
    currentRouteStartMarker = null;

    showToast('已清空当前画笔', 'info');

    // 取消画线时，也顺便把侧边栏开关关掉
    const routeToggle = getRouteToggle();
    if (routeToggle && routeToggle.checked) {
        routeToggle.checked = false;
        routeToggle.dispatchEvent(new Event('change'));
    }
};

// === 新增：渲染路线列表与交互的核心函数 ===
function renderRouteList() {
    const listContainer = document.getElementById('route-list');
    const countDisplay = document.getElementById('route-count-display');
    const routes = Object.values(allRoutes);

    countDisplay.textContent = `${routes.length} 条`;

    if (routes.length === 0) {
        listContainer.innerHTML = '<div style="color: #888; font-size: 0.8em; text-align: center; padding: 10px;">暂无已保存的路线</div>';
        return;
    }

    let html = '';
    // 倒序排列，让最新画的路线在最上面
    routes.slice().reverse().forEach(route => {
        const eyeIcon = route.visible ? 'fa-eye' : 'fa-eye-slash';
        const eyeColor = route.visible ? '#00d9ff' : '#888';
        const nameColor = route.visible ? '#eee' : '#666';

        html += `
                <div style="display: flex; justify-content: space-between; align-items: center; background: #1a2a4a; padding: 8px 10px; border-radius: 6px; border-left: 4px solid ${route.color};">
                    <span style="font-size: 0.85em; color: ${nameColor}; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: 0.2s;" title="${route.name}">${route.name}</span>
                    <div style="display: flex; gap: 12px; margin-left: 10px;">
                        <i class="fas ${eyeIcon}" style="color: ${eyeColor}; cursor: pointer; transition: 0.2s;" onclick="toggleRoute('${route.id}')" title="显示/隐藏"></i>
                        <i class="fas fa-trash" style="color: #e94560; cursor: pointer; transition: 0.2s;" onclick="deleteRoute('${route.id}')" title="删除路线"></i>
                    </div>
                </div>
            `;
    });
    listContainer.innerHTML = html;
}

// 切换路线显示/隐藏
window.toggleRoute = function (id) {
    const route = allRoutes[id];
    if (!route) return;

    route.visible = !route.visible; // 状态反转

    // 根据状态在地图上添加或移除
    if (route.visible) {
        map.addLayer(route.line);
        map.addLayer(route.decorator);
    } else {
        map.removeLayer(route.line);
        map.removeLayer(route.decorator);
    }
    renderRouteList(); // 刷新 UI（改变眼睛图标和文字颜色）
    saveToLocalStorage();
};

// 在列表里删除路线
window.deleteRoute = function (id) {
    if (confirm(`确定要彻底删除路线 [${allRoutes[id].name}] 吗？`)) {
        const route = allRoutes[id];
        // 如果在地图上显示着，就先从地图上拔掉
        if (route.visible) {
            map.removeLayer(route.line);
            map.removeLayer(route.decorator);
        }
        // 从内存中删掉数据
        delete allRoutes[id];
        renderRouteList(); // 刷新 UI
        saveToLocalStorage();
        showToast('路线已删除', 'success');
    }
};

// 绑定地图点击事件（在 main.js 初始化后调用）
function bindRouteEvents() {
    // 地图点击事件 - 路线绘制处理
    map.on('click', function (e) {
        // 先获取当前的交互模式状态
        const routeToggle = document.getElementById('route-mode-toggle');
        const isRouteMode = routeToggle && routeToggle.checked;
        const isCurrentlyBrowseMode = document.getElementById('browse-mode-toggle').checked;

        // === 【修改 v3.7】：温和版宇宙边界安检口喵！ ===
        if (e.latlng.lat < 0 || e.latlng.lat > currentMapConfig.width ||
            e.latlng.lng < 0 || e.latlng.lng > currentMapConfig.height) {

            // 只有当用户"真的想干活"（正在画线，或者关闭了浏览模式且选好了标记）时，点到外面才弹窗提示
            if (isRouteMode || (!isCurrentlyBrowseMode && currentMarkerType)) {
                showToast('点到地图外面去啦，请在有效范围内操作哦~', 'error');
            }
            // 如果是纯浏览模式，或者是没选标记到处乱点，那就安静地拦截，绝不打扰！
            return;
        }
        // ========================================================

        // === 新增：如果在路线绘制模式下，拦截点击去画线！ ===
        if (isRouteMode) {
            currentRoutePoints.push(e.latlng);

            // 清除旧的临时线、箭头和起点标记
            if (currentRouteLine) map.removeLayer(currentRouteLine);
            if (currentRouteDecorator) map.removeLayer(currentRouteDecorator);
            if (currentRouteStartMarker) map.removeLayer(currentRouteStartMarker);

            // 如果只有一个点，画一个圆点作为起点反馈！
            if (currentRoutePoints.length === 1) {
                currentRouteStartMarker = L.circleMarker(currentRoutePoints[0], {
                    radius: 6,
                    color: '#fff',
                    weight: 2,
                    fillColor: currentRouteColor,
                    fillOpacity: 1
                }).addTo(map);
            }
            // 如果有两个及以上的点，画线和箭头
            else {
                currentRouteLine = L.polyline(currentRoutePoints, {
                    color: currentRouteColor,
                    weight: 6,
                    opacity: 1.0
                }).addTo(map);

                currentRouteDecorator = L.polylineDecorator(currentRouteLine, {
                    patterns: [
                        { offset: 25, repeat: 60, symbol: L.Symbol.arrowHead({ pixelSize: 15, polygon: false, pathOptions: { stroke: true, weight: 3, color: currentRouteColor } }) }
                    ]
                }).addTo(map);
            }

            // 【新增：刚画下去就立刻应用当前缩放比例的粗细】
            if (typeof updateAllRoutesThickness === 'function') updateAllRoutesThickness();
            return; // 拦截成功！
        }
        // ====================================================

        // 1. 先检查浏览模式开关是否打开
        const isBrowseMode = document.getElementById('browse-mode-toggle').checked;
        if (isBrowseMode) {
            showToast('当前为浏览模式，请先关闭开关或选择一个标记', 'info');
            return; // 直接退出，不添加标记
        }

        // 2. 如果开关关了，但没选标记类型
        if (!currentMarkerType) {
            showToast('请先选择一个标记类型', 'info');
            const markerSection = document.getElementById('marker-types');
            markerSection.style.transition = 'opacity 0.3s';
            markerSection.style.opacity = 0.5;
            setTimeout(() => { markerSection.style.opacity = '1'; }, 300);
            return;
        }
        addMarker(e.latlng, currentMarkerType);
    });
}
