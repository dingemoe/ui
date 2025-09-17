import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: './index.jsx',
      name: 'HelloComponent',
      fileName: 'hello-component',
      formats: ['umd', 'iife']
    },
    rollupOptions: {
      // Make React and ReactDOM external so userscript can provide them or CDN can be used
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM'
        }
      }
    }
  }
});
