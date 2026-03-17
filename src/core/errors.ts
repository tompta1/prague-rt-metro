export class FetchError extends Error {
  constructor(
    public readonly url: string,
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'FetchError'
  }
}

export function isFetchError(err: unknown): err is FetchError {
  return err instanceof FetchError
}
