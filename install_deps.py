import sys
import subprocess

print("=" * 60)
print("普罗米利亚地图追踪工具 - 依赖安装助手")
print("=" * 60)
print()

required_packages = [
    ("opencv-python", "cv2"),
    ("numpy", "numpy"),
    ("websockets", "websockets")
]

missing_packages = []

print("[1/3] 检查已安装的依赖...")
for pkg_name, import_name in required_packages:
    try:
        __import__(import_name)
        print(f"  ✓ {pkg_name} 已安装")
    except ImportError:
        print(f"  ✗ {pkg_name} 未安装")
        missing_packages.append(pkg_name)

print()

if not missing_packages:
    print("🎉 所有依赖已安装完成！")
    print()
    print("现在可以运行:")
    print("  python video_test.py  # 校准小地图")
    print("  python tracker.py     # 运行追踪")
    sys.exit(0)

print("[2/3] 开始安装缺失的依赖...")
print(f"需要安装: {', '.join(missing_packages)}")
print()

for pkg in missing_packages:
    print(f"正在安装 {pkg}...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", pkg])
        print(f"  ✓ {pkg} 安装成功")
    except Exception as e:
        print(f"  ✗ {pkg} 安装失败: {e}")
        print()
        print("请尝试手动运行以下命令安装:")
        print(f"  pip install {' '.join(missing_packages)}")
        print()
        print("或者使用国内镜像源:")
        print(f"  pip install -i https://pypi.tuna.tsinghua.edu.cn/simple {' '.join(missing_packages)}")
        sys.exit(1)

print()
print("[3/3] 验证安装...")
all_ok = True
for pkg_name, import_name in required_packages:
    try:
        __import__(import_name)
        print(f"  ✓ {pkg_name} 验证通过")
    except ImportError:
        print(f"  ✗ {pkg_name} 验证失败")
        all_ok = False

print()
if all_ok:
    print("=" * 60)
    print("✅ 所有依赖安装成功！")
    print("=" * 60)
    print()
    print("现在可以运行:")
    print("  python video_test.py  # 校准小地图")
    print("  python tracker.py     # 运行追踪")
else:
    print("❌ 部分依赖安装失败，请检查上述错误信息")
