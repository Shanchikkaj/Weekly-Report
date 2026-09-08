/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Base neutral palette
        canvas: '#F8F9FA',
        surface: '#FFFFFF',
        subsurface: '#F1F3F5',
        primary: '#1A1D23',
        muted: '#5F6975',
        border: '#E4E7EB',
        'border-focus': '#94A3B8',

        // Single primary accent color (clean blue, used sparingly)
        accent: {
          DEFAULT: '#2563EB',
          hover: '#1D4ED8',
          subtle: '#EFF6FF',
          border: '#BFDBFE',
        },

        // Status badge colors (distinct background + text pairs)
        status: {
          draft: {
            bg: '#F1F3F5',
            text: '#475467',
            border: '#D0D5DD',
          },
          submitted: {
            bg: '#EFF6FF',
            text: '#1D4ED8',
            border: '#BFDBFE',
          },
          needs_correction: {
            bg: '#FEF3F2',
            text: '#B42318',
            border: '#FECDCA',
          },
          approved: {
            bg: '#ECFDF3',
            text: '#027A48',
            border: '#A6F4C5',
          },
        },
      },
      borderRadius: {
        card: '8px',
        input: '8px',
        badge: '6px',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
