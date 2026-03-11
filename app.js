// Register Surat Kelurahan (offline, localStorage)
// Fokus: nomor urut per perihal per tahun, tidak saling campur.

const STORAGE_KEY = "sr_sim_v1";
const DRAFT_KEY = "sr_sim_v1_draft";

const CLASS_LABEL = {
  BAIK: "Surat Keterangan Berkelakuan Baik",
  SKTMU: "Surat Keterangan Tidak Mampu Umum",
  UMUM: "Surat Keterangan Umum",
  PEMAKAMAN: "Surat Keterangan Pemakaman",
  SKBI: "Surat Keterangan Beda Identitas",
  SKBMR: "Surat Keterangan Belum Memiliki Rumah",
  DOMISILI: "Surat Keterangan Domisili",
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
  PERTANAHAN: "Surat Keterangan Pertanahan",
  USAHA: "Surat Keterangan Usaha",
  PENGHASILAN: "Surat Keterangan Penghasilan",
  BANK: "Surat Keterangan Bank",
  WALI: "Surat Keterangan Wali",
};

const CLASS_PREFIX = {
  BAIK: "100.2.2.5",
  SKTMU: "100.2.2.5",
  UMUM: "100.2.2.5",
  PEMAKAMAN: "400.11.3.2",
  SKBI: "400.12.2.1",
  SKBMR: "400.12.2.1",
  DOMISILI: "400.12.2.1",
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
  USAHA: "500.2.2.4",
  PENGHASILAN: "800.1.11.10",
  BANK: "900.1.7.2",
  WALI: "900.1.7.2",
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

function formatRegisterNo(classification, year, month, regNo) {
  // Desired format: PREFIX/2-Kel/I/2026 (number first, then -Kel, then month roman and year)
  return `${CLASS_PREFIX[classification]}/${regNo}-Kel/${monthToRoman(month)}/${year}`;
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
  const register_no = generateNextNumber(state, classification, year);

  // normalize common fields
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
    register_display: formatRegisterNo(classification, year, month, register_no),
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

function exportPDF() {
  const state = loadState();
  if (!state.letters || state.letters.length === 0) {
    alert("Tidak ada data untuk diekspor.");
    return;
  }

  try {
    // Use export-specific filters (year and month)
    const yr = exportYear.value ? Number(exportYear.value) : null;
    const mo = exportMonth.value ? Number(exportMonth.value) : null;

    // Filter letters by year and month
    let letters = state.letters;
    if (yr) {
      letters = letters.filter((l) => l.year === yr);
    }
    if (mo) {
      letters = letters.filter((l) => l.month === mo);
    }

    // Apply same sorting as shown in the table
    letters = applyTableSort(letters);

    const isNihil = letters.length === 0;

    // If no letters for this perihal, still generate PDF with NIHIL message
    // Resolve jsPDF constructor
    let jsPDFCtor = null;
    if (typeof window.jsPDF === "function") jsPDFCtor = window.jsPDF;
    else if (window.jspdf && typeof window.jspdf.jsPDF === "function") jsPDFCtor = window.jspdf.jsPDF;
    else if (typeof window.jspdf === "function") jsPDFCtor = window.jspdf;

    if (!jsPDFCtor) {
      alert("⚠️ Library PDF tidak terdeteksi. Refresh halaman dan coba lagi.");
      console.error("jsPDF not found on window object.");
      return;
    }

    const doc = new jsPDFCtor("l", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();

    // Prepare month names for header
    const monthNames = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

    // Determine service type(s) in filtered data
    const allClassifications = [...new Set(letters.map((l) => l.classification))];
    const serviceName = allClassifications.length === 1 ? CLASS_LABEL[allClassifications[0]] || allClassifications[0] : "SEMUA JENIS PELAYANAN";

    // Prepare header with export filters
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

    // Header (2 lines) - use bold sans-serif (Helvetica) as fallback for Arial Narrow Bold
    // Note: Arial Narrow Bold is proprietary; to use it we need the TTF and to embed it via addFileToVFS/addFont.
    // Using built-in Helvetica Bold for now.
    try {
      doc.setFont("helvetica", "bold");
    } catch (e) {
      // ignore if font not available
    }
    // Make header lines uppercase and set size 14
    doc.setFontSize(14);
    doc.text(String(headerLine1).toUpperCase(), pageWidth / 2, 14, { align: "center" });
    doc.text(String(headerLine2).toUpperCase(), pageWidth / 2, 20, { align: "center" });
    doc.text(String(headerLine3).toUpperCase(), pageWidth / 2, 26, { align: "center" });
    // Reset to normal for table body
    try {
      doc.setFont("helvetica", "normal");
    } catch (e) {}

    // Get display columns based on first classification
    const displayCols = allClassifications.length > 0 ? getDisplayColumns(allClassifications[0]) : getDisplayColumns("SKTMU");
    const colHeaders = ["NO", "Nomor Register", "Tanggal", ...displayCols.map((c) => c.label)];

    // Prepare table data with dynamic columns
    let tableData;
    if (isNihil) {
      // Show NIHIL message in table if no data
      tableData = [["", "NIHIL", ...Array(colHeaders.length - 2).fill("")]];
    } else {
      tableData = letters.map((letter, index) => [
        String(index + 1), // NO column
        letter.register_display,
        letter.letter_date || "-",
        ...displayCols.map((col) => getFieldValue(letter, col.key)),
      ]);
    }

    // Add table using autoTable if available
    if (typeof doc.autoTable === "function") {
      // Build columnStyles dynamically
      const columnStyles = {};
      for (let i = 0; i < colHeaders.length; i++) {
        columnStyles[i] = i <= 3 ? { halign: "center" } : { halign: "left" };
      }

      doc.autoTable({
        head: [colHeaders.map((h) => String(h).toUpperCase())],
        body: tableData,
        startY: 38,
        margin: { left: 6, right: 6 },
        styles: { fontSize: 9, cellPadding: 2, font: "helvetica", halign: "center", lineColor: [0, 0, 0], lineWidth: 0.2 },
        headStyles: { fillColor: [33, 33, 33], textColor: 255, fontStyle: "bold", font: "helvetica", fontSize: 10, halign: "center", lineColor: [0, 0, 0], lineWidth: 0.2 },
        alternateRowStyles: { fillColor: [245, 245, 245], lineColor: [0, 0, 0], lineWidth: 0.2 },
        columnStyles,
        didDrawPage: (data) => {},
      });
    } else {
      // Fallback: simple text list
      let y = 32;
      doc.setFontSize(9);
      for (const row of tableData) {
        const line = row.join(" | ");
        doc.text(line, 10, y);
        y += 6;
        if (y > doc.internal.pageSize.getHeight() - 20) {
          doc.addPage();
          y = 20;
        }
      }
    }

    const filename = `Register_${filenameSuffix || new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
  } catch (error) {
    console.error("Error generating filtered PDF:", error);
    alert(`Gagal membuat PDF: ${error.message || String(error)}`);
  }
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

const btnExportPDF = $("#btnExportPDF");
const btnExportExcel = $("#btnExportExcel");
const exportYear = $("#exportYear");
const exportMonth = $("#exportMonth");
const btnReset = $("#btnReset");

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
  const key = counterKey(cls, year);
  const next = (state.counters[key] ?? 0) + 1;
  previewEl.textContent = formatRegisterNo(cls, year, month, next);
}

function updateFormFields() {
  // Render dynamic form fields based on selected classification
  renderFormFields(classificationEl.value);
}

// Field definitions and per-class field lists
const FIELD_DEFS = {
  fullName: { label: "Nama Lengkap", type: "text", maxlength: 120, placeholder: "Contoh: Ahmad Santoso", required: true },
  birthPlaceDate: { label: "Tempat, Tanggal Lahir", type: "text", maxlength: 120, placeholder: "Contoh: Kota/Kabupaten, dd/mm/yyyy" },
  occupation: { label: "Pekerjaan", type: "text", maxlength: 120, placeholder: "Contoh: Petani / Guru" },
  address: { label: "Alamat", type: "text", maxlength: 200, placeholder: "Kp. xxx RT.xxx RW.xxx" },
  keterangan: { label: "Keterangan", type: "text", maxlength: 300, placeholder: "Keperluan Pemohon" },
  banyaknyaAhliWaris: { label: "Banyaknya Ahli Waris", type: "number", maxlength: 6, placeholder: "Contoh: 3" },
  namaAnak: { label: "Nama Anak", type: "text", maxlength: 120, placeholder: "Nama anak" },
  namaUsaha: { label: "Nama Usaha", type: "text", maxlength: 120, placeholder: "Nama Usaha" },
  alamatAsal: { label: "Alamat Asal", type: "text", maxlength: 200, placeholder: "Alamat Asal" },
  alamatTujuan: { label: "Alamat Tujuan", type: "text", maxlength: 200, placeholder: "Alamat Tujuan" },
  namaAyah: { label: "Nama Ayah", type: "text", maxlength: 120, placeholder: "Nama Ayah" },
  namaIbu: { label: "Nama Ibu", type: "text", maxlength: 120, placeholder: "Nama Ibu" },
  hariTanggalMeninggal: { label: "Hari, Tanggal Meninggal", type: "text", maxlength: 120, placeholder: "Contoh: Hari, dd/mm/yyyy" },
  namaPelapor: { label: "Nama Pelapor", type: "text", maxlength: 120, placeholder: "Nama Pelapor" },
  hariTanggalPemakaman: { label: "Hari, Tanggal Pemakaman", type: "text", maxlength: 120, placeholder: "Contoh: Hari, dd/mm/yyyy" },
  tempatPemakaman: { label: "Tempat Pemakaman", type: "text", maxlength: 120, placeholder: "Lokasi Pemakaman" },
  identitasTanah: { label: "Identitas Tanah", type: "text", maxlength: 200, placeholder: "Contoh: Sertifikat / SHM" },
  penjual: { label: "Penjual", type: "text", maxlength: 120, placeholder: "Nama Penjual" },
  pembeli: { label: "Pembeli", type: "text", maxlength: 120, placeholder: "Nama Pembeli" },
  waliDari: { label: "Wali Dari", type: "text", maxlength: 120, placeholder: "Nama Anak" },
  calonName: { label: "Nama Calon (Suami/Istri)", type: "text", maxlength: 120, placeholder: "Nama Calon" },
  calonBirthPlaceDate: { label: "Tempat, Tanggal Lahir (Calon)", type: "text", maxlength: 120, placeholder: "Contoh: Kota/Kabupaten, dd/mm/yyyy" },
  calonAddress: { label: "Alamat (Calon)", type: "text", maxlength: 200, placeholder: "Kp. xxx RT.xxx RW.xxx" },
  jumlahPenghasilan: { label: "Jumlah Penghasilan", type: "text", maxlength: 120, placeholder: "Contoh: Rp 5.000.000 per bulan" },
};

const CLASS_FIELDS = {
  SKTMU: ["fullName", "birthPlaceDate", "occupation", "address", "keterangan"],
  DOMISILI: ["fullName", "birthPlaceDate", "occupation", "address", "keterangan"],
  BANK: ["fullName", "birthPlaceDate", "occupation", "address", "keterangan"],
  BAIK: ["fullName", "birthPlaceDate", "occupation", "address", "keterangan"],
  SKBI: ["fullName", "birthPlaceDate", "occupation", "address", "keterangan"],
  SKPED: ["fullName", "birthPlaceDate", "occupation", "address", "keterangan"],
  SKBM: ["fullName", "birthPlaceDate", "occupation", "address", "keterangan"],
  SKBMR: ["fullName", "birthPlaceDate", "occupation", "address", "keterangan"],
  UMUM: ["fullName", "birthPlaceDate", "occupation", "address", "keterangan"],
  WARIS: ["fullName", "birthPlaceDate", "address", "banyaknyaAhliWaris", "keterangan"],
  SKTMS: ["fullName", "birthPlaceDate", "occupation", "address", "namaAnak", "keterangan"],
  USAHA: ["fullName", "birthPlaceDate", "occupation", "address", "namaUsaha", "keterangan"],
  DATANG: ["fullName", "birthPlaceDate", "occupation", "address", "alamatAsal", "keterangan"],
  PINDAH: ["fullName", "birthPlaceDate", "occupation", "address", "alamatTujuan", "keterangan"],
  KELAHIRAN: ["fullName", "birthPlaceDate", "namaAyah", "namaIbu", "address", "keterangan"],
  KEMATIAN: ["fullName", "birthPlaceDate", "hariTanggalMeninggal", "namaPelapor", "address", "keterangan"],
  PEMAKAMAN: ["fullName", "birthPlaceDate", "hariTanggalPemakaman", "tempatPemakaman", "namaPelapor", "keterangan"],
  PERTANAHAN: ["fullName", "birthPlaceDate", "identitasTanah", "penjual", "pembeli", "keterangan"],
  WALI: ["fullName", "birthPlaceDate", "occupation", "address", "waliDari", "keterangan"],
  SUIS: ["fullName", "birthPlaceDate", "calonName", "calonBirthPlaceDate", "address", "keterangan"],
  MENIKAH: ["fullName", "birthPlaceDate", "address", "calonName", "calonBirthPlaceDate", "calonAddress", "keterangan"],
  PENGHASILAN: ["fullName", "birthPlaceDate", "occupation", "address", "jumlahPenghasilan", "keterangan"],
};

function renderFormFields(classification) {
  const keys = CLASS_FIELDS[classification] || ["fullName", "birthPlaceDate", "occupation", "address", "keterangan"];
  dynamicFieldsEl.innerHTML = keys
    .map((k) => {
      const def = FIELD_DEFS[k];
      if (!def) return "";
      const required = def.required ? "required" : "";
      return `
        <div class="field span2">
          <label for="${k}">${def.label}</label>
          <input id="${k}" name="${k}" type="${def.type}" maxlength="${def.maxlength || ""}" placeholder="${def.placeholder || ""}" ${required} />
        </div>
      `;
    })
    .join("\n");
}

// Get column info (keys and labels) for displaying a classification's fields
function getDisplayColumns(classification) {
  const fieldKeys = CLASS_FIELDS[classification] || ["fullName", "birthPlaceDate", "occupation", "address"];
  return fieldKeys.map((k) => ({
    key: k,
    label: FIELD_DEFS[k]?.label || k,
  }));
}

// Extract display value from letter for a given field key
function getFieldValue(letter, fieldKey) {
  if (fieldKey === "fullName") return letter.fullName || "-";
  if (fieldKey === "birthPlaceDate") return letter.birthPlaceDate || "-";
  if (fieldKey === "occupation") return letter.occupation || "-";
  if (fieldKey === "address") return letter.address || "-";
  // All other custom fields come from letter.data
  return letter.data?.[fieldKey] || "-";
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

  // Get the selected classification to determine which columns to show
  // Use the form classification (no separate filter on table)
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
      const last = grouped[year][cls] ?? 0;
      const div = document.createElement("div");
      div.className = "counterCard";
      // Show month roman for all years and place number before '-Kel' (e.g. 460/2-Kel/I/2026)
      const monthRoman = monthToRoman(new Date().getMonth() + 1);
      const displayReg = `${CLASS_PREFIX[cls]}/${last}-Kel/${monthRoman}/${year}`;

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
  // Convert YYYY-MM-DD to DD-MM-YYYY
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || "-";
  const [year, month, day] = dateStr.split("-");
  return `${day}-${month}-${year}`;
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

  if (!fields.fullName || !fields.fullName.trim()) return alert("Nama lengkap wajib diisi.");

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

btnExportPDF.addEventListener("click", exportPDF);
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
    // Use export-specific filters (year and month)
    const yr = exportYear.value ? Number(exportYear.value) : null;
    const mo = exportMonth.value ? Number(exportMonth.value) : null;

    // Filter letters by year and month
    let letters = state.letters;
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
    const serviceName = allClassifications.length === 1 ? CLASS_LABEL[allClassifications[0]] || allClassifications[0] : "SEMUA JENIS PELAYANAN";

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
        sheetData.push([index + 1, letter.register_display, letter.letter_date || "-", ...displayCols.map((col) => getFieldValue(letter, col.key))]);
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
      if (draft.editingId) {
        editingId = draft.editingId;
        if (submitBtn) submitBtn.textContent = "Simpan Perubahan";
      }
    } catch (e) {
      console.warn("Gagal memulihkan draft:", e);
    }
  }

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
