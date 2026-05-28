"""批量 SSML 语音合成 —— 使用 chat 情感风格让声音自然"""
import sys, json, asyncio
from edge_tts import Communicate

async def synthesize_one(item):
    voice = item['voice']
    text = item['text']
    output = item['output']
    label = item.get('id', '?')

    # XML 转义
    escaped = (text
        .replace('&', '&amp;').replace('<', '&lt;')
        .replace('>', '&gt;').replace('"', '&quot;'))

    rate = item.get('rate', '-5%')
    pitch = item.get('pitch', '+0Hz')

    # SSML: chat 风格彻底告别新闻播报腔
    ssml = f'''<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
        xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">
<voice name="{voice}">
<mstts:express-as style="chat">
<prosody rate="{rate}" pitch="{pitch}">
{escaped}
</prosody>
</mstts:express-as>
</voice>
</speak>'''

    # 先试 SSML，失败则退回到纯文本
    try:
        # positional args: Communicate(ssml_string, voice_name)
        communicate = Communicate(ssml, voice)
        await communicate.save(output)
        print(f"  SSML {label}")
        return
    except Exception as e:
        err_msg = str(e)[:80]
        print(f"  SSML-fail {label}: {err_msg}")

    # 纯文本回退
    try:
        communicate = Communicate(text, voice)
        await communicate.save(output)
        print(f"  PLAIN {label}")
    except Exception as e:
        print(f"  FAIL {label}: {e}")

async def main():
    with open(sys.argv[1], 'r', encoding='utf-8') as f:
        items = json.load(f)

    for item in items:
        await synthesize_one(item)

    print(f"Done: {len(items)} segments")

asyncio.run(main())
