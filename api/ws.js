// Vercel Edge Function for WebSocket support
export const config = {
  runtime: 'edge',
};

export default function handler(req) {
  // Handle WebSocket upgrade
  if (req.headers.get('upgrade') === 'websocket') {
    return new Response(null, {
      status: 101,
      headers: {
        'Upgrade': 'websocket',
        'Connection': 'Upgrade',
      },
    });
  }
  
  return new Response('WebSocket endpoint', { status: 200 });
}
