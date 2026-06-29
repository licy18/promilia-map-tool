# 普罗米利亚地图追踪工具

这是一套视觉定位系统，可以从游戏视频中实时提取玩家位置，并通过 WebSocket 推送到网页端。

## 📋 文件说明

| 文件名 | 功能 |
|--------|------|
| `video_test.py` | 交互式小地图校准工具 |
| `tracker.py` | 实时位置追踪引擎 |
| `requirements.txt` | Python 依赖列表 |

## 🚀 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 校准小地图区域

```bash
python video_test.py
```

1. 程序会弹出视频首帧
2. 用鼠标框选小地图区域
3. 按 **Enter** 确认
4. 复制输出的 `MINIMAP_ROI` 坐标

### 3. 配置追踪引擎

现在不需要改代码，直接通过参数选择地图和截图方式：

```bash
python tracker.py --map-id shalulu --minimap-roi 37,192,36,187
python tracker.py --map-id xinaya --minimap-roi 37,192,36,187
python tracker.py --map-id fulisi --minimap-roi 37,192,36,187
```

### 4. 运行追踪

```bash
python tracker.py
```

默认仍追踪 `shalulu`。追踪 `xinaya / fulisi` 时，首次运行会在 `cache/tracker/` 下下载 z=6 粗定位瓦片；粗定位命中后再按当前位置懒加载 z=8 高清局部瓦片，视野太大时降到 z=7。

## 🎯 参数调优指南

| 参数 | 说明 | 推荐值 |
|------|------|--------|
| `MINIMAP_ZOOM` | 小地图缩放补偿 | 0.8~1.2 |
| `MAX_JUMP` | 位置跳跃阈值（像素） | 100~200 |
| `SMOOTHING` | 平滑系数 | 0.4~0.8 |
| `nfeatures` | SIFT 特征点数量 | 2000~5000 |
| `--local-half-span` | 新芽/弗利斯高清局部搜索半径 | 512~900 |

常用参数：

```bash
python tracker.py --map-id xinaya --screenshot-mode window --window-title Promilia
python tracker.py --map-id fulisi --build-cache
python tracker.py --map-id fulisi --no-preview
```

## 🌐 WebSocket 数据格式

服务器运行在 `ws://localhost:8765`

推荐发送带状态的新格式：

```json
{
  "type": "location",
  "mapId": "fulisi",
  "source": "minimap-vision",
  "coordinateSpace": "map",
  "lat": -166.46,
  "lng": 320.67,
  "confidence": 0.82,
  "state": "tracking",
  "timestamp": 1782624000000
}
```

字段说明：
- `mapId`：可选；提供后会和当前地图校验，不一致时前端不会更新位置。
- `source`：可选；用于显示坐标来源，例如 `debug-coordinate`、`game-coordinate`、`minimap-vision`。
- `coordinateSpace`：可选；支持 `map`、`image`、`native`、`game`。默认 `map`。
- `coordinateSpace: "game"` 时，前端会优先用当前官方点位中的 `game.x/game.z -> map.lat/map.lng` 自动拟合结果转换。
- `coordinateSpace: "image"` 时，前端按地图图片像素坐标转换；`shalulu` 会兼容旧的 `2048 - y` 小地图图像坐标。
- `confidence`：可选；支持 `0-1` 或 `0-100`，低于前端阈值时不会更新玩家点。
- `state`：可选；用于显示 `tracking`、`lost`、`manual`、`debug` 等状态。
- `reset`：可选；为 `true` 时跳过大跳变拦截，适合传送或切线后的首次位置。
- `tracker.py` 的小地图识别会发送 `coordinateSpace: "map"`，前端可直接显示到当前地图。

旧格式仍兼容：

```json
{
  "lat": 1024.5,
  "lng": 512.3
}
```

## 📝 网页端连接示例

```javascript
const ws = new WebSocket('ws://localhost:8765');
ws.onmessage = (event) => {
    const location = JSON.parse(event.data);
    console.log(`位置: ${location.lat}, ${location.lng}`);
};
```

## 🧭 网页端追踪能力

网页端现在提供独立的“位置追踪”面板：
- 坐标源：`WebSocket 坐标流`、`小地图视觉流`、`手动校准`、`调试轨迹`
- 操作：定位到当前位置、使用地图中心、点选当前位置、清除轨迹
- 状态：来源、置信度、坐标、最后更新时间
- 辅助：跟随玩家、轨迹线、附近点位列表、跳变拦截、平滑更新

因此后续如果能拿到游戏内真实坐标，可以直接替换坐标源，不需要继续依赖小地图视觉匹配。

## 🔧 常见问题

### 匹配失败
- 检查掩膜是否正确遮蔽 UI 元素
- 调整 `MINIMAP_ZOOM` 参数

### 位置跳变
- 增大 `MAX_JUMP` 阈值
- 调整 `SMOOTHING` 平滑系数

### 性能问题
- 降低 `nfeatures` 参数
- 检查视频分辨率

## 📄 许可证

与主项目使用相同的许可证。
