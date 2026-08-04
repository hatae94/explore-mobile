/**
 * 기기(시리얼)별 IME 세션 기록 저장소 (SPEC-IMESTATE-001).
 *
 * `node dist/cli/bin.js <cmd>` 한 번은 각각 **별개의 OS 프로세스**다. 따라서
 * 비-ASCII `text` 호출이 바꿔 놓은 원래 IME를 나중의 `reset`이 복원하려면,
 * 그 값이 프로세스 종료 후에도 남아 있어야 한다(REQ-INPUT-004). 이 모듈이
 * 그 저장소다.
 *
 * ## 배치 — 기기마다 전용 파일 (§A.3-①)
 *
 * ```
 * <cache-dir>/ime-sessions/<enc>.json      레코드  (enc = 시리얼의 UTF-8 hex)
 * <cache-dir>/ime-sessions/<enc>.cleared   툼스톤  (무효화 표식)
 * <cache-dir>/ime-sessions.json            구 파일 (영구 읽기 전용 폴백 — M3)
 * ```
 *
 * 이전 구현은 모든 기기가 단일 `ime-sessions.json` 하나를 read-modify-write
 * 했다. 두 기기가 동시에 세션을 시작하면 나중 쓰기가 앞선 기록을 통째로
 * 덮어써 한쪽 기기가 **복원 불가**가 됐다(M1에서 결정적으로 재현). 시리얼마다
 * 파일을 분리하면 겹칠 대상 자체가 없다 — 레이스를 감지·직렬화하는 것이
 * 아니라 **성립 불가능하게** 만든다.
 *
 * ## 동시성 — 잠금 없이 두 경합을 닫는다
 *
 * - **시리얼 간**: 경로 분리로 소멸(§A.3-①).
 * - **동일 시리얼**: 레코드를 **배타 생성**(`wx`)한다. 이미 있으면 `EEXIST`로
 *   실패하고 **먼저 기록한 쪽의 값이 이긴다**(§A.3-⑤ / REQ-IMESTATE-007).
 *   `adb-backend.ts:438-440`의 "부재일 때만 쓴다"를 호출자 수정 없이
 *   원자적으로 만든다. read-modify-write가 아니라 단일 시스템 콜의 원자성에
 *   의존하므로 잠금이 필요 없다 — 대기·타임아웃·부생 잠금이 없으므로
 *   "CLI는 멈추지 않는다" 계약이 유지된다(§A.3-②).
 *
 * ## 조회는 3단계 (§A.3-⑥ / REQ-IMESTATE-008)
 *
 * ```
 * 1. <enc>.json 있으면          → 그 값
 * 2. 없고 <enc>.cleared 있으면  → undefined (구 파일 폴백을 억제)
 * 3. 둘 다 없으면               → 구 파일 폴백 (읽기 전용, M3)
 * ```
 *
 * 2단계가 **구 파일 좀비**를 닫는다 — 무효화된 시리얼의 기록이 구 파일에
 * 남아 있어도 이후 조회가 그것을 되살리지 못한다. 구 파일은 이관·폐기하지
 * 않고 영구히 남으므로(REQ-IMESTATE-003), 이 억제는 한시적 장치가 아니라
 * **영구적으로 유일한 방어**다.
 *
 * ## 상태를 바꾸는 두 경로의 순서 — 같은 규칙의 두 방향
 *
 * - `clear`  : ① 툼스톤 생성 → ② 레코드 제거 (§A.3-⑦)
 * - `set`    : ① 레코드 배타 생성 → ② 툼스톤 제거 (§A.3-⑧)
 *
 * 어느 쪽이든 두 연산 사이의 창에서 **값을 주거나 억제하는 파일이 항상 하나는
 * 존재**한다. 반대 순서로 하면 그 창의 조회가 1·2단계를 모두 놓치고 3단계
 * 구 파일 폴백으로 떨어져 죽은 값이 되살아난다.
 *
 * @MX:ANCHOR: 공개 메서드 3종(get/set/clear)의 시그니처와 반환 계약은 불변이다
 * @MX:REASON: fan_in 3+ (`adb-backend.ts` 직접 호출 · `index.ts` 재export ·
 *   `router.test.ts` 6지점). REQ-IMESTATE-006이 호출자 무수정을 요구하므로
 *   내부 배치가 바뀌어도 이 표면은 유지해야 한다
 * @MX:SPEC: SPEC-IMESTATE-001
 *
 * @MX:NOTE: 비-`EEXIST` 쓰기 실패는 삼키지 않고 거부한다(REQ-IMESTATE-007)
 * @MX:REASON: `try { wx } catch {}`로 뭉치면 기록이 전혀 남지 않은 채 정상
 *   종료해 `reset`이 복원할 대상을 잃는다 — 이 SPEC이 없애려는 결함과
 *   사용자에게 보이는 증상이 같은 새 경로가 생긴다
 */

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { resolveApkCacheDir } from "./apk-downloader.js";

/** 한 시리얼의 IME 세션 기록. */
export interface ImeSessionRecord {
  /** ADBKeyBoard로 전환하기 직전 기기의 기본 IME. 판별 불가였으면 빈 문자열. */
  originalIme: string;
  /**
   * 원본 시리얼(추적성 전용 — REQ-IMESTATE-002).
   *
   * 조회 키는 어디까지나 **파일명**이다. hex 인코딩이 가독성을 잃게 하므로
   * 사람이 파일을 열어 어느 기기인지 알 수 있도록 내용에 남긴다.
   * 구 파일(단일 맵)의 항목에는 이 필드가 없으므로 optional이다.
   */
  serial?: string;
}

/**
 * 구 단일 파일의 형태: 시리얼 → 기록.
 *
 * 기기별 파일 배치에서는 **구 파일 파싱 전용**으로만 의미가 남는다(M3의
 * 읽기 전용 폴백). 신규 쓰기는 이 형태를 만들지 않는다.
 */
export type ImeSessionMap = Record<string, ImeSessionRecord>;

/**
 * 저장소가 쓰는 파일 연산. 테스트가 실제 `~/.cache`를 건드리지 않도록
 * 생성자로 주입할 수 있다.
 *
 * `read`/`write`의 시그니처는 이전 구현과 동일하며, 배타 생성·제거가
 * **가법으로 추가**됐다(REQ-IMESTATE-006 명시 허용).
 */
export interface ImeSessionStoreIO {
  /** 파일 내용. 없거나 읽을 수 없으면 `null`(예외를 던지지 않는다). */
  read: (path: string) => Promise<Buffer | null>;
  /** 무조건 쓰기(덮어쓰기 허용). 부모 디렉터리를 만든다. */
  write: (path: string, data: Buffer) => Promise<void>;
  /**
   * 배타 생성 — 파일이 이미 있으면 `code === "EEXIST"`인 오류를 던진다.
   * 이 원자성이 동일 시리얼 경합을 닫는 유일한 기전이다.
   */
  createExclusive: (path: string, data: Buffer) => Promise<void>;
  /** 제거 — 파일이 없으면 `code === "ENOENT"`인 오류를 던진다. */
  remove: (path: string) => Promise<void>;
}

/** 기기별 레코드가 모이는 디렉터리 이름. */
const STORE_DIRNAME = "ime-sessions";
/** 구 단일 파일 이름(영구 읽기 전용 폴백). */
const LEGACY_STORE_FILENAME = "ime-sessions.json";
const RECORD_EXT = ".json";
const TOMBSTONE_EXT = ".cleared";

/**
 * **구 단일 파일**의 경로 — `<cache-dir>/ime-sessions.json`.
 *
 * SPEC-IMESTATE-001 이전에는 이것이 저장소 자체였다. 지금은 읽기 전용
 * 폴백 대상의 경로를 가리키는 용도로만 의미가 남는다(REQ-IMESTATE-003).
 * 신규 기록은 모두 `<cache-dir>/ime-sessions/` 아래로 간다.
 */
export function resolveImeSessionStorePath(): string {
  return join(resolveApkCacheDir(), LEGACY_STORE_FILENAME);
}

/**
 * 시리얼 → 파일명. UTF-8 바이트를 **소문자 16진수**로 인코딩한다.
 *
 * 세 성질을 동시에 만족하는 유일한 이유로 이 규칙이 선택됐다(REQ-IMESTATE-002):
 * 단사(역변환 가능하므로 충돌 없음) · 대소문자 무구분 안전(`[0-9a-f]` 한 계열만
 * 사용) · 파일시스템 안전(`/` `\` `:` 등 예약 문자가 남지 않는다).
 *
 * 손실 있는 변환 `replace(/[^A-Za-z0-9_-]/g, "_")`를 **재사용하지 않는다**
 * (§A.3-④가 명시 기각). 그 변환은 `192.168.1.5:5555`와 `192_168_1_5_5555`를
 * 같은 값으로 붕괴시키고, 그 순간 고치려던 결함이 파일명 충돌로 자리만 옮겨
 * 재현된다. SPEC 작성 시점에는 `adb-backend.ts`가 기기측 임시 경로 조립에
 * 그 변환을 쓰고 있었으나(§C.1-⑨에 실측 기록), **이후 제거돼 현재 저장소에는
 * 남아 있지 않다**(2026-08-03 실측: `grep -rn 'A-Za-z0-9_-' src/` → 이 주석과
 * 테스트의 인용 2건뿐). 기각 근거는 코드의 존재 여부와 무관하게 유효하다.
 *
 * 길이: hex는 입력의 2배이고 확장자가 더 붙으므로 파일명 255바이트 한도에서
 * 시리얼은 123바이트까지 안전하다(`123×2+8 = 254`). 실측된 adb 시리얼과 iOS
 * UDID는 모두 40바이트 미만이다. 한도를 넘으면 파일 생성이 `ENAMETOOLONG`으로
 * 실패하고, 비-`EEXIST` 실패이므로 호출이 거부된다(조용히 삼키지 않는다).
 */
export function encodeSerialForFilename(serial: string): string {
  return Buffer.from(serial, "utf-8").toString("hex");
}

/** {@link encodeSerialForFilename}의 역변환 — 파일명에서 원본 시리얼 복원. */
export function decodeSerialFromFilename(encoded: string): string {
  return Buffer.from(encoded, "hex").toString("utf-8");
}

const defaultIO: ImeSessionStoreIO = {
  async read(path) {
    try {
      return await readFile(path);
    } catch {
      return null;
    }
  },
  async write(path, data) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  },
  async createExclusive(path, data) {
    // 부모 디렉터리 생성은 배타성과 무관하다 — `wx`의 원자성은 대상 파일
    // 하나에만 걸린다. 디렉터리를 미리 만들지 않으면 최초 호출이 항상
    // `ENOENT`로 거부되므로, 여기서 보장한다.
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data, { flag: "wx" });
  },
  async remove(path) {
    await unlink(path);
  },
};

/** `value`가 배열도 `null`도 아닌 평범한 JSON 객체인가. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Node 파일 오류의 `code`. 오류가 아니거나 코드가 없으면 `undefined`. */
function errorCode(error: unknown): string | undefined {
  if (!isPlainObject(error)) return undefined;
  const { code } = error;
  return typeof code === "string" ? code : undefined;
}

/**
 * 기기별 IME 세션 기록을 읽고 쓴다.
 *
 * 생성자 인자 1은 **디렉터리** 경로다(SPEC-IMESTATE-001 이전에는 파일
 * 경로였다). 경로와 I/O 모두 주입 가능하므로 테스트는 실제 `~/.cache`를
 * 건드리지 않는다.
 */
export class ImeSessionStore {
  constructor(
    private readonly storeDir: string = join(resolveApkCacheDir(), STORE_DIRNAME),
    private readonly io: ImeSessionStoreIO = defaultIO,
  ) {}

  /** `<storeDir>/<enc>.json` — 그 시리얼의 레코드. */
  private recordPath(serial: string): string {
    return join(this.storeDir, `${encodeSerialForFilename(serial)}${RECORD_EXT}`);
  }

  /** `<storeDir>/<enc>.cleared` — 그 시리얼의 툼스톤(무효화 표식). */
  private tombstonePath(serial: string): string {
    return join(this.storeDir, `${encodeSerialForFilename(serial)}${TOMBSTONE_EXT}`);
  }

  /**
   * 구 단일 파일의 경로 — 저장소 디렉터리의 형제.
   *
   * 기본 배치에서 `<cache>/ime-sessions/`의 형제는 `<cache>/ime-sessions.json`
   * 이므로 {@link resolveImeSessionStorePath}와 같은 값이 된다. 주입된
   * 디렉터리에서도 같은 관계가 성립하도록 형제로 유도한다.
   */
  private legacyStorePath(): string {
    return join(dirname(this.storeDir), LEGACY_STORE_FILENAME);
  }

  /**
   * 파일 하나를 레코드로 읽는다. 없거나·비었거나·JSON이 아니거나·모양이
   * 기대와 다르면 `undefined` — 예외를 전파하지 않는다(REQ-IMESTATE-004).
   *
   * 손상된 세션 기록 하나가 `text`·`reset`·`doctor` 전체를 실패시켜서는
   * 안 된다.
   */
  private async readRecord(path: string): Promise<ImeSessionRecord | undefined> {
    const raw = await this.io.read(path);
    if (raw === null || raw.length === 0) return undefined;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString("utf-8"));
    } catch {
      return undefined;
    }
    if (!isPlainObject(parsed)) return undefined;

    const { originalIme, serial } = parsed;
    if (typeof originalIme !== "string") return undefined;
    return typeof serial === "string" ? { originalIme, serial } : { originalIme };
  }

  /** 파일 존재 여부. 내용은 보지 않는다(툼스톤 판정용). */
  private async exists(path: string): Promise<boolean> {
    return (await this.io.read(path)) !== null;
  }

  /**
   * 조회 3단계 중 3단계 — 구 단일 파일 폴백(읽기 전용).
   *
   * @MX:TODO: M3에서 구현한다 — 구 파일을 파싱해 그 시리얼의 기록을 반환한다
   * @MX:SPEC: SPEC-IMESTATE-001 REQ-IMESTATE-003 / AC-009·010·012·028
   * @MX:PRIORITY: M3
   */
  private async readLegacyFallback(_serial: string): Promise<string | undefined> {
    void this.legacyStorePath();
    return undefined;
  }

  /**
   * `serial`에 기록된 원래 IME. 추적 중인 세션이 없으면 `undefined`.
   *
   * 3단계 조회(레코드 → 툼스톤 → 구 파일)를 **이 순서로** 따른다
   * (REQ-IMESTATE-008). 1단계가 2단계보다 앞서므로 새 세션은 무효화 상태를
   * 정상적으로 대체한다.
   */
  async getOriginalIme(serial: string): Promise<string | undefined> {
    const record = await this.readRecord(this.recordPath(serial));
    if (record !== undefined) return record.originalIme;

    // 툼스톤이 있으면 여기서 끝난다 — 구 파일에 남은 죽은 기록을 되살리지
    // 않기 위해 3단계로 내려가지 않는다.
    if (await this.exists(this.tombstonePath(serial))) return undefined;

    return this.readLegacyFallback(serial);
  }

  /**
   * `serial`의 세션 시작을 기록한다 — **이미 기록이 있으면 그것을 보존한다.**
   *
   * 배타 생성이므로 동시에 진입한 둘 중 정확히 하나만 성공하고, 나머지는
   * `EEXIST`를 받아 조용히 반환한다(REQ-IMESTATE-007). 이는 "덮어쓰기"가
   * 아니라 **먼저 기록한 쪽이 이긴다**는 계약이다 — 늦게 진입한 프로세스가
   * 이미 ADBKeyBoard로 바뀐 IME를 "원래 IME"로 덮어쓰면 이후 `reset`이
   * 기기를 ADBKeyBoard 자체로 "복원"하게 된다.
   *
   * `EEXIST`가 아닌 실패(`ENOENT`·`EACCES`·`ENOSPC`·`ENAMETOOLONG` 등)는
   * **삼키지 않고 거부한다**. 조용히 성공하면 기록 없이 정상 종료해 복원
   * 대상을 잃는다.
   */
  async setOriginalIme(serial: string, originalIme: string): Promise<void> {
    const record: ImeSessionRecord = { originalIme, serial };
    const data = Buffer.from(JSON.stringify(record, null, 2), "utf-8");

    try {
      await this.io.createExclusive(this.recordPath(serial), data);
    } catch (error) {
      // 다른 프로세스가 먼저 기록했다 — 정상 결과이며 기존 값을 보존한다.
      // 남아 있을 수 있는 툼스톤은 1단계(레코드)가 이기므로 무해하고,
      // 이긴 쪽이 아래에서 제거한다.
      if (errorCode(error) === "EEXIST") return;
      throw error;
    }

    // 레코드가 놓인 **뒤에** 툼스톤을 지운다(§A.3-⑧). 반대 순서로 하면 그
    // 사이 창의 조회가 1·2단계를 모두 놓치고 구 파일 폴백으로 떨어진다.
    await this.removeIfPresent(this.tombstonePath(serial));
  }

  /**
   * `serial`의 세션을 무효화한다 — 이후 조회는 `undefined`를 반환한다.
   *
   * 레코드를 지우는 것만으로는 부족하다. 구 파일에 그 시리얼의 기록이 남아
   * 있으면 3단계 폴백이 그것을 되살리기 때문이다. 그래서 **툼스톤을 먼저
   * 만들고**(§A.3-⑦) 레코드를 나중에 지운다 — 두 연산 사이에서 프로세스가
   * 죽어도 억제가 유지된다.
   *
   * 레코드가 없던 시리얼에도 툼스톤을 만든다. 구 파일 기록만 남은 시리얼이
   * 정확히 그 경우이며, 여기서 no-op으로 처리하면 좀비가 열린다
   * (REQ-IMESTATE-005). 조회 결과는 어느 경우에도 `undefined`로 동일하므로
   * 기존 no-op 의미는 보존된다.
   */
  async clearOriginalIme(serial: string): Promise<void> {
    const tombstone = Buffer.from(JSON.stringify({ serial }, null, 2), "utf-8");

    try {
      await this.io.createExclusive(this.tombstonePath(serial), tombstone);
    } catch (error) {
      // 이미 무효화된 시리얼 — 툼스톤 생성은 멱등하다.
      if (errorCode(error) !== "EEXIST") throw error;
    }

    await this.removeIfPresent(this.recordPath(serial));
  }

  /**
   * 파일을 지우되 "이미 없음"은 정상으로 본다.
   *
   * `ENOENT`만 예외다 — 제거는 멱등해야 하기 때문이다. 그 밖의 실패는
   * 거부한다(REQ-IMESTATE-007).
   */
  private async removeIfPresent(path: string): Promise<void> {
    try {
      await this.io.remove(path);
    } catch (error) {
      if (errorCode(error) === "ENOENT") return;
      throw error;
    }
  }
}
