# 普罗米利亚地图标记工具

> 🗺️ 一个轻量级的本地游戏地图标记工具，无需联网即可使用。

[![GitHub Release](https://img.shields.io/github/v/release/licy18/promilia-map-tool?style=flat-square)](https://github.com/licy18/promilia-map-tool/releases)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)
[![Made with 🐸](https://img.shields.io/badge/made%20with-%F0%9F%90%B8-green.svg?style=flat-square)](https://github.com/licy18/promilia-map-tool)

**📦 GitHub:** https://github.com/licy18/promilia-map-tool

---

## 🚀 快速开始

### 方式 1：直接打开
```bash
# 双击 index.html 即可运行
```

### 方式 2：本地服务器（推荐）
```bash
# Python 3
cd promilia-map-tool
python3 -m http.server 8000

# 访问 http://localhost:8000
```

---

## ✨ 功能特性

### 基础功能
- ✅ 点击地图添加标记
- ✅ 6 种标记类型（宝箱/任务/采集/敌人/传送/自定义）
- ✅ 标记聚合（缩放时自动聚类）
- ✅ 标记备注编辑
- ✅ 自动保存（localStorage）

### 数据管理
- ✅ 导出为 JSON 文件
- ✅ 从 JSON 文件导入
- ✅ 分享链接（Base64 编码）
- ✅ 批量清空

### 筛选功能
- ✅ 按类型筛选显示
- ✅ 实时统计各类型数量

---

## 📁 文件结构

```
promilia-map-tool/
├── index.html          # 主程序（单文件）
├── README.md           # 使用说明
├── maps/               # 地图图片目录
│   └── promilia-map.jpg  # 替换为你的地图
└── icons/              # 自定义图标（可选）
```

---

## 🗺️ 添加地图图片

### 默认地图配置

工具预置了 3 张地图：

| 地图 ID | 名称 | 图片文件 | 存储键 |
|--------|------|----------|--------|
| `shalulu` | 夏露露村 | `maps/shalulu.jpg` | `promilia-markers-shalulu` |
| `xinaya` | 新芽山谷 | `maps/xinaya.jpg` | `promilia-markers-xinaya` |
| `fulisi` | 弗利斯 | `maps/fulisi.jpg` | `promilia-markers-fulisi` |

### 添加地图步骤

1. 准备地图图片（建议 2048×2048 或 4096×4096）
2. 放入 `maps/` 目录，命名为对应文件名
3. 刷新页面，在下拉菜单中选择地图

### 修改地图配置

编辑 `index.html`，找到 `MAP_CONFIGS` 对象：

```javascript
const MAP_CONFIGS = {
    shalulu: {
        name: '夏露露村',
        width: 2048,
        height: 2048,
        image: 'maps/shalulu.jpg',
        storageKey: 'promilia-markers-shalulu'
    },
    // 添加更多地图...
};
```

**添加新地图：**
```javascript
newmap: {
    name: '新地图',
    width: 2048,
    height: 2048,
    image: 'maps/newmap.jpg',
    storageKey: 'promilia-markers-newmap'
}
```

然后在 HTML 的 `<select id="map-select">` 中添加选项：
```html
<option value="newmap">🗺️ 新地图</option>
```

---

## 📊 使用说明

### 添加标记
1. 在左侧选择标记类型
2. 点击地图任意位置
3. 在弹窗中添加备注
4. 点击"保存"

### 编辑标记
1. 点击已有标记
2. 修改备注内容
3. 点击"保存"

### 删除标记
1. 点击标记
2. 点击"删除"按钮

### 导出数据
1. 点击"导出数据"按钮
2. 选择保存位置
3. 文件名格式：`promilia-markers-时间戳.json`

### 导入数据
1. 点击"导入数据"按钮
2. 选择之前导出的 JSON 文件
3. 标记会自动加载

### 分享标记
1. 点击"分享标记"按钮
2. 分享链接会自动复制到剪贴板
3. 发送给好友，好友打开链接即可加载

### 筛选显示
1. 点击左侧筛选区的类型图标
2. 蓝色高亮表示显示，灰色表示隐藏
3. 点击"全部"可一键切换

---

## 🔧 自定义标记类型

编辑 `index.html` 中的 `MARKER_CONFIGS`：

```javascript
const MARKER_CONFIGS = {
    chest: { icon: 'fa-gift', color: '#f39c12', label: '宝箱' },
    // 添加新类型...
    secret: { icon: 'fa-lock', color: '#9b59b6', label: '秘密' }
};
```

然后在 HTML 中添加对应的类型选择按钮。

---

## 💾 数据存储

- **位置：** 浏览器 localStorage
- **键名：** `promilia-map-markers`
- **容量：** 约 5-10MB（可存储数千个标记）
- **持久化：** 关闭浏览器后数据保留

**注意：** 清除浏览器缓存会删除数据，请定期导出备份！

---

## 🌐 分享功能原理

分享链接使用 Base64 编码将标记数据嵌入 URL：
```
https://your-site.com#index.html#data=eyJtYXJrZXJzIjpbXX0=
```

好友打开链接后，数据会自动解码并加载到地图中。

**限制：** URL 长度有限制（约 2000 字符），大量标记建议使用导出/导入功能。

---

## 📝 更新日志

### v1.2 (2026-03-16) - 🗺️ 多地图切换
- ✨ **新增：** 多地图切换功能（下拉菜单选择）
- ✨ **新增：** 预置 3 张地图（夏露露村/新芽山谷/弗利斯）
- ✨ **新增：** 每张地图独立存储标记数据
- ✨ **新增：** 导出文件包含地图 ID 和名称
- 💡 **优化：** 侧边栏显示当前地图信息
- 💡 **优化：** 统计面板区分当前地图标记数

### v1.1 (2026-03-16) - 🔧 修复和优化
- 🔧 **修复：** 筛选功能隐藏的标记取消筛选后不显示的问题
- ✨ **新增：** 浏览模式（默认不选择标记类型，避免误触）
- ✨ **新增：** 地图视图自动保存（缩放级别和中心点）
- 💡 **优化：** 添加操作提示信息
- 💡 **优化：** 未选择标记类型时点击地图有闪烁提示

### v1.0 (2026-03-15) - 🎉 初始版本
- ✅ 基础标记功能
- ✅ 6 种标记类型
- ✅ 标记聚合
- ✅ 本地存储
- ✅ 导入导出
- ✅ 分享功能
- ✅ 筛选显示
- ✅ 类型统计

---

## 🐸 开发

**技术栈：**
- Leaflet 1.9.4（地图框架）
- Leaflet.markercluster 1.4.1（标记聚合）
- FontAwesome 6.4.0（图标）
- 纯 HTML/CSS/JS（无构建工具）

**扩展开发：**
1. 修改 `index.html` 中的代码
2. 刷新页面测试
3. 无需编译，即时生效

---

## 📄 许可

本项目为个人工具，可自由使用和修改。

---

**开发：** 呱呱 (Guāguā) 🐸  
**日期：** 2026-03-15
