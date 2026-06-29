(function () {
    const CONTROL_URL_KEY = 'azpr-overlay-control-url';
    const DEFAULT_CONTROL_URL = 'http://127.0.0.1:8766';

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

    async function requestOverlay(path, options = {}) {
        const response = await fetch(`${getControlBaseUrl()}${path}`, {
            mode: 'cors',
            cache: 'no-store',
            ...options,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.ok === false) {
            throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
        }
        return payload;
    }

    async function refreshOverlayStatus() {
        try {
            const payload = await requestOverlay('/api/overlay/status');
            setOverlayLaunchStatus(payload.running ? '运行中' : '就绪', payload.running ? 'ready' : '');
        } catch (_error) {
            setOverlayLaunchStatus('本地服务未连接', 'error');
        }
    }

    async function launchOverlayFromPage() {
        const { button } = getElements();
        if (button) button.disabled = true;
        setOverlayLaunchStatus('启动中...', 'busy');

        try {
            const payload = await requestOverlay('/api/overlay/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mapId: getSelectedMapId() }),
            });
            const label = payload.alreadyRunning ? '覆盖层已在运行' : '覆盖层已启动';
            setOverlayLaunchStatus(label, 'ready');
            if (typeof showToast === 'function') showToast(label, 'success');
        } catch (error) {
            setOverlayLaunchStatus('启动失败', 'error');
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
