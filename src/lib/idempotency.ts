import { redis } from "./redis";

const IDEMPOTENCY_TTL = 86400;
// 24 hours in seconds
// keys expire automatically - no cleanup needed

export async function checkIdempotency(key: string): Promise<{
  exists: boolean;
  response: unknown | null;
  status: string | null;
}> {
  const data = await redis.get(`idempotency:${key}`);
  // namespacing all idempotency keys with prefix
  // learnt it will help prevents collision with other Redis keys

  if (!data) {
    return { exists: false, response: null, status: null };
  }

  const parsed = JSON.parse(data) as {
    status: string;
    response: unknown;
  };

  return {
    exists: true,
    response: parsed.response,
    status: parsed.status,
  };
}

export async function setIdempotencyProcessing(key: string): Promise<boolean> {
  const result = await redis.set(
    `idempotency:${key}`,
    JSON.stringify({ status: "processing", response: null }),
    "EX",
    IDEMPOTENCY_TTL,
    "NX",
    // NX = only set if Not eXists
  );

  return result === "OK";
}

export async function setIdempotencyComplete(
  key: string,
  response: unknown,
): Promise<void> {
  await redis.set(
    `idempotency:${key}`,
    JSON.stringify({ status: "complete", response }),
    "EX",
    IDEMPOTENCY_TTL,
  );
}

export async function setIdempotencyFailed(
  key: string,
  error: string,
): Promise<void> {
  await redis.set(
    `idempotency:${key}`,
    JSON.stringify({ status: "failed", error, response: null }),
    "EX",
    IDEMPOTENCY_TTL,
  );
}
