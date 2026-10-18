/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        soft: '0 20px 50px rgba(15, 23, 42, 0.08)',
      },
    },
  },
  // Without these, every color is emitted as `rgb(r g b / var(--tw-…-opacity))`, which Safari < 12.1
  // ignores entirely (invisible backgrounds/text). Opacity modifiers like `bg-white/90` still work.
  corePlugins: {
    backgroundOpacity: false,
    textOpacity: false,
    borderOpacity: false,
    divideOpacity: false,
    placeholderOpacity: false,
    ringOpacity: false,
  },
  plugins: [],
}

