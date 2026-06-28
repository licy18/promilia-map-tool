# 游戏内点位覆盖层 v1

透明置顶 Electron 覆盖层，只读取 `../data/official/*.json`，不注入游戏、不读内存、不修改客户端。

## 运行

```bash
cd overlay
npm install
npm start
```

`Ctrl+Shift+O` 切换鼠标穿透和可交互模式。首次使用先切到可交互模式，选择地图后点“校准 / 开始”，拖拽覆盖游戏大地图区域。

## 数据和状态

- 地图数据：`../data/official/{mapId}-worldmap.json`
- 校准状态：`localStorage` 的 `overlay-calibration:{mapId}`
- 自动校准缓存：`overlay/cache/vision/`
- 支持地图：`shalulu`、`xinaya`、`fulisi`
- v1 只做大地图矩形内的线性投影，不追踪小地图、玩家坐标或世界空间。

## 自动校准

自动校准通过 Python OpenCV sidecar 读取用户选择的游戏窗口画面，匹配游戏内大地图当前可见区域，并把点位实时投到屏幕坐标。

1. 在面板里点“检查依赖”；缺依赖时再次点击会安装 `overlay/vision/requirements.txt`。
2. 点窗口刷新，选择游戏窗口。
3. 点“构建缓存”；`shalulu` 直接使用 `maps/shalulu.png`，`xinaya / fulisi` 会下载官方瓦片到本地缓存。
4. 点“开始自动”。拖拽游戏大地图时，点位会以低频稳妥模式跟随。

手动矩形校准仍可作为回退使用。

## 自检

```bash
npm run check
```
