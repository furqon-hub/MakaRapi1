/* ==========================================================================
   Konfigurasi Tema Tailwind CSS (Editorial Workbench)
   ========================================================================== */
tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        serif: ['"Newsreader"', 'Georgia', 'serif'],
      },
      colors: {
        paper: {
          bg: '#F7F6F2',
          desk: '#EAE7E1',
          border: '#E2DFD9',
          borderStrong: '#D2CEC6',
        },
        ink: {
          DEFAULT: '#18181B',
          muted: '#57534E',
          subtle: '#78716C',
          primary: '#1D3557',
          primaryHover: '#14263F',
          ok: '#1F5E3B',
          okBg: '#EDF5F0',
          okBorder: '#C5DFD0',
          warn: '#8A5A00',
          warnBg: '#FBF6EA',
          warnBorder: '#E8D5A7',
          err: '#9B2226',
          errBg: '#FDF2F2',
          errBorder: '#EBC8C9',
        },
      },
      borderRadius: {
        ctrl: '4px',
        dlg: '6px',
      },
    },
  },
};
