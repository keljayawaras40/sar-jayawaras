// Register Surat Kelurahan (offline, localStorage)
// Fokus: nomor urut per perihal per tahun, tidak saling campur.

const STORAGE_KEY = "sr_sim_v1";
const DRAFT_KEY = "sr_sim_v1_draft";

const CLASS_LABEL = {
  BAIK: "Surat Keterangan Berkelakuan Baik",
  SKTMU: "Surat Keterangan Tidak Mampu Umum",
  UMUM: "Surat Keterangan",
  PEMAKAMAN: "Surat Keterangan Pemakaman",
  SKBI: "Surat Keterangan Beda Identitas",
  SKBMR: "Surat Keterangan Belum Memiliki Rumah",
  DOMISILI: "Surat Keterangan Domisili Dalam Wilayah",
  DOMISILI_LUAR: "Surat Keterangan Domisili Luar Wilayah",
  DOMISILI_PERUSAHAAN: "Surat Keterangan Domisili Perusahaan",
  SKPED: "Surat Keterangan Perubahan Elemen Data",
  DATANG: "Surat Keterangan Datang",
  PINDAH: "Surat Keterangan Pindah",
  WARIS: "Surat Keterangan Ahli Waris",
  KELAHIRAN: "Surat Keterangan Kelahiran",
  KEMATIAN: "Surat Keterangan Kematian",
  SKBM: "Surat Keterangan Belum Menikah",
  MENIKAH: "Surat Keterangan Menikah",
  SUIS: "Surat Keterangan Suami-Istri",
  SKTMS: "Surat Keterangan Tidak Mampu Sekolah",
  PERTANAHAN: "Surat Keterangan Tanah",
  SKTHT: "Surat Keterangan Taksiran Harga Tanah",
  USAHA: "Surat Keterangan Usaha",
  PENGHASILAN: "Surat Keterangan Penghasilan",
  BANK: "Surat Keterangan Bank",
  WALI: "Surat Keterangan Wali",
  SURAT_MASUK: "Surat Masuk",
  SURAT_KELUAR: "Surat Keluar",
};

const CLASS_PREFIX = {
  BAIK: "100.2.2.5",
  SKTMU: "100.2.2.5",
  UMUM: "100.2.2.5",
  PEMAKAMAN: "400.11.3.2",
  SKBI: "400.12.2.1",
  SKBMR: "400.12.2.1",
  DOMISILI: "400.12.2.1",
  DOMISILI_LUAR: "400.12.2.1",
  DOMISILI_PERUSAHAAN: "500.2.2.4",
  SKPED: "400.12.2.1",
  DATANG: "400.12.2.2",
  PINDAH: "400.12.2.2",
  WARIS: "400.12.3.1",
  KELAHIRAN: "400.12.3.1",
  KEMATIAN: "400.12.3.1",
  SKBM: "400.12.3.2",
  MENIKAH: "400.12.3.2",
  SUIS: "400.12.3.2",
  SKTMS: "400.3.3.2",
  PERTANAHAN: "500.17.2.3",
  SKTHT: "500.17.2.3",
  USAHA: "500.2.2.4",
  PENGHASILAN: "800.1.11.10",
  BANK: "900.1.7.2",
  WALI: "900.1.7.2",
  SURAT_MASUK: "",
  SURAT_KELUAR: "",
};

function monthToRoman(month) {
  const romanNumerals = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
  return romanNumerals[month] || "";
}

function ymdToYear(ymd) {
  if (!ymd) return new Date().getFullYear();
  return Number(String(ymd).slice(0, 4));
}

function nowISO() {
  const d = new Date();
  return d.toISOString();
}

// Utility to dynamically load a script and wait until it's loaded
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = (e) => reject(e);
    document.head.appendChild(s);
  });
}
// Try multiple CDNs with a timeout per attempt
function loadScriptWithFallback(urls, timeoutMs = 8000) {
  return new Promise(async (resolve, reject) => {
    for (const url of urls) {
      try {
        await Promise.race([loadScript(url), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs))]);
        // give browser a tick to register global
        await new Promise((r) => setTimeout(r, 50));
        if (typeof XLSX !== "undefined") return resolve();
        // if script loaded but XLSX not present, continue to next
      } catch (err) {
        console.warn(`Failed loading ${url}:`, err);
        // try next
      }
    }
    reject(new Error("All CDN attempts to load XLSX failed"));
  });
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { counters: {}, letters: [] };
    const parsed = JSON.parse(raw);
    if (!parsed.counters) parsed.counters = {};
    if (!parsed.letters) parsed.letters = [];
    return parsed;
  } catch {
    return { counters: {}, letters: [] };
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// saveState writes to localStorage only (no automatic backup)

// --- IndexedDB helpers (used as secondary persistent store) ---
const IDB_DBNAME = "sr_sim_db";
const IDB_STORE = "kv";
let _idb = null;
function idbOpen() {
  if (_idb) return Promise.resolve(_idb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DBNAME, 1);
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => {
      _idb = req.result;
      resolve(_idb);
    };
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
  });
}

function idbGet(key) {
  return idbOpen().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        const st = tx.objectStore(IDB_STORE);
        const rq = st.get(key);
        rq.onsuccess = () => resolve(rq.result);
        rq.onerror = () => reject(rq.error);
      }),
  );
}

function idbSet(key, value) {
  return idbOpen().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        const st = tx.objectStore(IDB_STORE);
        const rq = st.put(value, key);
        rq.onsuccess = () => resolve(rq.result);
        rq.onerror = () => reject(rq.error);
      }),
  );
}

function idbRemove(key) {
  return idbOpen().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        const st = tx.objectStore(IDB_STORE);
        const rq = st.delete(key);
        rq.onsuccess = () => resolve();
        rq.onerror = () => reject(rq.error);
      }),
  );
}

// --- Offline-only mode: data stored in localStorage + IndexedDB ---
// Write-through: save to localStorage and also persist to IndexedDB
function persistState(state) {
  try {
    saveState(state); // localStorage
    // async persist to IndexedDB
    idbSet(STORAGE_KEY, state).catch((e) => console.warn("IndexedDB save failed:", e));
  } catch (e) {
    console.warn("Persist state failed:", e);
  }
}

function saveDraft(draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft || {}));
  } catch (e) {
    console.warn("Gagal menyimpan draft ke localStorage:", e);
  }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch (e) {}
}

function counterKey(classification, year) {
  return `${classification}:${year}`;
}

function formatRegisterNo(classification, year, month, regNo, customCode = null) {
  // For SURAT_MASUK, return the manual register number as is
  if (classification === "SURAT_MASUK") {
    return regNo;
  }

  // For SURAT_KELUAR, use custom code if provided
  const prefix = customCode || CLASS_PREFIX[classification] || "";
  if (prefix === "" && !customCode) {
    // Empty prefix for SURAT_KELUAR without custom code
    return `${regNo}-Kel/${monthToRoman(month)}/${year}`;
  }
  // Desired format: PREFIX/2-Kel/I/2026 (number first, then -Kel, then month roman and year)
  return `${prefix}/${regNo}-Kel/${monthToRoman(month)}/${year}`;
}

// Migrate existing stored letters to ensure `register_display` matches current format

// Atomic-ish generator (single-tab safe). For multi-user server, this must be transactional DB.
function generateNextNumber(state, classification, year) {
  const key = counterKey(classification, year);
  const last = state.counters[key] ?? 0;
  const next = last + 1;
  state.counters[key] = next;
  return next;
}

function addLetter({ classification, letterDate, fields = {} }) {
  const state = loadState();
  const year = ymdToYear(letterDate);
  const month = Number(String(letterDate).slice(5, 7)); // Extract MM from YYYY-MM-DD

  // For SURAT_MASUK, use manual register number, otherwise generate auto-incrementing number
  let register_no;
  let customCode = null;

  if (classification === "SURAT_MASUK") {
    register_no = (fields.nomorRegister || "").trim();
    if (!register_no) {
      throw new Error("Nomor register harus diisi untuk Surat Masuk");
    }
  } else {
    register_no = generateNextNumber(state, classification, year);
    // For SURAT_KELUAR, get custom code from fields
    if (classification === "SURAT_KELUAR") {
      customCode = (fields.kodeKlasifikasi || "").trim();
    }
  }

  const fullName = (fields.fullName || "").trim();
  const birthPlaceDate = (fields.birthPlaceDate || "").trim();
  const occupation = (fields.occupation || "").trim();
  const address = (fields.address || "").trim();

  const letter = {
    id: crypto.randomUUID(),
    classification,
    letter_date: letterDate,
    year,
    month,
    register_no,
    register_display: formatRegisterNo(classification, year, month, register_no, customCode),
    fullName,
    birthPlaceDate,
    occupation,
    address,
    data: fields, // store all dynamic fields under `data`
    created_at: nowISO(),
    updated_at: nowISO(),
  };

  state.letters.unshift(letter); // newest first
  persistState(state);
  return letter;
}

function hardDeleteLetter(id) {
  const state = loadState();
  const idx = state.letters.findIndex((x) => x.id === id);
  if (idx === -1) return false;
  const letter = state.letters[idx];
  // remove the letter
  state.letters.splice(idx, 1);
  // If this letter had the highest register_no for its classification/year, decrement counter
  const key = counterKey(letter.classification, letter.year);
  const current = state.counters[key] ?? 0;
  if (current > 0 && Number(letter.register_no) === Number(current)) {
    state.counters[key] = current - 1;
    if (state.counters[key] <= 0) delete state.counters[key];
  }
  persistState(state);
  return true;
}

// --- Backup & Import Functions ---

function exportBackup() {
  try {
    const state = loadState();

    // Add metadata to backup
    const backup = {
      version: "1.0",
      exported_at: nowISO(),
      total_letters: (state.letters || []).length,
      counters: state.counters || {},
      letters: state.letters || [],
    };

    // Create download
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    // Create filename with timestamp
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    a.href = url;
    a.download = `backup_register_${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    alert(`✅ Backup berhasil diunduh!\n\nFile: ${a.download}\nTotal data: ${backup.total_letters} register`);
  } catch (error) {
    console.error("Backup gagal:", error);
    alert(`❌ Gagal membuat backup: ${error.message}`);
  }
}

function importBackup() {
  const fileInput = document.getElementById("fileImport");
  fileInput.click();
}

// Handle file selection for import
document.addEventListener("DOMContentLoaded", () => {
  const fileInput = document.getElementById("fileImport");
  if (fileInput) {
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const backup = JSON.parse(text);

        // Validate backup structure
        if (!backup.letters || !Array.isArray(backup.letters)) {
          throw new Error("Format file backup tidak valid. Mohon pastikan file backup yang benar.");
        }

        // Show confirmation dialog
        const totalLetters = backup.letters.length;
        const currentLetters = loadState().letters.length;

        dlgTitle.textContent = "Konfirmasi Import Backup";
        dlgBody.innerHTML = `
          <div style="line-height: 1.6; font-size: 14px;">
            <p><strong>⚠️ Perhatian!</strong></p>
            <p>Anda akan mengimport backup dengan data:</p>
            <ul style="margin: 10px 0; padding-left: 20px;">
              <li><strong>${totalLetters}</strong> data register</li>
              <li>File backup: <code style="background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px;">${file.name}</code></li>
            </ul>
            <p><strong style="color: #fbbf24;">Data saat ini (${currentLetters} register) akan diganti dengan data backup ini.</strong></p>
            <p style="color: #9ca3af; font-size: 12px; margin-top: 15px;">Anda dapat membuat backup data saat ini terlebih dahulu jika diperlukan.</p>
          </div>
        `;

        dlgFoot.innerHTML = `
          <button class="btn primary" id="confirmImport">Ya, Import Sekarang</button>
          <button class="btn secondary" id="cancelImport">Batal</button>
        `;

        dlg.showModal();

        // Handle confirmation
        document.getElementById("confirmImport").addEventListener("click", () => {
          try {
            const newState = {
              counters: backup.counters || {},
              letters: backup.letters || [],
            };

            persistState(newState);

            dlg.close();
            fileInput.value = ""; // Reset input

            // Refresh UI
            render();

            alert(`✅ Import berhasil!\n\nData yang diimport: ${totalLetters} register\nData lama telah diganti.`);
          } catch (error) {
            console.error("Import error:", error);
            alert(`❌ Gagal saat import: ${error.message}`);
          }
        });

        document.getElementById("cancelImport").addEventListener("click", () => {
          dlg.close();
          fileInput.value = "";
        });
      } catch (error) {
        console.error("File parsing error:", error);
        alert(`❌ Gagal membaca file: ${error.message}`);
        fileInput.value = "";
      }
    });
  }
});

// UI
const $ = (q) => document.querySelector(q);
const tbody = $("#tbody");
const counterGrid = $("#counterGrid");
const stats = $("#stats");

const form = $("#letterForm");
const classificationEl = $("#classification");
const dateEl = $("#letterDate");
const dynamicFieldsEl = $("#dynamicFields");
const previewEl = $("#previewNo");

// filterClass removed from UI; table will follow the `classificationEl` form selection
const filterClass = null;
const filterYear = $("#filterYear");
const filterMonth = $("#filterMonth");
const filterNo = $("#filterNo");

const btnExportExcel = $("#btnExportExcel");
const exportYear = $("#exportYear");
const exportMonth = $("#exportMonth");
const exportClassification = $("#exportClassification");
const btnReset = $("#btnReset");

function populateExportClassificationSelect() {
  if (!exportClassification) return;
  exportClassification.innerHTML = "";
  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "Semua Pelayanan";
  exportClassification.appendChild(defaultOption);

  Object.keys(CLASS_LABEL).forEach((classificationKey) => {
    const option = document.createElement("option");
    option.value = classificationKey;
    option.textContent = CLASS_LABEL[classificationKey] || classificationKey;
    exportClassification.appendChild(option);
  });
}

// Dialog helpers
const dlg = $("#dlg");
const dlgTitle = $("#dlgTitle");
const dlgBody = $("#dlgBody");
const dlgFoot = $("#dlgFoot");
$("#dlgClose").addEventListener("click", () => dlg.close());

// Sorting state: column key and direction (1 = asc, -1 = desc)
let sortColumn = null;
let sortDir = 1;
// Edit mode state
let editingId = null;

const submitBtn = form.querySelector('button[type="submit"]');

function enterEditMode(letter) {
  if (!letter) return;
  editingId = letter.id;
  // Set classification & date but keep them readonly during edit
  classificationEl.value = letter.classification;
  dateEl.value = letter.letter_date || new Date().toISOString().slice(0, 10);
  classificationEl.disabled = true;
  dateEl.disabled = true;
  // Render dynamic fields and populate values
  updateFormFields();
  const keys = CLASS_FIELDS[letter.classification] || ["fullName", "birthPlaceDate", "occupation", "address", "keterangan"];
  for (const k of keys) {
    const el = document.getElementById(k);
    if (!el) continue;
    const val = k === "fullName" || k === "birthPlaceDate" || k === "occupation" || k === "address" ? letter[k] || letter.data?.[k] || "" : letter.data?.[k] || "";
    el.value = val;
  }

  // For SKBI, also populate pilihDokumenSemula, dataSemula, pilihDokumenTerbaru and dataTerbaru after a small delay to ensure dynamic fields are created
  if (letter.classification === "SKBI") {
    setTimeout(() => {
      // First trigger handleSKBIChange to show document selectors
      const jenisPerbandinganEl = document.getElementById("jenisPerbandingan");
      if (jenisPerbandinganEl && letter.data?.jenisPerbandingan) {
        jenisPerbandinganEl.value = letter.data.jenisPerbandingan;
        handleSKBIChange();
      }

      // Then populate the specific field values
      const pilihDokumenSemulaEl = document.getElementById("pilihDokumenSemula");
      const dataSemelaEl = document.getElementById("dataSemula");
      const pilihDokumenTerbarEl = document.getElementById("pilihDokumenTerbaru");
      const dataTerbarEl = document.getElementById("dataTerbaru");
      if (pilihDokumenSemulaEl) pilihDokumenSemulaEl.value = letter.data?.pilihDokumenSemula || "";
      if (dataSemelaEl) dataSemelaEl.value = letter.data?.dataSemula || "";
      if (pilihDokumenTerbarEl) pilihDokumenTerbarEl.value = letter.data?.pilihDokumenTerbaru || "";
      if (dataTerbarEl) dataTerbarEl.value = letter.data?.dataTerbaru || "";

      // Trigger to show data input fields
      handleSKBIDataInputChange();
    }, 100);
  }

  // For SKPED, also populate jenisPerubahan, dataSemula and dataTerbaru after a small delay to ensure dynamic fields are created
  if (letter.classification === "SKPED") {
    setTimeout(() => {
      const jenisPerubahanEl = document.getElementById("jenisPerubahan");
      const dataSemelaEl = document.getElementById("dataSemula");
      const dataTerbarEl = document.getElementById("dataTerbaru");
      if (jenisPerubahanEl) jenisPerubahanEl.value = letter.data?.jenisPerubahan || "";
      if (dataSemelaEl) dataSemelaEl.value = letter.data?.dataSemula || "";
      if (dataTerbarEl) dataTerbarEl.value = letter.data?.dataTerbaru || "";
    }, 100);
  }

  // Change submit label and add cancel button
  if (submitBtn) submitBtn.textContent = "Simpan Perubahan";
  // change submit label
  // (no cancel button — per request)
  // focus first field
  const firstKey = keys[0];
  const firstEl = document.getElementById(firstKey);
  if (firstEl) firstEl.focus();
}

function exitEditMode() {
  editingId = null;
  classificationEl.disabled = false;
  dateEl.disabled = false;
  if (submitBtn) submitBtn.textContent = "Buat Nomor Register";
  // clear dynamic fields
  updateFormFields();
  updatePreview();
}

function getSortValue(letter, col) {
  if (!col) return null;
  if (col === "__no") return letter.created_at || "";
  if (col === "register") return (Number(letter.year) || 0) * 100000 + (Number(letter.register_no) || 0);
  if (col === "letter_date") return letter.letter_date || "";
  // Fallback: dynamic field
  return String(getFieldValue(letter, col) || "");
}

function applyTableSort(letters) {
  const arr = Array.from(letters || []);
  if (sortColumn) {
    arr.sort((a, b) => {
      const av = getSortValue(a, sortColumn);
      const bv = getSortValue(b, sortColumn);
      if (av === null || av === undefined || av === "") return 1 * sortDir;
      if (bv === null || bv === undefined || bv === "") return -1 * sortDir;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * sortDir;
      if (sortColumn === "letter_date" || sortColumn === "__no") return String(av).localeCompare(String(bv)) * sortDir;
      return String(av).toLowerCase().localeCompare(String(bv).toLowerCase()) * sortDir;
    });
    return arr;
  }
  // default chronological order: year asc, register_no asc
  arr.sort((a, b) => {
    const ya = Number(a.year) || 0;
    const yb = Number(b.year) || 0;
    if (ya !== yb) return ya - yb;
    const ra = Number(a.register_no) || 0;
    const rb = Number(b.register_no) || 0;
    return ra - rb;
  });
  return arr;
}

function updateSortIndicators(thead) {
  if (!thead) return;
  const ths = Array.from(thead.querySelectorAll("th"));
  ths.forEach((th) => {
    const col = th.dataset.col;
    const label = th.dataset.label || th.textContent || "";
    let indicator = "";
    if (col && col === sortColumn) indicator = sortDir === 1 ? " ▲" : " ▼";
    // Use textContent for safe label rendering, but keep indicator as plain text
    th.innerHTML = `${label}${indicator}`;
  });
}

// Attach click handler to table header row (delegated). Keeps working even if innerHTML changes.
document.addEventListener("DOMContentLoaded", () => {
  const theadRow = document.querySelector("table thead tr");
  if (!theadRow) return;
  theadRow.addEventListener("click", (e) => {
    const th = e.target.closest("th");
    if (!th) return;
    const col = th.dataset.col;
    if (!col) return;
    if (sortColumn === col) sortDir = -sortDir;
    else {
      sortColumn = col;
      sortDir = 1;
    }
    render();
  });
});

function showDialog({ title, bodyHTML, buttons }) {
  dlgTitle.textContent = title || "Konfirmasi";
  dlgBody.innerHTML = bodyHTML || "";
  dlgFoot.innerHTML = "";
  (buttons || []).forEach((b) => {
    const btn = document.createElement("button");
    btn.className = `btn ${b.variant || "secondary"}`;
    btn.textContent = b.text;
    btn.addEventListener("click", () => {
      if (b.onClick) b.onClick();
      if (!b.keepOpen) dlg.close();
    });
    dlgFoot.appendChild(btn);
  });
  dlg.showModal();
}

function updatePreview() {
  const cls = classificationEl.value;
  const dateValue = dateEl.value || new Date().toISOString().slice(0, 10);
  const year = ymdToYear(dateValue);
  const month = Number(String(dateValue).slice(5, 7));
  const state = loadState();

  let previewText;

  if (cls === "SURAT_MASUK") {
    // For SURAT_MASUK, show the manual register number
    const nomorRegisterEl = document.getElementById("nomorRegister");
    const manualRegNo = nomorRegisterEl ? nomorRegisterEl.value.trim() : "";
    previewText = manualRegNo || "—";
  } else {
    // For other services, generate preview normally
    const key = counterKey(cls, year);
    const next = (state.counters[key] ?? 0) + 1;

    // For SURAT_KELUAR, get custom code from form
    let customCode = null;
    if (cls === "SURAT_KELUAR" && document.getElementById("kodeKlasifikasi")) {
      customCode = document.getElementById("kodeKlasifikasi").value;
    }

    previewText = formatRegisterNo(cls, year, month, next, customCode);
  }

  previewEl.textContent = previewText;
}

function updateFormFields() {
  // Render dynamic form fields based on selected classification
  renderFormFields(classificationEl.value);
}

// Field definitions and per-class field lists
const FIELD_DEFS = {
  fullName: { label: "Nama Lengkap", type: "text", maxlength: 120, placeholder: "Contoh: Ahmad Santoso", required: true },
  birthPlaceDate: { label: "Tempat / Tgl.Lahir", type: "text", maxlength: 120, placeholder: "Contoh: Kota/Kabupaten, dd/mm/yyyy" },
  occupation: {
    label: "Pekerjaan",
    type: "select",
    options: [
      "Belum/Tidak Bekerja",
      "Mengurus Rumah Tangga",
      "Pelajar/Mahasiswa",
      "Pensiunan",
      "Pegawai Negeri Sipil (PNS)",
      "Tentara Nasional Indonesia (TNI)",
      "Kepolisian RI (POLRI)",
      "Perdagangan",
      "Petani/Pekebun",
      "Peternak",
      "Nelayan/Perikanan",
      "Industri",
      "Konstruksi",
      "Transportasi",
      "Karyawan Swasta",
      "Karyawan BUMN",
      "Karyawan BUMD",
      "Karyawan Honorer",
      "Buruh Harian Lepas",
      "Buruh Tani/Perkebunan",
      "Buruh Nelayan/Perikanan",
      "Buruh Peternakan",
      "Pembantu Rumah Tangga",
      "Tukang Cukur",
      "Tukang Listrik",
      "Tukang Batu",
      "Tukang Kayu",
      "Tukang Sol Sepatu",
      "Tukang Las/Pandai Besi",
      "Tukang Jahit",
      "Tukang Gigi",
      "Penata Rias",
      "Penata Busana",
      "Penata Rambut",
      "Mekanik",
      "Seniman",
      "Tabib",
      "Paraji",
      "Perancang Busana",
      "Penterjemah",
      "Imam Masjid",
      "Pendeta",
      "Pastor",
      "Wartawan",
      "Ustadz/Mubaligh",
      "Juru Masak",
      "Promotor Acara",
      "Anggota DPR RI",
      "Anggota DPD",
      "Anggota BPK",
      "Presiden",
      "Wakil Presiden",
      "Anggota Mahkamah Konstitusi",
      "Anggota Kabinet Kementrian",
      "Duta Besar",
      "Gubernur",
      "Wakil Gubernur",
      "Bupati",
      "Wakil Bupati",
      "Walikota",
      "Wakil Walikota",
      "Anggota DPRD Prop.",
      "Anggota DPRD Kab.",
      "Dosen",
      "Guru",
      "Pilot",
      "Pengacara",
      "Notaris",
      "Arsitek",
      "Akuntan",
      "Konsultan",
      "Dokter",
      "Bidan",
      "Perawat",
      "Apoteker",
      "Psikiater/Psikolog",
      "Penyiar Televisi",
      "Penyiar Radio",
      "Pelaut",
      "Peneliti",
      "Sopir",
      "Pialang",
      "Paranormal",
      "Pedagang",
      "Perangkat Desa",
      "Kepala Desa",
      "Biarawan/Biarawati",
      "Wiraswasta",
      "Pekerjaan Lainnya",
      "Anggota Lembaga Tinggi Lainnya",
      "Teknisi",
      "Tenaga Tata Usaha",
      "Aparatur Sipil Negara (ASN)",
      "Lainnya",
    ],
  },
  address: { label: "Alamat", type: "text", maxlength: 200, placeholder: "Kp. xxx RT.xxx RW.xxx" },
  jenisPerubahan: { label: "Jenis Perubahan", type: "select", options: ["Nama", "Tempat/Tgl. Lahir", "Jenis Kelamin", "Status Perkawinan", "Agama", "Pendidikan", "Pekerjaan", "Alamat"] },
  jenisPerbandingan: { label: "Jenis Perbandingan", type: "select", options: ["Nama", "Tempat/Tgl. Lahir", "Jenis Kelamin", "Status Perkawinan", "Agama", "Pendidikan", "Pekerjaan", "Alamat", "Nomor Identitas"] },
  keterangan: { label: "Keperluan", type: "text", maxlength: 300, placeholder: "Keperluan Pemohon" },
  gender: { label: "Jenis Kelamin", type: "select", options: ["Laki-Laki", "Perempuan"] },
  religion: { label: "Agama", type: "select", options: ["Islam", "Kristen Protestan", "Katolik", "Hindu", "Buddha", "Konghucu"] },
  maritalStatus: { label: "Status Perkawinan", type: "select", options: ["Belum Kawin", "Kawin", "Cerai Hidup", "Cerai Mati"] },
  nik: { label: "NIK", type: "text", maxlength: 32, placeholder: "Contoh: 3273020202xxxxxx" },
  banyaknyaAhliWaris: { label: "Banyaknya Ahli Waris", type: "number", maxlength: 6, placeholder: "Contoh: 3" },
  namaAnak: { label: "Nama Anak", type: "text", maxlength: 120, placeholder: "Nama anak" },
  anakJenisKelamin: { label: "Jenis Kelamin (Anak)", type: "select", options: ["Laki-laki", "Perempuan"] },
  anakBirthPlaceDate: { label: "Tempat, Tgl. Lahir (Anak)", type: "text", maxlength: 120, placeholder: "Contoh: Kota/Kabupaten, dd/mm/yyyy" },
  anakAgama: { label: "Agama (Anak)", type: "select", options: ["Islam", "Kristen Protestan", "Katolik", "Hindu", "Buddha", "Konghucu"] },
  anakNik: { label: "NIK (Anak)", type: "text", maxlength: 32, placeholder: "Contoh: 3273020202xxxxxx" },
  namaUsaha: { label: "Nama Usaha", type: "text", maxlength: 120, placeholder: "Nama Usaha" },
  bidangUsaha: { label: "Bidang Usaha", type: "text", maxlength: 120, placeholder: "Contoh: Dagang / Jasa" },
  alamatAsal: { label: "Alamat Asal", type: "text", maxlength: 200, placeholder: "Alamat Asal" },
  alamatTujuan: { label: "Alamat Tujuan", type: "text", maxlength: 200, placeholder: "Alamat Tujuan" },
  namaAyah: { label: "Nama", type: "text", maxlength: 120, placeholder: "Nama Ayah" },
  namaIbu: { label: "Nama", type: "text", maxlength: 120, placeholder: "Nama Ibu" },
  hariTanggalMeninggal: { label: "Hari, Tanggal Meninggal", type: "text", maxlength: 120, placeholder: "Contoh: Hari, dd/mm/yyyy" },
  namaPelapor: { label: "Nama Pelapor", type: "text", maxlength: 120, placeholder: "Nama Pelapor" },
  umur: { label: "Umur", type: "text", maxlength: 10, placeholder: "Contoh: 65 tahun" },
  hari: { label: "Hari", type: "select", options: ["Senin", "Selasa", "Rabu", "Kamis", "Jum'at", "Sabtu", "Minggu"] },
  tanggal: { label: "Tanggal", type: "text", maxlength: 120, placeholder: "Contoh: 15 April 2026" },
  tempatMeninggal: { label: "Di", type: "text", maxlength: 120, placeholder: "Tempat meninggal dunia" },
  diSebabkan: { label: "Di Sebabkan", type: "text", maxlength: 200, placeholder: "Penyebab kematian" },
  hariTanggalPemakaman: { label: "Hari, Tanggal Pemakaman", type: "text", maxlength: 120, placeholder: "Contoh: Hari, dd/mm/yyyy" },
  tempatPemakaman: { label: "Tempat Pemakaman", type: "text", maxlength: 120, placeholder: "Lokasi Pemakaman" },
  identitasTanah: { label: "Identitas Tanah", type: "text", maxlength: 200, placeholder: "Contoh: Sertifikat / SHM" },
  penjual: { label: "Penjual", type: "text", maxlength: 120, placeholder: "Nama Penjual" },
  pembeli: { label: "Pembeli", type: "text", maxlength: 120, placeholder: "Nama Pembeli" },
  waliDari: { label: "Wali Dari", type: "text", maxlength: 120, placeholder: "Nama Anak" },
  calonName: { label: "Nama Calon (Suami/Istri)", type: "text", maxlength: 120, placeholder: "Nama Calon (Suami/Istri)" },
  calonBirthPlaceDate: { label: "Tempat, Tanggal Lahir", type: "text", maxlength: 120, placeholder: "Contoh: Kota/Kabupaten, dd/mm/yyyy" },
  calonOccupation: {
    label: "Pekerjaan",
    type: "select",
    options: [
      "Belum/Tidak Bekerja",
      "Mengurus Rumah Tangga",
      "Pelajar/Mahasiswa",
      "Pensiunan",
      "Pegawai Negeri Sipil (PNS)",
      "Tentara Nasional Indonesia (TNI)",
      "Kepolisian RI (POLRI)",
      "Perdagangan",
      "Petani/Pekebun",
      "Peternak",
      "Nelayan/Perikanan",
      "Industri",
      "Konstruksi",
      "Transportasi",
      "Karyawan Swasta",
      "Karyawan BUMN",
      "Karyawan BUMD",
      "Karyawan Honorer",
      "Buruh Harian Lepas",
      "Buruh Tani/Perkebunan",
      "Buruh Nelayan/Perikanan",
      "Buruh Peternakan",
      "Pembantu Rumah Tangga",
      "Tukang Cukur",
      "Tukang Listrik",
      "Tukang Batu",
      "Tukang Kayu",
      "Tukang Sol Sepatu",
      "Tukang Las/Pandai Besi",
      "Tukang Jahit",
      "Tukang Gigi",
      "Penata Rias",
      "Penata Busana",
      "Penata Rambut",
      "Mekanik",
      "Seniman",
      "Tabib",
      "Paraji",
      "Perancang Busana",
      "Penterjemah",
      "Imam Masjid",
      "Pendeta",
      "Pastor",
      "Wartawan",
      "Ustadz/Mubaligh",
      "Juru Masak",
      "Promotor Acara",
      "Anggota DPR RI",
      "Anggota DPD",
      "Anggota BPK",
      "Presiden",
      "Wakil Presiden",
      "Anggota Mahkamah Konstitusi",
      "Anggota Kabinet Kementrian",
      "Duta Besar",
      "Gubernur",
      "Wakil Gubernur",
      "Bupati",
      "Wakil Bupati",
      "Walikota",
      "Wakil Walikota",
      "Anggota DPRD Prop.",
      "Anggota DPRD Kab.",
      "Dosen",
      "Guru",
      "Pilot",
      "Pengacara",
      "Notaris",
      "Arsitek",
      "Akuntan",
      "Konsultan",
      "Dokter",
      "Bidan",
      "Perawat",
      "Apoteker",
      "Psikiater/Psikolog",
      "Penyiar Televisi",
      "Penyiar Radio",
      "Pelaut",
      "Peneliti",
      "Sopir",
      "Pialang",
      "Paranormal",
      "Pedagang",
      "Perangkat Desa",
      "Kepala Desa",
      "Biarawan/Biarawati",
      "Wiraswasta",
      "Pekerjaan Lainnya",
      "Anggota Lembaga Tinggi Lainnya",
      "Teknisi",
      "Tenaga Tata Usaha",
      "Aparatur Sipil Negara (ASN)",
      "Lainnya",
    ],
  },
  calonAddress: { label: "Alamat", type: "text", maxlength: 200, placeholder: "Kp. xxx RT.xxx RW.xxx" },
  calonNik: { label: "NIK", type: "text", maxlength: 32, placeholder: "Contoh: 3273020202xxxxxx" },
  tanggalMenikah: { label: "Tanggal Pernikahan", type: "text", maxlength: 120, placeholder: "Contoh: 15 April 2026" },
  suamiFullName: { label: "Nama Suami", type: "text", maxlength: 120, placeholder: "Nama suami" },
  suamiBirthPlaceDate: { label: "Tempat, Tgl. Lahir", type: "text", maxlength: 120, placeholder: "Contoh: Kota/Kabupaten, dd/mm/yyyy" },
  suamiOccupation: {
    label: "Pekerjaan",
    type: "select",
    options: [
      "Belum/Tidak Bekerja",
      "Mengurus Rumah Tangga",
      "Pelajar/Mahasiswa",
      "Pensiunan",
      "Pegawai Negeri Sipil (PNS)",
      "Tentara Nasional Indonesia (TNI)",
      "Kepolisian RI (POLRI)",
      "Perdagangan",
      "Petani/Pekebun",
      "Peternak",
      "Nelayan/Perikanan",
      "Industri",
      "Konstruksi",
      "Transportasi",
      "Karyawan Swasta",
      "Karyawan BUMN",
      "Karyawan BUMD",
      "Karyawan Honorer",
      "Buruh Harian Lepas",
      "Buruh Tani/Perkebunan",
      "Buruh Nelayan/Perikanan",
      "Buruh Peternakan",
      "Pembantu Rumah Tangga",
      "Tukang Cukur",
      "Tukang Listrik",
      "Tukang Batu",
      "Tukang Kayu",
      "Tukang Sol Sepatu",
      "Tukang Las/Pandai Besi",
      "Tukang Jahit",
      "Tukang Gigi",
      "Penata Rias",
      "Penata Busana",
      "Penata Rambut",
      "Mekanik",
      "Seniman",
      "Tabib",
      "Paraji",
      "Perancang Busana",
      "Penterjemah",
      "Imam Masjid",
      "Pendeta",
      "Pastor",
      "Wartawan",
      "Ustadz/Mubaligh",
      "Juru Masak",
      "Promotor Acara",
      "Anggota DPR RI",
      "Anggota DPD",
      "Anggota BPK",
      "Presiden",
      "Wakil Presiden",
      "Anggota Mahkamah Konstitusi",
      "Anggota Kabinet Kementrian",
      "Duta Besar",
      "Gubernur",
      "Wakil Gubernur",
      "Bupati",
      "Wakil Bupati",
      "Walikota",
      "Wakil Walikota",
      "Anggota DPRD Prop.",
      "Anggota DPRD Kab.",
      "Dosen",
      "Guru",
      "Pilot",
      "Pengacara",
      "Notaris",
      "Arsitek",
      "Akuntan",
      "Konsultan",
      "Dokter",
      "Bidan",
      "Perawat",
      "Apoteker",
      "Psikiater/Psikolog",
      "Penyiar Televisi",
      "Penyiar Radio",
      "Pelaut",
      "Peneliti",
      "Sopir",
      "Pialang",
      "Paranormal",
      "Pedagang",
      "Perangkat Desa",
      "Kepala Desa",
      "Biarawan/Biarawati",
      "Wiraswasta",
      "Pekerjaan Lainnya",
      "Anggota Lembaga Tinggi Lainnya",
      "Teknisi",
      "Tenaga Tata Usaha",
      "Aparatur Sipil Negara (ASN)",
      "Lainnya",
    ],
  },
  suamiAddress: { label: "Alamat", type: "text", maxlength: 200, placeholder: "Kp. xxx RT.xxx RW.xxx" },
  suamiNik: { label: "NIK", type: "text", maxlength: 32, placeholder: "Contoh: 3273020202xxxxxx" },
  isriFullName: { label: "Nama Istri", type: "text", maxlength: 120, placeholder: "Nama istri" },
  isriBirthPlaceDate: { label: "Tempat, Tgl. Lahir", type: "text", maxlength: 120, placeholder: "Contoh: Kota/Kabupaten, dd/mm/yyyy" },
  isriOccupation: {
    label: "Pekerjaan",
    type: "select",
    options: [
      "Belum/Tidak Bekerja",
      "Mengurus Rumah Tangga",
      "Pelajar/Mahasiswa",
      "Pensiunan",
      "Pegawai Negeri Sipil (PNS)",
      "Tentara Nasional Indonesia (TNI)",
      "Kepolisian RI (POLRI)",
      "Perdagangan",
      "Petani/Pekebun",
      "Peternak",
      "Nelayan/Perikanan",
      "Industri",
      "Konstruksi",
      "Transportasi",
      "Karyawan Swasta",
      "Karyawan BUMN",
      "Karyawan BUMD",
      "Karyawan Honorer",
      "Buruh Harian Lepas",
      "Buruh Tani/Perkebunan",
      "Buruh Nelayan/Perikanan",
      "Buruh Peternakan",
      "Pembantu Rumah Tangga",
      "Tukang Cukur",
      "Tukang Listrik",
      "Tukang Batu",
      "Tukang Kayu",
      "Tukang Sol Sepatu",
      "Tukang Las/Pandai Besi",
      "Tukang Jahit",
      "Tukang Gigi",
      "Penata Rias",
      "Penata Busana",
      "Penata Rambut",
      "Mekanik",
      "Seniman",
      "Tabib",
      "Paraji",
      "Perancang Busana",
      "Penterjemah",
      "Imam Masjid",
      "Pendeta",
      "Pastor",
      "Wartawan",
      "Ustadz/Mubaligh",
      "Juru Masak",
      "Promotor Acara",
      "Anggota DPR RI",
      "Anggota DPD",
      "Anggota BPK",
      "Presiden",
      "Wakil Presiden",
      "Anggota Mahkamah Konstitusi",
      "Anggota Kabinet Kementrian",
      "Duta Besar",
      "Gubernur",
      "Wakil Gubernur",
      "Bupati",
      "Wakil Bupati",
      "Walikota",
      "Wakil Walikota",
      "Anggota DPRD Prop.",
      "Anggota DPRD Kab.",
      "Dosen",
      "Guru",
      "Pilot",
      "Pengacara",
      "Notaris",
      "Arsitek",
      "Akuntan",
      "Konsultan",
      "Dokter",
      "Bidan",
      "Perawat",
      "Apoteker",
      "Psikiater/Psikolog",
      "Penyiar Televisi",
      "Penyiar Radio",
      "Pelaut",
      "Peneliti",
      "Sopir",
      "Pialang",
      "Paranormal",
      "Pedagang",
      "Perangkat Desa",
      "Kepala Desa",
      "Biarawan/Biarawati",
      "Wiraswasta",
      "Pekerjaan Lainnya",
      "Anggota Lembaga Tinggi Lainnya",
      "Teknisi",
      "Tenaga Tata Usaha",
      "Aparatur Sipil Negara (ASN)",
      "Lainnya",
    ],
  },
  isriAddress: { label: "Alamat", type: "text", maxlength: 200, placeholder: "Kp. xxx RT.xxx RW.xxx" },
  isriNik: { label: "NIK", type: "text", maxlength: 32, placeholder: "Contoh: 3273020202xxxxxx" },
  jumlahPenghasilan: { label: "Jumlah Penghasilan", type: "text", maxlength: 120, placeholder: "Contoh: Rp 5.000.000 per bulan" },
  namaKepalaKeluarga: { label: "Nama Kepala Keluarga", type: "text", maxlength: 120, placeholder: "Nama Kepala Keluarga" },
  noKK: { label: "No KK", type: "text", maxlength: 32, placeholder: "Contoh: 3273020202xxxxxx" },
  klasifikasiKepindahan: { label: "Klasifikasi Kepindahan", type: "select", options: ["Dalam Kelurahan", "Antar Desa/Kelurahan", "Antar Kecamatan", "Antar Kab/Kota", "Antar Provinsi"] },
  jenisKepindahan: { label: "Jenis Kepindahan", type: "select", options: ["Kepala Keluarga", "Anggota Keluarga", "Kep. Keluarga & Seluruh Ang. Keluarga", "Kep. Keluarga & Sebagian Ang. Keluarga"] },
  jumlahKeluargaPindah: { label: "Jumlah Keluarga Yang Pindah", type: "number", maxlength: 6, placeholder: "Contoh: 5" },
  tanggalKedatangan: { label: "Tanggal Kedatangan", type: "date" },
  tanggalKepindahan: { label: "Tanggal Kepindahan", type: "date" },
  pukul: { label: "Pukul", type: "time" },
  anakKe: { label: "Anak Ke", type: "number", maxlength: 2, placeholder: "Contoh: 1" },
  namaAnak: { label: "Nama Anak", type: "text", maxlength: 120, placeholder: "Nama anak" },
  birthPlaceDateIbu: { label: "Tempat, Tgl. Lahir", type: "text", maxlength: 120, placeholder: "Contoh: Kota/Kabupaten, dd/mm/yyyy" },
  religionIbu: { label: "Agama", type: "select", options: ["Islam", "Kristen Protestan", "Katolik", "Hindu", "Buddha", "Konghucu"] },
  occupationIbu: {
    label: "Pekerjaan",
    type: "select",
    options: [
      "Belum/Tidak Bekerja",
      "Mengurus Rumah Tangga",
      "Pelajar/Mahasiswa",
      "Pensiunan",
      "Pegawai Negeri Sipil (PNS)",
      "Tentara Nasional Indonesia (TNI)",
      "Kepolisian RI (POLRI)",
      "Perdagangan",
      "Petani/Pekebun",
      "Peternak",
      "Nelayan/Perikanan",
      "Industri",
      "Konstruksi",
      "Transportasi",
      "Karyawan Swasta",
      "Karyawan BUMN",
      "Karyawan BUMD",
      "Karyawan Honorer",
      "Buruh Harian Lepas",
      "Buruh Tani/Perkebunan",
      "Buruh Nelayan/Perikanan",
      "Buruh Peternakan",
      "Pembantu Rumah Tangga",
      "Tukang Cukur",
      "Tukang Listrik",
      "Tukang Batu",
      "Tukang Kayu",
      "Tukang Sol Sepatu",
      "Tukang Las/Pandai Besi",
      "Tukang Jahit",
      "Tukang Gigi",
      "Penata Rias",
      "Penata Busana",
      "Penata Rambut",
      "Mekanik",
      "Seniman",
      "Tabib",
      "Paraji",
      "Perancang Busana",
      "Penterjemah",
      "Imam Masjid",
      "Pendeta",
      "Pastor",
      "Wartawan",
      "Ustadz/Mubaligh",
      "Juru Masak",
      "Promotor Acara",
      "Anggota DPR RI",
      "Anggota DPD",
      "Anggota BPK",
      "Presiden",
      "Wakil Presiden",
      "Anggota Mahkamah Konstitusi",
      "Anggota Kabinet Kementrian",
      "Duta Besar",
      "Gubernur",
      "Wakil Gubernur",
      "Bupati",
      "Wakil Bupati",
      "Walikota",
      "Wakil Walikota",
      "Anggota DPRD Prop.",
      "Anggota DPRD Kab.",
      "Dosen",
      "Guru",
      "Pilot",
      "Pengacara",
      "Notaris",
      "Arsitek",
      "Akuntan",
      "Konsultan",
      "Dokter",
      "Bidan",
      "Perawat",
      "Apoteker",
      "Psikiater/Psikolog",
      "Penyiar Televisi",
      "Penyiar Radio",
      "Pelaut",
      "Peneliti",
      "Sopir",
      "Pialang",
      "Paranormal",
      "Pedagang",
      "Perangkat Desa",
      "Kepala Desa",
      "Biarawan/Biarawati",
      "Wiraswasta",
      "Pekerjaan Lainnya",
      "Anggota Lembaga Tinggi Lainnya",
      "Teknisi",
      "Tenaga Tata Usaha",
      "Aparatur Sipil Negara (ASN)",
      "Lainnya",
    ],
  },
  birthPlaceDateAyah: { label: "Tempat, Tgl. Lahir", type: "text", maxlength: 120, placeholder: "Contoh: Kota/Kabupaten, dd/mm/yyyy" },
  religionAyah: { label: "Agama", type: "select", options: ["Islam", "Kristen Protestan", "Katolik", "Hindu", "Buddha", "Konghucu"] },
  occupationAyah: {
    label: "Pekerjaan",
    type: "select",
    options: [
      "Belum/Tidak Bekerja",
      "Mengurus Rumah Tangga",
      "Pelajar/Mahasiswa",
      "Pensiunan",
      "Pegawai Negeri Sipil (PNS)",
      "Tentara Nasional Indonesia (TNI)",
      "Kepolisian RI (POLRI)",
      "Perdagangan",
      "Petani/Pekebun",
      "Peternak",
      "Nelayan/Perikanan",
      "Industri",
      "Konstruksi",
      "Transportasi",
      "Karyawan Swasta",
      "Karyawan BUMN",
      "Karyawan BUMD",
      "Karyawan Honorer",
      "Buruh Harian Lepas",
      "Buruh Tani/Perkebunan",
      "Buruh Nelayan/Perikanan",
      "Buruh Peternakan",
      "Pembantu Rumah Tangga",
      "Tukang Cukur",
      "Tukang Listrik",
      "Tukang Batu",
      "Tukang Kayu",
      "Tukang Sol Sepatu",
      "Tukang Las/Pandai Besi",
      "Tukang Jahit",
      "Tukang Gigi",
      "Penata Rias",
      "Penata Busana",
      "Penata Rambut",
      "Mekanik",
      "Seniman",
      "Tabib",
      "Paraji",
      "Perancang Busana",
      "Penterjemah",
      "Imam Masjid",
      "Pendeta",
      "Pastor",
      "Wartawan",
      "Ustadz/Mubaligh",
      "Juru Masak",
      "Promotor Acara",
      "Anggota DPR RI",
      "Anggota DPD",
      "Anggota BPK",
      "Presiden",
      "Wakil Presiden",
      "Anggota Mahkamah Konstitusi",
      "Anggota Kabinet Kementrian",
      "Duta Besar",
      "Gubernur",
      "Wakil Gubernur",
      "Bupati",
      "Wakil Bupati",
      "Walikota",
      "Wakil Walikota",
      "Anggota DPRD Prop.",
      "Anggota DPRD Kab.",
      "Dosen",
      "Guru",
      "Pilot",
      "Pengacara",
      "Notaris",
      "Arsitek",
      "Akuntan",
      "Konsultan",
      "Dokter",
      "Bidan",
      "Perawat",
      "Apoteker",
      "Psikiater/Psikolog",
      "Penyiar Televisi",
      "Penyiar Radio",
      "Pelaut",
      "Peneliti",
      "Sopir",
      "Pialang",
      "Paranormal",
      "Pedagang",
      "Perangkat Desa",
      "Kepala Desa",
      "Biarawan/Biarawati",
      "Wiraswasta",
      "Pekerjaan Lainnya",
      "Anggota Lembaga Tinggi Lainnya",
      "Teknisi",
      "Tenaga Tata Usaha",
      "Aparatur Sipil Negara (ASN)",
      "Lainnya",
    ],
  },
  addressAyah: { label: "Alamat", type: "text", maxlength: 200, placeholder: "Kp. xxx RT.xxx RW.xxx" },
  pendidikan: {
    label: "Pendidikan",
    type: "select",
    options: ["Tidak/Belum Sekolah", "Belum Tamat SD/Sederajat", "Tamat SD/Sederajat", "SLTP/Sederajat", "SLTA/Sederajat", "Diploma I/II", "Akademi/Diploma III/Sarjana Muda", "Diploma IV/Strata I", "Strata II", "Strata III"],
  },
  dataSemula: { label: "Data Semula", type: "text", maxlength: 200, placeholder: "Masukkan data yang lama" },
  dataTerbaru: { label: "Data Terbaru", type: "text", maxlength: 200, placeholder: "Masukkan data yang baru" },
  jenisPermohonan: { label: "Keterangan", type: "text", maxlength: 200, placeholder: "Masukkan keterangan" },
  desaAsal: { label: "Desa/Kel", type: "text", maxlength: 120, placeholder: "Nama Desa/Kelurahan Asal" },
  kecAsal: { label: "Kec", type: "text", maxlength: 120, placeholder: "Nama Kecamatan Asal" },
  kabAsal: { label: "Kab/Kota", type: "text", maxlength: 120, placeholder: "Nama Kabupaten/Kota Asal" },
  provAsal: { label: "Provinsi", type: "text", maxlength: 120, placeholder: "Nama Provinsi Asal" },
  posAsal: { label: "Kode Pos", type: "text", maxlength: 10, placeholder: "Contoh: 44721" },
  desaPindah: { label: "Desa/Kel", type: "text", maxlength: 120, placeholder: "Nama Desa/Kelurahan Tujuan" },
  kecPindah: { label: "Kec", type: "text", maxlength: 120, placeholder: "Nama Kecamatan Tujuan" },
  kabPindah: { label: "Kab/Kota", type: "text", maxlength: 120, placeholder: "Nama Kabupaten/Kota Tujuan" },
  provPindah: { label: "Provinsi", type: "text", maxlength: 120, placeholder: "Nama Provinsi Tujuan" },
  posPindah: { label: "Kode Pos", type: "text", maxlength: 10, placeholder: "Contoh: 44721" },
  alasanPindah: { label: "Alasan Pindah", type: "select", options: ["Pekerjaan", "Pendidikan", "Keamanan", "Kesehatan", "Perumahan", "Keluarga", "Lainnya"] },
  anggotaTakPindah: { label: "Anggota Tak Pindah", type: "select", options: ["Numpang KK", "Membuat KK Baru", "KK Tetap"] },
  anggotaYangPindah: { label: "Anggota Yang Pindah", type: "select", options: ["Numpang KK", "Membuat KK Baru", "KK Tetap"] },
  rencanaPindahan: { label: "Rencana Kepindahan (Tanggal)", type: "date" },
  hariTglWafat: { label: "Hari, Tgl. Wafat", type: "text", maxlength: 120, placeholder: "Contoh: Hari, dd/mm/yyyy" },
  nomorSuketKematian: { label: "Nomor Suket Kematian", type: "text", maxlength: 120, placeholder: "Contoh: 100/SK-KM/2026" },
  namaPasangan: { label: "Nama Pasangan", type: "text", maxlength: 120, placeholder: "Nama Pasangan" },
  nomorSuketMenikah: { label: "Nomor Suket Menikah", type: "text", maxlength: 120, placeholder: "Contoh: 100/SK-MK/2026" },
  alamatTanah: { label: "Alamat Tanah", type: "text", maxlength: 200, placeholder: "Alamat lokasi tanah" },
  luas: { label: "Luas Tanah", type: "text", maxlength: 50, placeholder: "Contoh: 500 m² atau 5 hektar" },
  utara: { label: "Batas Utara", type: "text", maxlength: 150, placeholder: "Batas tanah sebelah utara" },
  selatan: { label: "Batas Selatan", type: "text", maxlength: 150, placeholder: "Batas tanah sebelah selatan" },
  timur: { label: "Batas Timur", type: "text", maxlength: 150, placeholder: "Batas tanah sebelah timur" },
  barat: { label: "Batas Barat", type: "text", maxlength: 150, placeholder: "Batas tanah sebelah barat" },
  pemilikTanahSebelumnya: { label: "Pemilik Tanah", type: "text", maxlength: 120, placeholder: "Nama pemilik tanah sebelumnya" },
  tahunKepemilikan: { label: "Tahun Penyerahan Tanah", type: "text", maxlength: 4, placeholder: "Contoh: 2020" },
  jenisMemperoelTanah: { label: "Jenis Memperoleh Tanah", type: "select", options: ["Warisan", "Jual Beli", "Hibah", "Tukar Menukar", "Kerjasama Bangun Guna Serah", "Sewa", "Lainnya"] },
  nopTanah: { label: "NOP", type: "text", maxlength: 50, placeholder: "Nomor Objek Pajak" },
  blokTanah: { label: "Blok", type: "text", maxlength: 50, placeholder: "Nomor blok tanah" },
  terleatakTanah: { label: "Terletak", type: "text", maxlength: 200, placeholder: "Lokasi/letak tanah" },
  luasTanahSKTHT: { label: "Luas Tanah", type: "text", maxlength: 50, placeholder: "Contoh: 500 m²" },
  hargaTanah: { label: "Harga Tanah", type: "text", maxlength: 50, placeholder: "Rp. 0" },
  luasBangunan: { label: "Luas Bangunan", type: "text", maxlength: 50, placeholder: "Contoh: 200 m²" },
  hargaBangunan: { label: "Harga Bangunan", type: "text", maxlength: 50, placeholder: "Rp. 0" },
  jenisDomisili: { label: "Jenis Domisili", type: "select", options: ["Domisili Dalam Wilayah", "Domisili Luar Wilayah"] },
  uraianPekerjaan: { label: "Uraian Pekerjaan", type: "text", maxlength: 200, placeholder: "Uraian pekerjaan" },
  domisiliSekarang: { label: "Domisili Sekarang", type: "text", maxlength: 200, placeholder: "Alamat domisili saat ini" },
  companyName: { label: "Nama Perusahaan", type: "text", maxlength: 200, placeholder: "Nama perusahaan" },
  kegiatan: { label: "Jenis Usaha", type: "text", maxlength: 200, placeholder: "Jenis usaha" },
  nib: { label: "NIB", type: "text", maxlength: 120, placeholder: "Nomor Induk Berusaha" },
  skKemenhumkam: { label: "SK KEMENHUMKAM", type: "text", maxlength: 120, placeholder: "Nomor SK KEMENHUMKAM" },
  npwp: { label: "NPWP", type: "text", maxlength: 120, placeholder: "Nomor NPWP" },
  companyAddress: { label: "Alamat Perusahaan", type: "text", maxlength: 200, placeholder: "Alamat perusahaan" },
  ownerName: { label: "Nama Pemilik", type: "text", maxlength: 200, placeholder: "Nama pemilik" },
  kodeKlasifikasi: { label: "Kode Klasifikasi", type: "text", maxlength: 50, placeholder: "Contoh: 100.1.1.1" },
  nomorRegister: { label: "Nomor Register", type: "text", maxlength: 100, placeholder: "Contoh: 001/SM/2026" },
  perihal: { label: "Perihal", type: "text", maxlength: 200, placeholder: "Perihal surat" },
  pengirim: { label: "Pengirim", type: "text", maxlength: 200, placeholder: "Nama pengirim surat" },
  tujuan: { label: "Tujuan", type: "text", maxlength: 200, placeholder: "Tujuan surat" },
};

const CLASS_FIELDS = {
  SKTMU: ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik", "keterangan"],
  DOMISILI: ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik", "keterangan"],
  DOMISILI_LUAR: ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "uraianPekerjaan", "address", "domisiliSekarang", "nik", "keterangan"],
  DOMISILI_PERUSAHAAN: ["companyName", "kegiatan", "nib", "skKemenhumkam", "npwp", "companyAddress", "ownerName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik", "keterangan"],
  BANK: ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik", "keterangan"],
  BAIK: ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik", "keterangan"],
  SKBI: ["fullName", "nik", "birthPlaceDate", "gender", "maritalStatus", "religion", "occupation", "address", "jenisPerbandingan"],
  SKPED: ["fullName", "nik", "birthPlaceDate", "gender", "maritalStatus", "religion", "occupation", "address"],
  SKBM: ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik", "keterangan"],
  SKBMR: ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik", "keterangan"],
  UMUM: ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik", "jenisPermohonan", "keterangan"],
  WARIS: ["fullName", "nik", "gender", "birthPlaceDate", "hariTglWafat", "address", "nomorSuketKematian", "namaPasangan", "nomorSuketMenikah", "banyaknyaAhliWaris"],
  SKTMS: ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik", "namaAnak", "anakJenisKelamin", "anakBirthPlaceDate", "anakAgama", "anakNik", "keterangan"],
  USAHA: ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik", "bidangUsaha", "namaUsaha", "keterangan"],
  DATANG: ["fullName", "nik", "namaKepalaKeluarga", "noKK", "alamatAsal", "alamatTujuan", "klasifikasiKepindahan", "jenisKepindahan", "jumlahKeluargaPindah", "tanggalKedatangan", "keterangan"],
  PINDAH: ["fullName", "nik", "namaKepalaKeluarga", "noKK", "alamatAsal", "alamatTujuan", "klasifikasiKepindahan", "jenisKepindahan", "jumlahKeluargaPindah", "tanggalKepindahan", "keterangan"],
  KELAHIRAN: ["hari", "tanggal", "pukul", "tempatMeninggal", "anakKe", "gender", "namaAnak", "namaIbu", "birthPlaceDateIbu", "religionIbu", "occupationIbu", "namaAyah", "birthPlaceDateAyah", "religionAyah", "occupationAyah", "addressAyah"],
  KEMATIAN: ["fullName", "umur", "gender", "occupation", "address", "hari", "tanggal", "tempatMeninggal", "diSebabkan", "keterangan"],
  PEMAKAMAN: ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "hari", "tanggal", "pukul", "tempatPemakaman", "keterangan"],
  PERTANAHAN: [
    "fullName",
    "gender",
    "birthPlaceDate",
    "religion",
    "maritalStatus",
    "occupation",
    "address",
    "nik",
    "alamatTanah",
    "luas",
    "utara",
    "selatan",
    "timur",
    "barat",
    "pemilikTanahSebelumnya",
    "tahunKepemilikan",
    "jenisMemperoelTanah",
  ],
  SKTHT: ["fullName", "address", "nopTanah", "blokTanah", "terleatakTanah", "luasTanahSKTHT", "hargaTanah", "luasBangunan", "hargaBangunan"],
  WALI: ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik", "namaAnak", "anakJenisKelamin", "anakBirthPlaceDate", "anakAgama", "anakNik", "keterangan"],
  SUIS: ["suamiFullName", "suamiBirthPlaceDate", "suamiOccupation", "suamiAddress", "suamiNik", "isriFullName", "isriBirthPlaceDate", "isriOccupation", "isriAddress", "isriNik", "tanggalMenikah"],
  MENIKAH: ["fullName", "birthPlaceDate", "occupation", "address", "nik", "calonName", "calonBirthPlaceDate", "calonOccupation", "calonAddress", "calonNik", "keterangan"],
  PENGHASILAN: ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik", "jumlahPenghasilan", "keterangan"],
  SURAT_MASUK: ["nomorRegister", "perihal", "pengirim", "keterangan"],
  SURAT_KELUAR: ["kodeKlasifikasi", "perihal", "tujuan", "keterangan"],
};

function renderFormFields(classification) {
  const keys = CLASS_FIELDS[classification] || ["fullName", "birthPlaceDate", "occupation", "address", "keterangan"];
  dynamicFieldsEl.innerHTML = keys
    .map((k) => {
      const def = FIELD_DEFS[k];
      if (!def) return "";
      const required = def.required ? "required" : "";
      if (def.type === "select") {
        const options = def.options.map((option) => `<option value="${option}">${option}</option>`).join("");
        return `
          <div class="field span2">
            <label for="${k}">${def.label}</label>
            <select id="${k}" name="${k}" ${required}>
              <option value="">Pilih ${def.label}</option>
              ${options}
            </select>
          </div>
        `;
      } else {
        return `
          <div class="field span2">
            <label for="${k}">${def.label}</label>
            <input id="${k}" name="${k}" type="${def.type}" maxlength="${def.maxlength || ""}" placeholder="${def.placeholder || ""}" ${required} />
          </div>
        `;
      }
    })
    .join("\n");

  // Special handling for SKPED - add Jenis Perubahan field after standard fields
  if (classification === "SKPED") {
    const def = FIELD_DEFS["jenisPerubahan"];
    if (def && def.type === "select") {
      const options = def.options.map((option) => `<option value="${option}">${option}</option>`).join("");
      dynamicFieldsEl.innerHTML += `
          <div class="field span2">
            <label for="jenisPerubahan">${def.label}</label>
            <select id="jenisPerubahan" name="jenisPerubahan">
              <option value="">Pilih ${def.label}</option>
              ${options}
            </select>
          </div>
        `;
    }
  }

  // Special handling for SKPED - add dynamic fields based on jenisPerubahan selection
  if (classification === "SKPED") {
    const jenisPerubahanSelect = document.getElementById("jenisPerubahan");
    if (jenisPerubahanSelect) {
      // Remove old listener if any
      jenisPerubahanSelect.removeEventListener("change", handleSKPEDChange);
      // Add new listener
      jenisPerubahanSelect.addEventListener("change", handleSKPEDChange);
      // Trigger change to show initial fields if a value is already selected from draft
      if (jenisPerubahanSelect.value) {
        handleSKPEDChange();
      }
    }
  }

  // Special handling for SKBI - add dynamic fields based on jenisPerbandingan selection
  if (classification === "SKBI") {
    const jenisPerbandinganSelect = document.getElementById("jenisPerbandingan");
    if (jenisPerbandinganSelect) {
      // Remove old listener if any
      jenisPerbandinganSelect.removeEventListener("change", handleSKBIChange);
      // Add new listener
      jenisPerbandinganSelect.addEventListener("change", handleSKBIChange);
      // Trigger change to show initial fields if a value is already selected from draft
      if (jenisPerbandinganSelect.value) {
        handleSKBIChange();
      }
    }
  }

  // Special handling for SURAT_MASUK and SURAT_KELUAR - add event listener to kodeKlasifikasi for preview update
  if (classification === "SURAT_MASUK" || classification === "SURAT_KELUAR") {
    const fieldId = classification === "SURAT_MASUK" ? "nomorRegister" : "kodeKlasifikasi";
    const fieldEl = document.getElementById(fieldId);
    if (fieldEl) {
      // Remove old listener if any
      fieldEl.removeEventListener("input", updatePreview);
      // Add new listener
      fieldEl.addEventListener("input", updatePreview);
    }
  }
}

function handleSKPEDChange() {
  const jenisPerubahan = document.getElementById("jenisPerubahan")?.value;
  if (!jenisPerubahan) {
    // Remove dynamic fields if no selection
    const existingDynamic = document.getElementById("skpedDynamicFields");
    if (existingDynamic) existingDynamic.remove();
    return;
  }

  const textFields = ["Nama", "Tempat/Tgl. Lahir", "Alamat"];
  const isTextField = textFields.includes(jenisPerubahan);

  const dropdownFields = {
    "Jenis Kelamin": { label: "Jenis Kelamin", options: ["Laki-Laki", "Perempuan"] },
    "Status Perkawinan": { label: "Status Perkawinan", options: ["Belum Kawin", "Kawin", "Cerai Hidup", "Cerai Mati"] },
    Agama: { label: "Agama", options: ["Islam", "Kristen Protestan", "Katolik", "Hindu", "Buddha", "Konghucu"] },
    Pendidikan: {
      label: "Pendidikan",
      options: ["Tidak/Belum Sekolah", "Belum Tamat SD/Sederajat", "Tamat SD/Sederajat", "SLTP/Sederajat", "SLTA/Sederajat", "Diploma I/II", "Akademi/Diploma III/Sarjana Muda", "Diploma IV/Strata I", "Strata II", "Strata III"],
    },
    Pekerjaan: { label: "Pekerjaan", options: FIELD_DEFS.occupation.options },
  };

  const isDropdownField = jenisPerubahan in dropdownFields;

  let html = '<div id="skpedDynamicFields" class="field span2" style="border-top: 1px solid #ccc; padding-top: 16px; margin-top: 16px;">';

  if (isTextField) {
    html += `
      <div class="field span2">
        <label for="dataSemula">Data Semula</label>
        <input id="dataSemula" name="dataSemula" type="text" maxlength="200" placeholder="Masukkan data yang lama" />
      </div>
      <div class="field span2">
        <label for="dataTerbaru">Data Terbaru</label>
        <input id="dataTerbaru" name="dataTerbaru" type="text" maxlength="200" placeholder="Masukkan data yang baru" />
      </div>
    `;
  } else if (isDropdownField) {
    const fieldDef = dropdownFields[jenisPerubahan];
    const options = fieldDef.options.map((option) => `<option value="${option}">${option}</option>`).join("");
    html += `
      <div class="field span2">
        <label for="dataSemula">Data Semula</label>
        <select id="dataSemula" name="dataSemula">
          <option value="">Pilih ${fieldDef.label} Lama</option>
          ${options}
        </select>
      </div>
      <div class="field span2">
        <label for="dataTerbaru">Data Terbaru</label>
        <select id="dataTerbaru" name="dataTerbaru">
          <option value="">Pilih ${fieldDef.label} Baru</option>
          ${options}
        </select>
      </div>
    `;
  }

  html += "</div>";

  // Remove existing dynamic fields if any
  const existingDynamic = document.getElementById("skpedDynamicFields");
  if (existingDynamic) {
    existingDynamic.remove();
  }

  // Insert the new dynamic fields after the jenisPerubahan select
  const jenisPerubahanField = document.getElementById("jenisPerubahan")?.parentElement;
  if (jenisPerubahanField) {
    jenisPerubahanField.insertAdjacentHTML("afterend", html);
  }
}

function handleSKBIChange() {
  const jenisPerbandingan = document.getElementById("jenisPerbandingan")?.value;
  if (!jenisPerbandingan) {
    // Remove dynamic fields if no selection
    const existingDynamic = document.getElementById("skbiDynamicFields");
    if (existingDynamic) existingDynamic.remove();
    return;
  }

  const documentOptions = ["KTP", "KK", "Akta Kelahiran", "Ijazah", "Buku Nikah"];
  const optionsHtml = documentOptions.map((doc) => `<option value="${doc}">${doc}</option>`).join("");

  let html = '<div id="skbiDynamicFields" class="field span2" style="border-top: 1px solid #ccc; padding-top: 16px; margin-top: 16px;">';

  html += `
    <div class="field span2">
      <label for="pilihDokumenSemula">Pilih Dokumen Perbandingan 1</label>
      <select id="pilihDokumenSemula" name="pilihDokumenSemula">
        <option value="">Pilih Dokumen</option>
        ${optionsHtml}
      </select>
    </div>
    <div class="field span2">
      <label for="pilihDokumenTerbaru">Pilih Dokumen Perbandingan 2</label>
      <select id="pilihDokumenTerbaru" name="pilihDokumenTerbaru">
        <option value="">Pilih Dokumen</option>
        ${optionsHtml}
      </select>
    </div>
    <div id="skbiDataInputFields"></div>
  `;

  html += "</div>";

  // Remove existing dynamic fields if any
  const existingDynamic = document.getElementById("skbiDynamicFields");
  if (existingDynamic) {
    existingDynamic.remove();
  }

  // Insert the new dynamic fields after the jenisPerbandingan select
  const jenisPerbandinganField = document.getElementById("jenisPerbandingan")?.parentElement;
  if (jenisPerbandinganField) {
    jenisPerbandinganField.insertAdjacentHTML("afterend", html);

    // Add event listeners for document selection
    document.getElementById("pilihDokumenSemula")?.addEventListener("change", handleSKBIDataInputChange);
    document.getElementById("pilihDokumenTerbaru")?.addEventListener("change", handleSKBIDataInputChange);

    // Trigger if documents were already selected from draft
    const pilihDokumenSemula = document.getElementById("pilihDokumenSemula")?.value;
    const pilihDokumenTerbaru = document.getElementById("pilihDokumenTerbaru")?.value;
    if (pilihDokumenSemula && pilihDokumenTerbaru) {
      handleSKBIDataInputChange();
    }
  }
}

function handleSKBIDataInputChange() {
  const pilihDokumenSemula = document.getElementById("pilihDokumenSemula")?.value;
  const pilihDokumenTerbaru = document.getElementById("pilihDokumenTerbaru")?.value;
  const jenisPerbandingan = document.getElementById("jenisPerbandingan")?.value;

  // Only show input if both documents are selected
  if (!pilihDokumenSemula || !pilihDokumenTerbaru) {
    const existingInputs = document.getElementById("skbiDataInputFields");
    if (existingInputs) existingInputs.innerHTML = "";
    return;
  }

  const textFields = ["Nama", "Tempat/Tgl. Lahir", "Alamat"];
  const isTextField = textFields.includes(jenisPerbandingan);

  const dropdownFields = {
    "Jenis Kelamin": { label: "Jenis Kelamin", options: ["Laki-Laki", "Perempuan"] },
    "Status Perkawinan": { label: "Status Perkawinan", options: ["Belum Kawin", "Kawin", "Cerai Hidup", "Cerai Mati"] },
    Agama: { label: "Agama", options: ["Islam", "Kristen Protestan", "Katolik", "Hindu", "Buddha", "Konghucu"] },
    Pendidikan: {
      label: "Pendidikan",
      options: ["Tidak/Belum Sekolah", "Belum Tamat SD/Sederajat", "Tamat SD/Sederajat", "SLTP/Sederajat", "SLTA/Sederajat", "Diploma I/II", "Akademi/Diploma III/Sarjana Muda", "Diploma IV/Strata I", "Strata II", "Strata III"],
    },
    Pekerjaan: { label: "Pekerjaan", options: FIELD_DEFS.occupation.options },
  };

  const isDropdownField = jenisPerbandingan in dropdownFields;
  const isNomorIdentitas = jenisPerbandingan === "Nomor Identitas";

  let inputHtml = '<div style="border-top: 1px solid #ddd; margin-top: 16px; padding-top: 16px;">';

  if (isTextField || isNomorIdentitas) {
    inputHtml += `
      <div class="field span2">
        <label for="dataSemula">Data dari ${pilihDokumenSemula}</label>
        <input id="dataSemula" name="dataSemula" type="text" maxlength="200" placeholder="Masukkan data lama" />
      </div>
      <div class="field span2">
        <label for="dataTerbaru">Data dari ${pilihDokumenTerbaru}</label>
        <input id="dataTerbaru" name="dataTerbaru" type="text" maxlength="200" placeholder="Masukkan data baru" />
      </div>
    `;
  } else if (isDropdownField) {
    const fieldDef = dropdownFields[jenisPerbandingan];
    const options = fieldDef.options.map((option) => `<option value="${option}">${option}</option>`).join("");
    inputHtml += `
      <div class="field span2">
        <label for="dataSemula">Data dari ${pilihDokumenSemula}</label>
        <select id="dataSemula" name="dataSemula">
          <option value="">Pilih ${fieldDef.label}</option>
          ${options}
        </select>
      </div>
      <div class="field span2">
        <label for="dataTerbaru">Data dari ${pilihDokumenTerbaru}</label>
        <select id="dataTerbaru" name="dataTerbaru">
          <option value="">Pilih ${fieldDef.label}</option>
          ${options}
        </select>
      </div>
    `;
  }

  inputHtml += "</div>";

  // Update or create the data input fields
  const inputContainer = document.getElementById("skbiDataInputFields");
  if (inputContainer) {
    inputContainer.innerHTML = inputHtml;
  }
}

// Get column info (keys and labels) for displaying a classification's fields
function getDisplayColumns(classification) {
  let fieldKeys = CLASS_FIELDS[classification] || ["fullName", "birthPlaceDate", "occupation", "address"];

  // For SKPED, add jenisPerubahan to display columns (even though it's not in form input)
  if (classification === "SKPED") {
    fieldKeys = [...fieldKeys, "jenisPerubahan"];
  }

  // For SURAT_MASUK and SURAT_KELUAR, exclude kodeKlasifikasi/nomorRegister from display columns
  if (classification === "SURAT_MASUK" || classification === "SURAT_KELUAR") {
    const excludeField = classification === "SURAT_MASUK" ? "nomorRegister" : "kodeKlasifikasi";
    fieldKeys = fieldKeys.filter((k) => k !== excludeField);
  }

  return fieldKeys.map((k) => ({
    key: k,
    label: FIELD_DEFS[k]?.label || k,
  }));
}

function formatDateDdMmYyyy(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || "-";
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

// Extract display value from letter for a given field key
function getFieldValue(letter, fieldKey) {
  if (fieldKey === "fullName") return letter.fullName || "-";
  if (fieldKey === "birthPlaceDate") return letter.birthPlaceDate || "-";
  if (fieldKey === "occupation") return letter.occupation || "-";
  if (fieldKey === "address") return letter.address || "-";
  if (fieldKey === "tanggalKedatangan" || fieldKey === "tanggalKepindahan") {
    return formatDateDdMmYyyy(letter.data?.[fieldKey] || "");
  }
  // All other custom fields come from letter.data
  return letter.data?.[fieldKey] || "-";
}

const LETTER_PRINT_TEMPLATES = {
  SKTMU: {
    title: "SURAT KETERANGAN TIDAK MAMPU",
    intro: "Yang bertanda tangan di bawah ini Kepala Kelurahan Jayawaras Kecamatan Tarogong Kidul Kabupaten Garut, dengan ini menerangkan bahwa:",
    closing:
      "Yang bersangkutan adalah benar warga kami, berdasarkan keterangan dan catatan administrasi kami adalah benar berasal dari <strong><u>Keluarga Tidak Mampu</u></strong>.\n\nSurat keterangan ini diberikan untuk melengkapi persyaratan {{keterangan}}.\n\nDemikian Surat Keterangan ini kami buat dengan sesungguhnya dan untuk dapat dipergunakan sebagaimana mestinya.",
    fieldOrder: ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik"],
    labelOverrides: {
      fullName: "Nama",
      gender: "Jenis Kelamin",
      birthPlaceDate: "Tempat / Tgl.Lahir",
      religion: "Agama",
      maritalStatus: "Status Perkawinan",
      occupation: "Pekerjaan",
      address: "Alamat",
      nik: "NIK",
    },
  },
  DOMISILI: {
    title: "SURAT KETERANGAN DOMISILI",
    intro: "Yang bertanda tangan di bawah ini Kepala Kelurahan Jayawaras Kecamatan Tarogong Kidul Kabupaten Garut, dengan ini menerangkan bahwa:",
    closing:
      "Berdasarkan keterangan dari yang bersangkutan dan atas sepengetahuan kami bahwa benar orang tersebut berdomisili di alamat tersebut.\n\nSurat keterangan ini diberikan untuk melengkapi persyaratan {{keterangan}}.\n\nDemikian Surat Keterangan ini kami buat dengan sesungguhnya dan untuk dapat dipergunakan sebagaimana mestinya.",
    fieldOrder: ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik"],
    labelOverrides: {
      fullName: "Nama",
      gender: "Jenis Kelamin",
      birthPlaceDate: "Tempat / Tgl.Lahir",
      religion: "Agama",
      maritalStatus: "Status Perkawinan",
      occupation: "Pekerjaan",
      address: "Alamat",
      nik: "NIK",
    },
  },
  DOMISILI_LUAR: {
    title: "SURAT KETERANGAN DOMISILI",
    intro: "Yang bertanda tangan di bawah ini Kepala Kelurahan Jayawaras Kecamatan Tarogong Kidul Kabupaten Garut, dengan ini menerangkan bahwa:",
    closing:
      "Berdasarkan keterangan dari yang bersangkutan dan atas sepengetahuan kami bahwa benar orang tersebut di atas {{uraianPekerjaan}} yang berdomisili di {{domisiliSekarang}}.\n\nSurat keterangan ini diberikan untuk melengkapi persyaratan {{keterangan}}.\n\nDemikian Surat Keterangan ini kami buat dengan sesungguhnya dan untuk dapat dipergunakan sebagaimana mestinya.",
    fieldOrder: ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik"],
    labelOverrides: {
      fullName: "Nama",
      gender: "Jenis Kelamin",
      birthPlaceDate: "Tempat / Tgl.Lahir",
      religion: "Agama",
      maritalStatus: "Status Perkawinan",
      occupation: "Pekerjaan",
      address: "Alamat",
      nik: "NIK",
    },
  },
  DOMISILI_PERUSAHAAN: {
    title: "SURAT KETERANGAN DOMISILI PERUSAHAAN",
    intro: "Yang bertanda tangan di bawah ini Kepala Kelurahan Jayawaras Kecamatan Tarogong Kidul Kabupaten Garut, dengan ini menerangkan bahwa:",
    closing:
      "Berdasarkan keterangan dari yang bersangkutan dan atas sepengetahuan kami bahwa benar Perusahaan tersebut di atas berdomisili di alamat tersebut diatas.\n\nSurat keterangan ini diberikan untuk melengkapi persyaratan {{keterangan}}.\n\nDemikian Surat Keterangan ini kami buat dengan sesungguhnya dan untuk dapat dipergunakan sebagaimana mestinya.",
    fieldOrder: ["companyName", "kegiatan", "nib", "skKemenhumkam", "npwp", "companyAddress", "ownerName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik"],
    labelOverrides: {
      companyName: "Nama Perusahaan",
      kegiatan: "Jenis Usaha",
      nib: "NIB",
      skKemenhumkam: "SK KEMENHUMKAM",
      npwp: "NPWP",
      companyAddress: "Alamat Perusahaan",
      ownerName: "Nama Pemilik",
      fullName: "Nama",
      gender: "Jenis Kelamin",
      birthPlaceDate: "Tempat / Tgl.Lahir",
      religion: "Agama",
      maritalStatus: "Status Perkawinan",
      occupation: "Pekerjaan",
      address: "Alamat",
      nik: "NIK",
    },
  },
  BAIK: {
    title: "SURAT KETERANGAN BERKELAKUKAN BAIK",
    intro: "Yang bertanda tangan di bawah ini Kepala Kelurahan Jayawaras Kecamatan Tarogong Kidul Kabupaten Garut, dengan ini menerangkan bahwa:",
    closing:
      "Yang bersangkutan adalah benar warga kami, berdasarkan keterangan dan catatan administrasi kami adalah benar orang tersebut di atas <strong>berkelakuan baik</strong>.\n\nSurat keterangan ini diberikan untuk melengkapi persyaratan {{keterangan}}.\n\nDemikian Surat Keterangan ini kami buat dengan sesungguhnya dan untuk dapat dipergunakan sebagaimana mestinya.",
    fieldOrder: ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik"],
    labelOverrides: {
      fullName: "Nama",
      gender: "Jenis Kelamin",
      birthPlaceDate: "Tempat / Tgl.Lahir",
      religion: "Agama",
      maritalStatus: "Status Perkawinan",
      occupation: "Pekerjaan",
      address: "Alamat",
      nik: "NIK",
    },
  },
  SKBI: {
    title: "SURAT KETERANGAN BEDA IDENTITAS",
    intro: "Yang bertanda tangan di bawah ini Kepala Kelurahan Jayawaras Kecamatan Tarogong Kidul Kabupaten Garut, dengan ini menerangkan bahwa:",
    closing:
      "Yang bersangkutan adalah benar warga kami dan benar orang tersebut di atas Memohon Surat Keterangan Beda Identitas sebagai berikut:\n\n{{skbiComparison}}\n\nDiantara perbedaan tersebut diatas adalah merujuk pada identitas yang sama, dan Identitas yang benar adalah sesuai di {{pilihDokumenTerbaru}}.\n\nDemikian Surat Keterangan ini kami buat dengan sesungguhnya dan untuk dapat dipergunakan sebagaimana mestinya.",
    fieldOrder: ["fullName", "nik", "birthPlaceDate", "gender", "maritalStatus", "religion", "occupation", "address", "jenisPerbandingan"],
    labelOverrides: {
      fullName: "Nama",
      nik: "NIK",
      birthPlaceDate: "Tempat / Tgl.Lahir",
      gender: "Jenis Kelamin",
      maritalStatus: "Status Perkawinan",
      religion: "Agama",
      occupation: "Pekerjaan",
      address: "Alamat",
    },
  },
  SKPED: {
    title: "SURAT KETERANGAN PERUBAHAN ELEMEN DATA",
    intro: "Yang bertanda tangan di bawah ini Kepala Kelurahan Jayawaras Kecamatan Tarogong Kidul Kabupaten Garut, dengan ini menerangkan bahwa:",
    closing:
      "Yang bersangkutan adalah benar warga kami dan yang bersangkutan di atas mengajukan Perubahan Elemen Data {{jenisPerubahan}} yang semula dari {{dataSemula}} menjadi {{dataTerbaru}}.\n\nDemikian Surat Keterangan ini kami buat dengan sesungguhnya dan untuk dapat dipergunakan sebagaimana mestinya.",
    fieldOrder: ["fullName", "nik", "birthPlaceDate", "gender", "maritalStatus", "religion", "occupation", "address", "jenisPerubahan"],
    labelOverrides: {
      fullName: "Nama",
      nik: "NIK",
      birthPlaceDate: "Tempat / Tgl.Lahir",
      gender: "Jenis Kelamin",
      maritalStatus: "Status Perkawinan",
      religion: "Agama",
      occupation: "Pekerjaan",
      address: "Alamat",
      jenisPerubahan: "Jenis Perubahan",
    },
  },
  KEMATIAN: {
    title: "SURAT KETERANGAN KEMATIAN",
    intro: "Yang bertanda tangan di bawah ini Kepala Kelurahan Jayawaras Kecamatan Tarogong Kidul Kabupaten Garut, dengan ini menerangkan bahwa:",
    closing: "Berdasarkan keterangan dari pemohon, bahwa nama tersebut di atas telah meninggal dunia pada :{{deathDetails}}Demikian Surat Keterangan ini kami buat dengan sesungguhnya dan untuk dapat dipergunakan sebagaimana mestinya.",
    fieldOrder: ["fullName", "umur", "gender", "occupation", "address"],
    labelOverrides: {
      fullName: "Nama",
      umur: "Umur",
      gender: "Jenis Kelamin",
      occupation: "Pekerjaan",
      address: "Alamat",
    },
  },
  KELAHIRAN: {
    title: "SURAT KETERANGAN KELAHIRAN",
    intro: "Yang bertanda tangan di bawah ini Kepala Kelurahan Jayawaras Kecamatan Tarogong Kidul Kabupaten Garut, dengan ini menerangkan bahwa:",
    closing: "Dari seorang Ibu :{{motherFields}}Istri dari :{{fatherFields}}Demikian Surat Keterangan ini kami buat dengan sesungguhnya dan untuk dapat dipergunakan sebagaimana mestinya.",
    fieldOrder: ["hari", "tanggal", "pukul", "tempatMeninggal", "anakKe", "gender", "namaAnak"],
    labelOverrides: {
      hari: "Hari",
      tanggal: "Tanggal",
      pukul: "Pukul",
      tempatMeninggal: "Di",
      anakKe: "Telah lahir seorang anak ke",
      gender: "Jenis Kelamin",
      namaAnak: "Yang di beri Nama",
    },
  },
  USAHA: {
    title: "SURAT KETERANGAN USAHA",
    intro: "Yang bertanda tangan di bawah ini Kepala Kelurahan Jayawaras Kecamatan Tarogong Kidul Kabupaten Garut, dengan ini menerangkan bahwa :",
    closing:
      "Berdasarkan keterangan dari yang bersangkutan dan atas sepengetahuan kami bahwa benar orang tersebut mempunyai usaha :{{businessFields}}Surat keterangan ini diberikan untuk melengkapi persyaratan {{keterangan}}.\n\nDemikian Surat Keterangan ini kami buat dengan sesungguhnya dan untuk dapat dipergunakan sebagaimana mestinya.",
    fieldOrder: ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik", "bidangUsaha", "namaUsaha"],
    labelOverrides: {
      fullName: "Nama",
      gender: "Jenis Kelamin",
      birthPlaceDate: "Tempat / Tgl.Lahir",
      religion: "Agama",
      maritalStatus: "Status Perkawinan",
      occupation: "Pekerjaan",
      address: "Alamat",
      nik: "NIK",
      bidangUsaha: "Bidang Usaha",
      namaUsaha: "Nama Usaha",
    },
  },
  SKBM: {
    title: "SURAT KETERANGAN BELUM MENIKAH",
    intro: "Yang bertanda tangan di bawah ini Kepala Kelurahan Jayawaras Kecamatan Tarogong Kidul Kabupaten Garut, dengan ini menerangkan bahwa:",
    closing:
      "Yang bersangkutan adalah benar warga kami, berdasarkan keterangan dan catatan administrasi kami adalah benar sampai saat ini orang tersebut di atas benar <strong>Tidak/Belum Pernah Menikah</strong>.\n\nSurat keterangan ini diberikan untuk melengkapi persyaratan {{keterangan}}.\n\nDemikian Surat Keterangan ini kami buat dengan sesungguhnya dan untuk dapat dipergunakan sebagaimana mestinya.",
    fieldOrder: ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik"],
    labelOverrides: {
      fullName: "Nama",
      gender: "Jenis Kelamin",
      birthPlaceDate: "Tempat / Tgl.Lahir",
      religion: "Agama",
      maritalStatus: "Status Perkawinan",
      occupation: "Pekerjaan",
      address: "Alamat",
      nik: "NIK",
    },
  },
  SKBMR: {
    title: "SURAT KETERANGAN BELUM MEMILIKI RUMAH",
    intro: "Yang bertanda tangan di bawah ini Kepala Kelurahan Jayawaras Kecamatan Tarogong Kidul Kabupaten Garut, dengan ini menerangkan bahwa:",
    closing:
      "Yang bersangkutan adalah benar warga kami, berdasarkan keterangan dan catatan administrasi kami adalah benar sampai saat ini orang tersebut di atas benar <strong>Belum Memiliki Rumah</strong>.\n\nSurat keterangan ini diberikan untuk melengkapi persyaratan {{keterangan}}.\n\nDemikian Surat Keterangan ini kami buat dengan sesungguhnya dan untuk dapat dipergunakan sebagaimana mestinya.",
    fieldOrder: ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik"],
    labelOverrides: {
      fullName: "Nama",
      gender: "Jenis Kelamin",
      birthPlaceDate: "Tempat / Tgl.Lahir",
      religion: "Agama",
      maritalStatus: "Status Perkawinan",
      occupation: "Pekerjaan",
      address: "Alamat",
      nik: "NIK",
    },
  },
  PEMAKAMAN: {
    title: "SURAT KETERANGAN PEMAKAMAN",
    intro: "Yang bertanda tangan di bawah ini Kepala Kelurahan Jayawaras Kecamatan Tarogong Kidul Kabupaten Garut, dengan ini menerangkan bahwa:",
    closing: "Telah meninggal dunia pada :{{deathDetails}}Di makamkan pada :{{burialDetails}}Surat keterangan ini diberikan untuk melengkapi persyaratan {{keterangan}}.",
    closingFinal: "Demikian Surat Keterangan ini kami buat dengan sesungguhnya dan untuk dapat dipergunakan sebagaimana mestinya.",
    fieldOrder: ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address"],
    labelOverrides: {
      fullName: "Nama",
      gender: "Jenis Kelamin",
      birthPlaceDate: "Tempat / Tgl.Lahir",
      religion: "Agama",
      maritalStatus: "Status Perkawinan",
      occupation: "Pekerjaan",
      address: "Alamat",
    },
  },
  PERTANAHAN: {
    title: "SURAT KETERANGAN TANAH",
    intro: "Yang bertanda tangan di bawah ini Kepala Kelurahan Jayawaras Kecamatan Tarogong Kidul Kabupaten Garut, dengan ini menerangkan bahwa:",
    closing:
      "Yang bersangkutan adalah benar warga kami, berdasarkan keterangan dan catatan administrasi kami adalah benar yang bersangkutan menuasai/memiliki sebidang tanah yang terletak di:\n\n{{pertanahanData}}\n\nTanah tersebut diperoleh dari {{pemilikTanahSebelumnya}} pada tahun {{tahunKepemilikan}} dengan cara {{jenisMemperoelTanah}} dan sampai saat ini tidak dalam sengketa.\n\nDemikian Surat Keterangan ini kami buat dengan sesungguhnya dan untuk dapat dipergunakan sebagaimana mestinya.",
    fieldOrder: ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik"],
    labelOverrides: {
      fullName: "Nama",
      gender: "Jenis Kelamin",
      birthPlaceDate: "Tempat / Tgl.Lahir",
      religion: "Agama",
      maritalStatus: "Status Perkawinan",
      occupation: "Pekerjaan",
      address: "Alamat",
      nik: "NIK",
    },
  },
  SKTHT: {
    title: "SURAT KETERANGAN TAKSIRAN HARGA TANAH",
    intro: "Yang bertanda tangan di bawah ini Kepala Kelurahan Jayawaras Kecamatan Tarogong Kidul Kabupaten Garut, dengan ini menerangkan bahwa:",
    closing: "Dengan taksiran harga tanah tersebut diatas pada saat ini sebagai berikut:\n\n{{skthtCalculation}}\n\nDemikian Surat Keterangan ini kami buat dengan sesungguhnya dan untuk dapat dipergunakan sebagaimana mestinya.",
    fieldOrder: ["fullName", "address", "nopTanah", "blokTanah", "terleatakTanah"],
    labelOverrides: {
      fullName: "Nama",
      address: "Alamat",
      nopTanah: "NOP",
      blokTanah: "Blok",
      terleatakTanah: "Terletak",
    },
  },
  PENGHASILAN: {
    title: "SURAT KETERANGAN PENGHASILAN",
    intro: "Yang bertanda tangan di bawah ini Kepala Kelurahan Jayawaras Kecamatan Tarogong Kidul Kabupaten Garut, dengan ini menerangkan bahwa:",
    closing:
      "Yang bersangkutan adalah benar warga kami, berdasarkan keterangan dan catatan administrasi kami adalah benar yang bersangkutan memiliki penghasilan tetap sebesar {{jumlahPenghasilan}}.\n\nSurat keterangan ini diberikan untuk melengkapi persyaratan {{keterangan}}.\n\nDemikian Surat Keterangan ini kami buat dengan sesungguhnya dan untuk dapat dipergunakan sebagaimana mestinya.",
    fieldOrder: ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik"],
    labelOverrides: {
      fullName: "Nama",
      gender: "Jenis Kelamin",
      birthPlaceDate: "Tempat / Tgl.Lahir",
      religion: "Agama",
      maritalStatus: "Status Perkawinan",
      occupation: "Pekerjaan",
      address: "Alamat",
      nik: "NIK",
    },
  },
  WALI: {
    title: "SURAT KETERANGAN WALI",
    intro: "Yang bertanda tangan di bawah ini Kepala Kelurahan Jayawaras Kecamatan Tarogong Kidul Kabupaten Garut, dengan ini menerangkan bahwa:",
    closing: "Adalah benar wali dari :",
    closingFinal: "Surat keterangan ini diberikan untuk melengkapi persyaratan {{keterangan}}.\n\nDemikian Surat Keterangan ini kami buat dengan sesungguhnya dan untuk dapat dipergunakan sebagaimana mestinya.",
    fieldOrder: [],
    labelOverrides: {
      fullName: "Nama",
      gender: "Jenis Kelamin",
      birthPlaceDate: "Tempat / Tgl.Lahir",
      religion: "Agama",
      maritalStatus: "Status Perkawinan",
      occupation: "Pekerjaan",
      address: "Alamat",
      nik: "NIK",
      namaAnak: "Nama",
      anakJenisKelamin: "Jenis Kelamin",
      anakBirthPlaceDate: "Tempat, Tgl. Lahir",
      anakAgama: "Agama",
      anakNik: "NIK",
    },
  },
  SKTMS: {
    title: "SURAT KETERANGAN TIDAK MAMPU SEKOLAH",
    intro: "Yang bertanda tangan di bawah ini Kepala Kelurahan Jayawaras Kecamatan Tarogong Kidul Kabupaten Garut, dengan ini menerangkan bahwa:",
    closing: "Adalah benar orangtua/wali dari :",
    closingFinal:
      "Yang bersangkutan adalah benar warga kami, berdasarkan keterangan dan catatan administrasi kami adalah benar berasal dari <strong><u>Keluarga Tidak Mampu</u></strong>.\n\nSurat keterangan ini diberikan untuk melengkapi persyaratan {{keterangan}}.\n\nDemikian Surat Keterangan ini kami buat dengan sesungguhnya dan untuk dapat dipergunakan sebagaimana mestinya.",
    fieldOrder: [],
    labelOverrides: {
      fullName: "Nama",
      gender: "Jenis Kelamin",
      birthPlaceDate: "Tempat / Tgl.Lahir",
      religion: "Agama",
      maritalStatus: "Status Perkawinan",
      occupation: "Pekerjaan",
      address: "Alamat",
      nik: "NIK",
      namaAnak: "Nama",
      anakJenisKelamin: "Jenis Kelamin",
      anakBirthPlaceDate: "Tempat, Tgl. Lahir",
      anakAgama: "Agama",
      anakNik: "NIK",
    },
  },
  MENIKAH: {
    title: "SURAT KETERANGAN MENIKAH",
    intro: "Yang bertanda tangan di bawah ini Kepala Kelurahan Jayawaras Kecamatan Tarogong Kidul Kabupaten Garut, dengan ini menerangkan bahwa:",
    closing: "Adalah benar akan melangsungkan pernikahan dengan :",
    closingFinal: "Surat keterangan ini diberikan untuk melengkapi persyaratan {{keterangan}}.\n\nDemikian Surat Keterangan ini kami buat dengan sesungguhnya dan untuk dapat dipergunakan sebagaimana mestinya.",
    fieldOrder: [],
    labelOverrides: {
      fullName: "Nama",
      birthPlaceDate: "Tempat, Tgl. Lahir",
      occupation: "Pekerjaan",
      address: "Alamat",
      nik: "NIK",
      calonName: "Nama",
      calonBirthPlaceDate: "Tempat, Tgl. Lahir",
      calonOccupation: "Pekerjaan",
      calonAddress: "Alamat",
      calonNik: "NIK",
    },
  },
  SUIS: {
    title: "SURAT KETERANGAN SUAMI-ISTRI",
    intro: "Yang bertanda tangan di bawah ini Kepala Kelurahan Jayawaras Kecamatan Tarogong Kidul Kabupaten Garut, dengan ini menerangkan bahwa:",
    closing:
      "Berdasarkan data yang ada dan menurut pengakuan dari keluarganya bahwa kedua orang tersebut diatas Adalah <strong>Pasangan Suami Istri</strong>, yang telah melaksanakan pernikahan pada {{tanggalMenikah}}, adapun pernikahan tersebut Tidak/Belum tercatat di Kantor Urusan Agama Kecamatan Tarogong Kidul Kabupaten Garut.\n\nDemikian surat Keterangan ini dibuat untuk diketahui dan dipergunakan sebagimana mestinya.",
    fieldOrder: [],
    labelOverrides: {
      suamiFullName: "Nama",
      suamiBirthPlaceDate: "Tempat, Tgl. Lahir",
      suamiOccupation: "Pekerjaan",
      suamiAddress: "Alamat",
      suamiNik: "NIK",
      isriFullName: "Nama",
      isriBirthPlaceDate: "Tempat, Tgl. Lahir",
      isriOccupation: "Pekerjaan",
      isriAddress: "Alamat",
      isriNik: "NIK",
      tanggalMenikah: "Tanggal Pernikahan",
    },
  },
  DATANG: {
    title: "SURAT KETERANGAN DATANG",
    intro: "Yang bertanda tangan di bawah ini Kepala Kelurahan Jayawaras Kecamatan Tarogong Kidul Kabupaten Garut, dengan ini menerangkan bahwa:",
    closing:
      "Yang bersangkutan adalah benar-benar warga kami yang datang dari alamat tersebut di atas ke alamat lain.\n\nSurat keterangan datang ini diberikan untuk melengkapi persyaratan kedatangan.\n\nDemikian Surat Keterangan Datang ini kami buat dengan sesungguhnya dan untuk dapat dipergunakan sebagaimana mestinya.",
    fieldOrder: ["fullName", "nik", "namaKepalaKeluarga", "noKK", "alamatAsal", "alamatTujuan", "klasifikasiKepindahan", "jenisKepindahan", "jumlahKeluargaPindah", "tanggalKedatangan", "keterangan"],
    labelOverrides: {
      noKK: "Nomor Kartu Keluarga",
      fullName: "Nama Lengkap",
      nik: "NIK",
      klasifikasiKepindahan: "Klasifikasi Kedatangan",
      jenisKepindahan: "Jenis Kedatangan",
      jumlahKeluargaPindah: "Jumlah Anggota Keluarga Yang Datang",
      tanggalKedatangan: "Tanggal Kedatangan",
    },
  },
  PINDAH: {
    title: "SURAT KETERANGAN PINDAH",
    intro: "Yang bertanda tangan di bawah ini Kepala Kelurahan Jayawaras Kecamatan Tarogong Kidul Kabupaten Garut, dengan ini menerangkan bahwa:",
    closing:
      "Yang bersangkutan adalah benar-benar warga kami yang pindah dari alamat tersebut di atas ke alamat lain.\n\nSurat keterangan pindah ini diberikan untuk melengkapi persyaratan kepindahan.\n\nDemikian Surat Keterangan Pindah ini kami buat dengan sesungguhnya dan untuk dapat dipergunakan sebagaimana mestinya.",
    fieldOrder: ["fullName", "nik", "namaKepalaKeluarga", "noKK", "alamatAsal", "alamatTujuan", "klasifikasiKepindahan", "jenisKepindahan", "jumlahKeluargaPindah", "tanggalKepindahan", "keterangan"],
    labelOverrides: {
      noKK: "Nomor Kartu Keluarga",
      fullName: "Nama Lengkap",
      nik: "NIK",
      jenisPermohonan: "Jenis Permohonan",
      desaAsal: "Desa/Kel",
      kecAsal: "Kec",
      kabAsal: "Kab/Kota",
      provAsal: "Provinsi",
      posAsal: "Kode Pos",
      klasifikasiKepindahan: "Klasifikasi Kepindahan",
      desaPindah: "Desa/Kel",
      kecPindah: "Kec",
      kabPindah: "Kab/Kota",
      provPindah: "Provinsi",
      posPindah: "Kode Pos",
      alasanPindah: "Alasan Pindah",
      jenisKepindahan: "Jenis Kepindahan",
      anggotaTakPindah: "Anggota Tak Pindah",
      anggotaYangPindah: "Anggota Yang Pindah",
      jumlahKeluargaPindah: "Jumlah Anggota Keluarga Yang Pindah",
      rencanaPindahan: "Rencana Kepindahan (Tanggal)",
      tanggalKepindahan: "Tanggal Kepindahan",
    },
  },
  UMUM: {
    title: "SURAT KETERANGAN",
    intro: "Yang bertanda tangan di bawah ini Kepala Kelurahan Jayawaras Kecamatan Tarogong Kidul Kabupaten Garut, dengan ini menerangkan bahwa:",
    closing:
      "Yang bersangkutan adalah benar warga kami, dan benar orang tersebut di atas {{jenisPermohonan}}.\n\nSurat keterangan ini diberikan untuk melengkapi persyaratan {{keterangan}}.\n\nDemikian Surat Keterangan ini kami buat dengan sesungguhnya dan untuk dapat dipergunakan sebagaimana mestinya.",
    fieldOrder: ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik"],
    labelOverrides: {
      fullName: "Nama",
      gender: "Jenis Kelamin",
      birthPlaceDate: "Tempat / Tgl.Lahir",
      religion: "Agama",
      maritalStatus: "Status Perkawinan",
      occupation: "Pekerjaan",
      address: "Alamat",
      nik: "NIK",
    },
  },
  BANK: {
    title: "SURAT KETERANGAN BANK",
    intro: "Yang bertanda tangan di bawah ini Kepala Kelurahan Jayawaras Kecamatan Tarogong Kidul Kabupaten Garut, dengan ini menerangkan bahwa:",
    closing:
      "Berdasarkan keterangan dari yang bersangkutan dan atas sepengetahuan kami bahwa benar orang tersebut sebagaimana tersebut di atas adalah warga kami.\n\nSurat keterangan ini diberikan untuk melengkapi persyaratan {{keterangan}}.\n\nDemikian Surat Keterangan ini kami buat dengan sesungguhnya dan untuk dapat dipergunakan sebagaimana mestinya.",
    fieldOrder: ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik"],
    labelOverrides: {
      fullName: "Nama",
      gender: "Jenis Kelamin",
      birthPlaceDate: "Tempat / Tgl.Lahir",
      religion: "Agama",
      maritalStatus: "Status Perkawinan",
      occupation: "Pekerjaan",
      address: "Alamat",
      nik: "NIK",
    },
  },
};

function getPrintTemplate(classification) {
  return (
    LETTER_PRINT_TEMPLATES[classification] || {
      title: `SURAT KETERANGAN ${String(CLASS_LABEL[classification] || "")
        .replace(/^Surat Keterangan\s*/i, "")
        .trim()
        .toUpperCase()}`.trim(),
      intro: "Yang bertanda tangan di bawah ini Kepala Kelurahan Jayawaras Kecamatan Tarogong Kidul Kabupaten Garut, dengan ini menerangkan bahwa:",
      closing: "Surat keterangan ini diberikan untuk melengkapi persyaratan dan sepengetahuan kami benar-benar sesuai dengan keadaan yang sebenarnya.",
      fieldOrder: CLASS_FIELDS[classification] || ["fullName", "birthPlaceDate", "occupation", "address", "keterangan"],
      labelOverrides: {
        fullName: "Nama",
        birthPlaceDate: "Tempat, Tanggal Lahir",
        occupation: "Pekerjaan",
        address: "Alamat",
        keterangan: "Keperluan",
        tanggalKedatangan: "Tanggal Kedatangan",
        tanggalKepindahan: "Tanggal Kepindahan",
      },
    }
  );
}

// Helper function to wrap multiple paragraphs with closing class
function wrapMultipleParagraphs(text) {
  // Split by double newlines to separate paragraphs
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  return paragraphs
    .map((para) => {
      const trimmed = para.trim();
      // Center align paragraphs starting with "1. Di" or "2. Di" without text indent
      const isCentered = /^[12]\.\s*Di\s*/.test(trimmed);
      const style = isCentered ? ' style="text-align: center; text-indent: 0; font-size: 14px;"' : ' style="font-size: 14px;"';
      return `<p class="closing"${style}>${trimmed}</p>`;
    })
    .join("");
}

function buildPrintLetterHtml(letter) {
  const template = getPrintTemplate(letter.classification);
  const letterTitle = template.title || "SURAT KETERANGAN";
  const labelOverrides = template.labelOverrides || {};
  const isUsaha = letter.classification === "USAHA";
  const isKematian = letter.classification === "KEMATIAN";
  const isKelahiran = letter.classification === "KELAHIRAN";
  const isSuis = letter.classification === "SUIS";
  const isWali = letter.classification === "WALI";
  const isMenikah = letter.classification === "MENIKAH";
  const isSktms = letter.classification === "SKTMS";
  const isSkbi = letter.classification === "SKBI";
  const isPertanahan = letter.classification === "PERTANAHAN";
  const usaPersonalFields = ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik"];
  const usaBusinessFields = ["bidangUsaha", "namaUsaha"];
  const kematianDeathFields = ["hari", "tanggal", "tempatMeninggal", "diSebabkan"];
  const kelahiranChildFields = ["hari", "tanggal", "pukul", "tempatMeninggal", "anakKe", "gender", "namaAnak"];
  const kelahiranMotherFields = ["namaIbu", "birthPlaceDateIbu", "religionIbu", "occupationIbu"];
  const kelahiranFatherFields = ["namaAyah", "birthPlaceDateAyah", "religionAyah", "occupationAyah", "addressAyah"];
  const pertanahanPersonalFields = ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik"];
  let fieldKeys = isUsaha ? usaPersonalFields : isKelahiran ? kelahiranChildFields : template.fieldOrder || CLASS_FIELDS[letter.classification] || ["fullName", "birthPlaceDate", "occupation", "address", "keterangan"];
  if (letter.classification === "DOMISILI_PERUSAHAAN") {
    const companyAddressIndex = fieldKeys.indexOf("companyAddress");
    if (companyAddressIndex !== -1 && fieldKeys[companyAddressIndex + 1] !== "__sectionDivider__") {
      fieldKeys = [...fieldKeys.slice(0, companyAddressIndex + 1), "__sectionDivider__", ...fieldKeys.slice(companyAddressIndex + 1)];
    }
  }

  const renderFieldRows = (keys, boldKeys = []) => {
    const boldSet = new Set(boldKeys);
    return keys
      .map((key) => {
        if (key === "__sectionDivider__") {
          return `
        <div style="height: 12px; margin: 6px 0;"></div>`;
        }
        const label = labelOverrides[key] || FIELD_DEFS[key]?.label || key;
        const value = getFieldValue(letter, key);
        const shouldBold = boldSet.has(key) || /\bNama\b/i.test(label);
        const valueHtml = shouldBold ? `<strong>${escapeHtml(value)}</strong>` : escapeHtml(value);
        return `
        <div class="field-row">
          <span class="field-label">${label}</span>
          <span class="field-value">${valueHtml}</span>
        </div>`;
      })
      .join("");
  };

  // Helper to render business fields with center alignment
  const renderBusinessFields = (keys) => {
    return keys
      .map((key) => {
        const label = labelOverrides[key] || FIELD_DEFS[key]?.label || key;
        const value = getFieldValue(letter, key);
        const shouldBold = /\bNama\b/i.test(label);
        const valueHtml = shouldBold ? `<strong>${escapeHtml(value)}</strong>` : escapeHtml(value);
        return `
        <div class="field-row">
          <span class="field-label">${label}</span>
          <span class="field-value">${valueHtml}</span>
        </div>`;
      })
      .join("");
  };

  const birthBoldKeys = ["hari", "tanggal", "pukul", "tempatMeninggal", "namaAnak", "namaIbu", "namaAyah"];
  const fieldsHtml = isSuis || isWali || isMenikah || isSktms || isSkbi || isPertanahan ? "" : renderFieldRows(fieldKeys, isKelahiran ? birthBoldKeys : []);
  const businessFieldsHtml = isUsaha ? renderBusinessFields(usaBusinessFields) : "";
  const deathDetailsHtml = isKematian ? renderFieldRows(kematianDeathFields) : "";
  const motherFieldsHtml = isKelahiran ? renderFieldRows(kelahiranMotherFields, birthBoldKeys) : "";
  const fatherFieldsHtml = isKelahiran ? renderFieldRows(kelahiranFatherFields, birthBoldKeys) : "";
  const pertanahanPersonalHtml = isPertanahan ? renderFieldRows(pertanahanPersonalFields) : "";

  // For PEMAKAMAN, render death and burial details with field-row format
  const isPemakaman = letter.classification === "PEMAKAMAN";
  const deathDetailsFieldsHtml = isPemakaman ? renderFieldRows(["hari", "tanggal"]) : "";
  const burialDetailsFieldsHtml = isPemakaman ? renderFieldRows(["hari", "tanggal", "pukul", "tempatPemakaman"]) : "";

  // For SUIS, render suami and istri data separately
  const suamiFields = ["suamiFullName", "suamiBirthPlaceDate", "suamiOccupation", "suamiAddress", "suamiNik"];
  const isriFields = ["isriFullName", "isriBirthPlaceDate", "isriOccupation", "isriAddress", "isriNik"];
  const suamiHtml = isSuis ? renderFieldRows(suamiFields) : "";
  const isriHtml = isSuis ? renderFieldRows(isriFields) : "";

  // For WALI, render wali and child data separately
  const waliFields = ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik"];
  const anakFields = ["namaAnak", "anakJenisKelamin", "anakBirthPlaceDate", "anakAgama", "anakNik"];
  const waliHtml = isWali ? renderFieldRows(waliFields) : "";
  const anakHtml = isWali ? renderFieldRows(anakFields) : "";

  // For MENIKAH, render personal and calon data separately
  const menikahPersonalFields = ["fullName", "birthPlaceDate", "occupation", "address", "nik"];
  const menikahCalonFields = ["calonName", "calonBirthPlaceDate", "calonOccupation", "calonAddress", "calonNik"];
  const menikahPersonalHtml = isMenikah ? renderFieldRows(menikahPersonalFields) : "";
  const menikahCalonHtml = isMenikah ? renderFieldRows(menikahCalonFields) : "";

  // For SKTMS, render parent and child data separately
  const sktmsParentFields = ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik"];
  const sktmsChildFields = ["namaAnak", "anakJenisKelamin", "anakBirthPlaceDate", "anakAgama", "anakNik"];
  const sktmsParentHtml = isSktms ? renderFieldRows(sktmsParentFields) : "";
  const sktmsChildHtml = isSktms ? renderFieldRows(sktmsChildFields) : "";

  const printDate = formatDate(letter.letter_date) || formatDate(new Date().toISOString().slice(0, 10));
  const letterNumber = letter.register_display || "-";
  let closingText = template.closing;
  if (
    letter.classification === "SKTMU" ||
    letter.classification === "DOMISILI" ||
    letter.classification === "DOMISILI_PERUSAHAAN" ||
    letter.classification === "USAHA" ||
    letter.classification === "BAIK" ||
    letter.classification === "SKBM" ||
    letter.classification === "SKBMR" ||
    letter.classification === "BANK"
  ) {
    const keterangan = getFieldValue(letter, "keterangan") || "";
    closingText = closingText.replace("{{keterangan}}", `<strong>${escapeHtml(keterangan)}</strong>`);
  }
  if (letter.classification === "UMUM") {
    const jenisPermohonan = getFieldValue(letter, "jenisPermohonan") || "";
    const keterangan = getFieldValue(letter, "keterangan") || "";
    closingText = closingText.replace("{{jenisPermohonan}}", `<strong>${escapeHtml(jenisPermohonan)}</strong>`).replace("{{keterangan}}", `<strong>${escapeHtml(keterangan)}</strong>`);
  }
  if (letter.classification === "DOMISILI_LUAR") {
    const uraianPekerjaan = getFieldValue(letter, "uraianPekerjaan") || "";
    const domisiliSekarang = getFieldValue(letter, "domisiliSekarang") || "";
    const keterangan = getFieldValue(letter, "keterangan") || "";
    closingText = closingText
      .replace("{{uraianPekerjaan}}", `<strong>${escapeHtml(uraianPekerjaan)}</strong>`)
      .replace("{{domisiliSekarang}}", `<strong>${escapeHtml(domisiliSekarang)}</strong>`)
      .replace("{{keterangan}}", `<strong>${escapeHtml(keterangan)}</strong>`);
  }
  if (letter.classification === "SKPED") {
    const jenisPerubahan = getFieldValue(letter, "jenisPerubahan") || "";
    const dataSemula = getFieldValue(letter, "dataSemula") || "";
    const dataTerbaru = getFieldValue(letter, "dataTerbaru") || "";
    closingText = closingText
      .replace("{{jenisPerubahan}}", `<strong>${escapeHtml(jenisPerubahan)}</strong>`)
      .replace("{{dataSemula}}", `<strong>${escapeHtml(dataSemula)}</strong>`)
      .replace("{{dataTerbaru}}", `<strong>${escapeHtml(dataTerbaru)}</strong>`);
  }
  if (letter.classification === "PENGHASILAN") {
    const jumlahPenghasilan = getFieldValue(letter, "jumlahPenghasilan") || "";
    const keterangan = getFieldValue(letter, "keterangan") || "";
    closingText = closingText.replace("{{jumlahPenghasilan}}", `<strong>${escapeHtml(jumlahPenghasilan)}</strong>`).replace("{{keterangan}}", `<strong>${escapeHtml(keterangan)}</strong>`);
  }
  if (letter.classification === "SUIS") {
    const tanggalMenikah = getFieldValue(letter, "tanggalMenikah") || "";
    closingText = closingText.replace("{{tanggalMenikah}}", `<strong>${escapeHtml(tanggalMenikah)}</strong>`);
  }
  if (letter.classification === "PERTANAHAN") {
    const alamatTanah = getFieldValue(letter, "alamatTanah") || "";
    const luas = getFieldValue(letter, "luas") || "";
    const utara = getFieldValue(letter, "utara") || "";
    const selatan = getFieldValue(letter, "selatan") || "";
    const timur = getFieldValue(letter, "timur") || "";
    const barat = getFieldValue(letter, "barat") || "";
    const pemilikTanahSebelumnya = getFieldValue(letter, "pemilikTanahSebelumnya") || "";
    const tahunKepemilikan = getFieldValue(letter, "tahunKepemilikan") || "";
    const jenisMemperoelTanah = getFieldValue(letter, "jenisMemperoelTanah") || "";

    // Create formatted land data with proper alignment
    const pertanahanDataHtml = `
    <div style="display: flex; margin: 4px 0; font-size: 14px;">
      <span style="width: 190px;">Alamat</span>
      <span style="flex: 1;">: <strong>${escapeHtml(alamatTanah)}</strong></span>
    </div>
    <div style="display: flex; margin: 4px 0; font-size: 14px;">
      <span style="width: 190px;">Luas</span>
      <span style="flex: 1;">: ± <strong>${escapeHtml(luas)}</strong></span>
    </div>
    <div style="margin: 8px 0; font-size: 14px;">Dengan batas-batas sebagai berikut:</div>
    <div style="display: flex; margin: 4px 0; font-size: 14px;">
      <span style="width: 190px;">Sebelah Utara</span>
      <span style="flex: 1;">: <strong>${escapeHtml(utara)}</strong></span>
    </div>
    <div style="display: flex; margin: 4px 0; font-size: 14px;">
      <span style="width: 190px;">Sebelah Selatan</span>
      <span style="flex: 1;">: <strong>${escapeHtml(selatan)}</strong></span>
    </div>
    <div style="display: flex; margin: 4px 0; font-size: 14px;">
      <span style="width: 190px;">Sebelah Timur</span>
      <span style="flex: 1;">: <strong>${escapeHtml(timur)}</strong></span>
    </div>
    <div style="display: flex; margin: 4px 0; font-size: 14px;">
      <span style="width: 190px;">Sebelah Barat</span>
      <span style="flex: 1;">: <strong>${escapeHtml(barat)}</strong></span>
    </div>`;

    closingText = closingText
      .replace("{{pertanahanData}}", pertanahanDataHtml)
      .replace("{{pemilikTanahSebelumnya}}", `<strong>${escapeHtml(pemilikTanahSebelumnya)}</strong>`)
      .replace("{{tahunKepemilikan}}", `<strong>${escapeHtml(tahunKepemilikan)}</strong>`)
      .replace("{{jenisMemperoelTanah}}", `<strong>${escapeHtml(jenisMemperoelTanah)}</strong>`);
  }
  if (letter.classification === "SKTHT") {
    const nopTanah = getFieldValue(letter, "nopTanah") || "";
    const blokTanah = getFieldValue(letter, "blokTanah") || "";
    const terleatakTanah = getFieldValue(letter, "terleatakTanah") || "";
    const luasTanahSKTHT = getFieldValue(letter, "luasTanahSKTHT") || "";
    const hargaTanah = getFieldValue(letter, "hargaTanah") || "";
    const luasBangunan = getFieldValue(letter, "luasBangunan") || "";
    const hargaBangunan = getFieldValue(letter, "hargaBangunan") || "";

    // Create formatted land and building data with proper alignment
    const skthtDataHtml = `
    <div style="display: flex; margin: 4px 0; font-size: 14px;">
      <span style="width: 190px;">Nama Pemilik Tanah</span>
      <span style="flex: 1;">: <strong>${escapeHtml(getFieldValue(letter, "fullName") || "")}</strong></span>
    </div>
    <div style="display: flex; margin: 4px 0; font-size: 14px;">
      <span style="width: 190px;">Alamat</span>
      <span style="flex: 1;">: <strong>${escapeHtml(getFieldValue(letter, "address") || "")}</strong></span>
    </div>
    <div style="display: flex; margin: 4px 0; font-size: 14px;">
      <span style="width: 190px;">NOP</span>
      <span style="flex: 1;">: <strong>${escapeHtml(nopTanah)}</strong></span>
    </div>
    <div style="display: flex; margin: 4px 0; font-size: 14px;">
      <span style="width: 190px;">Blok</span>
      <span style="flex: 1;">: <strong>${escapeHtml(blokTanah)}</strong></span>
    </div>
    <div style="display: flex; margin: 4px 0; font-size: 14px;">
      <span style="width: 190px;">Terletak</span>
      <span style="flex: 1;">: <strong>${escapeHtml(terleatakTanah)}</strong></span>
    </div>
    <div style="display: flex; margin: 4px 0; font-size: 14px;">
      <span style="width: 15px;">Luas Tanah</span>
      <span style="flex: 1;">: <strong>${escapeHtml(luasTanahSKTHT)}</strong></span>
    </div>
    <div style="display: flex; margin: 4px 0; font-size: 14px;">
      <span style="width: 190px;">Harga Tanah</span>
      <span style="flex: 1;">: <strong>${escapeHtml(hargaTanah)}</strong></span>
    </div>
    <div style="display: flex; margin: 4px 0; font-size: 14px;">
      <span style="width: 15px;">Luas Bangunan</span>
      <span style="flex: 1;">: <strong>${escapeHtml(luasBangunan)}</strong></span>
    </div>
    <div style="display: flex; margin: 4px 0; font-size: 14px;">
      <span style="width: 190px;">Harga Bangunan</span>
      <span style="flex: 1;">: <strong>${escapeHtml(hargaBangunan)}</strong></span>
    </div>`;

    // Extract numeric values for calculation (handle currency format with thousand separators)
    const parseNumberValue = (str) => {
      if (!str) return 0;
      // Remove all non-numeric, non-separator characters (letters, Rp, etc)
      let cleaned = str.replace(/[^0-9.,]/g, "");
      // If contains multiple periods, period is thousand separator, so remove them
      const dotCount = (cleaned.match(/\./g) || []).length;
      if (dotCount > 1) {
        cleaned = cleaned.replace(/\./g, ""); // Remove thousand separators (periods)
      }
      // Replace comma with period for decimal
      cleaned = cleaned.replace(",", ".");
      return parseFloat(cleaned) || 0;
    };

    const luasTanNum = parseNumberValue(luasTanahSKTHT);
    const hargaTanNum = parseNumberValue(hargaTanah);
    const luasBgnNum = parseNumberValue(luasBangunan);
    const hargaBgnNum = parseNumberValue(hargaBangunan);

    // Calculate totals
    const totalTanah = luasTanNum * hargaTanNum;
    const totalBangunan = luasBgnNum * hargaBgnNum;

    // Format numbers as currency Rp.
    const formatCurrency = (num) => {
      return "Rp. " + Math.round(num).toLocaleString("id-ID") + ",-";
    };

    // Create calculation display
    const skthtCalculationHtml1 = `1. Luas Tanah <strong>${escapeHtml(luasTanahSKTHT)}</strong> x <strong>${escapeHtml(hargaTanah)}</strong> per meter = <strong>${formatCurrency(totalTanah)}</strong>`;
    const skthtCalculationHtml2 = `2. Luas Bangunan <strong>${escapeHtml(luasBangunan)}</strong> x <strong>${escapeHtml(hargaBangunan)}</strong> per meter = <strong>${formatCurrency(totalBangunan)}</strong>`;
    const skthtCalculationHtml = skthtCalculationHtml1 + "\n\n" + skthtCalculationHtml2;

    closingText = closingText.replace("{{skthtData}}", skthtDataHtml).replace("{{skthtCalculation}}", skthtCalculationHtml);
  }
  if (letter.classification === "SKBI") {
    const pilihDokumenSemula = getFieldValue(letter, "pilihDokumenSemula") || "";
    const dataSemula = getFieldValue(letter, "dataSemula") || "";
    const pilihDokumenTerbaru = getFieldValue(letter, "pilihDokumenTerbaru") || "";
    const dataTerbaru = getFieldValue(letter, "dataTerbaru") || "";

    // Create formatted comparison with proper alignment
    const skbiComparisonHtml = `<div style="display: flex; margin: 4px 0; font-size: 14px;">
      <span style="width: 15px;">1.</span>
      <span style="width: 15px;">Di</span>
      <span style="flex: 1;"><strong>${escapeHtml(pilihDokumenSemula)}</strong> Tertulis <strong>${escapeHtml(dataSemula)}</strong></span>
    </div>
    <div style="display: flex; margin: 4px 0; font-size: 14px;">
      <span style="width: 15px;">2.</span>
      <span style="width: 15px;">Di</span>
      <span style="flex: 1;"><strong>${escapeHtml(pilihDokumenTerbaru)}</strong> Tertulis <strong>${escapeHtml(dataTerbaru)}</strong></span>
    </div>`;

    // Debug log
    console.log("SKBI print replacement:", {
      pilihDokumenSemula,
      dataSemula,
      pilihDokumenTerbaru,
      dataTerbaru,
      letterData: letter.data,
    });

    closingText = closingText.replace("{{skbiComparison}}", skbiComparisonHtml).replace(/\{\{pilihDokumenTerbaru\}\}/g, `<strong>${escapeHtml(pilihDokumenTerbaru)}</strong>`);
  }
  let closingFinalText = template.closingFinal || "Demikian Surat Keterangan ini kami buat dengan sesungguhnya dan untuk dapat dipergunakan sebagaimana mestinya.";
  if (letter.classification === "WALI") {
    const keterangan = getFieldValue(letter, "keterangan") || "";
    closingFinalText = closingFinalText.replace("{{keterangan}}", `<strong>${escapeHtml(keterangan)}</strong>`);
  }

  const closingHtml =
    isUsaha || isKematian || isKelahiran || isPemakaman || isSuis || isWali || isMenikah || isSktms || isSkbi || isPertanahan
      ? (() => {
          if (isKelahiran) {
            const [part1, afterMother] = closingText.split("{{motherFields}}");
            const [part2, part3] = afterMother.split("{{fatherFields}}");
            return `
          ${wrapMultipleParagraphs(part1)}
          ${motherFieldsHtml}
          ${wrapMultipleParagraphs(part2)}
          ${fatherFieldsHtml}
          ${wrapMultipleParagraphs(part3)}`;
          } else if (isPemakaman) {
            const parts = closingText.split("{{deathDetails}}");
            const part1 = parts[0] || "";
            const afterDeath = parts[1] || "";

            const parts2 = afterDeath.split("{{burialDetails}}");
            const part2 = parts2[0] || "";
            const afterBurial = parts2[1] || "";

            const parts3 = afterBurial.split("{{keterangan}}");
            const part3Before = parts3[0] || "";
            const part3After = parts3[1] || "";

            const keterangan = getFieldValue(letter, "keterangan") || "";
            const closingFinal = template.closingFinal || "Demikian Surat Keterangan ini kami buat dengan sesungguhnya dan untuk dapat dipergunakan sebagaimana mestinya.";
            return `
          ${wrapMultipleParagraphs(part1)}
          ${deathDetailsFieldsHtml}
          ${wrapMultipleParagraphs(part2)}
          ${burialDetailsFieldsHtml}
          ${wrapMultipleParagraphs(part3Before + "<strong>" + escapeHtml(keterangan) + "</strong>" + part3After)}
          ${wrapMultipleParagraphs(closingFinal)}`;
          } else if (isPertanahan) {
            return `
          <div style="margin-top: 12px;">
            ${pertanahanPersonalHtml}
          </div>
          <div style="margin-top: 16px;">${wrapMultipleParagraphs(closingText)}</div>`;
          } else if (isSuis) {
            return `
          <div style="margin-top: 12px;">
            ${suamiHtml}
          </div>
          <div style="margin-top: 12px;">
            ${isriHtml}
          </div>
          <div style="margin-top: 16px;">${wrapMultipleParagraphs(closingText)}</div>`;
          } else if (isWali) {
            return `
          <div style="margin-top: 12px;">
            ${waliHtml}
          </div>
          <div style="margin-top: 16px;">${wrapMultipleParagraphs(closingText)}</div>
          <div style="margin-top: 8px;">
            ${anakHtml}
          </div>
          <div style="margin-top: 16px;">${wrapMultipleParagraphs(closingFinalText)}</div>`;
          } else if (isMenikah) {
            let closingFinal = template.closingFinal || "Demikian Surat Keterangan ini kami buat dengan sesungguhnya dan untuk dapat dipergunakan sebagaimana mestinya.";
            const keterangan = getFieldValue(letter, "keterangan") || "";
            closingFinal = closingFinal.replace("{{keterangan}}", `<strong>${escapeHtml(keterangan)}</strong>`);
            return `
          <div style="margin-top: 12px;">
            ${menikahPersonalHtml}
          </div>
          <div style="margin-top: 16px;">${wrapMultipleParagraphs(closingText)}</div>
          <div style="margin-top: 8px;">
            ${menikahCalonHtml}
          </div>
          <div style="margin-top: 16px;">${wrapMultipleParagraphs(closingFinal)}</div>`;
          } else if (isSktms) {
            let closingFinal = template.closingFinal || "Demikian Surat Keterangan ini kami buat dengan sesungguhnya dan untuk dapat dipergunakan sebagaimana mestinya.";
            const keterangan = getFieldValue(letter, "keterangan") || "";
            closingFinal = closingFinal.replace("{{keterangan}}", `<strong>${escapeHtml(keterangan)}</strong>`);
            return `
          <div style="margin-top: 12px;">
            ${sktmsParentHtml}
          </div>
          <div style="margin-top: 16px;">${wrapMultipleParagraphs(closingText)}</div>
          <div style="margin-top: 8px;">
            ${sktmsChildHtml}
          </div>
          <div style="margin-top: 16px;">${wrapMultipleParagraphs(closingFinal)}</div>`;
          } else if (isSkbi) {
            // Render personal data for SKBI
            const skbiPersonalFields = ["fullName", "nik", "birthPlaceDate", "gender", "maritalStatus", "religion", "occupation", "address"];
            const skbiPersonalHtml = renderFieldRows(skbiPersonalFields);
            return `
          <div style="margin-top: 12px;">
            ${skbiPersonalHtml}
          </div>
          <div style="margin-top: 16px;">${wrapMultipleParagraphs(closingText)}</div>`;
          } else {
            const placeholder = isUsaha ? "{{businessFields}}" : "{{deathDetails}}";
            let insertHtml = isUsaha ? businessFieldsHtml : deathDetailsHtml;
            const [before, after] = closingText.split(placeholder);
            return `
          ${wrapMultipleParagraphs(before || "")}
          ${insertHtml}
          ${wrapMultipleParagraphs(after || "")}`.trim();
          }
        })()
      : `<div style="margin-top: 16px;">${wrapMultipleParagraphs(closingText)}</div>`;

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(letterTitle)}</title>
  <style>
    @page { size: A4; margin: 0; }
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; color: #000; background: #fff; }
    .paper { width: 210mm; min-height: 297mm; padding: 20mm 18mm; box-sizing: border-box; margin: 0; }
    .header-row { display: grid; grid-template-columns: auto 1fr; align-items: flex-start; gap: 25px; }
    .letter-logo { width: 2.9cm; height: 2.66cm; object-fit: contain; }
    .header-text { text-align: center; line-height: 1.4; }
    .header-text .line1 { font-size: 16px; font-weight: 700; letter-spacing: 0.05em; margin: 0; }
    .header-text .line2 { font-size: 16px; font-weight: 700; margin: 1px 0 0 0; }
    .header-text .line3 { font-size: 24px; font-weight: 700; margin: 3px 0 0 0; }
    .divider { margin: 8px auto 0; border-top: 2px solid #000; width: 100%; }
    .subtitle { font-size: 11px; margin: 3px 0 0; }
    .title-block { margin-top: 10px; text-align: center; }
    .title { margin: 0; font-size: 18px; font-weight: 700; text-transform: uppercase; text-decoration: underline; }
    .number { font-size: 14px; margin: 4px 0 0; }
    .intro { margin: 10px 0 14px; font-size: 14px; text-align: justify; line-height: 1.6; text-indent: 2em; }
    .field-row { display: flex; align-items: flex-start; margin: 4px 0; font-size: 14px; }
    .field-label { width: 190px; min-width: 190px; font-weight: normal; }
    .field-value { flex: 1; min-width: 0; white-space: pre-wrap; word-break: break-word; }
    .field-value::before { content: ": "; }
    .closing { margin-top: 16px; margin-bottom: 12px; font-size: 14px; text-align: justify; white-space: pre-line; line-height: 1.6; text-indent: 2em; }
    .signature-row { display: flex; justify-content: flex-end; margin-top: 36px; font-size: 14px; }
    .signature { width: 220px; text-align: center; }
    .signature .name { margin-top: 72px; font-weight: 700; }
    @media print {
      body { margin: 0; }
      .paper { box-shadow: none; margin: 0; }
      .btn { display: none; }
    }
  </style>
</head>
<body>
  <div class="paper">
    <div class="header-row">
      <img src="icons/icon-garut.png" alt="Logo Garut" class="letter-logo" />
      <div class="header-text">
        <div class="line1">PEMERINTAH KABUPATEN GARUT</div>
        <div class="line2">KECAMATAN TAROGONG KIDUL</div>
        <div class="line3">KELURAHAN JAYAWARAS</div>
        <div class="subtitle1">Jalan Gordah No.40 - Email : jayawarask@gmail.com</div>
        <div class="subtitle2">GARUT</div>
      </div>
    </div>
    <div class="divider"></div>
    <div class="title-block">
      <div class="title">${escapeHtml(letterTitle)}</div>
      <div class="number">Nomor: ${escapeHtml(letterNumber)}</div>
    </div>
    <p class="intro" style="font-size: 14px;">${escapeHtml(template.intro)}</p>
    ${fieldsHtml}
    ${closingHtml}
    <div class="signature-row">
      <div class="signature">
        <div>Garut, ${escapeHtml(printDate)}</div>
        <div>Kepala Kelurahan Jayawaras</div>
        <div class="name"></div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function printLetter(letter) {
  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) {
    alert("Gagal membuka jendela cetak. Pastikan pop-up tidak diblokir.");
    return;
  }
  const html = buildPrintLetterHtml(letter);
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
    }, 200);
  };
}

function matchFilters(letter) {
  const cls = classificationEl.value || null;
  const yr = filterYear.value ? Number(filterYear.value) : null;
  const mo = filterMonth.value ? Number(filterMonth.value) : null;
  const q = (filterNo.value || "").trim().toLowerCase();

  if (cls && letter.classification !== cls) return false;
  if (yr && letter.year !== yr) return false;
  if (mo && letter.month !== mo) return false;

  if (q) {
    const hay = letter.register_display.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function updateFilterClass() {
  // This function updates the filter class options based on available data
  // Currently all options are predefined in HTML, so no action needed here
  // This is a placeholder to prevent errors when called from render()
}

function render() {
  const state = loadState();
  updateFilterClass(); // Update filter options sesuai data yang ada
  const list = state.letters.filter(matchFilters);

  // If no explicit sort set by user, default to chronological order: year ASC, register_no ASC
  if (!sortColumn) {
    list.sort((a, b) => {
      const ya = Number(a.year) || 0;
      const yb = Number(b.year) || 0;
      if (ya !== yb) return ya - yb;
      const ra = Number(a.register_no) || 0;
      const rb = Number(b.register_no) || 0;
      return ra - rb;
    });
  }

  // Apply sorting if requested by clicking headers
  if (sortColumn) {
    list.sort((a, b) => {
      const av = getSortValue(a, sortColumn);
      const bv = getSortValue(b, sortColumn);
      // Normalize empty values
      if (av === null || av === undefined || av === "") return 1 * sortDir;
      if (bv === null || bv === undefined || bv === "") return -1 * sortDir;
      // numeric compare
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * sortDir;
      // date-like or ISO string compare (letter_date, created_at)
      if (sortColumn === "letter_date" || sortColumn === "__no") return String(av).localeCompare(String(bv)) * sortDir;
      // default string compare
      return String(av).toLowerCase().localeCompare(String(bv).toLowerCase()) * sortDir;
    });
  }

  tbody.innerHTML = "";

  const selectedClass = classificationEl.value || Object.keys(CLASS_LABEL)[0];
  const displayCols = getDisplayColumns(selectedClass);

  // Build header row
  const thead = document.querySelector("table thead tr");
  if (thead) {
    thead.innerHTML = `
      <th data-col="__no" data-label="No">No</th>
      <th data-col="register" data-label="Nomor Register">Nomor Register</th>
      <th data-col="letter_date" data-label="Tanggal">Tanggal</th>
      ${displayCols.map((col) => `<th data-col="${col.key}" data-label="${col.label}">${col.label}</th>`).join("")}
      <th data-label="Aksi">Aksi</th>
    `;
    // Update visual sort indicators
    updateSortIndicators(thead);
  }

  // Build data rows
  list.forEach((letter, index) => {
    const tr = document.createElement("tr");

    // Build dynamic data cells based on selected classification
    const dataCells = displayCols.map((col) => `<td>${escapeHtml(getFieldValue(letter, col.key))}</td>`).join("");

    tr.innerHTML = `
      <td class="center">${index + 1}</td>
      <td class="mono"><b>${letter.register_display}</b></td>
      <td>${formatDate(letter.letter_date)}</td>
      ${dataCells}
      <td>
        <button class="btn primary" data-act="edit" data-id="${letter.id}">Edit</button>
        ${letter.classification !== "DATANG" && letter.classification !== "WARIS" && letter.classification !== "PINDAH" && letter.classification !== "SURAT_MASUK" && letter.classification !== "SURAT_KELUAR" ? `<button class="btn secondary" data-act="print" data-id="${letter.id}">Cetak</button>` : ""}
        <button class="btn danger" data-act="delete" data-id="${letter.id}">Hapus</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const total = state.letters.length;

  stats.textContent = `Total: ${total} • Ditampilkan: ${list.length}`;

  renderCounters(state);
  updatePreview();
}

function renderCounters(state) {
  const keys = Object.keys(state.counters).sort((a, b) => a.localeCompare(b));
  if (!keys.length) {
    counterGrid.innerHTML = `<div class="muted">Belum ada data. Counter akan muncul setelah kamu menyimpan register.</div>`;
    return;
  }
  // Group by year
  const grouped = {};
  for (const k of keys) {
    const [cls, year] = k.split(":");
    if (!grouped[year]) grouped[year] = {};
    grouped[year][cls] = state.counters[k];
  }
  const years = Object.keys(grouped).sort((a, b) => Number(b) - Number(a));

  counterGrid.innerHTML = "";
  for (const year of years) {
    const orderedKeys = Object.keys(CLASS_LABEL);
    for (const cls of orderedKeys) {
      if (cls === "SURAT_MASUK") continue;
      const last = grouped[year][cls] ?? 0;
      const div = document.createElement("div");
      div.className = "counterCard";
      // Show month roman for all years and place number before '-Kel' (e.g. 460/2-Kel/I/2026)
      const monthRoman = monthToRoman(new Date().getMonth() + 1);
      const prefix = CLASS_PREFIX[cls] || "";
      const displayReg = prefix ? `${prefix}/${last}-Kel/${monthRoman}/${year}` : `${last}-Kel/${monthRoman}/${year}`;

      div.innerHTML = `
        <div class="k">${CLASS_LABEL[cls]}</div>
        <div class="v mono">${displayReg}</div>
        <div class="s">Nomor terakhir: <b>#${last}</b></div>
      `;
      counterGrid.appendChild(div);
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[m],
  );
}

function formatDate(dateStr) {
  // Convert YYYY-MM-DD to DD/MM/YYYY
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || "-";
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

// Events
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const cls = classificationEl.value;
  const dt = dateEl.value;

  if (!dt) return alert("Tanggal pelayanan wajib diisi.");

  const keys = CLASS_FIELDS[cls] || ["fullName", "birthPlaceDate", "occupation", "address", "keterangan"];
  const fields = {};
  for (const k of keys) {
    const el = document.getElementById(k);
    fields[k] = el ? (el.value || "").trim() : "";
  }

  // For SKBI, also capture pilihDokumenSemula, dataSemula, pilihDokumenTerbaru and dataTerbaru
  if (cls === "SKBI") {
    const pilihDokumenSemulaEl = document.getElementById("pilihDokumenSemula");
    const dataSemelaEl = document.getElementById("dataSemula");
    const pilihDokumenTerbarEl = document.getElementById("pilihDokumenTerbaru");
    const dataTerbarEl = document.getElementById("dataTerbaru");
    fields.pilihDokumenSemula = pilihDokumenSemulaEl ? (pilihDokumenSemulaEl.value || "").trim() : "";
    fields.dataSemula = dataSemelaEl ? (dataSemelaEl.value || "").trim() : "";
    fields.pilihDokumenTerbaru = pilihDokumenTerbarEl ? (pilihDokumenTerbarEl.value || "").trim() : "";
    fields.dataTerbaru = dataTerbarEl ? (dataTerbarEl.value || "").trim() : "";
  }

  // For SKPED, also capture jenisPerubahan, dataSemula and dataTerbaru
  if (cls === "SKPED") {
    const jenisPerubahanEl = document.getElementById("jenisPerubahan");
    const dataSemelaEl = document.getElementById("dataSemula");
    const dataTerbarEl = document.getElementById("dataTerbaru");
    fields.jenisPerubahan = jenisPerubahanEl ? (jenisPerubahanEl.value || "").trim() : "";
    fields.dataSemula = dataSemelaEl ? (dataSemelaEl.value || "").trim() : "";
    fields.dataTerbaru = dataTerbarEl ? (dataTerbarEl.value || "").trim() : "";
  }

  // For DOMISILI, also capture dynamic fields
  if (cls === "DOMISILI") {
    const domisiliFields = ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik", "keterangan"];
    domisiliFields.forEach((key) => {
      const el = document.getElementById(key);
      if (el) {
        fields[key] = (el.value || "").trim();
      }
    });
  }

  // For SURAT_MASUK, validate that nomorRegister is filled
  if (cls === "SURAT_MASUK") {
    const nomorRegisterEl = document.getElementById("nomorRegister");
    const nomorRegister = nomorRegisterEl ? (nomorRegisterEl.value || "").trim() : "";
    if (!nomorRegister) {
      return alert("Nomor register wajib diisi untuk Surat Masuk.");
    }
    fields.nomorRegister = nomorRegister;
  }

  // if (!fields.fullName || !fields.fullName.trim()) return alert("Nama lengkap wajib diisi.");

  if (editingId) {
    // Update existing letter (do not change register_no or register_display)
    const state = loadState();
    const idx = state.letters.findIndex((x) => x.id === editingId);
    if (idx === -1) {
      alert("Data tidak ditemukan.");
      exitEditMode();
      return;
    }
    const existing = state.letters[idx];
    existing.fullName = fields.fullName;
    existing.birthPlaceDate = fields.birthPlaceDate;
    existing.occupation = fields.occupation;
    existing.address = fields.address;
    existing.data = fields;
    existing.updated_at = nowISO();
    persistState(state);
    clearDraft();
    showDialog({ title: "Berhasil", bodyHTML: `<div>Perubahan tersimpan untuk: <div style="margin-top:10px" class="previewValue mono"><b>${existing.register_display}</b></div></div>`, buttons: [{ text: "Tutup", variant: "primary" }] });
    exitEditMode();
    render();
    return;
  }

  const letter = addLetter({ classification: cls, letterDate: dt, fields });

  // clear inputs
  for (const k of keys) {
    const el = document.getElementById(k);
    if (el) el.value = "";
  }

  // Also clear SKBI dynamic fields if present
  if (cls === "SKBI") {
    const pilihDokumenSemulaEl = document.getElementById("pilihDokumenSemula");
    const dataSemelaEl = document.getElementById("dataSemula");
    const pilihDokumenTerbarEl = document.getElementById("pilihDokumenTerbaru");
    const dataTerbarEl = document.getElementById("dataTerbaru");
    if (pilihDokumenSemulaEl) pilihDokumenSemulaEl.value = "";
    if (dataSemelaEl) dataSemelaEl.value = "";
    if (pilihDokumenTerbarEl) pilihDokumenTerbarEl.value = "";
    if (dataTerbarEl) dataTerbarEl.value = "";
  }

  // Also clear SKPED dynamic fields if present
  if (cls === "SKPED") {
    const jenisPerubahanEl = document.getElementById("jenisPerubahan");
    const dataSemelaEl = document.getElementById("dataSemula");
    const dataTerbarEl = document.getElementById("dataTerbaru");
    if (jenisPerubahanEl) jenisPerubahanEl.value = "";
    if (dataSemelaEl) dataSemelaEl.value = "";
    if (dataTerbarEl) dataTerbarEl.value = "";
  }

  showDialog({
    title: "Berhasil",
    bodyHTML: `
      <div>Nomor register dibuat:</div>
      <div style="margin-top:10px" class="previewValue mono"><b>${letter.register_display}</b></div>
    `,
    buttons: [{ text: "Tutup", variant: "primary" }],
  });
  clearDraft();
  render();
});

[classificationEl, dateEl].forEach((el) =>
  el.addEventListener("change", () => {
    updatePreview();
    updateFormFields();
    render(); // Update table headers when classification changes
    // Sync table filters with form selection so the Data Register follows the form
    try {
      // table follows the form classification directly; no separate filterClass
      const dv = dateEl.value || "";
      if (dv && /^\d{4}-\d{2}-\d{2}$/.test(dv)) {
        filterYear.value = ymdToYear(dv);
        filterMonth.value = Number(String(dv).slice(5, 7));
      } else {
        filterYear.value = "";
        filterMonth.value = "";
      }
    } catch (e) {
      // ignore
    }
    render();
  }),
);

[filterYear, filterMonth, filterNo].forEach((el) => el.addEventListener("input", render));

tbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const act = btn.dataset.act;
  const id = btn.dataset.id;
  const state = loadState();
  const letter = state.letters.find((x) => x.id === id);
  if (!letter) return;

  if (act === "edit") {
    enterEditMode(letter);
    // scroll to form
    form.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  if (act === "print") {
    printLetter(letter);
    return;
  }

  if (act === "delete") {
    // Show confirmation dialog before deleting
    showDialog({
      title: "Hapus Data?",
      bodyHTML: `
        <div>Apakah Anda yakin ingin menghapus data ini?</div>
        <div style="margin-top:10px" class="small">Target: <span class="mono"><b>${letter.register_display}</b></span></div>
        `,
      buttons: [
        { text: "Batal", variant: "secondary" },
        {
          text: "Ya, Hapus",
          variant: "danger",
          onClick: () => {
            const ok = hardDeleteLetter(id);
            if (ok) {
              render();
            } else {
              alert("Data tidak ditemukan atau gagal dihapus.");
            }
          },
        },
      ],
    });
    return;
  }
});

// Data disimpan saat tombol "Buat Nomor Register" diklik (submit form)

// Backup & Import event listeners
const btnBackup = document.getElementById("btnBackup");
const btnImport = document.getElementById("btnImport");

if (btnBackup) {
  btnBackup.addEventListener("click", exportBackup);
}
if (btnImport) {
  btnImport.addEventListener("click", importBackup);
}

async function exportExcel() {
  const state = loadState();
  if (!state.letters || state.letters.length === 0) {
    alert("Tidak ada data untuk diekspor.");
    return;
  }
  // Check if XLSX library is available; try to load it dynamically if missing
  if (typeof XLSX === "undefined") {
    const cdns = ["https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.min.js", "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js", "https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js"];
    try {
      await loadScriptWithFallback(cdns, 8000);
    } catch (err) {
      alert("⚠️ Library Excel tidak terdeteksi dan gagal dimuat dari CDN.\nMohon periksa koneksi internet atau tambahkan file xlsx.min.js secara lokal ke proyek.");
      console.error("All attempts to load XLSX failed:", err);
      return;
    }
  }

  try {
    // Use export-specific filters (year, month, and classification)
    const yr = exportYear.value ? Number(exportYear.value) : null;
    const mo = exportMonth.value ? Number(exportMonth.value) : null;
    const selectedClassification = exportClassification?.value || null;

    // Filter letters by service classification, year, and month
    let letters = state.letters;
    if (selectedClassification) {
      letters = letters.filter((l) => l.classification === selectedClassification);
    }
    if (yr) {
      letters = letters.filter((l) => l.year === yr);
    }
    if (mo) {
      letters = letters.filter((l) => l.month === mo);
    }

    // Apply same sorting as shown in the table
    letters = applyTableSort(letters);

    const isNihil = letters.length === 0;

    // Prepare month/year for header
    const monthNames = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

    // Determine service type(s) in filtered data
    const allClassifications = [...new Set(letters.map((l) => l.classification))];
    const serviceName = selectedClassification ? CLASS_LABEL[selectedClassification] || selectedClassification : allClassifications.length === 1 ? CLASS_LABEL[allClassifications[0]] || allClassifications[0] : "SEMUA JENIS PELAYANAN";

    let headerLine1 = "REGISTER";
    let headerLine2 = `${serviceName.toUpperCase()}`;
    let headerLine3 = "";
    let filenameSuffix = "";

    if (mo && yr) {
      // Both month and year specified
      headerLine3 = `BULAN ${monthNames[mo]} ${yr}`;
      filenameSuffix = `${monthNames[mo]}-${yr}`;
    } else if (yr) {
      // Only year specified
      headerLine3 = `TAHUN ${yr}`;
      filenameSuffix = `tahun-${yr}`;
    } else if (mo) {
      // Only month specified
      headerLine3 = `BULAN ${monthNames[mo]}`;
      filenameSuffix = `bulan-${monthNames[mo]}`;
    } else {
      // No filters - show data range from letters
      const monthYearSet = new Set();
      for (const l of letters) {
        const d = l.letter_date || "";
        if (/^\d{4}-\d{2}/.test(d)) monthYearSet.add(d.slice(0, 7));
      }
      const monthYears = Array.from(monthYearSet).sort();

      if (monthYears.length === 1) {
        const [ystr, mstr] = monthYears[0].split("-");
        const m = Number(mstr);
        const y = Number(ystr);
        headerLine3 = `BULAN ${monthNames[m]} ${y}`;
        filenameSuffix = `bulan-${monthNames[m]}-tahun-${y}`;
      } else if (monthYears.length > 1) {
        const start = monthYears[0].split("-");
        const end = monthYears[monthYears.length - 1].split("-");
        const sMon = Number(start[1]);
        const sYr = Number(start[0]);
        const eMon = Number(end[1]);
        const eYr = Number(end[0]);
        headerLine3 = `PERIODE ${monthNames[sMon]} ${sYr} - ${monthNames[eMon]} ${eYr}`;
        filenameSuffix = `periode-${monthNames[sMon]}${sYr}-to-${monthNames[eMon]}${eYr}`;
      } else {
        headerLine3 = "";
        filenameSuffix = `register-${new Date().getTime()}`;
      }
    }

    // Get display columns based on first classification
    const displayCols = allClassifications.length > 0 ? getDisplayColumns(allClassifications[0]) : getDisplayColumns("SKTMU");
    const colHeaders = ["NO", "Nomor Register", "Tanggal", ...displayCols.map((c) => c.label)];

    // Prepare sheet data
    const sheetData = [];

    // Add header rows (3 baris)
    sheetData.push([headerLine1]);
    sheetData.push([headerLine2]);
    sheetData.push([headerLine3]);
    sheetData.push([]); // Empty row for spacing

    // Add column header row
    sheetData.push(colHeaders);

    // Add data rows
    if (isNihil) {
      sheetData.push(["", "NIHIL", ...Array(colHeaders.length - 2).fill("")]);
    } else {
      letters.forEach((letter, index) => {
        sheetData.push([index + 1, letter.register_display, formatDate(letter.letter_date), ...displayCols.map((col) => getFieldValue(letter, col.key))]);
      });
    }

    // Create workbook
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Register"); // Sheet name

    // Set column widths dynamically
    const colWidths = [
      { wch: 5 }, // NO
      { wch: 20 }, // Nomor Register
      { wch: 12 }, // Tanggal
    ];
    // Add widths for dynamic fields
    displayCols.forEach(() => colWidths.push({ wch: 20 }));
    ws["!cols"] = colWidths;

    // Format header rows (rows 1-3) - bold, size 14, center aligned
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < colHeaders.length; col++) {
        const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
        if (ws[cellRef]) {
          ws[cellRef].s = {
            font: { bold: true, size: 14 },
            alignment: { horizontal: "center", vertical: "center", wrapText: true },
          };
        }
      }
    }

    // Format column header row (row 5, after empty row 4)
    for (let col = 0; col < colHeaders.length; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: 4, c: col });
      if (ws[cellRef]) {
        ws[cellRef].s = {
          font: { bold: true, size: 10 },
          alignment: { horizontal: "center", vertical: "center" },
        };
      }
    }

    // Generate filename
    let filename = `Register_${filenameSuffix}.xlsx`;

    XLSX.writeFile(wb, filename);
  } catch (error) {
    console.error("Error generating Excel:", error);
    alert(`Gagal membuat Excel: ${error.message || String(error)}`);
  }
}

btnExportExcel.addEventListener("click", exportExcel);

// Import JSON UI and behavior removed

btnReset.addEventListener("click", () => {
  showDialog({
    title: "Reset semua data?",
    bodyHTML: `
    <div>Apakah Anda yakin ingin mereset data?</div>
    <div style="margin-top:10px" class="small">Tindakan ini akan menghapus semua data register dari sistem.</div>
    `,
    buttons: [
      { text: "Batal", variant: "secondary" },
      {
        text: "Ya, Reset",
        variant: "danger",
        onClick: () => {
          localStorage.removeItem(STORAGE_KEY);
          clearDraft();
          render();
        },
      },
    ],
  });
});

// Init defaults
(async function init() {
  // Migrate stored entries to new register format if needed
  // Try to recover state from IndexedDB if localStorage is empty
  try {
    const lsRaw = localStorage.getItem(STORAGE_KEY);
    if (!lsRaw) {
      const idbState = await idbGet(STORAGE_KEY).catch(() => null);
      if (idbState) {
        // populate localStorage so rest of app can use loadState()
        saveState(idbState);
      }
    } else {
      // If localStorage present but IndexedDB missing, seed IndexedDB
      const idbState = await idbGet(STORAGE_KEY).catch(() => null);
      if (!idbState) {
        try {
          idbSet(STORAGE_KEY, JSON.parse(lsRaw)).catch(() => {});
        } catch (e) {}
      }
    }
  } catch (e) {
    console.warn("IndexedDB recovery failed:", e);
  }

  // Restore any draft from previous session
  const draft = loadDraft();
  if (draft) {
    try {
      if (draft.classification) classificationEl.value = draft.classification;
      if (draft.date) dateEl.value = draft.date;
      updateFormFields();
      const keys = CLASS_FIELDS[classificationEl.value] || ["fullName", "birthPlaceDate", "occupation", "address", "keterangan"];
      for (const k of keys) {
        const el = document.getElementById(k);
        if (el && draft.fields && typeof draft.fields[k] !== "undefined") el.value = draft.fields[k];
      }

      // For SKBI, also restore pilihDokumenSemula, dataSemula, pilihDokumenTerbaru and dataTerbaru
      if (draft.classification === "SKBI") {
        setTimeout(() => {
          // First trigger handleSKBIChange to show document selectors
          const jenisPerbandinganEl = document.getElementById("jenisPerbandingan");
          if (jenisPerbandinganEl && jenisPerbandinganEl.value) {
            handleSKBIChange();
          }

          // Then restore the specific field values
          const pilihDokumenSemulaEl = document.getElementById("pilihDokumenSemula");
          const dataSemelaEl = document.getElementById("dataSemula");
          const pilihDokumenTerbarEl = document.getElementById("pilihDokumenTerbaru");
          const dataTerbarEl = document.getElementById("dataTerbaru");
          if (pilihDokumenSemulaEl && draft.fields && draft.fields.pilihDokumenSemula) pilihDokumenSemulaEl.value = draft.fields.pilihDokumenSemula;
          if (dataSemelaEl && draft.fields && draft.fields.dataSemula) dataSemelaEl.value = draft.fields.dataSemula;
          if (pilihDokumenTerbarEl && draft.fields && draft.fields.pilihDokumenTerbaru) pilihDokumenTerbarEl.value = draft.fields.pilihDokumenTerbaru;
          if (dataTerbarEl && draft.fields && draft.fields.dataTerbaru) dataTerbarEl.value = draft.fields.dataTerbaru;

          // Trigger to show data input fields after restoring document selections
          handleSKBIDataInputChange();
        }, 100);
      }

      // For SKPED, also restore jenisPerubahan, dataSemula and dataTerbaru
      if (draft.classification === "SKPED") {
        setTimeout(() => {
          const jenisPerubahanEl = document.getElementById("jenisPerubahan");
          const dataSemelaEl = document.getElementById("dataSemula");
          const dataTerbarEl = document.getElementById("dataTerbaru");
          if (jenisPerubahanEl && draft.fields && draft.fields.jenisPerubahan) jenisPerubahanEl.value = draft.fields.jenisPerubahan;
          if (dataSemelaEl && draft.fields && draft.fields.dataSemula) dataSemelaEl.value = draft.fields.dataSemula;
          if (dataTerbarEl && draft.fields && draft.fields.dataTerbaru) dataTerbarEl.value = draft.fields.dataTerbaru;
        }, 100);
      }

      if (draft.editingId) {
        editingId = draft.editingId;
        if (submitBtn) submitBtn.textContent = "Simpan Perubahan";
      }
    } catch (e) {
      console.warn("Gagal memulihkan draft:", e);
    }
  }

  populateExportClassificationSelect();
  updatePreview();
  updateFormFields();
  render();
})();

// Save draft before the page/tab is unloaded so in-progress form isn't lost
window.addEventListener("beforeunload", () => {
  try {
    const cls = classificationEl.value || Object.keys(CLASS_LABEL)[0];
    const dt = dateEl.value || new Date().toISOString().slice(0, 10);
    const keys = CLASS_FIELDS[cls] || ["fullName", "birthPlaceDate", "occupation", "address", "keterangan"];
    const fields = {};
    let hasAny = false;
    for (const k of keys) {
      const el = document.getElementById(k);
      const v = el ? (el.value || "").trim() : "";
      fields[k] = v;
      if (v) hasAny = true;
    }

    // For SKBI, also save pilihDokumenSemula, dataSemula, pilihDokumenTerbaru and dataTerbaru
    if (cls === "SKBI") {
      const pilihDokumenSemulaEl = document.getElementById("pilihDokumenSemula");
      const dataSemelaEl = document.getElementById("dataSemula");
      const pilihDokumenTerbarEl = document.getElementById("pilihDokumenTerbaru");
      const dataTerbarEl = document.getElementById("dataTerbaru");
      fields.pilihDokumenSemula = pilihDokumenSemulaEl ? (pilihDokumenSemulaEl.value || "").trim() : "";
      fields.dataSemula = dataSemelaEl ? (dataSemelaEl.value || "").trim() : "";
      fields.pilihDokumenTerbaru = pilihDokumenTerbarEl ? (pilihDokumenTerbarEl.value || "").trim() : "";
      fields.dataTerbaru = dataTerbarEl ? (dataTerbarEl.value || "").trim() : "";
      if (fields.pilihDokumenSemula || fields.dataSemula || fields.pilihDokumenTerbaru || fields.dataTerbaru) hasAny = true;
    }

    // For SKPED, also save jenisPerubahan, dataSemula and dataTerbaru
    if (cls === "SKPED") {
      const jenisPerubahanEl = document.getElementById("jenisPerubahan");
      const dataSemelaEl = document.getElementById("dataSemula");
      const dataTerbarEl = document.getElementById("dataTerbaru");
      fields.jenisPerubahan = jenisPerubahanEl ? (jenisPerubahanEl.value || "").trim() : "";
      fields.dataSemula = dataSemelaEl ? (dataSemelaEl.value || "").trim() : "";
      fields.dataTerbaru = dataTerbarEl ? (dataTerbarEl.value || "").trim() : "";
      if (fields.jenisPerubahan || fields.dataSemula || fields.dataTerbaru) hasAny = true;
    }

    // For DOMISILI, also save all dynamic fields
    if (cls === "DOMISILI") {
      const dynamicFieldsToSave = ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik", "keterangan"];
      for (const k of dynamicFieldsToSave) {
        const el = document.getElementById(k);
        const v = el ? (el.value || "").trim() : "";
        fields[k] = v;
        if (v) hasAny = true;
      }
    }

    if (hasAny || editingId) {
      saveDraft({ classification: cls, date: dt, fields, editingId });
    } else {
      clearDraft();
    }
  } catch (e) {
    // ignore
  }
});

// Autosave draft while typing (debounced) so draft persists even if beforeunload is not fired
let draftTimer = null;
const DRAFT_DEBOUNCE = 500; // ms
function scheduleSaveDraft() {
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    try {
      const cls = classificationEl.value || Object.keys(CLASS_LABEL)[0];
      const dt = dateEl.value || new Date().toISOString().slice(0, 10);
      const keys = CLASS_FIELDS[cls] || ["fullName", "birthPlaceDate", "occupation", "address", "keterangan"];
      const fields = {};
      let hasAny = false;
      for (const k of keys) {
        const el = document.getElementById(k);
        const v = el ? (el.value || "").trim() : "";
        fields[k] = v;
        if (v) hasAny = true;
      }

      // For SKBI, also save pilihDokumenSemula, dataSemula, pilihDokumenTerbaru and dataTerbaru
      if (cls === "SKBI") {
        const pilihDokumenSemulaEl = document.getElementById("pilihDokumenSemula");
        const dataSemelaEl = document.getElementById("dataSemula");
        const pilihDokumenTerbarEl = document.getElementById("pilihDokumenTerbaru");
        const dataTerbarEl = document.getElementById("dataTerbaru");
        fields.pilihDokumenSemula = pilihDokumenSemulaEl ? (pilihDokumenSemulaEl.value || "").trim() : "";
        fields.dataSemula = dataSemelaEl ? (dataSemelaEl.value || "").trim() : "";
        fields.pilihDokumenTerbaru = pilihDokumenTerbarEl ? (pilihDokumenTerbarEl.value || "").trim() : "";
        fields.dataTerbaru = dataTerbarEl ? (dataTerbarEl.value || "").trim() : "";
        if (fields.pilihDokumenSemula || fields.dataSemula || fields.pilihDokumenTerbaru || fields.dataTerbaru) hasAny = true;
      }

      // For SKPED, also save jenisPerubahan, dataSemula and dataTerbaru
      if (cls === "SKPED") {
        const jenisPerubahanEl = document.getElementById("jenisPerubahan");
        const dataSemelaEl = document.getElementById("dataSemula");
        const dataTerbarEl = document.getElementById("dataTerbaru");
        fields.jenisPerubahan = jenisPerubahanEl ? (jenisPerubahanEl.value || "").trim() : "";
        fields.dataSemula = dataSemelaEl ? (dataSemelaEl.value || "").trim() : "";
        fields.dataTerbaru = dataTerbarEl ? (dataTerbarEl.value || "").trim() : "";
        if (fields.jenisPerubahan || fields.dataSemula || fields.dataTerbaru) hasAny = true;
      }

      // For DOMISILI, also save all dynamic fields
      if (cls === "DOMISILI") {
        const dynamicFieldsToSave = ["fullName", "gender", "birthPlaceDate", "religion", "maritalStatus", "occupation", "address", "nik", "keterangan"];
        for (const k of dynamicFieldsToSave) {
          const el = document.getElementById(k);
          const v = el ? (el.value || "").trim() : "";
          fields[k] = v;
          if (v) hasAny = true;
        }
      }

      if (hasAny || editingId) saveDraft({ classification: cls, date: dt, fields, editingId });
      else clearDraft();
    } catch (e) {
      console.warn("Gagal autosave draft:", e);
    }
  }, DRAFT_DEBOUNCE);
}

// Hook draft autosave to inputs and selection changes
dynamicFieldsEl.addEventListener("input", scheduleSaveDraft);
classificationEl.addEventListener("change", scheduleSaveDraft);
dateEl.addEventListener("change", scheduleSaveDraft);
