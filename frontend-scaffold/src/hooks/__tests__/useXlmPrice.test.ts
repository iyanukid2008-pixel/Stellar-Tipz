import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PRICE_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd";

const response = (body: unknown, ok = true) =>
  ({
    ok,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response);

async function loadHook() {
  const { useXlmPrice } = await import("../useXlmPrice");
  return renderHook(() => useXlmPrice());
}

describe("useXlmPrice", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports loading while the price request is pending", async () => {
    vi.mocked(fetch).mockReturnValue(new Promise<Response>(() => undefined));

    const { result, unmount } = await loadHook();

    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.price).toBeNull();
    unmount();
  });

  it("stores the USD price after a successful request", async () => {
    vi.mocked(fetch).mockResolvedValue(response({ stellar: { usd: 0.1234 } }));

    const { result } = await loadHook();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.price).toBe(0.1234);
    expect(fetch).toHaveBeenCalledWith(
      PRICE_URL,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it.each([
    ["an unsuccessful response", () => Promise.resolve(response({}, false))],
    ["a network failure", () => Promise.reject(new Error("offline"))],
  ])("clears loading and price after %s", async (_label, request) => {
    vi.mocked(fetch).mockImplementation(request);

    const { result } = await loadHook();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.price).toBeNull();
  });

  it("serves a recent cached price without another request", async () => {
    vi.mocked(fetch).mockResolvedValue(response({ stellar: { usd: 0.2 } }));
    const first = await loadHook();
    await waitFor(() => expect(first.result.current.price).toBe(0.2));

    const { useXlmPrice } = await import("../useXlmPrice");
    const second = renderHook(() => useXlmPrice());

    await waitFor(() => expect(second.result.current.price).toBe(0.2));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("aborts an in-flight request during cleanup", async () => {
    let requestSignal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementation((_input, init) => {
      requestSignal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    });
    const { result, unmount } = await loadHook();
    await waitFor(() => expect(result.current.loading).toBe(true));

    act(() => unmount());

    expect(requestSignal).toBeInstanceOf(AbortSignal);
    expect(requestSignal?.aborted).toBe(true);
  });
});
