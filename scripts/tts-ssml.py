"""单句 SSML 语音合成 —— 供 generate-audio.js 调用"""
import sys, asyncio, traceback
from edge_tts import Communicate

async def main():
    try:
        voice = sys.argv[1]
        ssml_file = sys.argv[2]
        output = sys.argv[3]
        with open(ssml_file, 'r', encoding='utf-8') as f:
            ssml = f.read()
        communicate = Communicate(ssml=ssml, voice=voice)
        await communicate.save(output)
    except Exception as e:
        print(f"TTS ERROR: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

asyncio.run(main())
