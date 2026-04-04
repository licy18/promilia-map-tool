import sys

print("Checking dependencies...")
print()

deps = [
    ("opencv-python", "cv2"),
    ("numpy", "numpy"),
    ("websockets", "websockets")
]

missing = []

for pkg_name, import_name in deps:
    try:
        __import__(import_name)
        print(f"[OK] {pkg_name} is installed")
    except ImportError:
        print(f"[MISSING] {pkg_name} is NOT installed")
        missing.append(pkg_name)

print()
if missing:
    print("Please install missing packages with:")
    print(f"  pip install {' '.join(missing)}")
    print()
    print("Or use Tsinghua mirror (faster in China):")
    print(f"  pip install -i https://pypi.tuna.tsinghua.edu.cn/simple {' '.join(missing)}")
    sys.exit(1)
else:
    print("All dependencies are installed!")
    print()
    print("You can now run:")
    print("  python video_test.py")
    print("  python tracker.py")
