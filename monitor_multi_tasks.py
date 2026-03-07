"""
监控多个视频生成任务并下载
"""

from seedance_client import SeedanceClient
import json
import time
import os
import requests

client = SeedanceClient(api_key="0f549d2d-333f-4e2e-8289-2030f067aaeb")

# 读取任务列表
tasks_file = r"C:\Data\projects\Vivid\video_tasks.json"
with open(tasks_file, 'r', encoding='utf-8') as f:
    tasks = json.load(f)

print(f"监控 {len(tasks)} 个视频生成任务")
print("=" * 60)

completed_videos = []
max_wait_time = 600  # 10分钟
start_time = time.time()

while len(completed_videos) < len(tasks):
    elapsed = int(time.time() - start_time)

    if elapsed > max_wait_time:
        print("\n超时！部分任务未完成")
        break

    print(f"\n[{elapsed}秒] 检查任务状态...")

    for task in tasks:
        task_id = task['task_id']
        index = task['index']

        # 跳过已完成的任务
        if any(v['index'] == index for v in completed_videos):
            continue

        try:
            status = client.get_task_status(task_id)
            current_status = status.get('status')

            if current_status == 'succeeded':
                video_url = status.get('content', {}).get('video_url')
                if video_url:
                    completed_videos.append({
                        'index': index,
                        'task_id': task_id,
                        'video_url': video_url,
                        'image': task['image']
                    })
                    print(f"  [OK] [{index}] 完成: {task['image']}")

            elif current_status == 'failed':
                print(f"  [FAIL] [{index}] 失败: {task['image']}")

            elif current_status == 'running':
                print(f"  [...] [{index}] 运行中: {task['image']}")

        except Exception as e:
            print(f"  ! [{index}] 查询错误: {e}")

    if len(completed_videos) == len(tasks):
        break

    time.sleep(10)

print("\n" + "=" * 60)
print(f"完成 {len(completed_videos)}/{len(tasks)} 个视频")
print("=" * 60)

# 下载所有视频
if completed_videos:
    output_dir = r"C:\Data\projects\Vivid\output\segments"
    os.makedirs(output_dir, exist_ok=True)

    print("\n开始下载视频片段...")

    for video in sorted(completed_videos, key=lambda x: x['index']):
        index = video['index']
        video_url = video['video_url']
        output_file = os.path.join(output_dir, f"segment_{index:02d}.mp4")

        print(f"\n[{index}] 下载: {video['image']}")

        try:
            response = requests.get(video_url, stream=True)
            response.raise_for_status()

            with open(output_file, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)

            file_size = os.path.getsize(output_file) / 1024 / 1024
            print(f"  [OK] 已保存: {output_file} ({file_size:.2f} MB)")

        except Exception as e:
            print(f"  [FAIL] 下载失败: {e}")

    print("\n" + "=" * 60)
    print("所有视频片段已下载到:")
    print(output_dir)
    print("\n下一步: 使用 ffmpeg 拼接视频片段")
