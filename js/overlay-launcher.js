(function () {
    const CONTROL_URL_KEY = 'azpr-overlay-control-url';
    const DEFAULT_CONTROL_URL = 'http://127.0.0.1:8766';
    const CONTROL_PROTOCOL_URL = 'azpr-overlay-control://start';
    let controlReachable = false;

    function getControlBaseUrl() {
        return (localStorage.getItem(CONTROL_URL_KEY) || DEFAULT_CONTROL_URL).replace(/\/+$/, '');
    }

    function getSelectedMapId() {
        return window.currentMapId || document.getElementById('map-select')?.value || 'shalulu';
    }

    function getElements() {
        return {
            button: document.getElementById('overlay-launch-btn'),
            status: document.getElementById('overlay-launch-status'),
        };
    }

    function setOverlayLaunchStatus(text, type = '') {
        const { status } = getElements();
        if (!status) return;
        status.textContent = text;
        status.className = `overlay-launch-status ${type}`.trim();
    }

    function getControlOfflineMessage() {
        return '本地启动服务未运行';
    }

    function formatOverlayError(error) {
        const message = error && error.message ? error.message : String(error || '');
        if (error && error.name === 'AbortError') {
            return '连接本地启动服务超时';
        }
        if (/Failed to fetch|NetworkError|Load failed|fetch/i.test(message)) {
            return getControlOfflineMessage();
        }
        return message || '未知错误';
    }

    function isControlOfflineError(error) {
        const message = error && error.message ? error.message : String(error || '');
        return message.includes(getControlOfflineMessage()) || message.includes('本地启动服务') || message.includes('超时');
    }

    function sleep(ms) {
        return new Promise(resolve => window.setTimeout(resolve, ms));
    }

    function openControlProtocol() {
        const url = `${CONTROL_PROTOCOL_URL}?url=${encodeURIComponent(getControlBaseUrl())}`;
        window.location.href = url;
    }

    async function requestOverlay(path, options = {}) {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 4000);
        try {
            const response = await fetch(`${getControlBaseUrl()}${path}`, {
                mode: 'cors',
                cache: 'no-store',
                signal: controller.signal,
                ...options,
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload.ok === false) {
                throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
            }
            return payload;
        } catch (error) {
            throw new Error(formatOverlayError(error));
        } finally {
            window.clearTimeout(timeout);
        }
    }

    async function waitForControlReady(timeoutMs = 9000) {
        const deadline = Date.now() + timeoutMs;
        let lastError = null;
        while (Date.now() < deadline) {
            try {
                const payload = await requestOverlay('/api/overlay/status');
                controlReachable = true;
                return payload;
            } catch (error) {
                lastError = error;
                await sleep(450);
            }
        }
        throw lastError || new Error(getControlOfflineMessage());
    }

    async function ensureControlReady() {
        if (controlReachable) return;
        setOverlayLaunchStatus('启动本地服务...', 'busy');
        openControlProtocol();
        await waitForControlReady();
    }

    async function refreshOverlayStatus() {
        try {
            const payload = await requestOverlay('/api/overlay/status');
            controlReachable = true;
            setOverlayLaunchStatus(payload.running ? '运行中' : '就绪', payload.running ? 'ready' : '');
        } catch (_error) {
            controlReachable = false;
            setOverlayLaunchStatus('本地服务未连接', 'error');
        }
    }

    async function launchOverlayFromPage() {
        const { button } = getElements();
        if (button) button.disabled = true;
        setOverlayLaunchStatus('启动中...', 'busy');

        try {
            await ensureControlReady();
            const payload = await requestOverlay('/api/overlay/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mapId: getSelectedMapId() }),
            });
            const label = payload.alreadyRunning ? '覆盖层已在运行' : '覆盖层已启动';
            setOverlayLaunchStatus(label, 'ready');
            if (typeof showToast === 'function') showToast(label, 'success');
        } catch (error) {
            if (!controlReachable && isControlOfflineError(error)) {
                setOverlayLaunchStatus('本地服务未启动', 'error');
            } else {
                setOverlayLaunchStatus(error.message || '启动失败', 'error');
            }
            if (typeof showToast === 'function') showToast(`启动覆盖层失败：${error.message}`, 'error');
        } finally {
            if (button) button.disabled = false;
        }
    }

    window.launchOverlayFromPage = launchOverlayFromPage;
    window.refreshOverlayStatus = refreshOverlayStatus;

    document.addEventListener('DOMContentLoaded', () => {
        const { button } = getElements();
        button?.addEventListener('click', launchOverlayFromPage);
        refreshOverlayStatus();
    });
})();
