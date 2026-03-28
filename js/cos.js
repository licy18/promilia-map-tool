/**
 * COS 云端存储、签名、上传、下载
 */

// COS 配置初始化 - 从 localStorage 读取
let currentCOSUserId = localStorage.getItem('promilia-cos-current-user') || 'default';
let COSUsers = JSON.parse(localStorage.getItem('promilia-cos-users') || '{}');

// 如果没有 default 用户，创建一个空的
if (!COSUsers.default) {
    COSUsers.default = {
        bucket: '',
        region: '',
        secretId: '',
        secretKey: ''
    };
    localStorage.setItem('promilia-cos-users', JSON.stringify(COSUsers));
}

// 读取锁定状态
let isCOSUserLocked = localStorage.getItem('promilia-cos-user-locked') === 'true';

// 初始化 COS 配置面板 UI
function initCosConfigUI() {
    // 渲染用户列表
    renderCOSUserList();

    // 更新锁定状态
    updateCOSUserLockUI();

    // 读取已有配置到表单
    const config = getCurrentCOSConfig();
    if (config) {
        document.getElementById('cos-bucket').value = config.bucket || '';
        document.getElementById('cos-region').value = config.region || '';
        document.getElementById('cos-secret-id').value = config.secretId || '';
        document.getElementById('cos-secret-key').value = config.secretKey || '';
    }

    // 绑定点击事件显示/隐藏面板
    document.getElementById('cos-config-toggle').addEventListener('click', function() {
        const panel = document.getElementById('cos-config-panel');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });

    // 更新用户路径预览
    updateCOSUserPathPreview();
}

// 获取当前用户配置
function getCurrentCOSConfig() {
    return COSUsers[currentCOSUserId] || null;
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
        document.getElementById('cos-bucket').value = config.bucket || '';
        document.getElementById('cos-region').value = config.region || '';
        document.getElementById('cos-secret-id').value = config.secretId || '';
        document.getElementById('cos-secret-key').value = config.secretKey || '';
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
        bucket: '',
        region: '',
        secretId: '',
        secretKey: ''
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
        document.getElementById('cos-bucket').value = config.bucket || '';
        document.getElementById('cos-region').value = config.region || '';
        document.getElementById('cos-secret-id').value = config.secretId || '';
        document.getElementById('cos-secret-key').value = config.secretKey || '';
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
        bucket: bucket,
        region: region,
        secretId: secretId,
        secretKey: secretKey
    };
    localStorage.setItem('promilia-cos-users', JSON.stringify(COSUsers));

    showToast('COS 配置已保存到本地', 'success');
};

// 检查是否已配置 COS
function checkCosConfigured() {
    const config = getCurrentCOSConfig();
    if (!config || !config.bucket || !config.region || !config.secretId || !config.secretKey) {
        return false;
    }
    return true;
}

// 生成 COS 签名 V5
function generateCOSAuth(method, pathname) {
    const config = getCurrentCOSConfig();
    if (!config) return null;

    const secretKey = config.secretKey;
    const now = Math.floor(Date.now() / 1000);
    const expiration = now + 3600; // 1小时过期

    // 签名参数
    const params = {
        q: {
            ak: config.secretId,
            e: expiration,
            t: now,
            r: Math.floor(Math.random() * 100000000)
        }
    };

    // 排序并拼接
    let str = `${method}\n${pathname}\n`;
    const sortedKeys = Object.keys(params.q).sort();
    sortedKeys.forEach(key => {
        str += `${key}=${params.q[key]}\n`;
    });
    str = str.slice(0, -1); // 移除最后一个换行

    // HMAC-SHA1 计算签名
    const signature = CryptoJS.HmacSHA1(str, secretKey).toString(CryptoJS.enc.Base64);
    const auth = `${params.q.ak}:${signature}`;

    return {
        auth: auth,
        params: params.q,
        bucket: config.bucket,
        region: config.region
    };
}

// 生成预签名下载 URL
function generatePresignedURL(bucket, region, objectKey, secretId, secretKey) {
    const method = 'GET';
    const pathname = `/${objectKey}`;

    const now = Math.floor(Date.now() / 1000);
    const expiration = now + 3600; // 1小时过期

    let str = `${method}\n\n\n${expiration}\n/${objectKey}`;
    const signature = CryptoJS.HmacSHA1(str, secretKey).toString(CryptoJS.enc.Base64);
    const encodedSignature = encodeURIComponent(signature);

    const url = `https://${bucket}.cos.${region}.myqcloud.com${pathname}?sign=${encodedSignature}&t=${now}&e=${expiration}&ak=${secretId}`;
    return url;
}

// 上传到 COS
window.uploadToCOS = function () {
    if (!checkCosConfigured()) {
        showToast('请先配置 COS 信息', 'error');
        document.getElementById('cos-config-panel').style.display = 'block';
        return;
    }

    const config = getCurrentCOSConfig();
    const statusDiv = document.getElementById('cos-status');
    statusDiv.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 正在准备上传...`;

    // 导出所有数据
    const exportData = {
        version: '1.3',
        exportedAt: new Date().toISOString(),
        toolName: '普罗米利亚地图标记工具',
        maps: {}
    };

    // 收集所有地图的数据（直接从 localStorage 读取保证最新）
    let totalMarkers = 0;
    let totalRoutes = 0;
    Object.keys(MAP_CONFIGS).forEach(mapId => {
        const mapConfig = MAP_CONFIGS[mapId];
        const storageKey = mapConfig.storageKey;
        try {
            const saved = localStorage.getItem(storageKey);
            if (saved) {
                const data = JSON.parse(saved);
                exportData.maps[mapId] = {
                    mapName: mapConfig.name,
                    markers: Object.values(data.markers || {}),
                    routes: Object.values(data.routes || {}),
                    markerCount: Object.keys(data.markers || {}).length
                };
                totalMarkers += Object.keys(data.markers || {}).length;
                totalRoutes += Object.keys(data.routes || {}).length;
            }
        } catch (e) {
            console.error(`读取 ${mapConfig.name} 失败:`, e);
        }
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const objectKey = `promilia-markers/${currentCOSUserId}/promilia-backup-${timestamp}.json`;

    statusDiv.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 正在上传：${objectKey} (${totalMarkers} 个标记, ${totalRoutes} 条路线)...`;

    // 上传逻辑：put 请求到 COS
    const stringData = JSON.stringify(exportData, null, 2);
    const auth = generateCOSAuth('PUT', '/' + objectKey);
    if (!auth) {
        statusDiv.innerHTML = `❌ 生成签名失败`;
        showToast('生成签名失败', 'error');
        return;
    }

    const url = `https://${config.bucket}.cos.${config.region}.myqcloud.com/${objectKey}`;

    fetch(url, {
        method: 'PUT',
        body: stringData,
        headers: {
            'Authorization': auth.auth,
            'Content-Type': 'application/json'
        }
    }).then(response => {
        if (response.ok) {
            statusDiv.innerHTML = `✅ 上传成功！\n文件：${objectKey}\n标记：${totalMarkers}，路线：${totalRoutes}`;
            showToast('上传成功到云端', 'success');
            // 刷新文件列表
            setTimeout(() => listCOSFiles(), 500);
        } else {
            response.text().then(text => {
                console.error('上传失败:', text);
                statusDiv.innerHTML = `❌ 上传失败：${response.status} ${response.statusText}`;
                showToast('上传失败', 'error');
            });
        }
    }).catch(e => {
        console.error('上传错误:', e);
        statusDiv.innerHTML = `❌ 上传错误：${e.message}`;
        showToast('上传失败', 'error');
    });
};

// 列出 COS 上的备份文件
window.listCOSFiles = function () {
    if (!checkCosConfigured()) {
        showToast('请先配置 COS 信息', 'error');
        document.getElementById('cos-config-panel').style.display = 'block';
        return;
    }

    const config = getCurrentCOSConfig();
    const prefix = `promilia-markers/${currentCOSUserId}/`;
    const auth = generateCOSAuth('GET', `/${prefix}`);
    if (!auth) {
        showToast('生成签名失败', 'error');
        return;
    }

    const url = `https://${config.bucket}.cos.${config.region}.myqcloud.com/?prefix=${encodeURIComponent(prefix)}&max-keys=1000`;

    const statusDiv = document.getElementById('cos-status');
    const listContainer = document.getElementById('cos-file-list');
    statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在获取文件列表...';
    listContainer.style.display = 'block';

    fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': auth.auth
        }
    }).then(response => {
        if (response.ok) {
            response.text().then(text => {
                // 解析 XML
                const parser = new DOMParser();
                const xml = parser.parseFromString(text, 'application/xml');
                const contents = xml.querySelectorAll('Contents');
                const files = [];

                contents.forEach(content => {
                    const key = content.querySelector('Key').textContent;
                    const size = parseInt(content.querySelector('Size').textContent);
                    const lastModified = content.querySelector('LastModified').textContent;

                    // 只显示 json 备份文件
                    if (key.endsWith('.json')) {
                        files.push({ key, size, lastModified });
                    }
                });

                // 按时间降序排列（最新的在最上面）
                files.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

                // 渲染列表
                const fileContainer = document.getElementById('cos-files');
                let html = '';
                files.forEach(file => {
                    const sizeKB = (file.size / 1024).toFixed(1);
                    const date = new Date(file.lastModified).toLocaleString();
                    html += `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; margin-bottom: 5px; background: rgba(0,0,0,0.2); border-radius: 4px;">
                            <div style="flex: 1;">
                                <div style="font-size: 0.8em; color: #eee;">${file.key.split('/').pop()}</div>
                                <div style="font-size: 0.7em; color: #888;">${sizeKB} KB • ${date}</div>
                            </div>
                            <button class="btn btn-info" style="margin: 0; padding: 4px 8px; width: auto;" onclick="downloadFromCOS('${encodeURIComponent(file.key)}')">
                                <i class="fas fa-download"></i> 下载
                            </button>
                        </div>
                    `;
                });

                if (files.length === 0) {
                    html = '<div style="color: #888; font-size: 0.8em; text-align: center; padding: 20px;">暂无备份文件</div>';
                }

                fileContainer.innerHTML = html;
                statusDiv.innerHTML = `✅ 找到 ${files.length} 个备份文件`;
            });
        } else {
            response.text().then(text => {
                console.error('列表获取失败:', text);
                statusDiv.innerHTML = `❌ 获取列表失败：${response.status} ${response.statusText}`;
                showToast('获取列表失败', 'error');
            });
        }
    }).catch(e => {
        console.error('列表获取错误:', e);
        statusDiv.innerHTML = `❌ 获取列表错误：${e.message}`;
        showToast('获取列表失败', 'error');
    });
};

// 从 COS 下载备份
window.downloadFromCOS = function (encodedKey) {
    const key = decodeURIComponent(encodedKey);
    if (!checkCosConfigured()) {
        showToast('请先配置 COS 信息', 'error');
        return;
    }

    const config = getCurrentCOSConfig();
    const presignedUrl = generatePresignedURL(config.bucket, config.region, key, config.secretId, config.secretKey);

    const statusDiv = document.getElementById('cos-status');
    statusDiv.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 正在下载：${key}...`;

    // fetch 获取数据
    fetch(presignedUrl)
        .then(response => {
            if (response.ok) {
                return response.text();
            } else {
                throw new Error(`${response.status} ${response.statusText}`);
            }
        })
        .then(text => {
            // 下载到本地文件，用户需要手动导入
            const data = JSON.parse(text);

            // 统计
            let totalMarkers = 0;
            Object.keys(data.maps).forEach(mapId => {
                if (data.maps[mapId].markers) {
                    totalMarkers += data.maps[mapId].markers.length;
                }
            });

            statusDiv.innerHTML = `✅ 云端存档【${key}】已安全下载到您的电脑！`;
            showToast('已安全下载到本地！如需加载，请在上方使用【导入数据】功能喵~', 'success');

            // 创建下载链接
            const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
            const a = document.createElement('a');
            a.href = url;
            // 使用云端的文件名（去掉路径前缀）作为下载文件名
            const fileName = key.split('/').pop() || 'promilia_cloud_backup.json';
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            statusDiv.innerHTML = `✅ 云端存档【${fileName}】已安全下载到您的电脑！\n如需加载，请在上方使用【导入数据】功能喵~`;
            showToast('已安全下载到本地！如需加载，请在上方使用【导入数据】功能喵~', 'success');
        })
        .catch(e => {
            console.error('下载失败:', e);
            statusDiv.innerHTML = `❌ 下载失败：${e.message}`;
            showToast('下载失败', 'error');
        });
};

// 从链接加载
window.loadFromCOSUrl = function () {
    const url = prompt('请输入 COS 下载链接：');
    if (!url) return;

    const statusDiv = document.getElementById('cos-status');
    statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在从链接下载...';

    fetch(url)
        .then(response => response.text())
        .then(text => {
            const data = JSON.parse(text);
            importBackupData(data);
            statusDiv.innerHTML = `✅ 从链接加载完成`;
        })
        .catch(e => {
            console.error('从链接加载失败:', e);
            statusDiv.innerHTML = `❌ 加载失败：${e.message}`;
            showToast('加载失败', 'error');
        });
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
                importedRoutesCount++;
            });
        }

        localStorage.setItem(storageKey, JSON.stringify({
            mapId: mapId,
            mapName: mapData.mapName,
            markers: markersObj,
            routes: routesObj,
            counter: Date.now(),
            routeCounter: mapData.routeCounter || 0,
            savedAt: new Date().toISOString()
        }));

        allMarkersData[mapId] = markersObj;
        importedCount += mapData.markers.length;
    });

    // 重新加载当前地图的标记
    loadMarkersForMap(currentMapId);
    updateStats();
    updateProgressStats();

    statusDiv.innerHTML = `✅ 已${modeText}加载 ${importedCount} 个标记和 ${importedRoutesCount} 条路线`;
    showToast(`已${modeText}加载 ${importedCount} 个标记和 ${importedRoutesCount} 条路线`, 'success');
};

// 从文件加载（用户选择本地文件）
window.loadFromCOS = function () {
    const url = prompt('请输入备份文件 URL：');
    if (!url) return;

    const statusDiv = document.getElementById('cos-status');
    statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在加载...';

    fetch(url)
        .then(response => response.json())
        .then(data => {
            importBackupData(data);
            statusDiv.innerHTML = `✅ 加载完成`;
        })
        .catch(e => {
            console.error('加载失败:', e);
            statusDiv.innerHTML = `❌ 加载失败：${e.message}`;
            showToast('加载失败', 'error');
        });
};
