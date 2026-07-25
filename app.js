(() => {
'use strict';

const $ = (sel) => document.querySelector(sel);
const viewHome = $('#view-home');
const viewSurah = $('#view-surah');
const viewSearch = $('#view-search');
const btnBack = $('#btnBack');
const btnSearch = $('#btnSearch');
const brandHome = $('#brandHome');

let surahsMeta = null;
const surahCache = new Map();   // id -> surah data
const idxCache = new Map();     // letter -> index object

/* ---------------- Arabic normalization (mirrors build-time index) ---------------- */
const DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED\u08D4-\u08FF\u0640]/;
function normalize(text){
  let out = '';
  for(const ch of text){
    if(DIACRITICS.test(ch)) continue;
    if('إأآا'.includes(ch)) out += 'ا';
    else if(ch === 'ى') out += 'ي';
    else if(ch === 'ة') out += 'ه';
    else if(ch === 'ؤ') out += 'و';
    else if(ch === 'ئ') out += 'ي';
    else out += ch;
  }
  return out;
}
// Like normalize(), but also returns idxMap[i] = position in the original
// raw string of normalized char i — lets us translate a match position found
// in the (shorter) normalized text back to accurate raw-text offsets for
// snippet slicing, since diacritics are stripped during normalization.
function normalizeWithMap(text){
  let out = '';
  const idxMap = [];
  for(let i = 0; i < text.length; i++){
    const ch = text[i];
    if(!DIACRITICS.test(ch)){
      let mapped = ch;
      if('إأآا'.includes(ch)) mapped = 'ا';
      else if(ch === 'ى') mapped = 'ي';
      else if(ch === 'ة') mapped = 'ه';
      else if(ch === 'ؤ') mapped = 'و';
      else if(ch === 'ئ') mapped = 'ي';
      out += mapped;
      idxMap.push(i);
    }
  }
  return {norm: out, idxMap};
}
function tokenize(text){
  return (text.match(/[\u0621-\u064A]+/g) || []);
}

/* ---------------- Data loading ---------------- */
async function loadJSON(path){
  const res = await fetch(path);
  if(!res.ok) throw new Error('fetch failed: ' + path);
  return res.json();
}
async function getSurahsMeta(){
  if(!surahsMeta) surahsMeta = await loadJSON('data/surahs.json');
  return surahsMeta;
}
async function getSurah(id){
  if(surahCache.has(id)) return surahCache.get(id);
  const data = await loadJSON(`data/surah_${id}.json`);
  surahCache.set(id, data);
  return data;
}
async function getIndexLetter(letter){
  if(idxCache.has(letter)) return idxCache.get(letter);
  const code = letter.codePointAt(0);
  try{
    const data = await loadJSON(`idx/idx_${code}.json`);
    idxCache.set(letter, data);
    return data;
  }catch(e){
    idxCache.set(letter, {});
    return {};
  }
}

/* ---------------- Router ---------------- */
function route(){
  const hash = location.hash.slice(1) || '/';
  const parts = hash.split('/').filter(Boolean);
  hide(viewHome); hide(viewSurah); hide(viewSearch);
  if(parts[0] === 'surah' && parts[1]){
    btnBack.hidden = false;
    showSurah(parseInt(parts[1], 10), parts[2] ? parseInt(parts[2],10) : null);
  } else if(parts[0] === 'search'){
    btnBack.hidden = false;
    show(viewSearch);
    $('#searchInput').focus();
  } else {
    btnBack.hidden = true;
    showHome();
  }
}
function show(el){ el.hidden = false; }
function hide(el){ el.hidden = true; }

window.addEventListener('hashchange', route);
btnBack.addEventListener('click', () => { history.back(); });
brandHome.addEventListener('click', () => { location.hash = '#/'; });
btnSearch.addEventListener('click', () => { location.hash = '#/search'; });

/* ---------------- Home view ---------------- */
async function showHome(){
  show(viewHome);
  const list = $('#surahList');
  if(list.dataset.loaded) return;
  const meta = await getSurahsMeta();
  list.innerHTML = meta.map(s => surahItemHTML(s)).join('');
  list.dataset.loaded = '1';
  list.addEventListener('click', (e) => {
    const item = e.target.closest('.surah-item');
    if(item) location.hash = `#/surah/${item.dataset.id}`;
  });
  $('#quickFilter').addEventListener('input', (e) => {
    const q = normalize(e.target.value.trim());
    const items = list.querySelectorAll('.surah-item');
    items.forEach(it => {
      const hay = it.dataset.search;
      it.style.display = (!q || hay.includes(q)) ? '' : 'none';
    });
  });
}
function surahItemHTML(s){
  const searchKey = normalize(s.name) + ' ' + normalize(s.translit) + ' ' + s.id;
  const typeLabel = s.type === 'meccan' ? 'مكية' : 'مدنية';
  return `<li class="surah-item" data-id="${s.id}" data-search="${searchKey}">
    <span class="surah-num">${toArabicDigits(s.id)}</span>
    <span class="surah-info">
      <span class="surah-name">سورة ${s.name}</span>
      <span class="surah-meta">${typeLabel} · ${toArabicDigits(s.total)} آية</span>
    </span>
    <span class="surah-chevron">&#8592;</span>
  </li>`;
}
function toArabicDigits(n){
  const d = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  return String(n).split('').map(c => /[0-9]/.test(c) ? d[+c] : c).join('');
}

/* ---------------- Surah view ---------------- */
async function showSurah(id, jumpAyah){
  show(viewSurah);
  const eyebrow = $('#surahEyebrow');
  const title = $('#surahTitle');
  const sub = $('#surahSub');
  const list = $('#ayahList');
  const jump = $('#ayahJump');
  const loading = $('#surahLoading');

  title.textContent = ''; sub.textContent=''; eyebrow.textContent='';
  list.innerHTML = ''; jump.innerHTML='';
  loading.hidden = false;

  try{
    const data = await getSurah(id);
    loading.hidden = true;
    eyebrow.textContent = `السورة ${toArabicDigits(id)} من ١١٤`;
    title.textContent = `سورة ${data.name}`;
    sub.textContent = `${data.type === 'meccan' ? 'مكية' : 'مدنية'} · ${toArabicDigits(data.ayahs.length)} آية — تفسير القرطبي`;

    jump.innerHTML = data.ayahs.map(a => `<button data-a="${a.a}">${toArabicDigits(a.a)}</button>`).join('');
    jump.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if(!b) return;
      const el = document.getElementById(`ayah-${b.dataset.a}`);
      if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
    });

    list.innerHTML = data.ayahs.map(a => ayahCardHTML(id, a)).join('');
    list.querySelectorAll('.ayah-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const body = btn.previousElementSibling;
        const collapsed = body.classList.toggle('collapsed');
        btn.textContent = collapsed ? 'إظهار كامل الشرح ▾' : 'إخفاء ▴';
      });
    });

    // prev/next nav at bottom
    const navHTML = `<div class="surah-nav-end" style="display:flex;justify-content:space-between;margin-top:22px;font-family:var(--font-ui);font-size:13px;">
      ${id>1 ? `<a href="#/surah/${id-1}" style="color:var(--maroon);text-decoration:none;">→ السورة السابقة</a>` : '<span></span>'}
      ${id<114 ? `<a href="#/surah/${id+1}" style="color:var(--maroon);text-decoration:none;">السورة التالية ←</a>` : '<span></span>'}
    </div>`;
    list.insertAdjacentHTML('beforeend', navHTML);

    if(jumpAyah){
      requestAnimationFrame(() => {
        const el = document.getElementById(`ayah-${jumpAyah}`);
        if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
      });
    } else {
      window.scrollTo(0,0);
    }
  }catch(err){
    loading.hidden = true;
    list.innerHTML = `<p class="search-empty">تعذّر تحميل بيانات السورة. تحقّق من الاتصال وأعد المحاولة.</p>`;
  }
}
function ayahCardHTML(surahId, a){
  const tafsirHTML = a.t
    ? `<div class="ayah-tafsir collapsed">${escapeHTML(a.t)}</div><button class="ayah-toggle">إظهار كامل الشرح ▾</button>`
    : `<p class="ayah-empty">لا يوجد شرح مستقل لهذه الآية ضمن هذه الطبعة.</p>`;
  return `<div class="ayah-card" id="ayah-${a.a}">
    <p class="ayah-verse">${escapeHTML(a.v)} <span class="marker">${toArabicDigits(a.a)}</span></p>
    ${tafsirHTML}
  </div>`;
}
function escapeHTML(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ---------------- Search ---------------- */
let searchDebounce = null;
$('#searchInput').addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  const q = e.target.value.trim();
  searchDebounce = setTimeout(() => runSearch(q), 300);
});

async function runSearch(query){
  const results = $('#searchResults');
  const hint = $('#searchHint');
  if(!query){ results.innerHTML=''; hint.hidden=false; return; }

  const norm = normalize(query);
  const words = tokenize(norm).filter(w => w.length >= 2);
  if(!words.length){
    results.innerHTML = `<p class="search-empty">اكتب كلمة عربية صالحة للبحث.</p>`;
    return;
  }
  hint.hidden = true;
  results.innerHTML = `<p class="search-status">...جارٍ البحث</p>`;

  try{
    const letterGroups = await Promise.all(words.map(w => getIndexLetter(w[0])));
    let refSets = words.map((w, i) => {
      const chunk = letterGroups[i];
      // exact match first, fallback to prefix match within the same letter chunk
      if(chunk[w]) return new Set(chunk[w]);
      const set = new Set();
      for(const key in chunk){
        if(key.startsWith(w) || w.startsWith(key)){
          chunk[key].forEach(r => set.add(r));
        }
      }
      return set;
    });

    // intersect all sets (AND search across words)
    let refs = refSets.reduce((a,b) => new Set([...a].filter(x => b.has(x))));
    refs = [...refs];

    if(!refs.length){
      results.innerHTML = `<p class="search-empty">لم يُعثر على نتائج لهذا البحث.</p>`;
      return;
    }

    refs = refs.slice(0, 60); // cap for performance
    // group by surah to minimize fetches
    const bySurah = new Map();
    refs.forEach(r => {
      const [s,a] = r.split(':').map(Number);
      if(!bySurah.has(s)) bySurah.set(s, []);
      bySurah.get(s).push(a);
    });

    const surahIds = [...bySurah.keys()];
    const surahDatas = await Promise.all(surahIds.map(id => getSurah(id)));
    const surahById = new Map(surahIds.map((id,i) => [id, surahDatas[i]]));

    const cards = [];
    for(const [sid, ayahNums] of bySurah){
      const sdata = surahById.get(sid);
      for(const an of ayahNums){
        const ayah = sdata.ayahs.find(x => x.a === an);
        if(!ayah || !ayah.t) continue;
        cards.push(resultCardHTML(sdata, ayah, words));
      }
    }

    results.innerHTML = cards.length ? cards.join('') : `<p class="search-empty">لم يُعثر على نتائج لهذا البحث.</p>`;
    results.querySelectorAll('.result-card').forEach(c => {
      c.addEventListener('click', () => {
        location.hash = `#/surah/${c.dataset.surah}/${c.dataset.ayah}`;
      });
    });
  }catch(err){
    results.innerHTML = `<p class="search-empty">حدث خطأ أثناء البحث. تحقّق من الاتصال.</p>`;
  }
}

function resultCardHTML(sdata, ayah, words){
  const snippet = buildSnippet(ayah.t, words);
  return `<div class="result-card" data-surah="${sdata.id}" data-ayah="${ayah.a}">
    <div class="result-ref">سورة ${sdata.name} — آية ${toArabicDigits(ayah.a)}</div>
    <div class="result-snippet">${snippet}</div>
  </div>`;
}
function buildSnippet(text, words){
  const {norm, idxMap} = normalizeWithMap(text);
  let pos = -1;
  for(const w of words){
    const p = norm.indexOf(w);
    if(p >= 0 && (pos === -1 || p < pos)) pos = p;
  }
  const rawPos = pos >= 0 ? idxMap[pos] : 0;
  const start = Math.max(0, rawPos - 60);
  const end = Math.min(text.length, rawPos + 160);
  let snippet = (start>0?'…':'') + text.slice(start,end) + (end<text.length?'…':'');
  snippet = escapeHTML(snippet);
  words.forEach(w => {
    if(w.length < 2) return;
    // highlight loosely by matching normalized fragments back onto original via simple regex on raw text
    const re = new RegExp(w.split('').join('[\\u064B-\\u065F\\u0670]*'), 'g');
    snippet = snippet.replace(re, m => `<mark>${m}</mark>`);
  });
  return snippet;
}

/* ---------------- PWA ---------------- */
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  });
}

route();
})();
