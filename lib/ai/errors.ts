export class ProviderError extends Error {
  constructor(
    public provider: "groq" | "gemini",
    public status: number,
    message: string,
    public retryAfterSec?: number,
  ) {
    super(`${provider} ${status}: ${message}`);
  }
  /** Worth trying another provider (rate limit, overload, outage). */
  get transient() {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

export async function providerError(provider: "groq" | "gemini", res: Response): Promise<ProviderError> {
  let message = res.statusText;
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    message = body.error?.message ?? message;
  } catch {
    /* body was not JSON */
  }
  const ra = parseFloat(res.headers.get("retry-after") ?? "");
  return new ProviderError(provider, res.status, message.slice(0, 300), Number.isFinite(ra) ? ra : undefined);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
