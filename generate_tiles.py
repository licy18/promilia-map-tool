#!/usr/bin/env python3
"""
多层瓦片生成脚本
总地图尺寸：1024×1024
- Zoom 0: 1 张 (1024×1024)
- Zoom 1: 4 张 (512×512)
- Zoom 2: 16 张 (256×256)
"""

import os
from PIL import Image

# 配置
TILES_DIR = 'maps/xinaya-tiles'
OUTPUT_DIR = 'maps/xinaya-tiles-multi'
TILE_SIZE = 256  # 单片瓦片尺寸
GRID_SIZE = 4    # 4x4 网格
MAX_ZOOM = 2     # 0-2 共 3 级

def create_full_map():
    """按行列顺序拼接完整地图（1024×1024）"""
    print("🔧 拼接完整地图...")
    
    full_width = TILE_SIZE * GRID_SIZE  # 1024
    full_height = TILE_SIZE * GRID_SIZE  # 1024
    full_map = Image.new('RGBA', (full_width, full_height))
    
    for row in range(GRID_SIZE):
        for col in range(GRID_SIZE):
            tile_path = f'{TILES_DIR}/tile_{row}_{col}.png'
            if os.path.exists(tile_path):
                tile = Image.open(tile_path)
                # 缩放到 256×256
                tile = tile.resize((TILE_SIZE, TILE_SIZE), Image.Resampling.LANCZOS)
                full_map.paste(tile, (col * TILE_SIZE, row * TILE_SIZE))
                print(f"  ✅ tile_{row}_{col} → ({col * TILE_SIZE}, {row * TILE_SIZE})")
            else:
                print(f"  ⚠️ 瓦片不存在：{tile_path}")
    
    return full_map

def generate_tiles(full_map, zoom):
    """生成指定层级的瓦片"""
    tiles_count = 2 ** zoom  # Zoom 0: 1, Zoom 1: 2, Zoom 2: 4
    tile_size = full_map.width // tiles_count
    
    zoom_dir = f'{OUTPUT_DIR}/{zoom}'
    os.makedirs(zoom_dir, exist_ok=True)
    
    print(f"🔧 生成 Zoom {zoom} 层级 ({tiles_count}x{tiles_count} = {tiles_count**2} 张，每片 {tile_size}×{tile_size})...")
    
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
                print(f"  ✅ 示例：{tile_path} ({tile_size}×{tile_size})")

def main():
    print("🗺️ 多层瓦片生成工具（1024×1024 总图）")
    print("=" * 60)
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # 拼接完整地图
    full_map = create_full_map()
    
    # 保存完整地图
    full_map_path = f'{OUTPUT_DIR}/full_map.png'
    full_map.save(full_map_path, 'PNG')
    print(f"\n✅ 完整地图：{full_map_path} ({full_map.width}×{full_map.height})")
    print()
    
    # 生成各层级瓦片
    for zoom in range(MAX_ZOOM + 1):
        generate_tiles(full_map, zoom)
        print()
    
    total_tiles = sum(4 ** z for z in range(MAX_ZOOM + 1))
    print("=" * 60)
    print(f"✅ 完成！总瓦片数：{total_tiles} (Zoom 0-{MAX_ZOOM})")
    print(f"📂 输出目录：{OUTPUT_DIR}/")
    
    # 显示各层级瓦片尺寸
    print("\n📊 瓦片规格：")
    print(f"  Zoom 0: 1 张   (1024×1024)")
    print(f"  Zoom 1: 4 张   (512×512)")
    print(f"  Zoom 2: 16 张  (256×256)")

if __name__ == '__main__':
    main()
