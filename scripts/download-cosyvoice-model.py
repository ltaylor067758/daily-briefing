#!/usr/bin/env python3
"""download-cosyvoice-model.py — 下载 CosyVoice2-0.5B 模型"""

import os
import sys

MODEL_NAME = 'iic/CosyVoice2-0.5B'
TARGET_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'pretrained_models', 'CosyVoice2-0.5B')

def download():
    os.makedirs(os.path.dirname(TARGET_DIR), exist_ok=True)

    if os.path.isdir(TARGET_DIR) and os.path.exists(os.path.join(TARGET_DIR, 'cosyvoice2.yaml')):
        print(f"模型已存在: {TARGET_DIR}")
        return

    print(f"下载 {MODEL_NAME} → {TARGET_DIR}")
    print("约 2.5GB，首次下载需要几分钟...")

    try:
        from modelscope import snapshot_download
        snapshot_download(MODEL_NAME, local_dir=TARGET_DIR)
        print(f"✓ 下载完成: {TARGET_DIR}")
    except ImportError:
        print("需要 modelscope 库。安装中...")
        import subprocess
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'modelscope'])
        from modelscope import snapshot_download
        snapshot_download(MODEL_NAME, local_dir=TARGET_DIR)
        print(f"✓ 下载完成: {TARGET_DIR}")

if __name__ == '__main__':
    download()
