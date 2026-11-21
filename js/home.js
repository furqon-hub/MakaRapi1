(() => {
  'use strict';

  if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  const STORAGE_KEY = 'rapimakalah_pro_editorial_v2';
  const HANDOFF_KEY = 'rapimakalah_pro_import_handoff_v1';
  const WINDOW_NAME_PREFIX = 'RAPIMAKALAH_HANDOFF:';

  let uploadedDoc = null; // { fileName, sizeBytes, text, wordCount, babCount, suggestedTitle }
  let uploadedGuideline = null; // { name, text } | null
  let dbGuidelinesById = {};

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const styles = {
      success: 'bg-white text-ink border-ink-okBorder border-l-[3px] border-l-ink-ok',
      info: 'bg-white text-ink border-paper-borderStrong border-l-[3px] border-l-ink-primary',
      warning: 'bg-white text-ink border-ink-warnBorder border-l-[3px] border-l-ink-warn',
      error: 'bg-white text-ink border-ink-errBorder border-l-[3px] border-l-ink-err',
    };
    const el = document.createElement('div');
    el.className = `toast-enter pointer-events-auto px-3 py-2.5 rounded-[4px] border shadow-md text-[12px] leading-snug ${styles[type] || styles.info}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity 0.2s ease';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 220);
    }, 3600);
  }

  function sanitizeAttr(str) {
    return String(str || '')
      .replace(/"/g, "'")
      .replace(/[\r\n]+/g, ' ')
      .replace(/\]/g, ')')
      .trim();
  }

  // Ekstraksi terstruktur khusus makalah .docx (mempertahankan gambar, tabel, daftar, kata pengantar, & daftar pustaka)
  async function extractDocxPaperStructured(file, onProgress) {
    if (!window.mammoth) {
      throw new Error('Pustaka pembaca Word (.docx) belum termuat. Periksa koneksi internet Anda.');
    }

    onProgress(25, 'Membaca struktur dokumen Word (.docx)...');
    const ab = await file.arrayBuffer();
    onProgress(55, 'Mengekstrak teks, gambar, dan tabel...');
    const res = await window.mammoth.convertToHtml({ arrayBuffer: ab });
    const html = res.value || '';

    const parser = new DOMParser();
    const dom = parser.parseFromString(html, 'text/html');

    // 1. Kumpulkan node tingkat atas menjadi daftar item terstruktur
    const rawItems = [];
    const pushParagraphText = (text) => {
      const cleaned = String(text || '').replace(/\u00A0/g, ' ').replace(/[ \t]+/g, ' ').trim();
      if (cleaned) rawItems.push({ kind: 'p', text: cleaned });
    };

    const walkElement = (el) => {
      if (!el || el.nodeType !== 1) return;
      const tag = el.tagName.toUpperCase();

      if (tag === 'TABLE') {
        const rows = [];
        el.querySelectorAll('tr').forEach((tr) => {
          const cells = [];
          tr.querySelectorAll(':scope > th, :scope > td').forEach((cell) => {
            const ct = (cell.textContent || '')
              .replace(/\u00A0/g, ' ')
              .replace(/\s+/g, ' ')
              .replace(/\|/g, '/')
              .trim();
            cells.push(ct);
          });
          if (cells.some((c) => c !== '')) rows.push(cells);
        });
        if (rows.length > 0) rawItems.push({ kind: 'table', rows });
        return;
      }

      if (tag === 'OL' || tag === 'UL') {
        let idx = 1;
        el.querySelectorAll(':scope > li').forEach((li) => {
          const imgs = li.querySelectorAll('img');
          imgs.forEach((img) => {
            const src = img.getAttribute('src') || '';
            if (src) rawItems.push({ kind: 'img', src, alt: img.getAttribute('alt') || '' });
          });
          const lt = (li.textContent || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
          if (lt) {
            const alreadyNumbered = /^(?:\d+[\.\)]|[-•*])\s+/.test(lt);
            pushParagraphText(alreadyNumbered ? lt : tag === 'OL' ? `${idx}. ${lt}` : `- ${lt}`);
            idx++;
          }
        });
        return;
      }

      if (tag === 'P' || /^H[1-6]$/.test(tag)) {
        const imgs = el.querySelectorAll('img');
        if (imgs.length > 0) {
          const clone = el.cloneNode(true);
          clone.querySelectorAll('img').forEach((im) => im.remove());
          const textBeside = (clone.textContent || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
          if (textBeside) pushParagraphText(textBeside);
          imgs.forEach((img) => {
            const src = img.getAttribute('src') || '';
            if (src) rawItems.push({ kind: 'img', src, alt: img.getAttribute('alt') || '' });
          });
        } else {
          pushParagraphText(el.textContent || '');
        }
        return;
      }

      if (tag === 'IMG') {
        const src = el.getAttribute('src') || '';
        if (src) rawItems.push({ kind: 'img', src, alt: el.getAttribute('alt') || '' });
        return;
      }

      Array.from(el.children).forEach(walkElement);
    };

    Array.from(dom.body.children).forEach(walkElement);

    // 2. Pasangkan caption (Gambar/Tabel) & baris Sumber dengan elemen gambar/tabel terkait
    const FIG_CAP_RX = /^(?:Gambar|Gbr\.?|Figure|Fig\.?)\s*\d*(?:\.\d+)*\s*[:.\-–—]?\s*(.+)$/i;
    const TBL_CAP_RX = /^(?:Tabel|Tbl\.?|Table)\s*\d*(?:\.\d+)*\s*[:.\-–—]?\s*(.+)$/i;
    const SRC_RX = /^Sumber\s*[:\-–—]\s*(.+)$/i;

    const consumed = new Set();
    const images = {};
    let imgCounter = 0;
    let tableCount = 0;
    let figureCount = 0;
    const emittedBlocks = [];

    for (let i = 0; i < rawItems.length; i++) {
      if (consumed.has(i)) continue;
      const item = rawItems[i];

      if (item.kind === 'img') {
        let title = '';
        let source = '';

        // Cek caption tepat sebelum gambar
        if (emittedBlocks.length > 0 && emittedBlocks[emittedBlocks.length - 1].kind === 'p') {
          const prevM = emittedBlocks[emittedBlocks.length - 1].text.match(FIG_CAP_RX);
          if (prevM) {
            title = prevM[1].trim();
            emittedBlocks.pop();
          }
        }
        // Cek caption tepat sesudah gambar bila belum ditemukan
        let nextIdx = i + 1;
        if (!title && nextIdx < rawItems.length && rawItems[nextIdx].kind === 'p') {
          const nextM = rawItems[nextIdx].text.match(FIG_CAP_RX);
          if (nextM) {
            title = nextM[1].trim();
            consumed.add(nextIdx);
            nextIdx++;
          }
        }
        // Cek baris Sumber sesudah gambar / caption
        if (nextIdx < rawItems.length && rawItems[nextIdx].kind === 'p') {
          const srcM = rawItems[nextIdx].text.match(SRC_RX);
          if (srcM) {
            source = srcM[1].trim();
            consumed.add(nextIdx);
          }
        }

        imgCounter++;
        figureCount++;
        const imgId = `img_docx_${imgCounter}`;
        images[imgId] = item.src;
        const safeTitle = sanitizeAttr(title || item.alt || `Gambar ${imgCounter}`);
        const sourceAttr = source ? ` sumber="${sanitizeAttr(source)}"` : '';
        emittedBlocks.push({
          kind: 'tag',
          text: `[GAMBAR id="${imgId}" judul="${safeTitle}"${sourceAttr} lebar="85"]`,
        });
        continue;
      }

      if (item.kind === 'table') {
        let title = '';
        let source = '';

        // Cek caption tepat sebelum tabel
        if (emittedBlocks.length > 0 && emittedBlocks[emittedBlocks.length - 1].kind === 'p') {
          const prevM = emittedBlocks[emittedBlocks.length - 1].text.match(TBL_CAP_RX);
          if (prevM) {
            title = prevM[1].trim();
            emittedBlocks.pop();
          }
        }
        let nextIdx = i + 1;
        if (!title && nextIdx < rawItems.length && rawItems[nextIdx].kind === 'p') {
          const nextM = rawItems[nextIdx].text.match(TBL_CAP_RX);
          if (nextM) {
            title = nextM[1].trim();
            consumed.add(nextIdx);
            nextIdx++;
          }
        }
        if (nextIdx < rawItems.length && rawItems[nextIdx].kind === 'p') {
          const srcM = rawItems[nextIdx].text.match(SRC_RX);
          if (srcM) {
            source = srcM[1].trim();
            consumed.add(nextIdx);
          }
        }

        tableCount++;
        const safeTitle = sanitizeAttr(title || `Tabel ${tableCount}`);
        const sourceAttr = source ? ` sumber="${sanitizeAttr(source)}"` : '';
        const rowLines = item.rows.map((r) => r.join(' | ')).join('\n');
        emittedBlocks.push({
          kind: 'tag',
          text: `[TABEL judul="${safeTitle}"${sourceAttr}]\n${rowLines}\n[/TABEL]`,
        });
        continue;
      }

      emittedBlocks.push({ kind: 'p', text: item.text });
    }

    // 3. Pisahkan bagian Judul Awal, Kata Pengantar, Daftar Isi lama, Isi Utama (BAB), dan Daftar Pustaka
    const BAB_RX = /^BAB\s+[IVXLCDM0-9]+\b/i;
    const PREFACE_RX = /^(?:KATA\s+PENGANTAR|PRAKATA)$/i;
    const FRONT_LIST_RX = /^(?:DAFTAR\s+ISI|DAFTAR\s+TABEL|DAFTAR\s+GAMBAR)$/i;
    const BIB_RX = /^(?:DAFTAR\s+PUSTAKA|REFERENSI|BIBLIOGRAFI)$/i;

    const firstBabIdx = emittedBlocks.findIndex((b) => b.kind === 'p' && BAB_RX.test(b.text));
    const bibIdx = emittedBlocks.findIndex((b, idx) => b.kind === 'p' && BIB_RX.test(b.text) && idx > Math.max(0, firstBabIdx));

    let suggestedTitle = '';
    let prefaceBody = '';
    let bibliography = '';

    // Ambil Daftar Pustaka di akhir dokumen
    let contentEndIdx = emittedBlocks.length;
    if (bibIdx !== -1) {
      contentEndIdx = bibIdx;
      const bibEntries = emittedBlocks
        .slice(bibIdx + 1)
        .filter((b) => b.kind === 'p' && b.text)
        .map((b) => b.text);
      bibliography = bibEntries.join('\n');
    }

    // Ambil Judul Cover & Kata Pengantar sebelum BAB I
    let bodyStartIdx = 0;
    if (firstBabIdx > 0) {
      const frontBlocks = emittedBlocks.slice(0, firstBabIdx);
      let mode = 'cover';
      const prefaceParas = [];
      for (const b of frontBlocks) {
        if (b.kind !== 'p') continue;
        if (PREFACE_RX.test(b.text)) {
          mode = 'preface';
          continue;
        }
        if (FRONT_LIST_RX.test(b.text)) {
          mode = 'front_list';
          continue;
        }
        if (mode === 'cover' && !suggestedTitle && !/^MAKALAH$/i.test(b.text) && b.text.length >= 10 && b.text.length <= 200) {
          suggestedTitle = b.text.toUpperCase();
        } else if (mode === 'preface') {
          prefaceParas.push(b.text);
        }
      }
      if (prefaceParas.length > 0) {
        prefaceBody = prefaceParas.join('\n\n');
      }
      bodyStartIdx = firstBabIdx;
    } else if (emittedBlocks.length > 0 && emittedBlocks[0].kind === 'p') {
      const firstLine = emittedBlocks[0].text;
      if (!BAB_RX.test(firstLine) && !PREFACE_RX.test(firstLine) && firstLine.length >= 10 && firstLine.length <= 180) {
        suggestedTitle = firstLine.toUpperCase();
      }
    }

    if (!suggestedTitle) {
      suggestedTitle = String(file.name || 'MAKALAH AKADEMIK')
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .trim()
        .toUpperCase();
    }

    const bodyBlocks = emittedBlocks.slice(bodyStartIdx, contentEndIdx);
    const bodyText = bodyBlocks.map((b) => b.text).join('\n\n').trim();
    const rawPreviewText = emittedBlocks.map((b) => b.text).join('\n\n').trim();

    onProgress(100, 'Ekstraksi selesai');
    return {
      bodyText: bodyText || rawPreviewText,
      rawPreviewText,
      suggestedTitle,
      prefaceBody,
      bibliography,
      images,
      tableCount,
      figureCount,
    };
  }

  // Ekstraksi teks datar untuk berkas pedoman kampus (.pdf, .docx, .txt, .md)
  async function extractDocumentFile(file, onProgress) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();

    if (ext === 'txt' || ext === 'md') {
      onProgress(40, 'Membaca berkas teks...');
      const text = await file.text();
      onProgress(100, 'Ekstraksi selesai');
      return text;
    }

    if (ext === 'docx') {
      if (!window.mammoth) {
        throw new Error('Pustaka pembaca Word (.docx) belum termuat. Periksa koneksi internet Anda.');
      }
      onProgress(35, 'Mengekstrak isi dokumen Word (.docx)...');
      const ab = await file.arrayBuffer();
      const res = await window.mammoth.extractRawText({ arrayBuffer: ab });
      onProgress(100, 'Ekstraksi selesai');
      return res.value || '';
    }

    if (ext === 'pdf') {
      if (!window.pdfjsLib) {
        throw new Error('Pustaka pembaca PDF belum termuat. Periksa koneksi internet Anda.');
      }
      onProgress(15, 'Memuat berkas PDF...');
      const ab = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: ab }).promise;
      const maxPages = Math.min(pdf.numPages, 80);
      const pageTexts = [];

      for (let p = 1; p <= maxPages; p++) {
        onProgress(15 + Math.round((p / maxPages) * 80), `Membaca halaman ${p} dari ${maxPages}...`);
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();

        let lines = [];
        let curLine = '';
        let lastY = null;

        for (const item of tc.items) {
          const str = item.str || '';
          const y = Array.isArray(item.transform) ? item.transform[5] : null;
          if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) {
            lines.push(curLine.trim());
            if (Math.abs(y - lastY) > 18) lines.push('');
            curLine = str;
          } else {
            curLine += (curLine && str && !curLine.endsWith(' ') && !str.startsWith(' ') ? ' ' : '') + str;
          }
          if (item.hasEOL) {
            lines.push(curLine.trim());
            curLine = '';
            lastY = null;
          } else if (y !== null) {
            lastY = y;
          }
        }
        if (curLine.trim()) lines.push(curLine.trim());
        pageTexts.push(lines.join('\n'));
      }

      const fullText = pageTexts.join('\n\n').trim();
      if (fullText.length < 20) {
        throw new Error('PDF tidak memiliki lapisan teks (kemungkinan hasil scan gambar). Konversi ke .docx atau tempel teks manual di editor.');
      }
      onProgress(100, 'Ekstraksi selesai');
      return fullText;
    }

    throw new Error('Format berkas tidak didukung. Unggah berkas .docx, .pdf, .txt, atau .md.');
  }

  function detectTitleFromText(rawText, fileName) {
    const lines = String(rawText || '')
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((l) => l.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim())
      .filter(Boolean);

    for (const line of lines.slice(0, 6)) {
      if (!/^BAB\s+[IVXLCDM0-9]+/i.test(line) && line.length >= 10 && line.length <= 160) {
        return line.toUpperCase();
      }
    }
    return String(fileName || 'MAKALAH AKADEMIK')
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim()
      .toUpperCase();
  }

  function saveHandoffAndNavigate(payload) {
    const serialized = JSON.stringify({ ...payload, createdAt: Date.now() });
    try {
      localStorage.setItem(HANDOFF_KEY, serialized);
    } catch {
      // Abaikan jika kuota localStorage penuh; gunakan sessionStorage & window.name
    }
    try {
      sessionStorage.setItem(HANDOFF_KEY, serialized);
    } catch {
      // Fallback via window.name
    }
    try {
      window.name = WINDOW_NAME_PREFIX + serialized;
    } catch {
      // Abaikan
    }
    window.location.href = 'index.html';
  }

  function renderUploadedPaperPreview() {
    const card = document.getElementById('paper-preview-card');
    const enterBtn = document.getElementById('btn-enter-with-file');

    if (!uploadedDoc) {
      card.classList.add('hidden');
      enterBtn.disabled = true;
      return;
    }

    document.getElementById('uploaded-file-name').textContent = uploadedDoc.fileName;
    const metaParts = [
      formatBytes(uploadedDoc.sizeBytes),
      `${uploadedDoc.wordCount.toLocaleString('id-ID')} kata`,
      `${uploadedDoc.babCount} BAB`,
    ];
    if (uploadedDoc.tableCount > 0) metaParts.push(`${uploadedDoc.tableCount} tabel`);
    if (uploadedDoc.figureCount > 0) metaParts.push(`${uploadedDoc.figureCount} gambar`);
    if (uploadedDoc.bibliography) metaParts.push('Daftar Pustaka');
    document.getElementById('uploaded-file-meta').textContent = metaParts.join(' · ');

    const snippetSource = (uploadedDoc.rawPreviewText || uploadedDoc.text || '').trim();
    const snippet = snippetSource.slice(0, 480);
    document.getElementById('uploaded-file-snippet').textContent =
      snippetSource.length > 480 ? `${snippet}...` : snippet;

    card.classList.remove('hidden');
    enterBtn.disabled = false;
  }

  async function handlePaperFile(file) {
    const progWrap = document.getElementById('paper-progress');
    const progLabel = document.getElementById('paper-progress-label');
    const progPct = document.getElementById('paper-progress-pct');
    const progBar = document.getElementById('paper-progress-bar');
    const errBox = document.getElementById('paper-error-box');

    errBox.classList.add('hidden');
    progWrap.classList.remove('hidden');

    const setProg = (pct, label) => {
      progBar.style.width = `${pct}%`;
      progPct.textContent = `${pct}%`;
      progLabel.textContent = label;
    };

    try {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (ext !== 'docx') {
        throw new Error('Format berkas tidak didukung. Hanya menerima file Microsoft Word (.docx).');
      }

      let extracted = null;
      let usedPython = false;
      if (window.MakaRapiAPI) {
        const apiInfo = await window.MakaRapiAPI.detectBackend();
        if (apiInfo.online) {
          setProg(35, 'Memproses .docx via server Python (python-docx)...');
          extracted = await window.MakaRapiAPI.parseDocx(file);
          if (extracted) {
            usedPython = true;
            setProg(100, 'Ekstraksi Python selesai');
          }
        }
      }
      if (!extracted) {
        extracted = await extractDocxPaperStructured(file, setProg);
      }

      const trimmed = (extracted.bodyText || '').trim();
      if (!trimmed) {
        throw new Error('Berkas tidak mengandung teks yang dapat dibaca.');
      }
      const fullWordsText = [extracted.prefaceBody, trimmed, extracted.bibliography].filter(Boolean).join(' ');
      const wordCount = extracted.wordCount || fullWordsText.split(/\s+/).filter(Boolean).length;
      const babCount =
        typeof extracted.babCount === 'number'
          ? extracted.babCount
          : (trimmed.match(/^(?:#+\s*)?(?:\*\*|__)?\s*BAB\s+[IVXLCDM0-9]+/gim) || []).length;
      uploadedDoc = {
        fileName: file.name,
        sizeBytes: file.size || 0,
        text: trimmed,
        rawPreviewText: extracted.rawPreviewText,
        wordCount,
        babCount,
        tableCount: extracted.tableCount || 0,
        figureCount: extracted.figureCount || 0,
        suggestedTitle: extracted.suggestedTitle,
        abstractBody: extracted.abstractBody || '',
        abstractKeywords: extracted.abstractKeywords || '',
        prefaceBody: extracted.prefaceBody || '',
        bibliography: extracted.bibliography || '',
        images: extracted.images || {},
        hasEquations: Boolean(extracted.hasEquations),
        hasFootnotes: Boolean(extracted.hasFootnotes),
      };
      setTimeout(() => progWrap.classList.add('hidden'), 350);
      renderUploadedPaperPreview();
      const engineTag = usedPython ? ' [Python]' : '';
      showToast(`Berhasil membaca "${file.name}" (${wordCount.toLocaleString('id-ID')} kata)${engineTag}.`, 'success');
    } catch (err) {
      progWrap.classList.add('hidden');
      uploadedDoc = null;
      renderUploadedPaperPreview();
      const msg =
        err?.name === 'PasswordException'
          ? 'PDF terlindungi kata sandi dan tidak dapat dibaca langsung.'
          : err?.message || 'Gagal membaca berkas makalah.';
      errBox.textContent = msg;
      errBox.classList.remove('hidden');
      showToast('Gagal memproses berkas makalah.', 'error');
    }
  }

  async function handleGuidelineFile(file) {
    const statusEl = document.getElementById('home-guideline-status');
    const badgeEl = document.getElementById('home-guideline-badge');
    const selectEl = document.getElementById('home-guideline-select');

    statusEl.textContent = `Membaca "${file.name}"...`;
    try {
      let text = '';
      if (window.MakaRapiAPI) {
        const apiInfo = await window.MakaRapiAPI.detectBackend();
        if (apiInfo.online) {
          const res = await window.MakaRapiAPI.parseGuideline(file);
          if (res && res.text) text = res.text;
        }
      }
      if (!text) {
        text = await extractDocumentFile(file, () => {});
      }
      if (!text.trim()) throw new Error('Berkas pedoman kosong.');
      uploadedGuideline = { name: file.name, text };
      selectEl.value = '';
      statusEl.textContent = `Terpilih: ${file.name}`;
      badgeEl.textContent = 'File Siap';
      badgeEl.classList.remove('hidden');
      showToast(`Pedoman "${file.name}" siap diterapkan di Workbench.`, 'success');
    } catch (err) {
      uploadedGuideline = null;
      statusEl.textContent = 'Gagal membaca file pedoman — coba format .pdf/.docx/.txt lain';
      badgeEl.classList.add('hidden');
      showToast(err?.message || 'Gagal membaca berkas pedoman.', 'error');
    }
  }

  function hydrateExistingDraftBanner() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.content !== 'string' || !parsed.content.trim()) return;

      const words = parsed.content.trim().split(/\s+/).filter(Boolean).length;
      const title = (parsed.cover?.title || 'Draft Makalah Tersimpan').trim();

      const btnCard = document.getElementById('btn-resume-draft');
      const btnHeader = document.getElementById('btn-header-resume');
      document.getElementById('draft-meta-badge').textContent = `${words.toLocaleString('id-ID')} kata`;
      document.getElementById('draft-title-preview').textContent = title;
      btnCard.classList.remove('hidden');
      btnHeader.classList.remove('hidden');
      btnHeader.classList.add('inline-flex');
    } catch {
      // Abaikan jika data lokal tidak valid
    }
  }

  function bindEvents() {
    // 1. Dropzone & File Input Makalah
    const dropzone = document.getElementById('paper-dropzone');
    const fileInput = document.getElementById('paper-file-input');

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
      }
    });
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dropzone-active');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dropzone-active');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dropzone-active');
      const file = e.dataTransfer?.files?.[0];
      if (file) handlePaperFile(file);
    });
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handlePaperFile(file);
      e.target.value = '';
    });

    document.getElementById('btn-remove-paper-file').addEventListener('click', () => {
      uploadedDoc = null;
      renderUploadedPaperPreview();
      fileInput.click();
    });

    // 2. Dropzone & Pilihan Pedoman Opsional
    const gDrop = document.getElementById('home-guideline-dropzone');
    const gInput = document.getElementById('home-guideline-input');
    const gSelect = document.getElementById('home-guideline-select');
    const gBadge = document.getElementById('home-guideline-badge');
    const gStatus = document.getElementById('home-guideline-status');

    gDrop.addEventListener('click', () => gInput.click());
    gDrop.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        gInput.click();
      }
    });
    gDrop.addEventListener('dragover', (e) => {
      e.preventDefault();
      gDrop.classList.add('dropzone-active');
    });
    gDrop.addEventListener('dragleave', () => {
      gDrop.classList.remove('dropzone-active');
    });
    gDrop.addEventListener('drop', (e) => {
      e.preventDefault();
      gDrop.classList.remove('dropzone-active');
      const file = e.dataTransfer?.files?.[0];
      if (file) handleGuidelineFile(file);
    });
    gInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handleGuidelineFile(file);
      e.target.value = '';
    });

    gSelect.addEventListener('change', () => {
      if (gSelect.value) {
        uploadedGuideline = null;
        gStatus.textContent = 'Template pedoman kampus terpilih';
        gBadge.textContent = 'Template Aktif';
        gBadge.classList.remove('hidden');
      } else if (!uploadedGuideline) {
        gStatus.textContent = 'Opsional — atau pilih template di bawah';
        gBadge.classList.add('hidden');
      }
    });

    // 4. Tombol Utama Masuk Workbench dengan File Terunggah
    document.getElementById('btn-enter-with-file').addEventListener('click', () => {
      if (!uploadedDoc) {
        showToast('Unggah berkas dokumen makalah terlebih dahulu.', 'warning');
        return;
      }
      const selectedGuidelineVal = gSelect.value || '';
      const selectedDbProfile = selectedGuidelineVal.startsWith('db:') ? dbGuidelinesById[selectedGuidelineVal.slice(3)] || null : null;
      saveHandoffAndNavigate({
        mode: 'import-file',
        fileName: uploadedDoc.fileName,
        content: uploadedDoc.text,
        suggestedTitle: uploadedDoc.suggestedTitle,
        abstractBody: uploadedDoc.abstractBody || '',
        abstractKeywords: uploadedDoc.abstractKeywords || '',
        prefaceBody: uploadedDoc.prefaceBody || '',
        bibliography: uploadedDoc.bibliography || '',
        images: uploadedDoc.images || {},
        tableCount: uploadedDoc.tableCount || 0,
        figureCount: uploadedDoc.figureCount || 0,
        importMeta: {
          hasEquations: Boolean(uploadedDoc.hasEquations),
          hasFootnotes: Boolean(uploadedDoc.hasFootnotes),
        },
        autoClean: document.getElementById('opt-auto-clean').checked,
        detectTitle: document.getElementById('opt-detect-title').checked,
        guidelineFile: uploadedGuideline,
        guidelineSample: selectedDbProfile ? '' : selectedGuidelineVal,
        guidelineDbProfile: selectedDbProfile,
      });
    });

    // 4. Tombol Mulai Cepat
    const goResume = () => {
      window.location.href = 'index.html';
    };
    document.getElementById('btn-resume-draft').addEventListener('click', goResume);
    document.getElementById('btn-header-resume').addEventListener('click', goResume);

    document.getElementById('btn-start-blank').addEventListener('click', () => {
      const selVal = gSelect.value || '';
      const dbProf = selVal.startsWith('db:') ? dbGuidelinesById[selVal.slice(3)] || null : null;
      saveHandoffAndNavigate({
        mode: 'blank',
        guidelineFile: uploadedGuideline,
        guidelineSample: dbProf ? '' : selVal,
        guidelineDbProfile: dbProf,
      });
    });

    document.getElementById('btn-start-sample').addEventListener('click', () => {
      const selVal = gSelect.value || '';
      const dbProf = selVal.startsWith('db:') ? dbGuidelinesById[selVal.slice(3)] || null : null;
      saveHandoffAndNavigate({
        mode: 'sample',
        guidelineFile: uploadedGuideline,
        guidelineSample: dbProf ? '' : selVal,
        guidelineDbProfile: dbProf,
      });
    });
  }

  async function hydrateDbGuidelinesSelect() {
    const gSelect = document.getElementById('home-guideline-select');
    if (!gSelect || !window.MakaRapiAPI) return;
    const items = await window.MakaRapiAPI.listGuidelines();
    if (!items || !items.length) return;
    const customs = items.filter((it) => !it.isBuiltin);
    if (!customs.length) return;

    const oldGroup = gSelect.querySelector('optgroup[data-db-group="1"]');
    if (oldGroup) oldGroup.remove();

    const grp = document.createElement('optgroup');
    grp.label = 'Tersimpan di Database (SQLite)';
    grp.setAttribute('data-db-group', '1');
    dbGuidelinesById = {};
    customs.forEach((it) => {
      dbGuidelinesById[String(it.id)] = it;
      const opt = document.createElement('option');
      opt.value = `db:${it.id}`;
      opt.textContent = it.description ? `${it.name} (${it.description})` : it.name;
      grp.appendChild(opt);
    });
    gSelect.appendChild(grp);
  }

  async function updateHybridEngineBadge() {
    const dot = document.getElementById('home-engine-dot');
    const label = document.getElementById('home-engine-label');
    if (!dot || !label || !window.MakaRapiAPI) return;
    const info = await window.MakaRapiAPI.detectBackend();
    if (info.online) {
      dot.classList.remove('bg-paper-borderStrong');
      dot.classList.add('bg-ink-ok');
      label.textContent = 'Hybrid Engine: Python (FastAPI)';
      hydrateDbGuidelinesSelect();
    } else {
      dot.classList.remove('bg-ink-ok');
      dot.classList.add('bg-paper-borderStrong');
      label.textContent = 'Mode Lokal (Browser)';
    }
  }

  function initSpecimenSwitcher() {
    const btnBefore = document.getElementById('specimen-btn-before');
    const btnAfter = document.getElementById('specimen-btn-after');
    const viewBefore = document.getElementById('specimen-view-before');
    const viewAfter = document.getElementById('specimen-view-after');
    const statusBefore = document.getElementById('specimen-status-before');
    const statusAfter = document.getElementById('specimen-status-after');
    const specLabel = document.getElementById('specimen-spec-label');
    if (!btnBefore || !btnAfter || !viewBefore || !viewAfter) return;

    const setMode = (mode, animate = false) => {
      const isAfter = mode === 'after';
      const activeView = isAfter ? viewAfter : viewBefore;
      viewAfter.classList.toggle('hidden', !isAfter);
      viewBefore.classList.toggle('hidden', isAfter);
      if (animate && activeView) {
        activeView.classList.remove('specimen-snap');
        void activeView.offsetWidth;
        activeView.classList.add('specimen-snap');
      }
      if (statusAfter) statusAfter.classList.toggle('hidden', !isAfter);
      if (statusBefore) statusBefore.classList.toggle('hidden', isAfter);
      if (specLabel) {
        specLabel.textContent = isAfter ? 'A4 · 4/4/3/3 cm · TNR 12 pt' : 'Sebelum diformat';
      }

      btnAfter.classList.toggle('bg-ink-primary', isAfter);
      btnAfter.classList.toggle('text-white', isAfter);
      btnAfter.classList.toggle('text-ink-muted', !isAfter);

      btnBefore.classList.toggle('bg-ink-primary', !isAfter);
      btnBefore.classList.toggle('text-white', !isAfter);
      btnBefore.classList.toggle('text-ink-muted', isAfter);
    };

    btnBefore.addEventListener('click', () => setMode('before', true));
    btnAfter.addEventListener('click', () => setMode('after', true));
    setMode('after', false);
  }

  function initMotionGuidePlayer() {
    const stage = document.getElementById('mg-stage');
    const stepBtns = Array.from(document.querySelectorAll('.mg-step-btn'));
    const scenes = [0, 1, 2, 3].map((i) => document.getElementById(`mg-scene-${i}`));
    const playBtn = document.getElementById('mg-play-toggle');
    const playLabel = document.getElementById('mg-play-label');
    const iconPause = document.getElementById('mg-icon-pause');
    const iconPlay = document.getElementById('mg-icon-play');
    const counterEl = document.getElementById('mg-counter');
    const pillEl = document.getElementById('mg-stage-pill');

    if (!stage || !stepBtns.length || scenes.some((s) => !s)) return;

    const STEP_DURATION_MS = 4800;
    const STEP_PILLS = [
      'Langkah 01: Impor .docx',
      'Langkah 02: Margin & Pedoman',
      'Langkah 03: Rapikan & Italic',
      'Langkah 04: Unduh Word Asli',
    ];

    let activeIdx = 0;
    let isPlaying = true;
    let timerId = null;

    const restartAnimations = (el) => {
      if (!el) return;
      const clone = el.cloneNode(true);
      el.parentNode.replaceChild(clone, el);
      return clone;
    };

    const scheduleNext = () => {
      clearTimeout(timerId);
      if (!isPlaying) return;
      timerId = setTimeout(() => {
        goToStep((activeIdx + 1) % scenes.length);
      }, STEP_DURATION_MS);
    };

    const updatePlayUI = () => {
      stage.classList.toggle('mg-paused', !isPlaying);
      stepBtns.forEach((btn) => {
        const bar = btn.querySelector('.mg-step-progress');
        if (bar) bar.style.animationPlayState = isPlaying ? 'running' : 'paused';
      });
      if (playLabel) playLabel.textContent = isPlaying ? 'Jeda' : 'Putar';
      if (iconPause) iconPause.classList.toggle('hidden', !isPlaying);
      if (iconPlay) iconPlay.classList.toggle('hidden', isPlaying);
    };

    const goToStep = (idx) => {
      activeIdx = idx;
      stepBtns.forEach((btn, i) => {
        const active = i === idx;
        btn.classList.toggle('mg-step-active', active);
        btn.classList.toggle('border-ink-primary/45', active);
        btn.classList.toggle('bg-white', active);
        btn.classList.toggle('border-paper-border', !active);
        btn.classList.toggle('bg-white/60', !active);
        const numSpan = btn.querySelector('span');
        if (numSpan) {
          numSpan.classList.toggle('text-ink-primary', active);
          numSpan.classList.toggle('text-ink-subtle', !active);
        }
        const bar = btn.querySelector('.mg-step-progress');
        if (bar) {
          bar.style.animation = 'none';
          void bar.offsetWidth;
          bar.style.animation = '';
          bar.style.animationPlayState = isPlaying ? 'running' : 'paused';
        }
      });

      scenes.forEach((sc, i) => {
        if (i === idx) {
          sc.classList.remove('hidden', 'mg-scene-active');
          const refreshed = restartAnimations(sc);
          scenes[i] = refreshed;
          refreshed.classList.add('mg-scene-active');
        } else {
          sc.classList.add('hidden');
          sc.classList.remove('mg-scene-active');
        }
      });

      if (counterEl) counterEl.textContent = `0${idx + 1} / 0${scenes.length}`;
      if (pillEl) pillEl.textContent = STEP_PILLS[idx] || '';
      scheduleNext();
    };

    stepBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.mgStep, 10);
        if (!Number.isNaN(idx)) goToStep(idx);
      });
    });

    if (playBtn) {
      playBtn.addEventListener('click', () => {
        isPlaying = !isPlaying;
        updatePlayUI();
        if (isPlaying) {
          goToStep(activeIdx);
        } else {
          clearTimeout(timerId);
        }
      });
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        clearTimeout(timerId);
      } else if (isPlaying) {
        scheduleNext();
      }
    });

    updatePlayUI();
    goToStep(0);
  }

  function init() {
    hydrateExistingDraftBanner();
    initSpecimenSwitcher();
    initMotionGuidePlayer();
    bindEvents();
    updateHybridEngineBadge();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
