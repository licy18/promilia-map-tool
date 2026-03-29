/**
 * 区域雷达扫描、统计
 */

// === 新增：区域统计雷达核心引擎 ===
let radarLayerGroup = null; // 延迟初始化
let radarRegionsMap = {}; // 【新增】用于存放区域 ID 与多边形实例的映射，实现点击定位
const EPSILON = 0.0005; // 【黑科技】：压线判定的容差宽度（地图坐标单位）

// 初始化雷达图层（在 main.js 中调用）
function initRadarLayer() {
    if (!radarLayerGroup && map) {
        radarLayerGroup = L.featureGroup().addTo(map);
    }
}

// 1. 面板开关逻辑
const radarToggleBtn = document.getElementById('radar-toggle-btn');
if (radarToggleBtn) {
    radarToggleBtn.addEventListener('click', function () {
        const panel = document.getElementById('radar-panel');
        panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
        if (panel.style.display === 'flex') initRadarFilters(); // 每次打开刷新过滤选项
    });
}

// 2. 初始化目标勾选项
function initRadarFilters() {
    const container = document.getElementById('radar-filters');
    container.innerHTML = `<label style="display:flex; align-items:center; width: 100%; cursor: pointer; color:#00d9ff;"><input type="checkbox" id="radar-check-all" checked style="margin-right:5px;">全选所有资产</label>`;
    Object.keys(MARKER_CONFIGS).forEach(type => {
        const config = MARKER_CONFIGS[type];
        container.innerHTML += `<label style="display:flex; align-items:center; width: 48%; cursor: pointer; font-size:0.9em;"><input type="checkbox" class="radar-target-chk" value="${type}" checked style="margin-right:5px;"><span style="color:${config.color}">${config.label}</span></label>`;
    });
    document.getElementById('radar-check-all').addEventListener('change', function () {
        document.querySelectorAll('.radar-target-chk').forEach(cb => cb.checked = this.checked);
    });
}

// 3. 点到线段的距离算法（用于判定压线）
function distToSegmentSquared(p, v, w) {
    const l2 = Math.pow(v.lat - w.lat, 2) + Math.pow(v.lng - w.lng, 2);
    if (l2 === 0) return Math.pow(p.lat - v.lat, 2) + Math.pow(p.lng - v.lng, 2);
    let t = ((p.lat - v.lat) * (w.lat - v.lat) + (p.lng - v.lng) * (w.lng - v.lng)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.pow(p.lat - (v.lat + t * (w.lat - v.lat)), 2) + Math.pow(p.lng - (v.lng + t * (w.lng - v.lng)), 2);
}

// 4. 清理雷达与自由框选逻辑
let isDrawingRadar = false;
let radarDrawStart = null;
let radarTempRect = null;

window.clearRadar = function () {
    if (radarLayerGroup) radarLayerGroup.clearLayers();
    const reportEl = document.getElementById('radar-report');
    if (reportEl) reportEl.innerHTML = '等待扫描...';

    // 安全兜底：如果在划线中途点清理，恢复地图物理状态
    isDrawingRadar = false;
    if (map && map.dragging) map.dragging.enable();
    const mapContainer = document.getElementById('map-container');
    if (mapContainer) mapContainer.style.cursor = '';
    if (radarTempRect && map) {
        map.removeLayer(radarTempRect);
        radarTempRect = null;
    }
};

window.enableRadarDraw = function () {
    clearRadar(); // 先清理旧网格

    // 开启浏览模式，防止你划框的时候点出宝箱
    const browseToggle = document.getElementById('browse-mode-toggle');
    if (browseToggle && !browseToggle.checked) {
        browseToggle.checked = true;
        browseToggle.dispatchEvent(new Event('change'));
    }

    isDrawingRadar = true;
    if (map && map.dragging) map.dragging.disable(); // 禁用地图拖拽，把左键让给画笔
    const mapContainer = document.getElementById('map-container');
    if (mapContainer) mapContainer.style.cursor = 'crosshair'; // 变成十字瞄准星
    showToast('请在地图上【按住鼠标左键拖拽】划定扫描区域', 'info');
};

// 绑定雷达事件（在 main.js 初始化后调用）
function bindRadarEvents() {
    // 监听鼠标在地图上的拖拽
    map.on('mousedown', function (e) {
        if (!isDrawingRadar) return;
        radarDrawStart = e.latlng;
    });

    map.on('mousemove', function (e) {
        if (!isDrawingRadar || !radarDrawStart) return;
        if (radarTempRect) map.removeLayer(radarTempRect);
        radarTempRect = L.rectangle([radarDrawStart, e.latlng], {
            color: '#00d9ff', weight: 2, fillOpacity: 0.2, dashArray: '5, 5'
        }).addTo(map); // 画出酷炫的虚线瞄准框
    });

    map.on('mouseup', function (e) {
        if (!isDrawingRadar || !radarDrawStart) return;

        const finalBounds = L.latLngBounds(radarDrawStart, e.latlng);

        // 划完后立刻恢复地图的拖拽功能
        isDrawingRadar = false;
        map.dragging.enable();
        document.getElementById('map-container').style.cursor = '';
        radarDrawStart = null;
        if (radarTempRect) map.removeLayer(radarTempRect);

        // 如果只是误点了一下（没划出面积），就不触发
        if (finalBounds.getNorth() === finalBounds.getSouth()) return;

        // 触发雷达！模式设为纯矩形，分 1 块，把用户划的边界传进去！
        runRadar('grid', 1, finalBounds);
    });
}

// 5. 核心扫描启动器 (新增 customBounds 参数接收手划区域)
window.runRadar = function (mode, count, customBounds = null) {
    clearRadar();
    document.getElementById('radar-report').innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在雷达扫描中...';

    let north, south, east, west;

    if (customBounds) {
        // 模式 A：自由框选 -> 使用你手划的绝对坐标边界！
        north = customBounds.getNorth();
        south = customBounds.getSouth();
        east = customBounds.getEast();
        west = customBounds.getWest();
    } else {
        // 模式 B：全局扫描 -> 获取当前地图的真实物理边界！无视屏幕缩放！
        north = currentMapConfig.width;
        south = 0;
        east = currentMapConfig.height;
        west = 0;
    }

    // 计算行列数 (4 -> 2x2, 16 -> 4x4, 64 -> 8x8)
    const cols = Math.sqrt(count);
    const latStep = (north - south) / cols;
    const lngStep = (east - west) / cols;

    let regions = [];

    // 生成区块多边形
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < cols; j++) {
            const top = north - i * latStep, bottom = north - (i + 1) * latStep;
            const left = west + j * lngStep, right = west + (j + 1) * lngStep;

            if (mode === 'grid') {
                // 纯矩形模式
                regions.push([[top, left], [top, right], [bottom, right], [bottom, left]]);
            } else if (mode === 'triangle') {
                // 三角形模式 (切割两条对角线)
                const midLat = (top + bottom) / 2, midLng = (left + right) / 2;
                const center = [midLat, midLng], tl = [top, left], tr = [top, right], bl = [bottom, left], br = [bottom, right];
                regions.push([tl, tr, center]); // 上三角
                regions.push([tr, br, center]); // 右三角
                regions.push([br, bl, center]); // 下三角
                regions.push([bl, tl, center]); // 左三角
            }
        }
    }

    // 获取需要扫描的目标类型
    const activeTargets = Array.from(document.querySelectorAll('.radar-target-chk:checked')).map(cb => cb.value);

    // 绘制区块并统计
    let reportHTML = '';
    radarRegionsMap = {}; // 清空旧引用

    regions.forEach((polyCoords, index) => {
        const regionId = (index + 1).toString().padStart(2, '0');
        const polygon = L.polygon(polyCoords, {
            color: '#ff3333',
            weight: 2,
            fillOpacity: 0.1,
            regionId: regionId // 注入自定义属性
        });
        if (radarLayerGroup) polygon.addTo(radarLayerGroup);

        radarRegionsMap[regionId] = polygon; // 存入索引

        // 计算重心贴标签
        let centerLat = 0, centerLng = 0;
        polyCoords.forEach(p => { centerLat += p[0]; centerLng += p[1]; });
        centerLat /= polyCoords.length; centerLng /= polyCoords.length;

        const labelMarker = L.marker([centerLat, centerLng], {
            icon: L.divIcon({ className: 'radar-label-icon', html: regionId, iconSize: [40, 40] }),
            interactive: false
        });
        if (radarLayerGroup) labelMarker.addTo(radarLayerGroup);

        let stats = {};
        let total = 0;
        Object.values(markerData).forEach(marker => {
            if (!activeTargets.includes(marker.type)) return;
            const p = L.latLng(marker.lat, marker.lng);
            if (!polygon.getBounds().contains(p)) return;

            let isInside = false;
            let isBoundary = false;
            let j = polyCoords.length - 1;
            for (let i = 0; i < polyCoords.length; i++) {
                const vi = L.latLng(polyCoords[i][0], polyCoords[i][1]);
                const vj = L.latLng(polyCoords[j][0], polyCoords[j][1]);
                if (((vi.lng > p.lng) !== (vj.lng > p.lng)) && (p.lat < (vj.lat - vi.lat) * (p.lng - vi.lng) / (vj.lng - vi.lng) + vi.lat)) {
                    isInside = !isInside;
                }
                if (Math.sqrt(distToSegmentSquared(p, vi, vj)) < EPSILON) isBoundary = true;
                j = i;
            }

            if (isInside || isBoundary) {
                total++;
                if (!stats[marker.type]) stats[marker.type] = { count: 0, boundary: 0 };
                stats[marker.type].count++;
                if (isBoundary) stats[marker.type].boundary++;
            }
        });

        if (total > 0) {
            let details = Object.keys(stats).map(type => {
                const cfg = MARKER_CONFIGS[type];
                return `<div style="margin-left: 10px;">- ${cfg.label}: ${stats[type].count}</div>`;
            }).join('');

            // 【重点修改】：给外层 DIV 加上 onclick="focusRadarRegion('${regionId}')"
            reportHTML += `
                    <div onclick="focusRadarRegion('${regionId}')" style="background: rgba(255,255,255,0.05); padding: 8px; margin-bottom: 5px; border-radius: 4px; border-left: 3px solid #ff3333; cursor: pointer; transition: 0.2s;" onmouseover="this.style.background='rgba(255,51,51,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                        <strong style="color: #00d9ff;">区域 ${regionId}</strong> <i class="fas fa-search-plus" style="font-size:0.8em; opacity:0.6"></i>: 总计 ${total} 个
                                ${details}
                    </div>
                `;
        }
    });

    // 【新增】：在报告最后加上导出按钮
    if (reportHTML !== '') {
        reportHTML = `<button class="btn btn-info" onclick="copyRadarReport()" style="margin-bottom:10px; padding:5px;"><i class="fas fa-copy"></i> 复制文字报告</button>` + reportHTML;
    } else {
        reportHTML = '<div style="color:#00ff00;">未发现目标资产！</div>';
    }
    document.getElementById('radar-report').innerHTML = reportHTML;

    if (reportHTML === '') reportHTML = '<div style="color:#00ff00;">当前视野及目标下未发现资产！</div>';
    document.getElementById('radar-report').innerHTML = reportHTML;
    showToast('扫描完成！请查看侧边栏报告', 'success');
};
// ==========================================

// 【新增】雷达点击定位与复制报告工具函数
window.focusRadarRegion = function (id) {
    const poly = radarRegionsMap[id];
    if (poly && map) {
        map.fitBounds(poly.getBounds(), { padding: [100, 100], maxZoom: 1, animate: true });
        const originalStyle = { fillOpacity: 0.1, color: '#ff3333' };
        poly.setStyle({ fillOpacity: 0.7, color: '#00d9ff' });
        setTimeout(() => { poly.setStyle(originalStyle); }, 800);
        showToast(`已定位至区域 ${id}`, 'info');
    }
};

window.copyRadarReport = function () {
    const reportArea = document.getElementById('radar-report');
    if (!reportArea) return;

    let text = reportArea.innerText.replace(/一键复制对账报告/g, '').trim();
    const mapName = currentMapConfig ? currentMapConfig.name : "未知地图";
    const finalStr = `【普罗米利亚资产对账雷达报告 - ${mapName}】\n生成时间：${new Date().toLocaleString()}\n------------------\n${text}`;

    navigator.clipboard.writeText(finalStr).then(() => {
        showToast('报告已成功复制到剪贴板！喵~', 'success');
    }).catch(err => {
        console.error('复制失败:', err);
        showToast('复制失败，请手动选中复制', 'error');
    });
};
