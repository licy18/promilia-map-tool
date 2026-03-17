#!/usr/bin/env python3
"""
多层瓦片生成脚本（修正坐标顺序）
将单层 4x4 瓦片按正确坐标顺序转换为多层瓦片结构（0-2 级）

瓦片坐标顺序（4x4 网格，按文件顺序 tile_row_col）：
tile_0_0 → (0,0)    tile_0_1 → (0,1)    tile_0_2 → (0,-1)   tile_0_3 → (0,-2)
tile_1_0 → (1,0)    tile_1_1 → (-1,0)   tile_1_2 → (1,1)    tile_1_3 → (1,-1)
tile_2_0 → (-1,1)   tile_2_1 → (-1,-1)  tile_2_2 → (1,-2)   tile_2_3 → (-1,-2)
tile_3_0 → (-2,0)   tile_3_1 → (-2,1)   tile_3_2 → (-2,-1)  tile_3_3 → (-2,-2)

最终地图坐标系统：
- x 范围：-2 到 1（4 个瓦片宽度）
- y 范围：-2 到 1（4 个瓦片高度）
- (0,0) 在地图中心偏右下
"""

import os
import sys
from PIL import Image

# 配置
TILES_DIR = 'maps/xinaya-tiles'
OUTPUT_DIR = 'maps/xinaya-tiles-multi'
TILE_SIZE = 1024  # 原始瓦片大小
GRID_SIZE = 4     # 4x4 网格
MAX_ZOOM = 2      # 最大缩放级别（0-2 共 3 级）

# 瓦片坐标映射（文件索引 → 实际坐标）
TILE_COORDS = [
    [(0, 0), (0, 1), (0, -1), (0, -2)],
    [(1, 0), (-1, 0), (1, 1), (1, -1)],
    [(-1, 1), (-1, -1), (1, -2), (-1, -2)],
    [(-2, 0), (-2, 1), (-2, -1), (-2, -2)]
]

# 坐标到地图位置的转换
MIN_COORD = -2  # 最小坐标值

def get_tile_filename(row, col):
    """根据行列获取瓦片文件名"""
    return f'{TILES_DIR}/tile_{row}_{col}.png'

def coord_to_map_position(coord_x, coord_y):
    """将坐标转换为地图中的像素位置"""
    map_x = (coord_x - MIN_COORD) * TILE_SIZE
    map_y = (coord_y - MIN_COORD) * TILE_SIZE
    return map_x, map_y

def create_full_map():
    """按正确坐标顺序拼接完整地图"""
    print("🔧 按坐标顺序拼接完整地图...")
    
    full_width = TILE_SIZE * GRID_SIZE  # 4096
    full_height = TILE_SIZE * GRID_SIZE  # 4096
    full_map = Image.new('RGBA', (full_width, full_height), (0, 0, 0, 0))
    
    for row in range(GRID_SIZE):
        for col in range(GRID_SIZE):
            coord_x, coord_y = TILE_COORDS[row][col]
            tile_path = get_tile_filename(row, col)
            
            if os.path.exists(tile_path):
                tile = Image.open(tile_path)
                x_pos, y_pos = coord_to_map_position(coord_x, coord_y)
                full_map.paste(tile, (x_pos, y_pos))
                print(f"  ✅ tile_{row}_{col} → ({coord_x:2d},{coord_y:2d}) → ({x_pos:4d},{y_pos:4d})")
            else:
                print(f"  ⚠️ 瓦片不存在：{tile_path}")
    
    return full_map

def generate_tiles(full_map, zoom):
    """生成指定层级的瓦片（XYZ 格式）"""
    tiles_count = 2 ** zoom
    tile_size = full_map.width // tiles_count
    
    zoom_dir = f'{OUTPUT_DIR}/{zoom}'
    os.makedirs(zoom_dir, exist_ok=True)
    
    print(f"🔧 生成 Zoom {zoom} 层级 ({tiles_count}x{tiles_count} = {tiles_count**2} 张)...")
    
    for y in range(tiles_count):
        for x in range(tiles_count):
            left = x * tile_size
            upper = y * tile_size
            right = left + tile_size
            lower = upper + tile_size
            
            tile = full_map.crop((left, upper, right, lower))
            tile_path = f'{zoom_dir}/{x}_{y}.png'
            tile.save(tile_path, 'PNG', optimize=True)
            
            if x == 0 and y == 0:
                print(f"  ✅ 示例：{tile_path} ({tile_size}x{tile_size})")

def main():
    print("🗺️ 多层瓦片生成工具（坐标修正版）")
    print("=" * 60)
    print()
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # 拼接完整地图
    full_map = create_full_map()
    
    # 保存完整地图
    full_map_path = f'{OUTPUT_DIR}/full_map.png'
    full_map.save(full_map_path, 'PNG')
    print(f"\n✅ 完整地图：{full_map_path} ({full_map.width}x{full_map.height})")
    print()
    
    # 生成各层级瓦片
    for zoom in range(MAX_ZOOM + 1):
        generate_tiles(full_map, zoom)
        print()
    
    total_tiles = sum(4 ** z for z in range(MAX_ZOOM + 1))
    print("=" * 60)
    print(f"✅ 完成！总瓦片数：{total_tiles} (Zoom 0-{MAX_ZOOM})")
    print(f"📂 输出目录：{OUTPUT_DIR}/")

if __name__ == '__main__':
    main()
