import { NextRequest, NextResponse } from "next/server";
import { MapPoint } from "@/types";

export const runtime = "nodejs";

const NAVER_CLIENT_ID =
  process.env.NAVER_MAP_CLIENT_ID ??
  process.env.NAVER_MAPS_CLIENT_ID ??
  process.env.NCP_MAP_CLIENT_ID;

const NAVER_CLIENT_SECRET =
  process.env.NAVER_MAP_CLIENT_SECRET ??
  process.env.NAVER_MAPS_CLIENT_SECRET ??
  process.env.NCP_MAP_CLIENT_SECRET;

const NAVER_STATIC_MAP_URL = "https://maps.apigw.ntruss.com/map-static/v2/raster";

function naverHeaders(): HeadersInit {
  return {
    "X-NCP-APIGW-API-KEY-ID": NAVER_CLIENT_ID ?? "",
    "X-NCP-APIGW-API-KEY": NAVER_CLIENT_SECRET ?? "",
  };
}

function readNumber(params: URLSearchParams, key: string): number | null {
  const value = Number(params.get(key));
  return Number.isFinite(value) ? value : null;
}

function readPath(params: URLSearchParams): MapPoint[] {
  return (params.get("path") ?? "")
    .split(";")
    .map((part) => {
      const [lng, lat] = part.split(",").map(Number);
      return { lat, lng };
    })
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function toPosition(point: MapPoint): string {
  return `${point.lng} ${point.lat}`;
}

function toCenter(points: MapPoint[]): MapPoint {
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);

  return {
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
    lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
  };
}

function getDistanceKm(a: MapPoint, b: MapPoint): number {
  const radiusKm = 6371;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  return 2 * radiusKm * Math.asin(Math.sqrt(haversine));
}

function inferLevel(points: MapPoint[]): number {
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const southWest = { lat: Math.min(...lats), lng: Math.min(...lngs) };
  const northEast = { lat: Math.max(...lats), lng: Math.max(...lngs) };
  const diagonalKm = getDistanceKm(southWest, northEast);

  if (diagonalKm > 120) return 13;
  if (diagonalKm > 70) return 12;
  if (diagonalKm > 30) return 11;
  if (diagonalKm > 12) return 10;
  if (diagonalKm > 6) return 9;
  if (diagonalKm > 3) return 8;
  if (diagonalKm > 1.5) return 7;
  return 6;
}

function clampLevel(level: number): number {
  return Math.max(0, Math.min(20, Math.round(level)));
}

function buildStaticMapParams(
  origin: MapPoint,
  destination: MapPoint,
  path: MapPoint[],
  requestedCenter?: MapPoint,
  requestedLevel?: number
) {
  const routePath = path.length > 1 ? path : [origin, destination];
  const boundsPoints = [origin, destination, ...routePath];
  const center = requestedCenter ?? toCenter(boundsPoints);
  const level = clampLevel(requestedLevel ?? inferLevel(boundsPoints));
  const params = new URLSearchParams({
    w: "900",
    h: "280",
    scale: "2",
    format: "png",
    maptype: "basic",
    lang: "ko",
    public_transit: "true",
    center: `${center.lng},${center.lat}`,
    level: String(level),
  });

  params.append("markers", `type:d|size:mid|color:blue|pos:${toPosition(origin)}`);
  params.append("markers", `type:d|size:mid|color:red|pos:${toPosition(destination)}`);
  params.append(
    "paths",
    `strokeWeight:7|strokeColor:green|strokeOpacity:0.85|pos:${routePath
      .map(toPosition)
      .join("|")}`
  );

  return params;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const originLng = readNumber(params, "olng");
  const originLat = readNumber(params, "olat");
  const destinationLng = readNumber(params, "dlng");
  const destinationLat = readNumber(params, "dlat");
  const centerLng = readNumber(params, "clng");
  const centerLat = readNumber(params, "clat");
  const requestedLevel = readNumber(params, "level");

  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
    return NextResponse.json({ error: "네이버 지도 API 키가 설정되지 않았습니다." }, { status: 503 });
  }

  if (
    originLng === null ||
    originLat === null ||
    destinationLng === null ||
    destinationLat === null
  ) {
    return NextResponse.json({ error: "지도 좌표가 부족합니다." }, { status: 400 });
  }

  const origin = { lat: originLat, lng: originLng };
  const destination = { lat: destinationLat, lng: destinationLng };
  const requestedCenter =
    centerLng === null || centerLat === null ? undefined : { lat: centerLat, lng: centerLng };
  const staticMapParams = buildStaticMapParams(
    origin,
    destination,
    readPath(params),
    requestedCenter,
    requestedLevel ?? undefined
  );
  const mapRes = await fetch(`${NAVER_STATIC_MAP_URL}?${staticMapParams.toString()}`, {
    headers: naverHeaders(),
    cache: "no-store",
  });

  if (!mapRes.ok) {
    const detail = await mapRes.text();
    return NextResponse.json(
      {
        error: `정적 지도를 불러오지 못했습니다. (${mapRes.status})`,
        detail: detail.slice(0, 300),
      },
      { status: mapRes.status }
    );
  }

  return new NextResponse(mapRes.body, {
    status: 200,
    headers: {
      "Content-Type": mapRes.headers.get("content-type") ?? "image/png",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
