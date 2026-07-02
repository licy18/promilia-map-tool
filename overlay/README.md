# 游戏内点位覆盖层 v0.3

透明置顶 Electron 覆盖层，只读取 `../data/official/*.json`，不注入游戏、不读内存、不修改客户端。

## 运行

```bash
cd overlay
npm install
npm start
```

`Ctrl+Shift+O` 切换鼠标穿透和可交互模式。首次使用先切到可交互模式，选择地图后点“校准 / 开始”，拖拽覆盖游戏大地图区域。

如果从网页端启动覆盖层，先在项目根目录注册一次本机启动协议：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File tools/register-overlay-control-protocol.ps1
```

注册后网页按钮会在 `8766` 控制服务未运行时自动唤起隐藏控制服务，再启动覆盖层。

## 数据和状态

- 地图数据：`../data/official/{mapId}-worldmap.json`
- 校准状态：`localStorage` 的 `overlay-calibration:{mapId}`
- 自动校准缓存：`overlay/cache/vision/`
- 支持地图：`shalulu`、`xinaya`、`fulisi`
- v0.3 只做大地图界面的点位投影，不追踪小地图、玩家坐标或世界空间。

## 自动校准

自动校准通过 Python OpenCV sidecar 读取用户选择的游戏窗口画面，匹配游戏内大地图当前可见区域，并把点位实时投到屏幕坐标。

1. 在面板里点“检查依赖”；缺依赖时再次点击会安装 `overlay/vision/requirements.txt`。
2. 点窗口刷新，选择游戏窗口。
3. 点“构建缓存”；`shalulu` 直接使用 `maps/shalulu.png`，`xinaya / fulisi` 会先下载 z=6 全局瓦片缓存。
4. 点“开始自动”。拖拽游戏大地图时，点位会以较高频率刷新，并定期用全局 SIFT 重锁。

视觉链路：

- 使用 DXGI Desktop Duplication 抓取目标窗口可见区域，失败时回退屏幕区域截图。
- `xinaya / fulisi` 先用 z=6 全图参考做全局锁定。
- 常规帧优先使用 LK optical flow 快速跟随，按时间间隔用全局 SIFT 重锁，避免 SIFT 阻塞每一帧更新。
- 全局 SIFT 使用降采样截图和常驻内存的参考匹配器，默认约 0.35 秒重锁一次。
- 高清局部精配会按当前可见区域构建小范围 z=8 / z=7 本地参考缓存，并复用局部特征文件；实时追踪中限制瓦片数量，避免拖图时卡顿。
- 置信度同时参考 inlier 数量、inlier ratio、reprojection error 和 homography sanity；低置信不会更新点位矩阵。

手动矩形校准仍可作为回退使用。

## 自检

```bash
npm run check
```
