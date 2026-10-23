import { readFile } from 'node:fs/promises';

const demoOrdersUrl = new URL('../../../../don-hang-mau.json', import.meta.url);

export const listDemoOrders = async () => {
  try {
    const fixture = JSON.parse(await readFile(demoOrdersUrl, 'utf8'));
    if (fixture.demoOnly !== true || fixture.namespace !== 'DEMO-PACKING') return [];
    return fixture.orders.map((order) => ({ ...order, _id: order.id, demoOnly: true }));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
};

export const findDemoOrder = async (idOrCode) => {
  if (typeof idOrCode !== 'string' || !idOrCode.startsWith('DEMO-ORD-')) return null;
  const order = (await listDemoOrders()).find((candidate) =>
    candidate.id === idOrCode || candidate.orderCode === idOrCode
  );
  return order || null;
};
