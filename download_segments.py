"""
手动下载所有视频片段
"""

from seedance_client import SeedanceClient
import json
import os
import requests

client = SeedanceClient(api_key="0f549d2d-333f-4e2e-8289-2030f067aaeb")

# 读取任务列表
with open(r"C:\Data\projects\Vivid\video_tasks.json", 'r', encoding='utf-8') as f:
    tasks = json.load(f)

output_dir = r"C:\Data\projects\Vivid\output\segments"
os.makedirs(output_dir, exist_ok=True)

print(f"下载 {len(tasks)} 个视频片段")
print("=" * 60)

for task in tasks:
    task_id = task['task_id']
    index = task['index']
    image = task['image']

    print(f"\n[{index}] {image}")

    try:
        # 获取任务状态
        status = client.get_task_status(task_id)

        if status.get('status') != 'succeeded':
            print(f"  状态: {status.get('status')} - 跳过")
            continue

        # 获取视频 URL
        video_url = status.get('content', {}).get('video_url')
        if not video_url:
            print("  错误: 未找到视频 URL")
            continue

        # 下载视频
        output_file = os.path.join(output_dir, f"segment_{index:02d}.mp4")
        print(f"  下载中...")

        response = requests.get(video_url, stream=True, timeout=60)
        response.raise_for_status()

        total_size = int(response.headers.get('content-length', 0))

        with open(output_file, 'wb') as f:
            downloaded = 0
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)

        file_size = os.path.getsize(output_file) / 1024 / 1024
        print(f"  [OK] 已保存: {file_size:.2f} MB")

    except Exception as e:
        print(f"  [FAIL] 错误: {e}")

print("\n" + "=" * 60)
print("下载完成!")
print(f"保存位置: {output_dir}")
