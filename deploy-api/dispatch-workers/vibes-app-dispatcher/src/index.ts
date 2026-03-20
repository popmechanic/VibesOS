interface Env {
  DISPATCHER: {
    get(name: string): { fetch(request: Request): Promise<Response> };
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const hostname = new URL(request.url).hostname;
    const name = hostname.split('.')[0];

    if (!name || name === 'vibesos' || name === 'www') {
      return new Response('Not found', { status: 404 });
    }

    try {
      const worker = env.DISPATCHER.get(name);
      return await worker.fetch(request);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith('Worker not found')) {
        return new Response('App not found', { status: 404 });
      }
      console.error(`[app-dispatcher] Error dispatching ${name}:`, msg);
      return new Response('Internal error', { status: 500 });
    }
  },
};
