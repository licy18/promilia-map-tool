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

编辑 `tracker.py` 的配置区：

```python
BIG_MAP_PATH = 'maps/shalulu.png'   # 大地图路径
VIDEO_PATH = 'test1.mp4'             # 视频路径
MINIMAP_ROI = (37, 192, 36, 187)    # 从 video_test.py 获取
MINIMAP_ZOOM = 0.95                  # 缩放补偿
```

### 4. 运行追踪

```bash
python tracker.py
```

## 🎯 参数调优指南

| 参数 | 说明 | 推荐值 |
|------|------|--------|
| `MINIMAP_ZOOM` | 小地图缩放补偿 | 0.8~1.2 |
| `MAX_JUMP` | 位置跳跃阈值（像素） | 100~200 |
| `SMOOTHING` | 平滑系数 | 0.4~0.8 |
| `nfeatures` | SIFT 特征点数量 | 2000~5000 |

## 🌐 WebSocket 数据格式

服务器运行在 `ws://localhost:8765`

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
