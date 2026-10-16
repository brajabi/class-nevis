export const colors = {
  bg: '#0A0B14',
  bgElevated: '#11131F',
  surface: '#161929',
  surfaceHigh: '#1E2236',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',
  text: '#F4F5FB',
  textMuted: '#A3A8C3',
  textFaint: '#6B7091',
  primary: '#7C5CFF',
  primarySoft: 'rgba(124,92,255,0.16)',
  accent: '#22D3EE',
  accentSoft: 'rgba(34,211,238,0.14)',
  record: '#FF4D6D',
  recordSoft: 'rgba(255,77,109,0.16)',
  success: '#34D399',
  successSoft: 'rgba(52,211,153,0.14)',
  warning: '#FBBF24',
  warningSoft: 'rgba(251,191,36,0.14)',
  danger: '#F87171',
  paper: '#FFFFFF',
  ink: '#1A1C2B',
} as const;

export const gradients = {
  primary: ['#7C5CFF', '#4F7BFF', '#22D3EE'] as const,
  record: ['#FF4D6D', '#FF7A59'] as const,
  surface: ['#1A1D30', '#121423'] as const,
  backdrop: ['#140F2E', '#0A0B14', '#0A0B14'] as const,
};

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const fonts = {
  regular: 'Vazirmatn_400Regular',
  medium: 'Vazirmatn_500Medium',
  bold: 'Vazirmatn_700Bold',
  black: 'Vazirmatn_900Black',
} as const;

export const type = {
  display: { fontFamily: fonts.black, fontSize: 30, lineHeight: 44 },
  title: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 34 },
  heading: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 28 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 25 },
  label: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 20 },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
} as const;

export const shadow = {
  glow: {
    shadowColor: '#7C5CFF',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
};
