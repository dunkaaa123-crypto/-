#!/usr/bin/env python3
"""firebase-tools 의 apps:list / apps:create --json 출력에서 웹 앱 ID(appId)를 하나 고른다."""
import json, sys


def find(o):
    if isinstance(o, dict):
        if o.get('appId') and str(o.get('platform', 'WEB')).upper() == 'WEB':
            return o['appId']
        for v in o.values():
            r = find(v)
            if r:
                return r
    elif isinstance(o, list):
        for v in o:
            r = find(v)
            if r:
                return r
    return ''


try:
    txt = open(sys.argv[1], encoding='utf8').read()
    start = txt.find('{')
    print(find(json.loads(txt[start:])) if start >= 0 else '')
except Exception:
    print('')
