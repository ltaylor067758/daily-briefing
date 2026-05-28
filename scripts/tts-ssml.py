"""单句 SSML 语音合成 —— 供 generate-audio.js 调用"""
import sys, asyncio
from edge_tts import Communicate

async def main():
    voice = sys.argv[1]
    ssml_file = sys.argv[2]
    output = sys.argv[3]
    with open(ssml_file, 'r', encoding='utf-8') as f:
        ssml = f.read()
    communicate = Communicate(ssml=ssml, voice=voice)
    await communicate.save(output)

asyncio.run(main())
