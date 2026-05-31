#!/usr/bin/env python3
"""tts-cosyvoice.py — CosyVoice 2 批量语音合成器
用法: python scripts/tts-cosyvoice.py --input dialogue.txt --output tmp_dir/

输入文件格式（每行）: index|voice_instruction|text
输出: 001.mp3, 002.mp3, ...

voice_instruction 用于 instruct2 模式，描述角色音色
"""

import argparse
import os
import sys
import time
import warnings
warnings.filterwarnings('ignore')

# CosyVoice 不在标准路径，需要手动添加
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
COSYVOICE_DIR = os.path.join(os.path.dirname(PROJECT_DIR), 'CosyVoice')
MATCHA_DIR = os.path.join(COSYVOICE_DIR, 'third_party', 'Matcha-TTS')

# 用 C: 格式的绝对路径（Windows Python 不识别 /c/... 格式）
COSYVOICE_DIR = os.path.normpath(os.path.abspath(COSYVOICE_DIR))
MATCHA_DIR = os.path.normpath(os.path.abspath(MATCHA_DIR))

if os.path.isdir(COSYVOICE_DIR):
    sys.path.insert(0, COSYVOICE_DIR)
if os.path.isdir(MATCHA_DIR):
    sys.path.insert(0, MATCHA_DIR)


def find_model_dir():
    """查找 CosyVoice2 模型目录"""
    candidates = [
        os.path.join(PROJECT_DIR, 'pretrained_models', 'CosyVoice2-0.5B'),
        os.path.expanduser('~/.cache/modelscope/hub/iic/CosyVoice2-0.5B'),
    ]
    for c in candidates:
        norm = os.path.normpath(os.path.abspath(c))
        if os.path.isdir(norm) and (
            os.path.exists(os.path.join(norm, 'cosyvoice2.yaml')) or
            os.path.exists(os.path.join(norm, 'config.json'))
        ):
            return norm
    return None


def load_model(model_dir=None):
    """加载 CosyVoice 2 模型"""
    from cosyvoice.cli.cosyvoice import AutoModel
    import torch

    if model_dir is None:
        model_dir = find_model_dir()

    if model_dir is None:
        print("错误: 找不到 CosyVoice2 模型。请先下载。", file=sys.stderr)
        sys.exit(1)

    print(f"加载模型: {model_dir}", file=sys.stderr)
    use_fp16 = torch.cuda.is_available()
    cosyvoice = AutoModel(model_dir=model_dir, load_jit=False, load_trt=False, fp16=use_fp16)
    print(f"  GPU: {torch.cuda.is_available()}, FP16: {use_fp16}", file=sys.stderr)
    return cosyvoice


def synthesize(cosyvoice, text, voice_instruction, output_path, ref_wav=None):
    """合成单条语音，使用 instruct2 模式控制音色"""
    import torch
    import torchaudio

    if ref_wav is None or not os.path.exists(ref_wav):
        ref_wav = os.path.join(COSYVOICE_DIR, 'asset', 'zero_shot_prompt.wav')

    sample_rate = getattr(cosyvoice, 'sample_rate', 24000)

    try:
        chunks = []
        for output in cosyvoice.inference_instruct2(
            text,
            voice_instruction + '<|endofprompt|>',
            ref_wav,
            stream=False,
            text_frontend=True
        ):
            speech = output['tts_speech']
            if isinstance(speech, torch.Tensor):
                chunks.append(speech.detach().cpu())

        if not chunks:
            return False

        audio = torch.cat(chunks, dim=1).squeeze(0)
        if audio.dim() == 1:
            audio = audio.unsqueeze(0)  # [samples] -> [1, samples]

        torchaudio.save(output_path, audio, sample_rate, format='mp3')
        return True

    except Exception as e:
        print(f"  合成错误: {e}", file=sys.stderr)
        return False


def main():
    parser = argparse.ArgumentParser(description='CosyVoice 2 批量语音合成')
    parser.add_argument('--input', required=True, help='对话脚本 (index|voice|text)')
    parser.add_argument('--output', required=True, help='输出目录')
    parser.add_argument('--model-dir', default=None, help='模型目录')
    parser.add_argument('--ref-wav', default=None, help='参考音频路径')
    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"错误: 输入文件不存在 — {args.input}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(args.output, exist_ok=True)

    cosyvoice = load_model(args.model_dir)

    lines = []
    with open(args.input, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split('|', 2)
            if len(parts) >= 3:
                lines.append({
                    'index': int(parts[0]),
                    'voice': parts[1],
                    'text': parts[2],
                })

    print(f"合成 {len(lines)} 个片段...", file=sys.stderr)
    start = time.time()
    success = 0

    for item in lines:
        seg_file = os.path.join(args.output, f"{item['index'] + 1:03d}.mp3")
        ok = synthesize(cosyvoice, item['text'], item.get('voice', ''), seg_file, args.ref_wav)
        if ok:
            success += 1
            print(f"  [{item['index'] + 1}/{len(lines)}] OK ({len(item['text'])}字)")
        else:
            print(f"  [{item['index'] + 1}/{len(lines)}] FAIL")

    elapsed = time.time() - start
    print(f"\n完成: {success}/{len(lines)} 成功, 耗时 {elapsed:.0f}s")


if __name__ == '__main__':
    main()
