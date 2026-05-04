export class UnsafeUriError extends Error {
  constructor(uri: string) {
    const redacted = uri.replace(/\/\/[^@]+@/, '//<redacted>@');
    super(`Refusing to seed against non-dev URI: "${redacted}"`);
    this.name = 'UnsafeUriError';
  }
}

export function assertSafeUri(uri: string): void {
  if (!/dev|test|local/i.test(uri)) {
    throw new UnsafeUriError(uri);
  }
}
