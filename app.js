/**
 * Ulaşım & Proje Eşleştirme Modülü — uygulama mantığı.
 * Classic script (module değil) — file:// üzerinden de çalışsın diye.
 * ANKARA_DATA global değişkeni data.js tarafından tanımlanır.
 */

// ---------------------------------------------------------------------------
// 0) PAYLAŞIMLI PROJE VERİTABANI (Google Sheets + Apps Script)
// ---------------------------------------------------------------------------
// Proje listesi artık data.js'teki statik listeyle SINIRLI değil: sayfa
// açılışında paylaşımlı bir Google Sheet'ten canlı olarak çekilir, böylece
// İK ekibindeki herkes (hangi bilgisayardan girerse girsin) aynı güncel
// listeyi görür ve "Proje Ekle"/"Acil"/"Aç-Kapa" değişiklikleri herkese
// yansır. data.js'teki liste yalnızca ilk yükleme anında (Sheet'e henüz
// ulaşılamadıysa) çevrimdışı bir yedek olarak kullanılır.
const SHEET_API_URL = "https://script.google.com/macros/s/AKfycbxprctzoQPNbHz1kA3g4qQciSZ9hqIGtN_BC_q0YzSEvOmUGYxW9PKWTTpA7z6SoPw/exec";
const SHEET_CACHE_KEY = "ik_ulasim_sheet_cache_v1";

// Sheet'e başarılı bir yazmadan hemen sonra yerel önbelleği de günceller.
// Bunu atlarsak, kullanıcı bir projeyi aç/kapat edip kaydettikten sonra
// sayfayı yenilediğinde, sayfa açılışında ÖNCE eski önbellek anında
// gösterildiği için (canlı Sheet verisi arka planda gelene kadar) değişiklik
// "sıfırlanmış" gibi görünüyordu.
function saveProjectsCache() {
  try {
    localStorage.setItem(SHEET_CACHE_KEY, JSON.stringify(ANKARA_DATA.projects));
  } catch {
    /* localStorage kullanılamıyorsa sessizce yoksay */
  }
}

// data.js'teki statik projelerde henüz urgent/active alanı yok — bunları
// eski (ANKARA_DATA.urgentProjectIds / referral==="Aktif değil") mantığından
// türeterek her projeye ekliyoruz; Sheet'ten canlı veri geldiğinde bu
// alanların üzerine (Sheet'teki gerçek değerlerle) yazılır.
(function seedStaticActiveUrgentFields() {
  const staticUrgentIds = new Set(ANKARA_DATA.urgentProjectIds || []);
  ANKARA_DATA.projects.forEach((p) => {
    if (p.urgent === undefined) p.urgent = staticUrgentIds.has(p.id);
    if (p.active === undefined) p.active = p.referral !== "Aktif değil";
  });
})();

// URGENT_PROJECT_IDS / INACTIVE_PROJECT_IDS artık projelerin kendi
// urgent/active alanlarından TÜRETİLİR (Sheet = tek doğruluk kaynağı).
// Modallardan kaydedince önce Sheet'e yazılır, sonra bu setler yenilenir.
let URGENT_PROJECT_IDS = new Set();
let INACTIVE_PROJECT_IDS = new Set();
function recomputeUrgentInactiveSets() {
  URGENT_PROJECT_IDS = new Set(ANKARA_DATA.projects.filter((p) => p.urgent).map((p) => p.id));
  INACTIVE_PROJECT_IDS = new Set(ANKARA_DATA.projects.filter((p) => !p.active).map((p) => p.id));
}
recomputeUrgentInactiveSets();

function activeProjects() {
  return ANKARA_DATA.projects.filter((p) => !INACTIVE_PROJECT_IDS.has(p.id));
}

// Apps Script'e yazma isteği gönderir. Content-Type kasıtlı olarak
// "text/plain" — Apps Script Web App'leri tarayıcının CORS ön-kontrol
// (preflight OPTIONS) isteğini desteklemiyor; "application/json" kullanmak
// tarayıcının otomatik preflight göndermesine ve isteğin başarısız olmasına
// yol açardı. Gövde yine de geçerli JSON metni olarak gönderilir.
async function postToSheet(body) {
  const res = await fetch(SHEET_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Sheet isteği başarısız");
  return data;
}

// Birden fazla proje güncellemesini TEK bir istekte gönderir (Apps Script
// tarafında da tek bir Sheet okuma + tek bir Sheet yazma ile uygulanır) —
// her öğe için ayrı bir Apps Script çalıştırması (ve her birinin ~2-3sn'lik
// kilit/okuma/yazma maliyeti) gerekmediği için toplu Acil/Aç-Kapa
// kaydetmelerinde çok daha hızlıdır.
// patches: [{ id, patch }, ...]. Dönüş: { ok, updatedIds: Set, notFound: [] }.
async function postBatchUpdate(patches) {
  const data = await postToSheet({ action: "updateBatch", patches });
  const notFound = new Set(data.notFound || []);
  const updatedIds = new Set(patches.map((p) => p.id).filter((id) => !notFound.has(id)));
  return { updatedIds, notFound: [...notFound] };
}

// transitStops artık çoğu durak için (OSM tabanlı gerçek veri setinden
// eşleştirilmiş) kendi lat/lng'sini taşıyor — bunlar öncelikli kullanılır.
// Hâlâ koordinatsız kalan birkaç durak için (ör. stop_etlik, stop_pursaklar_est)
// eskisi gibi, o durağı accessStopId olarak kullanan ilçe/mahalle ve
// projelerin konumlarından yaklaşık bir konum türetiliyor.
let stopApproxCoordsCache = null;
function stopApproxCoords() {
  if (stopApproxCoordsCache) return stopApproxCoordsCache;
  const map = {};
  const add = (stopId, lat, lng) => {
    if (!stopId || map[stopId]) return;
    map[stopId] = { lat, lng };
  };
  ANKARA_DATA.transitStops.forEach((s) => {
    if (s.lat != null && s.lng != null) add(s.id, s.lat, s.lng);
  });
  ANKARA_DATA.districts.forEach((d) => {
    add(d.accessStopId, d.lat, d.lng);
    (d.neighborhoods || []).forEach((n) => add(n.accessStopId, n.lat, n.lng));
  });
  ANKARA_DATA.projects.forEach((p) => add(p.accessStopId, p.lat, p.lng));
  stopApproxCoordsCache = map;
  return map;
}

/** Basit haversine ile en yakın gerçek durağı bulur — yeni eklenen bir proje için otomatik durak ataması. */
function nearestTransitStop(lat, lng) {
  const coords = stopApproxCoords();
  let best = null;
  let bestDist = Infinity;
  ANKARA_DATA.transitStops.forEach((s) => {
    const c = coords[s.id];
    if (!c) return;
    const d = haversineKm({ lat, lng }, c);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  });
  return best;
}

// ---------------------------------------------------------------------------
// 1) YARDIMCI ARAMA TABLOLARI
// ---------------------------------------------------------------------------

const stopsById = Object.fromEntries(ANKARA_DATA.transitStops.map((s) => [s.id, s]));
const linesByStopId = {}; // stopId -> [lineId, ...]
ANKARA_DATA.transitLines.forEach((line) => {
  line.stopIds.forEach((stopId) => {
    (linesByStopId[stopId] = linesByStopId[stopId] || []).push(line.id);
  });
});
const linesById = Object.fromEntries(ANKARA_DATA.transitLines.map((l) => [l.id, l]));
const HUBS = new Set(ANKARA_DATA.hubStopIds);

function stopName(stopId) {
  return stopsById[stopId] ? stopsById[stopId].name : stopId;
}

// ---------------------------------------------------------------------------
// 2) MESAFE + TAHMİNİ ULAŞIM SÜRESİ HESABI (mock ulaşım matrisi motoru)
// ---------------------------------------------------------------------------

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function roundTo5(n) {
  return Math.round(n / 5) * 5;
}

// ---------------------------------------------------------------------------
// 2) GERÇEK GRAF TABANLI ROTA MOTORU
// ---------------------------------------------------------------------------
//
// transit_network.json'daki 668 gerçek EGO hattı / 10.940 gerçek durak
// üzerinde kurulan bir graf + çok-kaynaklı Dijkstra ile çalışır. Bir hat
// (ör. birleşmiş M1-M2-M3) tek bir gerçek hat_id taşıdığı için, aynı hat
// üzerindeki iki durak arasında ARTIK asla sahte bir "aktarma" üretilmiyor
// — eskiden data.js'teki elle seçilmiş ~10 hat/3 hub'lık özet ağ ve isim
// eşleştirmesine dayanan resolveTransfer() böyle bir hata üretebiliyordu.
// Grafın kendisi loadLocalTransitNetwork() tamamlanınca (aşağıda, §3b)
// kurulur; bu bölüm sadece kurulum ve sorgu fonksiyonlarını tanımlar.

// Otobüs hızı 20→16 km/s: 20, gerçek şehir içi trafik/ışık/duraklama dikkate
// alınınca fazla iyimserdi — uzun otobüs zincirlerini metroya karşı yapay
// şekilde rekabetçi gösteriyordu (bkz. Etlik→Bilkent Center örneği: gerçek
// hattı tam kullanan metro rotası bulunabiliyordu ama toplamda tüm-otobüs
// alternatifiyle neredeyse berabere kalıyordu). Metro/Ankaray hızı, raylı
// sistemin trafikten bağımsız olmasını yansıtacak şekilde hafif yükseltildi.
const MODE_SPEED_KMH = { otobus: 16, metro: 33, ankaray: 33, tren: 45, dolmus: 20 };
const WALK_SPEED_KMH = 4.5;
const STOP_DWELL_MIN = 0.4;
// Sabit bir "aktarma cezası" yerine, her araca binişte (ilk biniş DAHİL,
// sadece aktarmalarda değil) o modun ortalama sefer sıklığının yarısı kadar
// bekleme süresi ekleniyor — gerçekte otobüs/metro tam istediğin an orada
// olmuyor. Başkentray için OSM'den çekilen gerçek "interval" etiketi (15 dk)
// kullanıldı; otobüs/metro/Ankaray için Ankara'da bilinen tipik sefer
// sıklıklarına dayalı makul ortalamalar. Aynı hatta kalmaya devam etmek
// (biniş değişmiyorsa) hâlâ tamamen bedava.
const MODE_HEADWAY_MIN = { otobus: 15, metro: 6, ankaray: 6, tren: 15, dolmus: 10 };
function avgWaitMin(mode) {
  return (MODE_HEADWAY_MIN[mode] !== undefined ? MODE_HEADWAY_MIN[mode] : MODE_HEADWAY_MIN.otobus) / 2;
}
const WALK_TRANSFER_MAX_KM = 0.35; // farklı hatların yakın duraklarını "aktarma" olarak bağlayan yürüme kenarları
// 1.2km/6 aday, Gölbaşı/Mogan Gölü gibi seyrek bölgelerde gerçek en iyi
// hattı kaçırıyordu: Google Maps'in önerdiği daha hızlı hatların bindiği
// durak (MOGAN PARKI) merkeze 1.44km'de — 1.2km sınırının hemen dışında
// kalıp hiç aday olarak değerlendirilmiyordu, oysa Google (sınırsız yürüme
// arama mesafesiyle) o durağa 24 dk'lık gerçek bir yürüyüş öneriyordu.
// 1.8km/10 adaya çıkarınca aynı örnekte süre 109 dk'dan 85 dk'ya düşüp
// Google'ın en iyi seçeneğiyle (84 dk) örtüştü — bkz. proje notları.
const NEAREST_STOP_SEARCH_KM = 1.8; // bir nokta çevresinde graf'a giriş/çıkış için aranan yarıçap
const NEAREST_STOP_MAX_CANDIDATES = 10;
const WALK_STEP_MIN_KM = 0.12; // bundan kısa yürümeler ayrı adım olarak gösterilmez (süreye yine de dahil)
const GRID_CELL_DEG = 0.006; // ~500-650m'lik ızgara hücresi (Ankara enleminde)

function walkMinutes(km) {
  return (km / WALK_SPEED_KMH) * 60;
}

function gridCellKey(lat, lng) {
  return `${Math.floor(lat / GRID_CELL_DEG)}:${Math.floor(lng / GRID_CELL_DEG)}`;
}

/** Basit ikili min-heap — Dijkstra'nın öncelik kuyruğu için (10k+ düğümde O(n) pop performans sorunu yaratırdı). */
class MinHeap {
  constructor() {
    this.items = [];
  }
  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].minutes <= a[i].minutes) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      const n = a.length;
      for (;;) {
        let smallest = i;
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        if (l < n && a[l].minutes < a[smallest].minutes) smallest = l;
        if (r < n && a[r].minutes < a[smallest].minutes) smallest = r;
        if (smallest === i) break;
        [a[i], a[smallest]] = [a[smallest], a[i]];
        i = smallest;
      }
    }
    return top;
  }
  get isEmpty() {
    return this.items.length === 0;
  }
}

let transitGraph = null; // buildTransitGraph() tamamlanınca dolar — SADECE resmi hatlar (dolmuş hariç)
let transitGraphWithDolmus = null; // dolmuş dahil tam graf — sadece "dolmuşla alternatif" kontrolü için

/**
 * "tren" modundaki hatların çoğu (25'ten 22'si) YHT/ekspres gibi şehirlerarası
 * servisler (Ankara-İstanbul, Ankara-Konya YHT'si vb.) — bunlar bilet/
 * rezervasyon gerektirir, seyrek sefer yapar ve şehir içi durak vermez; bir
 * adayın günlük işe gidiş-gelişi için gerçekçi değildir. Gerçek şehir
 * içi/banliyö hattı olan Başkentray (B1) ve Ankara-Polatlı Bölgesel Treni
 * (B21) kısa, gerçek bir hat numarası taşırken, şehirlerarası olanlar OSM
 * ilişki id'sini placeholder olarak taşıyor (hatNo: "LINE 12345") — bu farkla
 * ayırt ediyoruz.
 */
function isRoutableLine(line) {
  if (line.mode !== "tren") return true;
  return /^B\d+$/.test(line.hatNo || "");
}

/**
 * transit_network.json'dan (network: {stops, lines}) bir graf kurar:
 * - Biniş kenarları: her hattın ardışık durakları arası, iki yönde de,
 *   gerçek mesafe/mod hızına göre süreli.
 * - Yürüme/aktarma kenarları: ızgara komşuluğuyla (O(n²) tarama YOK)
 *   ≤350m'deki FARKLI duraklar arası.
 */
function buildTransitGraph(network, options) {
  const excludeModes = (options && options.excludeModes) || new Set();
  const stopsById = new Map();
  const grid = new Map();
  network.stops.forEach((s) => {
    if (excludeModes.has(s.mode)) return;
    if (typeof s.lat !== "number" || typeof s.lng !== "number") return;
    stopsById.set(s.id, s);
    const key = gridCellKey(s.lat, s.lng);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(s.id);
  });

  const adjacency = new Map();
  const addEdge = (fromId, toId, minutes, lineId, mode) => {
    if (!adjacency.has(fromId)) adjacency.set(fromId, []);
    adjacency.get(fromId).push({ to: toId, minutes, lineId, mode });
  };

  const linesByLocalId = new Map();
  network.lines.forEach((line) => {
    if (excludeModes.has(line.mode)) return;
    if (!isRoutableLine(line)) return;
    linesByLocalId.set(line.id, line);
    const speed = MODE_SPEED_KMH[line.mode] || MODE_SPEED_KMH.otobus;
    const ids = line.stopIds || [];
    for (let i = 0; i < ids.length - 1; i++) {
      const a = stopsById.get(ids[i]);
      const b = stopsById.get(ids[i + 1]);
      if (!a || !b) continue;
      const km = haversineKm({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
      const minutes = (km / speed) * 60 + STOP_DWELL_MIN;
      addEdge(a.id, b.id, minutes, line.id, line.mode);
      addEdge(b.id, a.id, minutes, line.id, line.mode);
    }
  });

  const offsets = [-1, 0, 1];
  network.stops.forEach((s) => {
    if (typeof s.lat !== "number") return;
    const cellLat = Math.floor(s.lat / GRID_CELL_DEG);
    const cellLng = Math.floor(s.lng / GRID_CELL_DEG);
    offsets.forEach((dLat) => {
      offsets.forEach((dLng) => {
        const bucket = grid.get(`${cellLat + dLat}:${cellLng + dLng}`);
        if (!bucket) return;
        bucket.forEach((otherId) => {
          if (otherId === s.id) return;
          const other = stopsById.get(otherId);
          const km = haversineKm({ lat: s.lat, lng: s.lng }, { lat: other.lat, lng: other.lng });
          if (km <= WALK_TRANSFER_MAX_KM) {
            addEdge(s.id, otherId, walkMinutes(km), null, "yurume");
          }
        });
      });
    });
  });

  return { stopsById, grid, adjacency, linesByLocalId };
}

/** Bir {lat,lng} noktasının radiusKm çevresindeki gerçek durakları (uzaklığa göre sıralı) döner. */
function stopsWithinRadius(graph, lat, lng, radiusKm) {
  const cellSpan = Math.ceil(radiusKm / 0.5) + 1;
  const cellLat = Math.floor(lat / GRID_CELL_DEG);
  const cellLng = Math.floor(lng / GRID_CELL_DEG);
  const results = [];
  for (let dLat = -cellSpan; dLat <= cellSpan; dLat++) {
    for (let dLng = -cellSpan; dLng <= cellSpan; dLng++) {
      const bucket = graph.grid.get(`${cellLat + dLat}:${cellLng + dLng}`);
      if (!bucket) continue;
      bucket.forEach((id) => {
        const s = graph.stopsById.get(id);
        const km = haversineKm({ lat, lng }, { lat: s.lat, lng: s.lng });
        if (km <= radiusKm) results.push({ stop: s, km });
      });
    }
  }
  results.sort((a, b) => a.km - b.km);
  return results;
}

/**
 * Çok kaynaklı Dijkstra. ÖNEMLİ: durum sadece durak değil, "hangi hatta
 * bulunuluyor" bilgisini de taşır (stopId + lineId birlikte bir durum
 * oluşturur) — sadece durağa göre tek bir en-iyi-süre tutmak, gerçek bir
 * hatta binmişken ARA istasyonlardan birine başka (daha ucuz ama farklı)
 * bir hatla da ulaşılabiliyorsa, o ara istasyonun "daha ucuz" kaydını
 * kilitleyip asıl hattın devamını keşfetmeyi engelliyordu. Somut örnek:
 * Kızılay'dan Bilkent'e TEK hatla giden metro, yol üstündeki Necatibey/
 * Millî Kütüphane gibi istasyonlara yerel bir otobüsle biraz daha "ucuza"
 * ulaşılabildiği için hiç keşfedilmiyordu — oysa metroyla devam etmek
 * (o ara istasyonlara o an nasıl ulaşıldığından bağımsız olarak) toplamda
 * daha hızlıydı. Bu yüzden aynı durağa aynı hatla ulaşan her farklı "durum"
 * ayrı ayrı takip ediliyor; bir durağa gerçekten en hızlı ulaşım ise tüm
 * hat-durumları arasındaki minimum olarak (bestAtStop) ayrıca tutuluyor.
 */
function runDijkstra(graph, sources) {
  const NONE = " "; // henüz hiçbir hatta binilmemiş/sadece yürünüyor durumu
  const dist = new Map(); // "stopId|lineKey" -> dakika
  const prev = new Map(); // "stopId|lineKey" -> { fromKey, lineId, mode }
  const keyStopId = new Map(); // "stopId|lineKey" -> stopId
  const bestAtStop = new Map(); // stopId -> tüm hat-durumları arasında en iyi dakika
  const bestStateAtStop = new Map(); // stopId -> o en iyiye ulaşan durum anahtarı
  const heap = new MinHeap();

  function relaxBestAtStop(stopId, key, minutes) {
    const cur = bestAtStop.get(stopId);
    if (cur === undefined || minutes < cur - 1e-9) {
      bestAtStop.set(stopId, minutes);
      bestStateAtStop.set(stopId, key);
    }
  }

  sources.forEach(({ stopId, startMinutes }) => {
    const key = stopId + "|" + NONE;
    if (!dist.has(key) || dist.get(key) > startMinutes) {
      dist.set(key, startMinutes);
      keyStopId.set(key, stopId);
      heap.push({ stopId, lineKey: NONE, minutes: startMinutes });
      relaxBestAtStop(stopId, key, startMinutes);
    }
  });

  while (!heap.isEmpty) {
    const cur = heap.pop();
    const curKey = cur.stopId + "|" + cur.lineKey;
    if (cur.minutes > dist.get(curKey) + 1e-6) continue; // eski/geçersiz kayıt
    const curLine = cur.lineKey === NONE ? null : cur.lineKey;
    const edges = graph.adjacency.get(cur.stopId) || [];
    edges.forEach((e) => {
      // Yürüme kenarları durumu HER ZAMAN nötrler (NONE) — hangi hatla
      // gelindiği bilgisini taşımaya devam etseydi, yoğun aktarma
      // bölgelerinde (Kızılay gibi onlarca hattın kesiştiği duraklar)
      // yürüme zincirleri üzerinden durum sayısı katlanarak patlıyordu
      // (bir seçim ~19 saniye sürüyordu). Yürümenin kendisi bedava (sadece
      // kendi süresi var); bekleme cezası SADECE bir araca binerken —
      // ilk biniş dahil, sadece aktarmalarda değil — o hattın moduna göre
      // uygulanıyor (bkz. avgWaitMin). Aynı hatta kalmaya devam etmek
      // (biniş hattı değişmiyorsa) hâlâ tamamen bedava.
      let waitCost = 0;
      let newLineKey;
      if (e.lineId) {
        if (curLine !== e.lineId) waitCost = avgWaitMin(e.mode);
        newLineKey = e.lineId;
      } else {
        newLineKey = NONE;
      }
      const newMinutes = cur.minutes + e.minutes + waitCost;
      const newKey = e.to + "|" + newLineKey;
      const known = dist.get(newKey);
      if (known === undefined || newMinutes < known - 1e-9) {
        dist.set(newKey, newMinutes);
        keyStopId.set(newKey, e.to);
        prev.set(newKey, { fromKey: curKey, lineId: e.lineId, mode: e.mode });
        heap.push({ stopId: e.to, lineKey: newLineKey, minutes: newMinutes });
        relaxBestAtStop(e.to, newKey, newMinutes);
      }
    });
  }
  return { prev, keyStopId, bestAtStop, bestStateAtStop };
}

// rankProjectsForOrigin/rankDistrictsForProject tek bir tarafı sabit tutup
// diğerini döngüyle değiştiriyor; hangi taraf sabitse Dijkstra'yı SADECE
// ondan bir kez çalıştırıp sonucu burada önbelleğe alıyoruz (aksi halde her
// proje/ilçe çifti için ayrı bir tam graf taraması gerekirdi).
// Graf başına ayrı önbellek (Map anahtarı graf nesnesinin kendisi) — hem
// resmi graf (transitGraph) hem dolmuş dahil graf (transitGraphWithDolmus)
// için aynı fonksiyonlar kullanılabilsin diye.
const dijkstraCacheByGraph = new Map();

function getDijkstraFrom(coords, graph = transitGraph) {
  const key = coords.lat.toFixed(4) + "," + coords.lng.toFixed(4);
  const cached = dijkstraCacheByGraph.get(graph);
  if (cached && cached.key === key) return cached.result;
  const sources = stopsWithinRadius(graph, coords.lat, coords.lng, NEAREST_STOP_SEARCH_KM)
    .slice(0, NEAREST_STOP_MAX_CANDIDATES)
    .map(({ stop, km }) => ({ stopId: stop.id, startMinutes: walkMinutes(km) }));
  const result = runDijkstra(graph, sources);
  dijkstraCacheByGraph.set(graph, { key, result });
  return result;
}

/**
 * originCoords/destCoords: {lat, lng}. graph verilmezse resmi graf kullanılır.
 * fixedSide: bir dizi çağrı boyunca hangi ucun SABİT kaldığını belirtir
 * ("origin" varsayılan). Dijkstra HER ZAMAN fixedSide tarafından koşturulur
 * (getDijkstraFrom tek girişlik önbelleğinden faydalansın diye) — origin
 * sabitken (ör. rankProjectsForOrigin: aynı aday için onlarca proje
 * taranıyor) bu zaten varsayılan davranıştı. fixedSide="dest" ise (ör.
 * rankDistrictsForProject: aynı proje için onlarca ilçe taranıyor) Dijkstra
 * dest'ten koşturulup yol sonradan origin->dest sırasına çevrilir — kenarın
 * hat/modu yöne bağlı olmadığı için (bkz. buildTransitGraph, her kenar iki
 * yönde de eklenir) bu çevirme sonucu ETKİLEMEZ, sadece SIRAYI düzeltir.
 * Bu olmadan, sabit taraf dest iken her satırda origin değiştiği için
 * Dijkstra önbelleği hiç isabet etmiyor ve her sorgu tam bir graf taraması
 * gerektiriyordu (9 ilçe için ~5 saniye — gözlemlenen "çok yavaş" şikayeti).
 * Dönüş: { totalMinutes, pathStopIds, edgeAtStop } ya da her iki nokta
 * arasında (1.2km içinde hiç durak yoksa) null.
 */
function findRealRoute(originCoords, destCoords, graph = transitGraph, fixedSide = "origin") {
  if (!graph) return null;
  const fromCoords = fixedSide === "dest" ? destCoords : originCoords;
  const toCoords = fixedSide === "dest" ? originCoords : destCoords;
  const { prev, keyStopId, bestAtStop, bestStateAtStop } = getDijkstraFrom(fromCoords, graph);
  const toCandidates = stopsWithinRadius(graph, toCoords.lat, toCoords.lng, NEAREST_STOP_SEARCH_KM).slice(
    0,
    NEAREST_STOP_MAX_CANDIDATES
  );

  let best = null;
  toCandidates.forEach(({ stop, km }) => {
    const d = bestAtStop.get(stop.id);
    if (d === undefined) return;
    const total = d + walkMinutes(km);
    if (!best || total < best.total) best = { total, stopId: stop.id };
  });
  if (!best) return null;

  const pathStopIds = [];
  const edgeAtStop = new Map(); // varış durağı stopId -> o durağa gelirken kullanılan {lineId, mode}
  let curKey = bestStateAtStop.get(best.stopId);
  while (curKey) {
    const stopId = keyStopId.get(curKey);
    pathStopIds.unshift(stopId);
    const p = prev.get(curKey);
    if (p) edgeAtStop.set(stopId, { lineId: p.lineId, mode: p.mode });
    curKey = p ? p.fromKey : null;
  }

  if (fixedSide !== "dest") {
    return { totalMinutes: best.total, pathStopIds, edgeAtStop };
  }

  // Dijkstra dest'ten koşturuldu; pathStopIds şu an dest->origin sırasında.
  // Çağıranın beklediği origin->dest sırasına çeviriyoruz.
  const reversedIds = [...pathStopIds].reverse();
  const reversedEdgeAtStop = new Map();
  for (let i = 0; i < pathStopIds.length - 1; i++) {
    reversedEdgeAtStop.set(pathStopIds[i], edgeAtStop.get(pathStopIds[i + 1]));
  }
  return { totalMinutes: best.total, pathStopIds: reversedIds, edgeAtStop: reversedEdgeAtStop };
}

/** Bir durak dizisini (ve prev'deki hat bilgisini), ardışık aynı hattı tek adımda birleştirerek adımlara çevirir. */
function pathToSteps(pathStopIds, edgeAtStop, graph) {
  const rawEdges = [];
  for (let i = 1; i < pathStopIds.length; i++) {
    const info = edgeAtStop.get(pathStopIds[i]);
    rawEdges.push({ from: pathStopIds[i - 1], to: pathStopIds[i], lineId: info.lineId, mode: info.mode });
  }

  // Aynı fiziksel noktaya çok yakın ama farklı isimli/yönlü iki durak arası
  // (ör. bir caddenin gidiş/dönüş durakları) sıfıra yakın bir yürüme kenarı
  // oluşturabilir. Bunu BİRLEŞTİRMEDEN ÖNCE elemek gerekiyor — aksi halde
  // aynı hattın iki bacağı arasına sıkışan böyle bir kenar, birleşmeyi
  // engelleyip aynı hattı yapay şekilde iki ayrı adım gibi gösterebiliyor.
  const meaningfulEdges = rawEdges.filter((e) => {
    if (e.lineId) return true;
    const a = graph.stopsById.get(e.from);
    const b = graph.stopsById.get(e.to);
    return haversineKm({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }) > WALK_STEP_MIN_KM;
  });

  const merged = [];
  meaningfulEdges.forEach((e) => {
    const last = merged[merged.length - 1];
    if (last && last._lineId === e.lineId) {
      last.toStopId = e.to;
    } else {
      merged.push({ _lineId: e.lineId, mode: e.mode, fromStopId: e.from, toStopId: e.to });
    }
  });

  return merged.map((s) => {
    const fromName = graph.stopsById.get(s.fromStopId).name;
    const toName = graph.stopsById.get(s.toStopId).name;
    if (s._lineId) {
      const line = graph.linesByLocalId.get(s._lineId);
      return {
        mode: line ? line.mode : s.mode,
        line: line ? formatLineLabel(line.hatNo, line.name) : "Hat",
        from: fromName,
        to: toName,
        verified: line ? line.verified !== false : true,
        lineId: s._lineId,
      };
    }
    return { mode: "hub", line: "Yürüyüş", from: fromName, to: toName, verified: true, lineId: null };
  });
}

/**
 * originCoords/destCoords: {lat, lng}
 * fixedSide: bir dizi çağrı boyunca hangi ucun sabit kaldığını belirtir —
 * Dijkstra önbelleğinin isabet etmesi için findRealRoute'a olduğu gibi
 * iletilir (bkz. findRealRoute'un başındaki not).
 * Dönüş: { durationMin, transfers, routeSummary, steps, distanceKm, verified }
 */
function estimateTransit(origin, dest, fixedSide = "origin") {
  const distanceKm = haversineKm(origin.coords, dest.coords);
  const destLabel = dest.name || stopName(dest.stopId);
  const originLabel = origin.name || stopName(origin.stopId);

  if (!transitGraph) {
    // Graf henüz kurulmadı (transit_network.json hâlâ indiriliyor) — kaba bir
    // geçici tahmin döneriz; graf hazır olur olmaz runSearch() otomatik
    // tekrar çağrılıp sonuç sessizce gerçek rotayla güncellenir.
    const durationMin = Math.max(roundTo5((distanceKm / 18) * 60 + 10), 12);
    return {
      durationMin, transfers: 0,
      routeSummary: "Hesaplanıyor…",
      steps: [{ mode: "hub", line: "Hesaplanıyor…", from: originLabel, to: destLabel, verified: false, lineId: null }],
      distanceKm, verified: false,
    };
  }

  const route = findRealRoute(origin.coords, dest.coords, transitGraph, fixedSide);
  if (!route) {
    // Güvenlik ağı: bir uç, gerçek ağın 1.2km çevresinde hiç durağa denk
    // gelmiyorsa (ör. Ankara dışı bir adres) düz tahmine düşülür.
    const durationMin = Math.max(roundTo5((distanceKm / 18) * 60 + 10), 12);
    return {
      durationMin, transfers: 0,
      routeSummary: `Yerel hat (doğrulanamadı) (${destLabel} civarı)`,
      steps: [{ mode: "otobus", line: "Yerel hat (doğrulanamadı)", from: originLabel, to: destLabel, verified: false, lineId: null, approx: true }],
      distanceKm, verified: false,
    };
  }

  const steps = pathToSteps(route.pathStopIds, route.edgeAtStop, transitGraph);

  const firstStop = transitGraph.stopsById.get(route.pathStopIds[0]);
  const lastStop = transitGraph.stopsById.get(route.pathStopIds[route.pathStopIds.length - 1]);
  const firstWalkKm = haversineKm(origin.coords, { lat: firstStop.lat, lng: firstStop.lng });
  const lastWalkKm = haversineKm({ lat: lastStop.lat, lng: lastStop.lng }, dest.coords);

  if (lastWalkKm > WALK_STEP_MIN_KM) {
    steps.push({ mode: "hub", line: "Yürüyüş", from: lastStop.name, to: destLabel, verified: true, lineId: null });
  }
  if (firstWalkKm > WALK_STEP_MIN_KM) {
    steps.unshift({ mode: "hub", line: "Yürüyüş", from: originLabel, to: firstStop.name, verified: true, lineId: null });
  }

  const rideSteps = steps.filter((s) => s.lineId);
  const transfers = Math.max(rideSteps.length - 1, 0);
  const durationMin = Math.max(roundTo5(route.totalMinutes), 5);
  const routeSummary = `${rideSteps.length ? rideSteps.map((s) => s.line).join(" + ") : "Yürüyüş"} (${destLabel} civarı)`;
  const verified = steps.every((s) => s.verified);

  const dolmusAlternative = buildDolmusAlternative(origin, dest, originLabel, destLabel, route.totalMinutes, fixedSide);

  return { durationMin, transfers, routeSummary, steps, distanceKm, verified, dolmusAlternative };
}

// Ana rota SADECE resmi taşımayla (yukarıda) hesaplanır — dolmuş, resmi
// olmayan/gayriresmi bir hizmet olduğu için sıralama/eşleştirmeye hiç
// karışmıyor. Burada, dolmuş dahil TAM graf üzerinde AYRI bir Dijkstra
// çalıştırılıp, sadece gerçekten (a) en az bir dolmuş adımı içeren VE
// (b) resmi rotadan belirgin ölçüde (>=5 dk) daha hızlı bir yol varsa,
// bu "alternatif" olarak ayrıca döndürülür — kullanıcının kendi isteğiyle
// (rota kısmında dolmuşu ayrı bir yerde göstermek) birebir örtüşüyor.
const DOLMUS_ALT_MIN_SAVING_MIN = 5;

function buildDolmusAlternative(origin, dest, originLabel, destLabel, officialMinutes, fixedSide = "origin") {
  if (!transitGraphWithDolmus) return null;

  const altRoute = findRealRoute(origin.coords, dest.coords, transitGraphWithDolmus, fixedSide);
  if (!altRoute) return null;
  if (officialMinutes - altRoute.totalMinutes < DOLMUS_ALT_MIN_SAVING_MIN) return null;

  const altSteps = pathToSteps(altRoute.pathStopIds, altRoute.edgeAtStop, transitGraphWithDolmus);
  const usesDolmus = altSteps.some((s) => s.mode === "dolmus");
  if (!usesDolmus) return null;

  const firstStop = transitGraphWithDolmus.stopsById.get(altRoute.pathStopIds[0]);
  const lastStop = transitGraphWithDolmus.stopsById.get(altRoute.pathStopIds[altRoute.pathStopIds.length - 1]);
  const firstWalkKm = haversineKm(origin.coords, { lat: firstStop.lat, lng: firstStop.lng });
  const lastWalkKm = haversineKm({ lat: lastStop.lat, lng: lastStop.lng }, dest.coords);

  if (lastWalkKm > WALK_STEP_MIN_KM) {
    altSteps.push({ mode: "hub", line: "Yürüyüş", from: lastStop.name, to: destLabel, verified: true, lineId: null });
  }
  if (firstWalkKm > WALK_STEP_MIN_KM) {
    altSteps.unshift({ mode: "hub", line: "Yürüyüş", from: originLabel, to: firstStop.name, verified: true, lineId: null });
  }

  const altRideSteps = altSteps.filter((s) => s.lineId);
  const durationMin = Math.max(roundTo5(altRoute.totalMinutes), 5);
  const routeSummary = altRideSteps.length ? altRideSteps.map((s) => s.line).join(" + ") : "Yürüyüş";

  return {
    durationMin,
    transfers: Math.max(altRideSteps.length - 1, 0),
    routeSummary,
    steps: altSteps,
    savingMin: roundTo5(officialMinutes - altRoute.totalMinutes),
  };
}

// ---------------------------------------------------------------------------
// 3) İLÇE BAZLI CACHE (localStorage) — gerçek API entegrasyonunda maliyet düşürür
// ---------------------------------------------------------------------------

const TransitCache = {
  KEY: "ik_ulasim_cache_v22", // v22: en yakın durak arama yarıçapı 1.2km/6->1.8km/10 (seyrek bölgelerde gerçek en hızlı hat artık gözden kaçmıyor)
  _mem: null,
  _load() {
    if (this._mem) return this._mem;
    try {
      this._mem = JSON.parse(localStorage.getItem(this.KEY) || "{}");
    } catch {
      this._mem = {};
    }
    return this._mem;
  },
  _save() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(this._mem || {}));
    } catch {
      /* localStorage kullanılamıyorsa sessizce yoksay (örn. gizli sekme) */
    }
  },
  get(key) {
    return this._load()[key];
  },
  set(key, value) {
    this._load();
    this._mem[key] = value;
    this._save();
  },
  clearAll() {
    this._mem = {};
    this._save();
  },
};

/**
 * originId/destId: stabil kimlikler (ör. "kecioren" ilçe id'si, "proj_bilkent_center" proje id'si)
 * origin/dest: { coords: {lat,lng}, stopId }
 *
 * NOT: Gerçek entegrasyonda bu fonksiyonun içindeki estimateTransit çağrısı
 * Google Maps Transit API (Directions API, mode=transit) isteğiyle
 * değiştirilir. Cache anahtarı (originId_destId) aynı kalır; böylece aynı
 * ilçe-proje çifti tekrar sorgulandığında API'ye tekrar gidilmez.
 */
function getTransitEstimate(originId, origin, destId, dest, fixedSide = "origin") {
  const cacheKey = `${originId}__${destId}`;
  const cached = TransitCache.get(cacheKey);
  if (cached) return cached;

  const result = estimateTransit(origin, dest, fixedSide);
  TransitCache.set(cacheKey, result);
  return result;
}

// Cache anahtarı "originId__destId" biçiminde; id, anahtarın herhangi bir
// tarafında olabilir ("Aday → Proje" modunda origin ilk taraf, "Proje →
// Aday Havuzu" modunda proje ikinci taraftır) — bu yüzden ikisini de kontrol eder.
function invalidateCacheForOrigin(id) {
  const mem = TransitCache._load();
  Object.keys(mem)
    .filter((k) => k.startsWith(`${id}__`) || k.endsWith(`__${id}`))
    .forEach((k) => delete mem[k]);
  TransitCache._save();
}

// ---------------------------------------------------------------------------
// 3b) CANLI ADRES ARAMA + YAKIN DURAK/HAT KEŞFİ (Nominatim + Overpass)
// ---------------------------------------------------------------------------
//
// Etlik gibi bir semtte tek bir hat değil onlarca gerçek EGO hattı var. Statik
// veri seti (data.js) her ilçe/mahalle için sadece bir-iki doğrulanmış hat
// içeriyor. Bu bölüm, seçilen HERHANGİ BİR konum (serbest metinle aranan bir
// adres ya da hazır ilçe/mahalle seçimi) için OpenStreetMap/Overpass üzerinden
// o noktaya yürüme mesafesindeki TÜM gerçek durakları ve oradan geçen TÜM
// gerçek hatları canlı olarak bulur, bilinen aktarma ağımıza (Kızılay,
// Batıkent, Ankara Gar ve bunlara bağlı istasyonlar) isim eşleştirmesiyle
// ekler. Sonuçlar localStorage'da önbelleğe alınır.

let customOrigins = {}; // id -> { id, name, coords, stopId, discovery }
let customOriginCounter = 0;

function readJsonCache(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}
function writeJsonCache(key, obj) {
  try {
    localStorage.setItem(key, JSON.stringify(obj));
  } catch {
    /* localStorage kullanılamıyorsa sessizce yoksay */
  }
}

const GEOCODE_CACHE_KEY = "ik_ulasim_geocode_cache_v1";
const DISCOVERY_CACHE_KEY = "ik_ulasim_discovery_cache_v3"; // v3: KNOWN_STOP_NAME_INDEX genişletildi (yeni gerçek duraklar), önbellek sıfırlandı

/** Serbest metin bir adresi/semt adını Ankara sınırlarıyla sınırlı şekilde koordinata çevirir (OSM Nominatim). */
async function geocodeAddress(query) {
  const cache = readJsonCache(GEOCODE_CACHE_KEY);
  const cacheKey = query.trim().toLocaleLowerCase("tr");
  if (cache[cacheKey]) return cache[cacheKey];

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
    query + ", Ankara, Türkiye"
  )}&viewbox=32.35,40.25,33.15,39.55&bounded=1&limit=1&countrycodes=tr`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Nominatim isteği başarısız");
  const data = await res.json();
  if (!data.length) return null;

  const result = { label: data[0].display_name.split(",").slice(0, 2).join(",").trim(), lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  cache[cacheKey] = result;
  writeJsonCache(GEOCODE_CACHE_KEY, cache);
  return result;
}

// Gerçek hat verisinde (from/to/via/name alanlarında) bu isimlerden biri
// geçiyorsa, o hattın bilinen ağımızdaki karşılık gelen durağa ulaştığını
// kabul ediyoruz (261-6 ve 105-1'i doğrulamak için kullandığımız yöntemle
// aynı: gerçek OSM etiket metnini okumak).
// SADECE gerçek durak adıyla BİREBİR eşleşen (yaklaşık/komşu semt değil)
// girdiler bulunur. Örn. "İvedik" veya "Akköprü" gerçek ama AYRI M1
// durakları — Ulus'a eşitlemek "208 hattı Ulus'a gidiyor" gibi yanlış bir
// iddiaya yol açıyordu (gerçekte İvedik'te ayrı bir M1 aktarması gerekir).
// Yaklaşık/komşu eşleşmeler kaldırıldı; bilinmeyen duraklar artık dürüstçe
// "bağlantı noktası belirlenemedi" olarak işaretleniyor.
const KNOWN_STOP_NAME_INDEX = [
  ["kızılay", "stop_kizilay"], ["millî irade", "stop_kizilay"], ["15 temmuz", "stop_kizilay"],
  ["bakanlıklar", "stop_kizilay"], ["bakanlık", "stop_kizilay"],
  ["batıkent", "stop_batikent"],
  ["ankara gar", "stop_gar"],
  ["ulus", "stop_ulus"],
  ["aşti", "stop_asti"],
  ["beşevler", "stop_besevler"],
  ["dikimevi", "stop_dikimevi"],
  ["bahçelievler", "stop_bahcelievler"],
  ["yenimahalle", "stop_yenimahalle"],
  ["demetevler", "stop_demetevler"],
  ["ostim", "stop_ostim_m1"],
  ["çayyolu", "stop_cayyolu"],
  ["bilkent", "stop_bilkent"],
  ["eryaman", "stop_eryaman_m3"],
  ["sincan", "stop_sincan"],
  ["etimesgut", "stop_etimesgut"],
  ["elvankent", "stop_elvankent"],
  ["mamak", "stop_mamak_baskentray"],
  ["etlik", "stop_etlik"],
  ["gölbaşı", "stop_golbasi"],
  ["söğütözü", "stop_sogutozu"],
  ["beytepe", "stop_beytepe"],
  ["ümitköy", "stop_umitkoy"],
  ["saray", "stop_pursaklar_est"],
  ["macunköy", "stop_macunkoy"],
  ["ivedik", "stop_ivedik"],
  ["akköprü", "stop_akkopru"],
  ["sıhhiye", "stop_sihhiye"],
  ["dışkapı", "stop_disgapi"],
  ["necatibey", "stop_necatibey"],
  ["odtü", "stop_odtu"],
  ["millî kütüphane", "stop_milli_kutuphane"],
  ["milli kütüphane", "stop_milli_kutuphane"],
  ["tarım bakanlığı", "stop_tarim_bakanligi"],
  ["danıştay", "stop_tarim_bakanligi"],
  ["botanik", "stop_botanik"],
  ["törekent", "stop_torekent"],
  ["maltepe", "stop_maltepe"],
  ["kolej", "stop_kolej"],
  ["demirtepe", "stop_demirtepe"],
  ["anıtkabir", "stop_anadolu_anitkabir"],
  ["behiçbey", "stop_behicbey"],
  ["hipodrom", "stop_hipodrom"],
  ["cebeci", "stop_cebeci"],
  ["kayaş", "stop_kayas"],
];

// OSM'deki "name" etiketi çoğunlukla hat numarasını zaten içeriyor
// (ör. "279-2: Yükseltepe-...-Kızılay"); bu durumda ref'i tekrar başa eklemiyoruz.
function formatLineLabel(ref, name) {
  const safeName = name || "Hat";
  if (ref && safeName.startsWith(ref)) return safeName;
  return `${ref ? ref + ": " : ""}${safeName}`.trim();
}

function findKnownStopMatch(text) {
  if (!text) return null;
  const norm = text.toLocaleLowerCase("tr");
  const hit = KNOWN_STOP_NAME_INDEX.find(([kw]) => norm.includes(kw));
  return hit ? hit[1] : null;
}

// ---------------------------------------------------------------------------
// Yerel toplu taşıma ağı (transit_network.json — OSM/Overpass, EGO Genel
// Müdürlüğü, 28.08.2026): 350 hat (314 otobüs dahil) ve ~3.600 gerçek durak.
// Adres/semt arama artık ÖNCELİKLE bu önceden hazırlanmış, internet
// gerektirmeyen veri setini kullanıyor — canlı Overpass sorgusundan (tek
// nokta etrafında 700m, çoğu otobüs hattını kaçırabiliyordu) çok daha
// eksiksiz ve anında sonuç veriyor. discoverNearbyTransit() (Overpass) artık
// sadece bu yerel dosya hiç yüklenemezse yedek olarak kullanılıyor.
// ---------------------------------------------------------------------------
let localTransitNetwork = null;
let localTransitNetworkPromise = null;
let linesByLocalStopId = null;
let localStopsById = null;

// Dolmuş hatları EGO'nun kendi kaynağında yok (dolmuşlar EGO'ya değil özel/
// kooperatif işletmecilere ait, hiçbir resmi kayıt yayınlanmıyor). Bu yüzden
// ayrı bir dosyada, dolmusla.com'un herkese açık (robots.txt'i tamamen
// serbest) güzergah haritasından alınan gerçek koordinat dizileriyle
// tutuluyor — EGO verisiyle karışmasın, kaynağı ayrı belli olsun diye.
function loadDolmusLines() {
  return fetch("dolmus_lines.json?v=1")
    .then((res) => res.json())
    .catch(() => ({ stops: [], lines: [] }));
}

function loadLocalTransitNetwork() {
  if (localTransitNetworkPromise) return localTransitNetworkPromise;
  localTransitNetworkPromise = Promise.all([
    fetch("transit_network.json?v=4").then((res) => res.json()),
    loadDolmusLines(),
  ])
    .then(([egoData, dolmusData]) => {
      const data = {
        stops: egoData.stops.concat(dolmusData.stops),
        lines: egoData.lines.concat(dolmusData.lines),
      };
      localTransitNetwork = data;
      localStopsById = Object.fromEntries(data.stops.map((s) => [s.id, s]));
      linesByLocalStopId = {};
      data.lines.forEach((line) => {
        (line.stopIds || []).forEach((sid) => {
          (linesByLocalStopId[sid] = linesByLocalStopId[sid] || []).push(line);
        });
      });
      // Gerçek graf tabanlı rota motorunu (bkz. §2) bu veriyle kur. Kurulana
      // kadar estimateTransit() kaba bir geçici tahmin döner; kurulur kurulmaz
      // (henüz bir arama gösteriliyorsa) sonuçlar sessizce gerçek rotayla
      // güncellensin diye mevcut arama tekrar çalıştırılır.
      //
      // İKİ AYRI GRAF: ana rota (transitGraph) SADECE resmi hatlarla (EGO
      // otobüs/metro/Ankaray/Başkentray) hesaplanır — dolmuş, resmi olmayan/
      // gayriresmi bir hizmet olduğu için ana süreye/sıralamaya sessizce
      // karışmıyor. transitGraphWithDolmus, SADECE "dolmuşla alternatif var
      // mı" kontrolü için kullanılan ikinci, dolmuş dahil tam graf.
      transitGraph = buildTransitGraph(data, { excludeModes: new Set(["dolmus"]) });
      transitGraphWithDolmus = buildTransitGraph(data, {});
      if (typeof runSearch === "function") runSearch();
      return data;
    })
    .catch(() => null);
  return localTransitNetworkPromise;
}
loadLocalTransitNetwork(); // sayfa açılışında arka planda hemen başlat

// Hat geometrileri (gerçek güzergah şekilleri) ayrı, biraz daha büyük bir
// dosyada (transit_network_geometry.json, ~1.8MB, seyreltilmiş) tutuluyor ve
// stops/lines'tan SONRA, arka planda yükleniyor — sayfa açılışını yavaşlatmasın
// diye. Yüklendiğinde, o ana kadar çizilmiş olabilecek rotayı gerçek
// güzergah şekliyle yeniden çizmek için mevcut aramayı tekrarlar.
let localTransitGeometry = null;
let localTransitGeometryPromise = null;
function loadLocalTransitGeometry() {
  if (localTransitGeometryPromise) return localTransitGeometryPromise;
  localTransitGeometryPromise = fetch("transit_network_geometry.json?v=2")
    .then((res) => res.json())
    .then((data) => {
      localTransitGeometry = data;
      // Geometri yüklenmeden ÖNCE keşfedilip spliceDiscoveredLines ile
      // eklenmiş olabilecek hatlara (o an geometrisiz kaldılar) geometriyi
      // şimdi işle — runSearch() tek başına bunu yapmaz, çünkü aynı origin
      // ikinci kez enrichOriginInBackground'dan geçmez (enrichedOriginIds).
      Object.values(linesById).forEach((line) => {
        if (!line.geometry && line.localLineId && data[line.localLineId]) {
          line.geometry = data[line.localLineId];
        }
      });
      if (typeof runSearch === "function") runSearch();
      return data;
    })
    .catch(() => null);
  return localTransitGeometryPromise;
}
loadLocalTransitNetwork().then(() => loadLocalTransitGeometry());

/**
 * discoverNearbyTransit ile AYNI sözleşmeye sahip ({stops, lines, nearestStopName})
 * ama yerel veri setini kullanır — ağ isteği yok, anında sonuç. Bir hattın
 * "hubStopId"si artık sadece rota adının metnine bakılarak değil, hattın
 * TÜM gerçek durak sırası (stopIds) taranıp bilinen 54 duraktan birine denk
 * gelen gerçek bir durak var mı diye kontrol edilerek bulunuyor — bu yüzden
 * ismi bilinen bir hub'ı anmayan ama gerçekte oradan geçen hatlar da artık
 * doğru şekilde bağlanabiliyor.
 */
async function discoverNearbyTransitLocal(lat, lng) {
  const net = await loadLocalTransitNetwork();
  if (!net) return null;

  const nearby = net.stops
    .map((s) => ({ s, distanceM: Math.round(haversineKm({ lat, lng }, { lat: s.lat, lng: s.lng }) * 1000) }))
    .filter((x) => x.distanceM <= 700)
    .sort((a, b) => a.distanceM - b.distanceM);

  const seenLineIds = new Set();
  const lines = [];
  nearby.forEach(({ s }) => {
    (linesByLocalStopId[s.id] || []).forEach((line) => {
      if (seenLineIds.has(line.id)) return;
      seenLineIds.add(line.id);
      let hubStopId = null;
      for (const sid of line.stopIds || []) {
        const stop = localStopsById[sid];
        if (stop && stop.knownStopId) {
          hubStopId = stop.knownStopId;
          break;
        }
      }
      lines.push({ ref: line.hatNo || "", name: line.name, mode: line.mode, hubStopId, localLineId: line.id });
    });
  });
  lines.sort((a, b) => (a.hubStopId ? 0 : 1) - (b.hubStopId ? 0 : 1));

  return {
    stops: nearby.slice(0, 8).map(({ s, distanceM }) => ({ name: s.name, distanceM })),
    lines,
    nearestStopName: nearby[0] ? nearby[0].s.name : null,
  };
}

/** Önce yerel veri setini dener, hiç yüklenemediyse (ör. dosya erişilemedi) canlı Overpass'e düşer. */
async function discoverNearbyTransitBest(lat, lng) {
  const local = await discoverNearbyTransitLocal(lat, lng);
  if (local) return local;
  try {
    return await discoverNearbyTransit(lat, lng);
  } catch {
    return { stops: [], lines: [], nearestStopName: null };
  }
}

/**
 * Bir koordinatın ~700m çevresindeki gerçek toplu taşıma duraklarını ve
 * oradan geçen hat (route) ilişkilerini Overpass API'den canlı çeker.
 * Dönüş: { stops: [{name, distanceM}], lines: [{ref,name,mode,hubStopId}] }
 */
async function discoverNearbyTransit(lat, lng) {
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cache = readJsonCache(DISCOVERY_CACHE_KEY);
  if (cache[cacheKey]) return cache[cacheKey];

  const query = `[out:json][timeout:25];
(
  node(around:700,${lat},${lng})["public_transport"="platform"];
  node(around:700,${lat},${lng})["highway"="bus_stop"];
)->.st;
.st out body;
rel(bn.st)["route"];
out tags;`;

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: "data=" + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error("Overpass isteği başarısız");
  const data = await res.json();

  const stops = [];
  const lines = [];
  const seenLineNames = new Set();
  (data.elements || []).forEach((el) => {
    if (el.type === "node" && el.tags && el.tags.name) {
      stops.push({ name: el.tags.name, distanceM: Math.round(haversineKm({ lat, lng }, { lat: el.lat, lng: el.lon }) * 1000) });
    } else if (el.type === "relation") {
      const t = el.tags || {};
      if (!["bus", "subway", "light_rail", "train"].includes(t.route)) return;
      const label = formatLineLabel(t.ref, t.name);
      if (!t.name && !t.ref) return;
      if (seenLineNames.has(label)) return;
      seenLineNames.add(label);
      lines.push({
        ref: t.ref || "",
        name: t.name || t.ref || "Hat",
        mode: t.route === "bus" ? "otobus" : t.route === "train" ? "tren" : t.route === "light_rail" ? "ankaray" : "metro",
        hubStopId: findKnownStopMatch(`${t.name || ""} ${t.from || ""} ${t.to || ""} ${t.via || ""}`),
      });
    }
  });

  stops.sort((a, b) => a.distanceM - b.distanceM);
  lines.sort((a, b) => (a.hubStopId ? 0 : 1) - (b.hubStopId ? 0 : 1));

  const result = { stops: stops.slice(0, 8), lines, nearestStopName: stops[0] ? stops[0].name : null };
  cache[cacheKey] = result;
  writeJsonCache(DISCOVERY_CACHE_KEY, cache);
  return result;
}

/**
 * Bir discovery sonucundaki hub'a bağlanabilen hatları, verilen stopId'ye
 * canlı hat olarak ekler (linesById/linesByStopId'ye yeni satırlar ekler —
 * bunlar artık rota hesaplamasını değil, yalnızca "bu bölgeden geçen gerçek
 * hatlar" bilgi panelini besliyor; rota artık transitGraph üzerinden
 * hesaplanıyor, bkz. §2). Zaten eklenmiş hatları tekrar eklemez.
 */
function spliceDiscoveredLines(stopId, discovery) {
  linesByStopId[stopId] = linesByStopId[stopId] || [];
  const existingNames = new Set(linesByStopId[stopId].map((lid) => linesById[lid] && linesById[lid].name));
  let addedCount = 0;

  discovery.lines.forEach((l, idx) => {
    if (!l.hubStopId) return;
    const label = formatLineLabel(l.ref, l.name);
    if (existingNames.has(label)) return;

    const lineId = `LIVE_${stopId}_${idx}`;
    // localLineId varsa bu hat, yerel veri setinden (transit_network.json)
    // geldi — geometrisi zaten yüklendiyse (transit_network_geometry.json)
    // gerçek güzergah şekli haritada çizilebilir; henüz yüklenmediyse
    // drawRoute eskisi gibi düz/kesikli çizgiye döner, geometri gelince
    // (loadLocalTransitGeometry -> runSearch) otomatik yeniden çizilir.
    const geometry = l.localLineId && localTransitGeometry ? localTransitGeometry[l.localLineId] : null;
    linesById[lineId] = {
      id: lineId,
      name: label,
      mode: l.mode,
      verified: true,
      source: l.localLineId ? "OSM/Overpass, EGO Genel Müdürlüğü — 28.08.2026" : "OSM/Overpass canlı sorgu",
      stopIds: [stopId, l.hubStopId],
      geometry: geometry || undefined,
      localLineId: l.localLineId || undefined, // geometri sonradan yüklenirse doldurulabilsin diye saklanır
    };
    linesByStopId[stopId].push(lineId);
    (linesByStopId[l.hubStopId] = linesByStopId[l.hubStopId] || []).push(lineId);
    addedCount += 1;
  });

  return addedCount;
}

function registerCustomOrigin(label, lat, lng) {
  customOriginCounter += 1;
  const stopId = `stop_custom_${customOriginCounter}`;
  const originId = `custom_${customOriginCounter}`;

  stopsById[stopId] = { id: stopId, name: label, mode: "custom" };
  linesByStopId[stopId] = [];

  const origin = {
    id: originId,
    kind: "custom",
    name: label,
    districtName: label,
    coords: { lat, lng },
    stopId,
  };
  customOrigins[originId] = origin;
  return origin;
}

// ---------------------------------------------------------------------------
// 4) VERİ ERİŞİM YARDIMCILARI
// ---------------------------------------------------------------------------

function allOrigins() {
  // İlçeler + mahalleler, tek düz liste olarak (mahalle kendi stopId'sini
  // taşımıyorsa ilçenin access stop'unu miras alır)
  const items = [];
  ANKARA_DATA.districts.forEach((d) => {
    items.push({
      id: d.id,
      kind: "district",
      name: d.name,
      districtName: d.name,
      coords: { lat: d.lat, lng: d.lng },
      stopId: d.accessStopId,
    });
    (d.neighborhoods || []).forEach((n) => {
      items.push({
        id: n.id,
        kind: "neighborhood",
        name: `${n.name} (${d.name})`,
        districtName: d.name,
        coords: { lat: n.lat, lng: n.lng },
        stopId: n.accessStopId || d.accessStopId,
      });
    });
  });
  return items;
}

function originById(id) {
  if (customOrigins[id]) return customOrigins[id];
  return allOrigins().find((o) => o.id === id);
}

function projectById(id) {
  const p = ANKARA_DATA.projects.find((x) => x.id === id);
  if (!p) return null;
  return { id: p.id, kind: "project", name: p.name, coords: { lat: p.lat, lng: p.lng }, stopId: p.accessStopId, sector: p.sector, address: p.address };
}

// ---------------------------------------------------------------------------
// 5) ANA EŞLEŞTİRME ALGORİTMASI
// ---------------------------------------------------------------------------

/**
 * Aday -> Proje: bir başlangıç (ilçe/mahalle) için tüm projeleri süreye göre sıralar.
 * thresholdMin verilirse (30/45/60) sadece o sürenin altındakiler döner.
 */
function rankProjectsForOrigin(originId, thresholdMin = null) {
  const origin = originById(originId);
  if (!origin) return [];

  const rows = activeProjects().map((p) => {
    const dest = projectById(p.id);
    const estimate = getTransitEstimate(originId, origin, p.id, dest);
    return { project: p, origin, ...estimate };
  });

  // Acil projeler, mesafe/süre ne olursa olsun listenin en üstünde çıkar
  // (haftalık acil kadroların önce görülüp ilerletilmesi için); acil olanlar
  // kendi aralarında yine süreye göre sıralanır.
  rows.sort((a, b) => {
    const aUrgent = URGENT_PROJECT_IDS.has(a.project.id) ? 1 : 0;
    const bUrgent = URGENT_PROJECT_IDS.has(b.project.id) ? 1 : 0;
    if (aUrgent !== bUrgent) return bUrgent - aUrgent;
    return a.durationMin - b.durationMin;
  });
  return thresholdMin ? rows.filter((r) => r.durationMin <= thresholdMin) : rows;
}

/**
 * Proje -> Aday Havuzu: bir proje için tüm ilçeleri (mahalle değil, ilçe
 * seviyesinde) süreye göre sıralar. thresholdMin ile filtrelenebilir.
 */
function rankDistrictsForProject(projectId, thresholdMin = null) {
  const dest = projectById(projectId);
  if (!dest) return [];

  const rows = ANKARA_DATA.districts.map((d) => {
    const origin = originById(d.id);
    // fixedSide="dest": proje bu döngü boyunca sabit, ilçe her satırda
    // değişiyor — Dijkstra'nın proje tarafından koşup önbelleğe isabet
    // etmesi için (aksi halde her ilçe için sıfırdan tam graf taraması
    // gerekirdi, bkz. findRealRoute'un başındaki not).
    const estimate = getTransitEstimate(d.id, origin, projectId, dest, "dest");
    return { district: d, dest, ...estimate };
  });

  rows.sort((a, b) => a.durationMin - b.durationMin);
  return thresholdMin ? rows.filter((r) => r.durationMin <= thresholdMin) : rows;
}

function durationBucket(min) {
  if (min <= 30) return { key: "good", label: "≤30 dk", color: "#16a34a" };
  if (min <= 45) return { key: "ok", label: "31-45 dk", color: "#d97706" };
  if (min <= 60) return { key: "warn", label: "46-60 dk", color: "#ea580c" };
  return { key: "bad", label: "60+ dk", color: "#dc2626" };
}

const MODE_ICON = { metro: "🚇", ankaray: "🚊", tren: "🚆", otobus: "🚌", dolmus: "🚐", hub: "📍" };
// Haritada bacak başına renk: gerçek dünyadaki Ankara toplu taşıma renklerine
// yakın bir palet (M4 turuncu/sarı, Ankaray yeşil, Başkentray mor, otobüs teal).
const MODE_LINE_COLOR = { metro: "#dc2626", ankaray: "#16a34a", tren: "#7c3aed", otobus: "#0d9488", dolmus: "#f59e0b", hub: "#64748b" };

/**
 * estimate.steps dizisinden, "hangi hatta binip nerede inecek" şeklinde
 * numaralı bir adım adım rota listesi (HTML) üretir. Doğrulanmamış (mock)
 * hatlar için ayrıca bir "TAHMİNİ" rozeti gösterilir.
 */
function renderRouteSteps(steps) {
  return steps
    .map((s, i) => {
      const icon = MODE_ICON[s.mode] || "➡️";
      const badge = s.verified === false ? `<span class="route-step-badge">TAHMİNİ</span>` : "";
      if (s.mode === "hub") {
        return `
          <div class="route-step">
            <span class="route-step-icon">${icon}</span>
            <div class="route-step-body">
              <div class="route-step-line">${s.line}</div>
              <div class="route-step-stops">${s.from} / ${s.to} — yürüme mesafesinde</div>
            </div>
          </div>`;
      }
      if (s.approx) {
        return `
          <div class="route-step">
            <span class="route-step-num">${i + 1}</span>
            <span class="route-step-icon">${icon}</span>
            <div class="route-step-body">
              <div class="route-step-line">${s.line}${badge}</div>
              <div class="route-step-stops"><b>${s.from}</b> durağından binip <b>${s.to}</b> bölgesine yakın bir noktada inin (kesin durak belli değil, yaklaşık)</div>
            </div>
          </div>`;
      }
      return `
        <div class="route-step">
          <span class="route-step-num">${i + 1}</span>
          <span class="route-step-icon">${icon}</span>
          <div class="route-step-body">
            <div class="route-step-line">${s.line}${badge}</div>
            <div class="route-step-stops"><b>${s.from}</b>'den binin → <b>${s.to}</b>'de inin</div>
          </div>
        </div>`;
    })
    .join("");
}

// ---------------------------------------------------------------------------
// 6) UI KATMANI
// ---------------------------------------------------------------------------

const map = L.map("map", { zoomControl: true }).setView([39.935, 32.82], 10.4);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap katkıda bulunanlar",
  maxZoom: 19,
  subdomains: "abc",
}).addTo(map);
L.control.scale({ metric: true, imperial: false, position: "bottomright" }).addTo(map);

const projectIcon = L.divIcon({
  className: "",
  html: `<div class="pin pin-project"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});
const urgentProjectIcon = L.divIcon({
  className: "",
  html: `<div class="pin pin-project pin-project-urgent"></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});
function districtIcon(color) {
  return L.divIcon({
    className: "",
    html: `<div class="pin pin-district" style="background:${color}"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

let markersLayer = L.layerGroup().addTo(map);
let routesLayer = L.layerGroup().addTo(map);

// Proje pinleri (53 adet) çok kalabalık olduğundan (ör. Bilkent'te 15+ proje
// üst üste biniyor) kümeleme kullanıyoruz: yakınlaşınca otomatik ayrışırlar.
const projectCluster = L.markerClusterGroup({
  maxClusterRadius: 45,
  spiderfyOnMaxZoom: true,
  showCoverageOnHover: false,
  iconCreateFunction: (cluster) =>
    L.divIcon({
      html: `<div>${cluster.getChildCount()}</div>`,
      className: "marker-cluster-custom",
      iconSize: [38, 38],
    }),
});

const projectMarkersById = {};

function buildProjectMarker(p) {
  const isUrgent = URGENT_PROJECT_IDS.has(p.id);
  const m = L.marker([p.lat, p.lng], { icon: isUrgent ? urgentProjectIcon : projectIcon });
  m.bindTooltip(`${isUrgent ? "🔴 ACİL — " : ""}${p.name} — ${p.address}`, { direction: "top" });
  projectMarkersById[p.id] = m;
  if (!INACTIVE_PROJECT_IDS.has(p.id)) {
    projectCluster.addLayer(m);
  }
  return m;
}
ANKARA_DATA.projects.forEach(buildProjectMarker);
map.addLayer(projectCluster);

// Proje listesi kökten değiştiğinde (Sheet'ten canlı veri geldiğinde ya da
// yeni bir proje eklendiğinde) tüm pinleri sıfırdan kurar.
function rebuildAllProjectMarkers() {
  projectCluster.clearLayers();
  Object.keys(projectMarkersById).forEach((id) => delete projectMarkersById[id]);
  ANKARA_DATA.projects.forEach(buildProjectMarker);
}

// Acil/aktiflik seçimi değiştiğinde (modal'dan kaydedince) harita pinlerini/
// tooltip'lerini ve kümedeki üyeliğini yeniden hesaplar — sayfayı
// yenilemeye gerek kalmaz. Kapalı projelerin pini haritada hiç görünmez.
function refreshProjectMarkers() {
  ANKARA_DATA.projects.forEach((p) => {
    const marker = projectMarkersById[p.id];
    if (!marker) return;
    const isActive = !INACTIVE_PROJECT_IDS.has(p.id);
    const isUrgent = URGENT_PROJECT_IDS.has(p.id);
    marker.setIcon(isUrgent ? urgentProjectIcon : projectIcon);
    marker.setTooltipContent(`${isUrgent ? "🔴 ACİL — " : ""}${p.name} — ${p.address}`);
    const inCluster = projectCluster.hasLayer(marker);
    if (isActive && !inCluster) {
      projectCluster.addLayer(marker);
    } else if (!isActive && inCluster) {
      projectCluster.removeLayer(marker);
    }
  });
}

// ---- DOM referansları ----
const modeButtons = document.querySelectorAll(".mode-btn");
const originPanel = document.getElementById("panel-origin");
const projectPanel = document.getElementById("panel-project");
const originSelect = document.getElementById("originSelect");
const projectSelect = document.getElementById("projectSelect");
const thresholdButtons = document.querySelectorAll(".threshold-btn");
const resultsList = document.getElementById("resultsList");
const resultsHeading = document.getElementById("resultsHeading");
const emptyState = document.getElementById("emptyState");
const routeDetail = document.getElementById("routeDetail");
const routeDetailTitle = document.getElementById("routeDetailTitle");
const routeDetailSteps = document.getElementById("routeDetailSteps");
const routeDetailWarning = document.getElementById("routeDetailWarning");
const routeDolmusAlt = document.getElementById("routeDolmusAlt");
const addressInput = document.getElementById("addressInput");
const addressSearchBtn = document.getElementById("addressSearchBtn");
const addressStatus = document.getElementById("addressStatus");
const nearbyLinesPanel = document.getElementById("nearbyLinesPanel");
const nearbyLinesList = document.getElementById("nearbyLinesList");
const nearbyLinesToggle = document.getElementById("nearbyLinesToggle");
const nearbyLinesSummary = document.getElementById("nearbyLinesSummary");
const nearbyLinesChevron = document.getElementById("nearbyLinesChevron");

nearbyLinesToggle.addEventListener("click", () => {
  const expanded = !nearbyLinesList.classList.contains("hidden");
  nearbyLinesList.classList.toggle("hidden", expanded);
  nearbyLinesChevron.textContent = expanded ? "▾ göster" : "▴ gizle";
});

let currentMode = "origin-to-project"; // veya "project-to-origin"
let currentThreshold = null; // null = tümü
const enrichedOriginIds = new Set(); // canlı Overpass sorgusu zaten yapılmış origin id'leri

// Select doldur
ANKARA_DATA.districts.forEach((d) => {
  const optGroup = document.createElement("optgroup");
  optGroup.label = d.name;
  const districtOpt = document.createElement("option");
  districtOpt.value = d.id;
  districtOpt.textContent = `${d.name} (ilçe merkezi)`;
  optGroup.appendChild(districtOpt);
  (d.neighborhoods || []).forEach((n) => {
    const opt = document.createElement("option");
    opt.value = n.id;
    opt.textContent = n.name;
    optGroup.appendChild(opt);
  });
  originSelect.appendChild(optGroup);
});

// Kapalı (pasif) projeler bu kutuda hiç görünmez; aktiflik "Proje Aç/Kapa"
// penceresinden değiştirildiğinde bu fonksiyon yeniden çağrılarak kutu
// güncel tutulur — seçili proje pasife düşerse seçim ve sonuçlar temizlenir.
function rebuildProjectSelect() {
  const previouslySelected = projectSelect.value;
  projectSelect.innerHTML = '<option value="">Seçiniz…</option>';

  const projectsBySector = {};
  activeProjects().forEach((p) => {
    (projectsBySector[p.sector] = projectsBySector[p.sector] || []).push(p);
  });
  Object.keys(projectsBySector)
    .sort()
    .forEach((sector) => {
      const optGroup = document.createElement("optgroup");
      optGroup.label = sector;
      projectsBySector[sector]
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "tr"))
        .forEach((p) => {
          const opt = document.createElement("option");
          opt.value = p.id;
          opt.textContent = `${p.name} — ${p.address}`;
          optGroup.appendChild(opt);
        });
      projectSelect.appendChild(optGroup);
    });

  if (previouslySelected && !INACTIVE_PROJECT_IDS.has(previouslySelected)) {
    projectSelect.value = previouslySelected;
  }
}
rebuildProjectSelect();

// ---- Mod değişimi ----
modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    currentMode = btn.dataset.mode;
    modeButtons.forEach((b) => b.classList.toggle("mode-btn-active", b === btn));
    originPanel.classList.toggle("hidden", currentMode !== "origin-to-project");
    // Hem "Proje -> Aday Havuzu" hem "Proje -> Gerçek Adaylar" aynı proje
    // seçim kutusunu (panel-project) kullanır.
    projectPanel.classList.toggle("hidden", currentMode === "origin-to-project");
    clearResults();
    // "Proje -> Gerçek Adaylar" harita/sidebar yerine tam ekran ayrı bir
    // görünümde açılır (candidates.js) — 209+ aday cramped bir listeye
    // sığmıyor, aday detayı da ayrı bir panelde gösterilmesi gerekiyordu.
    if (typeof toggleCandidateFullscreen === "function") {
      toggleCandidateFullscreen(currentMode === "project-to-candidates");
    }
  });
});

thresholdButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    currentThreshold = btn.dataset.threshold === "all" ? null : Number(btn.dataset.threshold);
    thresholdButtons.forEach((b) => b.classList.toggle("threshold-btn-active", b === btn));
    runSearch();
  });
});

originSelect.addEventListener("change", runSearch);
projectSelect.addEventListener("change", runSearch);

// ---- Serbest metin adres/konum arama (Nominatim + Overpass canlı keşif) ----
addressSearchBtn.addEventListener("click", handleAddressSearch);
addressInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleAddressSearch();
});

// NOT: canlı otobüs/durak taraması (discoverNearbyTransit -> Overpass) birkaç
// saniye sürebiliyor (Overpass yoğunken 8-10sn+). Önceden bu taramanın
// bitmesi TÜM aramayı bloke ediyordu — kullanıcı sonuçları görmeden önce
// uzun süre bekliyordu. Şimdi ilçe/mahalle akışındaki (enrichOriginInBackground)
// aynı desen kullanılıyor: konum bulunur bulunmaz (en yakın gerçek durağın
// bağlantıları ödünç alınarak) sonuçlar hemen gösterilir, canlı tarama arka
// planda devam edip bittiğinde sonuçlar sessizce daha da iyileştirilir.
async function handleAddressSearch() {
  const query = addressInput.value.trim();
  if (!query) return;

  addressSearchBtn.disabled = true;
  addressStatus.textContent = "Konum aranıyor…";
  try {
    const geo = await geocodeAddress(query);
    if (!geo) {
      addressStatus.textContent = "Konum bulunamadı. Farklı bir yazımla (ör. \"Etlik Şehir Hastanesi\") deneyin.";
      return;
    }

    const origin = registerCustomOrigin(geo.label, geo.lat, geo.lng);
    const nearest = nearestTransitStop(geo.lat, geo.lng);
    if (nearest) {
      // Canlı tarama bitene kadar en yakın gerçek durağın bağlantılarını
      // geçici olarak kullan — böylece ilk gösterilen rotalar da anlamlı olur.
      linesByStopId[origin.stopId] = [...(linesByStopId[nearest.id] || [])];
    }

    const opt = document.createElement("option");
    opt.value = origin.id;
    opt.textContent = `📍 ${origin.name}`;
    originSelect.insertBefore(opt, originSelect.firstChild.nextSibling);
    originSelect.value = origin.id;

    addressStatus.textContent = "Yakındaki gerçek duraklar/hatlar taranıyor…";
    runSearch();

    const discovery = await discoverNearbyTransitBest(geo.lat, geo.lng);
    const addedCount = spliceDiscoveredLines(origin.stopId, discovery);
    enrichedOriginIds.add(origin.id);
    currentDiscoveryByOriginId[origin.id] = discovery;
    addressStatus.textContent = `${discovery.lines.length} gerçek hat bulundu (${addedCount} tanesi rotaya bağlanabildi).`;
    if (originSelect.value === origin.id) {
      renderNearbyLinesPanel(origin.id);
      if (addedCount > 0) runSearch();
    }
  } catch (err) {
    addressStatus.textContent = "Bağlantı hatası — internet bağlantınızı kontrol edip tekrar deneyin.";
  } finally {
    addressSearchBtn.disabled = false;
  }
}

const currentDiscoveryByOriginId = {};

// Bir origin/project id'sinin şu an ekranda aktif seçili olan taraf olup
// olmadığını (yani panel/sonuçları yeniden çizmenin anlamlı olup olmadığını)
// her iki mod için de doğru şekilde belirler.
function isActiveSelection(id) {
  if (currentMode === "origin-to-project") return originSelect.value === id;
  if (currentMode === "project-to-origin" || currentMode === "project-to-candidates") return projectSelect.value === id;
  return false;
}

/**
 * Hazır ilçe/mahalle/proje seçimleri için de aynı canlı keşfi (arka planda,
 * sonucu beklemeden) çalıştırır: statik veri anında sonuç verir, birkaç
 * saniye sonra bulunan ek gerçek hatlar sessizce eklenip sonuçlar tazelenir.
 * "Aday → Proje" modunda seçilen ilçe/adres için, "Proje → Aday Havuzu"
 * modunda ise seçilen projenin kendi konumu için çağrılır — aksi halde
 * yalnızca bir yönde canlı otobüs/metro keşfi çalışıp diğer yönde (özellikle
 * otobüs durağı olan projelerde) metro↔otobüs aktarmaları eksik kalıyordu.
 */
async function enrichOriginInBackground(origin) {
  if (origin.kind === "custom" || enrichedOriginIds.has(origin.id)) return;
  enrichedOriginIds.add(origin.id);
  try {
    const discovery = await discoverNearbyTransitBest(origin.coords.lat, origin.coords.lng);
    currentDiscoveryByOriginId[origin.id] = discovery;
    const addedCount = spliceDiscoveredLines(origin.stopId, discovery);
    if (addedCount > 0) {
      invalidateCacheForOrigin(origin.id);
      if (isActiveSelection(origin.id)) {
        renderNearbyLinesPanel(origin.id);
        runSearch();
      }
    } else if (isActiveSelection(origin.id)) {
      renderNearbyLinesPanel(origin.id);
    }
  } catch {
    // canlı sorgu başarısız oldu: sonsuz "taranıyor" durumunda kalmasın diye
    // boş sonuç olarak işaretle, statik veriyle sessizce devam et.
    currentDiscoveryByOriginId[origin.id] = { stops: [], lines: [], nearestStopName: null };
    if (isActiveSelection(origin.id)) {
      renderNearbyLinesPanel(origin.id);
    }
  }
}

// Her yeni sonuç render'ında panel varsayılan olarak daraltılmış (özet
// satır) başlar; kullanıcı isterse tıklayıp genişletir. Sonuç listesinin
// (En Uygun Projeler) daha az kaydırmayla görünmesi için bilerek küçük tutulur.
function renderNearbyLinesPanel(originId) {
  const discovery = currentDiscoveryByOriginId[originId];
  nearbyLinesList.classList.add("hidden");
  nearbyLinesChevron.textContent = "▾ göster";

  if (!discovery) {
    if (enrichedOriginIds.has(originId)) {
      nearbyLinesSummary.textContent = "Yakındaki gerçek hatlar taranıyor…";
      nearbyLinesList.innerHTML = "";
      nearbyLinesPanel.classList.remove("hidden");
    } else {
      nearbyLinesPanel.classList.add("hidden");
    }
    return;
  }

  if (!discovery.lines.length) {
    nearbyLinesPanel.classList.add("hidden");
    return;
  }

  const usableCount = discovery.lines.filter((l) => l.hubStopId).length;
  nearbyLinesSummary.textContent = `Bu Bölgeden Geçen Gerçek Hatlar (${discovery.lines.length}, ${usableCount} kullanılabilir)`;

  nearbyLinesList.innerHTML = discovery.lines
    .map((l) => {
      const label = formatLineLabel(l.ref, l.name);
      const used = l.hubStopId
        ? `<span class="nearby-line-used">rotada kullanılabilir</span>`
        : `<span class="nearby-line-unused">bağlantı noktası belirlenemedi</span>`;
      return `<div class="nearby-line-row"><span>${MODE_ICON[l.mode] || "🚌"} ${label}</span>${used}</div>`;
    })
    .join("");
  nearbyLinesPanel.classList.remove("hidden");
}

function clearResults() {
  resultsList.innerHTML = "";
  routesLayer.clearLayers();
  routeDetail.classList.add("hidden");
  emptyState.classList.remove("hidden");
  resultsHeading.textContent = "";
  nearbyLinesPanel.classList.add("hidden");
  resetDistrictMarkers();
}

const districtMarkersById = {};
function resetDistrictMarkers() {
  Object.values(districtMarkersById).forEach((m) => markersLayer.removeLayer(m));
  for (const k in districtMarkersById) delete districtMarkersById[k];
}

function runSearch() {
  if (currentMode === "origin-to-project") {
    if (!originSelect.value) return clearResults();
    renderOriginToProject(originSelect.value);
  } else if (currentMode === "project-to-candidates") {
    // candidates.js içinde tanımlanır — Excel'den yüklenen gerçek adayları
    // seçilen projeye göre sıralayan ayrı bir mod.
    if (!projectSelect.value) return clearResults();
    renderProjectToCandidates(projectSelect.value);
  } else {
    if (!projectSelect.value) return clearResults();
    renderProjectToOrigin(projectSelect.value);
  }
}

function renderOriginToProject(originId) {
  const rows = rankProjectsForOrigin(originId, currentThreshold);
  routesLayer.clearLayers();
  resetDistrictMarkers();
  emptyState.classList.toggle("hidden", rows.length > 0);

  const origin = originById(originId);
  resultsHeading.textContent = `${origin.name} → En Uygun Projeler (${rows.length})`;
  // Önce genel bir görünüme geç — aşağıdaki forEach içinde idx===0 için
  // çağrılan drawRoute() kendi fitBounds()'unu bunun ÜZERİNE uygulayıp asıl
  // (en üstteki) rotayı sıkı şekilde kadrajlayacak. Bu çağrı SONRADAN
  // yapılırsa (eskiden öyleydi), drawRoute'un fitBounds'unu geçersiz kılıp
  // çizilen rota çizgisini geniş/genel görünüm içinde fark edilmez kadar
  // küçük bırakıyordu.
  map.setView([origin.coords.lat, origin.coords.lng], 11, { animate: true, duration: 0.8 });

  enrichOriginInBackground(origin);
  renderNearbyLinesPanel(originId);

  resultsList.innerHTML = "";
  rows.forEach((row, idx) => {
    const bucket = durationBucket(row.durationMin);
    resultsList.appendChild(
      buildResultCard({
        title: row.project.name,
        subtitle: `${row.project.sector} · ${row.project.address}`,
        durationMin: row.durationMin,
        transfers: row.transfers,
        bucket,
        terms: {
          salary: row.project.salary,
          meal: row.project.meal,
          transport: row.project.transport,
          shift: row.project.shift,
          gender: row.project.gender,
        },
        urgent: URGENT_PROJECT_IDS.has(row.project.id),
        referral: row.project.referral,
        onClick: () => {
          drawRoute(origin.coords, row, bucket);
          showRouteResult(row);
        },
        highlight: idx === 0,
      })
    );
    if (idx === 0) {
      drawRoute(origin.coords, row, bucket);
      showRouteResult(row);
    }
  });

  if (rows.length === 0) {
    routeDetail.classList.add("hidden");
  }
}

function renderProjectToOrigin(projectId) {
  const rows = rankDistrictsForProject(projectId, currentThreshold);
  routesLayer.clearLayers();
  resetDistrictMarkers();
  emptyState.classList.toggle("hidden", rows.length > 0);

  const project = projectById(projectId);
  resultsHeading.textContent = `${project.name} → En Uygun İlçeler (${rows.length})`;
  // bkz. renderOriginToProject'teki not — bu, drawRoute'un fitBounds'undan
  // ÖNCE gelmeli, aksi halde en üstteki (idx===0) rota haritada görünmez
  // kadar küçük kalıyor (kullanıcının bildirdiği "hatları göstermiyor" sorunu).
  map.setView([project.coords.lat, project.coords.lng], 11, { animate: true, duration: 0.8 });

  enrichOriginInBackground(project);
  renderNearbyLinesPanel(projectId);

  resultsList.innerHTML = "";
  rows.forEach((row, idx) => {
    const bucket = durationBucket(row.durationMin);
    const districtCoords = { lat: row.district.lat, lng: row.district.lng };

    const marker = L.marker([districtCoords.lat, districtCoords.lng], {
      icon: districtIcon(bucket.color),
    }).addTo(markersLayer);
    marker.bindTooltip(`${row.district.name} · ~${row.durationMin} dk`, { direction: "top" });
    districtMarkersById[row.district.id] = marker;

    resultsList.appendChild(
      buildResultCard({
        title: row.district.name,
        subtitle: `İlçe merkezi`,
        durationMin: row.durationMin,
        transfers: row.transfers,
        bucket,
        onClick: () => {
          drawRoute(districtCoords, { ...row, project: project }, bucket, project.coords);
          showRouteResult(row);
        },
        highlight: idx === 0,
      })
    );
    if (idx === 0) {
      drawRoute(districtCoords, { ...row, project: project }, bucket, project.coords);
      showRouteResult(row);
    }
  });

  if (rows.length === 0) {
    routeDetail.classList.add("hidden");
  }
}

function buildResultCard({ title, subtitle, durationMin, transfers, bucket, onClick, highlight, terms, urgent, referral }) {
  const card = document.createElement("button");
  card.className = `result-card ${highlight ? "result-card-active" : ""} ${urgent ? "result-card-urgent" : ""}`;
  const referralRow = referral ? `<div class="result-card-referral">📌 ${referral}</div>` : "";
  const servisNote = terms && terms.transport === "Servis"
    ? `<div class="result-card-servis-note">🚐 Bu projede firma servisi var — yukarıdaki süre/aktarma toplu taşıma senaryosuna göredir, gerçek servis güzergahı sisteme kayıtlı değil.</div>`
    : "";
  const genderSpan = terms && terms.gender ? `<span>👤 ${terms.gender}</span>` : "";
  const termsRow = terms
    ? `<div class="result-card-terms">
        <span>💰 ${terms.salary}</span>
        <span>🍽️ ${terms.meal}</span>
        <span>🚌 ${terms.transport}</span>
        <span>⏰ ${terms.shift}</span>
        ${genderSpan}
      </div>`
    : "";
  const urgentBadge = urgent ? `<span class="result-card-urgent-badge">ACİL</span>` : "";
  card.innerHTML = `
    ${urgentBadge}
    <div class="flex items-center justify-between gap-2">
      <div class="min-w-0">
        <div class="font-semibold text-slate-800 truncate">${title}</div>
        <div class="text-xs text-slate-500 truncate">${subtitle}</div>
      </div>
      <div class="flex flex-col items-end shrink-0">
        <span class="duration-badge" style="background:${bucket.color}1a; color:${bucket.color}">~${durationMin} dk</span>
        <span class="text-[11px] text-slate-400 mt-1">${transfers} aktarma</span>
      </div>
    </div>
    ${referralRow}
    ${termsRow}
    ${servisNote}
  `;
  card.addEventListener("click", () => {
    document.querySelectorAll(".result-card").forEach((c) => c.classList.remove("result-card-active"));
    card.classList.add("result-card-active");
    onClick();
  });
  return card;
}

function sqDist(lat1, lng1, lat2, lng2) {
  const dLat = lat1 - lat2;
  const dLng = lng1 - lng2;
  return dLat * dLat + dLng * dLng;
}

function nearestPointIndex(geometry, point) {
  let best = 0;
  let bestDist = Infinity;
  geometry.forEach(([lat, lng], i) => {
    const d = sqDist(lat, lng, point.lat, point.lng);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

/** İki hat geometrisinin birbirine en çok yaklaştığı noktayı bulur (gerçek aktarma noktasının yaklaşık konumu). */
function nearestPairBetweenGeometries(geomA, geomB) {
  let best = null;
  let bestDist = Infinity;
  geomA.forEach(([latA, lngA]) => {
    geomB.forEach(([latB, lngB]) => {
      const d = sqDist(latA, lngA, latB, lngB);
      if (d < bestDist) {
        bestDist = d;
        best = { lat: latA, lng: lngA };
      }
    });
  });
  return best;
}

function interpolateCoords(a, b, t) {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

// Gerçek hat geometrisinin bir ucu, o bacağın gerçek başlangıç/bitiş noktasından
// (aktarma durağı ya da projenin/adayın kendi konumu) bu kadar uzaksa, aradaki
// boşluk ayrı ince kesikli bir "son adım" çizgisiyle tamamlanır — aksi halde ya
// çizgi havada asılı kalıyor ya da (eski davranışta) hiçbir yolu takip etmeyen
// dümdüz bir çizgi gerçek rota gibi katı çizilip yanıltıyordu.
const REAL_GEOMETRY_CONNECT_LIMIT_KM = 0.15;

/**
 * Rotayı, mümkün olduğunca hatların OSM'den alınan gerçek geometrisini
 * (yol/ray şeklini) takip ederek çizer. Her bacak kendi rengiyle/gerçek
 * güzergahıyla ayrı bir segment olarak çizilir; gerçek geometrisi olmayan
 * (canlı keşfedilmiş ya da TAHMİNİ) hatlar için düz kesikli çizgiye döner.
 */
function drawRoute(originCoords, row, bucket, destCoordsOverride) {
  routesLayer.clearLayers();
  const destCoords = destCoordsOverride || { lat: row.project.lat, lng: row.project.lng };
  const steps = row.steps || [];
  if (steps.length === 0) return;

  const lineOfStep = (s) => (s.lineId ? linesById[s.lineId] : null);
  // Gerçek graf motorunun ürettiği adımlardaki lineId'ler linesById'de değil
  // (transit_network.json'ın kendi id'leri, ör. "ego_line_101") — bu yüzden
  // geometri için ayrıca transitGraph + localTransitGeometry'e de bakılır.
  const geometryOfStep = (s) => {
    const line = lineOfStep(s);
    if (line && line.geometry && line.geometry.length > 1) return line.geometry;
    if (s.lineId && transitGraph && transitGraph.linesByLocalId.has(s.lineId)) {
      const graphLine = transitGraph.linesByLocalId.get(s.lineId);
      // Dolmuş hatları gibi kendi geometrisini doğrudan taşıyan graf hatları
      // (ayrı bir localTransitGeometry dosyasına ihtiyaç duymadan).
      if (graphLine.geometry && graphLine.geometry.length > 1) return graphLine.geometry;
      if (localTransitGeometry) {
        const geo = localTransitGeometry[s.lineId];
        if (geo && geo.length > 1) return geo;
      }
    }
    return null;
  };

  // Her bacağın başlangıç/bitiş "çapa" koordinatını belirle: ardışık iki
  // hattın geometrisi varsa, gerçek aktarma noktası bu iki hattın birbirine
  // en yakın olduğu nokta olarak hesaplanır.
  const anchors = [originCoords];
  for (let i = 0; i < steps.length - 1; i++) {
    const gA = geometryOfStep(steps[i]);
    const gB = geometryOfStep(steps[i + 1]);
    if (gA && gB) {
      anchors.push(nearestPairBetweenGeometries(gA, gB));
    } else {
      anchors.push(interpolateCoords(originCoords, destCoords, (i + 1) / steps.length));
    }
  }
  anchors.push(destCoords);

  const allPoints = [];
  steps.forEach((step, i) => {
    const startA = anchors[i];
    const endA = anchors[i + 1];
    const geometry = geometryOfStep(step);
    const modeColor = MODE_LINE_COLOR[step.mode] || bucket.color;
    const tooltipText = `${MODE_ICON[step.mode] || ""} ${step.line}`;

    const drawSegment = (latlngs, dashed) => {
      const poly = L.polyline(latlngs, {
        color: modeColor,
        weight: dashed ? 3 : 5,
        opacity: dashed ? 0.6 : 0.9,
        dashArray: dashed ? "2 8" : null,
        lineJoin: "round",
        lineCap: "round",
      }).addTo(routesLayer);
      poly.bindTooltip(tooltipText, { sticky: true });
      allPoints.push(...latlngs);
    };

    if (geometry) {
      const i1 = nearestPointIndex(geometry, startA);
      const i2 = nearestPointIndex(geometry, endA);
      const lo = Math.min(i1, i2);
      const hi = Math.max(i1, i2);
      const seg = geometry.slice(lo, hi + 1).map(([lat, lng]) => [lat, lng]);

      if (seg.length > 1) {
        const segStart = { lat: seg[0][0], lng: seg[0][1] };
        const segEnd = { lat: seg[seg.length - 1][0], lng: seg[seg.length - 1][1] };
        const startIsNearSegStart = haversineKm(startA, segStart) <= haversineKm(startA, segEnd);
        const nearStart = startIsNearSegStart ? segStart : segEnd;
        const nearEnd = startIsNearSegStart ? segEnd : segStart;

        // Gerçek güzergah her zaman katı çizgiyle çizilir.
        drawSegment(seg, false);
        // Gerçek hat, bacağın asıl uçlarına (durak/proje konumu) tam ulaşmıyorsa
        // aradaki fark ince kesikli bir "son adım" çizgisiyle tamamlanır.
        if (haversineKm(startA, nearStart) > REAL_GEOMETRY_CONNECT_LIMIT_KM) {
          drawSegment([[startA.lat, startA.lng], [nearStart.lat, nearStart.lng]], true);
        }
        if (haversineKm(endA, nearEnd) > REAL_GEOMETRY_CONNECT_LIMIT_KM) {
          drawSegment([[nearEnd.lat, nearEnd.lng], [endA.lat, endA.lng]], true);
        }
      } else {
        // Gerçek geometri bu bacak için kullanılamadı (uçlar hattın tamamen
        // aynı noktasına denk düştü) — dürüstçe kesikli/tahmini göster.
        drawSegment([[startA.lat, startA.lng], [endA.lat, endA.lng]], true);
      }
    } else {
      drawSegment([[startA.lat, startA.lng], [endA.lat, endA.lng]], true);
    }
  });

  if (allPoints.length) {
    map.fitBounds(L.latLngBounds(allPoints), { padding: [70, 70], animate: true, duration: 0.8 });
  }
}

function showRouteResult(estimate) {
  routeDetailTitle.innerHTML = `Rota Detayı · ${estimate.transfers} aktarma · ~${estimate.durationMin} dk`;
  routeDetailSteps.innerHTML = renderRouteSteps(estimate.steps);
  routeDetailWarning.classList.toggle("hidden", estimate.verified);

  const alt = estimate.dolmusAlternative;
  routeDolmusAlt.classList.toggle("hidden", !alt);
  if (alt) {
    routeDolmusAlt.innerHTML = `
      <div class="text-[11px] font-semibold text-amber-700 uppercase tracking-wide mb-1.5">
        🚐 Dolmuşla alternatif · ~${alt.durationMin} dk (${alt.savingMin} dk daha hızlı)
      </div>
      <div class="text-[10px] text-slate-400 mb-1.5">
        Gayriresmi/kooperatif işletmeciler tarafından çalıştırılır, EGO'ya kayıtlı değildir — sefer sıklığı/güzergah İK tarafından adaya kesin bilgi gibi aktarılmamalıdır.
      </div>
      ${renderRouteSteps(alt.steps)}`;
  } else {
    routeDolmusAlt.innerHTML = "";
  }

  routeDetail.classList.remove("hidden");
}

// ---------------------------------------------------------------------------
// 7) HAFTALIK ACİL PROJELER PENCERESİ
// ---------------------------------------------------------------------------

const urgentBtn = document.getElementById("urgentBtn");
const urgentModal = document.getElementById("urgentModal");
const urgentModalList = document.getElementById("urgentModalList");
const urgentModalClose = document.getElementById("urgentModalClose");
const urgentModalCancel = document.getElementById("urgentModalCancel");
const urgentModalSave = document.getElementById("urgentModalSave");

// Modal açıldığı andaki urgent durumunun anlık görüntüsü. Kaydet'e basılınca
// checkbox'lar bu görüntüyle kıyaslanır — canlı ANKARA_DATA.projects ile DEĞİL,
// çünkü modal açıkken arka planda gelen bir Sheet yenilemesi projects dizisini
// değiştirebilir; o an canlı veriyle kıyaslamak, kullanıcının hiç dokunmadığı
// projeleri de "değişti" sayıp yanlışlıkla geri yazmaya (veri bozulmasına) yol açıyordu.
let urgentModalBaseline = new Map();

function renderUrgentModalList() {
  const sorted = activeProjects().sort((a, b) => a.name.localeCompare(b.name, "tr"));
  urgentModalBaseline = new Map(sorted.map((p) => [p.id, Boolean(p.urgent)]));
  urgentModalList.innerHTML = sorted
    .map(
      (p) => `
      <label class="urgent-modal-row">
        <input type="checkbox" value="${p.id}" ${URGENT_PROJECT_IDS.has(p.id) ? "checked" : ""} />
        <span>${p.name} <span class="text-slate-400">— ${p.address}</span></span>
      </label>`
    )
    .join("");
}

function openUrgentModal() {
  renderUrgentModalList();
  urgentModal.classList.remove("hidden");
}
function closeUrgentModal() {
  urgentModal.classList.add("hidden");
}

urgentBtn.addEventListener("click", openUrgentModal);
urgentModalClose.addEventListener("click", closeUrgentModal);
urgentModalCancel.addEventListener("click", closeUrgentModal);
urgentModal.addEventListener("click", (e) => {
  if (e.target === urgentModal) closeUrgentModal();
});

urgentModalSave.addEventListener("click", async () => {
  const checked = new Set(
    Array.from(urgentModalList.querySelectorAll("input[type=checkbox]:checked")).map((cb) => cb.value)
  );
  const changed = activeProjects().filter((p) => (urgentModalBaseline.get(p.id) ?? Boolean(p.urgent)) !== checked.has(p.id));
  if (changed.length === 0) {
    closeUrgentModal();
    return;
  }
  // Çok sayıda proje aynı anda değişiyorsa (ör. yanlışlıkla toplu işaret
  // kaldırma) onay iste — bir yarış/kaza sonucu 30+ projenin durumunun
  // yanlışlıkla değişmesini daha önce yaşadık.
  if (changed.length > 5 && !confirm(`${changed.length} projenin acil durumu değişecek. Emin misin?`)) {
    return;
  }
  urgentModalSave.disabled = true;
  urgentModalSave.textContent = "Kaydediliyor…";
  try {
    const { updatedIds, notFound } = await postBatchUpdate(
      changed.map((p) => ({ id: p.id, patch: { urgent: checked.has(p.id) } }))
    );
    changed.forEach((p) => {
      if (updatedIds.has(p.id)) p.urgent = checked.has(p.id);
    });
    recomputeUrgentInactiveSets();
    refreshProjectMarkers();
    saveProjectsCache();
    if (notFound.length > 0) {
      alert(`${updatedIds.size}/${changed.length} kaydedildi. ${notFound.length} proje bulunamadı.`);
      renderUrgentModalList();
    } else {
      closeUrgentModal();
      runSearch();
    }
  } catch (err) {
    alert("Kaydedilemedi — internet bağlantısını kontrol edip tekrar dene.");
  } finally {
    urgentModalSave.disabled = false;
    urgentModalSave.textContent = "Kaydet";
  }
});

// ---------------------------------------------------------------------------
// 8) HAFTALIK PROJE AÇ/KAPA PENCERESİ
// ---------------------------------------------------------------------------

const inactiveBtn = document.getElementById("inactiveBtn");
const inactiveModal = document.getElementById("inactiveModal");
const inactiveModalList = document.getElementById("inactiveModalList");
const inactiveModalClose = document.getElementById("inactiveModalClose");
const inactiveModalCancel = document.getElementById("inactiveModalCancel");
const inactiveModalSave = document.getElementById("inactiveModalSave");

// Burada — acil pencerenin aksine — TÜM projeler (kapalı olanlar dahil)
// listelenir, aksi halde kapatılmış bir projeyi geri açmanın yolu olmazdı.
// Aynı anlık-görüntü mantığı burada da geçerli — bkz. urgentModalBaseline.
let inactiveModalBaseline = new Map();

function renderInactiveModalList() {
  const sorted = [...ANKARA_DATA.projects].sort((a, b) => a.name.localeCompare(b.name, "tr"));
  inactiveModalBaseline = new Map(sorted.map((p) => [p.id, Boolean(p.active)]));
  inactiveModalList.innerHTML = sorted
    .map(
      (p) => `
      <label class="urgent-modal-row">
        <input type="checkbox" value="${p.id}" ${!INACTIVE_PROJECT_IDS.has(p.id) ? "checked" : ""} />
        <span>${p.name} <span class="text-slate-400">— ${p.address}</span></span>
      </label>`
    )
    .join("");
}

function openInactiveModal() {
  renderInactiveModalList();
  inactiveModal.classList.remove("hidden");
}
function closeInactiveModal() {
  inactiveModal.classList.add("hidden");
}

inactiveBtn.addEventListener("click", openInactiveModal);
inactiveModalClose.addEventListener("click", closeInactiveModal);
inactiveModalCancel.addEventListener("click", closeInactiveModal);
inactiveModal.addEventListener("click", (e) => {
  if (e.target === inactiveModal) closeInactiveModal();
});

inactiveModalSave.addEventListener("click", async () => {
  // Kutucuk işaretliyse AKTİF demektir; işaretsiz olanlar pasif listesine girer.
  const activeIds = new Set(
    Array.from(inactiveModalList.querySelectorAll("input[type=checkbox]:checked")).map((cb) => cb.value)
  );
  const changed = ANKARA_DATA.projects.filter((p) => (inactiveModalBaseline.get(p.id) ?? Boolean(p.active)) !== activeIds.has(p.id));
  if (changed.length === 0) {
    closeInactiveModal();
    return;
  }
  // Çok sayıda proje aynı anda değişiyorsa (ör. yanlışlıkla toplu işaret
  // kaldırma) onay iste — bir yarış/kaza sonucu 30+ projenin durumunun
  // yanlışlıkla değişmesini daha önce yaşadık.
  if (changed.length > 5 && !confirm(`${changed.length} projenin aktiflik durumu değişecek. Emin misin?`)) {
    return;
  }
  inactiveModalSave.disabled = true;
  inactiveModalSave.textContent = "Kaydediliyor…";
  try {
    const { updatedIds, notFound } = await postBatchUpdate(
      changed.map((p) => ({ id: p.id, patch: { active: activeIds.has(p.id) } }))
    );
    changed.forEach((p) => {
      if (updatedIds.has(p.id)) p.active = activeIds.has(p.id);
    });
    recomputeUrgentInactiveSets();
    refreshProjectMarkers();
    rebuildProjectSelect();
    saveProjectsCache();
    if (notFound.length > 0) {
      alert(`${updatedIds.size}/${changed.length} kaydedildi. ${notFound.length} proje bulunamadı.`);
      renderInactiveModalList();
    } else {
      closeInactiveModal();
      runSearch();
    }
  } catch (err) {
    alert("Kaydedilemedi — internet bağlantısını kontrol edip tekrar dene.");
  } finally {
    inactiveModalSave.disabled = false;
    inactiveModalSave.textContent = "Kaydet";
  }
});

// ---------------------------------------------------------------------------
// 9) SHEET'TEN CANLI PROJE LİSTESİ ÇEKME
// ---------------------------------------------------------------------------

// Proje listesini tamamen yeni bir kaynakla (Sheet'ten gelen veya yeni bir
// proje eklendikten sonraki hal) değiştirir: ANKARA_DATA.projects'i günceller,
// türetilmiş setleri/harita pinlerini/dropdown'ı yeniden kurar ve artık
// güncelliğini yitirmiş olabilecek rota tahminlerini (TransitCache) temizler.
function applyLiveProjects(projects) {
  ANKARA_DATA.projects.length = 0;
  projects.forEach((p) => ANKARA_DATA.projects.push(p));
  stopApproxCoordsCache = null;
  recomputeUrgentInactiveSets();
  rebuildAllProjectMarkers();
  rebuildProjectSelect();
  TransitCache.clearAll();
  if (currentMode === "origin-to-project" && originSelect.value) {
    runSearch();
  } else if (
    (currentMode === "project-to-origin" || currentMode === "project-to-candidates") &&
    projectSelect.value &&
    !activeProjects().some((p) => p.id === projectSelect.value)
  ) {
    clearResults();
  } else {
    runSearch();
  }
}

async function loadLiveProjects() {
  try {
    const cached = JSON.parse(localStorage.getItem(SHEET_CACHE_KEY) || "null");
    if (Array.isArray(cached) && cached.length) {
      applyLiveProjects(cached);
    }
  } catch {
    // önbellek okunamadı, statik veriyle devam
  }
  try {
    const res = await fetch(SHEET_API_URL);
    const data = await res.json();
    if (data.ok && Array.isArray(data.projects) && data.projects.length) {
      applyLiveProjects(data.projects);
      saveProjectsCache();
    }
  } catch {
    // Sheet'e ulaşılamadı (internet yok, henüz kurulmadı vb.) — statik/önbellek veriyle sessizce devam
  }
}

// ---------------------------------------------------------------------------
// 10) PROJE EKLE PENCERESİ
// ---------------------------------------------------------------------------

const addProjectBtn = document.getElementById("addProjectBtn");
const addProjectModal = document.getElementById("addProjectModal");
const addProjectForm = document.getElementById("addProjectForm");
const addProjectClose = document.getElementById("addProjectClose");
const addProjectCancel = document.getElementById("addProjectCancel");
const addProjectSubmit = document.getElementById("addProjectSubmit");
const addProjectStatus = document.getElementById("addProjectStatus");

function openAddProjectModal() {
  addProjectForm.reset();
  addProjectStatus.textContent = "";
  addProjectModal.classList.remove("hidden");
}
function closeAddProjectModal() {
  addProjectModal.classList.add("hidden");
}

addProjectBtn.addEventListener("click", openAddProjectModal);
addProjectClose.addEventListener("click", closeAddProjectModal);
addProjectCancel.addEventListener("click", closeAddProjectModal);
addProjectModal.addEventListener("click", (e) => {
  if (e.target === addProjectModal) closeAddProjectModal();
});

addProjectForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(addProjectForm);
  const name = fd.get("name").trim();
  const addressText = fd.get("address").trim();
  if (!name || !addressText) return;

  addProjectSubmit.disabled = true;
  addProjectStatus.textContent = "Konum bulunuyor…";
  try {
    const geo = await geocodeAddress(addressText);
    if (!geo) {
      addProjectStatus.textContent = "Konum bulunamadı. Adresi biraz daha netleştirip tekrar dene (ör. \"Bilkent, Çankaya\").";
      return;
    }
    const stop = nearestTransitStop(geo.lat, geo.lng);
    addProjectStatus.textContent = "Kaydediliyor…";

    const project = {
      name,
      sector: fd.get("sector"),
      address: addressText,
      lat: geo.lat,
      lng: geo.lng,
      accessStopId: stop ? stop.id : "",
      shift: fd.get("shift").trim(),
      salary: fd.get("salary").trim(),
      meal: fd.get("meal").trim(),
      transport: fd.get("transport").trim(),
      referral: fd.get("referral").trim(),
      gender: fd.get("gender"),
      capacity: fd.get("capacity").trim(),
      urgent: false,
      active: true,
    };

    const result = await postToSheet({ action: "add", project });
    project.id = result.id;
    ANKARA_DATA.projects.push(project);
    stopApproxCoordsCache = null;
    recomputeUrgentInactiveSets();
    buildProjectMarker(project);
    rebuildProjectSelect();
    saveProjectsCache();
    closeAddProjectModal();
    if (currentMode === "origin-to-project" && originSelect.value) runSearch();
  } catch (err) {
    addProjectStatus.textContent = "Kaydedilemedi — internet bağlantısını kontrol edip tekrar dene.";
  } finally {
    addProjectSubmit.disabled = false;
  }
});

// İlk yükleme
clearResults();
loadLiveProjects();
