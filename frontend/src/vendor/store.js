/* ==========================================================================
   READ VPN Learning — Prototype Store (localStorage)
   Keys (prefix rv:v1:)  session · focus · b:guest · b:free · b:paid
   Business rules: access / expiry A & B / package / progress / quiz 2 tracks /
   essay review / CE & certificate issuing / cart & coupons / orders
   ========================================================================== */
(function () {
  'use strict';
  var RV = window.RV = window.RV || {};
  var D = RV.data;
  var PREFIX = 'rv:v1:';
  var SEED_VERSION = 5;

  /* ---------------- storage (with in-memory fallback) ---------------- */
  var mem = {};
  var canLS = (function () { try { var k = '__rv_t'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (e) { return false; } })();
  function read(key, fb) {
    try { var raw = canLS ? localStorage.getItem(PREFIX + key) : mem[key]; return raw == null ? fb : JSON.parse(raw); } catch (e) { return fb; }
  }
  function write(key, val) {
    var s = JSON.stringify(val);
    try { if (canLS) localStorage.setItem(PREFIX + key, s); else mem[key] = s; } catch (e) { mem[key] = s; }
  }
  function removeKey(key) { try { if (canLS) localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ } delete mem[key]; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  /* ---------------- dates ---------------- */
  function now() { return new Date(); }
  function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = '0' + n; return n; }
  function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function isoDT(d) { return isoDate(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
  function daysFromNow(n) { var d = now(); d.setDate(d.getDate() + n); return isoDate(d); }
  function parseD(s) {
    if (!s) return null;
    var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return new Date(s);
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / 86400000); }
  function isPast(dateStr) { if (!dateStr) return false; var d = parseD(dateStr); d.setHours(23, 59, 59, 999); return d < now(); }
  function rand(n) { return Math.floor(Math.random() * Math.pow(10, n || 4)); }

  /* ---------------- lookups ---------------- */
  var courseMap = {}; D.courses.forEach(function (c) { courseMap[c.id] = c; });
  var catMap = {}; D.categories.forEach(function (c) { catMap[c.id] = c; });
  function course(id) { return courseMap[id] || null; }
  function category(id) { return catMap[id] || null; }
  function instructor(id) { return D.instructors[id] || null; }
  function lessons(c) { var out = []; c.modules.forEach(function (m) { m.lessons.forEach(function (l) { out.push(l); }); }); return out; }
  function lesson(c, lid) { var list = lessons(c); for (var i = 0; i < list.length; i++) { if (list[i].id === lid) return list[i]; } return null; }
  function moduleOf(c, lid) { for (var i = 0; i < c.modules.length; i++) { if (c.modules[i].lessons.some(function (l) { return l.id === lid; })) return c.modules[i]; } return null; }
  function quizLesson(c) { return lessons(c).filter(function (l) { return l.type === 'quiz'; })[0] || null; }
  function coupon(code) { code = String(code || '').trim().toUpperCase(); return D.coupons.filter(function (c) { return c.code === code; })[0] || null; }

  /* ---------------- session & buckets ---------------- */
  var DEFAULT_SESSION = { state: 'guest', memberType: 'vet', pkgStatus: 'active', pending: null, simulateError: false, seedVersion: SEED_VERSION };
  var session = read('session', null);
  var cache = {};

  function buildGuest() {
    return { cart: D.seeds.guest.cart.map(function (cid) { return { cid: cid, addedAt: isoDT(now()), selected: true }; }) };
  }
  function buildMember(kind) {
    var s = D.seeds[kind];
    var b = {
      profile: clone(s.profile), interests: clone(s.interests), consents: clone(s.consents), tier: s.tier,
      pkg: s.pkg ? { startAt: daysFromNow(-s.pkg.startDaysAgo), endAt: daysFromNow(s.pkg.endInDays) } : { startAt: null, endAt: null },
      cart: [], checkout: null, entitlements: {}, progress: {}, choice: {}, essays: {}, orders: [], certificates: [], ce: [],
      notifications: [], quizDraft: {}, notes: {}, devices: clone(D.seeds.devices), qa: {}, seq: kind === 'paid' ? 40 : 70
    };
    if (kind === 'paid') {
      Object.keys(s.entitlements).forEach(function (cid) { var e = clone(s.entitlements[cid]); e.history = []; b.entitlements[cid] = e; });
      Object.keys(s.progress).forEach(function (cid) {
        var sp = s.progress[cid], c = course(cid);
        var p = { lessons: {}, last: null, activityAt: null };
        var list = lessons(c).filter(function (l) { return l.type !== 'quiz'; });
        var doneIds = sp.done === 'ALL' ? list.map(function (l) { return l.id; }) : sp.done;
        doneIds.forEach(function (lid) { var l = lesson(c, lid); p.lessons[lid] = { f: 1, done: true, pos: l ? l.sec : 0 }; });
        if (sp.partial) {
          var pl = lesson(c, sp.partial.lid);
          p.lessons[pl.id] = { f: sp.partial.f, done: false, pos: Math.round((pl.sec || 0) * sp.partial.f) };
          p.last = pl.id;
        } else { p.last = doneIds[doneIds.length - 1]; }
        p.activityAt = sp.activity || (sp.activityDaysAgo != null ? daysFromNow(-sp.activityDaysAgo) + 'T' + (sp.activityTime || '20:00') + ':00' : null);
        b.progress[cid] = p;
      });
      b.choice = clone(s.choice); b.essays = clone(s.essays); b.certificates = clone(s.certificates);
      b.ce = clone(s.ce); b.orders = clone(s.orders); b.notifications = clone(s.notifications);
    }
    return b;
  }
  function bucket(key) {
    key = key || session.state;
    if (!cache[key]) {
      cache[key] = read('b:' + key, null) || (key === 'guest' ? buildGuest() : buildMember(key));
    }
    return cache[key];
  }
  function saveBucket(key) { key = key || session.state; if (cache[key]) write('b:' + key, cache[key]); }
  function saveSession() { write('session', session); }

  function resetAll() {
    ['session', 'focus', 'b:guest', 'b:free', 'b:paid'].forEach(removeKey);
    session = clone(DEFAULT_SESSION);
    cache = {};
    saveSession();
    ['guest', 'free', 'paid'].forEach(function (k) { bucket(k); saveBucket(k); });
  }
  if (!session || session.seedVersion !== SEED_VERSION) { resetAll(); }

  /* ---------------- events ---------------- */
  var listeners = [];
  function on(fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; }
  function emit(reason) { listeners.slice().forEach(function (fn) { try { fn(reason || 'change'); } catch (e) { console.error(e); } }); }
  function commit(reason, key) { saveBucket(key); emit(reason); }
  window.addEventListener('storage', function (e) {
    if (e.key && e.key.indexOf(PREFIX) === 0) {
      session = read('session', session) || clone(DEFAULT_SESSION);
      cache = {};
      emit('external');
    }
  });

  /* ---------------- user / session API ---------------- */
  function isLoggedIn() { return session.state !== 'guest'; }
  function setState(state) {
    if (['guest', 'free', 'paid'].indexOf(state) < 0 || state === session.state) return;
    session.state = state; saveSession(); emit('state');
  }
  function login(kind) {
    kind = kind === 'paid' ? 'paid' : 'free';
    var g = bucket('guest'), m = bucket(kind);
    g.cart.forEach(function (it) { if (!m.cart.some(function (x) { return x.cid === it.cid; })) m.cart.push(clone(it)); });
    g.cart = [];
    saveBucket('guest'); saveBucket(kind);
    session.state = kind; saveSession(); emit('login');
  }
  function register(data) {
    var b = buildMember('free');
    b.profile = Object.assign(b.profile, {
      prefix: data.prefix || b.profile.prefix, firstName: data.firstName || b.profile.firstName, lastName: data.lastName || b.profile.lastName,
      email: data.email || b.profile.email, phone: data.phone || '', pdpa: true
    });
    cache.free = b;
    var g = bucket('guest');
    g.cart.forEach(function (it) { if (!b.cart.some(function (x) { return x.cid === it.cid; })) b.cart.push(clone(it)); });
    g.cart = [];
    notifyTo('free', { type: 'welcome', title: 'สมัครสมาชิกสำเร็จ', desc: 'ยินดีต้อนรับสู่ READ VPN Learning — เริ่มจากคอร์สฟรีหรือค้นหาคอร์สที่สนใจได้เลย', cta: { label: 'ดูคอร์สฟรี', href: 'courses.html?access=free' } });
    saveBucket('guest'); saveBucket('free');
    session.state = 'free';
    if (data.memberType) session.memberType = data.memberType;
    saveSession(); emit('register');
  }
  function logout() { session.state = 'guest'; saveSession(); emit('logout'); }
  function setMemberType(t) {
    if (t !== 'vet' && t !== 'student') return;
    session.memberType = t; saveSession();
    ['free', 'paid'].forEach(function (k) {
      var p = bucket(k).profile;
      if (t === 'student') { p.prefix = 'นักศึกษาสัตวแพทย์'; }
      else if (p.prefix === 'นักศึกษาสัตวแพทย์') { p.prefix = 'สัตวแพทย์หญิง'; }
      saveBucket(k);
    });
    emit('memberType');
  }
  function setPkgStatus(s) { if (['active', 'expiring', 'expired'].indexOf(s) < 0) return; session.pkgStatus = s; saveSession(); emit('pkg'); }
  function setSimulateError(v) { session.simulateError = !!v; saveSession(); emit('simulateError'); }
  function setPending(p) { session.pending = p || null; saveSession(); }
  function takePending() { var p = session.pending; session.pending = null; saveSession(); return p; }

  var PREFIX_ABBR = { 'สัตวแพทย์หญิง': 'สพ.ญ.', 'นายสัตวแพทย์': 'น.สพ.', 'นักศึกษาสัตวแพทย์': '' };
  function displayName(p) {
    if (!p) return '';
    var abbr = PREFIX_ABBR[p.prefix] != null ? PREFIX_ABBR[p.prefix] : '';
    return (abbr ? abbr + ' ' : '') + (p.firstName || '') + ' ' + (p.lastName || '');
  }
  function thaiInitial(s) { s = String(s || '').replace(/^[เแโใไ]/, ''); return s.charAt(0); }
  function initials(p) { return p ? thaiInitial(p.firstName) + thaiInitial(p.lastName) : ''; }

  function user(key) {
    key = key || session.state;
    if (key === 'guest') return { state: 'guest', loggedIn: false, memberType: session.memberType };
    var b = bucket(key);
    return {
      state: key, loggedIn: true, memberType: session.memberType, memberTypeLabel: D.memberTypes[session.memberType],
      profile: b.profile, name: displayName(b.profile), initials: initials(b.profile), pkg: pkgInfo(key)
    };
  }

  /* ---------------- package ---------------- */
  function plansFor(mt) { return D.packages[mt || session.memberType] || D.packages.vet; }
  function planById(id) {
    var all = D.packages.vet.concat(D.packages.student);
    return all.filter(function (p) { return p.id === id; })[0] || null;
  }
  function pkgInfo(key) {
    key = key || session.state;
    if (key === 'guest') return null;
    var b = bucket(key), plans = plansFor();
    var plan = plans.filter(function (p) { return p.tier === b.tier; })[0] || plans.filter(function (p) { return p.tier === 'online'; })[0] || plans[0];
    if (plan.tier === 'free') {
      return { plan: plan, status: 'active', startAt: null, endAt: null, daysLeft: null, isPaidPlan: false, coversCourses: false, memberType: session.memberType };
    }
    var endAt = b.pkg.endAt;
    if (key === 'paid' && session.pkgStatus === 'expiring') endAt = daysFromNow(12);
    if (key === 'paid' && session.pkgStatus === 'expired') endAt = daysFromNow(-8);
    var left = daysBetween(now(), parseD(endAt));
    var status = left < 0 ? 'expired' : (left <= 30 ? 'expiring' : 'active');
    return { plan: plan, status: status, startAt: b.pkg.startAt, endAt: endAt, daysLeft: left, isPaidPlan: true, coversCourses: plan.includesCourses && status !== 'expired', memberType: session.memberType };
  }
  function changePlan(planId) {
    if (!isLoggedIn()) return null;
    var p = planById(planId); if (!p) return null;
    var b = bucket();
    b.tier = p.tier;
    if (p.tier !== 'free') { b.pkg = { startAt: isoDate(now()), endAt: daysFromNow(365) }; }
    if (session.state === 'paid') { session.pkgStatus = 'active'; saveSession(); }
    notifyTo(session.state, { type: 'purchase', title: 'เปลี่ยนแพ็กเกจสำเร็จ (จำลอง)', desc: 'แพ็กเกจปัจจุบัน: ' + p.name, cta: { label: 'ดูแพ็กเกจของฉัน', href: 'account-package.html' } });
    commit('pkg');
    return p;
  }
  function renewPlan() {
    if (!isLoggedIn()) return null;
    var b = bucket(), info = pkgInfo();
    if (!info || !info.isPaidPlan) return null;
    var base = info.status === 'expired' ? now() : parseD(info.endAt);
    var end = new Date(base); end.setDate(end.getDate() + 365);
    b.pkg = { startAt: info.status === 'expired' ? isoDate(now()) : b.pkg.startAt, endAt: isoDate(end) };
    if (session.state === 'paid') { session.pkgStatus = 'active'; saveSession(); }
    notifyTo(session.state, { type: 'purchase', title: 'ต่ออายุแพ็กเกจสำเร็จ (จำลอง)', desc: info.plan.name + ' ใช้งานได้ถึง ' + isoDate(end), cta: { label: 'ดูแพ็กเกจของฉัน', href: 'account-package.html' } });
    commit('pkg');
    return true;
  }

  /* ---------------- access ---------------- */
  function entitlement(cid, key) { var b = bucket(key); return (b.entitlements && b.entitlements[cid]) || null; }
  function access(cid, key) {
    key = key || session.state;
    var c = course(cid);
    var r = { has: false, reason: 'none', source: null, ent: null, packageCovered: false, expiredType: null, renewed: false };
    if (!c) { r.reason = 'missing'; return r; }
    if (key === 'guest') { r.reason = c.status === 'ended' ? 'ended' : 'guest'; if (c.status === 'ended') r.expiredType = 'A'; return r; }
    var e = entitlement(cid, key); r.ent = e;
    var pk = pkgInfo(key);
    var covers = !!(c.packageIncluded && pk && pk.coversCourses);
    r.packageCovered = covers;
    if (c.status === 'ended') { r.reason = 'ended'; r.expiredType = 'A'; return r; }
    if (e && e.source === 'purchase') {
      if (isPast(e.endAt)) {
        if (covers) { r.has = true; r.source = 'package'; r.reason = 'ok'; return r; }
        r.reason = 'expired'; r.expiredType = 'B'; return r;
      }
      r.has = true; r.source = 'purchase'; r.reason = 'ok'; r.renewed = !!(e.history && e.history.length && e.renewedAt); return r;
    }
    if (e && e.source === 'free') { r.has = true; r.source = 'free'; r.reason = 'ok'; return r; }
    if (covers) { r.has = true; r.source = 'package'; r.reason = 'ok'; return r; }
    if (c.isFree) { r.reason = 'free-available'; return r; }
    if (c.packageIncluded && pk && pk.isPaidPlan && pk.status === 'expired') { r.reason = 'pkg-expired'; return r; }
    return r;
  }
  function ensureEnrolled(cid) {
    if (!isLoggedIn()) return;
    var b = bucket(), a = access(cid);
    if (a.has && !b.entitlements[cid]) {
      b.entitlements[cid] = { source: a.source === 'package' ? 'package' : a.source, addedAt: isoDate(now()), history: [] };
      saveBucket();
    }
  }

  /* ---------------- progress (equal-weight lessons, quiz item included) ---------------- */
  function progressRec(cid, key) { var b = bucket(key); return (b.progress && b.progress[cid]) || null; }
  function quizStatus(cid, key) {
    key = key || session.state;
    if (key === 'guest') return { attempts: 0, latest: null, choicePassed: false, essayStatus: 'none', essay: null, completed: false };
    var b = bucket(key);
    var ch = (b.choice && b.choice[cid]) || [];
    var es = (b.essays && b.essays[cid]) || null;
    var passed = ch.some(function (x) { return x.passed; });
    return { attempts: ch.length, latest: ch[ch.length - 1] || null, choicePassed: passed, essayStatus: es ? es.status : 'none', essay: es, completed: passed && !!es && es.status === 'passed' };
  }
  function resumeLesson(c, p) {
    var list = lessons(c);
    if (p && p.last) {
      var last = lesson(c, p.last);
      if (last && !(p.lessons[last.id] && p.lessons[last.id].done)) return last;
    }
    var firstOpen = list.filter(function (l) { return l.type !== 'quiz' && !(p && p.lessons[l.id] && p.lessons[l.id].done); })[0];
    return firstOpen || quizLesson(c) || list[0];
  }
  function progress(cid, key) {
    key = key || session.state;
    var c = course(cid);
    var list = lessons(c), n = list.length;
    var p = key === 'guest' ? null : progressRec(cid, key);
    var qs = quizStatus(cid, key);
    var sum = 0, done = 0;
    list.forEach(function (l) {
      var f = 0;
      if (l.type === 'quiz') f = qs.completed ? 1 : 0;
      else if (p && p.lessons[l.id]) f = p.lessons[l.id].done ? 1 : Math.min(0.89, p.lessons[l.id].f || 0);
      if (f >= 1) done++;
      sum += f;
    });
    var pct = n ? Math.round(sum / n * 100) : 0;
    if (done === n) pct = 100; else if (pct >= 100) pct = 99;
    var lessonsDone = list.every(function (l) { return l.type === 'quiz' || (p && p.lessons[l.id] && p.lessons[l.id].done); });
    return {
      pct: pct, done: done, total: n, started: !!(p && Object.keys(p.lessons).length), lessonsDone: lessonsDone,
      lastLesson: p && p.last ? lesson(c, p.last) : null, resume: resumeLesson(c, p), activityAt: p ? p.activityAt : null,
      map: p ? p.lessons : {}, rec: p
    };
  }
  function lessonState(cid, lid, key) {
    var p = progressRec(cid, key);
    var r = p && p.lessons[lid];
    return r ? { f: r.f || 0, done: !!r.done, pos: r.pos || 0 } : { f: 0, done: false, pos: 0 };
  }
  function trackLesson(cid, lid, f, pos) {
    if (!isLoggedIn()) return { justDone: false };
    var b = bucket();
    var p = b.progress[cid] || (b.progress[cid] = { lessons: {}, last: null, activityAt: null });
    var rec = p.lessons[lid] || (p.lessons[lid] = { f: 0, done: false, pos: 0 });
    var was = rec.done;
    rec.f = Math.max(rec.f || 0, Math.min(1, f || 0));
    if (pos != null) rec.pos = pos;
    if (rec.f >= 0.9) rec.done = true;
    p.last = lid; p.activityAt = isoDT(now());
    ensureEnrolled(cid);
    saveBucket();
    var justDone = !was && rec.done;
    if (justDone) { checkCompletion(cid); emit('progress'); }
    return { justDone: justDone, rec: rec };
  }
  function setLastLesson(cid, lid) {
    if (!isLoggedIn()) return;
    var b = bucket();
    var p = b.progress[cid] || (b.progress[cid] = { lessons: {}, last: null, activityAt: null });
    p.last = lid; p.activityAt = isoDT(now());
    ensureEnrolled(cid); saveBucket();
  }
  function completeAllLessons(cid) {
    if (!isLoggedIn()) return;
    var c = course(cid), b = bucket();
    var p = b.progress[cid] || (b.progress[cid] = { lessons: {}, last: null, activityAt: null });
    lessons(c).forEach(function (l) { if (l.type !== 'quiz') p.lessons[l.id] = { f: 1, done: true, pos: l.sec || 0 }; });
    var ql = quizLesson(c); if (ql) p.last = ql.id;
    p.activityAt = isoDT(now());
    ensureEnrolled(cid);
    checkCompletion(cid);
    commit('progress');
  }

  /* ---------------- cart ---------------- */
  function cart(key) { return bucket(key).cart || []; }
  function inCart(cid) { return cart().some(function (x) { return x.cid === cid; }); }
  function addToCart(cid) {
    var c = course(cid);
    if (!c || !c.sellable || c.status === 'ended') return { ok: false, error: 'คอร์สนี้ไม่เปิดขายแล้ว' };
    if (inCart(cid)) return { ok: true, exists: true };
    bucket().cart.push({ cid: cid, addedAt: isoDT(now()), selected: true });
    commit('cart');
    return { ok: true };
  }
  function removeFromCart(cid) { var b = bucket(); b.cart = b.cart.filter(function (x) { return x.cid !== cid; }); commit('cart'); }
  function setSelected(cid, v) { cart().forEach(function (x) { if (x.cid === cid) x.selected = !!v; }); commit('cart'); }
  function selectAll(v) { cart().forEach(function (x) { if (cartBlock(x.cid) == null) x.selected = !!v; }); commit('cart'); }
  /* why an item cannot be bought (null = purchasable) */
  function cartBlock(cid) {
    var c = course(cid);
    if (!c || c.status === 'ended' || !c.sellable) return 'ended';
    if (!isLoggedIn()) return null;
    var a = access(cid);
    if (a.has) return a.source === 'package' ? 'package' : 'owned';
    return null;
  }
  function selectedCart() { return cart().filter(function (x) { return x.selected && cartBlock(x.cid) == null; }).map(function (x) { return x.cid; }); }
  function cartCount() { return cart().length; }

  /* ---------------- coupons & totals ---------------- */
  function fmtBaht(n) { return Number(n || 0).toLocaleString('th-TH') + ' บาท'; }
  function couponDiscount(cp, base) {
    var d = cp.type === 'percent' ? Math.floor(base * cp.value / 100) : cp.value;
    if (cp.max) d = Math.min(d, cp.max);
    return Math.max(0, Math.min(d, base));
  }
  function validateCourseCoupon(code, cid) {
    if (!String(code || '').trim()) return { ok: false, error: 'กรุณากรอกโค้ดส่วนลด' };
    var cp = coupon(code);
    if (!cp) return { ok: false, error: 'ไม่พบโค้ดส่วนลดนี้ กรุณาตรวจสอบอีกครั้ง' };
    if (cp.scope !== 'course') return { ok: false, error: 'โค้ดนี้เป็นส่วนลดทั้งคำสั่งซื้อ กรุณากรอกในช่อง “คูปองส่วนลดทั้งคำสั่งซื้อ”' };
    if (cp.courseId !== cid) return { ok: false, error: 'โค้ดนี้ใช้ได้เฉพาะคอร์ส “' + course(cp.courseId).title + '”' };
    if (course(cid).price === 0) return { ok: false, error: 'คอร์สฟรีไม่สามารถใช้โค้ดส่วนลดได้' };
    return { ok: true, coupon: cp };
  }
  function validateOrderCoupon(code, baseAfterCourse) {
    if (!String(code || '').trim()) return { ok: false, error: 'กรุณากรอกโค้ดส่วนลด' };
    var cp = coupon(code);
    if (!cp) return { ok: false, error: 'ไม่พบโค้ดส่วนลดนี้ กรุณาตรวจสอบอีกครั้ง' };
    if (cp.scope !== 'order') return { ok: false, error: 'โค้ดนี้เป็นส่วนลดเฉพาะคอร์ส กรุณากรอกที่การ์ดของคอร์ส “' + course(cp.courseId).title + '”' };
    if (cp.minSubtotal && baseAfterCourse < cp.minSubtotal) return { ok: false, error: 'ยอดสั่งซื้อยังไม่ถึงขั้นต่ำ ' + fmtBaht(cp.minSubtotal) + ' (ยอดปัจจุบัน ' + fmtBaht(baseAfterCourse) + ')' };
    return { ok: true, coupon: cp };
  }
  function computeTotals(items, courseCoupons, orderCouponCode) {
    courseCoupons = courseCoupons || {};
    var lines = items.map(function (cid) {
      var c = course(cid), cp = courseCoupons[cid] ? coupon(courseCoupons[cid]) : null;
      if (cp && (cp.scope !== 'course' || cp.courseId !== cid)) cp = null;
      var disc = cp ? couponDiscount(cp, c.price) : 0;
      return { cid: cid, course: c, price: c.price, normal: c.normalPrice, coupon: cp, disc: disc, net: c.price - disc };
    });
    var subtotal = 0, courseDisc = 0;
    lines.forEach(function (l) { subtotal += l.price; courseDisc += l.disc; });
    var after = subtotal - courseDisc;
    var oc = orderCouponCode ? coupon(orderCouponCode) : null;
    var ocValid = !!(oc && oc.scope === 'order' && (!oc.minSubtotal || after >= oc.minSubtotal));
    var orderDisc = ocValid ? couponDiscount(oc, after) : 0;
    return {
      lines: lines, subtotal: subtotal, courseDisc: courseDisc, orderCoupon: ocValid ? oc : null, orderCouponInvalid: !!(oc && !ocValid),
      orderDisc: orderDisc, totalDisc: courseDisc + orderDisc, net: after - orderDisc,
      allFree: lines.length > 0 && lines.every(function (l) { return l.price === 0; }),
      normalTotal: lines.reduce(function (s, l) { return s + (l.normal || l.price); }, 0)
    };
  }

  /* ---------------- checkout & orders ---------------- */
  function checkoutDraft() { var b = bucket(); return b.checkout || null; }
  function setCheckoutDraft(d) { var b = bucket(); b.checkout = d ? Object.assign({ courseCoupons: {}, orderCoupon: null }, b.checkout || {}, d) : null; saveBucket(); }
  function startCheckout(items, source) {
    var b = bucket();
    b.checkout = { items: items.slice(), source: source || 'cart', courseCoupons: {}, orderCoupon: null, at: isoDT(now()) };
    saveBucket();
  }
  function nextOrderId() { var b = bucket(); b.seq = (b.seq || (session.state === 'paid' ? 40 : 70)) + 1; return 'RV-ORD-' + now().getFullYear() + '-' + (session.state === 'paid' ? 'P' : 'F') + pad(b.seq, 4); }
  function grant(cid, order) {
    var b = bucket(), c = course(cid), e = b.entitlements[cid];
    var start = isoDate(now());
    if (c.isFree) {
      b.entitlements[cid] = { source: 'free', startAt: start, endAt: null, orderId: order.id, addedAt: start, history: e ? (e.history || []) : [] };
      return;
    }
    var end = daysFromNow(c.accessDays || 365);
    if (e && e.source === 'purchase') {
      e.history = e.history || [];
      e.history.push({ startAt: e.startAt, endAt: e.endAt, orderId: e.orderId });
      e.startAt = start; e.endAt = end; e.orderId = order.id; e.renewedAt = start;
    } else {
      b.entitlements[cid] = { source: 'purchase', startAt: start, endAt: end, orderId: order.id, addedAt: (e && e.addedAt) || start, history: [] };
    }
  }
  function placeOrder(o) {
    if (!isLoggedIn()) return null;
    var b = bucket();
    var t = computeTotals(o.items, o.courseCoupons, o.orderCoupon);
    var status = t.allFree || t.net === 0 ? 'free' : (o.status || 'paid');
    if (o.status === 'failed' || o.status === 'cancelled') status = o.status;
    var tax = o.tax || { want: false };
    var order = {
      id: nextOrderId(), at: isoDT(now()),
      items: t.lines.map(function (l) { return { cid: l.cid, price: l.price, normal: l.normal, coupon: l.coupon ? l.coupon.code : null, disc: l.disc, net: l.net }; }),
      subtotal: t.subtotal, courseDisc: t.courseDisc, orderDisc: t.orderDisc, orderCoupon: t.orderCoupon ? t.orderCoupon.code : null, net: t.net,
      method: status === 'free' ? 'free' : (o.method || 'qr'), status: status, buyer: o.buyer || null,
      receipt: tax.want ? { want: true, type: tax.type, name: tax.type === 'corporate' ? tax.company : ((tax.firstName || '') + ' ' + (tax.lastName || '')).trim(), branch: tax.branchType === 'branch' ? tax.branchNo : '00000', status: 'processing' } : { want: false, status: 'e-receipt' }
    };
    b.orders.unshift(order);
    if (status === 'paid' || status === 'free') {
      var renewed = [];
      order.items.forEach(function (it) {
        var before = access(it.cid);
        grant(it.cid, order);
        if (before.reason === 'expired') renewed.push(it.cid);
      });
      b.cart = b.cart.filter(function (x) { return !order.items.some(function (it) { return it.cid === x.cid; }); });
      var titles = order.items.map(function (it) { return course(it.cid).title; }).join(', ');
      notifyTo(session.state, {
        type: 'purchase', title: status === 'free' ? 'ลงทะเบียนเรียนฟรีสำเร็จ' : 'ซื้อ/ลงทะเบียนคอร์สสำเร็จ', desc: titles,
        cta: { label: 'เริ่มเรียน', href: 'learn.html?id=' + order.items[0].cid }
      });
      order.renewed = renewed;
      b.checkout = null;
    }
    commit('order');
    return order;
  }
  function enrollFree(cid) {
    var c = course(cid);
    if (!c || !c.isFree || !isLoggedIn()) return null;
    if (access(cid).has) return { already: true };
    return placeOrder({ items: [cid], method: 'free', status: 'free', buyer: profile(), tax: { want: false } });
  }
  function orders(key) { return bucket(key).orders || []; }
  function order(id) {
    var keys = [session.state].concat(['free', 'paid'].filter(function (k) { return k !== session.state; })).filter(function (k) { return k !== 'guest'; });
    for (var i = 0; i < keys.length; i++) {
      var o = orders(keys[i]).filter(function (x) { return x.id === id; })[0];
      if (o) return o;
    }
    return null;
  }

  /* ---------------- quiz & essay ---------------- */
  function quizDraft(cid) { return bucket().quizDraft ? bucket().quizDraft[cid] || null : null; }
  function saveQuizDraft(cid, d) { if (!isLoggedIn()) return null; var at = isoDT(now()); bucket().quizDraft[cid] = Object.assign({}, d, { savedAt: at }); saveBucket(); return at; }
  function clearQuizDraft(cid) { if (!isLoggedIn()) return; delete bucket().quizDraft[cid]; saveBucket(); }
  function sameSet(a, b) { a = (a || []).slice().sort(); b = (b || []).slice().sort(); return a.length === b.length && a.every(function (v, i) { return v === b[i]; }); }
  function scoreChoice(c, answers) {
    var qs = c.quiz.questions.filter(function (q) { return q.type !== 'essay'; });
    var correct = 0;
    qs.forEach(function (q) { if (sameSet(answers[q.id], q.correctAnswer)) correct++; });
    var pct = qs.length ? Math.round(correct / qs.length * 100) : 0;
    return { correct: correct, total: qs.length, pct: pct, passed: pct >= c.quiz.passPct };
  }
  function submitQuiz(cid, payload) {
    if (!isLoggedIn()) return null;
    var c = course(cid), b = bucket();
    var sc = scoreChoice(c, payload.answers || {});
    var list = b.choice[cid] || (b.choice[cid] = []);
    var att = { id: 'CH-' + (session.state === 'paid' ? 'P' : 'F') + '-' + cid.slice(-3) + '-' + (list.length + 1), at: isoDT(now()), correct: sc.correct, total: sc.total, passed: sc.passed };
    list.push(att);
    var es = b.essays[cid];
    var essaySubmitted = false;
    if (!es && payload.essay && String(payload.essay.text || '').trim()) {
      es = b.essays[cid] = {
        attemptId: 'ATT-' + (session.state === 'paid' ? 'P' : 'F') + '-' + cid.slice(-3) + '-' + pad(rand(3), 3),
        status: 'pending', versions: [{ v: 1, at: att.at, text: payload.essay.text, file: payload.essay.file || null }], reviews: []
      };
      essaySubmitted = true;
      notifyTo(session.state, { type: 'essay-submitted', title: 'ส่ง Essay เพื่อรอตรวจแล้ว', desc: c.title + ' — ผู้สอนจะตรวจและแจ้งผลผ่านการแจ้งเตือน', cta: { label: 'ดูสถานะ', href: 'result.html?id=' + cid } });
    }
    delete b.quizDraft[cid];
    ensureEnrolled(cid);
    var p = b.progress[cid] || (b.progress[cid] = { lessons: {}, last: null, activityAt: null });
    p.activityAt = isoDT(now());
    checkCompletion(cid);
    commit('quiz');
    return { choice: att, essaySubmitted: essaySubmitted, essay: es };
  }
  function resubmitEssay(cid, text, file) {
    var b = bucket(), es = b.essays[cid];
    if (!es || es.status !== 'revision') return null;
    es.versions.push({ v: es.versions.length + 1, at: isoDT(now()), text: text, file: file || null });
    es.status = 'resubmitted';
    notifyTo(session.state, { type: 'essay-submitted', title: 'ส่ง Essay ฉบับแก้ไขแล้ว', desc: course(cid).title + ' — สถานะ: รอตรวจอีกครั้ง', cta: { label: 'ดูสถานะ', href: 'result.html?id=' + cid } });
    commit('essay');
    return es;
  }
  function reviewQueue() {
    var out = [];
    ['free', 'paid'].forEach(function (k) {
      var b = bucket(k);
      Object.keys(b.essays || {}).forEach(function (cid) {
        var es = b.essays[cid];
        var last = es.versions[es.versions.length - 1];
        var ch = (b.choice[cid] || []);
        out.push({ attemptId: es.attemptId, bucket: k, cid: cid, course: course(cid), essay: es, status: es.status, submittedAt: last.at,
          choice: ch[ch.length - 1] || null, choicePassed: ch.some(function (x) { return x.passed; }), learner: displayName(b.profile), learnerProfile: b.profile });
      });
    });
    var rank = { pending: 0, resubmitted: 0, revision: 1, passed: 2 };
    return out.sort(function (a, b) { return (rank[a.status] - rank[b.status]) || (parseD(b.submittedAt) - parseD(a.submittedAt)); });
  }
  function findAttempt(id) { return reviewQueue().filter(function (x) { return x.attemptId === id; })[0] || null; }
  function submitReview(attemptId, r) {
    var a = findAttempt(attemptId); if (!a) return null;
    var b = bucket(a.bucket), es = b.essays[a.cid], c = course(a.cid);
    var reviewer = instructor(c.instructors[0].id);
    es.reviews.push({ v: es.versions.length, at: isoDT(now()), by: reviewer ? reviewer.name : 'ผู้สอน', result: r.result, comment: r.comment || '', file: r.file || null });
    es.status = r.result === 'pass' ? 'passed' : 'revision';
    if (r.result === 'pass') {
      notifyTo(a.bucket, { type: 'essay-pass', title: 'Essay ผ่านการตรวจ', desc: 'ผู้สอนตรวจคำตอบในคอร์ส ' + c.title + ' แล้ว', cta: { label: 'ดูผลการเรียน', href: 'result.html?id=' + a.cid } });
    } else {
      notifyTo(a.bucket, { type: 'essay-revision', title: 'Essay ต้องแก้ไข', desc: 'ผู้สอนส่งความคิดเห็นกลับมาให้ปรับปรุงคำตอบ — ' + c.title, cta: { label: 'แก้ไขคำตอบ', href: 'result.html?id=' + a.cid } });
    }
    saveBucket(a.bucket);
    if (r.result === 'pass') checkCompletion(a.cid, a.bucket);
    emit('review');
    return es;
  }

  /* ---------------- completion → CE + certificate ---------------- */
  function certFor(cid, key) { var b = bucket(key); return (b.certificates || []).filter(function (x) { return x.cid === cid; })[0] || null; }
  function checkCompletion(cid, key) {
    key = key || session.state;
    if (key === 'guest') return false;
    var b = bucket(key);
    var pr = progress(cid, key), qs = quizStatus(cid, key);
    if (pr.lessonsDone && qs.completed && !certFor(cid, key)) {
      var c = course(cid);
      var id = 'CERT-RV-' + String(now().getFullYear()).slice(2) + '-' + pad(10000 + rand(4) % 89999, 5);
      b.certificates.unshift({ id: id, cid: cid, issuedAt: isoDate(now()) });
      if (c.ce > 0) b.ce.unshift({ origin: 'course', cid: cid, title: c.title, points: c.ce, date: isoDate(now()) });
      notifyTo(key, { type: 'ce', title: c.ce > 0 ? 'CE พร้อมบันทึก ' + c.ce + ' หน่วย' : 'เรียนจบคอร์สแล้ว', desc: c.ce > 0 ? 'บันทึก CE จากคอร์ส ' + c.title + ' แล้ว' : c.title + ' (คอร์สนี้ไม่มีคะแนน CE)', cta: { label: 'ดู CE', href: 'account-certificates.html' } });
      notifyTo(key, { type: 'certificate', title: 'ใบประกาศพร้อมดาวน์โหลด', desc: c.title, cta: { label: 'ดูใบประกาศ', href: 'certificate.html?id=' + id } });
      saveBucket(key);
      return true;
    }
    return false;
  }
  function certificates(key) { return bucket(key).certificates || []; }
  function certificateById(id) {
    var keys = ['paid', 'free'];
    for (var i = 0; i < keys.length; i++) {
      var b = bucket(keys[i]);
      var cert = (b.certificates || []).filter(function (x) { return x.id === id; })[0];
      if (cert) return { cert: cert, bucket: keys[i], course: course(cert.cid), learnerName: displayName(b.profile), profile: b.profile };
    }
    return null;
  }
  function ceRecords(key) { return (bucket(key).ce || []).slice().sort(function (a, b) { return parseD(b.date) - parseD(a.date); }); }
  function ceSummary(key) {
    key = key || session.state;
    if (key === 'guest') return { total: 0, thisYear: 0, certCount: 0, incomplete: 0 };
    var y = now().getFullYear(), total = 0, year = 0;
    ceRecords(key).forEach(function (r) { total += r.points; if (parseD(r.date).getFullYear() === y) year += r.points; });
    var incomplete = myCourses(key).filter(function (c) { return progress(c.id, key).pct < 100; }).length;
    return { total: total, thisYear: year, certCount: certificates(key).length, incomplete: incomplete };
  }

  /* ---------------- my learning / catalog / recommendations ---------------- */
  function myCourses(key) {
    key = key || session.state;
    if (key === 'guest') return [];
    var b = bucket(key), ids = Object.keys(b.entitlements || {});
    Object.keys(b.progress || {}).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
    return ids.map(course).filter(Boolean);
  }
  function learningItem(cid, key) {
    key = key || session.state;
    var c = course(cid), a = access(cid, key), pr = progress(cid, key), qs = quizStatus(cid, key), e = entitlement(cid, key), pk = pkgInfo(key);
    var expiry = null;
    if (e && e.source === 'purchase') expiry = e.endAt;
    else if (a.source === 'package' || (e && e.source === 'package')) expiry = pk && pk.endAt;
    var group = (a.reason === 'ended' || a.reason === 'expired' || a.reason === 'pkg-expired') ? 'expired' : (pr.pct >= 100 ? 'completed' : (pr.pct > 0 ? 'in-progress' : 'not-started'));
    return { course: c, access: a, progress: pr, quiz: qs, cert: certFor(cid, key), entitlement: e, accessDate: e ? (e.startAt || e.addedAt) : null, expiry: expiry, group: group, view: courseView(cid) };
  }
  function catalog() { return D.courses.filter(function (c) { return c.status !== 'ended'; }); }
  function norm(s) { return String(s || '').toLowerCase().trim(); }
  function matchQuery(c, q) {
    q = norm(q); if (!q) return true;
    var cat = category(c.category);
    var hay = [c.title, c.shortDesc, cat.name, cat.th, c.levelLabel].concat(c.instructors.map(function (i) { var x = instructor(i.id); return x.name + ' ' + i.role; })).join(' ').toLowerCase();
    return q.split(/\s+/).every(function (t) { return hay.indexOf(t) >= 0; });
  }
  var FILTERS = {
    level: function (c, v) { return c.level === v; },
    ce: function (c, v) { return v === 'none' ? c.ce === 0 : v === '1-3' ? c.ce >= 1 && c.ce <= 3 : v === '4-6' ? c.ce >= 4 && c.ce <= 6 : c.ce > 6; },
    duration: function (c, v) { var d = c.durationMin; return v === 'le1' ? d <= 60 : v === '1-3' ? d > 60 && d <= 180 : v === '3-6' ? d > 180 && d <= 360 : d > 360; },
    access: function (c, v) { return v === 'free' ? c.isFree : v === 'course' ? (!c.isFree && c.sellable) : c.packageIncluded; },
    price: function (c, v) { var p = c.price; return v === 'free' ? p === 0 : v === 'lt1000' ? p > 0 && p < 1000 : v === '1000-2000' ? p >= 1000 && p <= 2000 : p > 2000; }
  };
  function filterCourses(opts, list) {
    opts = opts || {};
    list = list || catalog();
    return list.filter(function (c) {
      if (!matchQuery(c, opts.q)) return false;
      if (opts.category && opts.category.length && opts.category.indexOf(c.category) < 0) return false;
      var keys = ['level', 'ce', 'duration', 'access', 'price'];
      for (var i = 0; i < keys.length; i++) {
        var vals = opts[keys[i]];
        if (vals && vals.length && !vals.some(function (v) { return FILTERS[keys[i]](c, v); })) return false;
      }
      return true;
    });
  }
  function sortCourses(list, key) {
    var l = list.slice();
    var by = {
      recommended: function (a, b) { return (b.featured - a.featured) || (a.popularity - b.popularity); },
      new: function (a, b) { return parseD(b.publishedAt) - parseD(a.publishedAt); },
      popular: function (a, b) { return a.popularity - b.popularity; },
      'price-asc': function (a, b) { return a.price - b.price; },
      'price-desc': function (a, b) { return b.price - a.price; },
      'ce-desc': function (a, b) { return b.ce - a.ce || a.popularity - b.popularity; }
    }[key || 'recommended'];
    return l.sort(by);
  }
  function newCourses() { return sortCourses(catalog(), 'new'); }
  function recommended(key) {
    key = key || session.state;
    var list = catalog();
    if (key === 'guest') {
      return sortCourses(list, 'recommended').map(function (c) { return { course: c, reason: c.featured ? 'คอร์สแนะนำ' : 'ยอดนิยม' }; });
    }
    var ints = interests(key);
    var all = ints.indexOf('All') >= 0;
    var mine = myCourses(key).map(function (c) { return c.id; });
    var myCats = myCourses(key).map(function (c) { return c.category; });
    var scored = list.map(function (c) {
      var cat = category(c.category), a = access(c.id, key), pr = progress(c.id, key), s = 0, reason = null;
      if (all || ints.indexOf(cat.name) >= 0) { s += 3; reason = 'ตรงกับความสนใจ: ' + cat.name; }
      if (a.has && a.source === 'package' && !pr.started) { s += 2; reason = reason || 'รวมในแพ็กเกจของคุณ'; }
      if (myCats.indexOf(c.category) >= 0 && mine.indexOf(c.id) < 0) { s += 1; reason = reason || 'ต่อยอดจากคอร์สที่เรียน'; }
      if (c.featured) s += 1;
      if (pr.pct === 100) s -= 10;
      else if (mine.indexOf(c.id) >= 0 && pr.started) s -= 4;
      return { course: c, score: s, reason: reason || 'คัดสรรสำหรับคุณ' };
    });
    return scored.sort(function (a, b) { return (b.score - a.score) || (a.course.popularity - b.course.popularity); });
  }

  /* ---------------- notifications ---------------- */
  function notifyTo(key, n) {
    if (!key || key === 'guest') return;
    var b = bucket(key);
    n.id = 'N-' + Date.now().toString(36) + '-' + rand(3);
    n.at = n.at || isoDT(now());
    n.read = false;
    b.notifications = b.notifications || [];
    b.notifications.unshift(n);
    saveBucket(key);
  }
  function notifications(key) {
    key = key || session.state;
    if (key === 'guest') return [];
    var list = (bucket(key).notifications || []).slice();
    var pk = pkgInfo(key);
    if (pk && pk.isPaidPlan && pk.status === 'expiring') {
      list.unshift({ id: 'N-VIRTUAL-PKG', virtual: true, type: 'expiry', title: 'แพ็กเกจใกล้หมดอายุ', desc: 'แพ็กเกจ ' + pk.plan.name + ' จะหมดอายุในอีก ' + pk.daysLeft + ' วัน', at: isoDT(now()), read: !!session.virtualRead, cta: { label: 'ต่ออายุแพ็กเกจ', href: 'account-package.html' } });
    }
    if (pk && pk.isPaidPlan && pk.status === 'expired') {
      list.unshift({ id: 'N-VIRTUAL-PKG', virtual: true, type: 'expiry', title: 'แพ็กเกจหมดอายุแล้ว', desc: 'คอร์สที่รวมในแพ็กเกจจะถูกล็อกจนกว่าจะต่ออายุ ความคืบหน้าเดิมยังคงอยู่', at: isoDT(now()), read: !!session.virtualRead, cta: { label: 'ต่ออายุแพ็กเกจ', href: 'account-package.html' } });
    }
    return list;
  }
  function unreadCount(key) { return notifications(key).filter(function (n) { return !n.read; }).length; }
  function markRead(id) {
    if (id === 'N-VIRTUAL-PKG') { session.virtualRead = true; saveSession(); emit('notif'); return; }
    (bucket().notifications || []).forEach(function (n) { if (n.id === id) n.read = true; });
    commit('notif');
  }
  function markAllRead() { (bucket().notifications || []).forEach(function (n) { n.read = true; }); session.virtualRead = true; saveSession(); commit('notif'); }

  /* ---------------- profile / interests / devices / notes / focus ---------------- */
  function profile(key) { key = key || session.state; return key === 'guest' ? null : bucket(key).profile; }
  function saveProfile(p) { var b = bucket(); b.profile = Object.assign({}, b.profile, p); commit('profile'); }
  function interests(key) { key = key || session.state; return key === 'guest' ? [] : (bucket(key).interests || []); }
  function saveInterests(list) { bucket().interests = list.slice(); commit('interests'); }
  function consents() { return bucket().consents || {}; }
  function saveConsents(c) { bucket().consents = Object.assign({}, bucket().consents, c); commit('consents'); }
  function devices() { return bucket().devices || []; }
  function logoutDevice(id) { var b = bucket(); b.devices = b.devices.filter(function (d) { return d.id !== id || d.current; }); commit('devices'); }
  function logoutAllDevices() { var b = bucket(); b.devices = b.devices.filter(function (d) { return d.current; }); commit('devices'); }
  function note(cid, lid) { var b = bucket(); return (b.notes && b.notes[cid + '|' + lid]) || null; }
  function saveNote(cid, lid, text) { if (!isLoggedIn()) return null; var b = bucket(); b.notes = b.notes || {}; var at = isoDT(now()); b.notes[cid + '|' + lid] = { text: text, at: at }; saveBucket(); return at; }
  function allNotes(cid) { var b = bucket(), out = []; Object.keys(b.notes || {}).forEach(function (k) { if (k.indexOf(cid + '|') === 0) out.push({ lid: k.split('|')[1], text: b.notes[k].text, at: b.notes[k].at }); }); return out; }
  function questions(cid) { var b = bucket(); return (b.qa && b.qa[cid]) || []; }
  function askQuestion(cid, lid, text) { if (!isLoggedIn()) return null; var b = bucket(); b.qa = b.qa || {}; (b.qa[cid] = b.qa[cid] || []).unshift({ lid: lid, text: text, at: isoDT(now()), by: displayName(b.profile) }); saveBucket(); return true; }
  function focus() { return !!read('focus', false); }
  function setFocus(v) { write('focus', !!v); }

  /* ---------------- course view (single CTA / badge resolver) ---------------- */
  var MKT = {
    bestseller: { kind: 'bestseller', label: 'ขายดี', icon: 'flame' },
    recommended: { kind: 'recommended', label: 'แนะนำ', icon: 'thumbs-up' },
    'new': { kind: 'new', label: 'คอร์สใหม่', icon: 'sparkles' }
  };
  function B(kind, label, icon) { return { kind: kind, label: label, icon: icon }; }
  function courseView(cid) {
    var c = course(cid); if (!c) return null;
    var key = session.state, logged = key !== 'guest';
    var acc = access(cid), pr = progress(cid), qs = quizStatus(cid), cert = logged ? certFor(cid) : null, pk = logged ? pkgInfo() : null;
    var inC = inCart(cid);
    var mk = c.badge === 'ce' ? B('ce', 'CE ' + c.ce, 'award') : MKT[c.badge] || null;
    var certHref = cert ? 'certificate.html?id=' + cert.id : null;
    var learnHref = 'learn.html?id=' + cid + (pr.resume ? '&lesson=' + pr.resume.id : '');
    var resultHref = 'result.html?id=' + cid;
    var addCart = inC ? { label: 'อยู่ในตะกร้าแล้ว', href: 'cart.html', variant: 'secondary', icon: 'check' } : { label: 'เพิ่มลงตะกร้า', action: 'add-cart', variant: 'secondary', icon: 'cart' };
    var cardCart = inC ? { label: 'อยู่ในตะกร้า', href: 'cart.html', variant: 'secondary', icon: 'check' } : { label: 'เพิ่มลงตะกร้า', action: 'add-cart', variant: 'primary', icon: 'cart' };
    var v = { course: c, key: key, access: acc, progress: pr, quiz: qs, cert: cert, certHref: certHref, inCart: inC, badges: [], primary: null, secondary: null, tertiary: null, card: null, lock: null, note: null, state: null, showPrice: true, showProgress: false, learnHref: learnHref, resultHref: resultHref };

    if (c.status === 'ended') {
      var hist = logged && (!!acc.ent || pr.started);
      v.state = 'ended'; v.showPrice = false; v.showProgress = hist;
      v.badges.push(B('expired', 'หมดอายุ', 'hourglass'));
      v.lock = { type: 'ended', title: 'คอร์สนี้สิ้นสุดการเผยแพร่แล้ว', text: 'คอร์สไม่เปิดขายใหม่และไม่สามารถเข้าชมวิดีโอหรือเนื้อหาสำหรับผู้เรียนได้' + (hist ? ' ประวัติการเรียนและความคืบหน้าเดิม (' + pr.pct + '%) ยังคงอยู่' : '') + (cert ? ' · ใบประกาศเดิมยังดาวน์โหลดได้' : '') };
      if (cert) { v.primary = { label: 'ดาวน์โหลดใบประกาศ', href: certHref, icon: 'download' }; v.secondary = { label: 'ดูประวัติการเรียน', href: 'account-learning.html?tab=expired', variant: 'secondary', icon: 'history' }; }
      else if (hist) { v.primary = { label: 'ดูประวัติการเรียน', href: 'account-learning.html?tab=expired', variant: 'secondary', icon: 'history' }; }
      else { v.primary = { label: 'สิ้นสุดการเผยแพร่', disabled: true, icon: 'ban' }; }
      v.card = cert ? { label: 'ดูใบประกาศ', href: certHref, variant: 'secondary' } : (hist ? { label: 'ดูประวัติ', href: 'account-learning.html?tab=expired', variant: 'secondary' } : { label: 'สิ้นสุดการเผยแพร่', disabled: true });
      return v;
    }
    if (acc.reason === 'expired') {
      v.state = 'access-expired'; v.showProgress = true;
      v.badges.push(B('access-expired', 'สิทธิ์หมดอายุ', 'hourglass'));
      if (pr.pct === 100) v.badges.push(B('done', 'เรียนจบ', 'check-circle'));
      v.lock = { type: 'access-expired', title: 'สิทธิ์เรียนของคุณหมดอายุแล้ว', text: 'ซื้อคอร์สใหม่เพื่อเปิดสิทธิ์เรียนอีกครั้ง ระบบจะเก็บความคืบหน้าเดิม (' + pr.pct + '%) และให้เรียนต่อจากบทเดิม' + (cert ? ' · ใบประกาศเดิมยังดาวน์โหลดได้' : '') };
      v.primary = { label: 'ซื้อคอร์สใหม่', action: 'buy', icon: 'refresh' };
      v.secondary = cert ? { label: 'ดูใบประกาศ', href: certHref, variant: 'secondary', icon: 'award' } : addCart;
      v.card = { label: 'ซื้อคอร์สใหม่', action: 'buy', icon: 'refresh' };
      v.note = 'ซื้อใหม่แล้วเก็บความคืบหน้าเดิม · สิทธิ์เรียน ' + c.accessDays + ' วัน';
      return v;
    }
    if (!acc.has) {
      if (mk) v.badges.push(mk);
      if (c.isFree) v.badges.push(B('free', 'ฟรี', 'gift'));
      if (acc.reason === 'pkg-expired') {
        v.state = 'pkg-expired'; v.showProgress = pr.started;
        v.badges = [B('access-expired', 'สิทธิ์หมดอายุ', 'hourglass')];
        if (pr.pct === 100) v.badges.push(B('done', 'เรียนจบ', 'check-circle'));
        v.lock = { type: 'pkg-expired', title: 'แพ็กเกจของคุณหมดอายุแล้ว', text: 'ต่ออายุแพ็กเกจเพื่อเรียนคอร์สที่รวมในแพ็กเกจต่อจากจุดเดิม (' + pr.pct + '%) หรือซื้อคอร์สนี้แยกรายคอร์ส' + (cert ? ' · ใบประกาศเดิมยังดาวน์โหลดได้' : '') };
        v.primary = { label: 'ต่ออายุแพ็กเกจ', href: 'account-package.html', icon: 'refresh' };
        v.secondary = cert ? { label: 'ดูใบประกาศ', href: certHref, variant: 'secondary', icon: 'award' } : { label: 'ซื้อคอร์สนี้', action: 'buy', variant: 'secondary' };
        v.tertiary = cert ? { label: 'ซื้อคอร์สนี้', action: 'buy', variant: 'ghost' } : null;
        v.card = { label: 'ต่ออายุแพ็กเกจ', href: 'account-package.html', icon: 'refresh' };
        return v;
      }
      if (key === 'guest') {
        v.state = 'guest';
        v.lock = { type: 'guest', title: 'เข้าสู่ระบบหรือสมัครสมาชิกเพื่อเรียนคอร์สนี้', text: 'เนื้อหาบทเรียนสำหรับสมาชิกที่มีสิทธิ์เข้าเรียน' };
        v.primary = { label: 'สมัครสมาชิกเพื่อดูเนื้อหา', action: 'login', icon: 'user' };
        if (!c.isFree) { v.secondary = { label: 'ซื้อคอร์สนี้', action: 'buy', variant: 'secondary' }; v.tertiary = addCart; }
        v.card = c.isFree ? { label: 'เรียนฟรี', action: 'login', icon: 'play' } : cardCart;
        v.note = c.isFree ? 'คอร์สฟรีสำหรับสมาชิก · สมัครสมาชิกเพื่อเริ่มเรียน' : (c.packageIncluded ? 'คอร์สนี้รวมในแพ็กเกจสมาชิกแบบชำระเงิน' : null);
        return v;
      }
      if (acc.reason === 'free-available') {
        v.state = 'free-available';
        v.primary = { label: 'เริ่มเรียน', action: 'enroll-free', icon: 'play' };
        v.card = { label: 'เริ่มเรียน', action: 'enroll-free', icon: 'play' };
        v.note = 'คอร์สฟรีสำหรับสมาชิก — กดเริ่มเรียนเพื่อรับสิทธิ์ได้ทันที';
        return v;
      }
      v.state = 'buy';
      v.lock = { type: 'buy', title: 'ซื้อคอร์สนี้เพื่อเริ่มเรียน', text: c.packageIncluded ? 'คอร์สนี้รวมในแพ็กเกจแบบชำระเงิน แต่แพ็กเกจปัจจุบันของคุณไม่ครอบคลุม' : 'คอร์สนี้ไม่รวมในแพ็กเกจ — ซื้อรายคอร์สเพื่อเริ่มเรียน' };
      v.primary = { label: 'ซื้อคอร์สนี้', action: 'buy' };
      v.secondary = addCart;
      v.card = cardCart;
      v.note = c.packageIncluded ? 'รวมในแพ็กเกจแบบชำระเงิน — แพ็กเกจปัจจุบันของคุณ (' + pk.plan.name + ') ไม่ครอบคลุม' : 'คอร์สนี้ไม่รวมในแพ็กเกจ · ซื้อรายคอร์ส';
      return v;
    }
    /* has access */
    v.showPrice = false;
    if (acc.source === 'package') v.badges.push(B('package', 'รวมในแพ็กเกจ', 'package'));
    if (acc.renewed) v.badges.push(B('renewed', 'ต่ออายุสิทธิ์แล้ว', 'refresh'));
    if (pr.pct === 100 || cert) {
      v.state = 'completed'; v.showProgress = true;
      v.badges.unshift(B('done', 'เรียนจบ', 'check-circle'));
      v.primary = cert ? { label: 'ดูใบประกาศ', href: certHref, icon: 'award' } : { label: 'ดูผลการเรียน', href: resultHref };
      v.secondary = cert ? { label: 'ดูผลการเรียน', href: resultHref, variant: 'secondary' } : null;
      v.card = cert ? { label: 'ดูใบประกาศ', href: certHref, icon: 'award' } : { label: 'ดูผลการเรียน', href: resultHref };
    } else if (qs.essayStatus === 'pending' || qs.essayStatus === 'resubmitted' || qs.essayStatus === 'revision') {
      v.state = 'result-pending'; v.showProgress = true;
      v.badges.unshift(qs.essayStatus === 'revision' ? B('revision', 'ต้องแก้ไข', 'alert-circle') : B('pending', qs.essayStatus === 'resubmitted' ? 'รอตรวจอีกครั้ง' : 'รอผลการตรวจ', 'hourglass'));
      v.primary = { label: 'ดูผลการเรียน', href: resultHref };
      v.secondary = pr.lessonsDone ? null : { label: 'เรียนต่อ', href: learnHref, variant: 'secondary', icon: 'play' };
      v.card = { label: 'ดูผลการเรียน', href: resultHref };
    } else if (pr.pct > 0) {
      v.state = 'in-progress'; v.showProgress = true;
      v.badges.unshift(B('progress', 'กำลังเรียน', 'play-circle'));
      v.primary = { label: 'เรียนต่อ', href: learnHref, icon: 'play' };
      v.secondary = pr.lessonsDone && !qs.choicePassed ? { label: 'ทำแบบทดสอบ', href: 'quiz.html?id=' + cid, variant: 'secondary', icon: 'clipboard-check' } : null;
      v.card = { label: 'เรียนต่อ', href: learnHref, icon: 'play' };
    } else {
      v.state = 'not-started';
      v.primary = { label: 'เริ่มเรียน', href: learnHref, icon: 'play' };
      v.card = { label: 'เริ่มเรียน', href: learnHref, icon: 'play' };
    }
    if (mk && v.badges.length < 2) v.badges.push(mk);
    return v;
  }

  /* ---------------- public API ---------------- */
  RV.store = {
    version: SEED_VERSION,
    /* session */
    session: function () { return session; }, state: function () { return session.state; }, isLoggedIn: isLoggedIn,
    setState: setState, login: login, logout: logout, register: register, setMemberType: setMemberType, memberType: function () { return session.memberType; },
    setPkgStatus: setPkgStatus, pkgStatus: function () { return session.pkgStatus; }, setSimulateError: setSimulateError, simulateError: function () { return !!session.simulateError; },
    setPending: setPending, takePending: takePending, reset: resetAll, on: on, emit: emit,
    user: user, displayName: displayName, initials: initials, bucket: bucket,
    /* lookups */
    course: course, courses: function () { return D.courses; }, category: category, instructor: instructor, lessons: lessons, lesson: lesson, moduleOf: moduleOf, quizLesson: quizLesson, coupon: coupon,
    /* package */
    pkgInfo: pkgInfo, plansFor: plansFor, planById: planById, changePlan: changePlan, renewPlan: renewPlan,
    /* access & progress */
    access: access, entitlement: entitlement, ensureEnrolled: ensureEnrolled, progress: progress, lessonState: lessonState,
    trackLesson: trackLesson, setLastLesson: setLastLesson, completeAllLessons: completeAllLessons,
    /* cart & checkout */
    cart: cart, inCart: inCart, addToCart: addToCart, removeFromCart: removeFromCart, setSelected: setSelected, selectAll: selectAll,
    cartBlock: cartBlock, selectedCart: selectedCart, cartCount: cartCount,
    validateCourseCoupon: validateCourseCoupon, validateOrderCoupon: validateOrderCoupon, computeTotals: computeTotals, couponDiscount: couponDiscount,
    checkoutDraft: checkoutDraft, setCheckoutDraft: setCheckoutDraft, startCheckout: startCheckout, placeOrder: placeOrder, enrollFree: enrollFree, orders: orders, order: order,
    /* quiz / essay / review */
    quizStatus: quizStatus, quizDraft: quizDraft, saveQuizDraft: saveQuizDraft, clearQuizDraft: clearQuizDraft, scoreChoice: scoreChoice, submitQuiz: submitQuiz,
    resubmitEssay: resubmitEssay, reviewQueue: reviewQueue, findAttempt: findAttempt, submitReview: submitReview,
    /* completion */
    checkCompletion: checkCompletion, certFor: certFor, certificates: certificates, certificateById: certificateById, ceRecords: ceRecords, ceSummary: ceSummary,
    /* learning & discovery */
    myCourses: myCourses, learningItem: learningItem, catalog: catalog, filterCourses: filterCourses, sortCourses: sortCourses, newCourses: newCourses, recommended: recommended,
    /* notifications */
    notifications: notifications, unreadCount: unreadCount, markRead: markRead, markAllRead: markAllRead, notifyTo: notifyTo,
    /* profile etc. */
    profile: profile, saveProfile: saveProfile, interests: interests, saveInterests: saveInterests, consents: consents, saveConsents: saveConsents,
    devices: devices, logoutDevice: logoutDevice, logoutAllDevices: logoutAllDevices,
    note: note, saveNote: saveNote, allNotes: allNotes, questions: questions, askQuestion: askQuestion,
    focus: focus, setFocus: setFocus,
    /* date helpers */
    date: { now: now, parse: parseD, iso: isoDate, isoDT: isoDT, daysFromNow: daysFromNow, daysBetween: daysBetween, isPast: isPast }
  };
  RV.courseView = courseView;
})();
