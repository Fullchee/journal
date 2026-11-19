/** A write that breaks a UNIQUE constraint rejects; null lets the caller answer it with a 409. */
export async function unlessDuplicate<Result>(write: Promise<Result>): Promise<Result | null> {
  try {
    return await write;
  } catch {
    return null;
  }
}
