/**
 * Standard JSON in/out envelope (REQ-ARCH-001, AC-ANDROID-012).
 *
 * Every CLI command emits exactly one of these two shapes to stdout as a
 * single JSON document. Errors are structured JSON, never free-text
 * (REQ-DOCTOR-005 generalizes this pattern beyond `doctor`).
 *
 * @MX:NOTE — this is the shared success/error contract every command
 * handler in `src/cli/commands/*` returns; keeping it centralized is what
 * makes AC-ANDROID-012 ("every command emits valid, parseable JSON")
 * mechanically checkable across the whole command surface.
 */

export interface CommandSuccess<T = unknown> {
  ok: true;
  command: string;
  data: T;
}

export interface CommandErrorInfo {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface CommandError {
  ok: false;
  command: string;
  error: CommandErrorInfo;
}

export type CommandResult<T = unknown> = CommandSuccess<T> | CommandError;

export function success<T>(command: string, data: T): CommandSuccess<T> {
  return { ok: true, command, data };
}

export function failure(
  command: string,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): CommandError {
  return details === undefined
    ? { ok: false, command, error: { code, message } }
    : { ok: false, command, error: { code, message, details } };
}
