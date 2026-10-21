import { pakasirMethod } from "./pakasir-methods";

/**
 * An in-memory stand-in for Pakasir's API v2 (D-092), for tests and local dev/E2E without a
 * Pakasir project. Pass `fetch` as PakasirProvider's fetchImpl: the real provider code runs
 * against it, request shapes included. Every request is recorded in `calls`.
 */
type Txn = {
  txn_id: string;
  order_id: string;
  amount: number;
  method: string;
  status: "pending" | "completed" | "canceled";
  is_sandbox: boolean;
  completed_at: string | null;
};

export class FakePakasirApi {
  readonly calls: { method: string; path: string; apiKey: string | null; body: unknown }[] = [];
  readonly txns = new Map<string, Txn>();
  /** Set false to answer like a live project (is_sandbox: false). */
  sandbox = true;

  constructor(
    readonly slug = "fake-project",
    readonly apiKey = "fake-pakasir-key",
    readonly webhookSecret = "fake-pakasir-secret",
  ) {}

  readonly fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = new Request(input, init);
    const path = new URL(req.url).pathname.replace(/^\/api\/v2/, "");
    const body = req.method === "POST" ? await req.json().catch(() => null) : null;
    this.calls.push({ method: req.method, path, apiKey: req.headers.get("x-api-key"), body });
    if (req.headers.get("x-api-key") !== this.apiKey) return Response.json({ error: "unauthorized" }, { status: 401 });
    const [, action, slug, id] = path.split("/").map(decodeURIComponent);
    if (slug !== this.slug || !id) return Response.json({ error: "not found" }, { status: 404 });

    if (action === "create-transaction" && req.method === "POST") {
      const { method, amount } = (body ?? {}) as { method?: string; amount?: number };
      const m = method ? pakasirMethod(method) : undefined;
      if (!m || !Number.isInteger(amount)) return Response.json({ error: "bad request" }, { status: 400 });
      const existing = [...this.txns.values()].find(
        (t) => t.order_id === id && t.method === method && t.amount === amount,
      );
      const txn = existing ?? {
        txn_id: `ftx${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
        order_id: id,
        amount: amount as number,
        method: m.code,
        status: "pending" as const,
        is_sandbox: this.sandbox,
        completed_at: null,
      };
      this.txns.set(txn.txn_id, txn);
      const fee = m.kind === "qris" ? Math.ceil(txn.amount * 0.007) + 310 : 3500;
      return Response.json({
        txn_id: txn.txn_id,
        project: this.slug,
        order_id: txn.order_id,
        amount: txn.amount,
        fee,
        total_payment: txn.amount + fee,
        payment_method: m.code,
        // A syntactically plausible QRIS payload; the fake never checks it.
        qr_string:
          m.kind === "qris" ? `00020101021226610016ID.CO.FAKE.WWW0118${txn.txn_id}5802ID5907Pakasir6304ABCD` : "",
        va_number: m.kind === "va" ? `8808${String(txn.amount).padStart(12, "0")}` : "",
        // The real API's field name (the docs say `expired_at`; see pakasir.ts).
        expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
        is_sandbox: txn.is_sandbox,
      });
    }
    const txn = this.txns.get(id);
    if (!txn) return Response.json({ error: "not found" }, { status: 404 });
    if (action === "transaction-status" && req.method === "GET") {
      const { txn_id, order_id, amount, is_sandbox, status, completed_at } = txn;
      return Response.json({ txn_id, order_id, amount, is_sandbox, status, completed_at });
    }
    if (action === "cancel-transaction" && req.method === "POST") {
      if (txn.status !== "pending") return Response.json({ error: "cannot cancel" }, { status: 400 });
      txn.status = "canceled";
      return Response.json({ message: "Berhasil batalkan transaksi" });
    }
    return Response.json({ error: "not found" }, { status: 404 });
  };

  /** The latest transaction for our payment id. */
  txnFor(orderId: string): Txn | undefined {
    return [...this.txns.values()].filter((t) => t.order_id === orderId).at(-1);
  }

  /** "The buyer paid": marks the order's transaction completed. Returns it. */
  complete(orderId: string): Txn | undefined {
    const txn = this.txnFor(orderId);
    if (txn && txn.status === "pending") {
      txn.status = "completed";
      txn.completed_at = new Date().toISOString();
    }
    return txn;
  }

  /** The webhook Pakasir would send for the order's transaction (body as documented). */
  webhook(orderId: string, opts: { secret?: string | null; body?: Record<string, unknown>; url?: string } = {}) {
    const txn = this.txnFor(orderId);
    const body = opts.body ?? {
      amount: txn?.amount ?? 0,
      order_id: orderId,
      project: this.slug,
      status: "completed",
      payment_method: txn?.method ?? "qris",
      completed_at: txn?.completed_at ?? new Date().toISOString(),
      txn_id: txn?.txn_id ?? "",
      is_sandbox: txn?.is_sandbox ?? true,
    };
    const secret = opts.secret === undefined ? this.webhookSecret : opts.secret;
    return new Request(opts.url ?? "https://api.example/api/webhooks/pakasir", {
      method: "POST",
      headers: { "content-type": "application/json", ...(secret === null ? {} : { "x-secret": secret }) },
      body: JSON.stringify(body),
    });
  }
}
