// Máy chủ chỉ phục vụ kiểm thử UI; không mở trình duyệt người dùng và không proxy đến BE thật.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
const server = await createServer({ configFile: false, plugins: [react()], server: { host: '127.0.0.1', port: 5197, strictPort: true, open: false } });
await server.listen();
console.log('UI test server ready at http://127.0.0.1:5197');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0); });
