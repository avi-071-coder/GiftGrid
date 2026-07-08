/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: {
          light: '#FBFBF9',
          dark: '#121212'
        },
        surface: {
          light: '#FFFFFF',
          dark: '#1A1A1A'
        },
        accent: {
          berry: '#B84C6E',
          berryHover: '#9A3A58',
          yellow: '#FFE600',
          yellowHover: '#E6CF00'
        },
        claimed: {
          sage: '#6E8B63',
          sageHover: '#5B7552'
        },
        text: {
          primary: {
            light: '#121212',
            dark: '#FBFBF9'
          },
          muted: {
            light: '#666666',
            dark: '#A3A3A3'
          }
        }
      },
      fontFamily: {
        serif: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'slide-up': 'slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'scale-in': 'scaleIn 0.3s ease-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        }
      }
    },
  },
  plugins: [],
}
