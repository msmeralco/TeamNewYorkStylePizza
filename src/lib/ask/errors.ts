// Typed errors for Ask Kahati. The route maps these to { error: { code, message, next } }.
export type AskErrorCode = "unknown_household" | "missing_reading";

export class AskError extends Error {
  constructor(
    public code: AskErrorCode,
    message: string,
    public next: string,
    public status: number = 422,
  ) {
    super(message);
    this.name = "AskError";
  }
}
