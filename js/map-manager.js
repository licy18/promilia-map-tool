/**
 * 自定义地图增删改管理
 */

// 【核心改造】：新手大礼包分发机制
if (!localStorage.getItem('promilia-maps-initialized')) {
    // 第一次进网站，把三个基础地图作为初始配置写入本地
    localStorage.setItem('promilia-custom-maps', JSON.stringify(BASE_MAP_CONFIGS));
    localStorage.setItem('promilia-maps-initialized', 'true');
}

// 全局地图众生平等，全部只从本地缓存读取
let MAP_CONFIGS = {};
try {
    MAP_CONFIGS = JSON.parse(localStorage.getItem('promilia-custom-maps')) || {};
    // 绝对兜底：如果用户用魔法把缓存清空了，强制补回大礼包
    if (Object.keys(MAP_CONFIGS).length === 0) {
        MAP_CONFIGS = { ...BASE_MAP_CONFIGS };
        localStorage.setItem('promilia-custom-maps', JSON.stringify(MAP_CONFIGS));
    }
} catch (e) {
    MAP_CONFIGS = { ...BASE_MAP_CONFIGS };
}

// 初始化地图配置
mapConfigs = MAP_CONFIGS;

// 动态渲染侧边栏的下拉菜单
function renderMapSelectUI() {
    const selectEl = document.getElementById('map-select');
    if (!selectEl) return;
    let html = '';
    Object.keys(mapConfigs).forEach(key => {
        const config = mapConfigs[key];
        html += `<option value="${key}">🗺️ ${config.name}</option>`;
    });
    selectEl.innerHTML = html;
}

// 确保当前读取的 ID 在配置中存在（防崩溃保护）
if (!mapConfigs[currentMapId]) currentMapId = Object.keys(mapConfigs)[0]; // 如果当前地图不存在，随便抓第一个活着的

// 初始化渲染下拉框
renderMapSelectUI();
let currentMapConfig = mapConfigs[currentMapId];

// 打开地图管理弹窗
window.openMapManager = function () {
    renderMapManagerList();
    document.getElementById('map-manager-modal').style.display = 'flex';
};

window.closeMapManager = function () {
    document.getElementById('map-manager-modal').style.display = 'none';
};

function renderMapManagerList() {
    const listContainer = document.getElementById('custom-map-list');

    let html = '';
    const mapKeys = Object.keys(MAP_CONFIGS);
    const isLastOne = mapKeys.length <= 1; // 判断是否是最后一张底牌

    mapKeys.forEach(key => {
        const map = MAP_CONFIGS[key];
        // 如果是最后一张，按钮变灰且禁用
        const btnStyle = isLastOne ? 'background: #555; cursor: not-allowed;' : 'background: #e94560;';

        // 【修复核心】：兼容 tileLayer 模式，防止 map.image 为 undefined 导致崩溃
        let linkText = '无链接';
        if (map.type === 'tiles' || map.type === 'tileLayer') {
            linkText = '多层瓦片';
        } else if (map.image) {
            linkText = map.image.substring(0, 15) + '...';
        }

        html += `
                    <div style="display: flex; justify-content: space-between; align-items: center; background: #1a2a4a; padding: 10px 12px; border-radius: 6px; margin-bottom: 8px; border-left: 4px solid #00d9ff; transition: 0.2s;">
                                <div>
                                    <div style="color: #eee; font-weight: bold; font-size: 0.9em;">${map.name} <span style="font-size: 0.8em; color: #888;">(${key})</span></div>
                                    <div style="color: #aaa; font-size: 0.75em; margin-top: 4px;"><i class="fas fa-crop-alt"></i> ${map.width}x${map.height} | <i class="fas fa-link"></i> ${linkText}</div>
                                </div>
                                <button class="btn btn-secondary" style="margin: 0; padding: 8px 12px; width: auto; ${btnStyle}" onclick="deleteCustomMap('${key}')" title="删除该地图" ${isLastOne ? 'disabled' : ''}><i class="fas fa-trash"></i></button>
                            </div>
                        `;
    });
    listContainer.innerHTML = html;
}

// 切换面板显示状态的函数
window.toggleMapTypeFields = function () {
    const type = document.getElementById('new-map-type').value;
    if (type === 'image') {
        document.getElementById('field-single-image').style.display = 'block';
        document.getElementById('field-tile-layer').style.display = 'none';
    } else {
        document.getElementById('field-single-image').style.display = 'none';
        document.getElementById('field-tile-layer').style.display = 'block';
    }
};

window.saveCustomMap = function () {
    const id = document.getElementById('new-map-id').value.trim();
    const name = document.getElementById('new-map-name').value.trim();
    const width = parseInt(document.getElementById('new-map-width').value);
    const height = parseInt(document.getElementById('new-map-height').value);
    const mapType = document.getElementById('new-map-type').value;

    if (!id || !name || !width || !height) {
        showToast('基础字段都必须填写完整喵！', 'error'); return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(id)) {
        showToast('地图ID只能包含字母、数字和下划线喵！', 'error'); return;
    }

    if (MAP_CONFIGS[id]) {
        if (!confirm(`地图 ID [${id}] 已经存在啦，您要覆盖它的图片配置吗喵？\n放心，这不会删除您在该地图上打的标点~`)) return;
    }

    // 组装新地图通用配置
    let newConfig = {
        name: name, width: width, height: height,
        storageKey: 'promilia-markers-' + id, color: '#00d9ff'
    };

    // 根据类型塞入专用配置
    if (mapType === 'image') {
        const url = document.getElementById('new-map-url').value.trim();
        if (!url) { showToast('单图模式下必须填写图片地址喵！', 'error'); return; }
        newConfig.type = 'image';
        newConfig.image = url;
    } else if (mapType === 'tileLayer') {
        const tileUrl = document.getElementById('new-map-tile-url').value.trim();
        const minZoom = parseInt(document.getElementById('new-map-min-zoom').value) || 0;
        const maxZoom = parseInt(document.getElementById('new-map-max-zoom').value) || 3;

        if (!tileUrl) { showToast('瓦片模式下必须填写目录URL模板喵！', 'error'); return; }
        if (!tileUrl.includes('{z}') || !tileUrl.includes('{x}') || !tileUrl.includes('{y}')) {
            showToast('瓦片URL必须包含 {z}, {x}, {y} 这三个占位符喵！', 'error'); return;
        }

        newConfig.type = 'tileLayer';
        newConfig.tileUrl = tileUrl;
        newConfig.minZoom = minZoom;
        newConfig.maxZoom = maxZoom;
    }

    // 持久化到本地统一金库
    MAP_CONFIGS[id] = newConfig;
    localStorage.setItem('promilia-custom-maps', JSON.stringify(MAP_CONFIGS));

    // 刷新 UI
    renderMapSelectUI();
    renderMapManagerList();

    // 清空表单，深藏功与名
    document.getElementById('new-map-id').value = '';
    document.getElementById('new-map-name').value = '';
    document.getElementById('new-map-url').value = '';
    document.getElementById('new-map-tile-url').value = '';
    document.getElementById('map-select').value = currentMapId;

    showToast(`地图 [${name}] 已部署成功！`, 'success');
};

window.deleteCustomMap = function (id) {
    const currentMapKeys = Object.keys(MAP_CONFIGS);
    if (currentMapKeys.length <= 1) {
        showToast('总得留一块落脚地吧喵！这是最后一张地图了，禁止删除！', 'error');
        return;
    }

    if (!confirm(`【危险操作警告】\n确定要彻底删除地图 [${MAP_CONFIGS[id].name}] 吗？\n\n⚠️ 警告：一旦删除，该地图以及绑定的【所有标点和路线数据】将被永久销毁，不可恢复喵！`)) return;

    // 1. 抹除地图配置
    delete MAP_CONFIGS[id];
    localStorage.setItem('promilia-custom-maps', JSON.stringify(MAP_CONFIGS));

    // 2. 斩草除根：清理连坐的标点和路线数据，省出本地空间
    const storageKey = 'promilia-markers-' + id;
    localStorage.removeItem(storageKey);

    // 清理运行内存
    if (typeof allMarkersData !== 'undefined' && allMarkersData[id]) {
        delete allMarkersData[id];
    }

    // 3. 安全迫降机制
    if (currentMapId === id) {
        showToast('当前地图已被销毁，正在紧急迫降到安全区域...', 'info');
        // 随便找一个存活的地图跳伞
        const survivorId = Object.keys(MAP_CONFIGS)[0];
        switchMap(survivorId);
    } else {
        renderMapSelectUI();
        document.getElementById('map-select').value = currentMapId;
    }

    renderMapManagerList();
    showToast('地图及关联数据已彻底抹除喵！', 'success');
};
