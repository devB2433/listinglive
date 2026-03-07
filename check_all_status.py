"""
快速查询所有任务状态
"""

from seedance_client import SeedanceClient
import json

client = SeedanceClient(api_key="0f549d2d-333f-4e2e-8289-2030f067aaeb")

# 读取任务列表
with open(r"C:\Data\projects\Vivid\video_tasks.json", 'r', encoding='utf-8') as f:
    tasks = json.load(f)

print(f"查询 {len(tasks)} 个任务状态\n")

completed = 0
running = 0
failed = 0

for task in tasks:
    task_id = task['task_id']
    index = task['index']
    image = task['image']

    try:
        status = client.get_task_status(task_id)
        current_status = status.get('status')

        if current_status == 'succeeded':
            print(f"[{index}] [OK] {image}")
            completed += 1
        elif current_status == 'running':
            print(f"[{index}] [...] {image}")
            running += 1
        elif current_status == 'failed':
            print(f"[{index}] [FAIL] {image}")
            failed += 1
        else:
            print(f"[{index}] [?] {current_status} - {image}")

    except Exception as e:
        print(f"[{index}] [ERROR] {image}: {e}")

print(f"\n总计: 完成 {completed}, 运行中 {running}, 失败 {failed}")
