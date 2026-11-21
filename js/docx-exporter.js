/* ==========================================================================
   MakaRapi — Native OOXML (.docx) Exporter
   Menghasilkan file Microsoft Word (.docx) asli (bukan HTML tersamar .doc)
   dengan dukungan penuh: Print Layout permanen saat Ctrl+S, Heading 1/2,
   Caption SEQ Tabel/Gambar, Field TOC/Daftar Tabel/Daftar Gambar dengan
   dot leader tab-stop asli, penomoran halaman Romawi & Arab per section,
   tabel akademik, gambar DrawingML, serta Daftar Pustaka hanging indent.
   ========================================================================== */
(() => {
  'use strict';

  // -------------------------------------------------------------------------
  // 1. Minimal PKZIP (STORE / uncompressed) Builder + CRC32 (Zero Dependency)
  // -------------------------------------------------------------------------
  const CRC_TABLE = (() => {
    const tbl = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      tbl[i] = c >>> 0;
    }
    return tbl;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  const textEncoder = new TextEncoder();

  function buildZipUint8Array(entries) {
    // entries: Array<{ name: string, data: Uint8Array | string }>
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    const now = new Date();
    const dosTime =
      ((now.getHours() & 0x1f) << 11) |
      ((now.getMinutes() & 0x3f) << 5) |
      ((now.getSeconds() >> 1) & 0x1f);
    const dosDate =
      (((Math.max(1980, now.getFullYear()) - 1980) & 0x7f) << 9) |
      (((now.getMonth() + 1) & 0x0f) << 5) |
      (now.getDate() & 0x1f);

    for (const entry of entries) {
      const nameBytes = textEncoder.encode(entry.name);
      const dataBytes =
        entry.data instanceof Uint8Array
          ? entry.data
          : textEncoder.encode(String(entry.data || ''));
      const crc = crc32(dataBytes);
      const size = dataBytes.length;

      // Local file header (30 bytes + filename)
      const localHdr = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(localHdr.buffer);
      lv.setUint32(0, 0x04034b50, true); // signature
      lv.setUint16(4, 20, true);         // version needed
      lv.setUint16(6, 0x0800, true);     // UTF-8 filename flag
      lv.setUint16(8, 0, true);          // method 0 = STORE
      lv.setUint16(10, dosTime, true);
      lv.setUint16(12, dosDate, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, size, true);
      lv.setUint32(22, size, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      localHdr.set(nameBytes, 30);

      localParts.push(localHdr, dataBytes);

      // Central directory header (46 bytes + filename)
      const centHdr = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(centHdr.buffer);
      cv.setUint32(0, 0x02014b50, true); // signature
      cv.setUint16(4, 20, true);         // version made by
      cv.setUint16(6, 20, true);         // version needed
      cv.setUint16(8, 0x0800, true);     // UTF-8 flag
      cv.setUint16(10, 0, true);         // method STORE
      cv.setUint16(12, dosTime, true);
      cv.setUint16(14, dosDate, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);    // local header offset
      centHdr.set(nameBytes, 46);

      centralParts.push(centHdr);
      offset += localHdr.length + dataBytes.length;
    }

    const centralOffset = offset;
    let centralSize = 0;
    for (const p of centralParts) centralSize += p.length;

    // End of central directory record (22 bytes)
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, centralOffset, true);
    ev.setUint16(20, 0, true);

    const totalLen = centralOffset + centralSize + eocd.length;
    const out = new Uint8Array(totalLen);
    let pos = 0;
    for (const p of localParts) { out.set(p, pos); pos += p.length; }
    for (const p of centralParts) { out.set(p, pos); pos += p.length; }
    out.set(eocd, pos);
    return out;
  }

  // -------------------------------------------------------------------------
  // 2. Utilitas XML, Satuan OOXML, & Konversi Data URL Gambar
  // -------------------------------------------------------------------------
  function xmlEsc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function cmToTwips(cm) {
    return Math.round((Number(cm) || 0) * 566.929133858);
  }

  function ptToTwips(pt) {
    return Math.round((Number(pt) || 0) * 20);
  }

  function ptToHalfPt(pt) {
    return Math.round((Number(pt) || 12) * 2);
  }

  function cmToEmu(cm) {
    return Math.round((Number(cm) || 0) * 360000);
  }

  function decodeBase64ToBytes(b64) {
    const clean = String(b64 || '').replace(/\s+/g, '');
    if (typeof atob === 'function') {
      const bin = atob(clean);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(clean, 'base64'));
    }
    return new Uint8Array(0);
  }

  function parseDataUrl(dataUrl) {
    const m = String(dataUrl || '').match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/i);
    if (!m) return null;
    const rawExt = m[1].toLowerCase();
    const ext = rawExt === 'jpg' ? 'jpeg' : rawExt;
    const bytes = decodeBase64ToBytes(m[2]);
    if (!bytes.length) return null;
    return { ext, bytes };
  }

  // Baca dimensi intrinsik PNG/JPEG langsung dari header biner bila tersedia
  function readImageDimensionsFromBytes(bytes, ext) {
    if (!bytes || bytes.length < 24) return null;
    if (ext === 'png' && bytes[0] === 0x89 && bytes[1] === 0x50) {
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const w = dv.getUint32(16, false);
      const h = dv.getUint32(20, false);
      if (w > 0 && h > 0) return { w, h };
    }
    if (ext === 'jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8) {
      let i = 2;
      while (i + 9 < bytes.length) {
        if (bytes[i] !== 0xff) { i++; continue; }
        const marker = bytes[i + 1];
        if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
          const h = (bytes[i + 5] << 8) | bytes[i + 6];
          const w = (bytes[i + 7] << 8) | bytes[i + 8];
          if (w > 0 && h > 0) return { w, h };
          break;
        }
        const segLen = (bytes[i + 2] << 8) | bytes[i + 3];
        if (segLen < 2) break;
        i += 2 + segLen;
      }
    }
    return null;
  }

  // Ubah HTML sederhana (hasil sitasi <i>/<em>/<b>/<strong>) menjadi daftar <w:r>
  function htmlInlineToRunsXml(htmlStr, baseOpts = {}) {
    const raw = String(htmlStr || '');
    const tokens = raw.split(/(<\/?(?:i|em|b|strong|br\s*\/?)>)/gi);
    let italic = Boolean(baseOpts.italic);
    let bold = Boolean(baseOpts.bold);
    const szHalfPt = baseOpts.szHalfPt || 0;
    const runs = [];

    const decodeEntities = (s) =>
      s
        .replace(/&nbsp;/gi, '\u00A0')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'");

    for (const tok of tokens) {
      if (!tok) continue;
      const lower = tok.toLowerCase();
      if (lower === '<i>' || lower === '<em>') { italic = true; continue; }
      if (lower === '</i>' || lower === '</em>') { italic = Boolean(baseOpts.italic); continue; }
      if (lower === '<b>' || lower === '<strong>') { bold = true; continue; }
      if (lower === '</b>' || lower === '</strong>') { bold = Boolean(baseOpts.bold); continue; }
      if (/^<br\s*\/?>$/i.test(lower)) {
        runs.push('<w:r><w:br/></w:r>');
        continue;
      }
      const plain = decodeEntities(tok.replace(/<[^>]+>/g, ''));
      if (!plain) continue;
      // Urutan elemen <w:rPr> sesuai skema OOXML: b/bCs -> i/iCs -> sz/szCs
      const rPrInner =
        `${bold ? '<w:b/><w:bCs/>' : ''}` +
        `${italic ? '<w:i/><w:iCs/>' : ''}` +
        `${szHalfPt ? `<w:sz w:val="${szHalfPt}"/><w:szCs w:val="${szHalfPt}"/>` : ''}`;
      const rPrXml = rPrInner ? `<w:rPr>${rPrInner}</w:rPr>` : '';
      runs.push(`<w:r>${rPrXml}<w:t xml:space="preserve">${xmlEsc(plain)}</w:t></w:r>`);
    }
    return runs.join('');
  }

  function textRun(text, rPrInner = '') {
    const rPr = rPrInner ? `<w:rPr>${rPrInner}</w:rPr>` : '';
    return `<w:r>${rPr}<w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r>`;
  }

  function fieldRuns(instr, displayText, rPrInner = '') {
    const rPr = rPrInner ? `<w:rPr>${rPrInner}</w:rPr>` : '';
    return (
      `<w:r>${rPr}<w:fldChar w:fldCharType="begin"/></w:r>` +
      `<w:r>${rPr}<w:instrText xml:space="preserve"> ${xmlEsc(instr)} </w:instrText></w:r>` +
      `<w:r>${rPr}<w:fldChar w:fldCharType="separate"/></w:r>` +
      `<w:r>${rPr}<w:t xml:space="preserve">${xmlEsc(displayText)}</w:t></w:r>` +
      `<w:r>${rPr}<w:fldChar w:fldCharType="end"/></w:r>`
    );
  }

  // -------------------------------------------------------------------------
  // 3. Generator Dokumen OOXML (.docx) Lengkap
  // -------------------------------------------------------------------------
  function buildDocxUint8Array(opts) {
    const {
      format: f,
      paper,
      typo,
      cover,
      abstract,
      preface,
      coverLogoDataUrl,
      tocEntries = [],
      lotEntries = [],
      lofEntries = [],
      chapters = [],
      finalBib = [],
      citStyle = 'apa',
      resolveInlineHtml,
      resolveFigureDataUrl,
      imageDimensions = {},
    } = opts;

    const fontName = String(f.fontFamily || 'Times New Roman').replace(/['"]/g, '').trim() || 'Times New Roman';
    const fontHalfPt = ptToHalfPt(typo.fontSizePt);
    const headingHalfPt = ptToHalfPt(typo.headingFontSizePt);
    const lineRuleVal = Math.round((Number(typo.lineHeight) || 1.5) * 240);
    const firstIndentTwips = cmToTwips(typo.firstIndentCm);
    const spaceBeforePt = Math.max(0, Math.min(36, Number(typo.spaceBeforePt ?? f.spaceBefore ?? 0) || 0));
    const spaceAfterPt = Math.max(0, Math.min(36, Number(typo.spaceAfterPt ?? f.spaceAfter ?? 0) || 0));
    const spaceBeforeTwips = ptToTwips(spaceBeforePt);
    const spaceAfterTwips = ptToTwips(spaceAfterPt);
    const applySpacingToHeadings = Boolean(typo.applySpacingToHeadings ?? f.applySpacingToHeadings);
    const h1BeforeTwips = applySpacingToHeadings ? spaceBeforeTwips : 0;
    const h1AfterTwips = applySpacingToHeadings ? spaceAfterTwips : ptToTwips(14);
    const h2BeforeTwips = applySpacingToHeadings ? spaceBeforeTwips : ptToTwips(10);
    const h2AfterTwips = applySpacingToHeadings ? spaceAfterTwips : ptToTwips(4);
    const h3BeforeTwips = applySpacingToHeadings ? spaceBeforeTwips : ptToTwips(6);
    const h3AfterTwips = applySpacingToHeadings ? spaceAfterTwips : ptToTwips(3);
    const bodyJc = typo.textAlign === 'left' ? 'left' : 'both';
    const numMode = f.pageNumberMode || 'skripsi';

    const pageWTwips = cmToTwips(paper.widthCm);
    const pageHTwips = cmToTwips(paper.heightCm);
    const marginTopTwips = cmToTwips(f.marginTop);
    const marginRightTwips = cmToTwips(f.marginRight);
    const marginBottomTwips = cmToTwips(f.marginBottom);
    const marginLeftTwips = cmToTwips(f.marginLeft);
    const contentWidthCm = Math.max(8, Number(paper.widthCm) - Number(f.marginLeft) - Number(f.marginRight));
    const contentWidthTwips = cmToTwips(contentWidthCm);

    // Manajemen media gambar, relasi, dan penomoran daftar otomatis (word/numbering.xml)
    const mediaFiles = []; // { name, relId, bytes, ext }
    let mediaCounter = 0;
    let drawingIdCounter = 1;

    const listNums = []; // Array<{ numId, abstractNumId }>
    const customAbstractNums = []; // Array<[absId, fmt, lvlText, rFont, leftTw, hangTw, isBold]>
    const customAbsCache = {};
    let nextCustomAbsId = 6;
    let listNumCounter = 1;

    function allocateListNumId(firstMarker) {
      const m = String(firstMarker || '').trim();
      let absId = 4; // bullet
      if (/^\d+\.$/.test(m)) absId = 0;
      else if (/^\d+\)$/.test(m)) absId = 1;
      else if (/^[a-z]\.$/.test(m)) absId = 2;
      else if (/^[a-z]\)$/.test(m)) absId = 3;
      const numId = listNumCounter++;
      listNums.push({ numId, abstractNumId: absId });
      return numId;
    }

    function allocateSubbabNumId(kind, prefixStr = '', trailingDot = '') {
      let absId = 5; // subbab_alpha (A., B., C.)
      if (kind === 'subbab_dec') {
        const key = `${prefixStr}:${trailingDot}`;
        if (customAbsCache[key] != null) {
          absId = customAbsCache[key];
        } else {
          absId = nextCustomAbsId++;
          customAbsCache[key] = absId;
          customAbstractNums.push([
            absId,
            'decimal',
            xmlEsc(`${prefixStr}.%1${trailingDot}`),
            xmlEsc(fontName),
            480,
            480,
            true,
          ]);
        }
      }
      const numId = listNumCounter++;
      listNums.push({ numId, abstractNumId: absId });
      return numId;
    }

    function parseSubbabPrefix(rawText) {
      const s = String(rawText || '').trim();
      const mAlpha = s.match(/^([A-Z])\.\s+(.+)$/);
      if (mAlpha) return { kind: 'subbab_alpha', prefix: '', dot: '', cleanText: mAlpha[2].trim() };
      const mDec = s.match(/^(\d+(?:\.\d+)*)\.(\d+)(\.?)\s+(.+)$/);
      if (mDec) return { kind: 'subbab_dec', prefix: mDec[1], dot: mDec[3], cleanText: mDec[4].trim() };
      return { kind: null, prefix: '', dot: '', cleanText: s };
    }

    function registerImage(dataUrl, preferredWidthCm, fallbackAspect = 16 / 9) {
      const parsed = parseDataUrl(dataUrl);
      if (!parsed) return null;
      mediaCounter++;
      const relId = `rIdImg${mediaCounter}`;
      const fileExt = parsed.ext === 'jpeg' ? 'jpg' : parsed.ext;
      const mediaName = `media/image${mediaCounter}.${fileExt}`;
      mediaFiles.push({ name: `word/${mediaName}`, target: mediaName, relId, bytes: parsed.bytes, ext: parsed.ext });

      const cached = imageDimensions[dataUrl];
      const binDims = readImageDimensionsFromBytes(parsed.bytes, parsed.ext);
      const natW = (cached && cached.w) || (binDims && binDims.w) || 0;
      const natH = (cached && cached.h) || (binDims && binDims.h) || 0;
      const aspect = natW > 0 && natH > 0 ? natW / natH : fallbackAspect;

      let widthCm = Math.min(contentWidthCm, preferredWidthCm);
      let heightCm = widthCm / aspect;
      const maxHeightCm = Math.max(6, Number(paper.heightCm) - Number(f.marginTop) - Number(f.marginBottom) - 3.5);
      if (heightCm > maxHeightCm) {
        heightCm = maxHeightCm;
        widthCm = heightCm * aspect;
      }

      const cx = Math.max(360000, cmToEmu(widthCm));
      const cy = Math.max(360000, cmToEmu(heightCm));
      const docPrId = drawingIdCounter++;
      const picId = drawingIdCounter++;

      return (
        `<w:r><w:drawing>` +
        `<wp:inline distT="0" distB="0" distL="0" distR="0">` +
        `<wp:extent cx="${cx}" cy="${cy}"/>` +
        `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
        `<wp:docPr id="${docPrId}" name="Picture ${mediaCounter}"/>` +
        `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
        `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
        `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
        `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
        `<pic:nvPicPr><pic:cNvPr id="${picId}" name="image${mediaCounter}.${fileExt}"/><pic:cNvPicPr/></pic:nvPicPr>` +
        `<pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
        `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
        `</pic:pic>` +
        `</a:graphicData>` +
        `</a:graphic>` +
        `</wp:inline>` +
        `</w:drawing></w:r>`
      );
    }

    // Helper pembentuk <w:sectPr>
    function buildSectPrXml({ mode, numFmt = '', numStart = null }) {
      const refs = [];
      let titlePg = '';
      if (mode === 'none') {
        refs.push('<w:headerReference w:type="default" r:id="rIdHdrEmpty"/>');
        refs.push('<w:footerReference w:type="default" r:id="rIdFtrEmpty"/>');
      } else if (mode === 'bottom-center') {
        refs.push('<w:headerReference w:type="default" r:id="rIdHdrEmpty"/>');
        refs.push('<w:footerReference w:type="default" r:id="rIdFtrCenter"/>');
      } else if (mode === 'top-right') {
        refs.push('<w:headerReference w:type="default" r:id="rIdHdrTopRight"/>');
        refs.push('<w:footerReference w:type="default" r:id="rIdFtrEmpty"/>');
      } else {
        // skripsi: halaman pertama BAB/bagian di tengah bawah, halaman lanjutan di pojok kanan atas
        refs.push('<w:headerReference w:type="first" r:id="rIdHdrEmpty"/>');
        refs.push('<w:footerReference w:type="first" r:id="rIdFtrCenter"/>');
        refs.push('<w:headerReference w:type="default" r:id="rIdHdrTopRight"/>');
        refs.push('<w:footerReference w:type="default" r:id="rIdFtrEmpty"/>');
        titlePg = '<w:titlePg/>';
      }

      const pgNumAttrs = [];
      if (numFmt) pgNumAttrs.push(`w:fmt="${numFmt}"`);
      if (numStart != null) pgNumAttrs.push(`w:start="${numStart}"`);
      const pgNumXml = pgNumAttrs.length ? `<w:pgNumType ${pgNumAttrs.join(' ')}/>` : '';

      return (
        `<w:sectPr>` +
        refs.join('') +
        `<w:pgSz w:w="${pageWTwips}" w:h="${pageHTwips}"/>` +
        `<w:pgMar w:top="${marginTopTwips}" w:right="${marginRightTwips}" w:bottom="${marginBottomTwips}" w:left="${marginLeftTwips}" w:header="${cmToTwips(1.5)}" w:footer="${cmToTwips(1.5)}" w:gutter="0"/>` +
        pgNumXml +
        titlePg +
        `</w:sectPr>`
      );
    }

    // Helper pembentuk paragraf Heading 1 & Heading 2
    function heading1Xml(linesArray, pageBreakBefore = false) {
      const pbb = pageBreakBefore ? '<w:pageBreakBefore/>' : '';
      const runs = linesArray
        .filter((l) => l !== '')
        .map((l, idx) => (idx > 0 ? `<w:r><w:br/></w:r>${textRun(l)}` : textRun(l)))
        .join('');
      return (
        `<w:p><w:pPr><w:pStyle w:val="Heading1"/>${pbb}</w:pPr>${runs}</w:p>`
      );
    }

    function heading2Xml(htmlContent, numId = null) {
      const numPr = numId != null ? `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>` : '';
      return (
        `<w:p><w:pPr><w:pStyle w:val="Heading2"/>${numPr}</w:pPr>${htmlInlineToRunsXml(htmlContent)}</w:p>`
      );
    }

    function heading3Xml(htmlContent, numId = null) {
      const numPr = numId != null ? `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>` : '';
      return (
        `<w:p><w:pPr><w:pStyle w:val="Heading3"/>${numPr}</w:pPr>${htmlInlineToRunsXml(htmlContent)}</w:p>`
      );
    }

    // Helper pembentuk Field TOC / Daftar Tabel / Daftar Gambar (Paragraf + Right Dotted Tab Stop, BUKAN Tabel)
    function buildTocSectionXml(title, entries, fieldInstr, isTof, pageBreakBefore) {
      const out = [heading1Xml([title], pageBreakBefore)];
      const safeEntries = entries && entries.length ? entries : [];

      if (!safeEntries.length) {
        const styleId = isTof ? 'TableofFigures' : 'TOC1';
        out.push(
          `<w:p><w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>` +
          fieldRuns(fieldInstr, '(Belum ada entri — klik kanan lalu pilih Update Field)', '<w:i/><w:color w:val="555555"/>') +
          `</w:p>`
        );
        return out.join('');
      }

      safeEntries.forEach((e, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === safeEntries.length - 1;
        const styleId = isTof ? 'TableofFigures' : e.level >= 3 ? 'TOC3' : e.level === 2 ? 'TOC2' : 'TOC1';
        const rPr = !isTof && e.bold ? '<w:b/><w:bCs/>' : '';
        const rPrTag = rPr ? `<w:rPr>${rPr}</w:rPr>` : '';

        let content = '';
        if (isFirst) {
          content +=
            `<w:r>${rPrTag}<w:fldChar w:fldCharType="begin"/></w:r>` +
            `<w:r>${rPrTag}<w:instrText xml:space="preserve"> ${xmlEsc(fieldInstr)} </w:instrText></w:r>` +
            `<w:r>${rPrTag}<w:fldChar w:fldCharType="separate"/></w:r>`;
        }
        content +=
          `<w:r>${rPrTag}<w:t xml:space="preserve">${xmlEsc(e.title)}</w:t></w:r>` +
          `<w:r>${rPrTag}<w:tab/></w:r>` +
          `<w:r>${rPrTag}<w:t xml:space="preserve">${xmlEsc(String(e.page))}</w:t></w:r>`;
        if (isLast) {
          content += `<w:r>${rPrTag}<w:fldChar w:fldCharType="end"/></w:r>`;
        }

        out.push(`<w:p><w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>${content}</w:p>`);
      });

      return out.join('');
    }

    // Helper pembentuk Caption SEQ Tabel / Gambar
    function buildCaptionXml(numberLabel, title, defaultKind, centered) {
      const m = String(numberLabel || '').trim().match(/^(Tabel|Gambar)\s+(?:(\d+)\.)?(\d+)$/i);
      const jcXml = centered ? '<w:jc w:val="center"/>' : '<w:jc w:val="left"/>';
      const spacingXml = centered
        ? `<w:spacing w:before="${ptToTwips(4)}" w:after="${ptToTwips(3)}" w:line="288" w:lineRule="auto"/>`
        : `<w:spacing w:before="${ptToTwips(10)}" w:after="${ptToTwips(4)}" w:line="288" w:lineRule="auto"/>`;
      const keepNextXml = centered ? '' : '<w:keepNext/>';

      let labelRuns = '';
      if (m) {
        const kind = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() || defaultKind;
        const babPrefix = m[2] ? `${m[2]}.` : '';
        const seqNum = m[3];
        const instr = `SEQ ${kind} \\* ARABIC${babPrefix ? ' \\s 1' : ''}`;
        labelRuns =
          textRun(`${kind} ${babPrefix}`, '<w:b/><w:bCs/>') +
          fieldRuns(instr, seqNum, '<w:b/><w:bCs/>') +
          textRun('. ', '<w:b/><w:bCs/>');
      } else {
        labelRuns = textRun(`${numberLabel}. `, '<w:b/><w:bCs/>');
      }

      return (
        `<w:p><w:pPr><w:pStyle w:val="Caption"/>${keepNextXml}${spacingXml}${jcXml}</w:pPr>` +
        labelRuns +
        textRun(title) +
        `</w:p>`
      );
    }

    // Helper pembentuk Tabel Akademik OOXML
    function buildAcademicTableXml(block) {
      const rows = block.rows || [];
      if (!rows.length) return '';
      const colCount = Math.max(1, ...rows.map((r) => r.length));
      const colW = Math.floor(contentWidthTwips / colCount);
      const tblFontHalfPt = ptToHalfPt(Math.max(typo.fontSizePt - 1, 10));

      const gridCols = Array.from({ length: colCount }, () => `<w:gridCol w:w="${colW}"/>`).join('');
      const borderSpec = 'w:val="single" w:sz="6" w:space="0" w:color="000000"';
      const tblPr =
        `<w:tblPr>` +
        `<w:tblW w:w="${contentWidthTwips}" w:type="dxa"/>` +
        `<w:tblBorders>` +
        `<w:top ${borderSpec}/><w:left ${borderSpec}/><w:bottom ${borderSpec}/><w:right ${borderSpec}/>` +
        `<w:insideH ${borderSpec}/><w:insideV ${borderSpec}/>` +
        `</w:tblBorders>` +
        `<w:tblCellMar>` +
        `<w:top w:w="80" w:type="dxa"/><w:left w:w="110" w:type="dxa"/>` +
        `<w:bottom w:w="80" w:type="dxa"/><w:right w:w="110" w:type="dxa"/>` +
        `</w:tblCellMar>` +
        `</w:tblPr>`;

      const trs = rows
        .map((row, rIdx) => {
          const isHdr = rIdx === 0;
          const trPr = isHdr ? '<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>' : '<w:trPr><w:cantSplit/></w:trPr>';
          const cells = Array.from({ length: colCount }, (_, cIdx) => {
            const cellRaw = row[cIdx] || '';
            const cellHtml = resolveInlineHtml ? resolveInlineHtml(cellRaw) : xmlEsc(cellRaw);
            const shd = isHdr ? '<w:shd w:val="clear" w:color="auto" w:fill="F4F3EF"/>' : '';
            return (
              `<w:tc>` +
              `<w:tcPr><w:tcW w:w="${colW}" w:type="dxa"/>${shd}<w:vAlign w:val="top"/></w:tcPr>` +
              `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="288" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="left"/></w:pPr>` +
              `${htmlInlineToRunsXml(cellHtml, { bold: isHdr, szHalfPt: tblFontHalfPt })}` +
              `</w:p></w:tc>`
            );
          }).join('');
          return `<w:tr>${trPr}${cells}</w:tr>`;
        })
        .join('');

      return `<w:tbl>${tblPr}<w:tblGrid>${gridCols}</w:tblGrid>${trs}</w:tbl>`;
    }

    // -----------------------------------------------------------------------
    // 4. Susun Semua Section Dokumen
    // -----------------------------------------------------------------------
    const sections = []; // Array<{ contentXml: string, sectPrXml: string }>

    // A. Section Cover
    if (f.showCover) {
      const c = cover || {};
      const titleHalfPt = ptToHalfPt(Math.max(typo.headingFontSizePt, typo.fontSizePt + 2));
      const subHalfPt = ptToHalfPt(Math.max(typo.fontSizePt - 1, 10));
      const authorLines = (c.authors || '').split('\n').map((l) => l.trim()).filter(Boolean);
      const prodiLines = (c.prodi || '').split('\n').map((l) => l.trim()).filter(Boolean);

      const parts = [];
      parts.push(
        `<w:p><w:pPr><w:spacing w:before="${ptToTwips(12)}" w:after="${ptToTwips(16)}" w:line="336" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>` +
        textRun((c.title || 'JUDUL MAKALAH').toUpperCase(), `<w:b/><w:bCs/><w:sz w:val="${titleHalfPt}"/><w:szCs w:val="${titleHalfPt}"/>`) +
        `</w:p>`
      );
      parts.push(
        `<w:p><w:pPr><w:spacing w:before="0" w:after="${ptToTwips(10)}" w:line="288" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>` +
        textRun('MAKALAH', '<w:b/><w:bCs/>') +
        `</w:p>`
      );
      if (c.subtitle) {
        parts.push(
          `<w:p><w:pPr><w:spacing w:before="0" w:after="${ptToTwips(6)}" w:line="288" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>` +
          textRun(c.subtitle, `<w:sz w:val="${subHalfPt}"/><w:szCs w:val="${subHalfPt}"/>`) +
          `</w:p>`
        );
      }
      if (c.lecturer) {
        parts.push(
          `<w:p><w:pPr><w:spacing w:before="0" w:after="${ptToTwips(16)}" w:line="288" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>` +
          textRun(`Dosen Pengampu: ${c.lecturer}`, `<w:sz w:val="${subHalfPt}"/><w:szCs w:val="${subHalfPt}"/>`) +
          `</w:p>`
        );
      }

      const logoDrawing = coverLogoDataUrl ? registerImage(coverLogoDataUrl, 3.4, 1) : null;
      if (logoDrawing) {
        parts.push(
          `<w:p><w:pPr><w:spacing w:before="${ptToTwips(36)}" w:after="${ptToTwips(36)}"/><w:jc w:val="center"/></w:pPr>${logoDrawing}</w:p>`
        );
      } else {
        parts.push(
          `<w:p><w:pPr><w:spacing w:before="${ptToTwips(72)}" w:after="${ptToTwips(48)}"/><w:jc w:val="center"/></w:pPr></w:p>`
        );
      }

      if (authorLines.length) {
        parts.push(
          `<w:p><w:pPr><w:spacing w:before="${ptToTwips(16)}" w:after="${ptToTwips(8)}"/><w:jc w:val="center"/></w:pPr>` +
          textRun('Disusun Oleh:', '<w:b/><w:bCs/>') +
          `</w:p>`
        );
        authorLines.forEach((line) => {
          parts.push(
            `<w:p><w:pPr><w:spacing w:before="0" w:after="${ptToTwips(3)}" w:line="288" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>` +
            textRun(line) +
            `</w:p>`
          );
        });
      }

      const instLines = [...prodiLines];
      if (c.university) instLines.push(c.university);
      if (c.year) instLines.push(String(c.year));
      if (instLines.length) {
        const instRuns = instLines
          .map((l, idx) => (idx > 0 ? `<w:r><w:br/></w:r>${textRun(l.toUpperCase(), '<w:b/><w:bCs/>')}` : textRun(l.toUpperCase(), '<w:b/><w:bCs/>')))
          .join('');
        parts.push(
          `<w:p><w:pPr><w:spacing w:before="${ptToTwips(56)}" w:after="0" w:line="336" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>${instRuns}</w:p>`
        );
      }

      sections.push({
        contentXml: parts.join(''),
        sectPrXml: buildSectPrXml({ mode: 'none' }),
      });
    }

    // B. Section Halaman Awal (Romawi kecil: Abstrak, Kata Pengantar, Daftar Isi, Daftar Tabel, Daftar Gambar)
    const frontParts = [];
    if (f.showAbstract) {
      const ab = abstract || {};
      const abParas = (ab.body || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
      const abXml = [heading1Xml(['ABSTRAK'], false)];
      abParas.forEach((para) => {
        abXml.push(
          `<w:p><w:pPr><w:spacing w:before="0" w:after="${ptToTwips(6)}" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="${bodyJc}"/></w:pPr>` +
          htmlInlineToRunsXml(resolveInlineHtml ? resolveInlineHtml(para) : xmlEsc(para)) +
          `</w:p>`
        );
      });
      if (ab.keywords && String(ab.keywords).trim()) {
        abXml.push(
          `<w:p><w:pPr><w:spacing w:before="${ptToTwips(6)}" w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="left"/></w:pPr>` +
          textRun('Kata Kunci: ', '<w:b/><w:bCs/>') +
          textRun(String(ab.keywords).trim(), '<w:i/><w:iCs/>') +
          `</w:p>`
        );
      }
      frontParts.push(abXml.join(''));
    }
    if (f.showPreface) {
      const p = preface || {};
      const paras = (p.body || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
      const prefXml = [heading1Xml(['KATA PENGANTAR'], frontParts.length > 0)];
      paras.forEach((para) => {
        prefXml.push(
          `<w:p><w:pPr><w:spacing w:before="${spaceBeforeTwips}" w:after="${spaceAfterTwips}" w:line="${lineRuleVal}" w:lineRule="auto"/><w:ind w:firstLine="${firstIndentTwips}"/><w:jc w:val="${bodyJc}"/></w:pPr>` +
          textRun(para) +
          `</w:p>`
        );
      });
      const sigIndent = Math.round(contentWidthTwips * 0.6);
      const sigRuns =
        (p.cityDate ? `${textRun(p.cityDate)}<w:r><w:br/></w:r>` : '') +
        `<w:r><w:br/></w:r><w:r><w:br/></w:r><w:r><w:br/></w:r>` +
        textRun(p.signature || 'Penyusun', '<w:b/><w:bCs/>');
      prefXml.push(
        `<w:p><w:pPr><w:spacing w:before="${ptToTwips(24)}" w:after="0" w:line="320" w:lineRule="auto"/><w:ind w:left="${sigIndent}" w:firstLine="0"/><w:jc w:val="left"/></w:pPr>${sigRuns}</w:p>`
      );
      frontParts.push(prefXml.join(''));
    }

    if (f.showToc) {
      frontParts.push(buildTocSectionXml('DAFTAR ISI', tocEntries, 'TOC \\o "1-3" \\h \\z \\u', false, frontParts.length > 0));
    }
    if (f.showLot) {
      frontParts.push(buildTocSectionXml('DAFTAR TABEL', lotEntries, 'TOC \\h \\z \\c "Tabel"', true, frontParts.length > 0));
    }
    if (f.showLof) {
      frontParts.push(buildTocSectionXml('DAFTAR GAMBAR', lofEntries, 'TOC \\h \\z \\c "Gambar"', true, frontParts.length > 0));
    }

    if (frontParts.length) {
      const frontMode = numMode === 'none' ? 'none' : numMode === 'top-right' ? 'top-right' : 'bottom-center';
      sections.push({
        contentXml: frontParts.join(''),
        sectPrXml: buildSectPrXml({ mode: frontMode, numFmt: 'lowerRoman', numStart: 1 }),
      });
    }

    // C. Section Setiap BAB (Angka Arab mulai 1)
    let bodySectionCount = 0;
    const srcHalfPt = ptToHalfPt(Math.max(typo.fontSizePt - 2, 9));

    chapters.forEach((ch) => {
      if (!ch.blocks || !ch.blocks.length) return;
      bodySectionCount++;
      const chapterSubbabNumIds = {};
      const blockXmls = ch.blocks.map((block) => {
        if (block.type === 'bab') {
          const lines = [block.babLabel];
          if (block.babSubtitle) lines.push(block.babSubtitle);
          return heading1Xml(lines, false);
        }
        if (block.type === 'subbab') {
          const parsed = parseSubbabPrefix(block.text);
          if (parsed.kind) {
            const key = `${parsed.kind}:${parsed.prefix}:${parsed.dot}`;
            if (chapterSubbabNumIds[key] == null) {
              chapterSubbabNumIds[key] = allocateSubbabNumId(parsed.kind, parsed.prefix, parsed.dot);
            }
            const inlineHtml = resolveInlineHtml ? resolveInlineHtml(parsed.cleanText) : xmlEsc(parsed.cleanText);
            return heading2Xml(inlineHtml, chapterSubbabNumIds[key]);
          }
          const inlineHtml = resolveInlineHtml ? resolveInlineHtml(block.text) : xmlEsc(block.text);
          return heading2Xml(inlineHtml);
        }
        if (block.type === 'subsubbab') {
          const parsed = parseSubbabPrefix(block.text);
          if (parsed.kind) {
            const key = `h3:${parsed.kind}:${parsed.prefix}:${parsed.dot}`;
            if (chapterSubbabNumIds[key] == null) {
              chapterSubbabNumIds[key] = allocateSubbabNumId(parsed.kind, parsed.prefix, parsed.dot);
            }
            const inlineHtml = resolveInlineHtml ? resolveInlineHtml(parsed.cleanText) : xmlEsc(parsed.cleanText);
            return heading3Xml(inlineHtml, chapterSubbabNumIds[key]);
          }
          const inlineHtml = resolveInlineHtml ? resolveInlineHtml(block.text) : xmlEsc(block.text);
          return heading3Xml(inlineHtml);
        }
        if (block.type === 'list') {
          const items = block.items || [];
          if (!items.length) return '';
          const numId = allocateListNumId(items[0].marker);
          return items
            .map((it) => {
              const inlineHtml = resolveInlineHtml ? resolveInlineHtml(it.text) : xmlEsc(it.text);
              return (
                `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>` +
                `<w:spacing w:before="0" w:after="${ptToTwips(3)}" w:line="${lineRuleVal}" w:lineRule="auto"/>` +
                `<w:jc w:val="${bodyJc}"/></w:pPr>` +
                htmlInlineToRunsXml(inlineHtml) +
                `</w:p>`
              );
            })
            .join('');
        }
        if (block.type === 'table') {
          const cap = buildCaptionXml(block.numberLabel, block.title, 'Tabel', false);
          const tbl = buildAcademicTableXml(block);
          const src = block.source
            ? `<w:p><w:pPr><w:spacing w:before="${ptToTwips(4)}" w:after="${ptToTwips(10)}" w:line="288" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="left"/></w:pPr>` +
              textRun(`Sumber: ${block.source}`, `<w:i/><w:sz w:val="${srcHalfPt}"/><w:szCs w:val="${srcHalfPt}"/>`) +
              `</w:p>`
            : `<w:p><w:pPr><w:spacing w:before="0" w:after="${ptToTwips(8)}"/></w:pPr></w:p>`;
          return cap + tbl + src;
        }
        if (block.type === 'figure') {
          const dataUrl = resolveFigureDataUrl ? resolveFigureDataUrl(block) : '';
          const preferredW = (contentWidthCm * (Number(block.widthPct) || 85)) / 100;
          const drawingXml = dataUrl ? registerImage(dataUrl, preferredW, 16 / 9) : null;
          const imgP =
            `<w:p><w:pPr><w:keepNext/><w:spacing w:before="${ptToTwips(10)}" w:after="${ptToTwips(4)}"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr>` +
            (drawingXml || textRun(`[Gambar: ${block.title}]`, '<w:i/>')) +
            `</w:p>`;
          const cap = buildCaptionXml(block.numberLabel, block.title, 'Gambar', true);
          const src = block.source
            ? `<w:p><w:pPr><w:spacing w:before="0" w:after="${ptToTwips(10)}" w:line="288" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr>` +
              textRun(`Sumber: ${block.source}`, `<w:i/><w:sz w:val="${srcHalfPt}"/><w:szCs w:val="${srcHalfPt}"/>`) +
              `</w:p>`
            : '';
          return imgP + cap + src;
        }
        const inlineHtml = resolveInlineHtml ? resolveInlineHtml(block.text) : xmlEsc(block.text);
        return (
          `<w:p><w:pPr><w:spacing w:before="${spaceBeforeTwips}" w:after="${spaceAfterTwips}" w:line="${lineRuleVal}" w:lineRule="auto"/>` +
          `<w:ind w:firstLine="${firstIndentTwips}"/><w:jc w:val="${bodyJc}"/></w:pPr>` +
          htmlInlineToRunsXml(inlineHtml) +
          `</w:p>`
        );
      });

      sections.push({
        contentXml: blockXmls.join(''),
        sectPrXml: buildSectPrXml({
          mode: numMode,
          numFmt: bodySectionCount === 1 ? 'decimal' : '',
          numStart: bodySectionCount === 1 ? 1 : null,
        }),
      });
    });

    // D. Section Daftar Pustaka
    if (finalBib.length > 0) {
      const bibXmls = [heading1Xml(['DAFTAR PUSTAKA'], false)];
      finalBib.forEach((item) => {
        if (citStyle === 'ieee') {
          bibXmls.push(
            `<w:p><w:pPr><w:spacing w:before="0" w:after="${ptToTwips(7)}" w:line="${lineRuleVal}" w:lineRule="auto"/>` +
            `<w:ind w:left="${cmToTwips(1.1)}" w:hanging="${cmToTwips(1.1)}"/><w:jc w:val="${bodyJc}"/></w:pPr>` +
            textRun(`[${item.num}]  `) +
            htmlInlineToRunsXml(item.html) +
            `</w:p>`
          );
        } else {
          bibXmls.push(
            `<w:p><w:pPr><w:spacing w:before="0" w:after="${ptToTwips(7)}" w:line="${lineRuleVal}" w:lineRule="auto"/>` +
            `<w:ind w:left="${cmToTwips(1.25)}" w:hanging="${cmToTwips(1.25)}"/><w:jc w:val="${bodyJc}"/></w:pPr>` +
            htmlInlineToRunsXml(item.html) +
            `</w:p>`
          );
        }
      });

      sections.push({
        contentXml: bibXmls.join(''),
        sectPrXml: buildSectPrXml({
          mode: numMode,
          numFmt: bodySectionCount === 0 ? 'decimal' : '',
          numStart: bodySectionCount === 0 ? 1 : null,
        }),
      });
    }

    if (!sections.length) {
      sections.push({
        contentXml: '<w:p/>',
        sectPrXml: buildSectPrXml({ mode: numMode }),
      });
    }

    // Gabungkan section ke dalam <w:body> sesuai standar OOXML
    let bodyInner = '';
    sections.forEach((sec, idx) => {
      bodyInner += sec.contentXml;
      if (idx < sections.length - 1) {
        bodyInner += `<w:p><w:pPr>${sec.sectPrXml}</w:pPr></w:p>`;
      } else {
        bodyInner += sec.sectPrXml;
      }
    });

    // -----------------------------------------------------------------------
    // 5. Bangun Berkas XML Paket OOXML
    // -----------------------------------------------------------------------
    const documentXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
      `xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
      `<w:body>${bodyInner}</w:body>` +
      `</w:document>`;

    const stylesXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:docDefaults>` +
      `<w:rPrDefault><w:rPr>` +
      `<w:rFonts w:ascii="${xmlEsc(fontName)}" w:hAnsi="${xmlEsc(fontName)}" w:cs="${xmlEsc(fontName)}" w:eastAsia="${xmlEsc(fontName)}"/>` +
      `<w:color w:val="000000"/>` +
      `<w:sz w:val="${fontHalfPt}"/><w:szCs w:val="${fontHalfPt}"/>` +
      `<w:lang w:val="id-ID" w:eastAsia="en-US" w:bidi="ar-SA"/>` +
      `</w:rPr></w:rPrDefault>` +
      `<w:pPrDefault><w:pPr>` +
      `<w:spacing w:before="0" w:after="0" w:line="${lineRuleVal}" w:lineRule="auto"/>` +
      `</w:pPr></w:pPrDefault>` +
      `</w:docDefaults>` +

      `<w:style w:type="paragraph" w:default="1" w:styleId="Normal">` +
      `<w:name w:val="Normal"/><w:qFormat/>` +
      `</w:style>` +

      `<w:style w:type="paragraph" w:styleId="Heading1">` +
      `<w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>` +
      `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${h1BeforeTwips}" w:after="${h1AfterTwips}" w:line="324" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/></w:pPr>` +
      `<w:rPr><w:b/><w:bCs/><w:caps/><w:color w:val="000000"/><w:sz w:val="${headingHalfPt}"/><w:szCs w:val="${headingHalfPt}"/></w:rPr>` +
      `</w:style>` +

      `<w:style w:type="paragraph" w:styleId="Heading2">` +
      `<w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>` +
      `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${h2BeforeTwips}" w:after="${h2AfterTwips}" w:line="${lineRuleVal}" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="left"/><w:outlineLvl w:val="1"/></w:pPr>` +
      `<w:rPr><w:b/><w:bCs/><w:color w:val="000000"/><w:sz w:val="${fontHalfPt}"/><w:szCs w:val="${fontHalfPt}"/></w:rPr>` +
      `</w:style>` +

      `<w:style w:type="paragraph" w:styleId="Heading3">` +
      `<w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>` +
      `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${h3BeforeTwips}" w:after="${h3AfterTwips}" w:line="${lineRuleVal}" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="left"/><w:outlineLvl w:val="2"/></w:pPr>` +
      `<w:rPr><w:b/><w:bCs/><w:color w:val="000000"/><w:sz w:val="${fontHalfPt}"/><w:szCs w:val="${fontHalfPt}"/></w:rPr>` +
      `</w:style>` +

      `<w:style w:type="paragraph" w:styleId="Caption">` +
      `<w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>` +
      `<w:pPr><w:spacing w:before="${ptToTwips(6)}" w:after="${ptToTwips(4)}" w:line="288" w:lineRule="auto"/><w:ind w:firstLine="0"/></w:pPr>` +
      `<w:rPr><w:color w:val="000000"/><w:sz w:val="${fontHalfPt}"/><w:szCs w:val="${fontHalfPt}"/></w:rPr>` +
      `</w:style>` +

      `<w:style w:type="paragraph" w:styleId="TOC1">` +
      `<w:name w:val="toc 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:autoRedefine/>` +
      `<w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${contentWidthTwips}"/></w:tabs><w:spacing w:before="${ptToTwips(4)}" w:after="${ptToTwips(2)}" w:line="${lineRuleVal}" w:lineRule="auto"/><w:ind w:left="0" w:firstLine="0"/></w:pPr>` +
      `<w:rPr><w:b/><w:bCs/><w:color w:val="000000"/></w:rPr>` +
      `</w:style>` +

      `<w:style w:type="paragraph" w:styleId="TOC2">` +
      `<w:name w:val="toc 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:autoRedefine/>` +
      `<w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${contentWidthTwips}"/></w:tabs><w:spacing w:before="0" w:after="${ptToTwips(2)}" w:line="${lineRuleVal}" w:lineRule="auto"/><w:ind w:left="${cmToTwips(0.85)}" w:firstLine="0"/></w:pPr>` +
      `<w:rPr><w:color w:val="000000"/></w:rPr>` +
      `</w:style>` +

      `<w:style w:type="paragraph" w:styleId="TOC3">` +
      `<w:name w:val="toc 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:autoRedefine/>` +
      `<w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${contentWidthTwips}"/></w:tabs><w:spacing w:before="0" w:after="${ptToTwips(1.5)}" w:line="${lineRuleVal}" w:lineRule="auto"/><w:ind w:left="${cmToTwips(1.5)}" w:firstLine="0"/></w:pPr>` +
      `<w:rPr><w:color w:val="000000"/></w:rPr>` +
      `</w:style>` +

      `<w:style w:type="paragraph" w:styleId="TableofFigures">` +
      `<w:name w:val="table of figures"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:autoRedefine/>` +
      `<w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${contentWidthTwips}"/></w:tabs><w:spacing w:before="0" w:after="${ptToTwips(3)}" w:line="${lineRuleVal}" w:lineRule="auto"/><w:ind w:left="0" w:firstLine="0"/></w:pPr>` +
      `<w:rPr><w:color w:val="000000"/></w:rPr>` +
      `</w:style>` +

      `<w:style w:type="character" w:styleId="Hyperlink">` +
      `<w:name w:val="Hyperlink"/>` +
      `<w:rPr><w:color w:val="000000"/><w:u w:val="none"/></w:rPr>` +
      `</w:style>` +
      `</w:styles>`;

    const settingsXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:view w:val="print"/>` +
      `<w:zoom w:percent="100"/>` +
      `<w:defaultTabStop w:val="720"/>` +
      `<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>` +
      `</w:settings>`;

    const pageNumHalfPt = ptToHalfPt(Math.max(typo.fontSizePt - 1, 10));
    const pageFieldXml = fieldRuns('PAGE', '1', `<w:sz w:val="${pageNumHalfPt}"/><w:szCs w:val="${pageNumHalfPt}"/>`);

    const headerTopRightXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:p><w:pPr><w:jc w:val="right"/><w:spacing w:before="0" w:after="0"/></w:pPr>${pageFieldXml}</w:p>` +
      `</w:hdr>`;

    const headerEmptyXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p/></w:hdr>`;

    const footerCenterXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/></w:pPr>${pageFieldXml}</w:p>` +
      `</w:ftr>`;

    const footerEmptyXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p/></w:ftr>`;

    const rootRelsXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
      `</Relationships>`;

    const listSpecs = [
      [0, 'decimal', '%1.', xmlEsc(fontName), 720, 360, false],
      [1, 'decimal', '%1)', xmlEsc(fontName), 720, 360, false],
      [2, 'lowerLetter', '%1.', xmlEsc(fontName), 720, 360, false],
      [3, 'lowerLetter', '%1)', xmlEsc(fontName), 720, 360, false],
      [4, 'bullet', '&#x2022;', 'Symbol', 720, 360, false],
      [5, 'upperLetter', '%1.', xmlEsc(fontName), 360, 360, true],
      ...customAbstractNums,
    ];
    const abstractNumsXml = listSpecs
      .map(
        ([absId, fmt, lvlText, rFont, leftTw, hangTw, isBold]) =>
          `<w:abstractNum w:abstractNumId="${absId}">` +
          `<w:multiLevelType w:val="singleLevel"/>` +
          `<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${lvlText}"/><w:lvlJc w:val="left"/>` +
          `<w:pPr><w:ind w:left="${leftTw}" w:hanging="${hangTw}"/></w:pPr>` +
          `<w:rPr><w:rFonts w:ascii="${rFont}" w:hAnsi="${rFont}" w:cs="${xmlEsc(fontName)}"/>${isBold ? '<w:b/><w:bCs/>' : ''}<w:color w:val="000000"/><w:sz w:val="${fontHalfPt}"/><w:szCs w:val="${fontHalfPt}"/></w:rPr>` +
          `</w:lvl></w:abstractNum>`
      )
      .join('');
    const numsXml = listNums
      .map(
        (n) =>
          `<w:num w:numId="${n.numId}"><w:abstractNumId w:val="${n.abstractNumId}"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`
      )
      .join('');
    const numberingXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      abstractNumsXml +
      numsXml +
      `</w:numbering>`;

    const docRelsItems = [
      `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
      `<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>`,
      `<Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>`,
      `<Relationship Id="rIdHdrTopRight" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>`,
      `<Relationship Id="rIdHdrEmpty" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header2.xml"/>`,
      `<Relationship Id="rIdFtrCenter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>`,
      `<Relationship Id="rIdFtrEmpty" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer2.xml"/>`,
      ...mediaFiles.map(
        (m) =>
          `<Relationship Id="${m.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${m.target}"/>`
      ),
    ];

    const docRelsXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      docRelsItems.join('') +
      `</Relationships>`;

    const contentTypesXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Default Extension="png" ContentType="image/png"/>` +
      `<Default Extension="jpg" ContentType="image/jpeg"/>` +
      `<Default Extension="jpeg" ContentType="image/jpeg"/>` +
      `<Default Extension="gif" ContentType="image/gif"/>` +
      `<Default Extension="webp" ContentType="image/webp"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
      `<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>` +
      `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>` +
      `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>` +
      `<Override PartName="/word/header2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>` +
      `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>` +
      `<Override PartName="/word/footer2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>` +
      `</Types>`;

    const zipEntries = [
      { name: '[Content_Types].xml', data: contentTypesXml },
      { name: '_rels/.rels', data: rootRelsXml },
      { name: 'word/_rels/document.xml.rels', data: docRelsXml },
      { name: 'word/document.xml', data: documentXml },
      { name: 'word/styles.xml', data: stylesXml },
      { name: 'word/settings.xml', data: settingsXml },
      { name: 'word/numbering.xml', data: numberingXml },
      { name: 'word/header1.xml', data: headerTopRightXml },
      { name: 'word/header2.xml', data: headerEmptyXml },
      { name: 'word/footer1.xml', data: footerCenterXml },
      { name: 'word/footer2.xml', data: footerEmptyXml },
      ...mediaFiles.map((m) => ({ name: m.name, data: m.bytes })),
    ];

    return buildZipUint8Array(zipEntries);
  }

  function buildDocxBlob(opts) {
    const bytes = buildDocxUint8Array(opts);
    return new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  }

  if (typeof window !== 'undefined') {
    window.MakaRapiDocx = { buildDocxUint8Array, buildDocxBlob };
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildDocxUint8Array, buildDocxBlob };
  }
})();
