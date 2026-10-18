export default {
  plugins: {
    tailwindcss: {},
    // Uses "browserslist" from package.json: rewrites newer CSS (e.g. `rgb(r g b / a)`) for old Safari
    // and adds vendor prefixes (it includes autoprefixer).
    'postcss-preset-env': {},
  },
}
