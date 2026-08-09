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

/**
 * 명령을 수행하는 과정에서 시스템이 스스로 한 조치 — 결과 자체는 아니지만
 * 호출자가 알아야 하는 사실 (SPEC-IOS-002 AC-IOS2-016의 첫 소비자).
 *
 * @MX:NOTE — 선택 필드이며 **있을 때만 실린다**. 알림이 없는 명령의 JSON은
 * 이 SPEC 이전과 바이트 단위로 같다 — 기존 소비자가 깨지지 않는다
 * (REQ-IOS2-008: 기존 계약에 회귀를 만들지 않는다).
 */
export type CommandNotices = string[];

export interface CommandSuccess<T = unknown> {
  ok: true;
  command: string;
  data: T;
  notices?: CommandNotices;
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
  notices?: CommandNotices;
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
