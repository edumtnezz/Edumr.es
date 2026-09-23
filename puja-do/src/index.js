const STEP_HIGH = 1000000;
const STEP_LOW = 100000;

export class PujaRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async getPuja() {
    let p = await this.state.storage.get("puja");
    const now = Date.now();
    if (p && p.status === "open" && now >= p.closesAt) {
      const top = (p.bids || []).slice().sort((a, b) => b.amount - a.amount)[0] || null;
      p.status = "closed";
      p.winner = top ? { user: top.user, amount: top.amount } : null;
      await this.archive(p);
    }
    return p || null;
  }

  async getHistory() {
    return (await this.state.storage.get("history")) || [];
  }

  async archive(p) {
    if (!p || p.archived) return;
    const hist = await this.getHistory();
    hist.unshift({
      id: p.id,
      player: p.player,
      photo: p.photo || "",
      value: p.value || 0,
      creator: p.creator || "",
      winner: p.winner ? p.winner.user : null,
      amount: p.winner ? p.winner.amount : 0,
      bids: (p.bids || []).map((b) => ({ user: b.user, amount: b.amount })),
      closedAt: p.closesAt || null,
    });
    await this.state.storage.put("history", hist.slice(0, 100));
    p.archived = true;
    await this.state.storage.put("puja", p);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const action = url.pathname.replace(/^\/+/, "") || "state";

    if (request.method === "GET" && action === "state") {
      const p = await this.getPuja();
      const history = await this.getHistory();
      return Response.json({ puja: p, history });
    }

    if (request.method === "POST" && action === "crear") {
      const body = await request.json();
      let out;
      await this.state.blockConcurrencyWhile(async () => {
        const existing = await this.state.storage.get("puja");
        if (existing && existing.status === "open") {
          out = { error: "Ya hay una puja abierta. Espera a que termine.", status: 409 };
          return;
        }
        if (existing && existing.status === "closed") await this.archive(existing);
        const now = Date.now();
        const p = {
          id: String(now),
          creator: body.user.name,
          creatorKey: body.user.key,
          player: body.player,
          base: body.base,
          value: body.value || 0,
          photo: body.photo || "",
          createdAt: new Date(now).toISOString(),
          closesAt: body.closesAt,
          extended: false,
          status: "open",
          bids: [],
          winner: null,
        };
        await this.state.storage.put("puja", p);
        out = { ok: true, puja: p };
      });
      if (out.error) return Response.json({ error: out.error }, { status: out.status });
      return Response.json(out);
    }

    if (request.method === "POST" && action === "pujar") {
      const body = await request.json();
      let out;
      await this.state.blockConcurrencyWhile(async () => {
        const p = await this.getPuja();
        if (!p) { out = { error: "No hay ninguna puja abierta.", status: 404 }; return; }
        if (p.status !== "open") { out = { error: "La puja ya ha terminado.", status: 403 }; return; }
        const step = p.base >= 10000000 ? STEP_HIGH : STEP_LOW;
        const highest = (p.bids || []).reduce((m, b) => Math.max(m, b.amount), 0);
        const minFirst = Math.ceil(p.base / step) * step;
        const min = highest ? highest + step : minFirst;
        const amount = Math.floor(Number(body.amount));
        if (!Number.isFinite(amount)) { out = { error: "Cantidad invalida.", status: 400 }; return; }
        if (amount % step !== 0) { out = { error: "La puja debe ir de " + step.toLocaleString("es-ES") + " en " + step.toLocaleString("es-ES") + ".", status: 400 }; return; }
        if (amount < min) { out = { error: "La puja mínima es " + min.toLocaleString("es-ES") + " €.", status: 400 }; return; }
        const now = Date.now();
        const bids = (p.bids || []).filter((b) => b.user !== body.user.name);
        bids.push({ user: body.user.name, userKey: body.user.key, amount, at: new Date(now).toISOString() });
        p.bids = bids;
        if (now >= p.closesAt - 5 * 60 * 1000) {
          p.closesAt = now + 5 * 60 * 1000;
          p.extended = true;
        }
        await this.state.storage.put("puja", p);
        out = { ok: true, puja: p };
      });
      if (out.error) return Response.json({ error: out.error }, { status: out.status });
      return Response.json(out);
    }

    if (request.method === "POST" && action === "seed") {
      const body = await request.json();
      await this.state.blockConcurrencyWhile(async () => {
        const cur = await this.state.storage.get("puja");
        if (cur === undefined && body.puja) await this.state.storage.put("puja", body.puja);
        const hist = await this.state.storage.get("history");
        if (hist === undefined && Array.isArray(body.history)) await this.state.storage.put("history", body.history);
      });
      return Response.json({ ok: true });
    }

    return new Response("not found", { status: 404 });
  }
}

export default {
  fetch() {
    return new Response("PujaRoom DO worker", { status: 200 });
  },
};
