/**
 * COS 云端存储、签名、上传、下载
 */

// COS 配置初始化 - 从 localStorage 读取
let currentCOSUserId = localStorage.getItem('promilia-cos-current-user') || 'default';
let COSUsers = JSON.parse(localStorage.getItem('promilia-cos-users') || '{}');

// 如果没有 default 用户，创建一个空的
if (!COSUsers.default) {
    COSUsers.default = {
        Bucket: '',
        Region: '',
        SecretId: '',
        SecretKey: ''
    };
    localStorage.setItem('promilia-cos-users', JSON.stringify(COSUsers));
}

// 读取锁定状态
let isCOSUserLocked = localStorage.getItem('promilia-cos-user-locked') === 'true';

// 获取当前用户配置
function getCurrentCOSConfig() {
    return COSUsers[currentCOSUserId] || null;
}

// 初始化 COS 配置面板 UI
function initCosConfigUI() {
    // 渲染用户列表
    renderCOSUserList();

    // 更新锁定状态
    updateCOSUserLockUI();

    // 读取已有配置到表单
    const config = getCurrentCOSConfig();
    if (config) {
        document.getElementById('cos-bucket').value = config.Bucket || '';
        document.getElementById('cos-region').value = config.Region || '';
        document.getElementById('cos-secret-id').value = config.SecretId || '';
        document.getElementById('cos-secret-key').value = config.SecretKey || '';
    }

    // 绑定点击事件显示/隐藏面板
    document.getElementById('cos-config-toggle').addEventListener('click', function() {
        const panel = document.getElementById('cos-config-panel');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });

    // 更新用户路径预览
    updateCOSUserPathPreview();
}

// 渲染用户下拉列表
function renderCOSUserList() {
    const selectEl = document.getElementById('user-select');
    if (!selectEl) return;

    // 清空
    selectEl.innerHTML = '';

    // 添加所有用户
    Object.keys(COSUsers).forEach(userId => {
        const option = document.createElement('option');
        option.value = userId;
        option.textContent = userId;
        if (userId === currentCOSUserId) {
            option.selected = true;
        }
        selectEl.appendChild(option);
    });

    // 更新显示
    document.getElementById('current-user-display').textContent = currentCOSUserId;
}

// 更新锁定状态 UI
function updateCOSUserLockUI() {
    const lockBtn = document.getElementById('lock-user-btn');
    if (isCOSUserLocked) {
        lockBtn.innerHTML = '<i class="fas fa-lock"></i> 解锁存储路径';
        document.getElementById('user-select').disabled = true;
        document.getElementById('add-user-btn').disabled = true;
        document.getElementById('delete-user-btn').disabled = true;
    } else {
        lockBtn.innerHTML = '<i class="fas fa-lock"></i> 锁定存储路径';
        document.getElementById('user-select').disabled = false;
        document.getElementById('add-user-btn').disabled = false;
        document.getElementById('delete-user-btn').disabled = false;
    }

    document.getElementById('user-lock-icon').className = isCOSUserLocked ? 'fas fa-lock' : 'fas fa-unlock';
}

// 更新路径预览
function updateCOSUserPathPreview() {
    document.getElementById('preview-user-path').textContent = currentCOSUserId;
}

// 切换锁定状态
document.getElementById('lock-user-btn').addEventListener('click', function() {
    isCOSUserLocked = !isCOSUserLocked;
    localStorage.setItem('promilia-cos-user-locked', JSON.stringify(isCOSUserLocked));
    updateCOSUserLockUI();
    updateCOSUserPathPreview();
    showToast(isCOSUserLocked ? '已锁定用户存储路径' : '已解锁', 'success');
});

// 切换用户
document.getElementById('user-select').addEventListener('change', function() {
    currentCOSUserId = this.value;
    localStorage.setItem('promilia-cos-current-user', currentCOSUserId);

    // 加载对应配置到表单
    const config = getCurrentCOSConfig();
    if (config) {
        document.getElementById('cos-bucket').value = config.Bucket || '';
        document.getElementById('cos-region').value = config.Region || '';
        document.getElementById('cos-secret-id').value = config.SecretId || '';
        document.getElementById('cos-secret-key').value = config.SecretKey || '';
    }

    document.getElementById('current-user-display').textContent = currentCOSUserId;
    updateCOSUserPathPreview();
    showToast(`已切换用户：${currentCOSUserId}`, 'success');
});

// 添加新用户
document.getElementById('add-user-btn').addEventListener('click', function() {
    const newUserId = document.getElementById('new-user-input').value.trim();
    if (!newUserId) {
        showToast('请输入用户ID', 'error');
        return;
    }
    if (COSUsers[newUserId]) {
        showToast('用户ID已存在', 'error');
        return;
    }

    // 创建新用户空配置
    COSUsers[newUserId] = {
        Bucket: '',
        Region: '',
        SecretId: '',
        SecretKey: ''
    };
    localStorage.setItem('promilia-cos-users', JSON.stringify(COSUsers));

    // 切换到新用户
    currentCOSUserId = newUserId;
    localStorage.setItem('promilia-cos-current-user', currentCOSUserId);

    // 刷新 UI
    renderCOSUserList();
    updateCOSUserPathPreview();
    document.getElementById('new-user-input').value = '';

    showToast(`已创建用户：${newUserId}`, 'success');
});

// 删除当前用户
document.getElementById('delete-user-btn').addEventListener('click', function() {
    if (Object.keys(COSUsers).length <= 1) {
        showToast('至少保留一个用户', 'error');
        return;
    }

    if (!confirm(`确定要删除用户 "${currentCOSUserId}" 吗？\n配置会被删除，但云端备份文件不会被删除。`)) {
        return;
    }

    delete COSUsers[currentCOSUserId];
    localStorage.setItem('promilia-cos-users', JSON.stringify(COSUsers));

    // 切换到第一个用户
    currentCOSUserId = Object.keys(COSUsers)[0];
    localStorage.setItem('promilia-cos-current-user', currentCOSUserId);

    // 加载配置
    const config = getCurrentCOSConfig();
    if (config) {
        document.getElementById('cos-bucket').value = config.Bucket || '';
        document.getElementById('cos-region').value = config.Region || '';
        document.getElementById('cos-secret-id').value = config.SecretId || '';
        document.getElementById('cos-secret-key').value = config.SecretKey || '';
    }

    // 刷新 UI
    renderCOSUserList();
    updateCOSUserPathPreview();

    showToast(`已删除用户，当前用户：${currentCOSUserId}`, 'success');
});

// 保存 COS 配置
window.saveCosConfig = function () {
    const bucket = document.getElementById('cos-bucket').value.trim();
    const region = document.getElementById('cos-region').value.trim();
    const secretId = document.getElementById('cos-secret-id').value.trim();
    const secretKey = document.getElementById('cos-secret-key').value.trim();

    if (!currentCOSUserId) {
        showToast('请先选择或创建用户', 'error');
        return;
    }

    // 保存到对应用户
    COSUsers[currentCOSUserId] = {
        Bucket: bucket,
        Region: region,
        SecretId: secretId,
        SecretKey: secretKey
    };
    localStorage.setItem('promilia-cos-users', JSON.stringify(COSUsers));

    document.getElementById('cos-config-panel').style.display = 'none';
    document.getElementById('cos-config-toggle').innerHTML = '<i class="far fa-check-square"></i> 已配置服务器秘钥（点击修改）';

    showToast('COS 秘钥已安全保存在本地缓存中！', 'success');
};

// 检查是否已配置 COS
function checkCosConfigured() {
    const config = getCurrentCOSConfig();
    if (!config || !config.Bucket || !config.Region || !config.SecretId || !config.SecretKey) {
        showToast('请先在上方配置 COS 服务器秘钥！', 'error');
        const panel = document.getElementById('cos-config-panel');
        if (panel.style.display === 'none') {
            document.getElementById('cos-config-toggle').click();
        }
        return false;
    }
    return true;
}

// 生成预签名 URL（COS 签名 v5 规范）- 使用 3.5.0 版本的正确实现
function generatePresignedURL(key, method = 'PUT', expired = 3600, contentType = 'application/json; charset=UTF-8', params = {}) {
    const config = getCurrentCOSConfig();
    if (!config) return null;

    const now = Math.floor(Date.now() / 1000);
    const exp = now + expired;
    const keyTime = `${now};${exp}`;

    // 1. 计算 SignKey = HMAC-SHA1(SecretKey, KeyTime)
    const signKey = CryptoJS.HmacSHA1(keyTime, config.SecretKey).toString(CryptoJS.enc.Hex);

    // 2. 构造 HttpString
    const httpMethod = method.toLowerCase();
    const uriPath = '/' + key;
    const host = `${config.Bucket}.cos.${config.Region}.myqcloud.com`;

    // 查询参数（按字母顺序排序，值需要 URL 编码）
    const sortedParamKeys = Object.keys(params).sort();
    const httpParams = sortedParamKeys
        .map(k => `${k.toLowerCase()}=${encodeURIComponent(params[k])}`)
        .join('&');

    // Headers（只有 content-type 非空时才包含）
    const httpHeaders = contentType ? `content-type=${encodeURIComponent(contentType)}&host=${host}` : `host=${host}`;

    const httpString = `${httpMethod}\n${uriPath}\n${httpParams}\n${httpHeaders}\n`;

    // 3. 计算 StringToSign
    const sha1HttpString = CryptoJS.SHA1(httpString).toString(CryptoJS.enc.Hex);
    const stringToSign = `sha1\n${keyTime}\n${sha1HttpString}\n`;

    // 4. 计算签名 Signature = HMAC-SHA1(SignKey, StringToSign)
    const signature = CryptoJS.HmacSHA1(stringToSign, signKey).toString(CryptoJS.enc.Hex);

    // 5. 构建预签名 URL
    const headerList = contentType ? 'content-type;host' : 'host';
    const urlParamList = sortedParamKeys.map(k => k.toLowerCase()).join(';');

    const queryString = [
        'q-sign-algorithm=sha1',
        'q-ak=' + config.SecretId,
        'q-sign-time=' + keyTime,
        'q-key-time=' + keyTime,
        'q-header-list=' + headerList,
        'q-url-param-list=' + urlParamList,
        'q-signature=' + signature
    ].join('&');

    const paramsQuery = sortedParamKeys.length > 0
        ? '&' + sortedParamKeys.map(k => `${k.toLowerCase()}=${encodeURIComponent(params[k])}`).join('&')
        : '';

    const url = `https://${host}/${key}?${queryString}${paramsQuery}`;

    return url;
}

// 记录上一次上传的时间（初始为 0）
let lastUploadTime = 0;

// 上传到 COS
window.uploadToCOS = async function () {
    if (!checkCosConfigured()) return;

    // 30 秒冷却时间检查
    const currentTime = Date.now();
    if (currentTime - lastUploadTime < 30000) {
        const waitSeconds = Math.ceil((30000 - (currentTime - lastUploadTime)) / 1000);
        showToast(`上传太频繁啦！请等待 ${waitSeconds} 秒后再试`, 'error');
        return;
    }
    lastUploadTime = currentTime;

    const config = getCurrentCOSConfig();
    const statusDiv = document.getElementById('cos-status');
    statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 准备上传...';

    try {
        // 先保存当前地图
        saveCurrentMapMarkers();

        // 收集所有地图数据
        const uploadData = {
            version: '3.8.5',
            exportedAt: new Date().toISOString(),
            toolName: '普罗米利亚地图标记工具',
            maps: {}
        };

        let totalMarkers = 0;
        let totalRoutes = 0;
        Object.keys(MAP_CONFIGS).forEach(mapId => {
            const mapConfig = MAP_CONFIGS[mapId];
            const storageKey = mapConfig.storageKey;

            try {
                const saved = localStorage.getItem(storageKey);
                let markers = [];
                let routes = [];

                if (saved) {
                    const data = JSON.parse(saved);
                    markers = Object.values(data.markers || {});
                    routes = Object.values(data.routes || {});
                }

                uploadData.maps[mapId] = {
                    mapName: mapConfig.name,
                    markers: markers,
                    routes: routes,
                    markerCount: markers.length
                };

                totalMarkers += markers.length;
                totalRoutes += routes.length;
            } catch (e) {
                console.error(`读取 ${mapConfig.name} 失败:`, e);
            }
        });

        statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在上传到云端...';

        // 生成文件名和云端路径
        const date = new Date();
        const timestamp = `${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}`;
        const filename = `${currentCOSUserId}-${timestamp}.json`;
        const cloudPath = `promilia-markers/${currentCOSUserId}/${filename}`;

        // 生成预签名 PUT URL
        const uploadUrl = generatePresignedURL(cloudPath, 'PUT', 3600, 'application/json; charset=UTF-8');

        console.log('上传 URL:', uploadUrl);

        // 转换为 JSON
        const json = JSON.stringify(uploadData, null, 2);
        const contentType = 'application/json; charset=UTF-8';

        // 使用 XMLHttpRequest 上传（避免 fetch 的 CORS 预检问题）
        await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', uploadUrl, true);
            xhr.setRequestHeader('Content-Type', contentType);

            xhr.onload = function () {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(xhr);
                } else {
                    reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText}`));
                }
            };

            xhr.onerror = function () {
                reject(new Error('网络错误'));
            };

            xhr.send(json);
        });

        // 生成下载链接
        const downloadUrl = generatePresignedURL(cloudPath, 'GET', 3600, '');

        statusDiv.innerHTML = `✅ 上传成功！<br>📦 文件：${filename}<br>📊 共 ${totalMarkers} 个标记, ${totalRoutes} 条路线<br>🔗 <a href="${downloadUrl}" target="_blank" style="color:#4fc3f7;">点击下载链接（1 小时有效）</a>`;
        showToast(`已上传 ${totalMarkers} 个标记到云端`, 'success');

    } catch (e) {
        console.error('上传失败:', e);
        statusDiv.innerHTML = `❌ 上传失败：${e.message}<br><small>提示：请使用 HTTP 服务器运行（python3 -m http.server 8000），不要直接打开文件</small>`;
        showToast('上传到云端失败', 'error');
    }
};

// 列出 COS 上的备份文件
window.listCOSFiles = async function () {
    if (!checkCosConfigured()) return;

    const statusDiv = document.getElementById('cos-status');
    const fileListDiv = document.getElementById('cos-file-list');
    const filesDiv = document.getElementById('cos-files');

    statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在获取文件列表...';
    fileListDiv.style.display = 'block';
    filesDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 加载中...';

    try {
        // 使用 COS ListObjects API 生成预签名 URL
        const listUrl = generatePresignedURL(
            '',
            'GET',
            3600,
            '',
            { 'prefix': `promilia-markers/${currentCOSUserId}/`, 'max-keys': '20' }
        );

        const response = await fetch(listUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

        const contents = xmlDoc.querySelectorAll('Contents');

        if (contents.length === 0) {
            filesDiv.innerHTML = '<div style="color:#888;padding:10px;">暂无备份文件</div>';
            statusDiv.innerHTML = '';
            return;
        }

        // 显示文件列表
        let html = '<div style="display:flex;flex-direction:column;gap:8px;">';
        contents.forEach(item => {
            const key = item.querySelector('Key')?.textContent;
            const lastModified = item.querySelector('LastModified')?.textContent;
            const size = item.querySelector('Size')?.textContent;

            if (!key || key.endsWith('/')) return;

            const date = new Date(lastModified);
            const dateStr = date.toLocaleString('zh-CN');
            const sizeStr = (parseInt(size) / 1024).toFixed(1) + ' KB';

            html += `
                <div style="display:flex;justify-content:space-between;align-items:center;background:#1a1a2e;padding:8px;border-radius:4px;border:1px solid #0f3460;">
                    <div style="flex:1;min-width:0;">
                        <div style="color:#4fc3f7;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">📦 ${key.split('/').pop()}</div>
                        <div style="color:#888;font-size:11px;">${dateStr} · ${sizeStr}</div>
                    </div>
                    <button onclick="downloadFromCOS('${key}')" style="background:#0f3460;color:#4fc3f7;border:1px solid #4fc3f7;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:11px;">⬇️ 下载</button>
                </div>
            `;
        });
        html += '</div>';

        filesDiv.innerHTML = html;
        statusDiv.innerHTML = `✅ 找到 ${contents.length} 个备份文件`;

    } catch (e) {
        console.error('获取列表失败:', e);
        filesDiv.innerHTML = `<div style="color:#f44336;padding:10px;">❌ 获取失败：${e.message}</div>`;
        statusDiv.innerHTML = '';
    }
};

// 从 COS 下载指定文件
window.downloadFromCOS = async function (cloudPath) {
    const statusDiv = document.getElementById('cos-status');
    statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在下载...';

    try {
        // GET 请求不需要 Content-Type，传空字符串
        const downloadUrl = generatePresignedURL(cloudPath, 'GET', 3600, '');

        const response = await fetch(downloadUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        // 验证数据格式
        if (!data.maps) {
            throw new Error('无效的备份文件格式');
        }

        // 显示导入确认
        let info = `版本：${data.version || '未知'}\n`;
        let totalMarkers = 0;
        let totalRoutes = 0;
        Object.keys(data.maps).forEach(mapId => {
            const markerCount = data.maps[mapId].markerCount || data.maps[mapId].markers?.length || 0;
            const routeCount = data.maps[mapId].routes?.length || 0;
            info += `  • ${data.maps[mapId].mapName || mapId}: ${markerCount} 个标记, ${routeCount} 条路线\n`;
            totalMarkers += markerCount;
            totalRoutes += routeCount;
        });

        if (!confirm(`从云端加载\n\n${info}\n共 ${totalMarkers} 个标记, ${totalRoutes} 条路线\n\n点击"确定"导入所有数据\n点击"取消"取消导入`)) {
            statusDiv.innerHTML = '';
            return;
        }

        // 导入数据
        importBackupData(data);

    } catch (e) {
        console.error('下载失败:', e);
        statusDiv.innerHTML = `❌ 下载失败：${e.message}`;
        showToast('从云端下载失败', 'error');
    }
};

// 从 COS 加载（通过文件选择）
window.loadFromCOS = async function () {
    const statusDiv = document.getElementById('cos-status');

    // 提示用户选择文件
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = function (e) {
        const file = e.target.files[0];
        if (!file) return;

        statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在解析文件...';

        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const data = JSON.parse(e.target.result);

                // 验证数据格式
                if (!data.maps) {
                    throw new Error('无效的备份文件格式');
                }

                // 显示导入确认
                let info = `版本：${data.version || '未知'}\n`;
                let totalMarkers = 0;
                let totalRoutes = 0;
                Object.keys(data.maps).forEach(mapId => {
                    const markerCount = data.maps[mapId].markerCount || data.maps[mapId].markers?.length || 0;
                    const routeCount = data.maps[mapId].routes?.length || 0;
                    info += `  • ${data.maps[mapId].mapName || mapId}: ${markerCount} 个标记, ${routeCount} 条路线\n`;
                    totalMarkers += markerCount;
                    totalRoutes += routeCount;
                });

                if (!confirm(`从备份文件加载\n\n${info}\n共 ${totalMarkers} 个标记, ${totalRoutes} 条路线\n\n点击"确定"导入所有数据\n点击"取消"取消导入`)) {
                    statusDiv.innerHTML = '';
                    return;
                }

                // 导入数据
                importBackupData(data);

            } catch (parseErr) {
                console.error('解析失败:', parseErr);
                statusDiv.innerHTML = `❌ 解析失败：${parseErr.message}`;
                showToast('解析备份文件失败', 'error');
            }
        };
        reader.readAsText(file);
    };
    input.click();
};

// 从 COS URL 直接加载（高级功能）
window.loadFromCOSUrl = async function () {
    const url = prompt('请输入 COS 下载链接：');
    if (!url) return;

    const statusDiv = document.getElementById('cos-status');
    statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在从云端下载...';

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('下载失败');

        const data = await response.json();

        // 验证数据格式
        if (!data.maps) {
            throw new Error('无效的备份文件格式');
        }

        // 导入数据
        importBackupData(data);

    } catch (e) {
        console.error('下载失败:', e);
        statusDiv.innerHTML = `❌ 下载失败：${e.message}`;
        showToast('从云端下载失败', 'error');
    }
};

// 导入备份数据（通用函数）
window.importBackupData = function (data) {
    const statusDiv = document.getElementById('cos-status');

    // 获取导入模式
    const importMode = document.querySelector('input[name="import-mode"]:checked').value;
    const modeText = importMode === 'override' ? '覆盖' : '增量';

    // 导入数据
    let importedCount = 0;
    let importedRoutesCount = 0;
    Object.keys(data.maps).forEach(mapId => {
        const mapData = data.maps[mapId];
        if (!mapData.markers || !Array.isArray(mapData.markers)) return;

        const storageKey = MAP_CONFIGS[mapId]?.storageKey || `promilia-markers-${mapId}`;
        let markersObj = {};
        let routesObj = {};

        if (importMode === 'incremental') {
            // 增量导入：保留现有标记和路线
            try {
                const saved = localStorage.getItem(storageKey);
                if (saved) {
                    const existingData = JSON.parse(saved);
                    markersObj = existingData.markers || {};
                    routesObj = existingData.routes || {};
                }
            } catch (e) {
                console.error(`读取现有数据失败 (${mapId}):`, e);
            }
        }

        // 添加新标记
        mapData.markers.forEach(marker => {
            markersObj[marker.id] = marker;
        });

        // 处理路线数据
        if (mapData.routes && Array.isArray(mapData.routes)) {
            mapData.routes.forEach(route => {
                routesObj[route.id] = route;
            });
            importedRoutesCount += mapData.routes.length;
        }

        localStorage.setItem(storageKey, JSON.stringify({
            mapId: mapId,
            mapName: mapData.mapName || mapId,
            markers: markersObj,
            routes: routesObj,
            counter: Date.now(),
            routeCounter: mapData.routeCounter || 0,
            savedAt: new Date().toISOString()
        }));

        allMarkersData[mapId] = markersObj;
        importedCount += mapData.markers.length;
    });

    // 重新加载当前地图的标记和路线
    loadMarkersForMap(currentMapId);
    updateStats();
    updateProgressStats();

    statusDiv.innerHTML = `✅ 已${modeText}加载 ${importedCount} 个标记和 ${importedRoutesCount} 条路线`;
    showToast(`已${modeText}加载 ${importedCount} 个标记和 ${importedRoutesCount} 条路线`, 'success');
};
