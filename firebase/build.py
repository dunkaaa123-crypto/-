#!/usr/bin/env python3
"""Firebase 배포본 만들기.

저장소 루트의 index.html(claude.ai 아티팩트와 같은 화면 소스)을 감싸서
firebase/dist/public/index.html 을 만들고, 보안 규칙에 소유자 이메일을 넣어
firebase/dist/firestore.rules 를 만든다.

환경 변수
  FIREBASE_WEB_CONFIG  Firebase 콘솔 > 프로젝트 설정 > 웹 앱의 firebaseConfig (JSON)
  OWNER_EMAIL          소유자(관리자) 이메일. 여러 명이면 쉼표로 구분
"""
import json, os, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT.parent / 'index.html'
OUT = ROOT / 'dist'
SDK = '10.12.2'


def main():
    app = SRC.read_text(encoding='utf8')
    cfg_raw = os.environ.get('FIREBASE_WEB_CONFIG', '').strip()
    cfg = {}
    if cfg_raw:
        # 콘솔에서 복사한 JS 객체 형태(키에 따옴표 없음)도 받아 준다
        txt = cfg_raw
        m = re.search(r'\{.*\}', txt, re.S)
        if m:
            txt = m.group(0)
        txt = re.sub(r'([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:', r'\1"\2":', txt)
        txt = txt.replace("'", '"')
        txt = re.sub(r',\s*}', '}', txt)
        cfg = json.loads(txt)
    owners = [e.strip().lower() for e in os.environ.get('OWNER_EMAIL', '').split(',') if e.strip()]

    title = re.search(r'<title>(.*?)</title>', app)
    head = (
        '<!doctype html><html lang="ko"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        f'<title>{title.group(1) if title else "영업관리 시스템"}</title>'
        '<meta name="robots" content="noindex">'
        '</head><body>'
    )
    sdk = ''.join(
        f'<script src="https://www.gstatic.com/firebasejs/{SDK}/{n}"></script>'
        for n in ('firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-firestore-compat.js')
    )
    cfg_js = '<script>window.__FBCFG=' + json.dumps(cfg, ensure_ascii=False).replace('<', '\\u003c') + ';</script>'
    shim = '<script>' + (ROOT / 'shim.js').read_text(encoding='utf8') + '</script>'
    auth = (ROOT / 'auth.html').read_text(encoding='utf8')
    # 앱 본문에서 <title> 은 head 로 옮겼으니 제거
    body = re.sub(r'<title>.*?</title>', '', app, count=1)
    page = head + sdk + cfg_js + shim + auth + body + '</body></html>'

    (OUT / 'public').mkdir(parents=True, exist_ok=True)
    (OUT / 'public' / 'index.html').write_text(page, encoding='utf8')

    rules = (ROOT / 'firestore.rules.tmpl').read_text(encoding='utf8')
    rules = rules.replace('__OWNER_EMAILS__', json.dumps(owners))
    (OUT / 'firestore.rules').write_text(rules, encoding='utf8')

    print('built', OUT / 'public' / 'index.html', f'({len(page):,} bytes)')
    print('owners:', owners or '(없음 — OWNER_EMAIL 을 설정하세요)')
    if not cfg:
        print('경고: FIREBASE_WEB_CONFIG 가 비어 있어 로그인 화면에 "설정 필요"가 표시됩니다.', file=sys.stderr)


if __name__ == '__main__':
    main()
