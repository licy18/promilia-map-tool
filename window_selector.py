import pygetwindow as gw
import tkinter as tk
from tkinter import ttk

class WindowSelector:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("游戏窗口选择器")
        self.root.geometry("400x300")
        self.root.resizable(False, False)
        
        self.selected_window = None
        
        # 创建主框架
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # 标题
        ttk.Label(main_frame, text="请选择游戏窗口", font=("微软雅黑", 12, "bold")).pack(pady=10)
        
        # 窗口列表
        self.window_listbox = tk.Listbox(main_frame, width=50, height=10)
        self.window_listbox.pack(pady=10, fill=tk.BOTH, expand=True)
        
        # 按钮框架
        button_frame = ttk.Frame(main_frame)
        button_frame.pack(pady=10, fill=tk.X)
        
        ttk.Button(button_frame, text="刷新窗口列表", command=self.refresh_windows).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="选择", command=self.select_window).pack(side=tk.RIGHT, padx=5)
        
        # 刷新窗口列表
        self.refresh_windows()
        
    def refresh_windows(self):
        """刷新窗口列表"""
        self.window_listbox.delete(0, tk.END)
        
        try:
            windows = gw.getAllWindows()
            for window in windows:
                if window.title:
                    self.window_listbox.insert(tk.END, window.title)
        except Exception as e:
            print(f"获取窗口列表失败: {e}")
            self.window_listbox.insert(tk.END, "获取窗口列表失败")
    
    def select_window(self):
        """选择窗口"""
        selected_index = self.window_listbox.curselection()
        if selected_index:
            selected_title = self.window_listbox.get(selected_index[0])
            try:
                windows = gw.getWindowsWithTitle(selected_title)
                if windows:
                    self.selected_window = windows[0]
                    print(f"已选择窗口: {selected_title}")
                    print(f"窗口位置: ({self.selected_window.left}, {self.selected_window.top})")
                    print(f"窗口大小: {self.selected_window.width}x{self.selected_window.height}")
                    self.root.destroy()
            except Exception as e:
                print(f"选择窗口失败: {e}")
    
    def run(self):
        """运行窗口选择器"""
        self.root.mainloop()
        return self.selected_window

if __name__ == "__main__":
    selector = WindowSelector()
    window = selector.run()
    if window:
        print(f"最终选择: {window.title}")
    else:
        print("未选择窗口")
