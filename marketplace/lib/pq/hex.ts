export const hexToU8 = (
  hex: string,
  expectedBytes: number = 32
): Uint8Array => {
  if (hex.startsWith("0x")) hex = hex.slice(2);

  if (hex.length !== expectedBytes * 2) {
    throw new Error(
      `Seed must be ${expectedBytes} bytes (${expectedBytes * 2} hex chars)`
    );
  }

  return Uint8Array.from(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
};
