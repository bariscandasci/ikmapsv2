/**
 * ADAY VERİTABANI — Excel yükleme, sütun eşleme, telefon bazlı tekilleştirme
 * ve seçilen bir projeye göre gerçek adayları sıralayan skorlama motoru.
 *
 * Bu dosya app.js'ten SONRA yüklenir (classic script, aynı global scope) ve
 * app.js'in gerçek graf tabanlı rota motorunu (getTransitEstimate) olduğu
 * gibi kullanır — mesafe/süre hesaplaması burada TEKRAR YAZILMAZ.
 *
 * DEPOLAMA: Şu an yalnızca localStorage (CandidateStore) kullanılıyor — proje
 * verisindeki gibi (Google Sheets) ekip genelinde paylaşımlı DEĞİL, sadece bu
 * tarayıcıda kalıcı. Paylaşımlı hale getirmek istenirse CandidateStore'un
 * _load/_save/upsertBatch metodları bir Apps Script Web App'ine (projelerdeki
 * postToSheet/postBatchUpdate deseniyle aynı) bağlanacak şekilde değiştirilir;
 * geri kalan tüm mantık (dedup, skorlama, UI) aynı kalır.
 */

// ---------------------------------------------------------------------------
// 1) VERİ MODELİ + DEPOLAMA (localStorage)
// ---------------------------------------------------------------------------

const CANDIDATE_STORE_KEY = "ik_ulasim_candidates_v1";

/** Telefonu 10 haneli EGO/GSM biçimine indirger (0/+90 önekleri atılır) — dedup anahtarı bu. */
function normalizePhone(raw) {
  if (!raw) return "";
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("90") && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  return digits;
}

/**
 * Aynı telefonla ikinci kez yüklenen bir adayı MEVCUT kayda birleştirir:
 * - Boş olmayan yeni alanlar eskiyi ezer (daha güncel bilgi kabul edilir).
 * - sektörDeneyimi/sertifikalar birleştirilir (küme/union), kaybolmaz.
 * - appliedAt (başvuru tarihi) en ESKİSİ tutulur — "ilk ne zaman başvurdu" anlamlı olan budur.
 * - uploadedAt her zaman en YENİSİ olur — "en son ne zaman görüldü" için.
 * - Adres metni değiştiyse önceden çözülmüş koordinat/ilçe eşleşmesi GEÇERSİZ kılınır
 *   (aksi halde eski konuma göre skorlanmaya devam ederdi).
 */
function mergeCandidateInto(existing, incoming) {
  const merged = { ...existing };
  if (incoming.fullName) merged.fullName = incoming.fullName;
  if (incoming.phoneRaw) merged.phoneRaw = incoming.phoneRaw;
  if (incoming.age != null) merged.age = incoming.age;
  if (incoming.gender) merged.gender = incoming.gender;
  if (incoming.sectorExperience && incoming.sectorExperience.length) {
    merged.sectorExperience = Array.from(new Set([...(existing.sectorExperience || []), ...incoming.sectorExperience]));
  }
  if (incoming.certificates && incoming.certificates.length) {
    merged.certificates = Array.from(new Set([...(existing.certificates || []), ...incoming.certificates]));
  }
  if (incoming.appliedAt && (!existing.appliedAt || incoming.appliedAt < existing.appliedAt)) {
    merged.appliedAt = incoming.appliedAt;
  }
  merged.uploadedAt = incoming.uploadedAt;
  if (incoming.source && !(existing.mergedSources || []).includes(incoming.source)) {
    merged.mergedSources = [...(existing.mergedSources || []), incoming.source];
  }
  if (incoming.addressText && incoming.addressText !== existing.addressText) {
    merged.addressText = incoming.addressText;
    merged.coords = null;
    merged.districtId = null;
    merged.neighborhoodId = null;
    merged.coordsSource = null;
  }
  return merged;
}

const CandidateStore = {
  _mem: null,
  _load() {
    if (this._mem) return this._mem;
    try {
      this._mem = JSON.parse(localStorage.getItem(CANDIDATE_STORE_KEY) || "[]");
    } catch {
      this._mem = [];
    }
    return this._mem;
  },
  _save() {
    try {
      localStorage.setItem(CANDIDATE_STORE_KEY, JSON.stringify(this._mem || []));
    } catch {
      /* localStorage kullanılamıyorsa (ör. gizli sekme) sessizce yoksay */
    }
  },
  all() {
    return this._load();
  },
  /** newOnes: buildCandidateFromRow() çıktısı dizisi. Dönüş: {added, merged}. */
  upsertBatch(newOnes) {
    const list = this._load();
    const byId = new Map(list.map((c) => [c.id, c]));
    let added = 0;
    let merged = 0;
    newOnes.forEach((c) => {
      if (!c.id) return;
      if (byId.has(c.id)) {
        byId.set(c.id, mergeCandidateInto(byId.get(c.id), c));
        merged += 1;
      } else {
        byId.set(c.id, c);
        added += 1;
      }
    });
    this._mem = Array.from(byId.values());
    this._save();
    return { added, merged };
  },
  clear() {
    this._mem = [];
    this._save();
  },
};

// ---------------------------------------------------------------------------
// 2) EXCEL PARSE + SÜTUN EŞLEME
// ---------------------------------------------------------------------------

const CANDIDATE_FIELDS = [
  { key: "fullName", label: "Ad Soyad", required: true },
  { key: "phone", label: "Telefon", required: true },
  { key: "addressText", label: "Adres / İlçe-Mahalle", required: true },
  { key: "age", label: "Yaş", required: false },
  { key: "gender", label: "Cinsiyet", required: false },
  { key: "sectorExperience", label: "Sektör Deneyimi", required: false },
  { key: "certificates", label: "Sertifika / Belge", required: false },
  { key: "source", label: "Kaynak (Eleman.net/Kariyer.net...)", required: false },
  { key: "appliedAt", label: "Başvuru Tarihi", required: false },
];

const CANDIDATE_FIELD_KEYWORDS = {
  fullName: ["ad soyad", "adı soyadı", "isim", "ad ", "name"],
  phone: ["telefon", "gsm", "cep", "phone", "tel"],
  addressText: ["adres", "ilçe", "ilce", "mahalle", "semt"],
  age: ["yaş", "yas", "age", "doğum", "dogum"],
  gender: ["cinsiyet", "gender"],
  sectorExperience: ["sektör", "sektor", "deneyim", "tecrübe", "tecrube"],
  certificates: ["sertifika", "belge"],
  source: ["kaynak", "site", "kanal", "platform"],
  appliedAt: ["başvuru", "basvuru", "tarih", "date"],
};

function guessColumnForField(fieldKey, headers) {
  const keywords = CANDIDATE_FIELD_KEYWORDS[fieldKey] || [];
  const normHeaders = headers.map((h) => h.toLocaleLowerCase("tr"));
  for (const kw of keywords) {
    const idx = normHeaders.findIndex((h) => h.includes(kw));
    if (idx !== -1) return idx;
  }
  return -1;
}

function cellAt(row, idx) {
  if (idx == null || idx < 0) return "";
  return String(row[idx] ?? "").trim();
}

/** Excel'in seri tarih sayısını ya da serbest metin bir tarihi ISO string'e çevirir; olmazsa null. */
function parseFlexibleDate(raw) {
  if (!raw) return null;
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum > 20000 && asNum < 60000) {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + asNum * 86400000).toISOString();
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function buildCandidateFromRow(row, mapping, uploadedAt) {
  const fullName = cellAt(row, mapping.fullName);
  const phoneRaw = cellAt(row, mapping.phone);
  const phone = normalizePhone(phoneRaw);
  const addressText = cellAt(row, mapping.addressText);
  const ageRaw = cellAt(row, mapping.age);
  const ageNum = ageRaw ? parseInt(ageRaw, 10) : NaN;
  const genderNorm = cellAt(row, mapping.gender).toLocaleLowerCase("tr");
  const gender = genderNorm.startsWith("k") ? "Kadın" : genderNorm.startsWith("e") ? "Erkek" : null;
  const sectorExperience = cellAt(row, mapping.sectorExperience)
    .split(/[,/;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const certificates = cellAt(row, mapping.certificates)
    .split(/[,/;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const source = cellAt(row, mapping.source);
  const appliedAt = parseFlexibleDate(cellAt(row, mapping.appliedAt));

  return {
    id: phone ? `cand_${phone}` : null,
    fullName,
    phone,
    phoneRaw,
    addressText,
    districtId: null,
    neighborhoodId: null,
    coords: null,
    coordsSource: null,
    age: Number.isFinite(ageNum) ? ageNum : null,
    gender,
    sectorExperience,
    certificates,
    source,
    appliedAt,
    uploadedAt,
    // KVKK veri saklama süresi için ileride kullanılacak alan — şimdilik
    // hiçbir işlevi yok (otomatik silme/uyarı YAPILMIYOR), sadece şema hazır.
    retentionUntil: null,
    mergedSources: source ? [source] : [],
  };
}

// ---------------------------------------------------------------------------
// 3) ADAY KONUMU ÇÖZÜMLEME (ilçe/mahalle eşleşmesi -> gerekirse geocode)
// ---------------------------------------------------------------------------

/** Adres metnini bilinen ilçe/mahalle adlarıyla eşleştirir — ağ isteği yok, anında. */
function matchDistrictOrNeighborhood(text) {
  if (!text) return null;
  const norm = text.toLocaleLowerCase("tr");
  for (const d of ANKARA_DATA.districts) {
    for (const n of d.neighborhoods || []) {
      if (norm.includes(n.name.toLocaleLowerCase("tr"))) {
        return { districtId: d.id, neighborhoodId: n.id, coords: { lat: n.lat, lng: n.lng } };
      }
    }
  }
  for (const d of ANKARA_DATA.districts) {
    if (norm.includes(d.name.toLocaleLowerCase("tr"))) {
      return { districtId: d.id, neighborhoodId: null, coords: { lat: d.lat, lng: d.lng } };
    }
  }
  return null;
}

/**
 * Aday konumunu tembel (lazy) olarak çözer: önce bilinen ilçe/mahalle adı
 * eşleşmesi (anında), yoksa Nominatim geocode (ağ isteği, cache'li — bkz.
 * app.js geocodeAddress). Sadece sıralama sırasında, ihtiyaç oldukça
 * çağrılır — yüzlerce adaylık bir Excel'i içe aktarırken hepsini toptan
 * geocode etmeye ÇALIŞMIYORUZ (Nominatim'in kullanım politikası ~1 istek/sn
 * ile sınırlı, büyük bir toplu içe aktarmada anlamsız bir gecikme yaratırdı).
 */
async function resolveCandidateCoords(candidate) {
  if (candidate.coords) return candidate.coords;
  const match = matchDistrictOrNeighborhood(candidate.addressText);
  if (match) {
    candidate.districtId = match.districtId;
    candidate.neighborhoodId = match.neighborhoodId;
    candidate.coords = match.coords;
    candidate.coordsSource = "ilce-eslesme";
    return candidate.coords;
  }
  try {
    const geo = await geocodeAddress(candidate.addressText);
    if (geo) {
      candidate.coords = { lat: geo.lat, lng: geo.lng };
      candidate.coordsSource = "geocode";
      return candidate.coords;
    }
  } catch {
    /* geocode başarısız oldu, konum belirlenemedi olarak bırak */
  }
  return null;
}

// ---------------------------------------------------------------------------
// 4) SKORLAMA MOTORU — sert filtreler + ağırlıklı puan
// ---------------------------------------------------------------------------

const CANDIDATE_SCORE_WEIGHTS = { proximity: 40, transfers: 15, experience: 25, ageFit: 20 };
const CANDIDATE_SCORE_LABELS = { proximity: "Yakınlık", transfers: "Aktarma", experience: "Deneyim", ageFit: "Yaş uygunluğu" };

// Proje bazlı bir yaş aralığı tanımlanmamışsa (bkz. AÇIK KARAR: proje
// şemasında henüz ageRange alanı yok) bu genel varsayım kullanılır.
const CANDIDATE_DEFAULT_AGE_RANGE = { min: 22, max: 45 };

function scoreProximity(durationMin) {
  const FULL_AT = 20; // dk, bu ve altı tam puan
  const ZERO_AT = 90; // dk, bu ve üstü 0 puan
  if (durationMin <= FULL_AT) return CANDIDATE_SCORE_WEIGHTS.proximity;
  if (durationMin >= ZERO_AT) return 0;
  const ratio = 1 - (durationMin - FULL_AT) / (ZERO_AT - FULL_AT);
  return Math.round(CANDIDATE_SCORE_WEIGHTS.proximity * ratio);
}

function scoreTransfers(transfers) {
  return Math.max(0, CANDIDATE_SCORE_WEIGHTS.transfers - transfers * 5);
}

function scoreExperience(candidate, project) {
  const exp = candidate.sectorExperience || [];
  if (!exp.length) return 0;
  const norm = exp.map((s) => s.toLocaleLowerCase("tr"));
  if (norm.includes((project.sector || "").toLocaleLowerCase("tr"))) return CANDIDATE_SCORE_WEIGHTS.experience;
  return Math.round(CANDIDATE_SCORE_WEIGHTS.experience * 0.4); // ilgisiz ama bir deneyimi var — kısmi puan
}

function scoreAgeFit(candidate, project) {
  if (candidate.age == null) return Math.round(CANDIDATE_SCORE_WEIGHTS.ageFit * 0.5); // bilinmiyorsa nötr
  const range = project.ageRange || CANDIDATE_DEFAULT_AGE_RANGE;
  if (candidate.age >= range.min && candidate.age <= range.max) return CANDIDATE_SCORE_WEIGHTS.ageFit;
  const distance = candidate.age < range.min ? range.min - candidate.age : candidate.age - range.max;
  return Math.max(0, Math.round(CANDIDATE_SCORE_WEIGHTS.ageFit - distance * 2));
}

/** Elenme sebeplerini döner — boşsa aday sert filtrelerden geçmiştir. */
function candidateHardFilterReasons(candidate, project) {
  const reasons = [];
  if (project.gender && project.gender !== "Kadın/Erkek" && candidate.gender && candidate.gender !== project.gender) {
    reasons.push(`Cinsiyet şartı uyuşmuyor (proje: ${project.gender})`);
  }
  // requiredCertificate proje şemasında henüz yok (AÇIK KARAR) — varsa uygulanır, yoksa sessizce atlanır.
  if (project.requiredCertificate) {
    const has = (candidate.certificates || []).some((c) =>
      c.toLocaleLowerCase("tr").includes(project.requiredCertificate.toLocaleLowerCase("tr"))
    );
    if (!has) reasons.push(`Gerekli belge eksik: ${project.requiredCertificate}`);
  }
  return reasons;
}

async function scoreCandidateForProject(candidate, project) {
  const coords = await resolveCandidateCoords(candidate);
  if (!coords) {
    return { candidate, estimate: null, breakdown: null, total: 0, eliminated: true, reasons: ["Konum belirlenemedi (adres/ilçe eşleşmedi)"] };
  }

  const reasons = candidateHardFilterReasons(candidate, project);
  const origin = { coords, name: candidate.fullName || candidate.phoneRaw, stopId: null };
  const dest = { coords: { lat: project.lat, lng: project.lng }, name: project.name, stopId: project.accessStopId };
  const estimate = getTransitEstimate(candidate.id, origin, project.id, dest, "dest");

  const breakdown = {
    proximity: scoreProximity(estimate.durationMin),
    transfers: scoreTransfers(estimate.transfers),
    experience: scoreExperience(candidate, project),
    ageFit: scoreAgeFit(candidate, project),
  };
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return { candidate, estimate, breakdown, total, eliminated: reasons.length > 0, reasons };
}

/** projectId sabit taraf olduğu için getTransitEstimate fixedSide="dest" ile çağrılır (Dijkstra önbelleği isabet eder, bkz. app.js). */
async function rankCandidatesForProject(projectId) {
  const project = ANKARA_DATA.projects.find((p) => p.id === projectId);
  if (!project) return [];
  const candidates = CandidateStore.all();
  const results = await Promise.all(candidates.map((c) => scoreCandidateForProject(c, project)));
  results.sort((a, b) => {
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
    return (b.total || 0) - (a.total || 0);
  });
  return results;
}

// ---------------------------------------------------------------------------
// 5) UI — "Proje -> Gerçek Adaylar" sonuç listesi
// ---------------------------------------------------------------------------

const CANDIDATE_STALE_DAYS = 30;

function daysSince(isoDateStr) {
  if (!isoDateStr) return null;
  const d = new Date(isoDateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function buildCandidateResultCard(r) {
  const card = document.createElement("div");
  const freshnessBasis = r.candidate.appliedAt || r.candidate.uploadedAt;
  const staleDays = daysSince(freshnessBasis);
  const isStale = staleDays !== null && staleDays > CANDIDATE_STALE_DAYS;
  card.className = `candidate-card ${r.eliminated ? "candidate-card-eliminated" : ""}`;

  const breakdownHtml = r.breakdown
    ? Object.entries(r.breakdown)
        .map(([k, v]) => `<span class="candidate-score-chip">${CANDIDATE_SCORE_LABELS[k]}: ${v}</span>`)
        .join("")
    : "";

  const sourceLabel = r.candidate.source ? ` · ${r.candidate.source}` : "";
  const staleHtml = isStale
    ? `<div class="text-[10px] text-amber-600 font-semibold mt-1.5">⚠️ ${staleDays} gündür güncellenmedi — İK, adayla tekrar teyit etmeli</div>`
    : "";

  card.innerHTML = `
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <div class="font-semibold text-slate-800 truncate">${r.candidate.fullName || "İsimsiz aday"}</div>
        <div class="text-xs text-slate-500">${r.candidate.phoneRaw || "-"}${sourceLabel}</div>
      </div>
      ${
        r.eliminated
          ? `<span class="shrink-0 text-[10px] font-bold px-2 py-1 rounded-full bg-slate-200 text-slate-500 whitespace-nowrap">ELENDİ</span>`
          : `<span class="shrink-0 text-sm font-bold px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 whitespace-nowrap">${r.total} p</span>`
      }
    </div>
    ${
      r.eliminated
        ? `<div class="text-[11px] text-red-600 mt-1.5">${r.reasons.join(", ")}</div>`
        : `<div class="flex flex-wrap gap-1 mt-1.5">${breakdownHtml}</div>
           <div class="text-[11px] text-slate-500 mt-1.5">${r.estimate.durationMin} dk · ${r.estimate.transfers} aktarma${r.estimate.verified ? "" : " · TAHMİNİ"}</div>`
    }
    ${staleHtml}
  `;
  return card;
}

/**
 * currentMode/runSearch bunu app.js'ten çağırır (bkz. app.js runSearch()).
 * Konum çözme (geocode) asenkron olabileceği için bu fonksiyon da asenkron —
 * "puanlanıyor" durumu anında gösterilir, sonuçlar gelince yerini alır.
 */
async function renderProjectToCandidates(projectId) {
  const project = ANKARA_DATA.projects.find((p) => p.id === projectId);
  if (!project) return clearResults();

  routesLayer.clearLayers();
  resetDistrictMarkers();
  routeDetail.classList.add("hidden");
  nearbyLinesPanel.classList.add("hidden");

  const allCandidates = CandidateStore.all();
  resultsHeading.textContent = `${project.name} → Gerçek Adaylar (${allCandidates.length})`;
  emptyState.classList.toggle("hidden", allCandidates.length > 0);
  if (!allCandidates.length) {
    resultsList.innerHTML = "";
    emptyState.textContent = "Henüz hiç aday yüklenmedi — üstteki \"📋 Aday Yükle\" ile bir Excel dosyası içe aktarın.";
    return;
  }
  emptyState.textContent = "Sonuçları görmek için yukarıdan bir seçim yapın.";
  resultsList.innerHTML = `<div class="text-xs text-slate-400 px-1 py-4">Adaylar puanlanıyor…</div>`;

  const results = await rankCandidatesForProject(projectId);
  // Puanlama sürerken kullanıcı başka bir seçime geçmiş olabilir — o zaman bu eski sonucu ekrana basma.
  if (currentMode !== "project-to-candidates" || projectSelect.value !== projectId) return;

  resultsList.innerHTML = "";
  results.forEach((r) => resultsList.appendChild(buildCandidateResultCard(r)));

  map.setView([project.coords ? project.coords.lat : project.lat, project.coords ? project.coords.lng : project.lng], 11, {
    animate: true,
    duration: 0.8,
  });
}

// ---------------------------------------------------------------------------
// 6) UI — Excel yükleme + sütun eşleme modalı
// ---------------------------------------------------------------------------

const uploadCandidatesBtn = document.getElementById("uploadCandidatesBtn");
const uploadCandidatesModal = document.getElementById("uploadCandidatesModal");
const uploadCandidatesClose = document.getElementById("uploadCandidatesClose");
const uploadCandidatesCancel = document.getElementById("uploadCandidatesCancel");
const candidateFileInput = document.getElementById("candidateFileInput");
const candidateMappingArea = document.getElementById("candidateMappingArea");
const candidateMappingRows = document.getElementById("candidateMappingRows");
const candidateUploadStatus = document.getElementById("candidateUploadStatus");
const candidateImportBtn = document.getElementById("candidateImportBtn");
const candidatePoolCount = document.getElementById("candidatePoolCount");
const candidateClearAllBtn = document.getElementById("candidateClearAllBtn");

let pendingImport = null; // { headers: string[], rows: string[][] } | null

function refreshCandidatePoolCount() {
  candidatePoolCount.textContent = CandidateStore.all().length;
}

function openUploadCandidatesModal() {
  refreshCandidatePoolCount();
  uploadCandidatesModal.classList.remove("hidden");
}
function closeUploadCandidatesModal() {
  uploadCandidatesModal.classList.add("hidden");
  resetImportState();
}
function resetImportState() {
  pendingImport = null;
  candidateFileInput.value = "";
  candidateMappingArea.classList.add("hidden");
  candidateMappingRows.innerHTML = "";
  candidateUploadStatus.textContent = "";
  candidateImportBtn.disabled = true;
}

uploadCandidatesBtn.addEventListener("click", openUploadCandidatesModal);
uploadCandidatesClose.addEventListener("click", closeUploadCandidatesModal);
uploadCandidatesCancel.addEventListener("click", closeUploadCandidatesModal);
uploadCandidatesModal.addEventListener("click", (e) => {
  if (e.target === uploadCandidatesModal) closeUploadCandidatesModal();
});

candidateClearAllBtn.addEventListener("click", () => {
  if (!CandidateStore.all().length) return;
  if (!confirm(`${CandidateStore.all().length} adayın tamamı silinsin mi? Bu işlem geri alınamaz.`)) return;
  CandidateStore.clear();
  refreshCandidatePoolCount();
  if (currentMode === "project-to-candidates" && projectSelect.value) runSearch();
});

candidateFileInput.addEventListener("change", async () => {
  const file = candidateFileInput.files[0];
  if (!file) return;
  candidateUploadStatus.textContent = "Dosya okunuyor…";
  candidateMappingArea.classList.add("hidden");
  candidateImportBtn.disabled = true;
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    if (!rows.length) {
      candidateUploadStatus.textContent = "Dosya boş görünüyor.";
      return;
    }
    const headers = rows[0].map((h) => String(h || "").trim());
    const dataRows = rows.slice(1).filter((r) => r.some((cell) => String(cell || "").trim() !== ""));
    if (!dataRows.length) {
      candidateUploadStatus.textContent = "Başlık dışında veri satırı bulunamadı.";
      return;
    }
    pendingImport = { headers, rows: dataRows };
    renderCandidateMappingUI(headers);
    candidateUploadStatus.textContent = `${dataRows.length} satır bulundu. Sütunları kontrol edip "İçe Aktar"a basın.`;
    candidateImportBtn.disabled = false;
  } catch (err) {
    candidateUploadStatus.textContent = "Dosya okunamadı — geçerli bir .xlsx/.xls dosyası olduğundan emin olun.";
  }
});

function renderCandidateMappingUI(headers) {
  candidateMappingRows.innerHTML = CANDIDATE_FIELDS.map((f) => {
    const guessedIdx = guessColumnForField(f.key, headers);
    const options = [`<option value="-1">— Kullanma —</option>`].concat(
      headers.map((h, i) => `<option value="${i}" ${i === guessedIdx ? "selected" : ""}>${h || "(sütun " + (i + 1) + ")"}</option>`)
    );
    return `
      <div class="flex items-center gap-2">
        <label class="w-40 shrink-0 text-xs text-slate-600">${f.label}${f.required ? " *" : ""}</label>
        <select data-field="${f.key}" class="candidate-map-select flex-1 min-w-0 border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white">
          ${options.join("")}
        </select>
      </div>`;
  }).join("");
  candidateMappingArea.classList.remove("hidden");
}

candidateImportBtn.addEventListener("click", () => {
  if (!pendingImport) return;
  const selects = candidateMappingRows.querySelectorAll(".candidate-map-select");
  const mapping = {};
  selects.forEach((sel) => {
    mapping[sel.dataset.field] = Number(sel.value);
  });

  if (mapping.fullName === -1 || mapping.phone === -1 || mapping.addressText === -1) {
    candidateUploadStatus.textContent = "Ad Soyad, Telefon ve Adres/İlçe sütunları zorunludur.";
    return;
  }

  const now = new Date().toISOString();
  const parsed = pendingImport.rows.map((row) => buildCandidateFromRow(row, mapping, now)).filter((c) => c.phone);
  const skipped = pendingImport.rows.length - parsed.length;

  const { added, merged } = CandidateStore.upsertBatch(parsed);
  refreshCandidatePoolCount();
  resetImportState();
  candidateUploadStatus.textContent =
    `${added} yeni aday eklendi, ${merged} aday mevcut kayıtla tekilleştirildi (birleştirildi).` +
    (skipped > 0 ? ` ${skipped} satır telefon numarası olmadığı için atlandı.` : "") +
    ` Toplam ${CandidateStore.all().length} aday.`;

  if (currentMode === "project-to-candidates" && projectSelect.value) runSearch();
});
