import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // The 8-color Echo Heist palette. Named so they never shadow a Tailwind scale.
        ink: '#0f1020',
        dusk: '#1c2436',
        iron: '#303b52',
        steel: '#55637d',
        bone: '#e6e2d3',
        gold: '#f2b94b',
        blood: '#e0455a',
        aqua: '#3fc7b4',
      },
      boxShadow: {
        pixel: '4px 4px 0 0 #0f1020',
        'pixel-sm': '2px 2px 0 0 #0f1020',
      },
    },
  },
  plugins: [],
};

export default config;
