#!/usr/bin/env python3
"""
多层瓦片生成脚本
将单层 4x4 瓦片（1024x1024）转换为多层瓦片结构（0-4 级）

目录结构：
xinaya-tiles-multi/
├── 0/0_0.png          # Zoom 0: 1 张（整图缩略）
├── 1/0_0.png ... 1_1.png  # Zoom 1: 4 张（2x2）
├── 2/0_0.png ... 3_3.png  # Zoom 2: 16 张（4x4）
├── 3/0_0.png ... 7_7.png  # Zoom 3: 64 张（8x8）
└── 4/0_0.png ... 15_15.png # Zoom 4: 256 张（16x16）
"""

import os
import sys
from PIL import Image

# 配置
TILES_DIR = 'maps/xinaya-tiles'
OUTPUT_DIR = 'maps/xinaya-tiles-multi'
TILE_SIZE = 1024  # 原始瓦片大小
GRID_SIZE = 4     # 4x4 网格
MAX_ZOOM = 4      # 最大缩放级别

def create_full_map():
    """拼接完整的 4096x4096 地图"""
    print("🔧 拼接完整地图...")
    
    full_width = TILE_SIZE * GRID_SIZE  # 4096
    full_height = TILE_SIZE * GRID_SIZE  # 4096
    full_map = Image.new('RGBA', (full_width, full_height))
    
    for row in range(GRID_SIZE):
        for col in range(GRID_SIZE):
            tile_path = f'{TILES_DIR}/tile_{row}_{col}.png'
            if os.path.exists(tile_path):
                tile = Image.open(tile_path)
                full_map.paste(tile, (col * TILE_SIZE, row * TILE_SIZE))
                print(f"  ✅ 粘贴瓦片 {row}_{col}")
            else:
                print(f"  ⚠️ 瓦片不存在：{tile_path}")
    
    return full_map

def generate_tiles(full_map, zoom):
    """生成指定层级的瓦片"""
    # 计算该层级的瓦片数量和大小
    tiles_count = 2 ** zoom  # Zoom 0: 1, Zoom 1: 2, Zoom 2: 4, Zoom 3: 8, Zoom 4: 16
    tile_size = full_map.width // tiles_count
    
    zoom_dir = f'{OUTPUT_DIR}/{zoom}'
    os.makedirs(zoom_dir, exist_ok=True)
    
    print(f"🔧 生成 Zoom {zoom} 层级 ({tiles_count}x{tiles_count} = {tiles_count**2} 张瓦片)...")
    
    for y in range(tiles_count):
        for x in range(tiles_count):
            # 裁剪瓦片
            left = x * tile_size
            upper = y * tile_size
            right = left + tile_size
            lower = upper + tile_size
            
            tile = full_map.crop((left, upper, right, lower))
            
            # 保存瓦片
            tile_path = f'{zoom_dir}/{x}_{y}.png'
            tile.save(tile_path, 'PNG', optimize=True)
            
            if x == 0 and y == 0:
                print(f"  ✅ 瓦片示例：{tile_path} ({tile_size}x{tile_size})")

def main():
    print("🗺️ 多层瓦片生成工具")
    print("=" * 50)
    
    # 创建输出目录
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # 拼接完整地图
    full_map = create_full_map()
    
    # 保存完整地图（调试用）
    full_map_path = f'{OUTPUT_DIR}/full_map.png'
    full_map.save(full_map_path, 'PNG')
    print(f"✅ 完整地图已保存：{full_map_path} ({full_map.width}x{full_map.height})")
    print()
    
    # 生成各层级瓦片
    for zoom in range(MAX_ZOOM + 1):
        generate_tiles(full_map, zoom)
        print()
    
    # 统计
    total_tiles = sum(4 ** z for z in range(MAX_ZOOM + 1))
    print("=" * 50)
    print(f"✅ 瓦片生成完成！")
    print(f"📊 总层级：{MAX_ZOOM + 1} (0-{MAX_ZOOM})")
    print(f"📊 总瓦片数：{total_tiles}")
    print(f"📊 输出目录：{OUTPUT_DIR}/")

if __name__ == '__main__':
    main()
