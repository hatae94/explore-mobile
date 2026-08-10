/**
 * 캡처 기하 기록과 좌표 변환 (SPEC-IMAGE-001 REQ-IMAGE-003~006).
 *
 * 이 SPEC 이전에는 곱셈의 주인이 **호출자**였다 —
 * `.claude/skills/explore-mobile/SKILL.md`가 "줄어든 이미지를 보면 곱해서
 * 되돌리라"고 지시했고, 그래서 좌표 오류가 구조적으로 재발했다(spec.md §A.1-③).
 * 이 모듈이 그 곱셈을 코드로 가져온다.
 *
 * 세 가지를 한 곳에 둔다:
 *   1. 기하 타입과 사이드카 입출력 — 캡처와 배율을 짝지어 남긴다
 *   2. 좌표 변환 산술 — 순수 함수. 배율·반올림·경계만 다룬다
 *   3. 신선도 판정 — 산술이 맞아도 화면이 이미 바뀌었을 수 있다
 *
 * @MX:ANCHOR — `toDeviceCoordinate`는 `tap`/`swipe`/`scroll` 세 명령이
 * 공유하는 유일한 변환 지점이다.
 * @MX:REASON — 같은 산술을 세 곳에 복사하면 한 곳만 고쳐졌을 때 세 명령이
 * 서로 다른 좌표를 보내게 되고, 그 차이는 실기기 탭이 빗나가기 전까지
 * 드러나지 않는다(plan.md §A.2 M4 「세 곳에 같은 산술을 복사하지 않는다」).
 * @MX:SPEC: SPEC-IMAGE-001 REQ-IMAGE-004
 */

import { readFile, writeFile } from "node:fs/promises";

import { CaptureGeometryUnavailableError, CaptureStaleError } from "./image-errors.js";

/**
 * 캡처 한 장의 기하. 응답 본문(REQ-IMAGE-003)과 사이드카(REQ-IMAGE-005)가
 * 같은 형태를 쓴다 — 두 곳에 다른 형태를 두면 어긋난다.
 */
export interface CaptureGeometry {
  /** 출력 이미지의 가로(px). 실제 출력 파일에서 관측한 값이다. */
  width: number;
  /** 출력 이미지의 세로(px). */
  height: number;
  /** 기기 원본 캡처의 가로(px). */
  deviceWidth: number;
  /** 기기 원본 캡처의 세로(px). */
  deviceHeight: number;
  /** `deviceWidth / width`. `--full`이면 1.0이다. */
  scale: number;
  format: string;
  /** ISO-8601. 신선도 판정의 기준(REQ-IMAGE-006). */
  capturedAt: string;
}

export interface DevicePoint {
  x: number;
  y: number;
}

/**
 * 가로·세로 배율이 어긋나도 허용하는 상대 오차.
 *
 * 축소는 종횡비를 보존하지만 출력이 정수 픽셀로 반올림되므로 두 배율은
 * 정확히 같아지지 않는다 — 예: iPad 2732×2048 → 763×1568에서
 * 2732/763 = 3.5806, 2048/1568 = 1.3061처럼 **크게** 다르면 비균등이고,
 * 반올림 차이는 1% 미만에 머문다. 이 값은 그 둘을 가르는 문턱이다.
 *
 * @MX:NOTE — 1%는 설계 선택이지 실측값이 아니다. 목적은 "한 축만 줄어든
 * 기하를 조용히 받아들이지 않는 것"이며 정밀한 경계를 긋는 것이 아니다.
 */
const SCALE_MISMATCH_TOLERANCE = 0.01;

/** `<capture>.geometry.json` — 본 파일 옆에 나란히 둔다(REQ-IMAGE-005). */
export function geometrySidecarPath(capturePath: string): string {
  return `${capturePath}.geometry.json`;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * 읽어들인 값이 온전한 기하인지 검사한다. 필드가 하나라도 없거나 비균등이면
 * `undefined` — **부족한 값을 기본값으로 메우지 않는다**.
 *
 * 메우면 안 되는 이유: 기록이 없다는 것은 "배율이 1.0"이 아니라 "배율을
 * 모른다"는 뜻이다. 모르는 것을 1.0으로 가정하면 축소 캡처의 좌표가 그대로
 * 기기에 전달돼 엉뚱한 곳을 누른다(AC-IMAGE-026).
 */
function toGeometry(value: unknown): CaptureGeometry | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const v = value as Record<string, unknown>;

  if (
    !isPositiveFiniteNumber(v.width) ||
    !isPositiveFiniteNumber(v.height) ||
    !isPositiveFiniteNumber(v.deviceWidth) ||
    !isPositiveFiniteNumber(v.deviceHeight) ||
    !isPositiveFiniteNumber(v.scale) ||
    typeof v.format !== "string" ||
    typeof v.capturedAt !== "string"
  ) {
    return undefined;
  }

  // 비균등 축소 거부: `scale`은 가로에서 도출되므로, 세로 배율이 크게 다르면
  // 세로 좌표가 조용히 어긋난다. 한쪽만 쓰고 넘어가지 않는다(plan.md §A.2 M2).
  const verticalScale = v.deviceHeight / v.height;
  const relativeGap = Math.abs(verticalScale - v.scale) / v.scale;
  if (relativeGap > SCALE_MISMATCH_TOLERANCE) return undefined;

  return {
    width: v.width,
    height: v.height,
    deviceWidth: v.deviceWidth,
    deviceHeight: v.deviceHeight,
    scale: v.scale,
    format: v.format,
    capturedAt: v.capturedAt,
  };
}

/** 캡처 옆에 기하를 기록한다 (REQ-IMAGE-005). */
export async function writeCaptureGeometry(capturePath: string, geometry: CaptureGeometry): Promise<void> {
  await writeFile(geometrySidecarPath(capturePath), `${JSON.stringify(geometry, null, 2)}\n`);
}

/**
 * 캡처의 기하를 읽는다. 부재·손상·비균등은 전부 거부다 —
 * 어느 경우에도 배율을 추측하지 않는다(REQ-IMAGE-005 후반부).
 */
export async function readCaptureGeometry(capturePath: string): Promise<CaptureGeometry> {
  const sidecar = geometrySidecarPath(capturePath);

  let raw: string;
  try {
    raw = await readFile(sidecar, "utf8");
  } catch (err) {
    throw new CaptureGeometryUnavailableError(
      `캡처의 기하 기록을 읽을 수 없습니다: ${sidecar} — ${err instanceof Error ? err.message : String(err)}. ` +
        "이 캡처는 --from으로 쓸 수 없습니다. screenshot --out으로 다시 캡처하세요.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new CaptureGeometryUnavailableError(
      `캡처의 기하 기록이 올바른 JSON이 아닙니다: ${sidecar} — ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const geometry = toGeometry(parsed);
  if (geometry === undefined) {
    throw new CaptureGeometryUnavailableError(
      `캡처의 기하 기록이 온전하지 않습니다(필드 결손 또는 가로·세로 배율 불일치): ${sidecar}. ` +
        "배율을 추측하지 않고 거부합니다.",
    );
  }

  return geometry;
}

/**
 * 이미지 좌표를 기기 좌표로 되돌린다 (REQ-IMAGE-004).
 *
 * 반올림 후 기기 해상도 경계 안으로 자른다(AC-IMAGE-011) — 이미지 우하단
 * 끝 좌표는 배율을 곱하면 `deviceWidth`와 같아져 유효 범위(0 ~ deviceWidth-1)를
 * 한 칸 넘는다.
 */
export function toDeviceCoordinate(geometry: CaptureGeometry, x: number, y: number): DevicePoint {
  const clamp = (value: number, max: number): number => Math.min(Math.max(value, 0), max);
  return {
    x: clamp(Math.round(x * geometry.scale), geometry.deviceWidth - 1),
    y: clamp(Math.round(y * geometry.scale), geometry.deviceHeight - 1),
  };
}

/**
 * `기기좌표 - (이미지좌표 × scale)`의 절대값 (AC-IMAGE-012).
 *
 * **임계 판정이 아니라 관측 기록용이다**(spec.md §C.3). 자르지 않은 좌표에서는
 * 반올림 한계인 0.5 이하지만, 경계에서 잘린 좌표는 그보다 커진다 — 그 사실을
 * 감추지 않기 위해 잘린 값 기준으로 계산한다.
 */
export function roundingResidual(geometry: CaptureGeometry, x: number, y: number): { x: number; y: number } {
  const device = toDeviceCoordinate(geometry, x, y);
  return {
    x: Math.abs(device.x - x * geometry.scale),
    y: Math.abs(device.y - y * geometry.scale),
  };
}

export interface FreshnessCheck {
  now: Date;
  staleMs: number;
  staleOk: boolean;
}

/**
 * 캡처가 너무 낡지 않았는지 확인한다 (REQ-IMAGE-006).
 *
 * 읽을 수 없는 `capturedAt`은 **신선하다고 가정하지 않는다** — 모르는 시각을
 * 통과시키면 신선도 검사 전체가 무력해진다. 오류 메시지에 캡처 시각과 경과
 * 시간을 함께 싣는다(AC-IMAGE-028): "낡았다"만 말하면 사용자는 얼마나
 * 낡았는지 몰라 다시 캡처해야 하는지 판단할 수 없다.
 */
export function assertCaptureFresh(geometry: CaptureGeometry, check: FreshnessCheck): void {
  if (check.staleOk) return;

  const capturedMs = Date.parse(geometry.capturedAt);
  if (Number.isNaN(capturedMs)) {
    throw new CaptureStaleError(
      `캡처 시각을 읽을 수 없습니다: capturedAt="${geometry.capturedAt}". ` +
        "신선도를 확인할 수 없으므로 거부합니다. --stale-ok로 명시하면 진행합니다.",
    );
  }

  const elapsedMs = check.now.getTime() - capturedMs;
  if (elapsedMs > check.staleMs) {
    const elapsedSeconds = Math.round(elapsedMs / 1000);
    throw new CaptureStaleError(
      `캡처가 낡았습니다: capturedAt=${geometry.capturedAt}, 경과 ${elapsedSeconds}초 ` +
        `(상한 ${Math.round(check.staleMs / 1000)}초). 화면이 이미 바뀌었을 수 있습니다. ` +
        "다시 캡처하거나 --stale-ok로 명시하세요.",
    );
  }
}
