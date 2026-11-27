/* Firebase 어댑터: index.html 앱이 쓰는 window.claude.use('db' | 'user') API를
   Firebase Authentication + Cloud Firestore로 제공한다. 로그인 화면도 여기서 처리한다. */
(function () {
  'use strict';
  window.__FB = true;
  var cfg = window.__FBCFG;
  var $ = function (s) { return document.querySelector(s); };
  var readyResolve;
  var ready = new Promise(function (r) { readyResolve = r; });

  function show(view, msg) {
    var box = $('#authBox');
    if (!box) return;
    document.documentElement.classList.add('auth-open');
    box.querySelectorAll('[data-view]').forEach(function (el) { el.hidden = el.getAttribute('data-view') !== view; });
    var m = $('#authMsg');
    if (m) { m.textContent = msg || ''; m.className = 'auth-msg' + (msg && /않|실패|없|틀|오류|짧/.test(msg) ? ' bad' : ''); }
    $('#auth').hidden = false;
  }
  function hide() { $('#auth').hidden = true; document.documentElement.classList.remove('auth-open'); }

  if (!cfg || !cfg.apiKey || typeof firebase === 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      show('setup', 'Firebase 설정이 아직 들어가지 않았습니다. firebase/README.md의 설정 단계를 진행해 주세요.');
    });
    window.claude = { use: function () { return new Promise(function () {}); } };
    return;
  }

  firebase.initializeApp(cfg);
  var auth = firebase.auth();
  auth.languageCode = 'ko';
  var fs = firebase.firestore();
  try { fs.settings({ ignoreUndefinedProperties: true, merge: true }); } catch (e) {}

  var ERR = {
    'auth/invalid-email': '이메일 형식이 올바르지 않습니다.',
    'auth/user-not-found': '등록되지 않은 이메일이거나 비밀번호가 틀렸습니다.',
    'auth/wrong-password': '등록되지 않은 이메일이거나 비밀번호가 틀렸습니다.',
    'auth/invalid-credential': '등록되지 않은 이메일이거나 비밀번호가 틀렸습니다.',
    'auth/invalid-login-credentials': '등록되지 않은 이메일이거나 비밀번호가 틀렸습니다.',
    'auth/email-already-in-use': '이미 비밀번호를 만든 이메일입니다. 로그인하거나 비밀번호 찾기를 이용하세요.',
    'auth/weak-password': '비밀번호가 너무 짧습니다. 8자 이상으로 만들어 주세요.',
    'auth/too-many-requests': '시도가 너무 많아 잠시 막혔습니다. 잠시 후 다시 시도해 주세요.',
    'auth/network-request-failed': '네트워크 오류입니다. 연결을 확인해 주세요.'
  };
  function amsg(e) { return ERR[e && e.code] || ('오류: ' + ((e && e.message) || e)); }

  /* ---------- 로그인 화면 ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    var box = $('#authBox');
    box.addEventListener('click', function (e) {
      var go = e.target.closest('[data-go]');
      if (go) { e.preventDefault(); show(go.getAttribute('data-go')); return; }
      var act = e.target.closest('[data-act]');
      if (!act) return;
      e.preventDefault();
      var a = act.getAttribute('data-act');
      if (a === 'logout') auth.signOut();
      if (a === 'reload') { var u = auth.currentUser; if (u) u.reload().then(function () { onUser(auth.currentUser, true); }); }
      if (a === 'resend') { var u2 = auth.currentUser; if (u2) u2.sendEmailVerification().then(function () { show('verify', '인증 메일을 다시 보냈습니다. 메일함(스팸함 포함)을 확인하세요.'); }).catch(function (er) { show('verify', amsg(er)); }); }
    });
    box.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, id = f.id;
      var email = (f.querySelector('[name=email]') || {}).value;
      email = String(email || '').trim().toLowerCase();
      var pw = (f.querySelector('[name=pw]') || {}).value || '';
      if (id === 'fLogin') {
        show('login', '로그인 중…');
        auth.signInWithEmailAndPassword(email, pw).catch(function (er) { show('login', amsg(er)); });
      }
      if (id === 'fSignup') {
        var pw2 = f.querySelector('[name=pw2]').value;
        if (pw.length < 8) { show('signup', '비밀번호가 너무 짧습니다. 8자 이상으로 만들어 주세요.'); return; }
        if (pw !== pw2) { show('signup', '비밀번호 확인이 일치하지 않습니다.'); return; }
        show('signup', '만드는 중…');
        auth.createUserWithEmailAndPassword(email, pw).then(function (c) {
          return c.user.sendEmailVerification();
        }).then(function () {
          show('verify', email + ' 으로 인증 메일을 보냈습니다. 메일의 링크를 누른 뒤 아래 [인증 완료]를 누르세요.');
        }).catch(function (er) { show('signup', amsg(er)); });
      }
      if (id === 'fReset') {
        auth.sendPasswordResetEmail(email).then(function () {
          show('login', email + ' 으로 비밀번호 재설정 메일을 보냈습니다. 메일의 링크에서 새 비밀번호를 만든 뒤 로그인하세요.');
        }).catch(function (er) { show('reset', amsg(er)); });
      }
    });
    show('loading');
    auth.onAuthStateChanged(function (u) { onUser(u, false); });
  });

  var session = null;
  function onUser(u, manual) {
    if (!u) { if (session) { location.reload(); return; } show('login'); return; }
    if (!u.emailVerified) { show('verify', manual ? '아직 인증되지 않았습니다. 메일의 인증 링크를 누른 뒤 다시 눌러 주세요.' : u.email + ' 의 메일 인증이 필요합니다. 메일함(스팸함 포함)의 인증 링크를 눌러 주세요.'); return; }
    var email = String(u.email || '').toLowerCase();
    u.getIdToken(true).then(function () {
      return fs.doc('allow/' + email).get().then(function (d) { return d.exists ? d.data() : null; }).catch(function () { return null; });
    }).then(function (prof) {
      if (prof) return { prof: prof, owner: !!prof.owner };
      // 허용 목록에 없지만 소유자(규칙에 등록된 관리자)면 명단을 읽을 수 있다
      return fs.collection('members').limit(1).get().then(function () { return { prof: null, owner: true }; }).catch(function () { return null; });
    }).then(function (res) {
      if (!res) { show('denied', email + ' 은(는) 명단에 등록되지 않은 이메일입니다. 관리자에게 명단 등록을 요청하세요.'); return; }
      session = { uid: u.uid, email: email, prof: res.prof, owner: res.owner };
      hide();
      addLogout(email);
      readyResolve(session);
    });
  }
  function addLogout(email) {
    var h = document.querySelector('header');
    if (!h || $('#fbOut')) return;
    var b = document.createElement('button');
    b.id = 'fbOut'; b.className = 'btn sm'; b.type = 'button'; b.textContent = '로그아웃';
    b.title = email; b.style.marginLeft = '8px';
    b.addEventListener('click', function () { auth.signOut(); });
    h.appendChild(b);
  }

  /* ---------- db 어댑터 (claude 'db' 계약과 같은 모양) ---------- */
  function mapErr(e) {
    var c = e && e.code;
    return { code: c === 'permission-denied' ? 'invalid_argument' : c === 'unavailable' ? 'unavailable' : c === 'resource-exhausted' ? 'resource_exhausted' : 'invalid_argument', message: (e && e.message) || String(e) };
  }
  function snapDoc(d) { return { id: d.id, exists: d.exists, data: function () { return d.data(); }, metadata: { fromCache: d.metadata.fromCache, hasPendingWrites: d.metadata.hasPendingWrites } }; }
  function snapQuery(q) { return { docs: q.docs.map(snapDoc), size: q.size, empty: q.empty, metadata: { fromCache: q.metadata.fromCache, hasPendingWrites: q.metadata.hasPendingWrites } }; }
  function rethrow(e) { throw mapErr(e); }
  function docRef(ref) {
    return {
      id: ref.id, path: ref.path,
      get: function () { return ref.get().then(snapDoc, rethrow); },
      set: function (d) { return ref.set(d).catch(rethrow); },
      update: function (d) { return ref.update(d).catch(rethrow); },
      delete: function () { return ref.delete().catch(rethrow); },
      onSnapshot: function (n, er) { return ref.onSnapshot(function (s) { n(snapDoc(s)); }, function (e) { if (er) er(mapErr(e)); }); },
      collection: function (p) { return colRef(ref.collection(p)); }
    };
  }
  function query(q) {
    return {
      where: function (f, op, v) { return query(q.where(f, op, v)); },
      orderBy: function (f, d) { return query(q.orderBy(f, d || 'asc')); },
      limit: function (n) { return query(q.limit(n)); },
      get: function () { return q.get().then(snapQuery, rethrow); },
      onSnapshot: function (n, er) { return q.onSnapshot(function (s) { n(snapQuery(s)); }, function (e) { if (er) er(mapErr(e)); }); }
    };
  }
  function colRef(c) {
    var o = query(c);
    o.path = c.path;
    o.doc = function (id) { return docRef(id ? c.doc(id) : c.doc()); };
    o.add = function (d) { var r = c.doc(); return r.set(d).then(function () { return docRef(r); }, rethrow); };
    return o;
  }
  var DB = { doc: function (p) { return docRef(fs.doc(p)); }, collection: function (p) { return colRef(fs.collection(p)); } };

  /* ---------- user 어댑터 ---------- */
  var USER = {
    id: function () { return ready.then(function (s) { return s.uid; }); },
    me: function () { return ready.then(function (s) { return { id: s.uid, email: s.email, name: (s.prof && s.prof.name) || '' }; }); },
    isOwner: function () { return ready.then(function (s) { return !!s.owner; }); },
    canEdit: function () { return ready.then(function (s) { return !!s.owner || (s.prof && s.prof.role === '사업부장'); }); },
    can: function () { return ready.then(function () { return true; }); },
    profiles: function () { return Promise.resolve({}); }
  };

  window.claude = {
    use: function (name) {
      return ready.then(function () { return name === 'db' ? DB : name === 'user' ? USER : null; });
    }
  };
})();
