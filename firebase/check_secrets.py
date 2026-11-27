#!/usr/bin/env python3
"""배포 전에 GitHub Secrets 값을 점검하고, 배포할 프로젝트 ID를 정한다.

- FIREBASE_SERVICE_ACCOUNT 가 올바른 서비스 계정 키(JSON)인지 확인
- 키 파일 안의 project_id 를 기준으로 삼고, FIREBASE_PROJECT_ID 와 다르면 알려 준 뒤 키의 값을 사용
- 결과 프로젝트 ID 를 GitHub Actions 출력(project)으로 넘긴다
비밀 값 자체는 출력하지 않는다.
"""
import json, os, sys

raw = os.environ.get('FIREBASE_SERVICE_ACCOUNT', '').strip()
given = os.environ.get('PROJECT_ID', '').strip()
out = os.environ.get('GITHUB_OUTPUT')


def fail(msg):
    print('::error::' + msg)
    sys.exit(1)


if not raw:
    fail('FIREBASE_SERVICE_ACCOUNT 비밀값이 비어 있습니다. 서비스 계정 키(JSON) 파일 내용 전체를 넣어 주세요.')
try:
    sa = json.loads(raw)
except Exception:
    fail('FIREBASE_SERVICE_ACCOUNT 가 올바른 JSON 이 아닙니다. 키 파일을 메모장으로 열어 { 부터 } 까지 전체를 다시 복사해 넣어 주세요. (일부만 복사되면 이 오류가 납니다)')
if sa.get('type') != 'service_account' or not sa.get('private_key') or not sa.get('client_email'):
    fail('FIREBASE_SERVICE_ACCOUNT 가 서비스 계정 키가 아닙니다. Firebase 콘솔 > 프로젝트 설정 > 서비스 계정 > "새 비공개 키 생성"으로 받은 파일 내용을 넣어 주세요.')

key_project = (sa.get('project_id') or '').strip()
if not key_project:
    fail('서비스 계정 키에 project_id 가 없습니다. 키를 다시 생성해 주세요.')

web = os.environ.get('FIREBASE_WEB_CONFIG', '')
import re as _re
def _get(k):
    m = _re.search(r'["\']?' + k + r'["\']?\s*:\s*["\']([^"\']+)["\']', web)
    return m.group(1).strip() if m else ''
api, wproj = _get('apiKey'), _get('projectId')
if web:
    if not (api.startswith('AIza') and len(api) == 39):
        fail(f'FIREBASE_WEB_CONFIG 의 apiKey 가 올바르지 않습니다 (AIza 로 시작하는 39자여야 하는데 {len(api)}자). '
             'Firebase 콘솔 > 프로젝트 설정 > 일반 > 내 앱 > "SDK 설정 및 구성"의 "구성(Config)"에서 firebaseConfig 블록 전체를 다시 복사해 넣어 주세요.')
    if wproj and wproj != key_project:
        fail('FIREBASE_WEB_CONFIG 와 FIREBASE_SERVICE_ACCOUNT 가 서로 다른 Firebase 프로젝트의 값입니다 '
             f'(웹 설정 프로젝트 ID 길이 {len(wproj)}자, 키 프로젝트 ID 길이 {len(key_project)}자). 같은 프로젝트에서 두 값을 모두 다시 복사해 넣어 주세요.')
    print('웹 설정(apiKey 형식, 프로젝트 일치) 확인 완료')
if not given:
    print('FIREBASE_PROJECT_ID 가 비어 있어 서비스 계정 키의 프로젝트 ID 를 사용합니다.')
elif given != key_project:
    print('::warning::FIREBASE_PROJECT_ID 값이 서비스 계정 키의 프로젝트 ID 와 다릅니다. '
          f'(입력값 길이 {len(given)}자, 키의 값 길이 {len(key_project)}자) 키의 프로젝트 ID 로 배포합니다. '
          '나중에 FIREBASE_PROJECT_ID 를 Firebase 콘솔 > 프로젝트 설정 > 일반 의 "프로젝트 ID" 로 고쳐 두세요.')
else:
    print('FIREBASE_PROJECT_ID 와 서비스 계정 키의 프로젝트가 일치합니다.')

print('서비스 계정 키 확인 완료 (계정 종류: firebase-adminsdk' if 'firebase-adminsdk' in sa['client_email'] else '서비스 계정 키 확인 완료 (계정 종류: 기타', ')', sep='')
if out:
    with open(out, 'a', encoding='utf8') as f:
        f.write(f'project={key_project}\n')
