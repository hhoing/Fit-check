import { NextRequest, NextResponse } from "next/server";
import { CommuteInfo, MapPoint } from "@/types";

type GeocodeAddress = {
  roadAddress?: string;
  jibunAddress?: string;
  x: string;
  y: string;
};

type GeocodeResponse = {
  status?: string;
  addresses?: GeocodeAddress[];
  errorMessage?: string;
};

type DirectionRoute = {
  summary?: {
    distance?: number;
    duration?: number;
  };
  path?: Array<[number, number]>;
};

type DirectionResponse = {
  code?: number;
  message?: string;
  route?: Record<string, DirectionRoute[]>;
};

type CommuteApiResponse = CommuteInfo & {
  configured: boolean;
  origin?: string;
  destination?: string;
};

const NAVER_CLIENT_ID =
  process.env.NAVER_MAP_CLIENT_ID ??
  process.env.NAVER_MAPS_CLIENT_ID ??
  process.env.NCP_MAP_CLIENT_ID;

const NAVER_CLIENT_SECRET =
  process.env.NAVER_MAP_CLIENT_SECRET ??
  process.env.NAVER_MAPS_CLIENT_SECRET ??
  process.env.NCP_MAP_CLIENT_SECRET;

const HOME_ADDRESS = process.env.NEXT_PUBLIC_HOME_ADDRESS;
const NAVER_API_BASE = "https://maps.apigw.ntruss.com";

function naverHeaders(): HeadersInit {
  return {
    "x-ncp-apigw-api-key-id": NAVER_CLIENT_ID ?? "",
    "x-ncp-apigw-api-key": NAVER_CLIENT_SECRET ?? "",
    Accept: "application/json",
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      headers: naverHeaders(),
      signal: controller.signal,
      cache: "no-store",
    });

    const data = (await res.json()) as T;
    if (!res.ok) {
      const message =
        typeof data === "object" && data && "errorMessage" in data
          ? String((data as { errorMessage?: string }).errorMessage)
          : `HTTP ${res.status}`;
      throw new Error(message);
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function geocode(address: string): Promise<GeocodeAddress> {
  const params = new URLSearchParams({ query: address });
  const data = await fetchJson<GeocodeResponse>(
    `${NAVER_API_BASE}/map-geocode/v2/geocode?${params.toString()}`
  );

  const first = data.addresses?.[0];
  if (!first) {
    throw new Error(`주소를 좌표로 변환하지 못했습니다: ${address}`);
  }

  return first;
}

function toMapPoint(point: GeocodeAddress): MapPoint {
  return {
    lat: Number(point.y),
    lng: Number(point.x),
  };
}

function toRoutePath(path: Array<[number, number]> | undefined): MapPoint[] | undefined {
  const routePath = path
    ?.map(([lng, lat]) => ({ lat, lng }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));

  return routePath && routePath.length > 1 ? routePath : undefined;
}

async function getDrivingReference(
  origin: GeocodeAddress,
  destination: GeocodeAddress
): Promise<Partial<CommuteInfo>> {
  const params = new URLSearchParams({
    start: `${origin.x},${origin.y}`,
    goal: `${destination.x},${destination.y}`,
    option: "traoptimal",
  });
  const data = await fetchJson<DirectionResponse>(
    `${NAVER_API_BASE}/map-direction/v1/driving?${params.toString()}`
  );

  const route =
    data.route?.traoptimal?.[0] ??
    data.route?.trafast?.[0] ??
    Object.values(data.route ?? {})[0]?.[0];

  if (!route) {
    throw new Error(data.message || "자동차 참고 경로를 찾지 못했습니다.");
  }

  const durationMs = route.summary?.duration ?? 0;
  const distance = route.summary?.distance;

  return {
    duration: durationMs > 0 ? Math.max(1, Math.round(durationMs / 60000)) : 0,
    distance,
    routePath: toRoutePath(route.path),
  };
}

function getToday0730DepartureTime(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${valueByType.year}-${valueByType.month}-${valueByType.day}T07:30:00+09:00`;
}

function createNaverRouteMapUrl(
  origin: GeocodeAddress,
  destination: GeocodeAddress,
  originName: string,
  destinationName: string
): string {
  const params = new URLSearchParams({
    slng: origin.x,
    slat: origin.y,
    stext: originName,
    elng: destination.x,
    elat: destination.y,
    etext: destinationName,
    menu: "route",
    pathType: "1",
    departureTime: getToday0730DepartureTime(),
  });

  return `https://map.naver.com/index.nhn?${params.toString()}`;
}

export async function POST(req: NextRequest) {
  try {
    const { destination } = (await req.json()) as { destination?: string };

    if (!destination?.trim() || destination.trim() === "미확인") {
      return NextResponse.json(
        { error: "근무지 주소가 필요합니다." },
        { status: 400 }
      );
    }

    if (!HOME_ADDRESS?.trim()) {
      return NextResponse.json<CommuteApiResponse>({
        configured: false,
        duration: 0,
        method: "미설정",
        route: "NEXT_PUBLIC_HOME_ADDRESS를 .env.local에 설정해 주세요.",
        isDummy: true,
        provider: "fallback",
        error: "출발지 주소가 설정되지 않았습니다.",
      });
    }

    if (/\?{2,}/.test(HOME_ADDRESS) || HOME_ADDRESS.includes("\uFFFD")) {
      return NextResponse.json<CommuteApiResponse>({
        configured: false,
        duration: 0,
        method: "미설정",
        route: ".env.local의 NEXT_PUBLIC_HOME_ADDRESS가 깨져 있습니다. 파일을 UTF-8로 저장한 뒤 개발 서버를 다시 시작해 주세요.",
        isDummy: true,
        provider: "fallback",
        error: "출발지 주소 인코딩을 확인해 주세요.",
      });
    }

    if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
      return NextResponse.json<CommuteApiResponse>({
        configured: false,
        duration: 0,
        method: "미설정",
        route: "NAVER_MAP_CLIENT_ID와 NAVER_MAP_CLIENT_SECRET이 필요합니다.",
        isDummy: true,
        provider: "fallback",
        origin: HOME_ADDRESS,
        destination,
        error: "네이버 지도 API 키가 설정되지 않았습니다.",
      });
    }

    const [originPoint, destinationPoint] = await Promise.all([
      geocode(HOME_ADDRESS),
      geocode(destination),
    ]);
    const originName = originPoint.roadAddress || originPoint.jibunAddress || HOME_ADDRESS;
    const destinationName =
      destinationPoint.roadAddress || destinationPoint.jibunAddress || destination;
    let drivingReference: Partial<CommuteInfo> = {};

    try {
      drivingReference = await getDrivingReference(originPoint, destinationPoint);
    } catch {
      drivingReference = {};
    }

    return NextResponse.json<CommuteApiResponse>({
      configured: true,
      duration: drivingReference.duration ?? 0,
      method: drivingReference.duration ? "자동차 참고" : "대중교통",
      route: drivingReference.duration ? "참고 경로" : "웹 지도 경로 확인",
      isDummy: !drivingReference.duration,
      provider: "naver",
      distance: drivingReference.distance,
      origin: originName,
      destination: destinationName,
      mapClientId: NAVER_CLIENT_ID,
      originPoint: toMapPoint(originPoint),
      destinationPoint: toMapPoint(destinationPoint),
      routePath: drivingReference.routePath,
      mapUrl: createNaverRouteMapUrl(
        originPoint,
        destinationPoint,
        originName,
        destinationName
      ),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "통근 시간 계산 중 오류가 발생했습니다.";

    return NextResponse.json(
      {
        configured: Boolean(NAVER_CLIENT_ID && NAVER_CLIENT_SECRET),
        duration: 0,
        method: "계산 실패",
        route: message,
        isDummy: true,
        provider: "fallback",
        error: message,
      } satisfies CommuteApiResponse,
      { status: 502 }
    );
  }
}
