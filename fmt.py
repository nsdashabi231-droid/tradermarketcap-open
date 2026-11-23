import json, collections, re

ORIG = '/tmp/orig.json'
orig_raw = open(ORIG).read()

# 原文件风格：每个币是 compact 的，但 parts 数组会换行。逐行重建可保持 diff 最小。
# 更简单可靠的做法：在原文里插入 celestia 条目，不重排其他任何东西。
ex = json.load(open('/tmp/exclude.json'))

def coin_line(k, v):
    body = json.dumps(v, ensure_ascii=False, separators=(', ', ': '))
    # 让 exclude/parts 这类长数组换行，保持与原文件接近的可读性
    return f'  "{k}": {body}'

celestia = {
    "symbol": "TIA",
    "name": "Celestia",
    "supply": {
        "method": "cosmos",
        "lcd": "https://celestia-api.polkachu.com",
        "denom": "utia",
        "explorer": "https://www.mintscan.io/celestia/address/",
        "exclude": ex,
    },
}

d = json.loads(orig_raw, object_pairs_hook=collections.OrderedDict)
d.pop('avalanche', None)
d['celestia'] = celestia

# 手写紧凑风格：_help 单独一行，币每行一个，exclude 每项一行
lines = ['{']
help_txt = d.pop('_help')
lines.append('  "_help": ' + json.dumps(help_txt, ensure_ascii=False) + ',')
items = list(d.items())
for i, (k, v) in enumerate(items):
    comma = ',' if i < len(items) - 1 else ''
    if k == 'celestia':
        sp = v['supply']
        lines.append(f'  "{k}": {{ "symbol": "{v["symbol"]}", "name": "{v["name"]}", "supply": {{')
        lines.append(f'    "method": "cosmos", "lcd": "{sp["lcd"]}", "denom": "{sp["denom"]}",')
        lines.append(f'    "explorer": "{sp["explorer"]}",')
        lines.append('    "exclude": [')
        for j, e in enumerate(sp['exclude']):
            c = ',' if j < len(sp['exclude']) - 1 else ''
            lines.append('      ' + json.dumps(e, ensure_ascii=False, separators=(', ', ': ')) + c)
        lines.append('    ] } }' + comma)
    else:
        lines.append('  ' + json.dumps(k, ensure_ascii=False) + ': ' +
                     json.dumps(v, ensure_ascii=False, separators=(', ', ': ')) + comma)
lines.append('}')
out = '\n'.join(lines) + '\n'

# 校验
back = json.loads(out)
assert 'celestia' in back and 'avalanche' not in back
assert len(back['celestia']['supply']['exclude']) == len(ex)
assert back['bitcoin'] == json.loads(orig_raw)['bitcoin']
open('data-seed/coins.json', 'w').write(out)
print('OK, 行数:', out.count('\n'), '| 币数:', len([k for k in back if k != '_help']))
