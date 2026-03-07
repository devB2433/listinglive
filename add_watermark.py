"""
给视频添加图片水印（右下角）
"""

from moviepy.editor import VideoFileClip, ImageClip, CompositeVideoClip
from PIL import Image

# 输入文件
video_path = r"C:\Data\projects\Vivid\output\final_video_4s.mp4"
logo_path = r"C:\Data\projects\Vivid\input\logo.jpg"
output_path = r"C:\Data\projects\Vivid\output\final_video_with_watermark.mp4"

print("加载视频...")
video = VideoFileClip(video_path)
video_width, video_height = video.size

print(f"视频尺寸: {video_width}x{video_height}")
print(f"视频时长: {video.duration:.2f}秒")

print("\n加载水印图片...")
# 加载并调整水印大小（占视频宽度的 15%）
logo_img = Image.open(logo_path)
logo_width = int(video_width * 0.15)
logo_height = int(logo_img.height * (logo_width / logo_img.width))

print(f"原始水印尺寸: {logo_img.width}x{logo_img.height}")
print(f"调整后尺寸: {logo_width}x{logo_height}")

# 创建水印 clip
logo = (ImageClip(logo_path)
        .set_duration(video.duration)
        .resize(width=logo_width)
        .set_opacity(0.7))  # 70% 不透明度

# 计算右下角位置（留 20 像素边距）
margin = 20
logo_position = (video_width - logo_width - margin,
                 video_height - logo_height - margin)

print(f"水印位置: 右下角 ({logo_position[0]}, {logo_position[1]})")

# 设置水印位置
logo = logo.set_position(logo_position)

# 合成视频
print("\n合成视频...")
final_video = CompositeVideoClip([video, logo])

# 输出视频
print(f"写入文件: {output_path}")
final_video.write_videofile(
    output_path,
    codec='libx264',
    audio_codec='aac',
    temp_audiofile='temp-audio.m4a',
    remove_temp=True,
    fps=24
)

# 关闭资源
video.close()
logo.close()
final_video.close()

import os
file_size = os.path.getsize(output_path) / 1024 / 1024

print("\n" + "=" * 60)
print("完成!")
print("=" * 60)
print(f"\n带水印的视频: {output_path}")
print(f"文件大小: {file_size:.2f} MB")
print(f"水印位置: 右下角")
print(f"水印透明度: 70%")
