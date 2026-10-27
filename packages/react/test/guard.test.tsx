import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NeerGuard, NeerStatus, type NeerResult, type NeerTransfer } from "../src/index.js";

const deposit = { address: "0xDF7A93d400159d0f8f40AAe42576d01285EA9e39" };
const base: NeerTransfer = { chain: "base", asset: "native", amount: "170000000000000000", source: "wallet" };
const eth: NeerTransfer = { ...base, chain: "eth" };

function result(verdict: NeerResult["verdict"], message = ""): NeerResult {
  return {
    verdict,
    label: verdict,
    headline: verdict,
    message,
    checks:
      verdict === "block"
        ? [{ id: "network", severity: "block", title: "Network", headline: "Base, not Ethereum", message: "Wrong network. This address is for Ethereum. You chose Base." }]
        : [{ id: "network", severity: "pass", title: "Network", headline: "Ethereum", message: "Right network." }],
    serverTime: new Date().toISOString(),
    rulesVersion: "test",
    checksHash: "0".repeat(64),
  };
}

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

function Harness({ transfer, fetchImpl, maxAgeMs }: { transfer: NeerTransfer; fetchImpl: typeof fetch; maxAgeMs?: number }) {
  return (
    <NeerGuard endpoint="https://neer.test" deposit={deposit} transfer={transfer} fetch={fetchImpl} debounceMs={0} maxAgeMs={maxAgeMs}>
      {(g) => (
        <>
          <button disabled={!g.canSend}>Send</button>
          <NeerStatus guard={g} />
        </>
      )}
    </NeerGuard>
  );
}

const sendDisabled = () => (screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled;

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(1); });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("<NeerGuard/>", () => {
  it("keeps Send disabled while checking and enables it only for safe", async () => {
    const f = vi.fn((_url: string, init?: RequestInit) => {
      const t = JSON.parse(String(init?.body)).transfer as NeerTransfer;
      return json(result(t.chain === "eth" ? "safe" : "block"));
    }) as unknown as typeof fetch;
    const { rerender } = render(<Harness transfer={base} fetchImpl={f} />);
    expect(sendDisabled()).toBe(true);
    await flush();
    expect(sendDisabled()).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("Don't send");
    expect(screen.getByRole("status").textContent).toContain("This address is for Ethereum");

    rerender(<Harness transfer={eth} fetchImpl={f} />);
    // New inputs: the old verdict no longer counts.
    expect(sendDisabled()).toBe(true);
    await flush();
    expect(sendDisabled()).toBe(false);
    expect(screen.getByRole("status").textContent).toContain("Safe to send");
    expect(f).toHaveBeenCalledWith("https://neer.test/api/v1/preflight", expect.objectContaining({ method: "POST" }));
  });

  it("fails closed on network errors and non-2xx responses", async () => {
    const down = vi.fn(() => Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch;
    render(<Harness transfer={eth} fetchImpl={down} />);
    await flush();
    expect(sendDisabled()).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("Couldn't reach Neer");
    cleanup();

    const unavailable = vi.fn(() =>
      json({ ...result("check"), error: { code: "NEER_UPSTREAM_UNAVAILABLE", message: "NEAR Intents didn't answer (timeout). Do not treat this as safe." } }, 503),
    ) as unknown as typeof fetch;
    render(<Harness transfer={eth} fetchImpl={unavailable} />);
    await flush();
    expect(sendDisabled()).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("Do not treat this as safe");
  });

  it("a 200 with a 'safe' body that isn't a real result does not enable Send", async () => {
    const odd = vi.fn(() => json({ verdict: "safe" })) as unknown as typeof fetch;
    render(<Harness transfer={eth} fetchImpl={odd} />);
    await flush();
    expect(sendDisabled()).toBe(true);
  });

  it("a safe verdict expires after maxAgeMs", async () => {
    const f = vi.fn(() => json(result("safe"))) as unknown as typeof fetch;
    render(<Harness transfer={eth} fetchImpl={f} maxAgeMs={60_000} />);
    await flush();
    expect(sendDisabled()).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_001);
    });
    expect(sendDisabled()).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("out of date");
  });
});
