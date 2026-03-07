"""
使用 moviepy 拼接视频（不需要 ffmpeg）
"""

import os
import glob

try:
    from moviepy.editor import VideoFileClip, concatenate_videoclips
except ImportError:
    print("错误: 未安装 moviepy")
    print("请运行: pip install moviepy")
    exit(1)

segments_dir = r"C:\Data\projects\Vivid\output\segments"
output_file = r"C:\Data\projects\Vivid\output\final_video.mp4"

# 获取所有视频片段
segments = sorted(glob.glob(os.path.join(segments_dir, "segment_*.mp4")))

if not segments:
    print("错误: 未找到视频片段")
    exit(1)

print(f"找到 {len(segments)} 个视频片段")
print("=" * 60)

clips = []
total_duration = 0

for seg in segments:
    print(f"加载: {os.path.basename(seg)}")
    try:
        clip = VideoFileClip(seg)
        clips.append(clip)
        total_duration += clip.duration
        print(f"  时长: {clip.duration:.2f}秒")
    except Exception as e:
        print(f"  错误: {e}")

if not clips:
    print("\n错误: 没有成功加载任何视频片段")
    exit(1)

print(f"\n总时长: {total_duration:.2f}秒")
print("\n开始拼接...")

try:
    final_clip = concatenate_videoclips(clips, method="compose")

    print(f"写入文件: {output_file}")
    final_clip.write_videofile(
        output_file,
        codec='libx264',
        audio_codec='aac',
        temp_audiofile='temp-audio.m4a',
        remove_temp=True,
        fps=24
    )

    # 关闭所有片段
    for clip in clips:
        clip.close()
    final_clip.close()

    file_size = os.path.getsize(output_file) / 1024 / 1024
    print("\n" + "=" * 60)
    print("拼接成功!")
    print("=" * 60)
    print(f"\n最终视频: {output_file}")
    print(f"文件大小: {file_size:.2f} MB")
    print(f"总时长: {total_duration:.2f}秒")

except Exception as e:
    print(f"\n拼接失败: {e}")
    for clip in clips:
        clip.close()
