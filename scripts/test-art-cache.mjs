// Exercise the real ES5 cache against synthetic Tizen filesystem/XHR boundaries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../app/art-mode.js', import.meta.url), 'utf8');
const A = 'a'.repeat(64), B = 'b'.repeat(64), C = 'c'.repeat(64), META = 'cleanframe.art.cache.v1';
const meta = (revision, width = 1920, height = 1080) => ({ revision, contentId: 'MY_TEST', imageUrl: '/art/' + revision + '/image.jpg', width, height });
const jpeg = new Uint8Array([255,216,0,0,0,0,0,0,0,0,255,217]);
function harness({ files = new Map(), storage = new Map(), failMove = false, corrupt = new Set(), hangMove = false, image = jpeg, noQuick = false, asyncList = false, full = [1920, 1080], canvas = true } = {}) {
  const requests = [];
  let wait = { status: 204 }, waitHeld = [], next = A, look = null, slowFull = false, fullHeld = [], offline = false, held = [], hold = false, deleted = [], order = [], revoked = [], urlNo = 0, clock = 0;
  const timers = new Map();
  const dir = { fullPath: 'wgt-private/cleanframe-art',
    resolve(name) { if (!files.has(name)) throw Error('Not found'); return file(name); },
    createFile(name) { files.set(name, new Uint8Array()); return file(name); },
    deleteFile(path) { const name = path.split('/').pop(); files.delete(name); deleted.push(name); },
    moveTo(from, to, overwrite, ok, fail) {
      if (hangMove) return;
      if (failMove || !files.has(from.split('/').pop())) { fail(); return; }
      const src = from.split('/').pop(), dst = to.split('/').pop(); files.set(dst, files.get(src)); files.delete(src); order.push('move:' + dst); ok();
    },
    listFiles(ok) { const list = () => ok([...files.keys()].map(name => ({ name, fullPath: dir.fullPath + '/' + name }))); if (asyncList) setImmediate(list); else list(); }
  };
  function file(name) {
    return { isFile: true, name, fileSize: files.get(name).length, fullPath: dir.fullPath + '/' + name, toURI: () => 'file:///' + dir.fullPath + '/' + name,
      openStream(mode, ok) {
        const chunks = []; ok({ writeBytes(bytes) { for (const b of bytes) chunks.push(b); }, close() { if (files.has(name)) files.set(name, new Uint8Array(chunks)); order.push('close:' + name); } }); // A deleted file stays deleted.
      }
    };
  }
  // Every image decodes at the photo's full size, except a copy the canvas made, which has the canvas's size.
  const sizes = new Map(), blobSizes = new Map(), drawn = [];
  class Image {
    set src(url) { [this.naturalWidth, this.naturalHeight] = sizes.get(url) || full; queueMicrotask(() => { if (corrupt.has(url)) this.onerror?.(); else this.onload?.(); }); }
  }
  const small = new Uint8Array([255,216,1,1,1,1,1,1,1,1,1,255,217]);
  const document = { hidden: false, createElement: () => ({ width: 0, height: 0,
    getContext() { const c = this; return { drawImage: (im, x, y, w, h) => drawn.push([im.naturalWidth, im.naturalHeight, w, h, c.width, c.height]) }; },
    toBlob(done, type, quality) { const b = new Blob([small], { type }); blobSizes.set(b, [this.width, this.height]); queueMicrotask(() => done(b)); } }) };
  class FileReader { readAsArrayBuffer(b) { b.arrayBuffer().then(buf => { this.result = buf; this.onload(); }); } }
  class XHR {
    open(method, url) { this.url = url; requests.push(url); }
    send() {
      const respond = () => {
        if (offline) { this.onerror(); return; }
        if (noQuick && this.url.endsWith('?quick=1')) { this.status = 404; this.onload(); return; }
        if (this.url.includes('/art/wait.json?since=')) {
          if (wait.offline) { this.status = 0; this.onerror(); return; }
          this.status = wait.status; this.responseText = wait.meta ? JSON.stringify(wait.meta) : ''; this.onload(); return;
        }
        this.status = 200;
        if (/\/current\.json(\?quick=1)?$/.test(this.url)) this.responseText = JSON.stringify(this.url.endsWith('?quick=1') ? meta(next, ...full) : { ...meta(next, ...full), ...(look ? { look } : {}) }); else this.response = image.buffer;
        this.onload();
      };
      if (this.url.includes('/art/wait.json') && wait.held) waitHeld.push(respond);
      else if (hold) held.push(respond); else if (slowFull && this.url.endsWith('/current.json')) fullHeld.push(respond); else queueMicrotask(respond);
    }
    abort() { this.onabort?.(); }
  }
  const context = { console, Image, localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => { order.push('pointer:' + k); storage.set(k, v); } },
    document: canvas ? document : { hidden: false }, setTimeout: fn => { const id = ++clock; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
    tizen: { filesystem: { resolve: (name, ok) => ok({ resolve: () => dir }) } },
    window: { Uint8Array, Blob, FileReader, XMLHttpRequest: XHR, tizen: {}, URL: { createObjectURL: b => { const u = 'blob:' + (++urlNo); if (blobSizes.has(b)) sizes.set(u, blobSizes.get(b)); return u; }, revokeObjectURL: url => revoked.push(url) } }
  };
  vm.runInNewContext(source, context);
  const api = context.window.FrameArt;
  const context2 = context;
  return { drawn, small, context: context2, waitReply: v => { wait = v; }, releaseWait: () => { waitHeld.splice(0).forEach(fn => fn()); }, api, files, storage, order, deleted, revoked, requests, next: value => { next = value; }, look: value => { look = value; }, slowFull: () => { slowFull = true; }, releaseFull: () => { fullHeld.splice(0).forEach(fn => fn()); }, offline: value => { offline = value; }, hold: () => { hold = true; }, release: () => { hold = false; held.forEach(fn => fn()); held = []; },
    timers, expire: () => { for (const fn of [...timers.values()]) fn(); }, load: () => new Promise(r => api.load(r)), refresh: () => new Promise(r => api.refresh(r)) };
}
test('Tizen private cache promotes a completed JPEG before its pointer and survives offline restart', async () => {
  const h = harness(); assert.equal(await h.load(), null);
  const result = await h.refresh(); assert.equal(result.revision, A); assert.match(result.url, /^blob:/); // Shown from memory; the save finishes behind it.
  assert.deepEqual([...h.files.get(A + '.jpg')], [...jpeg]);
  assert.ok(h.order.findIndex(v => v.startsWith('close:incoming-')) < h.order.indexOf('move:' + A + '.jpg'));
  assert.ok(h.order.indexOf('move:' + A + '.jpg') < h.order.indexOf('pointer:' + META));
  const restart = harness({ files: h.files, storage: h.storage }); restart.offline(true);
  assert.equal((await restart.load()).revision, A);
  assert.equal(await restart.refresh(), null); assert.equal(restart.api.current().revision, A);
});
test('Tizen failed promotion keeps the persistent last-good pointer and uses decoded memory for this session', async () => {
  const files = new Map([[A + '.jpg', jpeg]]), storage = new Map([[META, JSON.stringify(meta(A))]]);
  const h = harness({ files, storage, failMove: true }); await h.load(); h.next(B);
  const result = await h.refresh(); assert.equal(result.revision, B); assert.match(result.url, /^blob:/);
  assert.equal(JSON.parse(storage.get(META)).revision, A); assert.ok(files.has(A + '.jpg'));
});
test('cache cleanup bounds revisions and repairs a corrupt same-revision orphan', async () => {
  const h = harness({ files: new Map([[A + '.jpg', jpeg], [B + '.jpg', new Uint8Array([0])], ['unrelated.txt', jpeg]]), storage: new Map([[META, JSON.stringify(meta(A))]]) });
  await h.load(); h.next(B); await h.refresh();
  assert.deepEqual([...h.files.get(B + '.jpg')], [...jpeg]);
  h.next(C); await h.refresh();
  assert.ok(!h.files.has(A + '.jpg') && h.files.has(B + '.jpg') && h.files.has(C + '.jpg') && h.files.has('unrelated.txt'));
  assert.equal(h.files.size, 3);
});
test('cancellation ignores a late response, and a stuck save never delays showing the photo', async () => {
  const h = harness(); await h.load(); h.hold(); let applied = false; h.api.refresh(() => { applied = true; });
  h.api.cancel(); h.release(); await new Promise(r => setImmediate(r));
  assert.equal(applied, false); assert.equal(h.storage.has(META), false); assert.equal(h.api.current(), null);
  const stuck = harness({ hangMove: true }); await stuck.load(); const pending = stuck.refresh(); await new Promise(r => setImmediate(r));
  const first = await Promise.race([pending, new Promise(r => setImmediate(() => r('waiting')))]); // No timer expired.
  assert.match(first.url, /^blob:/); assert.equal(stuck.api.status().refreshing, false); assert.equal(stuck.storage.has(META), false);
});
test('a save that has started finishes after hiding, and an overlapping save keeps its files', async () => {
  const big = new Uint8Array(600000); big.set([255, 216]); big.set([255, 217], big.length - 2); // Three 256 KiB steps.
  const h = harness({ image: big }), settle = () => new Promise(r => setImmediate(r));
  const run = async () => { for (let n = 0; n < 20 && h.timers.size; n++) { for (const [id, fn] of [...h.timers]) { h.timers.delete(id); fn(); } await settle(); } };
  await h.load();
  h.api.refresh(() => {}); await settle();
  assert.ok([...h.files.keys()].some(n => n.startsWith('incoming-')), 'the first save is mid-write');
  h.api.cancel(); h.api.refresh(() => {}); await settle(); // Hidden, shown again: the same photo is fetched and saved again.
  h.api.cancel(); await run();                             // Hidden again before either save finishes.
  assert.deepEqual(h.deleted.filter(n => n.startsWith('incoming-')), []);
  assert.ok(h.files.has(A + '.jpg'));
  assert.equal(h.files.get(A + '.jpg').length, big.length);
  assert.equal(JSON.parse(h.storage.get(META)).revision, A);
  assert.ok(![...h.files.keys()].some(n => n.startsWith('incoming-')));
});
test('repeatedly replaced candidates keep the installed blob alive and bound object URLs', async () => {
  const h = harness({ failMove: true }); await h.load(); const a = await h.refresh(); h.api.retain(a.url);
  for (const revision of [B,C,B,C]) { h.next(revision); await h.refresh(); }
  assert.ok(!h.revoked.includes(a.url)); assert.ok(h.revoked.length >= 2);
});

test('widget can use its configured private TV address and rejects external hosts', async () => {
  const own = harness({ storage: new Map([['cleanframe.art.host', '192.168.50.10']]) });
  await new Promise(resolve => own.api.refresh(resolve));
  assert.ok(own.requests.length === 3 && own.requests.every(url => url.startsWith('http://192.168.50.10:8643/')));
  for (const host of ['example.com', '8.8.8.8', '192.168.1.999', '192.168.1.10:8099', 'http://192.168.1.10']) {
    const h = harness({ storage: new Map([['cleanframe.art.host', host]]) });
    await new Promise(resolve => h.api.refresh(resolve));
    assert.ok(h.requests.every(url => url.startsWith('http://127.0.0.1:8643/')));
  }
});

test("a new photo is decided from the quick read; Art's picture settings apply when the full read lands", async () => {
  const h = harness(); h.slowFull(); h.look({ brightness: 3, colorTemperature: 2 });
  const fresh = await h.refresh();
  assert.equal(fresh.revision, A); assert.ok(fresh.url.startsWith('blob:'));
  assert.deepEqual(h.requests.slice(0, 2).map(u => u.replace(/^http:\/\/[^/]+/, '')).sort(), ['/current.json', '/current.json?quick=1']);
  assert.equal(h.storage.get('cleanframe.art.look.v1'), undefined);
  h.releaseFull(); await new Promise(r => setImmediate(r));
  assert.equal(h.storage.get('cleanframe.art.look.v1'), JSON.stringify({ colorTemperature: 2, brightness: 3 }));
});
test('without a quick answer (an older bridge) the full read decides the photo', async () => {
  const h = harness({ noQuick: true }); h.next(B);
  const fresh = await h.refresh();
  assert.equal(fresh.revision, B);
  // Both reads failing reports Art unavailable.
  const down = harness({ noQuick: true }); down.offline(true);
  assert.equal(await down.refresh(), null); assert.match(down.api.status().error, /unavailable/);
});

const settle = () => new Promise(r => setImmediate(r));
const watch = (h, since) => new Promise(r => h.api.watch(since, (rec, ms) => r({ rec, ms })));
test('watch runs only while hidden: 204 asks again at once, a new photo is fetched and saved, errors back off', async () => {
  const h = harness(); await h.load();
  assert.deepEqual(await watch(h, A), { rec: null, ms: 1000 }); // Shown: no wait is sent.
  assert.equal(h.requests.length, 0);
  h.context.document.hidden = true;
  assert.deepEqual(await watch(h, A), { rec: null, ms: 0 });
  assert.equal(h.requests.at(-1), 'http://127.0.0.1:8643/art/wait.json?since=' + A);
  h.waitReply({ status: 200, meta: meta(B) });
  const got = await watch(h, A);
  assert.equal(got.rec.revision, B); assert.equal(got.ms, 0); assert.equal(h.api.current().revision, B);
  assert.equal(h.requests.at(-1), 'http://127.0.0.1:8643/art/' + B + '/image.jpg');
  await settle();
  assert.ok(h.files.has(B + '.jpg')); assert.equal(JSON.parse(h.storage.get(META)).revision, B);
  // Already the current photo: no second download.
  const n = h.requests.length; assert.equal((await watch(h, null)).rec.revision, B); assert.equal(h.requests.length, n + 1);
  assert.equal(h.requests.at(-1), 'http://127.0.0.1:8643/art/wait.json?since=none');
  h.waitReply({ status: 404 }); assert.deepEqual(await watch(h, B), { rec: null, ms: 600000 }); // Older bridge.
  h.waitReply({ offline: true }); assert.deepEqual(await watch(h, B), { rec: null, ms: 30000 });
  h.waitReply({ status: 200, meta: { ...meta(C), imageUrl: '/elsewhere.jpg' } }); assert.deepEqual(await watch(h, B), { rec: null, ms: 30000 });
  // cancel() (Home shown) ends a wait without calling back.
  h.waitReply({ status: 200, meta: meta(C), held: true }); let called = false;
  h.api.watch(B, () => { called = true; }); h.api.cancel(); h.releaseWait(); await settle();
  assert.equal(called, false); assert.equal(h.api.current().revision, B);
});
test('a save survives a cancel straight after the photo is handed over (Home installs it at once)', async () => {
  const h = harness({ asyncList: true }); await h.load();
  await new Promise(r => h.api.refresh(rec => { h.api.cancel(); r(rec); }));
  for (let i = 0; i < 5; i++) await settle();
  assert.ok(h.files.has(A + '.jpg')); assert.equal(JSON.parse(h.storage.get(META)).revision, A);
});

test('a 4K Art photo is kept at 1920x1080: shown, saved and remembered at screen size', async () => {
  const h = harness({ full: [3840, 2160] }); await h.load();
  const shown = await h.refresh(); await new Promise(r => setImmediate(r));
  assert.equal(shown.width, 1920); assert.equal(shown.height, 1080);
  assert.deepEqual(h.drawn, [[3840, 2160, 1920, 1080, 1920, 1080]]);
  assert.ok(h.revoked.includes('blob:1'), 'the full-size copy is let go');
  assert.deepEqual([...h.files.get(A + '.jpg')], [...h.small]);
  const saved = JSON.parse(h.storage.get(META)); assert.equal(saved.width, 1920); assert.equal(saved.height, 1080);
  const restart = harness({ files: h.files, storage: h.storage }); restart.offline(true); // The saved file decodes at 1920x1080.
  const again = await restart.load(); assert.equal(again.revision, A); assert.equal(again.width, 1920);
});
test('a photo that is not 16:9 still covers the screen, and one already small enough is kept as it is', async () => {
  const tall = harness({ full: [3000, 3000] }); await tall.load(); await tall.refresh();
  assert.deepEqual(tall.drawn, [[3000, 3000, 1920, 1920, 1920, 1920]]);
  const fits = harness({ full: [1920, 1080] }); await fits.load(); await fits.refresh();
  assert.deepEqual(fits.drawn, []); assert.deepEqual([...fits.files.get(A + '.jpg')], [...jpeg]);
});
test('a full-size copy saved by an older build is fetched again and saved at screen size', async () => {
  const files = new Map([[A + '.jpg', jpeg]]), storage = new Map([[META, JSON.stringify(meta(A, 3840, 2160))]]);
  const h = harness({ files, storage, full: [3840, 2160] });
  assert.equal(await h.load(), null);
  const fresh = await h.refresh(); await new Promise(r => setImmediate(r));
  assert.equal(fresh.width, 1920); assert.deepEqual([...files.get(A + '.jpg')], [...h.small]);
  assert.equal(JSON.parse(storage.get(META)).width, 1920);
});
test('without a canvas the full-size photo is used and saved as before', async () => {
  const h = harness({ full: [3840, 2160], canvas: false }); await h.load();
  const shown = await h.refresh(); await new Promise(r => setImmediate(r));
  assert.equal(shown.width, 3840); assert.deepEqual([...h.files.get(A + '.jpg')], [...jpeg]);
});
