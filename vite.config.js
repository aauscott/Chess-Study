import { defineConfig, loadEnv } from 'vite';
import { analysisMiddleware } from './server/api.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const name of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY']) {
    if (!process.env[name] && env[name]) process.env[name] = env[name];
  }
  return {
    server: { host: '127.0.0.1' }, preview: { host: '127.0.0.1' },
    plugins: [{ name: 'local-chess-analysis',
      configureServer(server) { server.middlewares.use(analysisMiddleware()); },
      configurePreviewServer(server) { server.middlewares.use(analysisMiddleware()); },
    }],
  };
});
