import os
import sys
import json
import urllib.request
import urllib.parse
import uuid
import base64
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import subprocess

# Helper to convert HEX to RGB tuple
def hex_to_rgb(hex_str):
    hex_str = hex_str.lstrip('#')
    if len(hex_str) == 3:
        hex_str = ''.join([c*2 for c in hex_str])
    try:
        return tuple(int(hex_str[i:i+2], 16) for i in (0, 2, 4))
    except:
        return (255, 255, 255)

# Time string parser (HH:MM:SS,mmm -> seconds)
def parse_timestamp(ts):
    if not ts: return 0.0
    cleaned = ts.strip().replace(',', '.')
    parts = cleaned.split(':')
    if len(parts) == 3:
        return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
    elif len(parts) == 2:
        return float(parts[0]) * 60 + float(parts[1])
    try:
        return float(cleaned)
    except:
        return 0.0

# Detect if text contains Japanese character blocks
def contains_japanese(text):
    if not text: return False
    for char in text:
        cp = ord(char)
        # Hiragana (\u3040-\u309f), Katakana (\u30a0-\u30ff), Kanji (\u4e00-\u9fff)
        if (0x3040 <= cp <= 0x309F) or (0x30A0 <= cp <= 0x30FF) or (0x4E00 <= cp <= 0x9FFF):
            return True
    return False

# Convert file:/// or percent-encoded URLs to standard local Windows paths
def url_to_local_path(url_str):
    if not url_str:
        return ""
    
    # Unquote spaces/percent-encodings (e.g. %20 -> space, %5C -> backslash)
    unquoted = urllib.parse.unquote(url_str)
    
    # Strip file:// or file:/// prefixes
    if unquoted.startswith('file:///'):
        cleaned = unquoted[8:]
        # On Windows, path is C:/...
        return os.path.normpath(cleaned)
    elif unquoted.startswith('file://'):
        cleaned = unquoted[7:]
        return os.path.normpath(cleaned)
        
    norm = os.path.normpath(unquoted)
    if os.path.exists(norm) and os.path.isfile(norm):
        return norm
        
    return url_str

# Load system TrueType font (includes dynamic CJK/Japanese fallbacks)
def load_font(font_family, font_size, has_japanese=False):
    font_dirs = ["C:\\Windows\\Fonts", "C:\\winnt\\fonts", "/usr/share/fonts", "/System/Library/Fonts"]
    
    font_map = {
        'sans-serif': ['arial.ttf', 'calibri.ttf', 'segoeui.ttf'],
        'serif': ['times.ttf', 'georgia.ttf'],
        'monospace': ['cour.ttf', 'consola.ttf'],
        'outfit': ['arial.ttf'],
        'inter': ['arial.ttf'],
        'cursive': ['comic.ttf']
    }
    
    selected_name = font_family.lower()
    mapped_files = []
    
    # Prioritize standard Windows Japanese fonts if text contains Japanese
    if has_japanese:
        mapped_files.extend(['msgothic.ttc', 'meiryo.ttc', 'msmincho.ttc', 'yugoth.ttc'])
        
    for key, files in font_map.items():
        if key in selected_name:
            mapped_files.extend(files)
            break
            
    mapped_files.extend(['arial.ttf', 'calibri.ttf', 'times.ttf', 'comic.ttf'])
    
    for d in font_dirs:
        for f in mapped_files:
            fpath = os.path.join(d, f)
            if os.path.exists(fpath):
                try:
                    return ImageFont.truetype(fpath, font_size)
                except:
                    pass
    return ImageFont.load_default()

# Get dimensions of text block
def get_text_size(text, font):
    if hasattr(font, 'getsize'):
        return font.getsize(text)
    else:
        bbox = font.getbbox(text)
        if bbox:
            return bbox[2] - bbox[0], bbox[3] - bbox[1]
        return 0, 0

# Wrap text to width
def wrap_text(text, font, max_width):
    words = text.split(' ')
    lines = []
    current_line = []
    for word in words:
        test_line = ' '.join(current_line + [word])
        w, h = get_text_size(test_line, font)
        if w <= max_width:
            current_line.append(word)
        else:
            if current_line:
                lines.append(' '.join(current_line))
            current_line = [word]
    if current_line:
        lines.append(' '.join(current_line))
    return '\n'.join(lines)

# Draw subtitle text on frame
def draw_subtitles(pil_img, text, font, style, width, height):
    draw = ImageDraw.Draw(pil_img, 'RGBA')
    
    max_text_width = int(width * 0.85)
    wrapped_text = wrap_text(text, font, max_text_width)
    lines = wrapped_text.split('\n')
    
    line_sizes = [get_text_size(line, font) for line in lines]
    text_height = sum(size[1] for size in line_sizes) + (len(lines) - 1) * 6
    text_width = max(size[0] for size in line_sizes) if line_sizes else 0
    
    align = style.get('verticalAlign', 'bottom')
    if align == 'top':
        y_start = int(height * 0.12)
    elif align == 'center':
        y_start = (height - text_height) // 2
    else: # bottom
        y_start = int(height * 0.88) - text_height
        
    bg_opacity = float(style.get('bgOpacity', 0.4))
    if bg_opacity > 0 and text_width > 0:
        box_padding_x = int(width * 0.02)
        box_padding_y = int(height * 0.015)
        box_x1 = (width - text_width) // 2 - box_padding_x
        box_y1 = y_start - box_padding_y
        box_x2 = (width + text_width) // 2 + box_padding_x
        box_y2 = y_start + text_height + box_padding_y
        
        draw.rectangle([box_x1, box_y1, box_x2, box_y2], fill=(0, 0, 0, int(bg_opacity * 255)))
        
    outline_width = int(style.get('outlineWidth', 2))
    outline_color = hex_to_rgb(style.get('outlineColor', '#000000'))
    text_color = hex_to_rgb(style.get('textColor', '#ffffff'))
    
    current_y = y_start
    for i, line in enumerate(lines):
        w_line, h_line = line_sizes[i]
        x_line = (width - w_line) // 2
        
        # Draw stroke
        if outline_width > 0:
            for dx in range(-outline_width, outline_width + 1):
                for dy in range(-outline_width, outline_width + 1):
                    if dx != 0 or dy != 0:
                        draw.text((x_line + dx, current_y + dy), line, font=font, fill=outline_color + (255,))
                        
        # Draw fill
        draw.text((x_line, current_y), line, font=font, fill=text_color + (255,))
        current_y += h_line + 6

# Helper to find local video path by STT on PC
def find_local_video(stt, local_videos_dir):
    if not local_videos_dir or not os.path.exists(local_videos_dir):
        return ""
    stt_padded = f"{stt:02d}"
    exts = ['.mp4', '.MP4', '.avi', '.AVI', '.mov', '.MOV', '.webm', '.WEBM']
    filenames = [
        f"segment_{stt_padded}", 
        f"segment_{stt}",
        f"{stt_padded}",
        f"{stt}"
    ]
    for ext in exts:
        for name in filenames:
            fpath = os.path.join(local_videos_dir, name + ext)
            if os.path.exists(fpath) and os.path.isfile(fpath):
                return fpath
    return ""

# Helper to find local image path by STT on PC
def find_local_image(stt, local_images_dir):
    if not local_images_dir or not os.path.exists(local_images_dir):
        return ""
    stt_padded = f"{stt:02d}"
    exts = ['.png', '.jpg', '.jpeg', '.PNG', '.JPG', '.JPEG', '.webp', '.WEBP']
    filenames = [
        f"shot_{stt_padded}", 
        f"shot_{stt}",
        f"{stt_padded}",
        f"{stt}"
    ]
    for ext in exts:
        for name in filenames:
            fpath = os.path.join(local_images_dir, name + ext)
            if os.path.exists(fpath) and os.path.isfile(fpath):
                return fpath
    return ""

# Download utility
def download_url(url, temp_dir):
    if not url: return None
    
    # First, try to resolve as a local path
    local_path = url_to_local_path(url)
    if os.path.exists(local_path) and os.path.isfile(local_path):
        return local_path
        
    # Skip web downloads as requested (block http/https URLs)
    if url.startswith('http://') or url.startswith('https://'):
        print(f"Skipping web download for URL: {url}", flush=True)
        return None
        
    # Parse base64
    if url.startswith('data:image'):
        try:
            header, data = url.split(',', 1)
            ext = header.split(';')[0].split('/')[-1]
            filepath = os.path.join(temp_dir, f"temp_{uuid.uuid4()}.{ext}")
            with open(filepath, "wb") as fh:
                fh.write(base64.b64decode(data))
            return filepath
        except Exception as e:
            print(f"Error decoding base64 data: {e}", file=sys.stderr)
            return None
            
    # Standard URL download
    try:
        ext = url.split('?')[0].split('.')[-1]
        if len(ext) > 4 or not ext.isalnum():
            ext = 'jpg' if 'image' in url else 'mp4'
        filepath = os.path.join(temp_dir, f"download_{str(uuid.uuid4())[:8]}.{ext}")
        
        # Add User-Agent header in case of download blockings
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req, timeout=15) as response, open(filepath, 'wb') as out_file:
            out_file.write(response.read())
        return filepath
    except Exception as e:
        print(f"Failed to download URL {url}: {e}", file=sys.stderr)
        return None

def main():
    if len(sys.argv) < 2:
        print("Usage: python videoCompiler.py <json_payload_or_path>", file=sys.stderr)
        sys.exit(1)
        
    payload_input = sys.argv[1]
    
    # Load JSON Payload
    try:
        if os.path.exists(payload_input):
            with open(payload_input, 'r', encoding='utf-8') as f:
                payload = json.load(f)
        else:
            payload = json.loads(payload_input)
    except Exception as e:
        print(f"Error loading payload JSON: {e}", file=sys.stderr)
        sys.exit(1)
        
    scenes = payload.get('scenes', [])
    style = payload.get('style', {})
    output_file = payload.get('outputFile', 'output.mp4')
    video_type = payload.get('videoType', 'mixed')
    voice_dir = payload.get('voiceDir', '')
    srt_content = payload.get('srtContent', '')
    burn_subtitles = payload.get('burnSubtitles', False)
    
    temp_srt_path = None
    if burn_subtitles and srt_content.strip():
        # Create temp srt file inside project output directory
        project_dir = os.path.dirname(output_file)
        temp_srt_path = os.path.join(project_dir, f"temp_subtitles_{uuid.uuid4().hex}.srt")
        try:
            with open(temp_srt_path, 'w', encoding='utf-8') as f:
                f.write(srt_content)
            print(f"Created temporary SRT file: {temp_srt_path}", flush=True)
            
            # Register atexit cleanup to delete it on exit
            def cleanup_srt():
                if temp_srt_path and os.path.exists(temp_srt_path):
                    try:
                        os.remove(temp_srt_path)
                        print(f"Cleaned up temporary SRT file: {temp_srt_path}", flush=True)
                    except Exception as e:
                        print(f"Warning: failed to remove temporary SRT file {temp_srt_path}: {e}", file=sys.stderr)
            import atexit
            atexit.register(cleanup_srt)
        except Exception as e:
            print(f"Error creating temporary SRT file: {e}", file=sys.stderr)
            temp_srt_path = None
    
    if not scenes:
        print("Error: No scenes list supplied in payload.", file=sys.stderr)
        sys.exit(1)
        
    temp_dir = os.path.join(os.path.dirname(output_file), 'temp_compile_assets')
    os.makedirs(temp_dir, exist_ok=True)
    
    project_dir = os.path.dirname(output_file)
    local_images_dir = os.path.join(project_dir, 'images')
    local_videos_dir = os.path.join(project_dir, 'videos')
    
    # Resolve ffmpeg early to compute audio durations
    ffmpeg_path = "ffmpeg"
    try:
        from static_ffmpeg import run
        ffmpeg_path, _ = run.get_or_fetch_platform_executables_else_raise()
    except Exception as e:
        print(f"Warning: static-ffmpeg failed, using fallback: {e}", file=sys.stderr)

    # Scan for voice MP3 files mapping them to subtitles chronologically
    voice_files = []
    sub_to_voice = {}
    if voice_dir and os.path.exists(voice_dir):
        # 1. Collect all subtitles chronologically
        all_subtitles = []
        seen_sub_ids = set()
        for scene in scenes:
            for sub in scene.get('subtitles', []):
                sub_id = sub.get('id')
                if sub_id and sub_id not in seen_sub_ids:
                    all_subtitles.append(sub)
                    seen_sub_ids.add(sub_id)
        # Sort chronologically by start time
        all_subtitles.sort(key=lambda s: parse_timestamp(s.get('startTime', '')))

        # 2. Collect and naturally sort all MP3 files
        import re
        def natural_sort_key(s):
            return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', s)]
            
        audio_exts = ('.mp3', '.wav', '.m4a', '.ogg', '.aac', '.flac')
        mp3_files = []
        for filename in os.listdir(voice_dir):
            if filename.lower().endswith(audio_exts):
                mp3_files.append(os.path.join(voice_dir, filename))
        mp3_files.sort(key=natural_sort_key)

        # 3. Map MP3 files to subtitles 1-to-1 in order
        for idx, sub in enumerate(all_subtitles):
            if idx < len(mp3_files):
                voice_file = mp3_files[idx]
                s_start = parse_timestamp(sub.get('startTime', ''))
                s_end = parse_timestamp(sub.get('endTime', ''))
                dur = max(0.5, s_end - s_start)
                sub_to_voice[sub.get('id')] = {
                    'path': voice_file,
                    'duration': dur
                }

    # Set subtitle timings matching the original timestamps (no shifting/stretching)
    for scene in scenes:
        scene_subs = scene.get('subtitles', [])
        scene_subs.sort(key=lambda s: parse_timestamp(s.get('startTime', '')))
        
        # Calculate original timestamps for each subtitle block
        for sub in scene_subs:
            s_start = parse_timestamp(sub.get('startTime', ''))
            s_end = parse_timestamp(sub.get('endTime', ''))
            sub['shiftedStart'] = s_start
            sub['shiftedEnd'] = s_end

    # Build final voice_files with shifted start times
    for scene in scenes:
        for sub in scene.get('subtitles', []):
            sub_id = sub.get('id')
            if sub_id in sub_to_voice:
                voice_file = sub_to_voice[sub_id]['path']
                shifted_start = sub.get('shiftedStart', 0.0)
                delay_ms = int(shifted_start * 1000)
                voice_files.append((voice_file, delay_ms))
                        
    print(f"Starting compile job. Type: {video_type}, Voice Dir: {voice_dir}, Voices found: {len(voice_files)}", flush=True)
    
    # 1. Determine video specifications (Width, Height, FPS)
    width, height, fps = 1280, 720, 24
    
    # Scan for first available video to adopt specs
    for s in scenes:
        stt = s.get('stt')
        local_v = find_local_video(stt, local_videos_dir)
        if not local_v:
            v_url = s.get('videoUrl')
            local_v = download_url(v_url, temp_dir)
            
        if local_v and os.path.exists(local_v):
            cap = cv2.VideoCapture(local_v)
            if cap.isOpened():
                width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                cap.release()
                break
                    
    # Initialize output writer
    # Note: Using mp4v codec for output .mp4
    temp_output_file = output_file + ".temp.mp4"
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(temp_output_file, fourcc, fps, (width, height))
    
    if not out.isOpened():
        print(f"Error: Failed to open video writer for {temp_output_file}", file=sys.stderr)
        sys.exit(1)
        
    # Pre-load subtitle font based on style and character sets
    font_size = int(style.get('fontSize', 24))
    font_family = style.get('fontFamily', 'sans-serif')
    
    # Scan if any subtitle contains Japanese characters
    has_japanese = False
    for scene in scenes:
        for sub in scene.get('subtitles', []):
            if contains_japanese(sub.get('text', '')):
                has_japanese = True
                break
        if has_japanese:
            break
            
    # Scale font size based on height (reference width 800px -> scale proportionally)
    font_size_scaled = int(font_size * (width / 800))
    font = load_font(font_family, font_size_scaled, has_japanese)
    
    print(f"Subtitles Font Configuration: CJK support = {has_japanese}", flush=True)
    
    # Process scenes sequentially
    for index, scene in enumerate(scenes):
        stt = scene.get('stt', index + 1)
        target_duration = float(scene.get('targetDuration', 5.0))
        target_frames = int(target_duration * fps)
        scene_start = float(scene.get('sceneStart', 0.0))
        
        v_url = scene.get('videoUrl')
        img_url = scene.get('imageUrl')
        subtitles = scene.get('subtitles', [])
        
        # Check local files first
        local_video_path = find_local_video(stt, local_videos_dir)
        local_image_path = find_local_image(stt, local_images_dir)
                    
        # Apply videoType rules
        use_video_path = local_video_path if local_video_path else (v_url if v_url and not v_url.startswith('http') else None)
        use_image_path = local_image_path if local_image_path else (img_url if img_url and not img_url.startswith('http') else None)
        
        if video_type == 'images_only':
            use_video_path = None
        elif video_type == 'videos_only':
            use_image_path = None
            
        print(f"Processing Scene {index+1}/{len(scenes)} (STT {stt}) - Target Duration: {target_duration}s ({target_frames} frames)...", flush=True)
        
        frames_list = []
        
        # Scenario A: Video clip is available
        video_loaded = False
        if use_video_path:
            local_v = download_url(use_video_path, temp_dir)
            if local_v and os.path.exists(local_v):
                cap = cv2.VideoCapture(local_v)
                if cap.isOpened():
                    raw_frames = []
                    while True:
                        ret, frame = cap.read()
                        if not ret:
                            break
                        raw_frames.append(frame)
                    cap.release()
                    
                    if raw_frames:
                        video_loaded = True
                        n_video = len(raw_frames)
                        
                        # Speed rules
                        if target_duration < 8.0:
                            # Trim to fit exactly target_frames (do not speed up)
                            for f_idx in range(target_frames):
                                if f_idx < n_video:
                                    frames_list.append(raw_frames[f_idx])
                                else:
                                    frames_list.append(raw_frames[-1]) # Pad with last frame
                        else:
                            # Slow down or speed up (stretch/compress frames to fit target_duration exactly)
                            for f_idx in range(target_frames):
                                src_idx = int(f_idx * (n_video / target_frames))
                                src_idx = min(n_video - 1, max(0, src_idx))
                                frames_list.append(raw_frames[src_idx])
                                
        # Scenario B: Fallback to static image
        if not video_loaded and use_image_path:
            local_img = download_url(use_image_path, temp_dir)
            if local_img and os.path.exists(local_img):
                try:
                    pil_img = Image.open(local_img).convert("RGB")
                    # Fit/crop to dimension ratio
                    img_w, img_h = pil_img.size
                    target_ratio = width / height
                    src_ratio = img_w / img_h
                    
                    if src_ratio > target_ratio:
                        # crop sides
                        new_w = int(img_h * target_ratio)
                        offset = (img_w - new_w) // 2
                        pil_img = pil_img.crop((offset, 0, offset + new_w, img_h))
                    elif src_ratio < target_ratio:
                        # crop top/bottom
                        new_h = int(img_w / target_ratio)
                        offset = (img_h - new_h) // 2
                        pil_img = pil_img.crop((0, offset, img_w, offset + new_h))
                        
                    resized_img = pil_img.resize((width, height), Image.Resampling.LANCZOS)
                    
                    # Generate Ken Burns frames
                    for f_idx in range(target_frames):
                        scale = 1.0 + 0.05 * (f_idx / max(1, target_frames))
                        cw = int(width / scale)
                        ch = int(height / scale)
                        cx1 = (width - cw) // 2
                        cy1 = (height - ch) // 2
                        
                        cropped = resized_img.crop((cx1, cy1, cx1 + cw, cy1 + ch))
                        final_frame = cropped.resize((width, height), Image.Resampling.LANCZOS)
                        
                        # Convert to OpenCV frame format (BGR)
                        cv_frame = cv2.cvtColor(np.array(final_frame), cv2.COLOR_RGB2BGR)
                        frames_list.append(cv_frame)
                except Exception as e:
                    print(f"Error loading fallback image: {e}", file=sys.stderr)
                    
        # Scenario C: Ultimate black frame fallback
        if not frames_list:
            print(f"Warning: Scene STT {stt} has no video or image loaded. Using black frames.", file=sys.stderr)
            black_frame = np.zeros((height, width, 3), dtype=np.uint8)
            frames_list = [black_frame] * target_frames
            
        # 3. Burn Subtitles and Write Frames to Writer
        for f_idx, cv_frame in enumerate(frames_list):
            t_elapsed = f_idx / fps
            abs_time = scene_start + t_elapsed
            
            # Find active subtitle
            active_text = ""
            for sub in subtitles:
                s_start = sub.get('shiftedStart', 0.0)
                s_end = sub.get('shiftedEnd', 0.0)
                if abs_time >= s_start and abs_time <= s_end:
                    active_text = sub.get('text', '')
                    break
                    
            # Resize frame if it doesn't match target layout
            if cv_frame.shape[1] != width or cv_frame.shape[0] != height:
                cv_frame = cv2.resize(cv_frame, (width, height))
                
            # If subtitle text is active, draw it!
            if active_text:
                # BGR -> RGB for Pillow
                rgb_frame = cv2.cvtColor(cv_frame, cv2.COLOR_BGR2RGB)
                pil_frame = Image.fromarray(rgb_frame)
                
                # Burn subtitles on PIL image
                draw_subtitles(pil_frame, active_text, font, style, width, height)
                
                # Convert back to OpenCV BGR
                cv_frame = cv2.cvtColor(np.array(pil_frame), cv2.COLOR_RGB2BGR)
                
            out.write(cv_frame)
            
    out.release()
    
    # Merge audio files if voice_files or BGM segments are present
    bgm_config = payload.get('bgm', {})
    bgm_volume_db = float(bgm_config.get('volumeDb', -18.0))
    bgm_segments = bgm_config.get('segments', [])
    valid_bgm_segments = []
    for seg in bgm_segments:
        path_val = seg.get('audioPath')
        if path_val and os.path.exists(path_val):
            valid_bgm_segments.append(seg)

    if voice_files or valid_bgm_segments:
        print(f"Merging audio tracks. Voice files: {len(voice_files)}, BGM segments: {len(valid_bgm_segments)} (Volume: {bgm_volume_db}dB)", flush=True)
        total_duration = sum(float(s.get('targetDuration', 5.0)) for s in scenes)
        
        # Chunking parameters to avoid Windows command line character limits (WinError 206)
        chunk_size = 50
        
        if len(voice_files) <= chunk_size:
            # Direct single-pass merge if voice files count is small
            cmd = [
                ffmpeg_path, '-y',
                '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
                '-i', temp_output_file
            ]
            
            # 1. Add voice files
            for fpath, _ in voice_files:
                cmd.extend(['-i', fpath])
                
            # 2. Add BGM files (stream_loop -1 loops BGM indefinitely)
            for seg in valid_bgm_segments:
                cmd.extend(['-stream_loop', '-1', '-i', seg['audioPath']])
                
            filter_parts = []
            
            # Voice processing (voice inputs start at index 2)
            v_count = len(voice_files)
            for idx, (_, delay_ms) in enumerate(voice_files):
                input_idx = idx + 2
                filter_parts.append(f"[{input_idx}:a]aresample=44100,aformat=channel_layouts=stereo,adelay={delay_ms}:all=true[v{idx}];")
                
            # BGM processing (BGM inputs start at index 2 + v_count)
            b_count = len(valid_bgm_segments)
            for idx, seg in enumerate(valid_bgm_segments):
                input_idx = idx + 2 + v_count
                start = float(seg.get('start', 0.0))
                end = float(seg.get('end', 0.0))
                dur = max(0.1, end - start)
                start_ms = int(start * 1000)
                filter_parts.append(f"[{input_idx}:a]aresample=44100,aformat=channel_layouts=stereo,atrim=0:{dur:.3f},asetpts=PTS-STARTPTS,volume={bgm_volume_db}dB,adelay={start_ms}:all=true[b{idx}];")
                
            # Compile mix commands
            if v_count > 0 and b_count > 0:
                mix_voices = "".join(f"[v{idx}]" for idx in range(v_count))
                filter_parts.append(f"[0:a]{mix_voices}amix=inputs={v_count+1}:duration=first:dropout_transition=0:normalize=0[voice_mixed];")
                
                mix_bgms = "".join(f"[b{idx}]" for idx in range(b_count))
                filter_parts.append(f"[0:a]{mix_bgms}amix=inputs={b_count+1}:duration=first:dropout_transition=0:normalize=0[bgm_mixed];")
                
                filter_parts.append("[voice_mixed][bgm_mixed]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[outa]")
            elif v_count > 0:
                mix_voices = "".join(f"[v{idx}]" for idx in range(v_count))
                filter_parts.append(f"[0:a]{mix_voices}amix=inputs={v_count+1}:duration=first:dropout_transition=0:normalize=0[outa]")
            elif b_count > 0:
                mix_bgms = "".join(f"[b{idx}]" for idx in range(b_count))
                filter_parts.append(f"[0:a]{mix_bgms}amix=inputs={b_count+1}:duration=first:dropout_transition=0:normalize=0[outa]")
            
            if temp_srt_path:
                escaped_srt = temp_srt_path.replace('\\', '/').replace(':', '\\:')
                filter_parts.append(f"[1:v]subtitles='{escaped_srt}'[v_sub];")
                
            filter_complex = "".join(filter_parts)
            filter_script_path = temp_output_file + ".filter.txt"
            try:
                with open(filter_script_path, 'w', encoding='utf-8') as f:
                    f.write(filter_complex)
                    
                cmd.extend([
                    '-filter_complex_script', filter_script_path,
                    '-map', '[v_sub]' if temp_srt_path else '1:v',
                    '-map', '[outa]',
                    '-c:v', 'libx264',
                    '-preset', 'superfast',
                    '-threads', '0',
                    '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac',
                    '-t', f"{total_duration:.3f}",
                    output_file
                ])
                
                print("Running FFmpeg merge...", flush=True)
                res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, encoding='utf-8', errors='replace')
                if res.returncode != 0:
                    print(f"FFmpeg Merge Error: {res.stderr}", file=sys.stderr)
                    # Fallback: copy temp video directly
                    if os.path.exists(output_file):
                        os.remove(output_file)
                    os.rename(temp_output_file, output_file)
                else:
                    if os.path.exists(temp_output_file):
                        os.remove(temp_output_file)
            except Exception as e:
                print(f"Error executing FFmpeg: {e}", file=sys.stderr)
                # Fallback
                if os.path.exists(output_file):
                    os.remove(output_file)
                os.rename(temp_output_file, output_file)
            finally:
                if os.path.exists(filter_script_path):
                    os.remove(filter_script_path)
        else:
            # Chunked merge to handle large number of voice files safely on Windows
            chunk_files = []
            try:
                # 1. Mix voice files in chunks of 50
                for i in range(0, len(voice_files), chunk_size):
                    voice_chunk = voice_files[i:i+chunk_size]
                    chunk_output_path = temp_output_file + f".chunk_{i}.wav"
                    
                    chunk_cmd = [
                        ffmpeg_path, '-y',
                        '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100'
                    ]
                    for fpath, _ in voice_chunk:
                        chunk_cmd.extend(['-i', fpath])
                        
                    filter_parts = []
                    for idx, (_, delay_ms) in enumerate(voice_chunk):
                        input_idx = idx + 1 # starts at 1
                        filter_parts.append(f"[{input_idx}:a]aresample=44100,aformat=channel_layouts=stereo,adelay={delay_ms}:all=true[a{idx}];")
                        
                    mix_inputs = "".join(f"[a{idx}]" for idx in range(len(voice_chunk)))
                    filter_parts.append(f"[0:a]{mix_inputs}amix=inputs={len(voice_chunk)+1}:duration=first:dropout_transition=0:normalize=0[outa]")
                    
                    filter_complex = "".join(filter_parts)
                    chunk_filter_script = chunk_output_path + ".filter.txt"
                    
                    try:
                        with open(chunk_filter_script, 'w', encoding='utf-8') as f:
                            f.write(filter_complex)
                        chunk_cmd.extend([
                            '-filter_complex_script', chunk_filter_script,
                            '-map', '[outa]',
                            '-c:a', 'pcm_s16le', # WAV format
                            '-t', f"{total_duration:.3f}",
                            chunk_output_path
                        ])
                        
                        res = subprocess.run(chunk_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, encoding='utf-8', errors='replace')
                        if res.returncode != 0:
                            raise Exception(f"FFmpeg chunk mix error: {res.stderr}")
                        chunk_files.append(chunk_output_path)
                    finally:
                        if os.path.exists(chunk_filter_script):
                            os.remove(chunk_filter_script)
                            
                # 2. Merge all chunk WAV files and BGM files with the temp video file
                cmd = [
                    ffmpeg_path, '-y',
                    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100'
                ]
                # Add voice chunks (inputs 1 to C)
                for chunk_file in chunk_files:
                    cmd.extend(['-i', chunk_file])
                    
                # Add BGM inputs (inputs C+1 to C+B)
                for seg in valid_bgm_segments:
                    cmd.extend(['-stream_loop', '-1', '-i', seg['audioPath']])
                    
                # Add video input (input C+B+1)
                cmd.extend(['-i', temp_output_file])
                
                v_count = len(chunk_files)
                b_count = len(valid_bgm_segments)
                video_input_idx = v_count + b_count + 1
                
                filter_parts = []
                
                # Mix voice chunks
                for idx in range(v_count):
                    input_idx = idx + 1
                    filter_parts.append(f"[{input_idx}:a]aresample=44100,aformat=channel_layouts=stereo[v{idx}];")
                mix_voices = "".join(f"[v{idx}]" for idx in range(v_count))
                if b_count > 0:
                    filter_parts.append(f"[0:a]{mix_voices}amix=inputs={v_count+1}:duration=first:dropout_transition=0:normalize=0[voice_mixed];")
                else:
                    filter_parts.append(f"[0:a]{mix_voices}amix=inputs={v_count+1}:duration=first:dropout_transition=0:normalize=0[outa]")
                
                # BGM processing (BGM inputs start at index v_count + 1)
                for idx, seg in enumerate(valid_bgm_segments):
                    input_idx = idx + v_count + 1
                    start = float(seg.get('start', 0.0))
                    end = float(seg.get('end', 0.0))
                    dur = max(0.1, end - start)
                    start_ms = int(start * 1000)
                    filter_parts.append(f"[{input_idx}:a]aresample=44100,aformat=channel_layouts=stereo,atrim=0:{dur:.3f},asetpts=PTS-STARTPTS,volume={bgm_volume_db}dB,adelay={start_ms}:all=true[b{idx}];")
                    
                # Mix BGMs
                if b_count > 0:
                    mix_bgms = "".join(f"[b{idx}]" for idx in range(b_count))
                    filter_parts.append(f"[0:a]{mix_bgms}amix=inputs={b_count+1}:duration=first:dropout_transition=0:normalize=0[bgm_mixed];")
                    
                # Combine Voice and BGM
                if b_count > 0:
                    filter_parts.append("[voice_mixed][bgm_mixed]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[outa]")
                
                if temp_srt_path:
                    escaped_srt = temp_srt_path.replace('\\', '/').replace(':', '\\:')
                    filter_parts.append(f"[{video_input_idx}:v]subtitles='{escaped_srt}'[v_sub];")
                    
                filter_complex = "".join(filter_parts)
                filter_script_path = temp_output_file + ".filter.txt"
                try:
                    with open(filter_script_path, 'w', encoding='utf-8') as f:
                        f.write(filter_complex)
                        
                    cmd.extend([
                        '-filter_complex_script', filter_script_path,
                        '-map', '[v_sub]' if temp_srt_path else f'{video_input_idx}:v', # map the video stream
                        '-map', '[outa]',
                        '-c:v', 'libx264',
                        '-preset', 'superfast',
                        '-threads', '0',
                        '-pix_fmt', 'yuv420p',
                        '-c:a', 'aac',
                        '-t', f"{total_duration:.3f}",
                        output_file
                    ])
                    
                    print("Running FFmpeg chunked merge...", flush=True)
                    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, encoding='utf-8', errors='replace')
                    if res.returncode != 0:
                        print(f"FFmpeg Merge Error: {res.stderr}", file=sys.stderr)
                        # Fallback: copy temp video directly
                        if os.path.exists(output_file):
                            os.remove(output_file)
                        os.rename(temp_output_file, output_file)
                    else:
                        if os.path.exists(temp_output_file):
                            os.remove(temp_output_file)
                finally:
                    if os.path.exists(filter_script_path):
                        os.remove(filter_script_path)
            except Exception as e:
                print(f"Error executing FFmpeg chunked merge: {e}", file=sys.stderr)
                # Fallback
                if os.path.exists(output_file):
                    os.remove(output_file)
                os.rename(temp_output_file, output_file)
            finally:
                # Clean up chunk files
                for chunk_file in chunk_files:
                    if os.path.exists(chunk_file):
                        try:
                            os.remove(chunk_file)
                        except Exception as ce:
                            print(f"Warning: failed to remove temp chunk {chunk_file}: {ce}", file=sys.stderr)
    else:
        # No voice files, re-encode temp video directly to H.264 with yuv420p using FFmpeg
        print("Re-encoding video to standard H.264 (yuv420p)...", flush=True)
        ffmpeg_path = "ffmpeg"
        try:
            from static_ffmpeg import run
            ffmpeg_path, _ = run.get_or_fetch_platform_executables_else_raise()
        except Exception as e:
            print(f"Warning: static-ffmpeg failed, using fallback: {e}", file=sys.stderr)
            
        cmd = [
            ffmpeg_path, '-y',
            '-i', temp_output_file,
        ]
        if temp_srt_path:
            escaped_srt = temp_srt_path.replace('\\', '/').replace(':', '\\:')
            cmd.extend(['-vf', f"subtitles='{escaped_srt}'"])
        cmd.extend([
            '-c:v', 'libx264',
            '-preset', 'superfast',
            '-threads', '0',
            '-pix_fmt', 'yuv420p',
            '-an', # no audio since there are no voice files
            output_file
        ])
        try:
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, encoding='utf-8', errors='replace')
            if res.returncode != 0:
                print(f"FFmpeg Re-encoding Error: {res.stderr}", file=sys.stderr)
                # Fallback to copy/rename directly
                if os.path.exists(output_file):
                    os.remove(output_file)
                os.rename(temp_output_file, output_file)
            else:
                if os.path.exists(temp_output_file):
                    os.remove(temp_output_file)
        except Exception as e:
            print(f"Error executing FFmpeg re-encoding: {e}", file=sys.stderr)
            if os.path.exists(output_file):
                os.remove(output_file)
            os.rename(temp_output_file, output_file)
        
    # Cleanup downloads
    try:
        for root, dirs, files in os.walk(temp_dir, topdown=False):
            for name in files:
                os.remove(os.path.join(root, name))
            for name in dirs:
                os.rmdir(os.path.join(root, name))
        os.rmdir(temp_dir)
    except Exception as e:
        print(f"Cleanup warning: {e}", file=sys.stderr)
        
    print("Video export complete!", flush=True)

if __name__ == '__main__':
    main()
