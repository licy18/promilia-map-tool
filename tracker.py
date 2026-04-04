import cv2
import numpy as np
import asyncio
import websockets
import json
import threading
import pyautogui
import time
import win32gui
import win32ui
import win32con
import win32api
import ctypes
from ctypes import windll, POINTER, c_int, c_void_p

# Windows Graphics Capture 相关
class RECT(ctypes.Structure):
    _fields_ = [
        ("left", c_int),
        ("top", c_int),
        ("right", c_int),
        ("bottom", c_int),
    ]

class DesktopWindowId(ctypes.Structure):
    _fields_ = [
        ("value", c_void_p),
    ]

# 加载 WGC 相关 DLL
dwmapi = windll.dwmapi
user32 = windll.user32
ole32 = windll.ole32

# 初始化 COM
ole32.CoInitialize(None)

# ================= 配置区 =================
BIG_MAP_PATH = 'maps/shalulu.png' 
MINIMAP_ROI = (78, 189, 31, 143)

# === 新增：雷达校准参数 ===
# 如果小地图看起来比大地图"放大"了，就把这个值调小（比如 0.8 或 0.5）
# 如果小地图看起来更远，就调大（比如 1.2 或 2.0）。您可以根据实际情况微调！
MINIMAP_ZOOM = 0.95

# === 新增：屏幕截图配置 ===
# 截图模式：'fullscreen' 或 'window'
SCREENSHOT_MODE = 'fullscreen'
# 目标窗口标题（当 SCREENSHOT_MODE 为 'window' 时使用）
TARGET_WINDOW_TITLE = 'Promilia'
# 后台截图方法：'pyautogui', 'bitblt', 'wgc'
SCREENSHOT_METHOD = 'bitblt'  # 默认使用 bitblt 方法
# ==========================================

current_location = {"lat": 0, "lng": 0}

def get_window_by_title(title):
    """根据标题查找窗口"""
    import pygetwindow as gw
    windows = gw.getWindowsWithTitle(title)
    if windows:
        return windows[0]
    return None

def screenshot_bitblt(hwnd, x, y, width, height):
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
        memdc.BitBlt((0, 0), (width, height), srcdc, (x, y), win32con.SRCCOPY)
        
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

def screenshot_wgc(hwnd, x, y, width, height):
    """使用 Windows Graphics Capture 方法截图"""
    try:
        # 注意：WGC 需要 Windows 10 1809 或更高版本
        # 这里实现一个简化版本，实际上 WGC 的完整实现比较复杂
        # 这里我们使用 pyautogui 作为备用
        print("[提示] WGC 方法暂未完全实现，使用 pyautogui 作为备用")
        window = get_window_by_title(TARGET_WINDOW_TITLE)
        if window:
            window_left, window_top = window.left, window.top
            abs_x1 = window_left + x
            abs_y1 = window_top + y
            screenshot = pyautogui.screenshot(region=(abs_x1, abs_y1, width, height))
            frame = np.array(screenshot)
            frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
            return frame
        return None
    except Exception as e:
        print(f"[错误] WGC 截图失败: {e}")
        return None

def get_screen_frame():
    """获取屏幕截图"""
    try:
        # 优化：只截取小地图区域，而不是整个屏幕
        if SCREENSHOT_MODE == 'window':
            # 尝试获取指定窗口
            window = get_window_by_title(TARGET_WINDOW_TITLE)
            if window:
                # 获取窗口句柄
                hwnd = window._hWnd
                # 计算小地图在窗口内的位置
                y1, y2, x1, x2 = MINIMAP_ROI
                width = x2 - x1
                height = y2 - y1
                
                # 根据配置选择截图方法
                if SCREENSHOT_METHOD == 'bitblt':
                    frame = screenshot_bitblt(hwnd, x1, y1, width, height)
                elif SCREENSHOT_METHOD == 'wgc':
                    frame = screenshot_wgc(hwnd, x1, y1, width, height)
                else:
                    # 使用 pyautogui 方法
                    if window.isMinimized:
                        # 如果窗口最小化，先恢复
                        window.restore()
                        time.sleep(0.1)  # 等待窗口激活
                    # 获取窗口位置
                    window_left, window_top = window.left, window.top
                    # 计算小地图在屏幕上的绝对位置
                    abs_x1 = window_left + x1
                    abs_y1 = window_top + y1
                    # 只截图小地图区域
                    screenshot = pyautogui.screenshot(region=(abs_x1, abs_y1, width, height))
                    frame = np.array(screenshot)
                    frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
                
                if frame is not None:
                    return frame
                else:
                    # 如果截图失败，使用备用方法
                    print("[警告] 后台截图失败，使用 pyautogui 作为备用")
                    if window.isMinimized:
                        window.restore()
                        time.sleep(0.1)
                    window_left, window_top = window.left, window.top
                    abs_x1 = window_left + x1
                    abs_y1 = window_top + y1
                    screenshot = pyautogui.screenshot(region=(abs_x1, abs_y1, width, height))
                    frame = np.array(screenshot)
                    frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
                    return frame
            else:
                # 如果找不到窗口，使用全屏截图并裁剪小地图区域
                print("[警告] 找不到指定窗口，使用全屏截图")
                screenshot = pyautogui.screenshot()
                # 裁剪小地图区域
                y1, y2, x1, x2 = MINIMAP_ROI
                screenshot = screenshot.crop((x1, y1, x2, y2))
                frame = np.array(screenshot)
                frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
                return frame
        else:
            # 全屏截图并裁剪小地图区域
            screenshot = pyautogui.screenshot()
            y1, y2, x1, x2 = MINIMAP_ROI
            screenshot = screenshot.crop((x1, y1, x2, y2))
            frame = np.array(screenshot)
            frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
            return frame
    except Exception as e:
        print(f"[错误] 屏幕截图失败: {e}")
        return None

def vision_engine():
    global current_location
    try:
        print("[视觉引擎] 正在加载大地图并初始化 SIFT 工业级引擎...")
        big_map = cv2.imread(BIG_MAP_PATH, cv2.IMREAD_GRAYSCALE)
        if big_map is None:
            print("[致命错误] 找不到大地图图片！请确保 maps/shalulu.png 文件存在。")
            return

        # 【核心升级 1】：换装 SIFT 引擎！
        sift = cv2.SIFT_create(nfeatures=3000)
        kp_big, des_big = sift.detectAndCompute(big_map, None)
        
        # SIFT 专用的 FLANN 匹配器参数 (KDTree 算法)
        index_params = dict(algorithm=1, trees=5)
        flann = cv2.FlannBasedMatcher(index_params, dict(checks=50))
        
        y1, y2, x1, x2 = MINIMAP_ROI
        h, w = y2-y1, x2-x1

        print("[视觉引擎] 正在生成双重精确掩膜...")
        mask = np.zeros((h, w), dtype=np.uint8)
        # 画出可见的圆形区域
        cv2.circle(mask, (w//2, h//2), min(w, h)//2, 255, -1)
        # 遮掉左上角的缺口
        cv2.rectangle(mask, (0, 0), (int(1.5*(w//4)), int(1.5*(h//4))), 0, -1)
        
        # 【核心升级 2】：在正中心挖一个黑洞，遮蔽玩家箭头 UI！(半径约 15 像素，可根据实际情况调大)
        cv2.circle(mask, (w//2, h//2), 15, 0, -1)

        print("[视觉引擎] 启动屏幕截图分析！")
        frame_counter = 0
        
        last_valid_loc = None
        MAX_JUMP = 150        
        SMOOTHING = 0.6       
        MAP_WIDTH = 2048  
        MAP_HEIGHT = 2048     

        # 性能优化：帧跳过机制
        FRAME_SKIP = 2  # 每 3 帧处理一次
        process_counter = 0  # 处理帧计数器
        
        while True:
            # 帧跳过
            if frame_counter % FRAME_SKIP != 0:
                frame_counter += 1
                time.sleep(0.01)  # 短暂休眠，减少 CPU 占用
                continue
            
            frame = get_screen_frame()
            if frame is None:
                time.sleep(0.1)
                frame_counter += 1
                continue
                
            frame_counter += 1
            process_counter += 1
            # 现在 frame 已经是小地图区域了，不需要再裁剪
            minimap_rect = frame
            
            # 应用掩膜
            minimap_clean = cv2.bitwise_and(minimap_rect, minimap_rect, mask=mask)
            gray_mini = cv2.cvtColor(minimap_clean, cv2.COLOR_BGR2GRAY)
            
            # 【核心升级 3】：对小地图进行物理缩放补偿，强制拉近两张图的比例尺！
            if MINIMAP_ZOOM != 1.0:
                gray_mini = cv2.resize(gray_mini, None, fx=MINIMAP_ZOOM, fy=MINIMAP_ZOOM)
            
            # 提取 SIFT 特征
            kp_mini, des_mini = sift.detectAndCompute(gray_mini, None)
            good_matches_count = 0 
            
            if des_mini is not None and len(des_mini) > 2:
                matches = flann.knnMatch(des_mini, des_big, k=2)
                # SIFT 的判断阈值通常设为 0.7
                good = [m_set[0] for m_set in matches if len(m_set)==2 and m_set[0].distance < 0.7 * m_set[1].distance]
                good_matches_count = len(good)
                
                # SIFT 找出的点质量极高，门槛保持 10 个即可
                if len(good) > 8:
                    src_pts = np.float32([kp_mini[m.queryIdx].pt for m in good]).reshape(-1,1,2)
                    dst_pts = np.float32([kp_big[m.trainIdx].pt for m in good]).reshape(-1,1,2)
                    
                    # 【核心补偿】：因为我们之前把小地图缩放了，算出来的坐标矩阵必须反向补偿回来！
                    if MINIMAP_ZOOM != 1.0:
                        src_pts = src_pts / MINIMAP_ZOOM

                    M, _ = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
                    
                    if M is not None:
                        center_pt = np.float32([[[w/2, h/2]]])
                        mapped_pt = cv2.perspectiveTransform(center_pt, M)
                        
                        raw_x = float(mapped_pt[0][0][0])
                        raw_y = float(mapped_pt[0][0][1])
                        
                        if raw_x < 0 or raw_x > MAP_WIDTH or raw_y < 0 or raw_y > MAP_HEIGHT:
                            continue 
                            
                        new_loc = np.array([raw_x, raw_y])
                        
                        if last_valid_loc is not None:
                            dist = np.linalg.norm(new_loc - last_valid_loc)
                            if dist > MAX_JUMP:
                                continue 
                            smoothed_loc = last_valid_loc + SMOOTHING * (new_loc - last_valid_loc)
                        else:
                            smoothed_loc = new_loc
                            
                        last_valid_loc = smoothed_loc
                        current_location["lng"] = float(smoothed_loc[0])
                        current_location["lat"] = 2048-float(smoothed_loc[1])
                  
                        print(f"🎯 [SIFT 锁定] 经度 {current_location['lng']:.1f}, 纬度 {current_location['lat']:.1f}")

            if process_counter % 10 == 0:  # 每处理 10 帧输出一次监控信息
                features_found = len(des_mini) if des_mini is not None else 0
                status = "良好" if good_matches_count > 10 else "丢失目标"
                print(f"📊 [SIFT 监控] 提取特征: {features_found} | 强匹配: {good_matches_count} -> 状态: {status}")

            # 显示处理后的小地图
            cv2.imshow('Tracking... (Press Q to exit)', minimap_clean)
            # 检查是否按下 Q 键退出
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
            
            # 控制处理频率，避免过于占用系统资源
            time.sleep(0.033)  # 约 30 FPS

        cv2.destroyAllWindows()
    except Exception as e:
        print(f"[致命错误] 视觉引擎异常: {e}")
        cv2.destroyAllWindows()

# === 修复的 WebSocket 16.0 兼容通信模块 ===
async def ws_server(websocket):
    print("[通信服务] 网页端已成功连接！")
    try:
        while True:
            try:
                # 无论是否有有效数据，都发送 current_location
                # 这样前端可以知道连接是活跃的
                await websocket.send(json.dumps(current_location))
                await asyncio.sleep(0.1) 
            except Exception as e:
                # 发送数据时的错误，不中断连接，也不打印错误信息
                # 避免大量的错误日志输出
                await asyncio.sleep(0.1)
    except websockets.exceptions.ConnectionClosed:
        print("[通信服务] 网页端连接已断开。")
    except Exception as e:
        print(f"[通信服务] 服务器异常: {e}")

async def main_ws():
    print("[通信服务] WebSocket 服务器正在启动 (端口 8765)...")
    async with websockets.serve(ws_server, "localhost", 8765):
        await asyncio.Future()

def start_ws():
    asyncio.run(main_ws())

if __name__ == "__main__":
    # 启动 WebSocket 独立线程
    threading.Thread(target=start_ws, daemon=True).start()
    # 主线程启动视觉分析引擎
    vision_engine()
