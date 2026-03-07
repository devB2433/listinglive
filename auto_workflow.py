"""
自动化流程：等待生成、下载、拼接
"""

from seedance_client import SeedanceClient
import json
import time
import os
import requests
from moviepy.editor import VideoFileClip, concatenate_videoclips
import glob

client = SeedanceClient(api_key="0f549d2d-333f-4e2e-8289-2030f067aaeb")

# 读取任务列表
with open(r"C:\Data\projects\Vivid\video_tasks.json", 'r', encoding='utf-8') as f:
    tasks = json.load(f)

print(f"监控 {len(tasks)} 个视频生成任务")
print("=" * 60)

# 步骤 1: 等待所有任务完成
print("\n[步骤 1/3] 等待视频生成完成...")
max_wait = 600
start_time = time.time()
completed_count = 0

while completed_count < len(tasks) and (time.time() - start_time) < max_wait:
    completed_count = 0
    for task in tasks:
        try:
            status = client.get_task_status(task['task_id'])
            if status.get('status') == 'succeeded':
                completed_count += 1
        except:
            pass

    print(f"  进度: {completed_count}/{len(tasks)} 完成", end='\r')

    if completed_count < len(tasks):
        time.sleep(5)

print(f"\n  完成: {completed_count}/{len(tasks)}")

if completed_count < len(tasks):
    print("警告: 部分任务未完成，继续处理已完成的任务")

# 步骤 2: 下载视频片段
print("\n[步骤 2/3] 下载视频片段...")
output_dir = r"C:\Data\projects\Vivid\output\segments"
os.makedirs(output_dir, exist_ok=True)

downloaded = 0
for task in tasks:
    try:
        status = client.get_task_status(task['task_id'])
        if status.get('status') != 'succeeded':
            continue

        video_url = status.get('content', {}).get('video_url')
        if not video_url:
            continue

        output_file = os.path.join(output_dir, f"segment_{task['index']:02d}.mp4")
        response = requests.get(video_url, stream=True, timeout=60)
        response.raise_for_status()

        with open(output_file, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)

        file_size = os.path.getsize(output_file) / 1024 / 1024
        print(f"  [{task['index']}] 已下载: {file_size:.2f} MB")
        downloaded += 1

    except Exception as e:
        print(f"  [{task['index']}] 下载失败: {e}")

print(f"  完成: {downloaded}/{len(tasks)}")

if downloaded == 0:
    print("错误: 没有成功下载任何视频")
    exit(1)

# 步骤 3: 拼接视频
print("\n[步骤 3/3] 拼接视频...")
segments = sorted(glob.glob(os.path.join(output_dir, "segment_*.mp4")))

clips = []
total_duration = 0

for seg in segments:
    try:
        clip = VideoFileClip(seg)
        clips.append(clip)
        total_duration += clip.duration
    except Exception as e:
        print(f"  加载失败: {os.path.basename(seg)} - {e}")

if not clips:
    print("错误: 没有可用的视频片段")
    exit(1)

print(f"  加载了 {len(clips)} 个片段，总时长: {total_duration:.2f}秒")

final_clip = concatenate_videoclips(clips, method="compose")
output_file = r"C:\Data\projects\Vivid\output\final_video_4s.mp4"

print(f"  写入文件...")
final_clip.write_videofile(
    output_file,
    codec='libx264',
    audio_codec='aac',
    temp_audiofile='temp-audio.m4a',
    remove_temp=True,
    fps=24,
    verbose=False,
    logger=None
)

# 关闭所有片段
for clip in clips:
    clip.close()
final_clip.close()

file_size = os.path.getsize(output_file) / 1024 / 1024

print("\n" + "=" * 60)
print("完成!")
print("=" * 60)
print(f"\n最终视频: {output_file}")
print(f"文件大小: {file_size:.2f} MB")
print(f"总时长: {total_duration:.2f}秒")
