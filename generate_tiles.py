#!/usr/bin/env python3
"""
多层瓦片生成脚本
总地图尺寸：1024×1024

瓦片文件顺序（翻转 Y 轴）：
tile_3_0 tile_3_1 tile_3_2 tile_3_3  ← 第 0 行（顶部）
tile_2_0 tile_2_1 tile_2_2 tile_2_3  ← 第 1 行
tile_1_0 tile_1_1 tile_1_2 tile_1_3  ← 第 2 行
tile_0_0 tile_0_1 tile_0_2 tile_0_3  ← 第 3 行（底部）
"""

import os
from PIL import Image

# 配置
TILES_DIR = 'maps/xinaya-tiles'
OUTPUT_DIR = 'maps/xinaya-tiles-multi'
TILE_SIZE = 256
GRID_SIZE = 4
MAX_ZOOM = 2

def create_full_map():
    """拼接完整地图（翻转 Y 轴）"""
    print("🔧 拼接完整地图（Y 轴翻转）...")
    print("   tile_3_x 在顶部，tile_0_x 在底部")
    print()
    
    full_width = TILE_SIZE * GRID_SIZE
    full_height = TILE_SIZE * GRID_SIZE
    full_map = Image.new('RGBA', (full_width, full_height))
    
    for row in range(GRID_SIZE):
        for col in range(GRID_SIZE):
            # 翻转行顺序：row 0 使用 tile_3_x，row 3 使用 tile_0_x
            src_row = (GRID_SIZE - 1) - row
            tile_path = f'{TILES_DIR}/tile_{src_row}_{col}.png'
            if os.path.exists(tile_path):
                tile = Image.open(tile_path)
                tile = tile.resize((TILE_SIZE, TILE_SIZE), Image.Resampling.LANCZOS)
                full_map.paste(tile, (col * TILE_SIZE, row * TILE_SIZE))
                print(f"  ✅ tile_{src_row}_{col} → 位置 ({col * TILE_SIZE}, {row * TILE_SIZE})")
            else:
                print(f"  ⚠️ 瓦片不存在：{tile_path}")
    
    return full_map

def generate_tiles(full_map, zoom):
    """生成指定层级的瓦片"""
    tiles_count = 2 ** zoom
    tile_size = full_map.width // tiles_count
    
    zoom_dir = f'{OUTPUT_DIR}/{zoom}'
    os.makedirs(zoom_dir, exist_ok=True)
    
    print(f"\n🔧 生成 Zoom {zoom} 层级 ({tiles_count}x{tiles_count} = {tiles_count**2} 张)...")
    
    for y in range(tiles_count):
        for x in range(tiles_count):
            left = x * tile_size
            upper = y * tile_size
            right = left + tile_size
            lower = upper + tile_size
            
            tile = full_map.crop((left, upper, right, lower))
            tile_path = f'{zoom_dir}/{x}_{y}.png'
            tile.save(tile_path, 'PNG', optimize=True)

    print(f"  ✅ 完成：{tiles_count**2} 张瓦片")

def main():
    print("🗺️ 多层瓦片生成工具（Y 轴翻转版）")
    print("=" * 60)
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    full_map = create_full_map()
    
    full_map_path = f'{OUTPUT_DIR}/full_map.png'
    full_map.save(full_map_path, 'PNG')
    print(f"\n✅ 完整地图：{full_map_path} ({full_map.width}×{full_map.height})")
    
    for zoom in range(MAX_ZOOM + 1):
        generate_tiles(full_map, zoom)
    
    total_tiles = sum(4 ** z for z in range(MAX_ZOOM + 1))
    print("\n" + "=" * 60)
    print(f"✅ 完成！总瓦片数：{total_tiles} (Zoom 0-{MAX_ZOOM})")
    print(f"📂 输出目录：{OUTPUT_DIR}/")

if __name__ == '__main__':
    main()
