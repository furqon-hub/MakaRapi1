(() => {
  'use strict';

  // Konfigurasi Worker PDF.js jika CDN tersedia
  if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  // =====================================================================
  // 1. KONSTANTA, PRESET, UKURAN KERTAS, FONT, DAN DATA CONTOH
  // =====================================================================
  const STORAGE_KEY = 'rapimakalah_pro_editorial_v2';
  const CM_TO_PX = 37.7952755906;

  const PAPER_SIZES = {
    A4: { name: 'A4', widthCm: 21.0, heightCm: 29.7 },
    F4: { name: 'F4', widthCm: 21.5, heightCm: 33.0 },
    Letter: { name: 'Letter', widthCm: 21.59, heightCm: 27.94 },
    B5: { name: 'B5', widthCm: 17.6, heightCm: 25.0 },
  };

  const FONT_STACKS = {
    'Times New Roman': '"Times New Roman", Times, serif',
    'Arial': 'Arial, Helvetica, sans-serif',
    'Calibri': 'Calibri, Carlito, "Segoe UI", sans-serif',
    'Georgia': 'Georgia, serif',
    'Cambria': 'Cambria, Georgia, serif',
    'Garamond': 'Garamond, "EB Garamond", Georgia, serif',
    'Book Antiqua': '"Book Antiqua", Palatino, "Palatino Linotype", serif',
  };

  const PAGE_NUM_MODE_LABELS = {
    skripsi: 'Standar Skripsi',
    'top-right': 'Kanan Atas Semua',
    'bottom-center': 'Tengah Bawah Semua',
    none: 'Tanpa Nomor',
  };

  const PAGE_NUM_MODE_DESCS = {
    skripsi: 'Cover tanpa nomor; halaman awal Romawi (i, ii) di tengah bawah; awal BAB & Pustaka di tengah bawah; halaman lanjutan non-BAB di pojok kanan atas.',
    'top-right': 'Seluruh halaman selain cover menggunakan nomor di pojok kanan atas (Romawi untuk halaman awal, Arab untuk isi).',
    'bottom-center': 'Seluruh halaman selain cover menggunakan nomor di tengah bawah.',
    none: 'Nomor halaman disembunyikan pada seluruh lembar dokumen.',
  };

  // 3 Contoh Teks Pedoman Kampus Siap Uji 1-Klik
  const SAMPLE_GUIDELINES = {
    ui_ugm: {
      name: 'Pedoman Skripsi Standar (UI/UGM)',
      text: `PEDOMAN PENULISAN SKRIPSI DAN MAKALAH AKADEMIK
1. Naskah diketik pada kertas HVS ukuran A4 (21 x 29,7 cm) 80 gram.
2. Batas tepi (margin) pengetikan adalah 4-4-3-3 cm (margin atas 4 cm, margin kiri 4 cm, margin bawah 3 cm, dan margin kanan 3 cm).
3. Jenis huruf yang digunakan adalah Times New Roman dengan ukuran font 12 pt untuk teks isi, sedangkan judul BAB menggunakan huruf kapital tebal ukuran 14 pt.
4. Jarak antarbaris menggunakan spasi 1,5 dengan perataan rata kanan-kiri (justify).
5. Setiap awal paragraf menjorok ke dalam sejauh 1,25 cm (atau 6 ketukan).
6. Penomoran halaman mengikuti standar skripsi: halaman awal (Kata Pengantar, Daftar Isi, Daftar Tabel, Daftar Gambar) memakai angka Romawi kecil di tengah bawah; halaman pertama setiap BAB di tengah bawah, sedangkan halaman lanjutan non-BAB di pojok kanan atas.
7. Sistem pengutipan dan Daftar Pustaka wajib mengikuti gaya APA 7th Edition.
8. Dokumen wajib memuat Halaman Sampul (Cover), Kata Pengantar, Daftar Isi, Daftar Tabel, dan Daftar Gambar.`,
    },
    f4_teknik: {
      name: 'Pedoman Makalah Fakultas Teknik (F4)',
      text: `PANDUAN TATA TULIS LAPORAN DAN MAKALAH FAKULTAS TEKNIK
- Kertas yang digunakan adalah ukuran F4 (Folio) 21,5 x 33 cm.
- Margin pengetikan: margin atas 4 cm, margin kiri 3 cm, margin bawah 3 cm, margin kanan 3 cm.
- Naskah diketik menggunakan huruf Arial ukuran 11 pt, judul BAB berukuran 12 pt cetak tebal.
- Jarak spasi baris sebesar 1,5 spasi dengan format rata kanan-kiri dan indentasi paragraf 1 cm.
- Penomoran halaman diletakkan pada pojok kanan atas untuk seluruh halaman selain sampul.
- Format sitasi dan referensi menggunakan standar IEEE Style ([1], [2]).
- Struktur dokumen mencakup Cover, Kata Pengantar, Daftar Isi, Daftar Tabel, dan Daftar Gambar.`,
    },
    b5_ilmiah: {
      name: 'Pedoman Monograf & Karya Ilmiah (B5)',
      text: `KETENTUAN FORMAT NASKAH MONOGRAF & SKRIPSI FORMAT B5
1. Ukuran kertas standar B5 (17,6 x 25 cm).
2. Margin atas dan kiri masing-masing 3 cm, sedangkan margin bawah dan kanan masing-masing 2,5 cm.
3. Tipografi menggunakan font Cambria ukuran 11 pt untuk isi naskah dan 14 pt untuk judul BAB.
4. Spasi antarbaris ditetapkan 1,15 dengan perataan rata kanan-kiri (justify) dan alinea baru masuk 1 cm.
5. Penomoran halaman menggunakan pola tengah bawah pada halaman awal BAB dan pojok kanan atas untuk halaman berikutnya.
6. Pengacuan pustaka mengikuti gaya APA.
7. Kelengkapan wajib terdiri atas Halaman Sampul, Kata Pengantar, dan Daftar Isi.`,
    },
  };

  // Emblem kampus SVG minimalis
  const DEFAULT_EMBLEM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
    <polygon points="60,8 104,28 104,76 60,112 16,76 16,28" fill="none" stroke="#18181B" stroke-width="3"/>
    <polygon points="60,16 96,33 96,72 60,103 24,72 24,33" fill="#FFFFFF" stroke="#57534E" stroke-width="1.5"/>
    <path d="M36,64 L60,52 L84,64 L60,76 Z" fill="#1D3557"/>
    <path d="M41,67 L41,78 C41,83 50,87 60,87 C70,87 79,83 79,78 L79,67 L60,77 Z" fill="#334155"/>
    <circle cx="60" cy="39" r="7" fill="none" stroke="#1D3557" stroke-width="2.5"/>
    <circle cx="60" cy="39" r="2.5" fill="#1D3557"/>
  </svg>`;

  // Diagram SVG akademik bersih untuk contoh Gambar Bernomor
  const BUILTIN_FIGURES = {
    svg_arsitektur_ai: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 240" width="640" height="240" style="background:#FFFFFF;border:1px solid #D2CEC6;">
      <defs>
        <marker id="edArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="#18181B" />
        </marker>
      </defs>
      <rect x="0" y="0" width="640" height="240" fill="#FFFFFF"/>
      <text x="320" y="28" text-anchor="middle" font-family="Arial, sans-serif" font-size="12.5" font-weight="bold" fill="#18181B">Alur Ekosistem Pembelajaran Adaptif Berbasis Kecerdasan Buatan</text>

      <rect x="28" y="60" width="138" height="90" fill="#F7F6F2" stroke="#18181B" stroke-width="1.4"/>
      <text x="97" y="88" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#18181B">1. Input Data</text>
      <text x="97" y="106" text-anchor="middle" font-family="Arial, sans-serif" font-size="9.5" fill="#3F3F46">Profil Mahasiswa,</text>
      <text x="97" y="121" text-anchor="middle" font-family="Arial, sans-serif" font-size="9.5" fill="#3F3F46">Aktivitas LMS &amp;</text>
      <text x="97" y="136" text-anchor="middle" font-family="Arial, sans-serif" font-size="9.5" fill="#3F3F46">Nilai Evaluasi Awal</text>

      <line x1="166" y1="105" x2="198" y2="105" stroke="#18181B" stroke-width="1.5" marker-end="url(#edArrow)"/>

      <rect x="204" y="52" width="166" height="106" fill="#EDF2F7" stroke="#1D3557" stroke-width="1.5"/>
      <text x="287" y="78" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#1D3557">2. Mesin Analitik AI</text>
      <rect x="219" y="90" width="136" height="24" fill="#FFFFFF" stroke="#94A3B8" stroke-width="1"/>
      <text x="287" y="106" text-anchor="middle" font-family="Arial, sans-serif" font-size="9.5" fill="#18181B">Pemetaan Kompetensi</text>
      <rect x="219" y="121" width="136" height="24" fill="#FFFFFF" stroke="#94A3B8" stroke-width="1"/>
      <text x="287" y="137" text-anchor="middle" font-family="Arial, sans-serif" font-size="9.5" fill="#18181B">Rekomendasi Materi</text>

      <line x1="370" y1="105" x2="402" y2="105" stroke="#18181B" stroke-width="1.5" marker-end="url(#edArrow)"/>

      <rect x="408" y="60" width="204" height="90" fill="#EDF5F0" stroke="#1F5E3B" stroke-width="1.4"/>
      <text x="510" y="86" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#1F5E3B">3. Luaran &amp; Umpan Balik</text>
      <text x="510" y="105" text-anchor="middle" font-family="Arial, sans-serif" font-size="9.5" fill="#18181B">- Jalur Belajar Personal</text>
      <text x="510" y="120" text-anchor="middle" font-family="Arial, sans-serif" font-size="9.5" fill="#18181B">- Deteksi Dini Risiko Akademik</text>
      <text x="510" y="135" text-anchor="middle" font-family="Arial, sans-serif" font-size="9.5" fill="#18181B">- Evaluasi Kurikulum Berkala</text>

      <path d="M510,150 L510,204 L97,204 L97,156" fill="none" stroke="#57534E" stroke-width="1.4" stroke-dasharray="4,3" marker-end="url(#edArrow)"/>
      <rect x="214" y="192" width="212" height="22" fill="#FFFFFF" stroke="#D2CEC6" stroke-width="1"/>
      <text x="320" y="206" text-anchor="middle" font-family="Arial, sans-serif" font-size="9.5" font-weight="bold" fill="#18181B">Siklus Evaluasi &amp; Etika Akademik</text>
    </svg>`,

    svg_adopsi_ai: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 240" width="640" height="240" style="background:#FFFFFF;border:1px solid #D2CEC6;">
      <rect x="0" y="0" width="640" height="240" fill="#FFFFFF"/>
      <text x="320" y="26" text-anchor="middle" font-family="Arial, sans-serif" font-size="12.5" font-weight="bold" fill="#18181B">Estimasi Tingkat Adopsi Alat Bantu AI di Perguruan Tinggi (2022–2026)</text>

      <!-- Garis Bantu Horizontal -->
      <line x1="76" y1="54" x2="590" y2="54" stroke="#E2DFD9" stroke-width="1" stroke-dasharray="3,3"/>
      <line x1="76" y1="88" x2="590" y2="88" stroke="#E2DFD9" stroke-width="1" stroke-dasharray="3,3"/>
      <line x1="76" y1="122" x2="590" y2="122" stroke="#E2DFD9" stroke-width="1" stroke-dasharray="3,3"/>
      <line x1="76" y1="156" x2="590" y2="156" stroke="#E2DFD9" stroke-width="1" stroke-dasharray="3,3"/>

      <!-- Sumbu X & Y -->
      <line x1="76" y1="48" x2="76" y2="190" stroke="#18181B" stroke-width="1.3"/>
      <line x1="76" y1="190" x2="590" y2="190" stroke="#18181B" stroke-width="1.3"/>

      <!-- Label Sumbu Y -->
      <text x="68" y="58" text-anchor="end" font-family="Arial, sans-serif" font-size="9.5" fill="#57534E">100%</text>
      <text x="68" y="92" text-anchor="end" font-family="Arial, sans-serif" font-size="9.5" fill="#57534E">75%</text>
      <text x="68" y="126" text-anchor="end" font-family="Arial, sans-serif" font-size="9.5" fill="#57534E">50%</text>
      <text x="68" y="160" text-anchor="end" font-family="Arial, sans-serif" font-size="9.5" fill="#57534E">25%</text>
      <text x="68" y="193" text-anchor="end" font-family="Arial, sans-serif" font-size="9.5" fill="#57534E">0%</text>

      <!-- Batang 2022 (18%) -->
      <rect x="110" y="165" width="52" height="25" fill="#CBD5E1" stroke="#64748B" stroke-width="1"/>
      <text x="136" y="159" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#18181B">18%</text>
      <text x="136" y="207" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#18181B">2022</text>

      <!-- Batang 2023 (36%) -->
      <rect x="208" y="141" width="52" height="49" fill="#94A3B8" stroke="#475569" stroke-width="1"/>
      <text x="234" y="135" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#18181B">36%</text>
      <text x="234" y="207" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#18181B">2023</text>

      <!-- Batang 2024 (54%) -->
      <rect x="306" y="116" width="52" height="74" fill="#64748B" stroke="#334155" stroke-width="1"/>
      <text x="332" y="110" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#18181B">54%</text>
      <text x="332" y="207" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#18181B">2024</text>

      <!-- Batang 2025 (71%) -->
      <rect x="404" y="93" width="52" height="97" fill="#3B5998" stroke="#1D3557" stroke-width="1"/>
      <text x="430" y="87" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#18181B">71%</text>
      <text x="430" y="207" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#18181B">2025</text>

      <!-- Batang 2026 (84%) -->
      <rect x="502" y="75" width="52" height="115" fill="#1D3557" stroke="#14263F" stroke-width="1"/>
      <text x="528" y="69" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#1D3557">84%</text>
      <text x="528" y="207" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#18181B">2026</text>

      <text x="320" y="228" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" fill="#57534E">Persentase sivitas akademika yang memanfaatkan instrumen AI dalam riset dan perkuliahan</text>
    </svg>`,

    svg_kerangka_etika: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 240" width="640" height="240" style="background:#FFFFFF;border:1px solid #D2CEC6;">
      <rect x="0" y="0" width="640" height="240" fill="#FFFFFF"/>
      <text x="320" y="26" text-anchor="middle" font-family="Arial, sans-serif" font-size="12.5" font-weight="bold" fill="#18181B">Kerangka Empat Pilar Etika Penggunaan AI Akademik</text>

      <!-- Atap / Tujuan Utama -->
      <rect x="80" y="42" width="480" height="32" rx="4" fill="#1D3557"/>
      <text x="320" y="62" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#FFFFFF">INTEGRITAS AKADEMIK &amp; PEMBELAJARAN BERPUSAT PADA MANUSIA</text>

      <!-- Pilar 1 -->
      <rect x="34" y="90" width="132" height="96" fill="#F7F6F2" stroke="#18181B" stroke-width="1.2"/>
      <text x="100" y="114" text-anchor="middle" font-family="Arial, sans-serif" font-size="10.5" font-weight="bold" fill="#1D3557">1. Transparansi</text>
      <text x="100" y="134" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" fill="#3F3F46">Deklarasi terbuka</text>
      <text x="100" y="148" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" fill="#3F3F46">penggunaan alat</text>
      <text x="100" y="162" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" fill="#3F3F46">bantu AI pada karya</text>

      <!-- Pilar 2 -->
      <rect x="180" y="90" width="132" height="96" fill="#EDF2F7" stroke="#1D3557" stroke-width="1.2"/>
      <text x="246" y="114" text-anchor="middle" font-family="Arial, sans-serif" font-size="10.5" font-weight="bold" fill="#1D3557">2. Verifikasi</text>
      <text x="246" y="134" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" fill="#3F3F46">Validasi silang</text>
      <text x="246" y="148" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" fill="#3F3F46">fakta, data, dan</text>
      <text x="246" y="162" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" fill="#3F3F46">sumber sitasi asli</text>

      <!-- Pilar 3 -->
      <rect x="326" y="90" width="132" height="96" fill="#EDF5F0" stroke="#1F5E3B" stroke-width="1.2"/>
      <text x="392" y="114" text-anchor="middle" font-family="Arial, sans-serif" font-size="10.5" font-weight="bold" fill="#1F5E3B">3. Privasi Data</text>
      <text x="392" y="134" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" fill="#3F3F46">Perlindungan data</text>
      <text x="392" y="148" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" fill="#3F3F46">pribadi mahasiswa</text>
      <text x="392" y="162" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" fill="#3F3F46">&amp; riset rahasia</text>

      <!-- Pilar 4 -->
      <rect x="472" y="90" width="134" height="96" fill="#FBF6EA" stroke="#8A5A00" stroke-width="1.2"/>
      <text x="539" y="114" text-anchor="middle" font-family="Arial, sans-serif" font-size="10.5" font-weight="bold" fill="#8A5A00">4. Kendali Dosen</text>
      <text x="539" y="134" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" fill="#3F3F46">Keputusan evaluasi</text>
      <text x="539" y="148" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" fill="#3F3F46">dan nalar kritis</text>
      <text x="539" y="162" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" fill="#3F3F46">tetap pada manusia</text>

      <!-- Fondasi -->
      <rect x="34" y="198" width="572" height="24" fill="#F4F3EF" stroke="#D2CEC6" stroke-width="1"/>
      <text x="320" y="214" text-anchor="middle" font-family="Arial, sans-serif" font-size="9.5" font-weight="bold" fill="#18181B">Fondasi: Pedoman Institusi, Literasi Digital, dan Audit Akademik Berkelanjutan</text>
    </svg>`,
  };

  function getSampleCitations() {
    return [
      {
        id: 'ref1',
        type: 'book',
        authors: 'Hendra Wijaya; Budi Santoso',
        year: '2024',
        title: 'Transformasi Digital dan Literasi AI di Perguruan Tinggi Indonesia',
        publisher: 'Pustaka Akademika',
        city: 'Yogyakarta',
      },
      {
        id: 'ref2',
        type: 'journal',
        authors: 'Olaf Zawacki-Richter; Victoria I. Marín; Melissa Bond; Franziska Gouverneur',
        year: '2019',
        title: 'Systematic review of research on artificial intelligence applications in higher education',
        journal: 'International Journal of Educational Technology in Higher Education',
        vol: '16',
        issue: '1',
        pages: '1-27',
      },
      {
        id: 'ref3',
        type: 'website',
        authors: 'UNESCO',
        year: '2023',
        title: 'Guidance for Generative AI in Education and Research',
        site: 'UNESCO Digital Library',
        url: 'https://unesdoc.unesco.org/ark:/48223/pf0000386693',
      },
    ];
  }

  function getDefaultCleanState() {
    return {
      format: {
        paperSize: 'A4',
        marginTop: 4,
        marginLeft: 4,
        marginBottom: 3,
        marginRight: 3,
        fontFamily: 'Times New Roman',
        fontSize: 12,
        headingFontSize: 14,
        lineSpacing: 1.5,
        firstIndent: 1.25,
        spaceBefore: 0,
        spaceAfter: 0,
        applySpacingToHeadings: false,
        textAlign: 'justify',
        pageNumberMode: 'skripsi',
        showMarginGuides: true,
        showCover: true,
        showAbstract: false,
        showPreface: true,
        showToc: true,
        showLot: true,
        showLof: true,
        citationStyle: 'apa',
      },
      abstract: {
        body: '',
        keywords: '',
      },
      cover: {
        title: 'TRANSFORMASI KECERDASAN BUATAN (ARTIFICIAL INTELLIGENCE) DALAM MENINGKATKAN EFEKTIVITAS PEMBELAJARAN DI PERGURUAN TINGGI INDONESIA',
        subtitle: 'Disusun untuk Memenuhi Tugas Mata Kuliah Teknologi Pendidikan dan Literasi Digital',
        lecturer: 'Dr. Hendra Wijaya, M.Kom.',
        authors: 'Rizky Aditya Pratama (230510014)\nNabila Putri Maharani (230510027)\nBagas Satrio Wibowo (230510039)',
        prodi: 'PROGRAM STUDI TEKNIK INFORMATIKA\nFAKULTAS ILMU KOMPUTER',
        university: 'UNIVERSITAS NUSANTARA MERDEKA',
        year: '2026',
        logoDataUrl: '',
        useDefaultEmblem: true,
      },
      preface: {
        body: `Puji syukur kehadirat Tuhan Yang Maha Esa atas segala rahmat dan karunia-Nya sehingga penulis dapat menyelesaikan makalah berjudul "Transformasi Kecerdasan Buatan (Artificial Intelligence) dalam Meningkatkan Efektivitas Pembelajaran di Perguruan Tinggi Indonesia" tepat pada waktunya.\n\nMakalah ini disusun untuk memenuhi tugas mata kuliah Teknologi Pendidikan sekaligus memperluas pemahaman mengenai pemanfaatan kecerdasan buatan yang efektif dan beretika di lingkungan akademik. Penulis mengucapkan terima kasih kepada Bapak Dr. Hendra Wijaya, M.Kom. selaku dosen pengampu atas bimbingan dan arahan yang diberikan.\n\nPenulis menyadari makalah ini masih memiliki keterbatasan. Oleh karena itu, kritik dan saran yang membangun sangat diharapkan demi penyempurnaan karya ilmiah selanjutnya.`,
        cityDate: 'Semarang, November 2026',
        signature: 'Penyusun',
      },
      content: `BAB I
PENDAHULUAN

A. Latar Belakang
Perkembangan teknologi digital telah membawa perubahan mendasar dalam sistem pendidikan tinggi di Indonesia. Salah satu teknologi yang berkembang pesat adalah kecerdasan buatan atau Artificial Intelligence (AI) yang mampu memproses analitik pembelajaran serta menghadirkan umpan balik secara cepat [@ref1].

Berbagai studi internasional menunjukkan bahwa pemanfaatan aplikasi AI di perguruan tinggi mencakup sistem tutor cerdas, pemetaan profil serta prediksi risiko akademik, dan evaluasi formatif otomatis [@ref2]. Integrasi teknologi tersebut berpotensi mengurangi beban administratif dosen sekaligus memperluas akses bimbingan belajar yang adaptif bagi mahasiswa.

[GAMBAR id="svg_adopsi_ai" judul="Estimasi Tingkat Adopsi Alat Bantu AI di Perguruan Tinggi (2022–2026)" sumber="Olahan Survei Literasi Digital Kampus (2026)" lebar="88"]

Meskipun demikian, pemanfaatan AI generatif di lingkungan kampus juga menimbulkan tantangan serius terkait integritas akademik, plagiarisme, dan keakuratan informasi. Organisasi pendidikan global menekankan pentingnya pedoman etika serta pendekatan berpusat pada manusia agar teknologi memperkuat nalar kritis mahasiswa [@ref3]. Gambaran umum peluang dan tantangan tersebut dirangkum pada tabel berikut.

[TABEL judul="Ringkasan Peluang dan Tantangan Pemanfaatan AI di Pendidikan Tinggi" sumber="Adaptasi dari Wijaya & Santoso (2024) dan UNESCO (2023)"]
Aspek Pendidikan | Peluang Utama | Tantangan yang Perlu Diantisipasi
Proses Belajar | Materi adaptif & umpan balik instan | Ketergantungan berlebih mengurangi nalar kritis
Evaluasi & Tugas | Koreksi formatif lebih cepat | Potensi plagiarisme & sitasi fiktif AI
Tata Kelola Kampus | Analitik retensi mahasiswa lebih akurat | Keamanan dan privasi data sivitas akademika
[/TABEL]

B. Rumusan Masalah
Berdasarkan latar belakang tersebut, rumusan masalah dalam makalah ini adalah:
1. Bagaimana peran dan arsitektur pemanfaatan kecerdasan buatan dalam ekosistem pembelajaran perguruan tinggi?
2. Bagaimana perbandingan efektivitas berbagai model implementasi AI bagi mahasiswa dan dosen?
3. Bagaimana strategi mitigasi risiko etika akademik dalam penggunaan AI di kampus Indonesia?

C. Tujuan Penulisan
Tujuan penyusunan makalah ini meliputi:
- Mendeskripsikan ekosistem pembelajaran adaptif berbasis kecerdasan buatan di perguruan tinggi.
- Membandingkan keunggulan dan tantangan implementasi teknologi AI dalam perkuliahan.
- Merumuskan rekomendasi kebijakan etika penggunaan AI secara bertanggung jawab.

BAB II
PEMBAHASAN

A. Arsitektur Pembelajaran Adaptif Berbasis AI
Dalam konteks pendidikan tinggi modern, kecerdasan buatan berperan sebagai mitra kolaboratif yang memetakan kompetensi mahasiswa secara berkelanjutan [@ref1]. Proses pembelajaran adaptif diawali dari pengumpulan data aktivitas Learning Management System (LMS), diproses oleh mesin analitik, hingga menghasilkan rekomendasi bahan ajar personal bagi tiap mahasiswa.

[GAMBAR id="svg_arsitektur_ai" judul="Alur Ekosistem Pembelajaran Adaptif Berbasis Kecerdasan Buatan" sumber="Adaptasi dari Wijaya & Santoso (2024)" lebar="90"]

Berdasarkan ilustrasi di atas, siklus umpan balik tidak berhenti pada rekomendasi materi saja. Dosen tetap memegang kendali pedagogis penuh untuk memvalidasi hasil analitik, melakukan intervensi bagi mahasiswa yang mengalami kesulitan, serta memastikan seluruh proses mematuhi prinsip etika akademik [@ref3].

B. Perbandingan Bentuk Implementasi AI di Kampus
Berdasarkan tinjauan literatur pendidikan tinggi [@ref2], terdapat beberapa bentuk implementasi utama teknologi kecerdasan buatan yang telah diterapkan di berbagai perguruan tinggi beserta dampak dan tantangannya.

[TABEL judul="Perbandingan Bentuk Implementasi AI dalam Pembelajaran Perguruan Tinggi" sumber="Diolah dari Zawacki-Richter et al. (2019) dan UNESCO (2023)"]
Bentuk Implementasi | Manfaat Utama bagi Perkuliahan | Tantangan & Mitigasi
Sistem Tutor Cerdas (ITS) | Personalisasi latihan & bimbingan sesuai kecepatan belajar | Biaya pengembangan tinggi; perlu integrasi LMS
Analitik Pembelajaran | Deteksi dini risiko penurunan nilai dan putus studi mahasiswa | Perlindungan privasi data akademik mahasiswa
Asisten AI Generatif | Membantu eksplorasi konsep, ringkasan, dan latihan bahasa | Risiko plagiarisme & halusinasi; wajib verifikasi sumber
Otomatisasi Evaluasi | Mempercepat umpan balik kuis formatif dan tata bahasa | Tetap memerlukan penilaian holistik dosen pada esai kritis
[/TABEL]

Implementasi berbagai instrumen tersebut terbukti paling optimal ketika dikombinasikan dengan metode pembelajaran aktif seperti studi kasus kontekstual, diskusi kelompok, dan presentasi lisan. Dengan demikian, teknologi berfungsi sebagai alat bantu pemahaman, bukan pengganti proses berpikir ilmiah mahasiswa.

C. Strategi Etika Akademik dan Mitigasi Risiko
Untuk mencegah penyalahgunaan AI generatif, perguruan tinggi Indonesia perlu menetapkan kebijakan transparansi yang mewajibkan mahasiswa mencantumkan deklarasi penggunaan alat bantu AI pada tugas akademik [@ref1]. Selain itu, pelatihan literasi verifikasi referensi ilmiah wajib diberikan sejak semester awal agar mahasiswa mampu mendeteksi informasi keliru maupun kutipan fiktif [@ref3].

[GAMBAR id="svg_kerangka_etika" judul="Kerangka Empat Pilar Etika Penggunaan AI Akademik di Perguruan Tinggi" sumber="Disarikan dari Pedoman UNESCO (2023)" lebar="90"]

Sebagai acuan operasional bagi fakultas dan program studi, matriks kebijakan mitigasi risiko berikut dapat diterapkan secara bertahap.

[TABEL judul="Matriks Kebijakan Etika dan Mitigasi Risiko Penggunaan AI Generatif" sumber="Rekomendasi Penulis berdasarkan UNESCO (2023)"]
Kategori Risiko | Indikator di Perkuliahan | Langkah Mitigasi Institusi
Plagiarisme & Orisinalitas | Teks disalin utuh tanpa analisis pribadi | Wajib deklarasi AI & uji pemahaman lisan
Halusinasi Referensi | Daftar pustaka memuat jurnal fiktif | Pelatihan verifikasi DOI & basis data ilmiah
Kebocoran Data | Unggah data riset sensitif ke layanan publik | Penyediaan panduan privasi & akun institusi
[/TABEL]

BAB III
PENUTUP

A. Kesimpulan
Kecerdasan buatan menawarkan peluang signifikan dalam meningkatkan efektivitas dan personalisasi pembelajaran di perguruan tinggi Indonesia melalui sistem tutor cerdas, analitik performa, serta efisiensi evaluasi formatif [@ref2]. Keberhasilan transformasi ini menuntut keseimbangan antara kesiapan infrastruktur digital, literasi teknologi sivitas akademika, dan pedoman etika yang tegas [@ref1].

B. Saran
Institusi pendidikan tinggi disarankan menerbitkan panduan resmi penggunaan AI generatif yang proporsional serta menyelenggarakan lokakarya pemanfaatan AI bagi dosen dan mahasiswa [@ref3]. Mahasiswa diharapkan memanfaatkan AI secara kritis sebagai mitra belajar sambil menjunjung tinggi kejujuran dan integritas ilmiah.`,
      citations: getSampleCitations(),
      manualBibliography: `Kementerian Pendidikan, Kebudayaan, Riset, dan Teknologi. (2024). Panduan Penggunaan Generative Artificial Intelligence (GenAI) pada Pembelajaran di Perguruan Tinggi. Jakarta: Direktorat Jenderal Pendidikan Tinggi.`,
      images: {},
      guidelineProfile: null,
      ui: {
        sidebarTab: 'format',
        editorTab: 'body',
        mobilePane: 'editor',
        guidelineMode: 'file',
        zoom: 75,
      },
    };
  }

  // Contoh Naskah Lengkap (Versi Berantakan untuk Menguji Alat Perapihan 1-Klik)
  function getMessyCompleteContent() {
    return `### **BAB I PENDAHULUAN**
---
**A. Latar Belakang**
Perkembangan teknologi digital telah membawa perubahan mendasar
dalam sistem pendidikan tinggi di Indonesia . Salah satu teknologi
yang berkembang sangat   pesat adalah kecerdasan buatan atau
**Artificial Intelligence (AI)** yang mampu memproses analitik pembelajaran
serta menghadirkan umpan balik secara instan [@ref1] .


Berbagai studi internasional menunjukkan bahwa pemanfaatan aplikasi
AI di perguruan tinggi mencakup sistem tutor cerdas , pemetaan profil
serta prediksi risiko akademik , dan evaluasi formatif otomatis [@ref2] .
Integrasi teknologi tersebut berpotensi mengurangi beban administratif
dosen sekaligus memperluas akses bimbingan belajar bagi mahasiswa .

[GAMBAR id="svg_adopsi_ai" judul="Estimasi Tingkat Adopsi Alat Bantu AI di Perguruan Tinggi (2022–2026)" sumber="Olahan Survei Literasi Digital Kampus (2026)" lebar="88"]

Meskipun demikian , pemanfaatan AI generatif juga menimbulkan tantangan
serius terkait “integritas akademik” dan keakuratan informasi [@ref3] .

[TABEL judul="Ringkasan Peluang dan Tantangan Pemanfaatan AI di Pendidikan Tinggi" sumber="Adaptasi dari Wijaya & Santoso (2024) dan UNESCO (2023)"]
Aspek Pendidikan | Peluang Utama | Tantangan yang Perlu Diantisipasi
Proses Belajar | Materi adaptif & umpan balik instan | Ketergantungan berlebih mengurangi nalar kritis
Evaluasi & Tugas | Koreksi formatif lebih cepat | Potensi plagiarisme & sitasi fiktif AI
Tata Kelola Kampus | Analitik retensi mahasiswa lebih akurat | Keamanan dan privasi data sivitas akademika
[/TABEL]

**B. Rumusan Masalah**
1. Bagaimana arsitektur pemanfaatan kecerdasan buatan dalam ekosistem pembelajaran perguruan tinggi ?
2. Bagaimana perbandingan efektivitas model implementasi AI bagi mahasiswa dan dosen ?
3. Bagaimana strategi mitigasi risiko etika akademik di kampus Indonesia ?

**C. Tujuan Penulisan**
* Mendeskripsikan ekosistem pembelajaran adaptif berbasis kecerdasan buatan .
* Membandingkan keunggulan dan tantangan implementasi AI dalam perkuliahan .
* Merumuskan rekomendasi kebijakan etika penggunaan AI secara bertanggung jawab .

---
### **BAB II PEMBAHASAN**
**A. Arsitektur Pembelajaran Adaptif Berbasis AI**
Dalam konteks pendidikan tinggi modern , kecerdasan buatan berperan
sebagai mitra kolaboratif yang memetakan kompetensi mahasiswa
secara berkelanjutan [@ref1] . Proses pembelajaran adaptif diawali
dari pengumpulan data aktivitas LMS , diproses oleh mesin analitik ,
hingga menghasilkan rekomendasi bahan ajar personal bagi mahasiswa .

[GAMBAR id="svg_arsitektur_ai" judul="Alur Ekosistem Pembelajaran Adaptif Berbasis Kecerdasan Buatan" sumber="Adaptasi dari Wijaya & Santoso (2024)" lebar="90"]

Berdasarkan ilustrasi di atas , siklus umpan balik tidak berhenti
pada rekomendasi materi saja . Dosen tetap memegang kendali pedagogis
penuh untuk memvalidasi hasil analitik serta menjaga etika akademik [@ref3] .

**B. Perbandingan Bentuk Implementasi AI di Kampus**
Berdasarkan tinjauan literatur pendidikan tinggi [@ref2] , terdapat
beberapa bentuk implementasi utama kecerdasan buatan beserta manfaat
dan tantangannya sebagaimana dirangkum pada tabel berikut .

[TABEL judul="Perbandingan Bentuk Implementasi AI dalam Pembelajaran Perguruan Tinggi" sumber="Diolah dari Zawacki-Richter et al. (2019) dan UNESCO (2023)"]
Bentuk Implementasi | Manfaat Utama bagi Perkuliahan | Tantangan & Mitigasi
Sistem Tutor Cerdas (ITS) | Personalisasi latihan & bimbingan sesuai kecepatan belajar | Biaya pengembangan tinggi; perlu integrasi LMS
Analitik Pembelajaran | Deteksi dini risiko penurunan nilai mahasiswa | Perlindungan privasi data akademik
Asisten AI Generatif | Membantu eksplorasi konsep & ringkasan | Risiko plagiarisme; wajib verifikasi sumber
Otomatisasi Evaluasi | Mempercepat umpan balik kuis formatif | Tetap memerlukan penilaian holistik dosen
[/TABEL]

Implementasi instrumen tersebut terbukti paling optimal ketika
dikombinasikan dengan metode pembelajaran aktif seperti studi kasus ,
diskusi kelompok , dan presentasi lisan agar mahasiswa tetap mengasah
kemampuan berpikir kritisnya .

**C. Strategi Etika Akademik dan Mitigasi Risiko**
Untuk mencegah penyalahgunaan AI generatif , perguruan tinggi perlu
menetapkan kebijakan transparansi penggunaan alat bantu AI [@ref1] .
Selain itu , pelatihan literasi verifikasi sumber ilmiah wajib
diberikan sejak semester awal untuk mencegah kutipan fiktif [@ref3] .

[GAMBAR id="svg_kerangka_etika" judul="Kerangka Empat Pilar Etika Penggunaan AI Akademik di Perguruan Tinggi" sumber="Disarikan dari Pedoman UNESCO (2023)" lebar="90"]

[TABEL judul="Matriks Kebijakan Etika dan Mitigasi Risiko Penggunaan AI Generatif" sumber="Rekomendasi Penulis berdasarkan UNESCO (2023)"]
Kategori Risiko | Indikator di Perkuliahan | Langkah Mitigasi Institusi
Plagiarisme & Orisinalitas | Teks disalin utuh tanpa analisis pribadi | Wajib deklarasi AI & uji pemahaman lisan
Halusinasi Referensi | Daftar pustaka memuat jurnal fiktif | Pelatihan verifikasi DOI & basis data ilmiah
Kebocoran Data | Unggah data riset sensitif ke layanan publik | Penyediaan panduan privasi & akun institusi
[/TABEL]

---
### **BAB III PENUTUP**
**A. Kesimpulan**
Kecerdasan buatan menawarkan peluang besar dalam meningkatkan efektivitas
pembelajaran di perguruan tinggi Indonesia melalui personalisasi materi
dan analitik performa [@ref2] . Keberhasilannya menuntut keseimbangan
antara infrastruktur digital , literasi teknologi , dan etika akademik [@ref1] .

**B. Saran**
Perguruan tinggi disarankan menerbitkan panduan resmi pemanfaatan AI
generatif serta menyelenggarakan pelatihan berkala bagi dosen dan mahasiswa [@ref3] .`;
  }

  // =====================================================================
  // 2. STATE APLIKASI & PENYIMPANAN LOCALSTORAGE
  // =====================================================================
  let state = loadState();
  let saveTimer = null;
  let renderTimer = null;
  let lastComputedDoc = null;
  let sessionImagesMemory = {};
  const imageAspectCache = {};
  let pendingExtractedGuideline = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return getDefaultCleanState();
      const parsed = JSON.parse(raw);
      const def = getDefaultCleanState();
      return {
        format: { ...def.format, ...(parsed.format || {}) },
        abstract: { ...def.abstract, ...(parsed.abstract || {}) },
        cover: { ...def.cover, ...(parsed.cover || {}) },
        preface: { ...def.preface, ...(parsed.preface || {}) },
        content: typeof parsed.content === 'string' ? parsed.content : def.content,
        citations: Array.isArray(parsed.citations) ? parsed.citations : def.citations,
        manualBibliography: typeof parsed.manualBibliography === 'string' ? parsed.manualBibliography : def.manualBibliography,
        images: parsed.images && typeof parsed.images === 'object' ? parsed.images : {},
        guidelineProfile: parsed.guidelineProfile || null,
        importMeta: parsed.importMeta && typeof parsed.importMeta === 'object' ? parsed.importMeta : { hasEquations: false, hasFootnotes: false },
        ui: { ...def.ui, ...(parsed.ui || {}) },
      };
    } catch (err) {
      console.warn('Gagal memuat state lokal:', err);
      return getDefaultCleanState();
    }
  }

  function setAutoSaveStatus(text) {
    const el = document.getElementById('autosave-status');
    if (el) el.textContent = text;
  }

  function scheduleSave() {
    setAutoSaveStatus('Menyimpan...');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        setAutoSaveStatus('Tersimpan otomatis');
      } catch (err) {
        try {
          const slimImages = {};
          for (const [k, v] of Object.entries(state.images || {})) {
            if (typeof v === 'string' && v.length < 150000) {
              slimImages[k] = v;
            } else {
              sessionImagesMemory[k] = v;
            }
          }
          const slimCover = { ...state.cover };
          if (slimCover.logoDataUrl && slimCover.logoDataUrl.length > 200000) {
            sessionImagesMemory.__coverLogo = slimCover.logoDataUrl;
            slimCover.logoDataUrl = '';
          }
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, cover: slimCover, images: slimImages }));
          setAutoSaveStatus('Tersimpan (gambar di memori)');
        } catch {
          setAutoSaveStatus('Gagal simpan lokal');
        }
      }
    }, 380);
  }

  // =====================================================================
  // 3. UTILITAS UMUM (ESCAPE, ROMAWI, TOAST MINIMALIS, KONFIRMASI)
  // =====================================================================
  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toRomanLower(num) {
    if (num <= 0) return '';
    const map = [
      [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'],
      [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'],
      [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
    ];
    let n = num;
    let out = '';
    for (const [val, sym] of map) {
      while (n >= val) {
        out += sym;
        n -= val;
      }
    }
    return out;
  }

  function parseChapterNumber(babLabel) {
    const m = String(babLabel || '').match(/BAB\s+([IVXLCDM]+|\d+)/i);
    if (!m) return 0;
    const token = m[1].toUpperCase();
    if (/^\d+$/.test(token)) return parseInt(token, 10);
    const vals = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    let total = 0;
    for (let i = 0; i < token.length; i++) {
      const cur = vals[token[i]] || 0;
      const nxt = vals[token[i + 1]] || 0;
      total += cur < nxt ? -cur : cur;
    }
    return total;
  }

  function showToast(message, type = 'info', durationMs = 3800) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const styles = {
      success: 'bg-white text-ink border-ink-okBorder border-l-[3px] border-l-ink-ok',
      info: 'bg-white text-ink border-paper-borderStrong border-l-[3px] border-l-ink-primary',
      warning: 'bg-white text-ink border-ink-warnBorder border-l-[3px] border-l-ink-warn',
      error: 'bg-white text-ink border-ink-errBorder border-l-[3px] border-l-ink-err',
    };
    const icons = {
      success: '<svg class="w-4 h-4 text-ink-ok shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>',
      info: '<svg class="w-4 h-4 text-ink-primary shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/></svg>',
      warning: '<svg class="w-4 h-4 text-ink-warn shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>',
      error: '<svg class="w-4 h-4 text-ink-err shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg>',
    };
    const el = document.createElement('div');
    el.className = `toast-enter pointer-events-auto flex items-start gap-2.5 px-3 py-2.5 rounded-[4px] border shadow-md text-[12px] leading-snug ${styles[type] || styles.info}`;
    el.innerHTML = `${icons[type] || icons.info}<span class="flex-1">${escapeHtml(message)}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity 0.2s ease';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 220);
    }, Math.max(2000, Number(durationMs) || 3800));
  }

  let confirmCallback = null;
  function openConfirmModal(title, message, onConfirm) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    confirmCallback = onConfirm;
    const m = document.getElementById('confirm-modal');
    m.classList.remove('hidden');
    m.classList.add('flex');
  }
  function closeConfirmModal() {
    const m = document.getElementById('confirm-modal');
    m.classList.add('hidden');
    m.classList.remove('flex');
    confirmCallback = null;
  }

  function insertAtEditorCursor(snippet) {
    const ta = document.getElementById('content-editor');
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    ta.value = ta.value.slice(0, start) + snippet + ta.value.slice(end);
    state.content = ta.value;
    const newPos = start + snippet.length;
    ta.focus();
    ta.setSelectionRange(newPos, newPos);
    scheduleRender();
    scheduleSave();
  }

  // =====================================================================
  // 4. MESIN EKSTRAKSI PEDOMAN MAKALAH/SKRIPSI & AUDIT KEPATUHAN
  // =====================================================================
  function toNumberNormalized(str) {
    return parseFloat(String(str || '').replace(',', '.'));
  }

  function convertUnitToCm(val, unit) {
    const u = String(unit || 'cm').toLowerCase();
    if (u.startsWith('mm')) return Number((val / 10).toFixed(2));
    if (u.startsWith('in') || u.includes('inci')) return Number((val * 2.54).toFixed(2));
    return Number(val.toFixed(2));
  }

  function getEvidenceSnippet(text, matchIndex, matchLen = 20) {
    const start = Math.max(0, matchIndex - 38);
    const end = Math.min(text.length, matchIndex + matchLen + 55);
    return text.slice(start, end).replace(/\s+/g, ' ').trim();
  }

  function parseGuidelineRules(rawText) {
    const text = String(rawText || '').replace(/\r\n/g, '\n');
    const rules = [];
    const addRule = (key, label, value, displayValue, evidence, note = '') => {
      if (rules.some((r) => r.key === key)) return;
      rules.push({ key, label, value, displayValue, evidence, note, selected: true });
    };

    // 1. Ukuran Kertas (A4, F4/Folio, Letter/Kuarto, B5)
    const paperChecks = [
      { rx: /\b(A4|21\s*[x×]\s*29[.,]7)\b/i, val: 'A4', disp: 'A4 (21 x 29,7 cm)' },
      { rx: /\b(F4|Folio|21[.,]5\s*[x×]\s*33)\b/i, val: 'F4', disp: 'F4 / Folio (21,5 x 33 cm)' },
      { rx: /\b(Letter|Kuarto|Quarto|21[.,]59\s*[x×]\s*27[.,]94)\b/i, val: 'Letter', disp: 'Letter (21,59 x 27,94 cm)' },
      { rx: /\b(B5|17[.,]6\s*[x×]\s*25)\b/i, val: 'B5', disp: 'B5 (17,6 x 25 cm)' },
    ];
    for (const pc of paperChecks) {
      const m = text.match(pc.rx);
      if (m) {
        addRule('paperSize', 'Ukuran Kertas', pc.val, pc.disp, getEvidenceSnippet(text, m.index, m[0].length));
        break;
      }
    }

    // 2. Margin (Pola 4-4-3-3, per sisi, pasangan sisi, atau seragam)
    let mTop = null, mLeft = null, mBottom = null, mRight = null;
    let marginEvidence = '';

    // Pola 4 angka berurutan (4-4-3-3 atau 4, 4, 3, 3) dekat kata margin/pias/tepi
    const quadRx = /(?:margin|batas\s*tepi|pias)[^\n]{0,45}?(\d(?:[.,]\d+)?)\s*[-–—,/\s]\s*(\d(?:[.,]\d+)?)\s*[-–—,/\s]\s*(\d(?:[.,]\d+)?)\s*[-–—,/\s]\s*(\d(?:[.,]\d+)?)\s*(cm|mm|inci|inch|in)?/i;
    const qm = text.match(quadRx);
    if (qm) {
      const u = qm[5] || 'cm';
      mTop = convertUnitToCm(toNumberNormalized(qm[1]), u);
      mLeft = convertUnitToCm(toNumberNormalized(qm[2]), u);
      mBottom = convertUnitToCm(toNumberNormalized(qm[3]), u);
      mRight = convertUnitToCm(toNumberNormalized(qm[4]), u);
      marginEvidence = getEvidenceSnippet(text, qm.index, qm[0].length);
    }

    // Pola pasangan sisi (atas dan kiri 4 cm; bawah dan kanan 3 cm)
    const pairTopLeft = text.match(/(?:atas\s*(?:dan|&|,)\s*kiri|kiri\s*(?:dan|&|,)\s*atas)[^\d\n]{0,25}(\d+(?:[.,]\d+)?)\s*(cm|mm|inci|inch|in)?/i);
    if (pairTopLeft) {
      const v = convertUnitToCm(toNumberNormalized(pairTopLeft[1]), pairTopLeft[2] || 'cm');
      if (v >= 0.5 && v <= 8) {
        mTop = v; mLeft = v;
        marginEvidence = marginEvidence || getEvidenceSnippet(text, pairTopLeft.index, pairTopLeft[0].length);
      }
    }
    const pairBotRight = text.match(/(?:bawah\s*(?:dan|&|,)\s*kanan|kanan\s*(?:dan|&|,)\s*bawah)[^\d\n]{0,25}(\d+(?:[.,]\d+)?)\s*(cm|mm|inci|inch|in)?/i);
    if (pairBotRight) {
      const v = convertUnitToCm(toNumberNormalized(pairBotRight[1]), pairBotRight[2] || 'cm');
      if (v >= 0.5 && v <= 8) {
        mBottom = v; mRight = v;
        marginEvidence = marginEvidence || getEvidenceSnippet(text, pairBotRight.index, pairBotRight[0].length);
      }
    }

    // Pola individual per sisi (atas/top, kiri/left, bawah/bottom, kanan/right)
    const sideDefs = [
      { side: 'top', rx: /(?:margin\s+|tepi\s+|pias\s+|batas\s+)?(?:atas|top)\s*(?:=|:|sebesar|adalah)?\s*(\d+(?:[.,]\d+)?)\s*(cm|mm|inci|inch|in)/i },
      { side: 'left', rx: /(?:margin\s+|tepi\s+|pias\s+|batas\s+)?(?:kiri|left)\s*(?:=|:|sebesar|adalah)?\s*(\d+(?:[.,]\d+)?)\s*(cm|mm|inci|inch|in)/i },
      { side: 'bottom', rx: /(?:margin\s+|tepi\s+|pias\s+|batas\s+)?(?:bawah|bottom)\s*(?:=|:|sebesar|adalah)?\s*(\d+(?:[.,]\d+)?)\s*(cm|mm|inci|inch|in)/i },
      { side: 'right', rx: /(?:margin\s+|tepi\s+|pias\s+|batas\s+)?(?:kanan|right)\s*(?:=|:|sebesar|adalah)?\s*(\d+(?:[.,]\d+)?)\s*(cm|mm|inci|inch|in)/i },
    ];
    sideDefs.forEach(({ side, rx }) => {
      const m = text.match(rx);
      if (m) {
        const v = convertUnitToCm(toNumberNormalized(m[1]), m[2]);
        if (v >= 0.5 && v <= 8) {
          if (side === 'top') mTop = v;
          if (side === 'left') mLeft = v;
          if (side === 'bottom') mBottom = v;
          if (side === 'right') mRight = v;
          marginEvidence = marginEvidence || getEvidenceSnippet(text, m.index, m[0].length);
        }
      }
    });

    // Margin seragam (semua sisi 3 cm)
    if (mTop === null && mLeft === null && mBottom === null && mRight === null) {
      const uni = text.match(/(?:margin|batas\s*tepi)[^\d\n]{0,28}(?:semua\s*sisi|seluruh\s*sisi|masing-masing)?[^\d\n]{0,12}(\d+(?:[.,]\d+)?)\s*(cm|mm|inci|inch|in)/i);
      if (uni) {
        const v = convertUnitToCm(toNumberNormalized(uni[1]), uni[2]);
        if (v >= 0.5 && v <= 8) {
          mTop = mLeft = mBottom = mRight = v;
          marginEvidence = getEvidenceSnippet(text, uni.index, uni[0].length);
        }
      }
    }

    if (mTop !== null) addRule('marginTop', 'Margin Atas', mTop, `${mTop} cm`, marginEvidence);
    if (mLeft !== null) addRule('marginLeft', 'Margin Kiri', mLeft, `${mLeft} cm`, marginEvidence);
    if (mBottom !== null) addRule('marginBottom', 'Margin Bawah', mBottom, `${mBottom} cm`, marginEvidence);
    if (mRight !== null) addRule('marginRight', 'Margin Kanan', mRight, `${mRight} cm`, marginEvidence);

    // 3. Jenis Font
    const fontNames = ['Times New Roman', 'Book Antiqua', 'Arial', 'Calibri', 'Georgia', 'Cambria', 'Garamond'];
    for (const fn of fontNames) {
      const rx = new RegExp(`\\b${fn.replace(/\s+/g, '\\s+')}\\b`, 'i');
      const m = text.match(rx);
      if (m) {
        addRule('fontFamily', 'Jenis Font', fn, fn, getEvidenceSnippet(text, m.index, m[0].length));
        break;
      }
    }

    // 4. Ukuran Font Isi (10-14 pt)
    const bodyFontMatch =
      text.match(/(?:ukuran\s*(?:font|huruf)?|font\s*size|berukuran|huruf)\s*(?:isi|naskah|teks|utama)?[^\d\n]{0,20}(1[0-4])\s*(?:pt|point|poin)/i) ||
      text.match(/\b(1[0-4])\s*(?:pt|point|poin)\b/i);
    if (bodyFontMatch) {
      const sz = parseInt(bodyFontMatch[1], 10);
      addRule('fontSize', 'Ukuran Font Isi', sz, `${sz} pt`, getEvidenceSnippet(text, bodyFontMatch.index, bodyFontMatch[0].length));
    }

    // 5. Ukuran Font Judul BAB (12-18 pt)
    const headFontMatch =
      text.match(/judul\s*bab[^\d\n]{0,40}(1[2-8])\s*(?:pt|point|poin)/i) ||
      text.match(/(1[2-8])\s*(?:pt|point|poin)[^\n]{0,30}judul\s*bab/i);
    if (headFontMatch) {
      const hsz = parseInt(headFontMatch[1], 10);
      addRule('headingFontSize', 'Ukuran Judul BAB', hsz, `${hsz} pt`, getEvidenceSnippet(text, headFontMatch.index, headFontMatch[0].length));
    }

    // 6. Spasi Baris (1.0, 1.15, 1.5, 2.0)
    const spMatch =
      text.match(/(?:spasi(?:\s*baris|\s*antarbaris)?|jarak\s*(?:antar)?baris)[^\d\n]{0,24}(1[.,]15|1[.,]5|2(?:[.,]0)?|1(?:[.,]0)?)/i) ||
      text.match(/\b(1[.,]15|1[.,]5|2[.,]0)\s*spasi\b/i) ||
      text.match(/spasi\s*(tunggal|satu\s*setengah|ganda|dobel|double)/i);
    if (spMatch) {
      let spVal = 1.5;
      const raw = spMatch[1].toLowerCase().replace(',', '.');
      if (raw === 'tunggal' || raw === '1' || raw === '1.0') spVal = 1;
      else if (raw === '1.15') spVal = 1.15;
      else if (raw.includes('setengah') || raw === '1.5') spVal = 1.5;
      else if (raw === 'ganda' || raw === 'dobel' || raw === 'double' || raw === '2' || raw === '2.0') spVal = 2;
      addRule('lineSpacing', 'Spasi Baris', spVal, `${spVal} spasi`, getEvidenceSnippet(text, spMatch.index, spMatch[0].length));
    }

    // 7. Indentasi Paragraf (cm/mm/inci atau ketukan/tab)
    const indentCmMatch = text.match(/(?:indentasi|menjorok|alinea\s*baru|baris\s*pertama)[^\d\n]{0,32}(\d+(?:[.,]\d+)?)\s*(cm|mm|inci|inch|in)/i);
    const indentTapMatch = text.match(/(?:indentasi|menjorok|alinea\s*baru|masuk)[^\d\n]{0,25}([5-7])\s*(?:ketuk(?:an)?|spasi|karakter)|1\s*tab/i);
    if (indentCmMatch) {
      const val = Math.min(2.5, Math.max(0, convertUnitToCm(toNumberNormalized(indentCmMatch[1]), indentCmMatch[2])));
      addRule('firstIndent', 'Indentasi Awal', val, `${val} cm`, getEvidenceSnippet(text, indentCmMatch.index, indentCmMatch[0].length));
    } else if (indentTapMatch) {
      const val = indentTapMatch[1] ? Number((parseInt(indentTapMatch[1], 10) * 0.21).toFixed(2)) : 1.27;
      addRule('firstIndent', 'Indentasi Awal', val, `${val} cm`, getEvidenceSnippet(text, indentTapMatch.index, indentTapMatch[0].length), 'Konversi ketukan/tab');
    }

    // 7b. Spacing Before & After Paragraf (pt)
    const bothBeforeAfter = text.match(/(?:spacing\s*)?(?:before\s*(?:dan|&|\/|,)\s*after|sebelum\s*(?:dan|&|\/|,)\s*(?:sesudah|setelah))\s*(?:=|:|sebesar|adalah)?\s*(\d+(?:[.,]\d+)?)\s*(?:pt|point|poin)/i);
    if (bothBeforeAfter) {
      const v = Math.min(36, Math.max(0, toNumberNormalized(bothBeforeAfter[1])));
      const ev = getEvidenceSnippet(text, bothBeforeAfter.index, bothBeforeAfter[0].length);
      addRule('spaceBefore', 'Spacing Before', v, `${v} pt`, ev);
      addRule('spaceAfter', 'Spacing After', v, `${v} pt`, ev);
    } else {
      const sbMatch = text.match(/(?:spacing\s*before|spasi\s*sebelum|before)\s*(?:=|:|sebesar|adalah)?\s*(\d+(?:[.,]\d+)?)\s*(?:pt|point|poin)/i);
      if (sbMatch) {
        const v = Math.min(36, Math.max(0, toNumberNormalized(sbMatch[1])));
        addRule('spaceBefore', 'Spacing Before', v, `${v} pt`, getEvidenceSnippet(text, sbMatch.index, sbMatch[0].length));
      }
      const saMatch = text.match(/(?:spacing\s*after|spasi\s*(?:sesudah|setelah)|jarak\s*antar\s*paragraf|after)\s*(?:=|:|sebesar|adalah)?\s*(\d+(?:[.,]\d+)?)\s*(?:pt|point|poin)/i);
      if (saMatch) {
        const v = Math.min(36, Math.max(0, toNumberNormalized(saMatch[1])));
        addRule('spaceAfter', 'Spacing After', v, `${v} pt`, getEvidenceSnippet(text, saMatch.index, saMatch[0].length));
      }
    }

    // 8. Perataan Teks
    const alignJustify = text.match(/\b(rata\s*kanan[\s-]*kiri|rata\s*kiri[\s-]*kanan|justify|justified)\b/i);
    const alignLeft = !alignJustify ? text.match(/\b(rata\s*kiri|align\s*left)\b/i) : null;
    if (alignJustify) {
      addRule('textAlign', 'Perataan Teks', 'justify', 'Rata Kanan-Kiri', getEvidenceSnippet(text, alignJustify.index, alignJustify[0].length));
    } else if (alignLeft) {
      addRule('textAlign', 'Perataan Teks', 'left', 'Rata Kiri', getEvidenceSnippet(text, alignLeft.index, alignLeft[0].length));
    }

    // 9. Gaya Sitasi (APA / IEEE / adaptasi Harvard / Chicago)
    const ieeeMatch = text.match(/\b(IEEE(?:\s*Style)?)\b/i);
    const apaMatch = text.match(/\b(APA(?:\s*(?:7|7th|6|6th|Style|Edition))?)\b/i);
    const harvardChicagoMatch = text.match(/\b(Harvard|Chicago)\b/i);
    if (ieeeMatch) {
      addRule('citationStyle', 'Gaya Sitasi', 'ieee', 'IEEE Style', getEvidenceSnippet(text, ieeeMatch.index, ieeeMatch[0].length));
    } else if (apaMatch) {
      addRule('citationStyle', 'Gaya Sitasi', 'apa', 'APA 7th Ed.', getEvidenceSnippet(text, apaMatch.index, apaMatch[0].length));
    } else if (harvardChicagoMatch) {
      addRule('citationStyle', 'Gaya Sitasi', 'apa', 'APA 7th Ed.', getEvidenceSnippet(text, harvardChicagoMatch.index, harvardChicagoMatch[0].length), `Adaptasi author-date (${harvardChicagoMatch[1]})`);
    }

    // 10. Mode Penomoran Halaman
    const skripsiNumMatch =
      text.match(/(?:awal\s*bab|pertama\s*(?:setiap\s*)?bab)[^\n]{0,60}(?:tengah\s*bawah|bawah\s*tengah)[\s\S]{0,120}(?:kanan\s*atas|atas\s*kanan)/i) ||
      text.match(/(?:tengah\s*bawah|bawah\s*tengah)[^\n]{0,60}(?:awal\s*bab|pertama\s*(?:setiap\s*)?bab)[\s\S]{0,120}(?:kanan\s*atas|atas\s*kanan)/i) ||
      text.match(/standar\s*skripsi[\s\S]{0,80}(?:kanan\s*atas|romawi)/i);
    const topRightAllMatch = !skripsiNumMatch ? text.match(/(?:nomor\s*halaman|penomoran\s*halaman)[^\n]{0,70}(?:pojok\s*kanan\s*atas|kanan\s*atas)/i) : null;
    const bottomAllMatch = !skripsiNumMatch && !topRightAllMatch ? text.match(/(?:nomor\s*halaman|penomoran\s*halaman)[^\n]{0,70}(?:tengah\s*bawah|bawah\s*tengah)/i) : null;

    if (skripsiNumMatch) {
      addRule('pageNumberMode', 'Penomoran Halaman', 'skripsi', 'Standar Skripsi', getEvidenceSnippet(text, skripsiNumMatch.index, 40));
    } else if (topRightAllMatch) {
      addRule('pageNumberMode', 'Penomoran Halaman', 'top-right', 'Pojok Kanan Atas Semua', getEvidenceSnippet(text, topRightAllMatch.index, topRightAllMatch[0].length));
    } else if (bottomAllMatch) {
      addRule('pageNumberMode', 'Penomoran Halaman', 'bottom-center', 'Tengah Bawah Semua', getEvidenceSnippet(text, bottomAllMatch.index, bottomAllMatch[0].length));
    }

    // 11. Komponen Wajib Dokumen
    const compDefs = [
      { key: 'showCover', label: 'Halaman Cover', rx: /\b(halaman\s*sampul|cover)\b/i },
      { key: 'showPreface', label: 'Kata Pengantar', rx: /\bkata\s*pengantar\b/i },
      { key: 'showToc', label: 'Daftar Isi', rx: /\bdaftar\s*isi\b/i },
      { key: 'showLot', label: 'Daftar Tabel', rx: /\bdaftar\s*tabel\b/i },
      { key: 'showLof', label: 'Daftar Gambar', rx: /\bdaftar\s*gambar\b/i },
    ];
    compDefs.forEach((cd) => {
      const m = text.match(cd.rx);
      if (m) {
        addRule(cd.key, cd.label, true, 'Aktif', getEvidenceSnippet(text, m.index, m[0].length));
      }
    });

    return rules;
  }

  function formatCurrentValueForRule(key) {
    const f = state.format;
    switch (key) {
      case 'paperSize': return f.paperSize;
      case 'marginTop': return `${f.marginTop} cm`;
      case 'marginLeft': return `${f.marginLeft} cm`;
      case 'marginBottom': return `${f.marginBottom} cm`;
      case 'marginRight': return `${f.marginRight} cm`;
      case 'fontFamily': return f.fontFamily;
      case 'fontSize': return `${f.fontSize} pt`;
      case 'headingFontSize': return `${f.headingFontSize} pt`;
      case 'lineSpacing': return `${f.lineSpacing} spasi`;
      case 'firstIndent': return `${f.firstIndent} cm`;
      case 'spaceBefore': return `${f.spaceBefore ?? 0} pt`;
      case 'spaceAfter': return `${f.spaceAfter ?? 0} pt`;
      case 'textAlign': return f.textAlign === 'left' ? 'Rata Kiri' : 'Rata Kanan-Kiri';
      case 'citationStyle': return f.citationStyle === 'ieee' ? 'IEEE Style' : 'APA 7th Ed.';
      case 'pageNumberMode': return PAGE_NUM_MODE_LABELS[f.pageNumberMode] || f.pageNumberMode;
      case 'showCover':
      case 'showPreface':
      case 'showToc':
      case 'showLot':
      case 'showLof':
        return f[key] ? 'Aktif' : 'Nonaktif';
      default: return String(f[key]);
    }
  }

  function isRuleCompliant(rule) {
    const cur = state.format[rule.key];
    if (typeof rule.value === 'number') {
      return Math.abs(Number(cur) - rule.value) < 0.02;
    }
    return cur === rule.value;
  }

  function updateComplianceAuditUI() {
    const headerBtn = document.getElementById('header-compliance-btn');
    const headerText = document.getElementById('header-compliance-text');
    const tabDot = document.getElementById('tab-pedoman-dot');
    const auditSec = document.getElementById('guideline-audit-section');
    const prof = state.guidelineProfile;

    if (!prof || !Array.isArray(prof.rules) || !prof.rules.length) {
      auditSec.classList.add('hidden');
      tabDot.classList.add('hidden');
      headerText.textContent = 'Tanpa Pedoman';
      headerBtn.className = 'hidden md:inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded-[4px] border border-paper-border bg-paper-bg text-ink-muted hover:border-paper-borderStrong transition cursor-pointer';
      return;
    }

    auditSec.classList.remove('hidden');
    tabDot.classList.remove('hidden');

    const deviations = prof.rules.filter((r) => !isRuleCompliant(r));
    const total = prof.rules.length;
    const matched = total - deviations.length;
    const pct = Math.round((matched / total) * 100);
    const allOk = deviations.length === 0;

    document.getElementById('audit-profile-name').textContent = prof.name;
    document.getElementById('audit-rule-count').textContent = `${matched}/${total} aturan terpenuhi`;

    const scoreBadge = document.getElementById('audit-score-badge');
    const devBox = document.getElementById('audit-deviations-box');
    const devList = document.getElementById('audit-deviations-list');

    if (allOk) {
      scoreBadge.textContent = '100% Patuh';
      scoreBadge.className = 'font-mono text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-[4px] border border-ink-okBorder bg-ink-okBg text-ink-ok shrink-0';
      devBox.classList.add('hidden');
      tabDot.className = 'w-1.5 h-1.5 rounded-full bg-ink-ok';
      headerText.textContent = '100% Patuh Pedoman';
      headerBtn.className = 'hidden md:inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded-[4px] border border-ink-okBorder bg-ink-okBg text-ink-ok transition cursor-pointer';
    } else {
      scoreBadge.textContent = `${pct}% (${matched}/${total})`;
      scoreBadge.className = 'font-mono text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-[4px] border border-ink-warnBorder bg-ink-warnBg text-ink-warn shrink-0';
      devBox.classList.remove('hidden');
      devList.innerHTML = deviations
        .map(
          (d) =>
            `<li class="flex items-center justify-between gap-2"><span>${escapeHtml(d.label)}</span><span class="font-mono text-[10px] text-ink-warn">${escapeHtml(formatCurrentValueForRule(d.key))} &rarr; ${escapeHtml(d.displayValue)}</span></li>`
        )
        .join('');
      tabDot.className = 'w-1.5 h-1.5 rounded-full bg-ink-warn';
      headerText.textContent = `Pedoman ${matched}/${total}`;
      headerBtn.className = 'hidden md:inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded-[4px] border border-ink-warnBorder bg-ink-warnBg text-ink-warn transition cursor-pointer';
    }
  }

  function showGuidelineExtractionResults(sourceName, rules) {
    const sec = document.getElementById('guideline-results-section');
    const listEl = document.getElementById('guideline-rules-list');
    const errBox = document.getElementById('guideline-error-box');
    errBox.classList.add('hidden');

    if (!rules.length) {
      sec.classList.add('hidden');
      errBox.textContent = 'Tidak ditemukan aturan format akademik spesifik (kertas, margin, font, spasi, sitasi) pada teks tersebut. Coba tempel bagian "Tata Tulis" atau "Format Pengetikan" secara langsung.';
      errBox.classList.remove('hidden');
      return;
    }

    pendingExtractedGuideline = { name: sourceName, rules };
    document.getElementById('guideline-source-label').textContent = sourceName;
    document.getElementById('guideline-detected-count').textContent = `${rules.length} aturan`;

    listEl.innerHTML = rules
      .map((r, idx) => {
        const currentDisp = formatCurrentValueForRule(r.key);
        const alreadySame = isRuleCompliant(r);
        return `
          <label class="block border border-paper-border rounded-[4px] p-2 bg-paper-bg/50 hover:border-paper-borderStrong cursor-pointer space-y-1">
            <div class="flex items-start gap-2">
              <input type="checkbox" data-rule-idx="${idx}" ${r.selected ? 'checked' : ''} class="guideline-rule-chk mt-0.5 w-3.5 h-3.5 shrink-0" />
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between gap-1">
                  <span class="text-[11px] font-semibold text-ink">${escapeHtml(r.label)}</span>
                  ${alreadySame ? '<span class="font-mono text-[9px] text-ink-ok">Sesuai</span>' : ''}
                </div>
                <div class="font-mono text-[11px] tabular-nums mt-0.5">
                  <span class="text-ink-muted">${escapeHtml(currentDisp)}</span>
                  <span class="text-ink-subtle mx-1">&rarr;</span>
                  <span class="text-ink-primary font-semibold">${escapeHtml(r.displayValue)}</span>
                </div>
                ${r.note ? `<div class="text-[10px] text-ink-warn mt-0.5">${escapeHtml(r.note)}</div>` : ''}
                ${r.evidence ? `<div class="text-[10px] text-ink-muted italic border-l-2 border-paper-borderStrong pl-1.5 mt-1 line-clamp-2">"${escapeHtml(r.evidence)}"</div>` : ''}
              </div>
            </div>
          </label>
        `;
      })
      .join('');

    sec.classList.remove('hidden');
    sec.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function handleGuidelineFileUpload(file) {
    const progWrap = document.getElementById('guideline-progress');
    const progLabel = document.getElementById('guideline-progress-label');
    const progPct = document.getElementById('guideline-progress-pct');
    const progBar = document.getElementById('guideline-progress-bar');
    const errBox = document.getElementById('guideline-error-box');

    errBox.classList.add('hidden');
    progWrap.classList.remove('hidden');

    const setProg = (pct, label) => {
      progBar.style.width = `${pct}%`;
      progPct.textContent = `${pct}%`;
      progLabel.textContent = label;
    };

    try {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      let extractedText = '';

      if (window.MakaRapiAPI) {
        const apiInfo = await window.MakaRapiAPI.detectBackend();
        if (apiInfo.online) {
          setProg(40, 'Mengekstrak pedoman via server Python...');
          const res = await window.MakaRapiAPI.parseGuideline(file);
          if (res && res.text) {
            extractedText = res.text;
            setProg(100, 'Ekstraksi Python selesai');
          }
        }
      }

      if (!extractedText) {
        if (ext === 'txt' || ext === 'md') {
          setProg(40, 'Membaca berkas teks...');
          extractedText = await file.text();
          setProg(100, 'Ekstraksi selesai');
        } else if (ext === 'docx') {
          if (!window.mammoth) {
            throw new Error('Pustaka pembaca DOCX belum termuat. Periksa koneksi internet atau gunakan mode Tempel Teks.');
          }
          setProg(35, 'Mengekstrak teks dokumen Word (.docx)...');
          const ab = await file.arrayBuffer();
          const res = await window.mammoth.extractRawText({ arrayBuffer: ab });
          extractedText = res.value || '';
          setProg(100, 'Ekstraksi selesai');
        } else if (ext === 'pdf') {
          if (!window.pdfjsLib) {
            throw new Error('Pustaka pembaca PDF belum termuat. Periksa koneksi internet atau gunakan mode Tempel Teks.');
          }
          setProg(15, 'Memuat berkas PDF...');
          const ab = await file.arrayBuffer();
          const pdf = await window.pdfjsLib.getDocument({ data: ab }).promise;
          const maxPages = Math.min(pdf.numPages, 40);
          const parts = [];
          for (let p = 1; p <= maxPages; p++) {
            setProg(15 + Math.round((p / maxPages) * 80), `Membaca halaman ${p} dari ${maxPages}...`);
            const page = await pdf.getPage(p);
            const tc = await page.getTextContent();
            parts.push(tc.items.map((it) => it.str).join(' '));
          }
          extractedText = parts.join('\n');
          if (extractedText.trim().length < 25) {
            throw new Error('PDF tidak memiliki lapisan teks (kemungkinan hasil pindai gambar/scan). Salin teks pedoman secara manual pada mode Tempel Teks.');
          }
          setProg(100, 'Ekstraksi selesai');
        } else {
          throw new Error('Format berkas tidak didukung. Unggah berkas berformat .pdf, .docx, .txt, atau .md.');
        }
      }

      const rules = parseGuidelineRules(extractedText);
      setTimeout(() => progWrap.classList.add('hidden'), 500);
      showGuidelineExtractionResults(file.name, rules);
      if (rules.length) {
        showToast(`Berhasil mendeteksi ${rules.length} aturan dari ${file.name}.`, 'success');
      }
    } catch (err) {
      progWrap.classList.add('hidden');
      const msg = err?.name === 'PasswordException'
        ? 'PDF terlindungi kata sandi dan tidak dapat dibaca langsung. Buka proteksi atau gunakan mode Tempel Teks.'
        : (err?.message || 'Gagal membaca berkas pedoman.');
      errBox.textContent = msg;
      errBox.classList.remove('hidden');
      showToast('Gagal memproses berkas pedoman.', 'error');
    }
  }

  // =====================================================================
  // 5. MESIN SITASI OTOMATIS (APA 7TH EDITION & IEEE)
  // =====================================================================
  function parseAuthorList(rawAuthors) {
    return String(rawAuthors || '')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => {
        if (!name.includes(',') && !name.includes(' ')) {
          return { isOrg: true, full: name, last: name, initials: '' };
        }
        if (name.includes(',')) {
          const parts = name.split(',').map((p) => p.trim());
          const last = parts[0];
          const given = parts[1] || '';
          const initials = given.split(/[\s.]+/).filter(Boolean).map((w) => `${w[0].toUpperCase()}.`).join(' ');
          return { isOrg: false, full: name, last, initials };
        }
        const tokens = name.split(/\s+/).filter(Boolean);
        const last = tokens[tokens.length - 1];
        const initials = tokens.slice(0, -1).map((w) => `${w[0].toUpperCase()}.`).join(' ');
        return { isOrg: false, full: name, last, initials };
      });
  }

  function formatCitationInTextAPA(cit) {
    const authors = parseAuthorList(cit.authors);
    const year = (cit.year || 'n.d.').trim();
    if (!authors.length) return `(${year})`;
    if (authors.length === 1) return `(${authors[0].last}, ${year})`;
    if (authors.length === 2) return `(${authors[0].last} & ${authors[1].last}, ${year})`;
    return `(${authors[0].last} et al., ${year})`;
  }

  function formatCitationBibHtmlAPA(cit) {
    const authors = parseAuthorList(cit.authors);
    let authorStr = '';
    if (authors.length === 1) {
      authorStr = authors[0].isOrg ? `${authors[0].full}.` : `${authors[0].last}, ${authors[0].initials}`;
    } else if (authors.length === 2) {
      const a1 = authors[0].isOrg ? authors[0].full : `${authors[0].last}, ${authors[0].initials}`;
      const a2 = authors[1].isOrg ? authors[1].full : `${authors[1].last}, ${authors[1].initials}`;
      authorStr = `${a1}, & ${a2}`;
    } else if (authors.length > 2) {
      const list = authors.map((a) => (a.isOrg ? a.full : `${a.last}, ${a.initials}`));
      const lastA = list.pop();
      authorStr = `${list.join(', ')}, & ${lastA}`;
    }

    const year = escapeHtml((cit.year || 'n.d.').trim());
    const rawTitle = (cit.title || '').trim();
    const title = escapeHtml(rawTitle);
    const titleEnd = /[.!?]$/.test(rawTitle) ? '' : '.';

    if (cit.type === 'book') {
      const pub = escapeHtml((cit.publisher || '').trim());
      const city = escapeHtml((cit.city || '').trim());
      const pubPart = city && pub ? `${city}: ${pub}.` : pub ? `${pub}.` : '';
      return `${escapeHtml(authorStr)} (${year}). <i>${title}</i>${titleEnd} ${pubPart}`.trim();
    }
    if (cit.type === 'journal') {
      const journal = escapeHtml((cit.journal || '').trim());
      const vol = escapeHtml((cit.vol || '').trim());
      const issue = escapeHtml((cit.issue || '').trim());
      const pages = escapeHtml((cit.pages || '').trim());
      let loc = journal ? `<i>${journal}</i>` : '';
      if (vol) loc += `${loc ? ', ' : ''}<i>${vol}</i>`;
      if (issue) loc += `(${issue})`;
      if (pages) loc += `${loc ? ', ' : ''}${pages}`;
      return `${escapeHtml(authorStr)} (${year}). ${title}${titleEnd}${loc ? ` ${loc}.` : ''}`.trim();
    }
    const site = escapeHtml((cit.site || '').trim());
    const url = escapeHtml((cit.url || '').trim());
    return `${escapeHtml(authorStr)} (${year}). <i>${title}</i>${titleEnd} ${site ? `${site}. ` : ''}${url}`.trim();
  }

  function formatCitationBibHtmlIEEE(cit) {
    const authors = parseAuthorList(cit.authors);
    let authorStr = '';
    if (authors.length === 1) {
      authorStr = authors[0].isOrg ? authors[0].full : `${authors[0].initials} ${authors[0].last}`;
    } else if (authors.length === 2) {
      const a1 = authors[0].isOrg ? authors[0].full : `${authors[0].initials} ${authors[0].last}`;
      const a2 = authors[1].isOrg ? authors[1].full : `${authors[1].initials} ${authors[1].last}`;
      authorStr = `${a1} and ${a2}`;
    } else if (authors.length > 2) {
      const list = authors.map((a) => (a.isOrg ? a.full : `${a.initials} ${a.last}`));
      const lastA = list.pop();
      authorStr = `${list.join(', ')}, and ${lastA}`;
    }

    const year = escapeHtml((cit.year || 'n.d.').trim());
    const title = escapeHtml((cit.title || '').trim());

    if (cit.type === 'book') {
      const pub = escapeHtml((cit.publisher || '').trim());
      const city = escapeHtml((cit.city || '').trim());
      const pubPart = city && pub ? `${city}: ${pub}, ` : pub ? `${pub}, ` : '';
      return `${escapeHtml(authorStr)}, <i>${title}</i>. ${pubPart}${year}.`;
    }
    if (cit.type === 'journal') {
      const journal = escapeHtml((cit.journal || '').trim());
      const vol = escapeHtml((cit.vol || '').trim());
      const issue = escapeHtml((cit.issue || '').trim());
      const pages = escapeHtml((cit.pages || '').trim());
      const parts = [];
      if (journal) parts.push(`<i>${journal}</i>`);
      if (vol) parts.push(`vol. ${vol}`);
      if (issue) parts.push(`no. ${issue}`);
      if (pages) parts.push(`pp. ${pages}`);
      parts.push(year);
      return `${escapeHtml(authorStr)}, &ldquo;${title},&rdquo; ${parts.join(', ')}.`;
    }
    const site = escapeHtml((cit.site || '').trim());
    const url = escapeHtml((cit.url || '').trim());
    return `${escapeHtml(authorStr)}, &ldquo;${title},&rdquo; ${site ? `<i>${site}</i>, ` : ''}${year}. [Online]. Available: ${url}`;
  }

  function buildCitationContext(rawText) {
    const mapById = new Map();
    (state.citations || []).forEach((c) => mapById.set(c.id, c));
    const ieeeOrderIds = [];
    const regex = /\[@([a-zA-Z0-9_-]+)\]/g;
    let match;
    let inlineUsageCount = 0;

    while ((match = regex.exec(rawText || '')) !== null) {
      const id = match[1];
      if (mapById.has(id)) {
        inlineUsageCount++;
        if (!ieeeOrderIds.includes(id)) ieeeOrderIds.push(id);
      }
    }
    (state.citations || []).forEach((c) => {
      if (!ieeeOrderIds.includes(c.id)) ieeeOrderIds.push(c.id);
    });

    const ieeeNumberById = new Map();
    ieeeOrderIds.forEach((id, idx) => ieeeNumberById.set(id, idx + 1));
    return { mapById, ieeeOrderIds, ieeeNumberById, inlineUsageCount };
  }

  function escapeAllowingItalics(rawStr) {
    // Loloskan hanya tag <i>...</i> secara aman (mencegah XSS) agar istilah asing miring tetap terjaga
    return escapeHtml(rawStr).replace(/&lt;i&gt;([\s\S]*?)&lt;\/i&gt;/gi, '<i>$1</i>');
  }

  function formatTextWithCitations(rawStr, citCtx, style) {
    const escaped = escapeAllowingItalics(rawStr);
    return escaped.replace(/\[@([a-zA-Z0-9_-]+)\]/g, (full, id) => {
      const cit = citCtx.mapById.get(id);
      if (!cit) return full;
      if (style === 'ieee') return `[${citCtx.ieeeNumberById.get(id) || '?'}]`;
      return escapeHtml(formatCitationInTextAPA(cit));
    });
  }

  function buildFinalBibliography(citCtx, style) {
    const manualLines = (state.manualBibliography || '')
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    if (style === 'ieee') {
      const items = [];
      let counter = 1;
      citCtx.ieeeOrderIds.forEach((id) => {
        const cit = citCtx.mapById.get(id);
        if (cit) items.push({ num: counter++, html: formatCitationBibHtmlIEEE(cit) });
      });
      manualLines.forEach((line) => {
        items.push({ num: counter++, html: escapeAllowingItalics(line.replace(/^\[\d+\]\s*/, '')) });
      });
      return items;
    }

    const apaItems = [];
    (state.citations || []).forEach((cit) => {
      const html = formatCitationBibHtmlAPA(cit);
      apaItems.push({ sortKey: html.replace(/<[^>]+>/g, '').trim(), html });
    });
    manualLines.forEach((line) => {
      const html = escapeAllowingItalics(line);
      apaItems.push({ sortKey: html.replace(/<[^>]+>/g, '').trim(), html });
    });
    apaItems.sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'id', { sensitivity: 'base' }));
    return apaItems;
  }

  // Audit Konsistensi Sitasi ↔ Daftar Pustaka (Fallback Lokal JS bila server Python offline)
  function auditCitationsLocally() {
    const yearRx = /\b(19\d{2}|20\d{2}[a-z]?)\b/i;
    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const ignorePrefixes = new Set([
      'lihat', 'misalnya', 'misal', 'contoh', 'contohnya', 'seperti', 'antara',
      'tahun', 'bulan', 'periode', 'pada', 'pojk', 'uu', 'pp', 'permen', 'sk',
      'bab', 'tabel', 'gambar', 'halaman', 'hal', 'pasal', 'ayat', 'undang',
      'undang-undang', 'peraturan', 'no', 'nomor', 'sebagaimana', 'kelurahan',
      'kota', 'provinsi', 'kabupaten', 'universitas', 'fakultas', 'baruga',
      'palu', 'indonesia', 'data', 'statistik', 'sumber', 'menurut', 'oleh',
      'dari', 'dalam', 'buku', 'jurnal', 'penelitian', 'hasil', 'olah',
      'model', 'skala', 'metode', 'standar', 'literasi', 'keuangan',
      'kinerja', 'umkm', 'qris', 'fintech', 'street', 'food',
    ]);

    const extractSurname = (chunk) => {
      const c = String(chunk || '')
        .replace(/\b(?:dkk\.?|et\s+al\.?|and|dan)\b/gi, ' ')
        .split(/[&,;]/)[0]
        .replace(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9\- ]+/g, ' ')
        .trim();
      const words = c.split(/\s+/).filter((w) => w.length >= 2);
      if (!words.length || ignorePrefixes.has(words[0].toLowerCase())) return '';
      return words[words.length - 1];
    };

    const managedById = new Map((state.citations || []).map((c) => [c.id, c]));
    const bibEntries = [];
    (state.citations || []).forEach((c, i) => {
      const firstAuth = String(c.authors || '').split(';')[0].trim();
      const label = `${firstAuth} (${c.year || ''}). ${c.title || ''}`.trim();
      bibEntries.push({
        index: i + 1,
        refId: c.id,
        surname: norm(extractSurname(firstAuth)),
        year: String(c.year || '').toLowerCase().trim(),
        label,
        plain: label.toLowerCase(),
        cited: false,
      });
    });

    (state.manualBibliography || '')
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((line) => {
        const plain = line.replace(/<[^>]+>/g, '').trim();
        const ym = plain.match(yearRx);
        const year = ym ? ym[1].toLowerCase() : '';
        const before = (ym ? plain.slice(0, ym.index) : plain.slice(0, 80)).replace(/^\[\d+\]\s*/, '').trim();
        const firstPart = (before.includes(',') ? before.split(',')[0] : before.split('.')[0]).split(/[&;]|\b(?:dan|and)\b/i)[0].trim();
        const words = firstPart.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9\- ]+/g, ' ').trim().split(/\s+/).filter((w) => w.length >= 2);
        bibEntries.push({
          index: bibEntries.length + 1,
          refId: '',
          surname: norm(words[words.length - 1] || ''),
          year,
          label: plain.length > 110 ? `${plain.slice(0, 110)}...` : plain,
          plain: plain.toLowerCase(),
          cited: false,
        });
      });

    const stripped = String(state.content || '')
      .replace(/\[GAMBAR[^\]]*\]|\[TABEL[^\]]*\]|\[\/TABEL\]/gi, ' ');
    const inText = [];
    const seen = new Set();

    let m;
    const refRx = /\[@([a-zA-Z0-9_-]+)\]/g;
    while ((m = refRx.exec(stripped)) !== null) {
      const id = m[1];
      const cit = managedById.get(id);
      const key = `m:${id}`;
      if (!seen.has(key)) {
        seen.add(key);
        const s = cit ? extractSurname(String(cit.authors || '').split(';')[0]) : '';
        inText.push({ raw: cit && s ? `[@${id}] (${s}, ${cit.year || ''})` : `[@${id}]`, refId: id, surname: norm(s), year: String(cit?.year || '').toLowerCase() });
      }
    }

    const parenRx = /\(([^()]{4,180})\)/g;
    while ((m = parenRx.exec(stripped)) !== null) {
      m[1].split(';').forEach((partRaw) => {
        const part = partRaw.trim();
        const ym = part.match(yearRx);
        if (!ym) return;
        const before = part.slice(0, ym.index).trim().replace(/[,\s]+$/, '');
        const s = extractSurname(before);
        if (!s || s.length < 2) return;
        const sn = norm(s);
        const yr = ym[1].toLowerCase();
        const key = `ay:${sn}:${yr}`;
        if (!seen.has(key)) {
          seen.add(key);
          inText.push({ raw: `(${part})`, refId: '', surname: sn, year: yr });
        }
      });
    }

    const narrRx = /([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'\-]+(?:\s+(?:[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'\-]+|&|dan|and|et|al\.?|dkk\.?|[A-Z]\.)){0,5})[,\s]*\(\s*((?:19|20)\d{2}[a-z]?)(?:\s*[-–:,]\s*\d{1,4})?\s*\)/g;
    while ((m = narrRx.exec(stripped)) !== null) {
      const wordsRaw = m[1].trim().replace(/[,\s]+$/, '').split(/\s+/).map((w) => w.replace(/^[.,]+|[.,]+$/g, '')).filter(Boolean);
      while (wordsRaw.length && ignorePrefixes.has(wordsRaw[0].toLowerCase())) wordsRaw.shift();
      const filteredWords = wordsRaw.filter((w) => !ignorePrefixes.has(w.toLowerCase()) || ['dan', 'and', 'et', 'al', 'dkk'].includes(w.toLowerCase()));
      if (!filteredWords.length) continue;
      const cleanedAuth = filteredWords.join(' ');
      const s = extractSurname(cleanedAuth);
      if (!s || s.length < 2 || ignorePrefixes.has(s.toLowerCase())) continue;
      const sn = norm(s);
      const yr = m[2].toLowerCase();
      const key = `ay:${sn}:${yr}`;
      if (!seen.has(key)) {
        seen.add(key);
        inText.push({ raw: `${cleanedAuth} (${yr})`, refId: '', surname: sn, year: yr });
      }
    }

    const matched = [];
    const missingInBib = [];
    inText.forEach((cit) => {
      let hit = null;
      if (cit.refId) {
        hit = bibEntries.find((b) => b.refId === cit.refId) || null;
      } else {
        const y4 = cit.year.slice(0, 4);
        hit = bibEntries.find((b) => {
          const by4 = (b.year || '').slice(0, 4);
          const yearOk = !cit.year || !b.year || b.year === cit.year || (y4 && by4 === y4) || (y4 && b.plain.includes(y4));
          const nameOk = Boolean(cit.surname) && (b.surname === cit.surname || (cit.surname.length >= 4 && norm(b.plain.slice(0, 80)).includes(cit.surname)));
          return yearOk && nameOk;
        }) || null;
      }
      if (hit) {
        hit.cited = true;
        matched.push(cit.raw);
      } else {
        missingInBib.push(cit.raw);
      }
    });

    const uncitedInBody = bibEntries.filter((b) => !b.cited).map((b) => b.label);
    const total = matched.length + missingInBib.length + uncitedInBody.length;
    const score = total === 0 ? 100 : Math.round((matched.length / total) * 100);
    return { inTextCount: inText.length, bibCount: bibEntries.length, matchedCount: matched.length, matched, missingInBib, uncitedInBody, score };
  }

  let citationAuditTimer = null;
  function renderCitationAuditUI(res) {
    const badge = document.getElementById('cit-audit-badge');
    const summary = document.getElementById('cit-audit-summary');
    const issues = document.getElementById('cit-audit-issues');
    if (!badge || !summary || !issues || !res) return;

    const statCit = document.getElementById('stat-citations');
    if (statCit && typeof res.inTextCount === 'number') {
      statCit.textContent = String(res.inTextCount);
    }

    const missing = res.missingInBib || [];
    const uncited = res.uncitedInBody || [];
    const allClean = missing.length === 0 && uncited.length === 0;

    if (res.inTextCount === 0 && res.bibCount === 0) {
      badge.textContent = 'Kosong';
      badge.className = 'font-mono text-[10.5px] font-medium tabular-nums px-1.5 py-0.5 rounded-[4px] border border-paper-border bg-paper-bg text-ink-muted';
      summary.textContent = 'Belum ada kutipan maupun entri Daftar Pustaka yang terdeteksi.';
      issues.classList.add('hidden');
      issues.innerHTML = '';
      return;
    }

    if (allClean) {
      badge.textContent = `${res.matchedCount}/${res.bibCount} Konsisten`;
      badge.className = 'font-mono text-[10.5px] font-medium tabular-nums px-1.5 py-0.5 rounded-[4px] border border-ink-okBorder bg-ink-okBg text-ink-ok';
      summary.textContent = `Seluruh ${res.inTextCount} kutipan in-text sesuai dengan Daftar Pustaka.`;
      issues.classList.add('hidden');
      issues.innerHTML = '';
      return;
    }

    badge.textContent = `${res.score}%`;
    badge.className = 'font-mono text-[10.5px] font-medium tabular-nums px-1.5 py-0.5 rounded-[4px] border border-ink-warnBorder bg-ink-warnBg text-ink-warn';
    summary.textContent = `${res.matchedCount} cocok · ${missing.length} belum di Daftar Pustaka · ${uncited.length} belum dikutip.`;

    const blocks = [];
    if (missing.length) {
      blocks.push(
        `<div class="border border-ink-errBorder bg-ink-errBg rounded-[4px] p-2 space-y-1">` +
          `<div class="text-[10.5px] font-semibold text-ink-err">Belum ada di Daftar Pustaka (${missing.length})</div>` +
          `<ul class="text-[11px] text-ink space-y-0.5 list-disc pl-4">${missing.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>` +
        `</div>`
      );
    }
    if (uncited.length) {
      blocks.push(
        `<div class="border border-ink-warnBorder bg-ink-warnBg rounded-[4px] p-2 space-y-1">` +
          `<div class="text-[10.5px] font-semibold text-ink-warn">Di Daftar Pustaka tapi belum dikutip (${uncited.length})</div>` +
          `<ul class="text-[11px] text-ink space-y-0.5 list-disc pl-4">${uncited.map((u) => `<li>${escapeHtml(u)}</li>`).join('')}</ul>` +
        `</div>`
      );
    }
    issues.innerHTML = blocks.join('');
    issues.classList.remove('hidden');
  }

  let readinessAuditTimer = null;
  let lastReadinessReportText = '';

  function auditReadinessLocally() {
    const f = state.format || {};
    const c = state.cover || {};
    const content = String(state.content || '');
    const checks = [];

    if (f.showCover) {
      const missing = [];
      const t = String(c.title || '').trim();
      if (!t || ['JUDUL MAKALAH', 'JUDUL MAKALAH AKADEMIK'].includes(t.toUpperCase())) missing.push('Judul');
      if (!String(c.authors || '').trim()) missing.push('Nama & NIM Penyusun');
      if (!String(c.university || '').trim()) missing.push('Universitas/Institusi');
      checks.push({
        id: 'cover',
        label: 'Identitas Halaman Cover',
        passed: missing.length === 0,
        severity: missing.length === 0 ? 'ok' : 'warn',
        detail: missing.length === 0 ? 'Identitas cover lengkap.' : `Belum diisi: ${missing.join(', ')}.`,
      });
    }

    const babs = content.match(/^(?:#+\s*)?(?:\*\*|__)?\s*BAB\s+[IVXLCDM0-9]+\b/gim) || [];
    checks.push({
      id: 'structure',
      label: 'Struktur BAB Makalah',
      passed: babs.length >= 2,
      severity: babs.length >= 2 ? 'ok' : 'warn',
      detail: babs.length >= 2 ? `Terdeteksi ${babs.length} BAB terstruktur.` : `Baru terdeteksi ${babs.length} BAB (disarankan minimal BAB I–III).`,
    });

    const cit = auditCitationsLocally();
    const citOk = cit.bibCount > 0 && cit.missingInBib.length === 0 && cit.uncitedInBody.length === 0;
    let citDetail = 'Belum ada sitasi atau Daftar Pustaka.';
    if (citOk) {
      citDetail = `${cit.matchedCount}/${cit.bibCount} sitasi konsisten dengan Daftar Pustaka.`;
    } else if (cit.bibCount > 0 || cit.inTextCount > 0) {
      const iss = [];
      if (cit.missingInBib.length) iss.push(`${cit.missingInBib.length} kutipan belum di Daftar Pustaka`);
      if (cit.uncitedInBody.length) iss.push(`${cit.uncitedInBody.length} referensi belum dikutip`);
      citDetail = `${iss.join('; ')}.`;
    }
    checks.push({
      id: 'citations',
      label: 'Konsistensi Sitasi & Daftar Pustaka',
      passed: citOk,
      severity: citOk ? 'ok' : cit.missingInBib.length ? 'err' : 'warn',
      detail: citDetail,
    });

    const plainBody = content.replace(/\[TABEL[^\]]*\][\s\S]*?\[\/TABEL\]|\[GAMBAR[^\]]*\]/gi, ' ');
    const tblCount = (content.match(/^\[TABEL\b/gim) || []).length;
    const figCount = (content.match(/^\[GAMBAR\b/gim) || []).length;
    const xrefIssues = [];
    if (/\bTabel\s+\d+(?:\.\d+)?\b/i.test(plainBody) && tblCount === 0) xrefIssues.push('Teks menyebut Tabel tetapi belum ada blok [TABEL]');
    if (/\bGambar\s+\d+(?:\.\d+)?\b/i.test(plainBody) && figCount === 0) xrefIssues.push('Teks menyebut Gambar tetapi belum ada tag [GAMBAR]');
    checks.push({
      id: 'media_xref',
      label: 'Kesesuaian Tabel & Gambar',
      passed: xrefIssues.length === 0,
      severity: xrefIssues.length === 0 ? 'ok' : 'warn',
      detail: xrefIssues.length === 0 ? `${tblCount} tabel & ${figCount} gambar terverifikasi.` : `${xrefIssues.join('; ')}.`,
    });

    if (state.guidelineProfile && Array.isArray(state.guidelineProfile.rules) && state.guidelineProfile.rules.length) {
      const rules = state.guidelineProfile.rules;
      const matchedR = rules.filter((r) => isRuleCompliant(r)).length;
      checks.push({
        id: 'guideline',
        label: `Kepatuhan Pedoman (${state.guidelineProfile.name})`,
        passed: matchedR === rules.length,
        severity: matchedR === rules.length ? 'ok' : 'warn',
        detail: `${matchedR}/${rules.length} aturan pedoman terpenuhi.`,
      });
    }

    const im = state.importMeta || {};
    const complexNotes = [];
    if (im.hasEquations) complexNotes.push('persamaan matematika (Equation)');
    if (im.hasFootnotes) complexNotes.push('catatan kaki (Footnote)');
    if (complexNotes.length) {
      checks.push({
        id: 'complex_ooxml',
        label: 'Elemen Kompleks Dokumen Asal',
        passed: false,
        severity: 'warn',
        detail: `Dokumen asal memiliki ${complexNotes.join(' dan ')} — periksa kembali setelah ekspor .docx.`,
      });
    }

    const passedCount = checks.filter((x) => x.passed).length;
    const totalCount = checks.length || 1;
    const score = Math.round((passedCount / totalCount) * 100);
    const lines = [
      'LAPORAN AUDIT KELAYAKAN MAKALAH — MAKARAPI',
      '====================================================',
      `Judul   : ${c.title || '-'}`,
      `Skor    : ${score}% (${passedCount}/${totalCount} pemeriksaan lulus)`,
      '----------------------------------------------------',
      ...checks.map((x) => `${x.passed ? '[LULUS]' : '[PERHATIAN]'} ${x.label}: ${x.detail}`),
    ];
    return { score, passedCount, totalCount, checks, reportText: lines.join('\n') };
  }

  function renderReadinessAuditUI(res) {
    const badge = document.getElementById('readiness-score-badge');
    const listEl = document.getElementById('readiness-checks-list');
    if (!badge || !listEl || !res) return;

    lastReadinessReportText = res.reportText || '';
    const score = Number(res.score) || 0;
    badge.textContent = `${score}%`;
    if (score === 100) {
      badge.className = 'font-mono text-[10.5px] font-medium tabular-nums px-1.5 py-0.5 rounded-[4px] border border-ink-okBorder bg-ink-okBg text-ink-ok';
    } else if (score >= 60) {
      badge.className = 'font-mono text-[10.5px] font-medium tabular-nums px-1.5 py-0.5 rounded-[4px] border border-ink-warnBorder bg-ink-warnBg text-ink-warn';
    } else {
      badge.className = 'font-mono text-[10.5px] font-medium tabular-nums px-1.5 py-0.5 rounded-[4px] border border-ink-errBorder bg-ink-errBg text-ink-err';
    }

    listEl.innerHTML = (res.checks || [])
      .map((ch) => {
        const dotColor = ch.passed ? 'bg-ink-ok' : ch.severity === 'err' ? 'bg-ink-err' : 'bg-ink-warn';
        return (
          `<div class="flex items-start gap-2 leading-snug">` +
            `<span class="w-1.5 h-1.5 rounded-full ${dotColor} mt-1.5 shrink-0"></span>` +
            `<div class="min-w-0">` +
              `<div class="font-medium text-ink">${escapeHtml(ch.label)}</div>` +
              `<div class="text-[10.5px] text-ink-muted">${escapeHtml(ch.detail)}</div>` +
            `</div>` +
          `</div>`
        );
      })
      .join('');
  }

  function scheduleReadinessAudit() {
    clearTimeout(readinessAuditTimer);
    readinessAuditTimer = setTimeout(async () => {
      try {
        if (window.MakaRapiAPI) {
          const info = await window.MakaRapiAPI.detectBackend();
          if (info.online) {
            const remoteRes = await window.MakaRapiAPI.auditReadiness({
              format: state.format,
              cover: state.cover,
              preface: state.preface,
              content: state.content,
              citations: state.citations,
              manualBibliography: state.manualBibliography,
              guidelineProfile: state.guidelineProfile,
              importMeta: state.importMeta || {},
            });
            if (remoteRes) {
              renderReadinessAuditUI(remoteRes);
              return;
            }
          }
        }
        renderReadinessAuditUI(auditReadinessLocally());
      } catch {
        renderReadinessAuditUI(auditReadinessLocally());
      }
    }, 320);
  }

  async function refreshSavedGuidelinesDbUI() {
    const sec = document.getElementById('saved-guidelines-db-section');
    const listEl = document.getElementById('saved-guidelines-db-list');
    const countEl = document.getElementById('saved-guidelines-db-count');
    const saveBtn = document.getElementById('btn-save-guideline-db');
    if (!sec || !listEl || !window.MakaRapiAPI) return;

    const info = await window.MakaRapiAPI.detectBackend();
    if (!info.online) {
      sec.classList.add('hidden');
      if (saveBtn) saveBtn.classList.add('hidden');
      return;
    }
    if (saveBtn) saveBtn.classList.remove('hidden');

    const items = await window.MakaRapiAPI.listGuidelines();
    const customs = (items || []).filter((it) => !it.isBuiltin);
    if (!customs.length) {
      sec.classList.add('hidden');
      listEl.innerHTML = '';
      if (countEl) countEl.textContent = '0';
      return;
    }

    if (countEl) countEl.textContent = String(customs.length);
    listEl.innerHTML = customs
      .map(
        (it) =>
          `<div class="px-2.5 py-2 rounded-[4px] bg-white border border-paper-border flex items-start justify-between gap-2">` +
            `<button type="button" data-apply-db-guideline="${it.id}" class="text-left flex-1 min-w-0 cursor-pointer">` +
              `<div class="text-[11px] font-semibold text-ink truncate">${escapeHtml(it.name)}</div>` +
              `<div class="font-mono text-[10px] text-ink-muted truncate">${escapeHtml(it.description || `${(it.rules || []).length} aturan`)}</div>` +
            `</button>` +
            `<button type="button" data-del-db-guideline="${it.id}" title="Hapus dari database" class="text-[10.5px] text-ink-subtle hover:text-ink-err px-1 cursor-pointer shrink-0">&times;</button>` +
          `</div>`
      )
      .join('');

    listEl.querySelectorAll('[data-apply-db-guideline]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-apply-db-guideline'));
        const prof = customs.find((x) => x.id === id);
        if (!prof || !Array.isArray(prof.rules)) return;
        applyGuidelineRulesToState(prof.rules);
        state.guidelineProfile = {
          name: prof.name,
          rules: prof.rules.map(({ key, label, value, displayValue }) => ({ key, label, value, displayValue })),
        };
        syncControlsFromState();
        renderPreviewAndStats();
        scheduleSave();
        showToast(`Profil pedoman "${prof.name}" diterapkan dari database.`, 'success');
      });
    });

    listEl.querySelectorAll('[data-del-db-guideline]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-del-db-guideline'));
        try {
          await window.MakaRapiAPI.deleteGuideline(id);
          await refreshSavedGuidelinesDbUI();
          showToast('Profil pedoman dihapus dari database.', 'info');
        } catch (err) {
          showToast(err?.message || 'Gagal menghapus profil pedoman.', 'error');
        }
      });
    });

    sec.classList.remove('hidden');
  }

  function scheduleCitationAudit() {
    clearTimeout(citationAuditTimer);
    citationAuditTimer = setTimeout(async () => {
      try {
        if (window.MakaRapiAPI) {
          const info = await window.MakaRapiAPI.detectBackend();
          if (info.online) {
            const remoteRes = await window.MakaRapiAPI.auditCitations({
              content: state.content,
              citations: state.citations,
              manualBibliography: state.manualBibliography,
              citationStyle: state.format.citationStyle,
            });
            if (remoteRes) {
              renderCitationAuditUI(remoteRes);
              return;
            }
          }
        }
        renderCitationAuditUI(auditCitationsLocally());
      } catch {
        renderCitationAuditUI(auditCitationsLocally());
      }
    }, 280);
  }

  // =====================================================================
  // 6. MESIN PERAPIHAN TEKS 1-KLIK (AI/MD, BARIS PDF, SPASI & TANDA BACA)
  // =====================================================================
  const REGEX_BAB_LINE = /^(?:#+\s*)?(?:BAB\s+[IVXLCDM0-9]+)(?!\s*:)\b/i;
  const REGEX_LIST_LINE = /^(?:[-•*–—]\s+|\d+[\.\)]\s+|[a-z][\.\)]\s+)/;

  function isSubsubbabLine(line) {
    if (/^#{3,6}\s+.+/.test(line)) return true;
    if (/^\d+\.\d+\.\d+(?:\.\d+)*\.?\s+\S+/.test(line) && line.length <= 130) return true;
    return false;
  }

  function isSubbabLine(line) {
    if (isSubsubbabLine(line)) return false;
    if (/^##\s+.+/.test(line)) return true;
    if (/^[A-Z]\.\s+\S+/.test(line) && line.length <= 130) return true;
    if (/^\d+\.\d+\.?\s+\S+/.test(line) && line.length <= 130) return true;
    return false;
  }

  function isSpecialTagLine(line) {
    const t = line.trim();
    return /^\[TABEL\b/i.test(t) || /^\[\/TABEL\]$/i.test(t) || /^\[GAMBAR\b/i.test(t);
  }

  function isStructuralLine(line) {
    const t = line.trim();
    if (!t) return true;
    if (isSpecialTagLine(t)) return true;
    if (REGEX_BAB_LINE.test(t)) return true;
    if (/^#{1,6}\s+/.test(t)) return true;
    if (isSubbabLine(t)) return true;
    if (REGEX_LIST_LINE.test(t)) return true;
    if (/^[A-Z0-9\s,&\-]{3,65}$/.test(t) && !/[a-z]/.test(t)) return true;
    return false;
  }

  function joinBrokenPair(prev, curr) {
    if (/[A-Za-z]-$/.test(prev) && /^[a-z]/.test(curr)) {
      return prev.slice(0, -1) + curr;
    }
    return `${prev} ${curr}`;
  }

  const TextCleaner = {
    cleanAIMarkdown(rawText) {
      let count = 0;
      const lines = rawText.replace(/\r\n/g, '\n').split('\n');
      const out = [];
      let inTable = false;

      for (let line of lines) {
        const trimmed = line.trim();
        if (/^\[TABEL\b/i.test(trimmed)) { inTable = true; out.push(line); continue; }
        if (/^\[\/TABEL\]$/i.test(trimmed)) { inTable = false; out.push(line); continue; }
        if (inTable || /^\[GAMBAR\b/i.test(trimmed)) { out.push(line); continue; }

        if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { count++; continue; }
        if (/^\s*```/.test(line)) { count++; continue; }
        if (/^\s*>\s?/.test(line)) { line = line.replace(/^\s*>\s?/, ''); count++; }
        if (/^\s*\*\s+/.test(line)) { line = line.replace(/^(\s*)\*\s+/, '$1- '); count++; }
        if (/^\s*#{1,6}\s+/.test(line)) { line = line.replace(/^\s*#{1,6}\s+/, ''); count++; }

        // Normalisasi tanda kutip melengkung AI
        line = line.replace(/[“”]/g, () => { count++; return '"'; });
        line = line.replace(/[‘’]/g, () => { count++; return "'"; });

        const rxList = [
          /\*\*(.+?)\*\*/g,
          /__(.+?)__/g,
          /`([^`]+)`/g,
          /(?<!\*)\*(?!\s)([^*\n]+?)(?<!\s)\*(?!\*)/g,
        ];
        for (const rx of rxList) {
          line = line.replace(rx, (_, inner) => { count++; return inner; });
        }
        if (/\*{2,}/.test(line)) {
          line = line.replace(/\*{2,}/g, () => { count++; return ''; });
        }
        out.push(line);
      }
      return { text: out.join('\n'), count };
    },

    fixBrokenLines(rawText) {
      let count = 0;
      const lines = rawText.replace(/\r\n/g, '\n').split('\n');
      const merged = [];
      let inTable = false;

      for (let i = 0; i < lines.length; i++) {
        const current = lines[i].trim();
        if (/^\[TABEL\b/i.test(current)) { inTable = true; merged.push(current); continue; }
        if (/^\[\/TABEL\]$/i.test(current)) { inTable = false; merged.push(current); continue; }
        if (inTable) { merged.push(lines[i].trim()); continue; }

        if (current === '') {
          // Cek apakah paragraf sebelumnya terpotong di pergantian halaman PDF (tanpa tanda baca akhir) & baris non-kosong berikutnya diawali huruf kecil
          if (merged.length > 0 && merged[merged.length - 1] !== '' && !isStructuralLine(merged[merged.length - 1])) {
            let peek = i + 1;
            while (peek < lines.length && lines[peek].trim() === '') peek++;
            if (peek < lines.length) {
              const nextLine = lines[peek].trim();
              const prevPlain = merged[merged.length - 1].replace(/<[^>]+>/g, '').trim();
              const nextPlain = nextLine.replace(/<[^>]+>/g, '').trim();
              if (
                !isStructuralLine(nextLine) &&
                prevPlain.length >= 40 &&
                !/[.!?:"”)\]]$/.test(prevPlain) &&
                /^[a-z]/.test(nextPlain)
              ) {
                merged[merged.length - 1] = joinBrokenPair(merged[merged.length - 1], nextLine);
                i = peek;
                count++;
                continue;
              }
            }
          }
          merged.push('');
          continue;
        }
        if (merged.length === 0 || merged[merged.length - 1] === '') { merged.push(current); continue; }

        const prev = merged[merged.length - 1];
        const prevStruct = isStructuralLine(prev);
        const currStruct = isStructuralLine(current);

        if (prevStruct || currStruct) {
          if (REGEX_LIST_LINE.test(prev) && !currStruct && !/[.!?:;]$/.test(prev)) {
            merged[merged.length - 1] = joinBrokenPair(prev, current);
            count++;
          } else {
            merged.push(current);
          }
          continue;
        }

        const prevEndsSentence = /[.!?:"”)\]]$/.test(prev);
        const currStartsLower = /^[a-z0-9,(]/.test(current);
        if (!prevEndsSentence || currStartsLower) {
          merged[merged.length - 1] = joinBrokenPair(prev, current);
          count++;
        } else {
          merged.push(current);
        }
      }
      return { text: merged.join('\n'), count };
    },

    cleanSpacesAndPunctuation(rawText) {
      let count = 0;
      let inTable = false;
      const lines = rawText.replace(/\r\n/g, '\n').split('\n').map((rawLine) => {
        const t = rawLine.trim();
        if (/^\[TABEL\b/i.test(t)) { inTable = true; return t; }
        if (/^\[\/TABEL\]$/i.test(t)) { inTable = false; return t; }
        if (inTable || /^\[GAMBAR\b/i.test(t)) return t;

        let l = rawLine.replace(/[\t\u00A0]+/g, () => { count++; return ' '; });
        const trimmed = l.trim();
        if (trimmed !== l) { count++; l = trimmed; }
        l = l.replace(/ {2,}/g, () => { count++; return ' '; });
        l = l.replace(/\s+([,.;:?!])/g, (_, p) => { count++; return p; });
        l = l.replace(/([,;:])([A-Za-zÀ-ÖØ-öø-ÿ])/g, (_, p, ch) => { count++; return `${p} ${ch}`; });
        return l;
      });

      let text = lines.join('\n').replace(/\n{3,}/g, () => { count++; return '\n\n'; });
      const trimmedAll = text.trim();
      if (trimmedAll !== text) { count++; text = trimmedAll; }
      return { text, count };
    },

    lintAcademic(rawText, { fixKbbi = true, italicizeForeign = true } = {}) {
      const kbbiMap = {
        analisa: 'analisis', menganalisa: 'menganalisis', resiko: 'risiko', beresiko: 'berisiko',
        praktek: 'praktik', mempraktekkan: 'mempraktikkan', sistim: 'sistem', aktifitas: 'aktivitas',
        efektifitas: 'efektivitas', produktifitas: 'produktivitas', kreatifitas: 'kreativitas',
        kwalitas: 'kualitas', kwantitas: 'kuantitas', tekhnologi: 'teknologi', tekhnik: 'teknik',
        sekedar: 'sekadar', merubah: 'mengubah', dirubah: 'diubah', standart: 'standar',
        metoda: 'metode', hipotesa: 'hipotesis', diagnosa: 'diagnosis', sintesa: 'sintesis',
        konkrit: 'konkret', ijin: 'izin', obyek: 'objek', obyektif: 'objektif', subyek: 'subjek',
        subyektif: 'subjektif', nasehat: 'nasihat', hakekat: 'hakikat', berfikir: 'berpikir',
        hirarki: 'hierarki', frekwensi: 'frekuensi', konsekwensi: 'konsekuensi',
        diatas: 'di atas', dibawah: 'di bawah', didalam: 'di dalam', diluar: 'di luar',
        disamping: 'di samping', disini: 'di sini', disana: 'di sana', dimana: 'di mana',
      };
      const foreignTerms = [
        'structural equation modeling', 'technology acceptance model', 'total quality management',
        'natural language processing', 'learning management system', 'non-probability sampling',
        'continuous improvement', 'convenience sampling', 'composite reliability',
        'artificial intelligence', 'large language models', 'large language model',
        'financial technology', 'purposive sampling', 'financial literacy', 'adjusted r square',
        'machine learning', 'digital payment', 'customer focus', 'deep learning',
        'cloud computing', 'internet of things', 'blended learning', 'digital library',
        'neural network', 'computer vision', 'cross-sectional', 'user experience',
        'user interface', 'generative ai', 'bootstrapping', 'best practice', 'supply chain',
        'open source', 'data mining', 'street food', 'e-commerce', 'marketplace',
        'stakeholder', 'e-learning', 'real-time', 'cash flow', 'big data', 'framework',
        'prototype', 'benchmark', 'interface', 'algorithm', 'database', 'software',
        'hardware', 'feedback', 'workflow', 'e-wallet', 'cashless', 'dataset', 'website',
        'chatbot', 'fintech', 'scoring', 'offline', 'online', 'output', 'input', 'et al.',
      ];
      const matchCase = (orig, rep) => {
        if (orig === orig.toUpperCase()) return rep.toUpperCase();
        if (orig[0] === orig[0].toUpperCase()) return rep[0].toUpperCase() + rep.slice(1);
        return rep;
      };
      const escRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const kbbiRx = new RegExp(`\\b(${Object.keys(kbbiMap).map(escRx).join('|')})\\b`, 'gi');
      const foreignRx = new RegExp(`(?<![A-Za-z0-9_])(${foreignTerms.map(escRx).join('|')})(?![A-Za-z0-9_])`, 'gi');
      const protectedRx = /(<i>[\s\S]*?<\/i>|https?:\/\/\S+|\[@[a-zA-Z0-9_-]+\])/gi;
      const headRx = /^(?:#+\s*)?(?:BAB\s+[IVXLCDM0-9]+|[A-Z]\.\s+|\d+\.\d+(?:\.\d+)*\.?\s+)/i;

      let kbbiCount = 0;
      let foreignCount = 0;
      let inTable = false;
      const out = String(rawText || '').replace(/\r\n/g, '\n').split('\n').map((line) => {
        const t = line.trim();
        if (/^\[TABEL\b/i.test(t)) { inTable = true; return line; }
        if (/^\[\/TABEL\]$/i.test(t)) { inTable = false; return line; }
        if (/^\[GAMBAR\b/i.test(t) || !t) return line;
        const isHead = !inTable && headRx.test(t) && t.length <= 130;
        const parts = line.split(protectedRx);
        for (let i = 0; i < parts.length; i += 2) {
          let seg = parts[i] || '';
          if (!seg) continue;
          if (fixKbbi) {
            seg = seg.replace(kbbiRx, (m) => {
              const target = kbbiMap[m.toLowerCase()];
              if (!target) return m;
              kbbiCount++;
              return matchCase(m, target);
            });
          }
          if (italicizeForeign && !isHead) {
            seg = seg.replace(foreignRx, (m) => {
              foreignCount++;
              return `<i>${m}</i>`;
            });
          }
          parts[i] = seg;
        }
        return parts.join('');
      });
      return { text: out.join('\n'), kbbiCount, foreignCount, totalCount: kbbiCount + foreignCount };
    },

    cleanAll(rawText) {
      const r1 = this.cleanAIMarkdown(rawText);
      const r2 = this.fixBrokenLines(r1.text);
      const r3 = this.cleanSpacesAndPunctuation(r2.text);
      return {
        text: r3.text,
        totalCount: r1.count + r2.count + r3.count,
        details: { md: r1.count, pdf: r2.count, sp: r3.count },
      };
    },
  };

  // =====================================================================
  // 7. PARSER STRUKTUR MAKALAH (MELACAK NOMOR BARIS UNTUK TAB STRUKTUR)
  // =====================================================================
  function parseTagAttributes(attrStr) {
    const attrs = {};
    const rx = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = rx.exec(attrStr || '')) !== null) {
      attrs[m[1].toLowerCase()] = m[2] !== undefined ? m[2] : m[3];
    }
    return attrs;
  }

  function parseDocumentBody(rawText) {
    const lines = (rawText || '').replace(/\r\n/g, '\n').split('\n');
    const chapters = [];
    let currentChapter = null;
    let currentBabNumber = 0;
    let tableCounterInBab = 0;
    let figureCounterInBab = 0;
    let totalTables = 0;
    let totalFigures = 0;
    let totalParagraphs = 0;

    function ensureChapter() {
      if (!currentChapter) {
        currentChapter = { babLabel: '', babSubtitle: '', babNum: 0, blocks: [] };
        chapters.push(currentChapter);
      }
    }

    let i = 0;
    while (i < lines.length) {
      const lineIndex = i;
      const line = lines[i].trim();
      if (!line) { i++; continue; }

      // 1. Blok [TABEL]
      const tblOpen = line.match(/^\[TABEL([^\]]*)\]$/i);
      if (tblOpen) {
        ensureChapter();
        const attrs = parseTagAttributes(tblOpen[1]);
        const rows = [];
        i++;
        while (i < lines.length && !/^\[\/TABEL\]$/i.test(lines[i].trim())) {
          const rLine = lines[i].trim();
          if (rLine) rows.push(rLine.split('|').map((c) => c.trim()));
          i++;
        }
        if (i < lines.length && /^\[\/TABEL\]$/i.test(lines[i].trim())) i++;

        tableCounterInBab++;
        totalTables++;
        const numberLabel = currentBabNumber > 0 ? `Tabel ${currentBabNumber}.${tableCounterInBab}` : `Tabel ${tableCounterInBab}`;
        currentChapter.blocks.push({
          type: 'table',
          lineIndex,
          numberLabel,
          title: attrs.judul || 'Tanpa Judul',
          source: attrs.sumber || '',
          rows,
        });
        continue;
      }

      // 2. Tag [GAMBAR]
      const figMatch = line.match(/^\[GAMBAR([^\]]*)\]$/i);
      if (figMatch) {
        ensureChapter();
        const attrs = parseTagAttributes(figMatch[1]);
        figureCounterInBab++;
        totalFigures++;
        const numberLabel = currentBabNumber > 0 ? `Gambar ${currentBabNumber}.${figureCounterInBab}` : `Gambar ${figureCounterInBab}`;
        const widthPct = Math.max(40, Math.min(100, parseInt(attrs.lebar || '75', 10) || 75));
        currentChapter.blocks.push({
          type: 'figure',
          lineIndex,
          numberLabel,
          id: attrs.id || '',
          url: attrs.url || '',
          title: attrs.judul || 'Tanpa Judul',
          source: attrs.sumber || '',
          widthPct,
        });
        i++;
        continue;
      }

      // 3. Deteksi BAB (lewati baris Sistematika Penulisan seperti "BAB I : PENDAHULUAN")
      const isSistematikaBab = /^BAB\s+[IVXLCDM0-9]+\s*:/i.test(line);
      const babMatch = !isSistematikaBab ? line.match(/^(?:#\s+)?(BAB\s+[IVXLCDM0-9]+)(?:\s*[:\-–—]?\s*(.*))?$/i) : null;
      const mdH1 = !babMatch ? line.match(/^#\s+(.+)$/) : null;
      if (babMatch || mdH1) {
        let babLabel = '';
        let babSubtitle = '';
        if (babMatch) {
          babLabel = babMatch[1].toUpperCase().replace(/\s+/g, ' ');
          babSubtitle = (babMatch[2] || '').trim().toUpperCase();
          if (!babSubtitle) {
            let nextIdx = i + 1;
            while (nextIdx < lines.length && lines[nextIdx].trim() === '') nextIdx++;
            if (nextIdx < lines.length) {
              const cand = lines[nextIdx].trim();
              if (
                !isSubbabLine(cand) &&
                !REGEX_LIST_LINE.test(cand) &&
                !isSpecialTagLine(cand) &&
                !/^(?:#\s+)?BAB\s+[IVXLCDM0-9]+/i.test(cand) &&
                cand.length <= 80 &&
                !cand.endsWith('.')
              ) {
                babSubtitle = cand.replace(/^#+\s*/, '').toUpperCase();
                i = nextIdx;
              }
            }
          }
          currentBabNumber = parseChapterNumber(babLabel) || currentBabNumber + 1;
        } else {
          babLabel = mdH1[1].trim().toUpperCase();
          currentBabNumber++;
        }

        tableCounterInBab = 0;
        figureCounterInBab = 0;

        currentChapter = {
          babLabel,
          babSubtitle,
          babNum: currentBabNumber,
          blocks: [{
            type: 'bab',
            lineIndex,
            babLabel,
            babSubtitle,
            tocText: babSubtitle ? `${babLabel} ${babSubtitle}` : babLabel,
          }],
        };
        chapters.push(currentChapter);
        i++;
        continue;
      }

      ensureChapter();

      // 4. Sub-bab (Heading 2) & Sub-sub-bab (Heading 3)
      if (isSubsubbabLine(line)) {
        currentChapter.blocks.push({
          type: 'subsubbab',
          lineIndex,
          text: line.replace(/^#{3,6}\s+/, '').trim(),
        });
        i++;
        continue;
      }

      if (isSubbabLine(line)) {
        currentChapter.blocks.push({
          type: 'subbab',
          lineIndex,
          text: line.replace(/^#{2,6}\s+/, '').trim(),
        });
        i++;
        continue;
      }

      // 5. List (gabungkan item berurutan meski terpisah baris kosong dari hasil impor/salin)
      if (REGEX_LIST_LINE.test(line)) {
        const markerFamily = (mk) => {
          if (/^\d+\.$/.test(mk)) return 'decimal_dot';
          if (/^\d+\)$/.test(mk)) return 'decimal_paren';
          if (/^[a-z]\.$/.test(mk)) return 'alpha_dot';
          if (/^[a-z]\)$/.test(mk)) return 'alpha_paren';
          return 'bullet';
        };
        const parseListLine = (s) => {
          if (!s || !REGEX_LIST_LINE.test(s) || isSubbabLine(s) || isSubsubbabLine(s) || isSpecialTagLine(s)) return null;
          const lm = s.match(/^([-•*–—]|\d+[\.\)]|[a-z][\.\)])\s+(.*)$/);
          if (!lm) return null;
          let marker = lm[1];
          if (['-', '*', '–', '—'].includes(marker)) marker = '•';
          return { marker, family: markerFamily(marker), text: lm[2].trim() };
        };

        const items = [];
        let activeFamily = null;
        while (i < lines.length) {
          let l = lines[i].trim();
          if (!l) {
            let peek = i + 1;
            while (peek < lines.length && !lines[peek].trim()) peek++;
            if (peek < lines.length) {
              const nextParsed = parseListLine(lines[peek].trim());
              if (nextParsed && (!activeFamily || nextParsed.family === activeFamily)) {
                i = peek;
                l = lines[i].trim();
              } else {
                break;
              }
            } else {
              break;
            }
          }
          const parsedItem = parseListLine(l);
          if (!parsedItem) break;
          if (activeFamily && parsedItem.family !== activeFamily) break;
          activeFamily = parsedItem.family;
          items.push({ marker: parsedItem.marker, text: parsedItem.text });
          i++;
        }
        if (items.length) {
          currentChapter.blocks.push({ type: 'list', lineIndex, items });
        }
        continue;
      }

      // 6. Paragraf
      totalParagraphs++;
      currentChapter.blocks.push({ type: 'paragraph', lineIndex, text: line });
      i++;
    }

    return { chapters, totalTables, totalFigures, totalParagraphs };
  }

  // =====================================================================
  // 8. RENDERER BLOK & MESIN PAGINASI PRESISI + OUTLINE
  // =====================================================================
  function getTypography() {
    const f = state.format;
    return {
      fontFamily: FONT_STACKS[f.fontFamily] || FONT_STACKS['Times New Roman'],
      fontSizePt: Number(f.fontSize) || 12,
      headingFontSizePt: Number(f.headingFontSize) || 14,
      lineHeight: Number(f.lineSpacing) || 1.5,
      firstIndentCm: Number(f.firstIndent) || 0,
      spaceBeforePt: Math.max(0, Math.min(36, Number(f.spaceBefore) || 0)),
      spaceAfterPt: Math.max(0, Math.min(36, Number(f.spaceAfter) || 0)),
      applySpacingToHeadings: Boolean(f.applySpacingToHeadings),
      textAlign: f.textAlign === 'left' ? 'left' : 'justify',
    };
  }

  function ensureImageAspectCached(src) {
    if (!src || imageAspectCache[src]) return;
    imageAspectCache[src] = { loading: true, w: 0, h: 0 };
    const probe = new Image();
    probe.onload = () => {
      if (probe.naturalWidth > 0 && probe.naturalHeight > 0) {
        imageAspectCache[src] = { loading: false, w: probe.naturalWidth, h: probe.naturalHeight };
        scheduleRender();
      }
    };
    probe.onerror = () => {
      imageAspectCache[src] = { loading: false, w: 0, h: 0 };
    };
    probe.src = src;
  }

  function resolveFigureMediaHtml(block) {
    if (block.id && BUILTIN_FIGURES[block.id]) {
      return `<div style="width:${block.widthPct}%; margin:0 auto;">${BUILTIN_FIGURES[block.id]}</div>`;
    }
    const storedSrc = (block.id && (state.images[block.id] || sessionImagesMemory[block.id])) || block.url;
    if (storedSrc) {
      ensureImageAspectCached(storedSrc);
      const dims = imageAspectCache[storedSrc];
      const aspectCss = dims && dims.w > 0 && dims.h > 0 ? ` aspect-ratio:${dims.w} / ${dims.h};` : '';
      const dimAttrs = dims && dims.w > 0 && dims.h > 0 ? ` width="${dims.w}" height="${dims.h}"` : '';
      const fallbackUrl = 'https://placehold.co/540x240/f7f6f2/57534e?text=Gambar+Tidak+Ditemukan';
      return `<img src="${escapeHtml(storedSrc)}" alt="${escapeHtml(block.title)}"${dimAttrs} onerror="this.onerror=null;this.src='${fallbackUrl}';" style="width:${block.widthPct}%; max-width:100%; height:auto;${aspectCss} margin:0 auto; display:block; border:1px solid #d2cec6;" />`;
    }
    return `<div style="width:${block.widthPct}%; margin:0 auto; padding:20px; border:1px dashed #a8a29e; color:#57534e; font-size:0.85em;">[Gambar belum tersedia]</div>`;
  }

  function renderBlockHtml(block, typo, citCtx, citStyle) {
    if (block.type === 'bab') {
      const babMargin = typo.applySpacingToHeadings
        ? `margin:${typo.spaceBeforePt}pt 0 ${typo.spaceAfterPt}pt 0;`
        : 'margin:0 0 0.85em 0;';
      return `
        <div style="text-align:center; font-size:${typo.headingFontSizePt}pt; font-weight:700; text-transform:uppercase; ${babMargin} line-height:1.35;">
          <div>${escapeHtml(block.babLabel)}</div>
          ${block.babSubtitle ? `<div>${escapeHtml(block.babSubtitle)}</div>` : ''}
        </div>
      `;
    }
    if (block.type === 'subbab') {
      const sbMargin = typo.applySpacingToHeadings
        ? `margin:${typo.spaceBeforePt}pt 0 ${typo.spaceAfterPt}pt 0;`
        : 'margin-top:0.65em; margin-bottom:0.22em;';
      return `
        <div style="text-align:left; font-weight:700; text-indent:0; ${sbMargin}">
          ${formatTextWithCitations(block.text, citCtx, citStyle)}
        </div>
      `;
    }
    if (block.type === 'subsubbab') {
      const ssbMargin = typo.applySpacingToHeadings
        ? `margin:${typo.spaceBeforePt}pt 0 ${typo.spaceAfterPt}pt 0;`
        : 'margin-top:0.5em; margin-bottom:0.18em;';
      return `
        <div style="text-align:left; font-weight:700; text-indent:0; ${ssbMargin}">
          ${formatTextWithCitations(block.text, citCtx, citStyle)}
        </div>
      `;
    }
    if (block.type === 'list') {
      const itemsHtml = block.items
        .map(
          (item) => `
          <div class="doc-list-item" style="text-align:${typo.textAlign};">
            <span class="doc-list-marker">${escapeHtml(item.marker)}</span>
            <span class="doc-list-text">${formatTextWithCitations(item.text, citCtx, citStyle)}</span>
          </div>
        `
        )
        .join('');
      return `<div class="doc-list">${itemsHtml}</div>`;
    }
    if (block.type === 'table') {
      const headerRow = block.rows[0] || [];
      const bodyRows = block.rows.slice(1);
      const theadHtml = headerRow.length
        ? `<thead><tr>${headerRow.map((c) => `<th>${formatTextWithCitations(c, citCtx, citStyle)}</th>`).join('')}</tr></thead>`
        : '';
      const tbodyHtml = bodyRows.length
        ? `<tbody>${bodyRows.map((r) => `<tr>${r.map((c) => `<td>${formatTextWithCitations(c, citCtx, citStyle)}</td>`).join('')}</tr>`).join('')}</tbody>`
        : '';
      return `
        <div class="doc-table-wrap">
          <div class="doc-table-caption"><strong>${escapeHtml(block.numberLabel)}.</strong> ${escapeHtml(block.title)}</div>
          <table class="doc-academic-table">${theadHtml}${tbodyHtml}</table>
          ${block.source ? `<div class="doc-caption-source">Sumber: ${escapeHtml(block.source)}</div>` : ''}
        </div>
      `;
    }
    if (block.type === 'figure') {
      return `
        <div class="doc-figure-wrap">
          <div class="doc-figure-media" style="width:100%;">${resolveFigureMediaHtml(block)}</div>
          <div class="doc-figure-caption"><strong>${escapeHtml(block.numberLabel)}.</strong> ${escapeHtml(block.title)}</div>
          ${block.source ? `<div class="doc-caption-source" style="text-align:center;">Sumber: ${escapeHtml(block.source)}</div>` : ''}
        </div>
      `;
    }
    return `
      <p style="text-align:${typo.textAlign}; text-indent:${typo.firstIndentCm}cm; margin:${typo.spaceBeforePt}pt 0 ${typo.spaceAfterPt}pt 0;">
        ${formatTextWithCitations(block.text, citCtx, citStyle)}
      </p>
    `;
  }

  function renderCoverHtml(typo) {
    const c = state.cover;
    const logoSrc = c.logoDataUrl || sessionImagesMemory.__coverLogo || '';
    const authorLines = (c.authors || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const prodiLines = (c.prodi || '').split('\n').map((l) => l.trim()).filter(Boolean);

    let logoHtml = `<div style="height:2.4cm;"></div>`;
    if (logoSrc) {
      logoHtml = `<img src="${logoSrc}" alt="Logo Institusi" style="max-width:3.6cm; max-height:3.6cm; object-fit:contain; margin:0 auto; display:block;" />`;
    } else if (c.useDefaultEmblem) {
      logoHtml = `<div style="width:3.2cm; height:3.2cm; margin:0 auto; display:flex; align-items:center; justify-content:center;">${DEFAULT_EMBLEM_SVG}</div>`;
    }

    const authorsHtml = authorLines.length
      ? `<div style="display:inline-block; text-align:left; margin:0 auto;">${authorLines.map((l) => `<div style="margin-bottom:2px;">${escapeHtml(l)}</div>`).join('')}</div>`
      : `<div style="color:#57534E; font-style:italic;">(Nama &amp; NIM Penyusun)</div>`;

    return `
      <div style="display:flex; flex-direction:column; justify-content:space-between; height:100%; text-align:center; line-height:1.45;">
        <div style="padding-top:0.2cm;">
          <div style="font-size:${Math.max(typo.headingFontSizePt, typo.fontSizePt + 2)}pt; font-weight:700; text-transform:uppercase; margin-bottom:0.5cm;">
            ${escapeHtml(c.title || 'JUDUL MAKALAH')}
          </div>
          <div style="font-weight:700; margin-bottom:0.3cm;">MAKALAH</div>
          ${c.subtitle ? `<div style="font-size:${Math.max(typo.fontSizePt - 1, 10)}pt; max-width:92%; margin:0 auto 0.25cm auto;">${escapeHtml(c.subtitle)}</div>` : ''}
          ${c.lecturer ? `<div style="font-size:${Math.max(typo.fontSizePt - 1, 10)}pt;">Dosen Pengampu: ${escapeHtml(c.lecturer)}</div>` : ''}
        </div>

        <div style="padding:0.35cm 0;">${logoHtml}</div>

        <div style="padding:0.2cm 0;">
          <div style="font-weight:700; margin-bottom:0.25cm;">Disusun Oleh:</div>
          ${authorsHtml}
        </div>

        <div style="font-weight:700; text-transform:uppercase; line-height:1.4; padding-bottom:0.1cm;">
          ${prodiLines.map((l) => `<div>${escapeHtml(l)}</div>`).join('')}
          ${c.university ? `<div>${escapeHtml(c.university)}</div>` : ''}
          ${c.year ? `<div style="margin-top:4px;">${escapeHtml(c.year)}</div>` : ''}
        </div>
      </div>
    `;
  }

  function renderAbstractHtml(typo) {
    const ab = state.abstract || { body: '', keywords: '' };
    const paras = (ab.body || '').replace(/\r\n/g, '\n').split(/\n+/).map((s) => s.trim()).filter(Boolean);
    const bodyHtml = paras.length
      ? paras.map((para) => `<p style="text-align:${typo.textAlign}; text-indent:0; line-height:1.15; margin:0 0 0.45em 0;">${escapeAllowingItalics(para)}</p>`).join('')
      : `<p style="color:#57534E; font-style:italic; text-align:center;">(Belum ada teks Abstrak)</p>`;
    const kw = (ab.keywords || '').trim();
    const kwHtml = kw
      ? `<p style="text-align:left; text-indent:0; line-height:1.15; margin-top:0.65em;"><strong>Kata Kunci:</strong> <em>${escapeHtml(kw)}</em></p>`
      : '';
    return `
      <div style="text-align:center; font-size:${typo.headingFontSizePt}pt; font-weight:700; text-transform:uppercase; margin-bottom:0.9em;">ABSTRAK</div>
      <div>${bodyHtml}${kwHtml}</div>
    `;
  }

  function renderPrefaceHtml(typo) {
    const p = state.preface;
    const paras = (p.body || '').replace(/\r\n/g, '\n').split(/\n+/).map((s) => s.trim()).filter(Boolean);
    const bodyHtml = paras.length
      ? paras.map((para) => `<p style="text-align:${typo.textAlign}; text-indent:${typo.firstIndentCm}cm; margin:${typo.spaceBeforePt}pt 0 ${typo.spaceAfterPt}pt 0;">${escapeHtml(para)}</p>`).join('')
      : `<p style="color:#57534E; font-style:italic; text-align:center;">(Belum ada teks Kata Pengantar)</p>`;

    return `
      <div style="text-align:center; font-size:${typo.headingFontSizePt}pt; font-weight:700; text-transform:uppercase; margin-bottom:0.9em;">KATA PENGANTAR</div>
      <div>${bodyHtml}</div>
      <div style="margin-top:1.3cm; display:flex; justify-content:flex-end;">
        <div style="text-align:left; min-width:5.2cm;">
          <div>${escapeHtml(p.cityDate || '')}</div>
          <div style="height:1.5cm;"></div>
          <div style="font-weight:700;">${escapeHtml(p.signature || 'Penyusun')}</div>
        </div>
      </div>
    `;
  }

  function renderDotLeaderListHtml(title, entries, emptyMsg, typo) {
    const rowsHtml = entries.length
      ? entries
        .map((entry) => {
          const padLeft = entry.level >= 3 ? '1.5cm' : entry.level === 2 ? '0.85cm' : '0';
          return `
              <div class="toc-row" style="padding-left:${padLeft}; font-weight:${entry.bold ? '700' : '400'};">
                <span class="toc-label">${escapeHtml(entry.title)}</span>
                <span class="toc-dots"></span>
                <span class="toc-page">${escapeHtml(String(entry.page))}</span>
              </div>
            `;
        })
        .join('')
      : `<p style="color:#57534E; font-style:italic; text-align:center;">${escapeHtml(emptyMsg)}</p>`;

    return `
      <div style="text-align:center; font-size:${typo.headingFontSizePt}pt; font-weight:700; text-transform:uppercase; margin-bottom:0.9em;">${escapeHtml(title)}</div>
      <div style="line-height:1.45;">${rowsHtml}</div>
    `;
  }

  function resolvePageNumberPosition(mode, kind, isChapterStart) {
    if (mode === 'none' || kind === 'cover') return 'none';
    if (mode === 'bottom-center') return 'bottom-center';
    if (mode === 'top-right') return 'top-right';
    // Mode standar skripsi
    if (kind === 'abstract' || kind === 'preface' || kind === 'toc' || kind === 'lot' || kind === 'lof') return 'bottom-center';
    return isChapterStart ? 'bottom-center' : 'top-right';
  }

  function buildPaginatedDocument() {
    const f = state.format;
    const paper = PAPER_SIZES[f.paperSize] || PAPER_SIZES.A4;
    const typo = getTypography();
    const citStyle = f.citationStyle === 'ieee' ? 'ieee' : 'apa';
    const citCtx = buildCitationContext(state.content);
    const parsedBody = parseDocumentBody(state.content);
    const finalBib = buildFinalBibliography(citCtx, citStyle);
    const numMode = f.pageNumberMode || 'skripsi';

    const paperWpx = paper.widthCm * CM_TO_PX;
    const paperHpx = paper.heightCm * CM_TO_PX;
    const mTopPx = Number(f.marginTop) * CM_TO_PX;
    const mBottomPx = Number(f.marginBottom) * CM_TO_PX;
    const mLeftPx = Number(f.marginLeft) * CM_TO_PX;
    const mRightPx = Number(f.marginRight) * CM_TO_PX;

    const innerWpx = Math.max(120, paperWpx - mLeftPx - mRightPx);
    const innerHpx = Math.max(160, paperHpx - mTopPx - mBottomPx);

    const measureBox = document.getElementById('measure-container');
    measureBox.style.width = `${innerWpx}px`;
    measureBox.style.fontFamily = typo.fontFamily;
    measureBox.style.fontSize = `${typo.fontSizePt}pt`;
    measureBox.style.lineHeight = String(typo.lineHeight);
    measureBox.style.boxSizing = 'border-box';

    function measureHtmlHeight(html) {
      measureBox.innerHTML = `<div style="overflow:hidden;">${html}</div>`;
      return measureBox.firstElementChild.getBoundingClientRect().height;
    }

    const pages = [];
    const tocEntries = [];
    const lotEntries = [];
    const lofEntries = [];
    const outlineItems = [];
    let romanCounter = 1;

    // 1. Cover
    if (f.showCover) {
      outlineItems.push({ kind: 'cover', label: 'Halaman Sampul (Cover)', pageLabel: '-', sheetIndex: pages.length, level: 1, lineIndex: null });
      pages.push({
        kind: 'cover',
        pageNumberLabel: '',
        numPosition: 'none',
        innerHtml: renderCoverHtml(typo),
      });
    }

    // 1b. Abstrak
    if (f.showAbstract) {
      const rom = toRomanLower(romanCounter++);
      tocEntries.push({ title: 'ABSTRAK', page: rom, level: 1, bold: true });
      outlineItems.push({ kind: 'abstract', label: 'Abstrak', pageLabel: rom, sheetIndex: pages.length, level: 1, lineIndex: null });
      pages.push({
        kind: 'abstract',
        pageNumberLabel: rom,
        numPosition: resolvePageNumberPosition(numMode, 'abstract', true),
        innerHtml: renderAbstractHtml(typo),
      });
    }

    // 2. Kata Pengantar
    if (f.showPreface) {
      const rom = toRomanLower(romanCounter++);
      tocEntries.push({ title: 'KATA PENGANTAR', page: rom, level: 1, bold: true });
      outlineItems.push({ kind: 'preface', label: 'Kata Pengantar', pageLabel: rom, sheetIndex: pages.length, level: 1, lineIndex: null });
      pages.push({
        kind: 'preface',
        pageNumberLabel: rom,
        numPosition: resolvePageNumberPosition(numMode, 'preface', true),
        innerHtml: renderPrefaceHtml(typo),
      });
    }

    // 3. Daftar Isi
    let tocPageIdx = -1;
    if (f.showToc) {
      const rom = toRomanLower(romanCounter++);
      tocEntries.push({ title: 'DAFTAR ISI', page: rom, level: 1, bold: true });
      tocPageIdx = pages.length;
      outlineItems.push({ kind: 'toc', label: 'Daftar Isi', pageLabel: rom, sheetIndex: pages.length, level: 1, lineIndex: null });
      pages.push({
        kind: 'toc',
        pageNumberLabel: rom,
        numPosition: resolvePageNumberPosition(numMode, 'toc', true),
        innerHtml: '',
      });
    }

    // 4. Daftar Tabel
    let lotPageIdx = -1;
    if (f.showLot) {
      const rom = toRomanLower(romanCounter++);
      tocEntries.push({ title: 'DAFTAR TABEL', page: rom, level: 1, bold: true });
      lotPageIdx = pages.length;
      outlineItems.push({ kind: 'lot', label: 'Daftar Tabel', pageLabel: rom, sheetIndex: pages.length, level: 1, lineIndex: null });
      pages.push({
        kind: 'lot',
        pageNumberLabel: rom,
        numPosition: resolvePageNumberPosition(numMode, 'lot', true),
        innerHtml: '',
      });
    }

    // 5. Daftar Gambar
    let lofPageIdx = -1;
    if (f.showLof) {
      const rom = toRomanLower(romanCounter++);
      tocEntries.push({ title: 'DAFTAR GAMBAR', page: rom, level: 1, bold: true });
      lofPageIdx = pages.length;
      outlineItems.push({ kind: 'lof', label: 'Daftar Gambar', pageLabel: rom, sheetIndex: pages.length, level: 1, lineIndex: null });
      pages.push({
        kind: 'lof',
        pageNumberLabel: rom,
        numPosition: resolvePageNumberPosition(numMode, 'lof', true),
        innerHtml: '',
      });
    }

    // 6. Isi Makalah (Angka Arab mulai 1)
    let arabicCounter = 1;
    for (const chapter of parsedBody.chapters) {
      if (!chapter.blocks.length) continue;

      let currentBlocksHtml = [];
      let currentHeight = 0;
      let isFirstPageOfBab = chapter.blocks[0]?.type === 'bab';

      for (let bIdx = 0; bIdx < chapter.blocks.length; bIdx++) {
        const block = chapter.blocks[bIdx];
        const html = renderBlockHtml(block, typo, citCtx, citStyle);
        const blockH = measureHtmlHeight(html);

        if (currentBlocksHtml.length > 0 && currentHeight + blockH > innerHpx) {
          pages.push({
            kind: 'body',
            isChapterStart: isFirstPageOfBab,
            pageNumberLabel: String(arabicCounter++),
            numPosition: resolvePageNumberPosition(numMode, 'body', isFirstPageOfBab),
            innerHtml: currentBlocksHtml.join(''),
          });
          currentBlocksHtml = [];
          currentHeight = 0;
          isFirstPageOfBab = false;
        }

        const targetSheetIdx = pages.length;
        if (block.type === 'bab') {
          tocEntries.push({ title: block.tocText, page: arabicCounter, level: 1, bold: true });
          outlineItems.push({ kind: 'bab', label: block.tocText, pageLabel: String(arabicCounter), sheetIndex: targetSheetIdx, level: 1, lineIndex: block.lineIndex });
        } else if (block.type === 'subbab') {
          tocEntries.push({ title: block.text, page: arabicCounter, level: 2, bold: false });
          outlineItems.push({ kind: 'subbab', label: block.text, pageLabel: String(arabicCounter), sheetIndex: targetSheetIdx, level: 2, lineIndex: block.lineIndex });
        } else if (block.type === 'subsubbab') {
          tocEntries.push({ title: block.text, page: arabicCounter, level: 3, bold: false });
          outlineItems.push({ kind: 'subsubbab', label: block.text, pageLabel: String(arabicCounter), sheetIndex: targetSheetIdx, level: 3, lineIndex: block.lineIndex });
        } else if (block.type === 'table') {
          lotEntries.push({ title: `${block.numberLabel}. ${block.title}`, page: arabicCounter, level: 1, bold: false });
          outlineItems.push({ kind: 'table', label: `${block.numberLabel}: ${block.title}`, pageLabel: String(arabicCounter), sheetIndex: targetSheetIdx, level: 3, lineIndex: block.lineIndex });
        } else if (block.type === 'figure') {
          lofEntries.push({ title: `${block.numberLabel}. ${block.title}`, page: arabicCounter, level: 1, bold: false });
          outlineItems.push({ kind: 'figure', label: `${block.numberLabel}: ${block.title}`, pageLabel: String(arabicCounter), sheetIndex: targetSheetIdx, level: 3, lineIndex: block.lineIndex });
        }

        currentBlocksHtml.push(html);
        currentHeight += blockH;
      }

      if (currentBlocksHtml.length > 0) {
        pages.push({
          kind: 'body',
          isChapterStart: isFirstPageOfBab,
          pageNumberLabel: String(arabicCounter++),
          numPosition: resolvePageNumberPosition(numMode, 'body', isFirstPageOfBab),
          innerHtml: currentBlocksHtml.join(''),
        });
      }
    }

    // 7. Daftar Pustaka
    if (finalBib.length > 0) {
      tocEntries.push({ title: 'DAFTAR PUSTAKA', page: arabicCounter, level: 1, bold: true });
      outlineItems.push({ kind: 'bib', label: 'Daftar Pustaka', pageLabel: String(arabicCounter), sheetIndex: pages.length, level: 1, lineIndex: null });

      const headingHtml = `<div style="text-align:center; font-size:${typo.headingFontSizePt}pt; font-weight:700; text-transform:uppercase; margin-bottom:0.9em;">DAFTAR PUSTAKA</div>`;
      let currentBibHtml = [headingHtml];
      let currentHeight = measureHtmlHeight(headingHtml);
      let isFirstBibPage = true;

      for (const item of finalBib) {
        const entryHtml =
          citStyle === 'ieee'
            ? `<div class="bib-ieee-entry" style="text-align:${typo.textAlign};"><span class="bib-ieee-num">[${item.num}]</span><span class="bib-ieee-text">${item.html}</span></div>`
            : `<div class="bib-apa-entry" style="text-align:${typo.textAlign};">${item.html}</div>`;
        const entryH = measureHtmlHeight(entryHtml);

        if (currentBibHtml.length > 1 && currentHeight + entryH > innerHpx) {
          pages.push({
            kind: 'bibliography',
            isChapterStart: isFirstBibPage,
            pageNumberLabel: String(arabicCounter++),
            numPosition: resolvePageNumberPosition(numMode, 'bibliography', isFirstBibPage),
            innerHtml: currentBibHtml.join(''),
          });
          currentBibHtml = [];
          currentHeight = 0;
          isFirstBibPage = false;
        }
        currentBibHtml.push(entryHtml);
        currentHeight += entryH;
      }

      if (currentBibHtml.length > 0) {
        pages.push({
          kind: 'bibliography',
          isChapterStart: isFirstBibPage,
          pageNumberLabel: String(arabicCounter++),
          numPosition: resolvePageNumberPosition(numMode, 'bibliography', isFirstBibPage),
          innerHtml: currentBibHtml.join(''),
        });
      }
    }

    if (tocPageIdx !== -1) {
      pages[tocPageIdx].innerHtml = renderDotLeaderListHtml('DAFTAR ISI', tocEntries, 'Tambahkan BAB atau Sub-bab untuk mengisi Daftar Isi.', typo);
    }
    if (lotPageIdx !== -1) {
      pages[lotPageIdx].innerHtml = renderDotLeaderListHtml('DAFTAR TABEL', lotEntries, 'Belum ada tabel bernomor.', typo);
    }
    if (lofPageIdx !== -1) {
      pages[lofPageIdx].innerHtml = renderDotLeaderListHtml('DAFTAR GAMBAR', lofEntries, 'Belum ada gambar bernomor.', typo);
    }

    measureBox.innerHTML = '';

    return {
      pages,
      tocEntries,
      lotEntries,
      lofEntries,
      outlineItems,
      parsedBody,
      finalBib,
      citCtx,
      citStyle,
      paper,
      typo,
      paperWpx,
      paperHpx,
      mTopPx,
      mBottomPx,
      mLeftPx,
      mRightPx,
    };
  }

  function createPaperPageElement(pg, doc, includeGuides) {
    const f = state.format;
    const sheet = document.createElement('div');
    sheet.className = 'paper-page';
    sheet.style.width = `${doc.paperWpx}px`;
    sheet.style.height = `${doc.paperHpx}px`;
    sheet.style.padding = `${doc.mTopPx}px ${doc.mRightPx}px ${doc.mBottomPx}px ${doc.mLeftPx}px`;
    sheet.style.fontFamily = doc.typo.fontFamily;
    sheet.style.fontSize = `${doc.typo.fontSizePt}pt`;
    sheet.style.lineHeight = String(doc.typo.lineHeight);

    if (includeGuides && f.showMarginGuides) {
      const guide = document.createElement('div');
      guide.className = 'margin-guide-box';
      guide.style.top = `${doc.mTopPx}px`;
      guide.style.left = `${doc.mLeftPx}px`;
      guide.style.right = `${doc.mRightPx}px`;
      guide.style.bottom = `${doc.mBottomPx}px`;
      sheet.appendChild(guide);
    }

    const contentArea = document.createElement('div');
    contentArea.style.width = '100%';
    contentArea.style.height = '100%';
    contentArea.style.position = 'relative';
    contentArea.style.zIndex = '5';
    contentArea.innerHTML = pg.innerHtml;
    sheet.appendChild(contentArea);

    if (pg.pageNumberLabel && pg.numPosition !== 'none') {
      const numEl = document.createElement('div');
      numEl.style.fontSize = `${Math.max(doc.typo.fontSizePt - 1, 10)}pt`;
      numEl.textContent = pg.pageNumberLabel;

      if (pg.numPosition === 'top-right') {
        numEl.className = 'paper-page-num-topright';
        numEl.style.top = `${Math.max(16, doc.mTopPx * 0.46)}px`;
        numEl.style.right = `${doc.mRightPx}px`;
      } else {
        numEl.className = 'paper-page-num-bottom';
        numEl.style.bottom = `${Math.max(14, doc.mBottomPx * 0.4)}px`;
      }
      sheet.appendChild(numEl);
    }

    return sheet;
  }

  function renderOutlineUI(doc) {
    const listEl = document.getElementById('document-outline-list');
    document.getElementById('outline-total-pages').textContent = `${doc.pages.length} hal`;

    if (!doc.outlineItems.length) {
      listEl.innerHTML = '<div class="text-[11px] text-ink-muted italic border border-dashed border-paper-border rounded-[4px] p-3 text-center">Belum ada struktur dokumen.</div>';
      return;
    }

    listEl.innerHTML = doc.outlineItems
      .map((item, idx) => {
        const padCls = item.level === 2 ? 'pl-4' : item.level === 3 ? 'pl-7 text-ink-muted' : 'pl-2 font-medium text-ink';
        const badgeTag = item.kind === 'table' ? 'TBL' : item.kind === 'figure' ? 'GBR' : '';
        return `
          <button type="button" data-outline-idx="${idx}"
            class="outline-jump-btn w-full flex items-center justify-between gap-2 py-1.5 pr-2 ${padCls} text-left text-[11.5px] rounded-[4px] hover:bg-white border border-transparent hover:border-paper-border transition cursor-pointer">
            <span class="truncate flex items-center gap-1.5">
              ${badgeTag ? `<span class="font-mono text-[9px] px-1 rounded-[2px] bg-paper-desk text-ink-muted">${badgeTag}</span>` : ''}
              <span class="truncate">${escapeHtml(item.label)}</span>
            </span>
            <span class="font-mono text-[10px] text-ink-muted tabular-nums shrink-0">${escapeHtml(item.pageLabel)}</span>
          </button>
        `;
      })
      .join('');
  }

  const remeasuredImageSrcs = new Set();

  function jumpToOutlineItem(item) {
    if (!item) return;
    const isNarrow = window.innerWidth < 1024;
    if (isNarrow) {
      setMobilePane('preview');
    }
    // 1. Gulir Pratinjau ke Lembar terkait
    requestAnimationFrame(() => {
      const sheetWrapper = document.querySelector(`[data-sheet-index="${item.sheetIndex}"]`);
      if (sheetWrapper) {
        sheetWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    // 2. Jika item berasal dari Isi Makalah, sorot baris di Editor
    if (item.lineIndex !== null && item.lineIndex !== undefined) {
      setEditorSubTab('body');
      const ta = document.getElementById('content-editor');
      const lines = ta.value.split('\n');
      let charOffset = 0;
      for (let i = 0; i < Math.min(item.lineIndex, lines.length); i++) {
        charOffset += lines[i].length + 1;
      }
      const lineLen = (lines[item.lineIndex] || '').length;
      if (!isNarrow) ta.focus();
      ta.setSelectionRange(charOffset, charOffset + lineLen);
      const approxLineH = 22;
      ta.scrollTop = Math.max(0, item.lineIndex * approxLineH - 80);
    } else if (item.kind === 'bib') {
      setEditorSubTab('bib');
    }
  }

  function renderPreviewAndStats() {
    try {
      const doc = buildPaginatedDocument();
      lastComputedDoc = doc;

      const f = state.format;
      const zoomFactor = (Number(state.ui.zoom) || 75) / 100;
      const stack = document.getElementById('paper-stack');
      stack.innerHTML = '';

      // Perbarui indikator spesifikasi pratinjau
      document.getElementById('paper-dim-label').innerHTML = `${doc.paper.widthCm} &times; ${doc.paper.heightCm} cm`;
      document.getElementById('preview-spec-indicator').textContent =
        `${doc.paper.name} · ${f.marginTop}/${f.marginLeft}/${f.marginBottom}/${f.marginRight} cm · ${f.fontFamily} ${f.fontSize}pt · Spasi ${f.lineSpacing} · ${PAGE_NUM_MODE_LABELS[f.pageNumberMode] || ''}`;

      if (!doc.pages.length) {
        stack.innerHTML =
          '<div class="bg-white border border-dashed border-paper-borderStrong rounded-[6px] px-6 py-8 text-center max-w-sm text-[12px] text-ink-muted">Belum ada halaman untuk ditampilkan. Tulis isi makalah di editor atau aktifkan komponen dokumen di panel Format.</div>';
      } else {
        doc.pages.forEach((pg, idx) => {
          const wrapper = document.createElement('div');
          wrapper.dataset.sheetIndex = String(idx);
          wrapper.style.width = `${doc.paperWpx * zoomFactor}px`;
          wrapper.style.height = `${doc.paperHpx * zoomFactor}px`;
          wrapper.style.position = 'relative';
          wrapper.className = 'shrink-0';

          const sheet = createPaperPageElement(pg, doc, true);
          sheet.style.transform = `scale(${zoomFactor})`;
          sheet.style.transformOrigin = 'top left';

          const posLabel =
            pg.numPosition === 'top-right'
              ? 'Kanan Atas'
              : pg.numPosition === 'bottom-center'
                ? 'Tengah Bawah'
                : 'Tanpa Nomor';

          const metaBar = document.createElement('div');
          metaBar.className = 'absolute -top-5 left-0 right-0 flex items-center justify-between font-mono text-[10px] text-ink-muted tabular-nums select-none';
          metaBar.innerHTML = `<span>Lembar ${idx + 1}/${doc.pages.length}</span><span>${pg.pageNumberLabel ? `Hal. ${pg.pageNumberLabel} · ` : ''}${posLabel}</span>`;

          wrapper.appendChild(metaBar);
          wrapper.appendChild(sheet);
          stack.appendChild(wrapper);
        });

        // Ukur ulang paginasi sekali jika ada gambar baru selesai dimuat agar tidak terpotong
        stack.querySelectorAll('img').forEach((imgEl) => {
          const srcKey = imgEl.getAttribute('src') || '';
          if (!srcKey || remeasuredImageSrcs.has(srcKey)) return;
          if (imgEl.complete && imgEl.naturalHeight > 0) {
            remeasuredImageSrcs.add(srcKey);
          } else {
            imgEl.addEventListener(
              'load',
              () => {
                if (remeasuredImageSrcs.has(srcKey)) return;
                remeasuredImageSrcs.add(srcKey);
                scheduleRender();
              },
              { once: true }
            );
          }
        });
      }

      // Statistik real-time
      const plainWordsSource = `${f.showPreface ? state.preface.body : ''} ${state.content}`
        .replace(/\[TABEL[^\]]*\]|\[\/TABEL\]|\[GAMBAR[^\]]*\]|\[@[a-zA-Z0-9_-]+\]/g, ' ')
        .trim();
      const wordsCount = plainWordsSource ? plainWordsSource.split(/\s+/).filter(Boolean).length : 0;

      document.getElementById('stat-pages').textContent = String(doc.pages.length);
      document.getElementById('stat-words').textContent = wordsCount.toLocaleString('id-ID');
      document.getElementById('stat-paragraphs').textContent = String(doc.parsedBody.totalParagraphs);
      document.getElementById('stat-tables').textContent = String(doc.parsedBody.totalTables);
      document.getElementById('stat-figures').textContent = String(doc.parsedBody.totalFigures);
      document.getElementById('stat-citations').textContent = String(doc.citCtx.inlineUsageCount);
      document.getElementById('mobile-stat-pages').textContent = String(doc.pages.length);
      document.getElementById('mobile-stat-words').textContent = wordsCount.toLocaleString('id-ID');

      renderManagedCitationsUI();
      renderOutlineUI(doc);
      updateComplianceAuditUI();
      scheduleCitationAudit();
      scheduleReadinessAudit();
      updatePrintRoot(doc);
    } catch (err) {
      console.error('Gagal merender pratinjau:', err);
      showToast('Terjadi kendala saat memperbarui pratinjau kertas.', 'error');
    }
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderPreviewAndStats, 95);
  }

  // =====================================================================
  // 9. CETAK PDF & EKSPOR MICROSOFT WORD (.doc) PRESISI
  // =====================================================================
  function updatePrintRoot(doc) {
    const dynamicStyle = document.getElementById('dynamic-print-style');
    dynamicStyle.textContent = `
      @media print {
        @page {
          size: ${doc.paper.widthCm}cm ${doc.paper.heightCm}cm;
          margin: 0;
        }
      }
    `;
    const printRoot = document.getElementById('print-root');
    printRoot.innerHTML = '';
    doc.pages.forEach((pg) => {
      printRoot.appendChild(createPaperPageElement(pg, doc, false));
    });
  }

  function svgStringToPngDataUrl(svgStr, width = 640, height = 240) {
    return new Promise((resolve) => {
      try {
        const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            const pngUrl = canvas.toDataURL('image/png');
            URL.revokeObjectURL(url);
            resolve(pngUrl);
          } catch {
            URL.revokeObjectURL(url);
            resolve('');
          }
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(''); };
        img.src = url;
      } catch {
        resolve('');
      }
    });
  }

  function imageUrlToPngDataUrl(url) {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const w = img.naturalWidth || 640;
            const h = img.naturalHeight || 360;
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/png'));
          } catch {
            resolve('');
          }
        };
        img.onerror = () => resolve('');
        img.src = url;
      } catch {
        resolve('');
      }
    });
  }

  async function exportToWord() {
    try {
      if (!window.MakaRapiDocx || typeof window.MakaRapiDocx.buildDocxBlob !== 'function') {
        throw new Error('Modul pembuat file .docx (js/docx-exporter.js) belum termuat.');
      }

      if (!lastComputedDoc) renderPreviewAndStats();
      const doc = lastComputedDoc;
      const f = state.format;
      const typo = doc.typo;
      const paper = doc.paper;

      const convertedSvgCache = {};
      for (const [id, svgStr] of Object.entries(BUILTIN_FIGURES)) {
        convertedSvgCache[id] = await svgStringToPngDataUrl(svgStr, 640, 240);
      }

      let coverLogoDataUrl = '';
      if (f.showCover) {
        const c = state.cover;
        const rawLogo = c.logoDataUrl || sessionImagesMemory.__coverLogo || '';
        if (rawLogo && rawLogo.startsWith('data:image/')) {
          coverLogoDataUrl = rawLogo;
        } else if (rawLogo) {
          coverLogoDataUrl = await imageUrlToPngDataUrl(rawLogo);
        } else if (c.useDefaultEmblem) {
          coverLogoDataUrl = await svgStringToPngDataUrl(DEFAULT_EMBLEM_SVG, 180, 180);
        }
      }

      // Konversi gambar eksternal (URL) ke data URL bila ada
      const externalUrlCache = {};
      for (const ch of doc.parsedBody.chapters) {
        for (const block of ch.blocks) {
          if (block.type === 'figure' && !block.id && block.url && !block.url.startsWith('data:image/')) {
            if (!externalUrlCache[block.url]) {
              externalUrlCache[block.url] = await imageUrlToPngDataUrl(block.url);
            }
          }
        }
      }

      const resolveFigureDataUrl = (block) => {
        if (block.id && convertedSvgCache[block.id]) return convertedSvgCache[block.id];
        if (block.id && (state.images[block.id] || sessionImagesMemory[block.id])) {
          return state.images[block.id] || sessionImagesMemory[block.id];
        }
        if (block.url && block.url.startsWith('data:image/')) return block.url;
        if (block.url && externalUrlCache[block.url]) return externalUrlCache[block.url];
        return '';
      };

      const resolveInlineHtml = (rawText) => formatTextWithCitations(rawText, doc.citCtx, doc.citStyle);

      let blob = null;
      let usedPython = false;

      const buildExportPayload = () => {
        const serializedChapters = doc.parsedBody.chapters.map((ch) => ({
          blocks: ch.blocks.map((block) => {
            if (block.type === 'subbab' || block.type === 'subsubbab') {
              return { ...block, html: resolveInlineHtml(block.text) };
            }
            if (block.type === 'list') {
              return {
                ...block,
                items: (block.items || []).map((it) => ({
                  marker: it.marker,
                  text: it.text,
                  html: resolveInlineHtml(it.text),
                })),
              };
            }
            if (block.type === 'table') {
              return {
                ...block,
                rows: (block.rows || []).map((row) => row.map((cell) => resolveInlineHtml(cell))),
              };
            }
            if (block.type === 'figure') {
              return { ...block, dataUrl: resolveFigureDataUrl(block) };
            }
            if (block.type === 'paragraph') {
              return { ...block, html: resolveInlineHtml(block.text) };
            }
            return block;
          }),
        }));

        return {
          format: f,
          paper,
          typo,
          cover: state.cover,
          abstract: state.abstract || { body: '', keywords: '' },
          preface: state.preface,
          coverLogoDataUrl,
          tocEntries: doc.tocEntries,
          lotEntries: doc.lotEntries,
          lofEntries: doc.lofEntries,
          chapters: serializedChapters,
          finalBib: doc.finalBib,
          citStyle: doc.citStyle,
        };
      };

      // 1. Prioritaskan Backend Python (FastAPI + python-docx) bila aktif
      if (window.MakaRapiAPI) {
        const apiInfo = await window.MakaRapiAPI.detectBackend();
        if (apiInfo.online) {
          blob = await window.MakaRapiAPI.exportDocx(buildExportPayload());
          if (blob) usedPython = true;
        }
      }

      // 2. Fallback lokal ke generator OOXML JS bila server Python offline
      if (!blob) {
        blob = window.MakaRapiDocx.buildDocxBlob({
          format: f,
          paper,
          typo,
          cover: state.cover,
          abstract: state.abstract || { body: '', keywords: '' },
          preface: state.preface,
          coverLogoDataUrl,
          tocEntries: doc.tocEntries,
          lotEntries: doc.lotEntries,
          lofEntries: doc.lofEntries,
          chapters: doc.parsedBody.chapters,
          finalBib: doc.finalBib,
          citStyle: doc.citStyle,
          resolveInlineHtml,
          resolveFigureDataUrl,
          imageDimensions: imageAspectCache,
        });
      }

      const safeName =
        (state.cover.title || 'Makalah_MakaRapi')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 60) || 'makalah_makarapi';
      const fileName = `${safeName}.docx`;

      // Mode Aplikasi Android Native (Capacitor): simpan lewat Filesystem & buka lembar Share/Simpan Android
      const cap = window.Capacitor;
      const isNativeApp = Boolean(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
      if (isNativeApp && cap.Plugins && cap.Plugins.Filesystem) {
        const base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const out = String(reader.result || '');
            resolve(out.includes(',') ? out.split(',')[1] : out);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        const written = await cap.Plugins.Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: 'CACHE',
        });
        if (cap.Plugins.Share && written?.uri) {
          await cap.Plugins.Share.share({
            title: fileName,
            text: 'Dokumen makalah hasil format MakaRapi (.docx)',
            url: written.uri,
            dialogTitle: 'Simpan atau Buka di Microsoft Word',
          });
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
      }

      const hasAutoIndex = !!(f.showToc || f.showLot || f.showLof);
      const wordHint = hasAutoIndex
        ? ' Di Microsoft Word, tekan Ctrl+A lalu F9 untuk menyegarkan nomor halaman Daftar Isi.'
        : '';
      showToast(
        `Dokumen berhasil diekspor sebagai ${fileName}${usedPython ? ' (Python python-docx)' : ' (Browser)'}.${wordHint}`,
        'success',
        hasAutoIndex ? 6500 : 3800
      );
    } catch (err) {
      console.error('Gagal mengekspor dokumen Word:', err);
      showToast('Terjadi kendala saat mengekspor ke Microsoft Word (.docx).', 'error');
    }
  }

  // =====================================================================
  // 10. SINKRONISASI UI, NAVIGASI TAB, MODAL, & EVENT LISTENER
  // =====================================================================
  function setSidebarTab(tabName) {
    const valid = ['format', 'pedoman', 'citation', 'structure'].includes(tabName) ? tabName : 'format';
    state.ui.sidebarTab = valid;

    document.querySelectorAll('.sidebar-tab-btn').forEach((btn) => {
      const active = btn.dataset.sidebarTab === valid;
      btn.setAttribute('aria-selected', String(active));
      btn.classList.toggle('border-ink-primary', active);
      btn.classList.toggle('text-ink-primary', active);
      btn.classList.toggle('font-semibold', active);
      btn.classList.toggle('border-transparent', !active);
      btn.classList.toggle('text-ink-muted', !active);
      btn.classList.toggle('hover:text-ink', !active);
    });

    document.querySelectorAll('.sidebar-panel').forEach((panel) => {
      panel.classList.toggle('hidden', panel.id !== `sidebar-tab-${valid}`);
    });
  }

  function setEditorSubTab(tabName) {
    const valid = tabName === 'bib' ? 'bib' : 'body';
    state.ui.editorTab = valid;

    document.querySelectorAll('.ed-subtab-btn').forEach((btn) => {
      const active = btn.dataset.editorTab === valid;
      btn.classList.toggle('border-ink-primary', active);
      btn.classList.toggle('text-ink-primary', active);
      btn.classList.toggle('font-semibold', active);
      btn.classList.toggle('border-transparent', !active);
      btn.classList.toggle('text-ink-muted', !active);
    });

    document.getElementById('editor-panel-body').classList.toggle('hidden', valid !== 'body');
    document.getElementById('editor-panel-bib').classList.toggle('hidden', valid !== 'bib');
  }

  function setMobilePane(paneName) {
    const valid = ['sidebar', 'editor', 'preview'].includes(paneName) ? paneName : 'editor';
    state.ui.mobilePane = valid;

    const panes = {
      sidebar: document.getElementById('pane-sidebar'),
      editor: document.getElementById('pane-editor'),
      preview: document.getElementById('pane-preview'),
    };

    Object.entries(panes).forEach(([key, el]) => {
      if (!el) return;
      if (key === valid) {
        el.classList.remove('hidden');
        el.classList.add('flex');
      } else {
        el.classList.add('hidden', 'lg:flex');
        el.classList.remove('flex');
      }
    });

    document.querySelectorAll('.mobile-pane-btn').forEach((btn) => {
      const active = btn.dataset.pane === valid;
      btn.classList.toggle('bg-ink-primary', active);
      btn.classList.toggle('text-white', active);
      btn.classList.toggle('border-ink-primary', active);
      btn.classList.toggle('bg-white', !active);
      btn.classList.toggle('text-ink', !active);
      btn.classList.toggle('border-paper-border', !active);
    });

    if (valid === 'preview' && window.innerWidth < 1024) {
      requestAnimationFrame(() => fitPreviewToViewport(false));
    }
  }

  function setGuidelineMode(mode) {
    const valid = mode === 'text' ? 'text' : 'file';
    state.ui.guidelineMode = valid;

    document.querySelectorAll('.gmode-btn').forEach((btn) => {
      const active = btn.dataset.gmode === valid;
      btn.classList.toggle('bg-ink-primary', active);
      btn.classList.toggle('text-white', active);
      btn.classList.toggle('bg-white', !active);
      btn.classList.toggle('text-ink-muted', !active);
    });

    document.getElementById('guideline-mode-file').classList.toggle('hidden', valid !== 'file');
    document.getElementById('guideline-mode-text').classList.toggle('hidden', valid !== 'text');
  }

  function updateZoomControlsUI() {
    const curZoom = Number(state.ui.zoom) || 75;
    document.querySelectorAll('.zoom-preset-btn').forEach((btn) => {
      const active = Number(btn.dataset.zoom) === curZoom;
      btn.classList.toggle('bg-ink-primary', active);
      btn.classList.toggle('text-white', active);
      btn.classList.toggle('text-ink-muted', !active);
      btn.classList.toggle('hover:bg-white', !active);
    });
  }

  function updateQuickMarginGuideBtnUI() {
    const btn = document.getElementById('btn-quick-margin-guide');
    if (!btn) return;
    const on = Boolean(state.format.showMarginGuides);
    btn.classList.toggle('bg-ink-primary', on);
    btn.classList.toggle('text-white', on);
    btn.classList.toggle('border-ink-primary', on);
    btn.classList.toggle('bg-white', !on);
    btn.classList.toggle('text-ink-muted', !on);
    btn.classList.toggle('border-paper-border', !on);
  }

  function updateCitationStyleUI() {
    const style = state.format.citationStyle === 'ieee' ? 'ieee' : 'apa';
    document.querySelectorAll('.cit-style-btn').forEach((btn) => {
      const active = btn.dataset.citStyle === style;
      btn.classList.toggle('bg-ink-primary', active);
      btn.classList.toggle('text-white', active);
      btn.classList.toggle('text-ink-muted', !active);
      btn.classList.toggle('hover:bg-white', !active);
    });
    const badge = document.getElementById('bib-tab-badge');
    const label = document.getElementById('bib-style-label');
    if (badge) badge.textContent = style.toUpperCase();
    if (label) label.textContent = style === 'ieee' ? 'IEEE Style' : 'APA 7th Edition';
  }

  function updateCoverLogoThumb() {
    const thumb = document.getElementById('cover-logo-thumb');
    if (!thumb) return;
    const logoSrc = state.cover.logoDataUrl || sessionImagesMemory.__coverLogo || '';
    if (logoSrc) {
      thumb.innerHTML = `<img src="${logoSrc}" alt="Logo" class="w-full h-full object-contain p-0.5" />`;
    } else if (state.cover.useDefaultEmblem) {
      thumb.innerHTML = `<div class="w-8 h-8 flex items-center justify-center">${DEFAULT_EMBLEM_SVG}</div>`;
    } else {
      thumb.innerHTML = '<span class="text-[9px] font-mono text-ink-subtle">Kosong</span>';
    }
  }

  function updateCitationTypeFields() {
    const type = document.getElementById('cit-type').value;
    document.getElementById('cit-fields-book').classList.toggle('hidden', type !== 'book');
    document.getElementById('cit-fields-journal').classList.toggle('hidden', type !== 'journal');
    document.getElementById('cit-fields-website').classList.toggle('hidden', type !== 'website');
    updateCitationLivePreview();
  }

  function readCitationFormDraft() {
    return {
      id: 'preview',
      type: document.getElementById('cit-type').value,
      authors: document.getElementById('cit-authors').value.trim(),
      year: document.getElementById('cit-year').value.trim(),
      title: document.getElementById('cit-title').value.trim(),
      publisher: document.getElementById('cit-publisher').value.trim(),
      city: document.getElementById('cit-city').value.trim(),
      journal: document.getElementById('cit-journal').value.trim(),
      vol: document.getElementById('cit-vol').value.trim(),
      issue: document.getElementById('cit-issue').value.trim(),
      pages: document.getElementById('cit-pages').value.trim(),
      site: document.getElementById('cit-site').value.trim(),
      url: document.getElementById('cit-url').value.trim(),
    };
  }

  function updateCitationLivePreview() {
    const previewEl = document.getElementById('cit-live-preview');
    if (!previewEl) return;
    const draft = readCitationFormDraft();
    if (!draft.authors && !draft.title) {
      previewEl.textContent = 'Pratinjau sitasi tampil di sini setelah mengisi bidang di atas.';
      return;
    }
    const style = state.format.citationStyle === 'ieee' ? 'ieee' : 'apa';
    const inText = style === 'ieee' ? '[1]' : formatCitationInTextAPA(draft);
    const bibHtml = style === 'ieee' ? formatCitationBibHtmlIEEE(draft) : formatCitationBibHtmlAPA(draft);
    previewEl.innerHTML = `
      <div class="text-[10px] font-mono text-ink-primary mb-1">In-text: ${escapeHtml(inText)}</div>
      <div class="text-ink">${bibHtml}</div>
    `;
  }

  function renderManagedCitationsUI() {
    const listEl = document.getElementById('managed-citations-list');
    const countEl = document.getElementById('managed-cit-count');
    const summaryEl = document.getElementById('bib-auto-summary');
    const citations = state.citations || [];
    const style = state.format.citationStyle === 'ieee' ? 'ieee' : 'apa';
    const citCtx = buildCitationContext(state.content);

    if (countEl) countEl.textContent = String(citations.length);

    if (listEl) {
      if (!citations.length) {
        listEl.innerHTML =
          '<div class="text-[11px] text-ink-muted italic border border-dashed border-paper-border rounded-[4px] p-2.5 text-center">Belum ada referensi tersimpan.</div>';
      } else {
        listEl.innerHTML = citations
          .map((cit) => {
            const inText =
              style === 'ieee'
                ? `[${citCtx.ieeeNumberById.get(cit.id) || '?'}]`
                : formatCitationInTextAPA(cit);
            const bibHtml = style === 'ieee' ? formatCitationBibHtmlIEEE(cit) : formatCitationBibHtmlAPA(cit);
            return `
              <div class="border border-paper-border rounded-[4px] p-2 bg-paper-bg/60 space-y-1.5">
                <div class="flex items-center justify-between gap-1.5">
                  <span class="font-mono text-[10px] font-semibold text-ink-primary">[@${escapeHtml(cit.id)}] &middot; ${escapeHtml(inText)}</span>
                  <div class="flex items-center gap-1 shrink-0">
                    <button type="button" data-cit-insert="${escapeHtml(cit.id)}"
                      class="px-1.5 py-0.5 text-[10px] font-medium rounded-[3px] bg-white border border-paper-border hover:border-ink-primary text-ink-primary cursor-pointer">
                      Sisipkan
                    </button>
                    <button type="button" data-cit-delete="${escapeHtml(cit.id)}"
                      class="px-1.5 py-0.5 text-[10px] font-medium rounded-[3px] bg-white border border-ink-errBorder text-ink-err hover:bg-ink-errBg cursor-pointer">
                      Hapus
                    </button>
                  </div>
                </div>
                <div class="text-[11px] text-ink leading-snug">${bibHtml}</div>
              </div>
            `;
          })
          .join('');
      }
    }

    if (summaryEl) {
      if (!citations.length) {
        summaryEl.innerHTML = '<div class="text-[11px] text-ink-muted italic">Belum ada entri sitasi otomatis.</div>';
      } else if (style === 'ieee') {
        const autoEntries = citCtx.ieeeOrderIds
          .map((id) => {
            const cit = citCtx.mapById.get(id);
            if (!cit) return '';
            const num = citCtx.ieeeNumberById.get(id);
            return `<div class="leading-snug">[${num}] ${formatCitationBibHtmlIEEE(cit)}</div>`;
          })
          .filter(Boolean);
        summaryEl.innerHTML = autoEntries.join('');
      } else {
        const autoEntries = citations
          .map((cit) => {
            const html = formatCitationBibHtmlAPA(cit);
            return { sortKey: html.replace(/<[^>]+>/g, '').trim(), html };
          })
          .sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'id', { sensitivity: 'base' }))
          .map((item) => `<div class="leading-snug">${item.html}</div>`);
        summaryEl.innerHTML = autoEntries.join('');
      }
    }
  }

  function syncControlsFromState() {
    const f = state.format;
    const c = state.cover;
    const p = state.preface;

    document.getElementById('paper-size').value = f.paperSize;
    document.getElementById('margin-top').value = f.marginTop;
    document.getElementById('margin-left').value = f.marginLeft;
    document.getElementById('margin-bottom').value = f.marginBottom;
    document.getElementById('margin-right').value = f.marginRight;
    document.getElementById('font-family').value = f.fontFamily;
    document.getElementById('font-size').value = String(f.fontSize);
    document.getElementById('heading-font-size').value = String(f.headingFontSize);
    document.getElementById('line-spacing').value = String(f.lineSpacing);
    document.getElementById('first-indent').value = f.firstIndent;
    const sbEl = document.getElementById('space-before');
    const saEl = document.getElementById('space-after');
    const shEl = document.getElementById('toggle-spacing-headings');
    if (sbEl) sbEl.value = f.spaceBefore ?? 0;
    if (saEl) saEl.value = f.spaceAfter ?? 0;
    if (shEl) shEl.checked = Boolean(f.applySpacingToHeadings);

    document.querySelectorAll('input[name="textAlign"]').forEach((r) => {
      r.checked = r.value === (f.textAlign || 'justify');
    });

    document.getElementById('page-number-mode').value = f.pageNumberMode || 'skripsi';
    document.getElementById('page-num-desc').textContent =
      PAGE_NUM_MODE_DESCS[f.pageNumberMode] || PAGE_NUM_MODE_DESCS.skripsi;

    document.getElementById('toggle-margin-guides').checked = Boolean(f.showMarginGuides);
    document.getElementById('toggle-cover').checked = Boolean(f.showCover);
    const absToggle = document.getElementById('toggle-abstract');
    if (absToggle) absToggle.checked = Boolean(f.showAbstract);
    document.getElementById('toggle-preface').checked = Boolean(f.showPreface);
    document.getElementById('toggle-toc').checked = Boolean(f.showToc);
    document.getElementById('toggle-lot').checked = Boolean(f.showLot);
    document.getElementById('toggle-lof').checked = Boolean(f.showLof);

    const ab = state.abstract || { body: '', keywords: '' };
    const absBodyEl = document.getElementById('abstract-body');
    const absKwEl = document.getElementById('abstract-keywords');
    if (absBodyEl) absBodyEl.value = ab.body || '';
    if (absKwEl) absKwEl.value = ab.keywords || '';

    document.getElementById('cover-title').value = c.title || '';
    document.getElementById('cover-subtitle').value = c.subtitle || '';
    document.getElementById('cover-lecturer').value = c.lecturer || '';
    document.getElementById('cover-authors').value = c.authors || '';
    document.getElementById('cover-prodi').value = c.prodi || '';
    document.getElementById('cover-university').value = c.university || '';
    document.getElementById('cover-year').value = c.year || '';
    updateCoverLogoThumb();

    document.getElementById('preface-body').value = p.body || '';
    document.getElementById('preface-city-date').value = p.cityDate || '';
    document.getElementById('preface-signature').value = p.signature || '';

    document.getElementById('content-editor').value = state.content || '';
    document.getElementById('bib-manual-editor').value = state.manualBibliography || '';

    updateQuickMarginGuideBtnUI();
    updateCitationStyleUI();
    updateZoomControlsUI();
    setSidebarTab(state.ui.sidebarTab);
    setEditorSubTab(state.ui.editorTab);
    setGuidelineMode(state.ui.guidelineMode);
    setMobilePane(state.ui.mobilePane);
    updateCitationTypeFields();
  }

  // --- Modal Pembuat Tabel Bernomor ---
  let tableModalData = [
    ['Kolom 1', 'Kolom 2', 'Kolom 3'],
    ['Data 1A', 'Data 1B', 'Data 1C'],
    ['Data 2A', 'Data 2B', 'Data 2C'],
  ];

  function renderTableModalGrid() {
    const grid = document.getElementById('tm-grid');
    const dims = document.getElementById('tm-dims');
    const rows = tableModalData.length;
    const cols = tableModalData[0]?.length || 1;
    dims.innerHTML = `${rows} &times; ${cols}`;

    grid.innerHTML = tableModalData
      .map(
        (row, rIdx) => `
          <tr class="${rIdx === 0 ? 'bg-paper-bg' : 'bg-white'}">
            ${row
            .map(
              (cell, cIdx) => `
                <td class="border border-paper-border p-1">
                  <input type="text" data-r="${rIdx}" data-c="${cIdx}" value="${escapeHtml(cell)}"
                    class="tm-cell-input w-full px-1.5 py-1 text-[11.5px] bg-transparent outline-none focus:bg-paper-bg/60 ${rIdx === 0 ? 'font-semibold' : ''}" />
                </td>
              `
            )
            .join('')}
          </tr>
        `
      )
      .join('');
  }

  function openTableModal() {
    document.getElementById('tm-title').value = '';
    document.getElementById('tm-source').value = '';
    tableModalData = [
      ['Aspek', 'Keterangan', 'Catatan'],
      ['Item 1', 'Penjelasan singkat', '-'],
      ['Item 2', 'Penjelasan singkat', '-'],
    ];
    renderTableModalGrid();
    const modal = document.getElementById('table-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.getElementById('tm-title').focus();
  }

  function closeTableModal() {
    const modal = document.getElementById('table-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  // --- Modal Pembuat Gambar Bernomor ---
  let pendingFigureDataUrl = '';

  function renderFigureModalPreview(src) {
    const box = document.getElementById('fm-preview-box');
    if (!src) {
      box.innerHTML = 'Pratinjau gambar tampil di sini';
      return;
    }
    box.innerHTML = `<img src="${escapeHtml(src)}" alt="Pratinjau Gambar" class="max-h-44 max-w-full object-contain border border-paper-border rounded-[4px]" />`;
  }

  function openFigureModal() {
    pendingFigureDataUrl = '';
    document.getElementById('fm-title').value = '';
    document.getElementById('fm-source').value = '';
    document.getElementById('fm-url-input').value = '';
    document.getElementById('fm-file-input').value = '';
    document.querySelectorAll('input[name="fmWidth"]').forEach((r) => {
      r.checked = r.value === '75';
    });
    renderFigureModalPreview('');
    const modal = document.getElementById('figure-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.getElementById('fm-title').focus();
  }

  function closeFigureModal() {
    const modal = document.getElementById('figure-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  function fitPreviewToViewport(persist = true) {
    const viewport = document.getElementById('preview-viewport');
    if (!viewport || viewport.clientWidth <= 0) return;
    const paper = PAPER_SIZES[state.format.paperSize] || PAPER_SIZES.A4;
    const paperWpx = paper.widthCm * CM_TO_PX;
    const padPx = window.innerWidth < 640 ? 24 : 48;
    const availW = Math.max(200, viewport.clientWidth - padPx);
    const fitPct = Math.max(30, Math.min(130, Math.floor((availW / paperWpx) * 100)));
    state.ui.zoom = fitPct;
    updateZoomControlsUI();
    renderPreviewAndStats();
    if (persist) scheduleSave();
  }

  function applyGuidelineRulesToState(rules) {
    let applied = 0;
    rules.forEach((rule) => {
      if (Object.prototype.hasOwnProperty.call(state.format, rule.key)) {
        state.format[rule.key] = rule.value;
        applied++;
      }
    });
    syncControlsFromState();
    renderPreviewAndStats();
    scheduleSave();
    return applied;
  }

  function bindAllEvents() {
    // 1. Header Actions
    const openPedomanPanel = () => {
      setSidebarTab('pedoman');
      setMobilePane('sidebar');
      scheduleSave();
    };
    document.getElementById('header-compliance-btn').addEventListener('click', openPedomanPanel);
    document.getElementById('btn-header-pedoman').addEventListener('click', openPedomanPanel);

    document.getElementById('btn-demo-complete').addEventListener('click', () => {
      openConfirmModal(
        'Muat Contoh Makalah Berantakan?',
        'Isi editor saat ini akan diganti dengan contoh naskah makalah berantakan (lengkap dengan tabel, gambar, dan sitasi) untuk menguji fitur perapihan 1-klik.',
        () => {
          state.content = getMessyCompleteContent();
          if (!state.citations.length) state.citations = getSampleCitations();
          document.getElementById('content-editor').value = state.content;
          setEditorSubTab('body');
          setMobilePane('editor');
          renderPreviewAndStats();
          scheduleSave();
          showToast('Contoh makalah berantakan dimuat. Klik "Rapikan Semua" untuk merapikan otomatis.', 'info');
        }
      );
    });

    document.getElementById('btn-copy-clean').addEventListener('click', async () => {
      const cleaned = TextCleaner.cleanAll(state.content).text;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(cleaned);
          showToast('Teks makalah bersih berhasil disalin ke clipboard.', 'success');
          return;
        }
        throw new Error('Clipboard API tidak tersedia');
      } catch {
        const tmp = document.createElement('textarea');
        tmp.value = cleaned;
        tmp.setAttribute('readonly', '');
        tmp.style.position = 'fixed';
        tmp.style.top = '-9999px';
        tmp.style.opacity = '0';
        document.body.appendChild(tmp);
        tmp.select();
        const ok = document.execCommand('copy');
        tmp.remove();
        if (ok) {
          showToast('Teks makalah bersih berhasil disalin ke clipboard.', 'success');
        } else {
          showToast('Gagal menyalin otomatis. Pilih teks di editor lalu tekan Ctrl+C.', 'warning');
        }
      }
    });

    document.getElementById('btn-export-word').addEventListener('click', () => {
      exportToWord();
    });

    document.getElementById('btn-print-pdf').addEventListener('click', async () => {
      renderPreviewAndStats();
      // Jika LibreOffice headless tersedia di backend Python, gunakan konversi PDF native
      if (window.MakaRapiAPI) {
        try {
          const info = await window.MakaRapiAPI.detectBackend();
          if (info.online && info.pdfEngine === 'libreoffice') {
            showToast('Mengonversi PDF presisi via LibreOffice...', 'info');
            const doc = lastComputedDoc;
            const convertedSvgCache = {};
            for (const [id, svgStr] of Object.entries(BUILTIN_FIGURES)) {
              convertedSvgCache[id] = await svgStringToPngDataUrl(svgStr, 640, 240);
            }
            let coverLogoDataUrl = '';
            if (state.format.showCover) {
              const rawLogo = state.cover.logoDataUrl || sessionImagesMemory.__coverLogo || '';
              if (rawLogo && rawLogo.startsWith('data:image/')) coverLogoDataUrl = rawLogo;
              else if (state.cover.useDefaultEmblem) coverLogoDataUrl = await svgStringToPngDataUrl(DEFAULT_EMBLEM_SVG, 180, 180);
            }
            const resolveInlineHtml = (t) => formatTextWithCitations(t, doc.citCtx, doc.citStyle);
            const resolveFig = (b) => (b.id && convertedSvgCache[b.id]) || (b.id && (state.images[b.id] || sessionImagesMemory[b.id])) || (b.url && b.url.startsWith('data:image/') ? b.url : '');
            const pdfBlob = await window.MakaRapiAPI.exportPdf({
              format: state.format,
              paper: doc.paper,
              typo: doc.typo,
              cover: state.cover,
              abstract: state.abstract || { body: '', keywords: '' },
              preface: state.preface,
              coverLogoDataUrl,
              tocEntries: doc.tocEntries,
              lotEntries: doc.lotEntries,
              lofEntries: doc.lofEntries,
              chapters: doc.parsedBody.chapters.map((ch) => ({
                blocks: ch.blocks.map((block) => {
                  if (block.type === 'subbab' || block.type === 'subsubbab' || block.type === 'paragraph') return { ...block, html: resolveInlineHtml(block.text) };
                  if (block.type === 'list') return { ...block, items: (block.items || []).map((it) => ({ ...it, html: resolveInlineHtml(it.text) })) };
                  if (block.type === 'table') return { ...block, rows: (block.rows || []).map((r) => r.map((c) => resolveInlineHtml(c))) };
                  if (block.type === 'figure') return { ...block, dataUrl: resolveFig(block) };
                  return block;
                }),
              })),
              finalBib: doc.finalBib,
              citStyle: doc.citStyle,
            });
            if (pdfBlob) {
              const url = URL.createObjectURL(pdfBlob);
              const a = document.createElement('a');
              const safeName = (state.cover.title || 'Makalah_MakaRapi').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'makalah_makarapi';
              a.href = url;
              a.download = `${safeName}.pdf`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              setTimeout(() => URL.revokeObjectURL(url), 1500);
              showToast(`PDF berhasil diekspor sebagai ${safeName}.pdf (LibreOffice).`, 'success');
              return;
            }
          }
        } catch (err) {
          console.warn('Fallback ke cetak PDF browser:', err);
        }
      }
      window.print();
    });

    // 2. Navigasi Mobile & Tab Sidebar / Editor
    document.querySelectorAll('.mobile-pane-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        setMobilePane(btn.dataset.pane);
        scheduleSave();
      });
    });

    document.querySelectorAll('.sidebar-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        setSidebarTab(btn.dataset.sidebarTab);
        scheduleSave();
      });
    });

    document.querySelectorAll('.ed-subtab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        setEditorSubTab(btn.dataset.editorTab);
        scheduleSave();
      });
    });

    // 3. Tab 1: Format Akademik
    const bindFormatInput = (id, key, parser = (v) => v) => {
      const el = document.getElementById(id);
      if (!el) return;
      const evName = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
      el.addEventListener(evName, () => {
        const val = el.type === 'checkbox' ? el.checked : parser(el.value);
        if (typeof val === 'number' && Number.isNaN(val)) return;
        state.format[key] = val;
        if (key === 'pageNumberMode') {
          document.getElementById('page-num-desc').textContent =
            PAGE_NUM_MODE_DESCS[val] || PAGE_NUM_MODE_DESCS.skripsi;
        }
        if (key === 'showMarginGuides') updateQuickMarginGuideBtnUI();
        scheduleRender();
        scheduleSave();
      });
      if (el.type === 'number') {
        el.addEventListener('blur', () => {
          el.value = state.format[key];
        });
      }
    };

    bindFormatInput('paper-size', 'paperSize');
    bindFormatInput('margin-top', 'marginTop', (v) => Math.max(0.5, Math.min(8, parseFloat(v))));
    bindFormatInput('margin-left', 'marginLeft', (v) => Math.max(0.5, Math.min(8, parseFloat(v))));
    bindFormatInput('margin-bottom', 'marginBottom', (v) => Math.max(0.5, Math.min(8, parseFloat(v))));
    bindFormatInput('margin-right', 'marginRight', (v) => Math.max(0.5, Math.min(8, parseFloat(v))));
    bindFormatInput('font-family', 'fontFamily');
    bindFormatInput('font-size', 'fontSize', (v) => parseInt(v, 10));
    bindFormatInput('heading-font-size', 'headingFontSize', (v) => parseInt(v, 10));
    bindFormatInput('line-spacing', 'lineSpacing', (v) => parseFloat(v));
    bindFormatInput('first-indent', 'firstIndent', (v) => Math.max(0, Math.min(2.5, parseFloat(v))));
    bindFormatInput('space-before', 'spaceBefore', (v) => Math.max(0, Math.min(36, parseFloat(v))));
    bindFormatInput('space-after', 'spaceAfter', (v) => Math.max(0, Math.min(36, parseFloat(v))));
    bindFormatInput('toggle-spacing-headings', 'applySpacingToHeadings');
    bindFormatInput('page-number-mode', 'pageNumberMode');
    bindFormatInput('toggle-margin-guides', 'showMarginGuides');
    bindFormatInput('toggle-cover', 'showCover');
    bindFormatInput('toggle-abstract', 'showAbstract');
    bindFormatInput('toggle-preface', 'showPreface');
    bindFormatInput('toggle-toc', 'showToc');
    bindFormatInput('toggle-lot', 'showLot');
    bindFormatInput('toggle-lof', 'showLof');

    document.querySelectorAll('input[name="textAlign"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        state.format.textAlign = radio.value;
        scheduleRender();
        scheduleSave();
      });
    });

    // Identitas Cover & Kata Pengantar
    const bindNestedInput = (id, group, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        state[group][key] = el.value;
        scheduleRender();
        scheduleSave();
      });
    };

    bindNestedInput('cover-title', 'cover', 'title');
    bindNestedInput('cover-subtitle', 'cover', 'subtitle');
    bindNestedInput('cover-lecturer', 'cover', 'lecturer');
    bindNestedInput('cover-authors', 'cover', 'authors');
    bindNestedInput('cover-prodi', 'cover', 'prodi');
    bindNestedInput('cover-university', 'cover', 'university');
    bindNestedInput('cover-year', 'cover', 'year');
    bindNestedInput('abstract-body', 'abstract', 'body');
    bindNestedInput('abstract-keywords', 'abstract', 'keywords');
    bindNestedInput('preface-body', 'preface', 'body');
    bindNestedInput('preface-city-date', 'preface', 'cityDate');
    bindNestedInput('preface-signature', 'preface', 'signature');

    document.getElementById('cover-logo-input').addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        state.cover.logoDataUrl = String(reader.result || '');
        sessionImagesMemory.__coverLogo = state.cover.logoDataUrl;
        state.cover.useDefaultEmblem = false;
        updateCoverLogoThumb();
        scheduleRender();
        scheduleSave();
        showToast('Logo institusi berhasil diperbarui.', 'success');
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    });

    document.getElementById('btn-default-emblem').addEventListener('click', () => {
      state.cover.logoDataUrl = '';
      delete sessionImagesMemory.__coverLogo;
      state.cover.useDefaultEmblem = true;
      updateCoverLogoThumb();
      scheduleRender();
      scheduleSave();
      showToast('Emblem default institusi diaktifkan.', 'info');
    });

    document.getElementById('btn-remove-logo').addEventListener('click', () => {
      state.cover.logoDataUrl = '';
      delete sessionImagesMemory.__coverLogo;
      state.cover.useDefaultEmblem = false;
      updateCoverLogoThumb();
      scheduleRender();
      scheduleSave();
      showToast('Logo halaman cover dihapus.', 'info');
    });

    document.getElementById('btn-reset-doc').addEventListener('click', () => {
      openConfirmModal(
        'Reset Seluruh Dokumen?',
        'Seluruh pengaturan format, isi makalah, daftar sitasi, dan profil pedoman akan dikembalikan ke kondisi awal.',
        () => {
          localStorage.removeItem(STORAGE_KEY);
          sessionImagesMemory = {};
          pendingExtractedGuideline = null;
          state = getDefaultCleanState();
          document.getElementById('guideline-results-section').classList.add('hidden');
          document.getElementById('guideline-error-box').classList.add('hidden');
          syncControlsFromState();
          renderPreviewAndStats();
          scheduleSave();
          showToast('Dokumen berhasil dikembalikan ke pengaturan awal.', 'success');
        }
      );
    });

    // 4. Tab 2: Impor Pedoman & Audit Kepatuhan
    document.querySelectorAll('.gmode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        setGuidelineMode(btn.dataset.gmode);
        scheduleSave();
      });
    });

    const dropzone = document.getElementById('guideline-dropzone');
    const fileInput = document.getElementById('guideline-file-input');

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('border-ink-primary', 'bg-paper-bg');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('border-ink-primary', 'bg-paper-bg');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-ink-primary', 'bg-paper-bg');
      const file = e.dataTransfer?.files?.[0];
      if (file) handleGuidelineFileUpload(file);
    });
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handleGuidelineFileUpload(file);
      e.target.value = '';
    });

    document.getElementById('btn-analyze-guideline-text').addEventListener('click', () => {
      const raw = document.getElementById('guideline-text-input').value.trim();
      if (!raw) {
        showToast('Tempel teks aturan pedoman terlebih dahulu.', 'warning');
        return;
      }
      const rules = parseGuidelineRules(raw);
      showGuidelineExtractionResults('Teks Pedoman Manual', rules);
      if (rules.length) {
        showToast(`Berhasil mendeteksi ${rules.length} aturan dari teks pedoman.`, 'success');
      }
    });

    document.querySelectorAll('.sample-guideline-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sample = SAMPLE_GUIDELINES[btn.dataset.sampleGuideline];
        if (!sample) return;
        setGuidelineMode('text');
        document.getElementById('guideline-text-input').value = sample.text;
        const rules = parseGuidelineRules(sample.text);
        showGuidelineExtractionResults(sample.name, rules);
        showToast(`Contoh "${sample.name}" dianalisis (${rules.length} aturan).`, 'info');
      });
    });

    document.getElementById('guideline-rules-list').addEventListener('change', (e) => {
      const chk = e.target.closest('.guideline-rule-chk');
      if (!chk || !pendingExtractedGuideline) return;
      const idx = parseInt(chk.dataset.ruleIdx, 10);
      if (!Number.isNaN(idx) && pendingExtractedGuideline.rules[idx]) {
        pendingExtractedGuideline.rules[idx].selected = chk.checked;
      }
    });

    document.getElementById('btn-apply-selected-rules').addEventListener('click', () => {
      if (!pendingExtractedGuideline) return;
      const selectedRules = pendingExtractedGuideline.rules.filter((r) => r.selected);
      if (!selectedRules.length) {
        showToast('Pilih minimal satu aturan pedoman untuk diterapkan.', 'warning');
        return;
      }
      state.guidelineProfile = {
        name: pendingExtractedGuideline.name,
        rules: selectedRules.map(({ key, label, value, displayValue }) => ({
          key,
          label,
          value,
          displayValue,
        })),
      };
      const applied = applyGuidelineRulesToState(selectedRules);
      document.getElementById('guideline-results-section').classList.add('hidden');
      pendingExtractedGuideline = null;
      showToast(`${applied} aturan pedoman diterapkan & audit kepatuhan aktif.`, 'success');
    });

    document.getElementById('btn-dismiss-results').addEventListener('click', () => {
      document.getElementById('guideline-results-section').classList.add('hidden');
      pendingExtractedGuideline = null;
    });

    document.getElementById('btn-reapply-guideline').addEventListener('click', () => {
      if (!state.guidelineProfile?.rules?.length) return;
      const applied = applyGuidelineRulesToState(state.guidelineProfile.rules);
      showToast(`${applied} aturan disesuaikan kembali ke profil pedoman aktif.`, 'success');
    });

    document.getElementById('btn-clear-guideline').addEventListener('click', () => {
      state.guidelineProfile = null;
      updateComplianceAuditUI();
      scheduleSave();
      showToast('Profil pedoman aktif dihapus.', 'info');
    });

    // 5. Tab 3: Sitasi Otomatis (APA & IEEE)
    document.querySelectorAll('.cit-style-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.format.citationStyle = btn.dataset.citStyle === 'ieee' ? 'ieee' : 'apa';
        updateCitationStyleUI();
        updateCitationLivePreview();
        renderPreviewAndStats();
        scheduleSave();
        showToast(
          `Gaya sitasi diubah ke ${state.format.citationStyle === 'ieee' ? 'IEEE Style' : 'APA 7th Ed.'}.`,
          'info'
        );
      });
    });

    document.getElementById('cit-type').addEventListener('change', updateCitationTypeFields);
    document.getElementById('citation-form').addEventListener('input', updateCitationLivePreview);

    document.getElementById('citation-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const draft = readCitationFormDraft();
      if (!draft.authors || !draft.year || !draft.title) {
        showToast('Lengkapi nama penulis, tahun, dan judul karya.', 'warning');
        return;
      }
      const nextNum = (state.citations || []).reduce((max, c) => {
        const m = String(c.id || '').match(/^ref(\d+)$/);
        return m ? Math.max(max, parseInt(m[1], 10)) : max;
      }, 0) + 1;

      const newCit = { ...draft, id: `ref${nextNum}` };
      state.citations.push(newCit);
      e.target.reset();
      updateCitationTypeFields();
      setEditorSubTab('body');
      insertAtEditorCursor(` [@${newCit.id}]`);
      renderPreviewAndStats();
      scheduleSave();
      showToast(`Referensi [@${newCit.id}] disimpan & disisipkan ke editor.`, 'success');
    });

    document.getElementById('managed-citations-list').addEventListener('click', (e) => {
      const insBtn = e.target.closest('[data-cit-insert]');
      if (insBtn) {
        const id = insBtn.dataset.citInsert;
        setEditorSubTab('body');
        insertAtEditorCursor(` [@${id}]`);
        showToast(`Sitasi [@${id}] disisipkan ke posisi kursor.`, 'info');
        return;
      }
      const delBtn = e.target.closest('[data-cit-delete]');
      if (delBtn) {
        const id = delBtn.dataset.citDelete;
        state.citations = (state.citations || []).filter((c) => c.id !== id);
        renderPreviewAndStats();
        scheduleSave();
        showToast(`Referensi [@${id}] dihapus.`, 'info');
      }
    });

    // 6. Tab 4: Navigasi Garis Besar Dokumen (Outline)
    document.getElementById('document-outline-list').addEventListener('click', (e) => {
      const btn = e.target.closest('.outline-jump-btn');
      if (!btn || !lastComputedDoc) return;
      const idx = parseInt(btn.dataset.outlineIdx, 10);
      if (!Number.isNaN(idx)) jumpToOutlineItem(lastComputedDoc.outlineItems[idx]);
    });

    // 7. Editor Naskah & Toolbar Perapihan 1-Klik
    document.getElementById('content-editor').addEventListener('input', (e) => {
      state.content = e.target.value;
      scheduleRender();
      scheduleSave();
    });

    document.getElementById('bib-manual-editor').addEventListener('input', (e) => {
      state.manualBibliography = e.target.value;
      scheduleRender();
      scheduleSave();
    });

    document.getElementById('btn-sort-manual-bib').addEventListener('click', () => {
      const lines = (state.manualBibliography || '')
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }));
      state.manualBibliography = lines.join('\n');
      document.getElementById('bib-manual-editor').value = state.manualBibliography;
      scheduleRender();
      scheduleSave();
      showToast('Daftar pustaka manual diurutkan A–Z.', 'success');
    });

    const contentUndoStack = [];
    const updateUndoCleanButton = () => {
      const undoBtn = document.getElementById('btn-undo-clean');
      if (!undoBtn) return;
      const hasUndo = contentUndoStack.length > 0;
      undoBtn.classList.toggle('hidden', !hasUndo);
      if (hasUndo) {
        const top = contentUndoStack[contentUndoStack.length - 1];
        undoBtn.title = `Batalkan "${top.label}"`;
      }
    };
    const pushContentUndo = (label) => {
      contentUndoStack.push({ content: state.content, label });
      if (contentUndoStack.length > 10) contentUndoStack.shift();
      updateUndoCleanButton();
    };
    window.__makarapiPushContentUndo = pushContentUndo;

    const undoCleanBtn = document.getElementById('btn-undo-clean');
    if (undoCleanBtn) {
      undoCleanBtn.addEventListener('click', () => {
        const prev = contentUndoStack.pop();
        if (!prev) return;
        setEditorSubTab('body');
        state.content = prev.content;
        document.getElementById('content-editor').value = state.content;
        renderPreviewAndStats();
        scheduleSave();
        updateUndoCleanButton();
        showToast(`Aksi "${prev.label}" dibatalkan.`, 'info');
      });
    }

    // Panduan singkat tag format editor (tampil 1x untuk pengguna baru, dapat dibuka ulang via tombol ?)
    const HELP_DISMISS_KEY = 'makarapi_editor_help_dismissed_v1';
    const helpStrip = document.getElementById('editor-help-strip');
    const helpBtn = document.getElementById('btn-editor-help');
    const closeHelpBtn = document.getElementById('btn-close-editor-help');
    if (helpStrip) {
      let dismissed = false;
      try { dismissed = localStorage.getItem(HELP_DISMISS_KEY) === '1'; } catch { }
      if (!dismissed) helpStrip.classList.remove('hidden');
      if (helpBtn) {
        helpBtn.addEventListener('click', () => {
          helpStrip.classList.toggle('hidden');
        });
      }
      if (closeHelpBtn) {
        closeHelpBtn.addEventListener('click', () => {
          helpStrip.classList.add('hidden');
          try { localStorage.setItem(HELP_DISMISS_KEY, '1'); } catch { }
        });
      }
    }

    const applyCleanResult = (newText, count, label) => {
      if (count > 0 && newText !== state.content) {
        pushContentUndo(label);
      }
      state.content = newText;
      document.getElementById('content-editor').value = newText;
      renderPreviewAndStats();
      scheduleSave();
      if (count > 0) {
        showToast(`${label}: ${count} perbaikan diterapkan.`, 'success');
      } else {
        showToast(`${label}: naskah sudah rapi.`, 'info');
      }
    };

    document.getElementById('btn-clean-all').addEventListener('click', () => {
      const res = TextCleaner.cleanAll(state.content);
      applyCleanResult(res.text, res.totalCount, 'Rapikan Semua');
    });

    document.getElementById('btn-clean-md').addEventListener('click', () => {
      const res = TextCleaner.cleanAIMarkdown(state.content);
      applyCleanResult(res.text, res.count, 'Bersihkan AI/MD');
    });

    document.getElementById('btn-fix-pdf').addEventListener('click', () => {
      const res = TextCleaner.fixBrokenLines(state.content);
      applyCleanResult(res.text, res.count, 'Sambung Baris PDF');
    });

    document.getElementById('btn-clean-space').addEventListener('click', () => {
      const res = TextCleaner.cleanSpacesAndPunctuation(state.content);
      applyCleanResult(res.text, res.count, 'Spasi & Tanda Baca');
    });

    // Grup Sisip Elemen Cepat
    document.getElementById('btn-ins-bab').addEventListener('click', () => {
      setEditorSubTab('body');
      const existingBabs = (state.content.match(/^BAB\s+/gim) || []).length;
      const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
      const nextRoman = romans[existingBabs] || String(existingBabs + 1);
      insertAtEditorCursor(`\n\nBAB ${nextRoman}\nJUDUL BAB BARU\n\n`);
    });

    document.getElementById('btn-ins-subbab').addEventListener('click', () => {
      setEditorSubTab('body');
      insertAtEditorCursor('\n\nA. Judul Sub-bab Baru\nTuliskan uraian paragraf di sini.\n');
    });

    document.getElementById('btn-ins-table').addEventListener('click', openTableModal);
    document.getElementById('btn-ins-figure').addEventListener('click', openFigureModal);

    document.getElementById('btn-ins-citation').addEventListener('click', () => {
      setSidebarTab('citation');
      setMobilePane('sidebar');
      document.getElementById('cit-authors')?.focus();
      scheduleSave();
    });

    // 8. Kontrol Pratinjau (Margin & Zoom)
    document.getElementById('btn-quick-margin-guide').addEventListener('click', () => {
      state.format.showMarginGuides = !state.format.showMarginGuides;
      document.getElementById('toggle-margin-guides').checked = state.format.showMarginGuides;
      updateQuickMarginGuideBtnUI();
      renderPreviewAndStats();
      scheduleSave();
    });

    document.querySelectorAll('.zoom-preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.ui.zoom = parseInt(btn.dataset.zoom, 10) || 75;
        updateZoomControlsUI();
        renderPreviewAndStats();
        scheduleSave();
      });
    });

    document.getElementById('btn-zoom-fit').addEventListener('click', () => fitPreviewToViewport(true));

    let resizeFitTimer = null;
    window.addEventListener('resize', () => {
      if (window.innerWidth >= 1024 || state.ui.mobilePane !== 'preview') return;
      clearTimeout(resizeFitTimer);
      resizeFitTimer = setTimeout(() => fitPreviewToViewport(false), 120);
    });

    // 9. Event Modal Tabel Bernomor
    document.getElementById('tm-grid').addEventListener('input', (e) => {
      const inp = e.target.closest('.tm-cell-input');
      if (!inp) return;
      const r = parseInt(inp.dataset.r, 10);
      const c = parseInt(inp.dataset.c, 10);
      if (tableModalData[r]) tableModalData[r][c] = inp.value;
    });

    document.getElementById('tm-add-row').addEventListener('click', () => {
      const cols = tableModalData[0]?.length || 3;
      tableModalData.push(Array(cols).fill(''));
      renderTableModalGrid();
    });

    document.getElementById('tm-del-row').addEventListener('click', () => {
      if (tableModalData.length <= 2) {
        showToast('Tabel minimal memiliki 2 baris (header + 1 data).', 'warning');
        return;
      }
      tableModalData.pop();
      renderTableModalGrid();
    });

    document.getElementById('tm-add-col').addEventListener('click', () => {
      tableModalData.forEach((row, idx) => row.push(idx === 0 ? `Kolom ${row.length + 1}` : ''));
      renderTableModalGrid();
    });

    document.getElementById('tm-del-col').addEventListener('click', () => {
      if ((tableModalData[0]?.length || 0) <= 2) {
        showToast('Tabel minimal memiliki 2 kolom.', 'warning');
        return;
      }
      tableModalData.forEach((row) => row.pop());
      renderTableModalGrid();
    });

    document.getElementById('table-modal-close').addEventListener('click', closeTableModal);
    document.getElementById('table-modal-cancel').addEventListener('click', closeTableModal);
    document.getElementById('table-modal').addEventListener('click', (e) => {
      if (e.target.id === 'table-modal') closeTableModal();
    });

    document.getElementById('table-modal-insert').addEventListener('click', () => {
      const title = document.getElementById('tm-title').value.trim() || 'Tabel Data Makalah';
      const source = document.getElementById('tm-source').value.trim();
      const rowsText = tableModalData
        .map((row) => row.map((cell) => String(cell || '').replace(/\|/g, '/').trim()).join(' | '))
        .join('\n');
      const sourceAttr = source ? ` sumber="${source.replace(/"/g, "'")}"` : '';
      const snippet = `\n\n[TABEL judul="${title.replace(/"/g, "'")}"${sourceAttr}]\n${rowsText}\n[/TABEL]\n\n`;
      setEditorSubTab('body');
      insertAtEditorCursor(snippet);
      closeTableModal();
      showToast('Tabel bernomor berhasil disisipkan.', 'success');
    });

    // 10. Event Modal Gambar Bernomor
    document.getElementById('fm-file-input').addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        pendingFigureDataUrl = String(reader.result || '');
        document.getElementById('fm-url-input').value = '';
        renderFigureModalPreview(pendingFigureDataUrl);
      };
      reader.readAsDataURL(file);
    });

    document.getElementById('fm-url-input').addEventListener('input', (e) => {
      const url = e.target.value.trim();
      if (url) {
        pendingFigureDataUrl = '';
        renderFigureModalPreview(url);
      } else {
        renderFigureModalPreview(pendingFigureDataUrl);
      }
    });

    document.getElementById('figure-modal-close').addEventListener('click', closeFigureModal);
    document.getElementById('figure-modal-cancel').addEventListener('click', closeFigureModal);
    document.getElementById('figure-modal').addEventListener('click', (e) => {
      if (e.target.id === 'figure-modal') closeFigureModal();
    });

    document.getElementById('figure-modal-insert').addEventListener('click', () => {
      const title = document.getElementById('fm-title').value.trim() || 'Ilustrasi Makalah';
      const source = document.getElementById('fm-source').value.trim();
      const url = document.getElementById('fm-url-input').value.trim();
      const width = document.querySelector('input[name="fmWidth"]:checked')?.value || '75';

      if (!pendingFigureDataUrl && !url) {
        showToast('Unggah gambar lokal atau masukkan URL gambar terlebih dahulu.', 'warning');
        return;
      }

      let mediaAttr = '';
      if (pendingFigureDataUrl) {
        const imgId = `img_${Date.now().toString(36)}`;
        state.images[imgId] = pendingFigureDataUrl;
        sessionImagesMemory[imgId] = pendingFigureDataUrl;
        mediaAttr = `id="${imgId}"`;
      } else {
        mediaAttr = `url="${url.replace(/"/g, "'")}"`;
      }

      const sourceAttr = source ? ` sumber="${source.replace(/"/g, "'")}"` : '';
      const snippet = `\n\n[GAMBAR ${mediaAttr} judul="${title.replace(/"/g, "'")}"${sourceAttr} lebar="${width}"]\n\n`;
      setEditorSubTab('body');
      insertAtEditorCursor(snippet);
      closeFigureModal();
      showToast('Gambar bernomor berhasil disisipkan.', 'success');
    });

    // 11. Event Modal Konfirmasi & Tombol Escape
    document.getElementById('confirm-cancel').addEventListener('click', closeConfirmModal);
    document.getElementById('confirm-modal').addEventListener('click', (e) => {
      if (e.target.id === 'confirm-modal') closeConfirmModal();
    });
    document.getElementById('confirm-ok').addEventListener('click', () => {
      const cb = confirmCallback;
      closeConfirmModal();
      if (typeof cb === 'function') cb();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeConfirmModal();
        closeTableModal();
        closeFigureModal();
      }
    });
  }

  // =====================================================================
  // 11. HANDOFF IMPOR DARI MENU UTAMA (home.html) & INISIALISASI APLIKASI
  // =====================================================================
  const HANDOFF_KEY = 'rapimakalah_pro_import_handoff_v1';
  const WINDOW_NAME_PREFIX = 'RAPIMAKALAH_HANDOFF:';

  function consumeHomeImportHandoff() {
    let raw = null;
    try {
      raw = sessionStorage.getItem(HANDOFF_KEY);
      if (raw) sessionStorage.removeItem(HANDOFF_KEY);
    } catch {
      // Abaikan jika sessionStorage dibatasi
    }
    if (!raw) {
      try {
        raw = localStorage.getItem(HANDOFF_KEY);
        if (raw) localStorage.removeItem(HANDOFF_KEY);
      } catch {
        // Abaikan
      }
    } else {
      try { localStorage.removeItem(HANDOFF_KEY); } catch { }
    }
    if (!raw && typeof window.name === 'string' && window.name.startsWith(WINDOW_NAME_PREFIX)) {
      raw = window.name.slice(WINDOW_NAME_PREFIX.length);
      window.name = '';
    } else if (typeof window.name === 'string' && window.name.startsWith(WINDOW_NAME_PREFIX)) {
      window.name = '';
    }

    if (!raw) return null;

    try {
      const payload = JSON.parse(raw);
      if (!payload || typeof payload !== 'object') return null;

      // 1. Terapkan mode konten (impor file / kosong / contoh)
      let toastMsg = '';
      if (payload.mode === 'import-file' && typeof payload.content === 'string') {
        const preservedFormat = { ...state.format };
        const fresh = getDefaultCleanState();
        state = {
          ...fresh,
          format: {
            ...preservedFormat,
            showAbstract: Boolean(payload.abstractBody),
            showPreface: Boolean(payload.prefaceBody),
            showLot: (payload.tableCount || 0) > 0,
            showLof: (payload.figureCount || 0) > 0,
          },
          abstract: {
            body: payload.abstractBody || '',
            keywords: payload.abstractKeywords || '',
          },
          cover: {
            title: payload.detectTitle && payload.suggestedTitle ? payload.suggestedTitle : 'JUDUL MAKALAH',
            subtitle: '',
            lecturer: '',
            authors: '',
            prodi: '',
            university: '',
            year: String(new Date().getFullYear()),
            logoDataUrl: payload.coverLogoDataUrl || '',
            useDefaultEmblem: !payload.coverLogoDataUrl,
          },
          preface: {
            body: payload.prefaceBody || '',
            cityDate: '',
            signature: 'Penyusun',
          },
          citations: [],
          manualBibliography: payload.bibliography || '',
          images: {},
          importMeta: {
            hasEquations: Boolean(payload.importMeta?.hasEquations),
            hasFootnotes: Boolean(payload.importMeta?.hasFootnotes),
          },
        };

        if (payload.coverLogoDataUrl) {
          sessionImagesMemory.__coverLogo = payload.coverLogoDataUrl;
        }
        if (payload.images && typeof payload.images === 'object') {
          Object.entries(payload.images).forEach(([k, v]) => {
            if (typeof v === 'string' && v) {
              state.images[k] = v;
              sessionImagesMemory[k] = v;
              ensureImageAspectCached(v);
            }
          });
        }

        let importedText = payload.content;
        let cleanCount = 0;
        if (payload.autoClean) {
          const res = TextCleaner.cleanAll(importedText);
          importedText = res.text;
          cleanCount = res.totalCount;
        }
        state.content = importedText;
        state.ui.editorTab = 'body';
        state.ui.mobilePane = 'editor';

        const fullWordsText = [state.preface.body, importedText, state.manualBibliography].filter(Boolean).join(' ');
        const wc = fullWordsText.trim() ? fullWordsText.trim().split(/\s+/).filter(Boolean).length : 0;
        const extras = [];
        if (payload.tableCount > 0) extras.push(`${payload.tableCount} tabel`);
        if (payload.figureCount > 0) extras.push(`${payload.figureCount} gambar`);
        if (payload.bibliography) extras.push('Daftar Pustaka');
        const extraNote = extras.length ? ` (${extras.join(', ')})` : '';
        toastMsg = cleanCount > 0
          ? `Dokumen "${payload.fileName}" dimuat${extraNote} — ${wc.toLocaleString('id-ID')} kata & ${cleanCount} perbaikan otomatis.`
          : `Dokumen "${payload.fileName}" berhasil dimuat${extraNote} (${wc.toLocaleString('id-ID')} kata).`;
      } else if (payload.mode === 'blank') {
        state = getDefaultCleanState();
        state.content = 'BAB I\nPENDAHULUAN\n\nA. Latar Belakang\nMulai tulis atau tempel isi makalah Anda di sini.\n';
        state.cover.title = 'JUDUL MAKALAH AKADEMIK';
        state.citations = [];
        state.manualBibliography = '';
        state.ui.editorTab = 'body';
        toastMsg = 'Lembar kerja baru siap digunakan.';
      } else if (payload.mode === 'sample') {
        state = getDefaultCleanState();
        state.ui.editorTab = 'body';
        toastMsg = 'Contoh makalah lengkap berhasil dimuat.';
      }

      // 2. Terapkan pedoman opsional (dari database SQLite, file unggahan, atau template cepat)
      if (payload.guidelineDbProfile && Array.isArray(payload.guidelineDbProfile.rules) && payload.guidelineDbProfile.rules.length) {
        payload.guidelineDbProfile.rules.forEach((rule) => {
          if (Object.prototype.hasOwnProperty.call(state.format, rule.key)) {
            state.format[rule.key] = rule.value;
          }
        });
        state.guidelineProfile = {
          name: payload.guidelineDbProfile.name || 'Pedoman Database',
          rules: payload.guidelineDbProfile.rules.map(({ key, label, value, displayValue }) => ({
            key,
            label,
            value,
            displayValue,
          })),
        };
      } else {
        let gSourceName = '';
        let gRawText = '';
        if (payload.guidelineFile && payload.guidelineFile.text) {
          gSourceName = payload.guidelineFile.name || 'Pedoman Unggahan';
          gRawText = payload.guidelineFile.text;
        } else if (payload.guidelineSample && SAMPLE_GUIDELINES[payload.guidelineSample]) {
          gSourceName = SAMPLE_GUIDELINES[payload.guidelineSample].name;
          gRawText = SAMPLE_GUIDELINES[payload.guidelineSample].text;
        }

        if (gRawText) {
          const rules = parseGuidelineRules(gRawText);
          if (rules.length) {
            rules.forEach((rule) => {
              if (Object.prototype.hasOwnProperty.call(state.format, rule.key)) {
                state.format[rule.key] = rule.value;
              }
            });
            state.guidelineProfile = {
              name: gSourceName,
              rules: rules.map(({ key, label, value, displayValue }) => ({
                key,
                label,
                value,
                displayValue,
              })),
            };
          }
        }
      }

      scheduleSave();
      return toastMsg;
    } catch (err) {
      console.warn('Gagal memproses impor dari Menu Utama:', err);
      return null;
    }
  }

  async function updateWorkbenchEngineBadge() {
    const dot = document.getElementById('wb-engine-dot');
    const label = document.getElementById('wb-engine-label');
    if (!dot || !label || !window.MakaRapiAPI) return;
    const info = await window.MakaRapiAPI.detectBackend();
    if (info.online) {
      dot.classList.remove('bg-paper-borderStrong');
      dot.classList.add('bg-ink-ok');
      label.textContent = 'Python API';
      refreshSavedGuidelinesDbUI();
    } else {
      dot.classList.remove('bg-ink-ok');
      dot.classList.add('bg-paper-borderStrong');
      label.textContent = 'Browser';
    }
  }

  function bindHybridExtraEvents() {
    const saveDbBtn = document.getElementById('btn-save-guideline-db');
    if (saveDbBtn) {
      saveDbBtn.addEventListener('click', async () => {
        if (!state.guidelineProfile || !Array.isArray(state.guidelineProfile.rules) || !state.guidelineProfile.rules.length) {
          showToast('Belum ada profil pedoman aktif untuk disimpan.', 'warning');
          return;
        }
        try {
          const saved = await window.MakaRapiAPI.saveGuideline({
            name: state.guidelineProfile.name,
            rules: state.guidelineProfile.rules,
          });
          if (saved) {
            await refreshSavedGuidelinesDbUI();
            showToast(`Profil "${saved.name}" tersimpan permanen di SQLite.`, 'success');
          }
        } catch (err) {
          showToast(err?.message || 'Gagal menyimpan profil pedoman ke database.', 'error');
        }
      });
    }

    const dlReportBtn = document.getElementById('btn-download-readiness-report');
    if (dlReportBtn) {
      dlReportBtn.addEventListener('click', () => {
        const text = lastReadinessReportText || auditReadinessLocally().reportText;
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'laporan_audit_makarapi.txt';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast('Laporan audit kelayakan diunduh.', 'success');
      });
    }

    const runSeparateLint = async ({ label, fixKbbi, italicizeForeign, emptyMsg, successFmt }) => {
      setEditorSubTab('body');
      let res = null;
      try {
        if (window.MakaRapiAPI) {
          const info = await window.MakaRapiAPI.detectBackend();
          if (info.online) {
            res = await window.MakaRapiAPI.lintAcademic({
              text: state.content,
              fixKbbi,
              italicizeForeign,
            });
          }
        }
      } catch {
        // Fallback ke JS lokal
      }
      if (!res) res = TextCleaner.lintAcademic(state.content, { fixKbbi, italicizeForeign });
      if (res.totalCount === 0) {
        showToast(emptyMsg, 'info');
        return;
      }
      if (res.text !== state.content && typeof window.__makarapiPushContentUndo === 'function') {
        window.__makarapiPushContentUndo(label || 'Perapihan');
      }
      state.content = res.text;
      document.getElementById('content-editor').value = state.content;
      renderPreviewAndStats();
      scheduleSave();
      showToast(successFmt(res), 'success');
    };

    const kbbiBtn = document.getElementById('btn-lint-kbbi');
    if (kbbiBtn) {
      kbbiBtn.addEventListener('click', () =>
        runSeparateLint({
          label: 'Kata Baku',
          fixKbbi: true,
          italicizeForeign: false,
          emptyMsg: 'Tidak ditemukan kata tidak baku KBBI.',
          successFmt: (r) => `${r.kbbiCount} kata tidak baku KBBI berhasil diperbaiki.`,
        })
      );
    }

    const foreignBtn = document.getElementById('btn-lint-foreign');
    if (foreignBtn) {
      foreignBtn.addEventListener('click', () =>
        runSeparateLint({
          label: 'Italic Asing',
          fixKbbi: false,
          italicizeForeign: true,
          emptyMsg: 'Tidak ditemukan istilah asing baru yang perlu dimiringkan.',
          successFmt: (r) => `${r.foreignCount} istilah asing berhasil dimiringkan (italic).`,
        })
      );
    }

    // Sinkronisasi Cloud Supabase (Auth + RLS Draft Sync)
    bindCloudAccountEvents();
  }

  function bindCloudAccountEvents() {
    const modal = document.getElementById('cloud-modal');
    const openBtn = document.getElementById('btn-cloud-account');
    const closeBtn = document.getElementById('cloud-modal-close');
    const dot = document.getElementById('cloud-account-dot');
    const label = document.getElementById('cloud-account-label');
    if (!modal || !openBtn || !window.MakaRapiCloud) return;

    const viewCfg = document.getElementById('cloud-view-config');
    const viewAuth = document.getElementById('cloud-view-auth');
    const viewIn = document.getElementById('cloud-view-signedin');
    const cfgUrl = document.getElementById('cloud-cfg-url');
    const cfgKey = document.getElementById('cloud-cfg-key');
    const cfgApi = document.getElementById('cloud-cfg-api');
    const emailEl = document.getElementById('cloud-auth-email');
    const passEl = document.getElementById('cloud-auth-pass');
    const authSubmitBtn = document.getElementById('btn-cloud-auth-submit');
    const tabLogin = document.getElementById('cloud-tab-login');
    const tabSignup = document.getElementById('cloud-tab-signup');
    const draftsList = document.getElementById('cloud-drafts-list');
    const userEmailEl = document.getElementById('cloud-user-email');

    let authMode = 'login';
    let cachedDrafts = [];

    const showCloudPanel = (name) => {
      viewCfg.classList.toggle('hidden', name !== 'config');
      viewAuth.classList.toggle('hidden', name !== 'auth');
      viewIn.classList.toggle('hidden', name !== 'signedin');
    };

    const setHeaderBadge = (session) => {
      if (session?.user?.email) {
        if (dot) {
          dot.classList.remove('bg-paper-borderStrong');
          dot.classList.add('bg-ink-ok');
        }
        if (label) label.textContent = session.user.email.split('@')[0].slice(0, 14);
      } else {
        if (dot) {
          dot.classList.remove('bg-ink-ok');
          dot.classList.add('bg-paper-borderStrong');
        }
        if (label) label.textContent = 'Cloud';
      }
    };

    const renderCloudDrafts = async () => {
      if (!draftsList) return;
      draftsList.innerHTML = '<div class="text-[11px] text-ink-muted text-center py-3">Memuat draft cloud...</div>';
      try {
        cachedDrafts = await window.MakaRapiCloud.listCloudDrafts();
        if (!cachedDrafts.length) {
          draftsList.innerHTML =
            '<div class="text-[11.5px] text-ink-muted italic border border-dashed border-paper-border rounded-[4px] p-3 text-center">Belum ada draft tersimpan di cloud.</div>';
          return;
        }
        draftsList.innerHTML = cachedDrafts
          .map((d) => {
            const dt = d.updated_at ? new Date(d.updated_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '';
            return `
              <div class="border border-paper-border rounded-[4px] p-2.5 bg-paper-bg/50 flex items-center justify-between gap-2">
                <div class="min-w-0">
                  <div class="text-[12px] font-medium text-ink truncate">${escapeHtml(d.title)}</div>
                  <div class="font-mono text-[10px] text-ink-muted tabular-nums">${escapeHtml(d.paper_size || 'A4')} &middot; ${Number(d.word_count || 0)} kata &middot; ${escapeHtml(dt)}</div>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <button type="button" data-cloud-load="${escapeHtml(d.id)}"
                    class="px-2 py-1 text-[10.5px] font-medium rounded-[3px] bg-white border border-paper-border hover:border-ink-primary text-ink-primary cursor-pointer">Muat</button>
                  <button type="button" data-cloud-del="${escapeHtml(d.id)}"
                    class="px-2 py-1 text-[10.5px] font-medium rounded-[3px] bg-white border border-ink-errBorder text-ink-err hover:bg-ink-errBg cursor-pointer">Hapus</button>
                </div>
              </div>
            `;
          })
          .join('');
      } catch (err) {
        draftsList.innerHTML = `<div class="text-[11px] text-ink-err p-2">${escapeHtml(err?.message || 'Gagal memuat draft.')}</div>`;
      }
    };

    const refreshModalState = async () => {
      const cfg = window.MakaRapiCloud.getSavedConfig();
      if (cfgUrl) cfgUrl.value = cfg.url || '';
      if (cfgKey) cfgKey.value = cfg.anonKey || '';
      if (cfgApi) {
        try {
          cfgApi.value = localStorage.getItem('makarapi_api_base_url_v1') || window.MAKARAPI_API_BASE_URL || '';
        } catch {
          cfgApi.value = window.MAKARAPI_API_BASE_URL || '';
        }
      }
      if (!window.MakaRapiCloud.isConfigured()) {
        showCloudPanel('config');
        setHeaderBadge(null);
        return;
      }
      const session = await window.MakaRapiCloud.getSession();
      setHeaderBadge(session);
      if (session?.user) {
        if (userEmailEl) userEmailEl.textContent = session.user.email || '';
        showCloudPanel('signedin');
        renderCloudDrafts();
      } else {
        showCloudPanel('auth');
      }
    };

    const openCloudModal = () => {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      refreshModalState();
    };
    const closeCloudModal = () => {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    };

    openBtn.addEventListener('click', openCloudModal);
    if (closeBtn) closeBtn.addEventListener('click', closeCloudModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeCloudModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeCloudModal();
    });

    const setAuthMode = (mode) => {
      authMode = mode;
      const isLogin = mode === 'login';
      tabLogin.classList.toggle('bg-ink-primary', isLogin);
      tabLogin.classList.toggle('text-white', isLogin);
      tabLogin.classList.toggle('text-ink-muted', !isLogin);
      tabSignup.classList.toggle('bg-ink-primary', !isLogin);
      tabSignup.classList.toggle('text-white', !isLogin);
      tabSignup.classList.toggle('text-ink-muted', isLogin);
      authSubmitBtn.textContent = isLogin ? 'Masuk ke Cloud' : 'Buat Akun Baru';
    };
    if (tabLogin) tabLogin.addEventListener('click', () => setAuthMode('login'));
    if (tabSignup) tabSignup.addEventListener('click', () => setAuthMode('signup'));

    const editCfgBtn = document.getElementById('btn-cloud-edit-cfg');
    if (editCfgBtn) editCfgBtn.addEventListener('click', () => showCloudPanel('config'));

    const saveCfgBtn = document.getElementById('btn-cloud-save-cfg');
    if (saveCfgBtn) {
      saveCfgBtn.addEventListener('click', async () => {
        try {
          window.MakaRapiCloud.saveConfig({
            url: cfgUrl.value,
            anonKey: cfgKey.value,
            apiBaseUrl: cfgApi.value,
          });
          if (window.MakaRapiAPI) {
            await window.MakaRapiAPI.detectBackend(true);
            updateWorkbenchEngineBadge();
          }
          showToast('Konfigurasi Cloud & API disimpan.', 'success');
          refreshModalState();
        } catch (err) {
          showToast(err?.message || 'Konfigurasi tidak valid.', 'error');
        }
      });
    }

    if (authSubmitBtn) {
      authSubmitBtn.addEventListener('click', async () => {
        const email = emailEl.value.trim();
        const pass = passEl.value;
        if (!email || !pass) {
          showToast('Isi email dan kata sandi terlebih dahulu.', 'warning');
          return;
        }
        authSubmitBtn.disabled = true;
        try {
          if (authMode === 'login') {
            await window.MakaRapiCloud.signIn(email, pass);
            showToast('Berhasil masuk ke Cloud MakaRapi.', 'success');
          } else {
            const res = await window.MakaRapiCloud.signUp(email, pass);
            showToast(
              res?.session
                ? 'Akun berhasil dibuat dan langsung masuk.'
                : 'Akun terdaftar! Cek email untuk konfirmasi lalu masuk.',
              'success'
            );
          }
          passEl.value = '';
          await refreshModalState();
        } catch (err) {
          showToast(err?.message || 'Autentikasi gagal.', 'error');
        } finally {
          authSubmitBtn.disabled = false;
        }
      });
    }

    const signOutBtn = document.getElementById('btn-cloud-signout');
    if (signOutBtn) {
      signOutBtn.addEventListener('click', async () => {
        await window.MakaRapiCloud.signOut();
        showToast('Berhasil keluar dari akun Cloud.', 'info');
        refreshModalState();
      });
    }

    const saveDraftBtn = document.getElementById('btn-cloud-save-draft');
    if (saveDraftBtn) {
      saveDraftBtn.addEventListener('click', async () => {
        saveDraftBtn.disabled = true;
        try {
          const readiness = auditReadinessLocally();
          await window.MakaRapiCloud.saveDraftToCloud(state, readiness.score);
          showToast('Draft makalah tersimpan aman di Cloud (RLS).', 'success');
          await renderCloudDrafts();
        } catch (err) {
          showToast(err?.message || 'Gagal menyimpan ke cloud.', 'error');
        } finally {
          saveDraftBtn.disabled = false;
        }
      });
    }

    const refreshBtn = document.getElementById('btn-cloud-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', renderCloudDrafts);

    if (draftsList) {
      draftsList.addEventListener('click', async (e) => {
        const loadBtn = e.target.closest('[data-cloud-load]');
        if (loadBtn) {
          const item = cachedDrafts.find((d) => String(d.id) === loadBtn.dataset.cloudLoad);
          if (!item || !item.payload_json) return;
          const p = item.payload_json;
          const def = getDefaultCleanState();
          state.format = { ...def.format, ...(p.format || {}) };
          state.abstract = { ...def.abstract, ...(p.abstract || {}) };
          state.cover = { ...def.cover, ...(p.cover || {}) };
          state.preface = { ...def.preface, ...(p.preface || {}) };
          state.content = typeof p.content === 'string' ? p.content : def.content;
          state.citations = Array.isArray(p.citations) ? p.citations : [];
          state.manualBibliography = typeof p.manualBibliography === 'string' ? p.manualBibliography : '';
          state.images = p.images && typeof p.images === 'object' ? p.images : {};
          state.guidelineProfile = p.guidelineProfile || null;
          syncControlsFromState();
          renderPreviewAndStats();
          scheduleSave();
          closeCloudModal();
          showToast(`Draft "${item.title}" berhasil dimuat dari Cloud.`, 'success');
          return;
        }
        const delBtn = e.target.closest('[data-cloud-del]');
        if (delBtn) {
          try {
            await window.MakaRapiCloud.deleteCloudDraft(delBtn.dataset.cloudDel);
            showToast('Draft dihapus dari Cloud.', 'info');
            await renderCloudDrafts();
          } catch (err) {
            showToast(err?.message || 'Gagal menghapus draft.', 'error');
          }
        }
      });
    }

    // Periksa sesi aktif di latar belakang agar indikator header otomatis menyala
    if (window.MakaRapiCloud.isConfigured()) {
      window.MakaRapiCloud.getSession().then(setHeaderBadge).catch(() => {});
    }
  }

  function init() {
    const importToast = consumeHomeImportHandoff();
    try {
      syncControlsFromState();
    } catch (err) {
      console.error('Gagal menyinkronkan kontrol awal:', err);
    }
    bindAllEvents();
    bindHybridExtraEvents();
    renderPreviewAndStats();
    updateWorkbenchEngineBadge();
    if (importToast) {
      showToast(importToast, 'success');
    }
    if (state.importMeta && (state.importMeta.hasEquations || state.importMeta.hasFootnotes)) {
      const notes = [];
      if (state.importMeta.hasEquations) notes.push('persamaan matematika');
      if (state.importMeta.hasFootnotes) notes.push('catatan kaki');
      showToast(`Catatan: dokumen asal memiliki ${notes.join(' & ')} — cek kembali setelah ekspor .docx.`, 'warning');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
