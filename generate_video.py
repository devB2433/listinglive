"""
图生视频任务 - 拉近镜头效果
"""

from seedance_client import SeedanceClient
import json

# 初始化客户端
client = SeedanceClient(api_key="0f549d2d-333f-4e2e-8289-2030f067aaeb")

# 输入图片路径
image_path = r"C:\Data\projects\Vivid\input\20260305094550_258_43.jpg"

# 提示词
prompt = "请以这张照片为基础，拉进镜头，持续3秒"

print("=" * 60)
print("创建图生视频任务")
print("=" * 60)
print(f"图片: {image_path}")
print(f"提示词: {prompt}")
print(f"时长: 3秒")
print(f"模型: doubao-seedance-1-0-pro-fast-251015")
print("=" * 60)

try:
    # 创建图生视频任务
    result = client.create_image_to_video(
        prompt=prompt,
        image_path=image_path,
        model="doubao-seedance-1-0-pro-fast-251015",
        ratio="adaptive",  # 自适应比例
        duration=3,  # 3秒
        watermark=False
    )

    print("\n任务创建成功!")
    print(json.dumps(result, indent=2, ensure_ascii=False))

    task_id = result['id']
    print(f"\n任务 ID: {task_id}")
    print("\n正在查询任务状态...")

    # 查询任务状态
    status = client.get_task_status(task_id)
    print(json.dumps(status, indent=2, ensure_ascii=False))

    print("\n提示: 视频生成需要一些时间，请使用以下命令查询任务状态:")
    print(f"  python -c \"from seedance_client import SeedanceClient; c = SeedanceClient('0f549d2d-333f-4e2e-8289-2030f067aaeb'); import json; print(json.dumps(c.get_task_status('{task_id}'), indent=2, ensure_ascii=False))\"")

except Exception as e:
    print(f"\n错误: {e}")
    import traceback
    traceback.print_exc()

    # 尝试获取详细错误信息
    if hasattr(e, 'response') and e.response is not None:
        print("\n详细错误信息:")
        try:
            print(e.response.text)
        except:
            pass
