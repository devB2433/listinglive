"""
多图生成视频 - 为每张图片生成视频片段
"""

from seedance_client import SeedanceClient
import json
import os
import glob

# 初始化客户端
client = SeedanceClient(api_key="0f549d2d-333f-4e2e-8289-2030f067aaeb")

# 获取所有图片
input_dir = r"C:\Data\projects\Vivid\input\1"
image_files = sorted(glob.glob(os.path.join(input_dir, "*.jpg")))

print(f"找到 {len(image_files)} 张图片")
print("=" * 60)

# 每张图片的时长（4秒）
duration_per_image = 4

# 专业运镜提示词模板
camera_movements = [
    "缓慢推进镜头，聚焦画面中心",
    "平滑横移镜头，展现画面细节",
    "轻微上升镜头，营造空间感",
    "缓慢拉远镜头，展现全景",
    "稳定跟随镜头，保持画面流畅",
    "柔和旋转镜头，增加动态美感"
]

task_ids = []

for i, image_path in enumerate(image_files, 1):
    print(f"\n[{i}/{len(image_files)}] 处理: {os.path.basename(image_path)}")

    # 为每张图片使用不同的运镜方式
    prompt = f"专业运镜：{camera_movements[i-1]}，画面流畅自然，保持画面稳定"

    print(f"提示词: {prompt}")
    print(f"时长: {duration_per_image}秒")

    try:
        result = client.create_image_to_video(
            prompt=prompt,
            image_path=image_path,
            model="doubao-seedance-1-0-pro-fast-251015",
            ratio="16:9",
            duration=duration_per_image,
            watermark=False
        )

        task_id = result['id']
        task_ids.append({
            'task_id': task_id,
            'image': os.path.basename(image_path),
            'index': i
        })

        print(f"[OK] 任务创建成功: {task_id}")

    except Exception as e:
        print(f"[FAIL] 创建失败: {e}")

print("\n" + "=" * 60)
print(f"共创建 {len(task_ids)} 个视频生成任务")
print("=" * 60)

# 保存任务 ID 列表
tasks_file = r"C:\Data\projects\Vivid\video_tasks.json"
with open(tasks_file, 'w', encoding='utf-8') as f:
    json.dump(task_ids, f, indent=2, ensure_ascii=False)

print(f"\n任务列表已保存到: {tasks_file}")
print("\n任务 ID 列表:")
for task in task_ids:
    print(f"  [{task['index']}] {task['task_id']} - {task['image']}")

print("\n提示: 运行 monitor_multi_tasks.py 来监控所有任务状态")
