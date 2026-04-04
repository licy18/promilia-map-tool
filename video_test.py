import cv2
import numpy as np
import pyautogui
import pygetwindow as gw
import win32gui
import win32ui
import win32con

def screenshot_bitblt(hwnd, width, height):
    """使用 bitblt 方法截图"""
    try:
        # 获取窗口设备上下文
        hwindc = win32gui.GetWindowDC(hwnd)
        srcdc = win32ui.CreateDCFromHandle(hwindc)
        memdc = srcdc.CreateCompatibleDC()
        bmp = win32ui.CreateBitmap()
        bmp.CreateCompatibleBitmap(srcdc, width, height)
        memdc.SelectObject(bmp)
        
        # 使用 BitBlt 复制图像
        memdc.BitBlt((0, 0), (width, height), srcdc, (0, 0), win32con.SRCCOPY)
        
        # 获取位图数据
        bmpinfo = bmp.GetInfo()
        bmpstr = bmp.GetBitmapBits(True)
        
        # 转换为 numpy 数组
        frame = np.frombuffer(bmpstr, dtype=np.uint8)
        frame = frame.reshape((height, width, 4))
        frame = frame[:, :, :3]  # 去掉 alpha 通道
        frame = cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)
        
        # 释放资源
        srcdc.DeleteDC()
        memdc.DeleteDC()
        win32gui.ReleaseDC(hwnd, hwindc)
        win32gui.DeleteObject(bmp.GetHandle())
        
        return frame
    except Exception as e:
        print(f"[错误] BitBlt 截图失败: {e}")
        return None

def screenshot_wgc(hwnd, width, height, window):
    """使用 Windows Graphics Capture 方法截图"""
    try:
        # 注意：WGC 需要 Windows 10 1809 或更高版本
        # 这里实现一个简化版本，使用 pyautogui 作为备用
        print("[提示] WGC 方法暂未完全实现，使用 pyautogui 作为备用")
        if window:
            left, top = window.left, window.top
            screenshot = pyautogui.screenshot(region=(left, top, width, height))
            frame = np.array(screenshot)
            frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
            return frame
        return None
    except Exception as e:
        print(f"[错误] WGC 截图失败: {e}")
        return None

# 1. 从屏幕或游戏窗口截图
print("请选择截图模式：")
print("1. 全屏截图")
print("2. 游戏窗口截图 (前台)")
print("3. 游戏窗口截图 (后台 BitBlt)")
print("4. 游戏窗口截图 (后台 WGC)")
mode = input("请输入选项 (1/2/3/4): ")

if mode == '2' or mode == '3' or mode == '4':
    # 列出所有窗口
    windows = gw.getAllWindows()
    print("\n可用窗口列表：")
    for i, window in enumerate(windows):
        if window.title:
            print(f"{i+1}. {window.title}")
    
    window_index = int(input("请选择游戏窗口编号：")) - 1
    if 0 <= window_index < len(windows):
        window = windows[window_index]
        if mode == '2':
            # 前台截图模式
            try:
                if window.isMinimized:
                    window.restore()
                window.activate()
            except Exception as e:
                print(f"[警告] 窗口激活失败: {e}")
            print(f"正在从窗口截图：{window.title}")
            # 获取窗口位置和大小
            left, top, width, height = window.left, window.top, window.width, window.height
            # 截图指定区域
            screenshot = pyautogui.screenshot(region=(left, top, width, height))
            # 转换为 OpenCV 格式
            frame = np.array(screenshot)
            frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
        elif mode == '3':
            # 后台 BitBlt 截图模式
            print(f"正在从后台窗口截图：{window.title}")
            # 获取窗口句柄和大小
            hwnd = window._hWnd
            width = window.width
            height = window.height
            # 使用 BitBlt 截图
            frame = screenshot_bitblt(hwnd, width, height)
            if frame is None:
                # 如果 BitBlt 失败，使用 pyautogui 作为备用
                print("[警告] BitBlt 截图失败，使用 pyautogui 作为备用")
                try:
                    if window.isMinimized:
                        window.restore()
                    window.activate()
                except Exception as e:
                    print(f"[警告] 窗口激活失败: {e}")
                left, top, width, height = window.left, window.top, window.width, window.height
                screenshot = pyautogui.screenshot(region=(left, top, width, height))
                frame = np.array(screenshot)
                frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
        else:
            # 后台 WGC 截图模式
            print(f"正在从后台窗口截图 (WGC)：{window.title}")
            # 获取窗口句柄和大小
            hwnd = window._hWnd
            width = window.width
            height = window.height
            # 使用 WGC 截图
            frame = screenshot_wgc(hwnd, width, height, window)
            if frame is None:
                # 如果 WGC 失败，使用 pyautogui 作为备用
                print("[警告] WGC 截图失败，使用 pyautogui 作为备用")
                try:
                    if window.isMinimized:
                        window.restore()
                    window.activate()
                except Exception as e:
                    print(f"[警告] 窗口激活失败: {e}")
                left, top, width, height = window.left, window.top, window.width, window.height
                screenshot = pyautogui.screenshot(region=(left, top, width, height))
                frame = np.array(screenshot)
                frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
    else:
        print("无效的窗口编号，使用全屏截图")
        # 全屏截图
        print("正在全屏截图...")
        screenshot = pyautogui.screenshot()
        # 转换为 OpenCV 格式
        frame = np.array(screenshot)
        frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
else:
    # 全屏截图
    print("正在全屏截图...")
    screenshot = pyautogui.screenshot()
    # 转换为 OpenCV 格式
    frame = np.array(screenshot)
    frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)

# 2. 交互式框选小地图区域
print("请在弹出的窗口中，用鼠标框选出小地图的整体矩形区域。")
print("框选完成后，按回车键 (Enter) 或空格键确认。")
bbox = cv2.selectROI("Select Minimap (Press Enter to confirm)", frame, False)
cv2.destroyAllWindows()

# 获取坐标
x, y, w, h = bbox
print("=========================================")
print(f"请将以下坐标复制到主引擎配置区：")
print(f"MINIMAP_ROI = ({y}, {y+h}, {x}, {x+w})")
print("=========================================")

# 如果是窗口截图，需要调整坐标
if (mode == '2' or mode == '3' or mode == '4') and 0 <= window_index < len(windows):
    print("\n注意：如果您选择了游戏窗口截图，")
    print("上述坐标是相对于所选窗口的，无需调整。")
else:
    print("\n注意：如果您使用了全屏截图，")
    print("上述坐标是相对于整个屏幕的。")

# 3. 截取矩形区域
minimap_rect = frame[y:y+h, x:x+w]

# 4. 制作 3/4 饼干掩膜 (Mask)
# 创建一个全黑的画布
mask = np.zeros((h, w), dtype=np.uint8)

# 在画布中央画一个白色的实心圆，代表完整的小地图
cv2.circle(mask, (w//2, h//2), min(w, h)//2, 255, -1)

# 把左上角"啃掉"：用黑色的矩形覆盖掉左上角的区域
# 假设左上角四分之一是被啃掉的，您可以根据实际情况微调这行代码的坐标
cv2.rectangle(mask, (0, 0), (int(1.5*(w//4)), int(1.5*(h//4))), 0, -1)

# 5. 应用掩膜，查看最终丢给引擎的干净图像
result = cv2.bitwise_and(minimap_rect, minimap_rect, mask=mask)

cv2.imshow("Step 1: Original Cropped", minimap_rect)
cv2.imshow("Step 2: Applied 3/4 Cookie Mask", result)
print("请查看弹出的两张图片对比。如果掩膜遮挡得不够精确，可以微调代码中画圆和画矩形的参数。")
print("看完后按任意键关闭窗口。")
cv2.waitKey(0)
cv2.destroyAllWindows()
