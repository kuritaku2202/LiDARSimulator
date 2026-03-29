// physics.js — LiDAR物理モデル・レイキャスト・反射強度計算（垂直スキャン対応）

const Physics = (() => {
  const MATERIALS = {
    glass:    { name: 'ガラス',     Imax: 180, sigmaH: 8,  sigmaV: 8,  transmit: 0.85, color: '#4488cc' },
    acrylic:  { name: 'アクリル',   Imax: 160, sigmaH: 10, sigmaV: 10, transmit: 0.80, color: '#66aacc' },
    concrete: { name: 'コンクリート', Imax: 255, sigmaH: 90, sigmaV: 90, transmit: 0,   color: '#888888' },
    metal:    { name: 'メタル',     Imax: 255, sigmaH: 60, sigmaV: 60, transmit: 0,   color: '#aaaaaa' },
  };

  // 水平スキャンパラメータ
  const LIDAR_MAX_RANGE = 15;
  const LIDAR_START_DEG = 45;
  const LIDAR_END_DEG = 225;
  const LIDAR_RAYS = 180;
  const RAY_STEP = (LIDAR_END_DEG - LIDAR_START_DEG) / (LIDAR_RAYS - 1);

  // 垂直スキャンパラメータ
  const LIDAR_HEIGHT = 0.3;       // LiDAR設置高さ (m)
  const WALL_HEIGHT = 2.5;        // 壁の高さ (m)
  const VERT_START_DEG = -90;     // 垂直スキャン開始角 (下向き)
  const VERT_END_DEG = 90;        // 垂直スキャン終了角 (上向き)
  const VERT_RAYS = 91;           // 垂直方向のレイ数 (2度刻み)
  const VERT_STEP = (VERT_END_DEG - VERT_START_DEG) / (VERT_RAYS - 1);

  function deg2rad(d) { return d * Math.PI / 180; }
  function rad2deg(r) { return r * 180 / Math.PI; }

  // 距離減衰パラメータ
  // 基準距離: この距離で減衰なし。それ以上で逆二乗則に従い減衰
  const DIST_REF = 1.0; // 基準距離 (m)

  // 光学的な特性に基づくガウス型分布モデル（水平・垂直独立）
  function gaussianIntensity(horizAngleDeg, vertAngleDeg, mat, distance) {
    const m = MATERIALS[mat] || MATERIALS.concrete;
    
    // 水平方向のガウス分布
    const gH = Math.exp(-(horizAngleDeg * horizAngleDeg) / (2 * m.sigmaH * m.sigmaH));
    // 垂直方向のガウス分布
    const gV = Math.exp(-(vertAngleDeg * vertAngleDeg) / (2 * m.sigmaV * m.sigmaV));
    
    const angular = m.Imax * gH * gV;
    
    // 距離減衰: I ∝ 1/(1 + (d/d_ref)²)
    const distAtten = DIST_REF * DIST_REF / (DIST_REF * DIST_REF + distance * distance);
    return angular * distAtten;
  }

  function raySegmentIntersect(ox, oy, dx, dy, x1, y1, x2, y2) {
    const sx = x2 - x1, sy = y2 - y1;
    const denom = dx * sy - dy * sx;
    if (Math.abs(denom) < 1e-10) return null;
    const t = ((x1 - ox) * sy - (y1 - oy) * sx) / denom;
    const u = ((x1 - ox) * dy - (y1 - oy) * dx) / denom;
    if (t > 0.01 && u >= 0 && u <= 1) {
      return { t, u, hx: ox + dx * t, hy: oy + dy * t };
    }
    return null;
  }

  function getWallSegments(wall) {
    const segs = [];
    const cx = wall.x, cy = wall.y;
    const aRad = deg2rad(wall.angle);

    if (wall.type === 'flat') {
      const halfL = wall.length / 2;
      const dx = Math.cos(aRad) * halfL;
      const dy = Math.sin(aRad) * halfL;
      segs.push({ x1: cx - dx, y1: cy - dy, x2: cx + dx, y2: cy + dy, mat: wall.material });
    }
    else if (wall.type === 'bent') {
      const halfL = wall.length / 2;
      const bendRad = deg2rad(wall.bendAngle) / 2;
      const a1 = aRad - bendRad;
      segs.push({ x1: cx, y1: cy, x2: cx + Math.cos(a1) * halfL, y2: cy + Math.sin(a1) * halfL, mat: wall.material });
      const a2 = aRad + bendRad;
      segs.push({ x1: cx, y1: cy, x2: cx + Math.cos(a2) * halfL, y2: cy + Math.sin(a2) * halfL, mat: wall.material });
    }
    else if (wall.type === 'curved') {
      const r = wall.radius;
      const arcDeg = wall.arcAngle;
      const steps = Math.max(12, Math.floor(arcDeg / 3));
      const startA = aRad - deg2rad(arcDeg) / 2;
      const centerX = cx - r * Math.cos(aRad);
      const centerY = cy - r * Math.sin(aRad);
      for (let i = 0; i < steps; i++) {
        const a1 = startA + deg2rad(arcDeg) * (i / steps);
        const a2 = startA + deg2rad(arcDeg) * ((i + 1) / steps);
        segs.push({
          x1: centerX + r * Math.cos(a1), y1: centerY + r * Math.sin(a1),
          x2: centerX + r * Math.cos(a2), y2: centerY + r * Math.sin(a2),
          mat: wall.material
        });
      }
    }
    return segs;
  }

  function buildAllSegments(walls) {
    const all = [];
    for (const w of walls) {
      for (const s of getWallSegments(w)) {
        const sx = s.x2 - s.x1, sy = s.y2 - s.y1;
        const len = Math.sqrt(sx * sx + sy * sy);
        if (len < 1e-6) continue;
        s.normalX = -sy / len;
        s.normalY = sx / len;
        all.push(s);
      }
    }
    return all;
  }

  // 水平スキャン（2D鳥瞰図用）
  function scan(vehicle, segments) {
    const points = [];
    const ox = vehicle.x, oy = vehicle.y;
    const vAng = vehicle.angle;

    for (let i = 0; i < LIDAR_RAYS; i++) {
      const localDeg = LIDAR_START_DEG + i * RAY_STEP;
      const worldDeg = vAng + (localDeg - 90);
      const worldRad = deg2rad(worldDeg);
      const dx = Math.cos(worldRad);
      const dy = Math.sin(worldRad);

      let closest = null;
      let minT = LIDAR_MAX_RANGE;

      for (const seg of segments) {
        const hit = raySegmentIntersect(ox, oy, dx, dy, seg.x1, seg.y1, seg.x2, seg.y2);
        if (hit && hit.t < minT) {
          minT = hit.t;
          closest = { ...hit, mat: seg.mat, normalX: seg.normalX, normalY: seg.normalY };
        }
      }

      if (closest) {
        // 垂直方向のロジックに合わせて、水平方向（垂直角0°）における壁高さチェックを追加
        const heightAtWall = LIDAR_HEIGHT;
        if (heightAtWall < 0 || heightAtWall > WALL_HEIGHT) {
          // 壁の高さ範囲外の場合はヒットせず通過したものとみなす
          points.push({
            index: i, localAngle: localDeg, distance: LIDAR_MAX_RANGE,
            intensity: 0, hitX: ox + dx * LIDAR_MAX_RANGE, hitY: oy + dy * LIDAR_MAX_RANGE,
            material: null, incidentAngle: 90
          });
        } else {
          // 壁の範囲内の場合
          const dot = Math.abs(dx * closest.normalX + dy * closest.normalY);
          const incidentAngleDeg = rad2deg(Math.acos(Math.min(1, dot)));
          // 水平スキャンでは垂直角は0°
          const intensity = gaussianIntensity(incidentAngleDeg, 0, closest.mat, closest.t);
          points.push({
            index: i, localAngle: localDeg, distance: closest.t,
            intensity, hitX: closest.hx, hitY: closest.hy,
            material: closest.mat, incidentAngle: incidentAngleDeg
          });
        }
      } else {
        points.push({
          index: i, localAngle: localDeg, distance: LIDAR_MAX_RANGE,
          intensity: 0, hitX: ox + dx * LIDAR_MAX_RANGE, hitY: oy + dy * LIDAR_MAX_RANGE,
          material: null, incidentAngle: 90
        });
      }
    }
    return points;
  }

  // 垂直スキャン: 水平スキャン結果をもとに垂直方向の反射強度マップを生成
  // 返値: intensityMap[vertIndex][horizIndex] の2D配列
  function scanVertical(horizontalPoints) {
    const intensityMap = [];
    const vertAngles = [];

    for (let vi = 0; vi < VERT_RAYS; vi++) {
      const vertDeg = VERT_START_DEG + vi * VERT_STEP;
      vertAngles.push(vertDeg);
      const tanV = Math.tan(deg2rad(vertDeg));
      const cosV = Math.cos(deg2rad(vertDeg));

      const row = [];
      for (let hi = 0; hi < LIDAR_RAYS; hi++) {
        const hp = horizontalPoints[hi];

        if (!hp.material) {
          // 水平方向で壁にヒットしなかった → 強度0
          row.push(0);
          continue;
        }

        // 壁面上のヒット高さを計算
        // LiDAR高さ + 水平距離 × tan(垂直角)
        const heightAtWall = LIDAR_HEIGHT + hp.distance * tanV;

        // 壁の範囲内（地面〜壁の高さ）かどうか
        if (heightAtWall < 0 || heightAtWall > WALL_HEIGHT) {
          row.push(0);
          continue;
        }

        // 壁の法線は水平のみなため、垂直入射角 = rayの垂直角 (vertDeg)
        // 水平入射角は2D計算済みの hp.incidentAngle
        
        // 3D距離 = 水平距離 / cos(垂直角)
        const dist3D = hp.distance / cosV;
        
        // 垂直・水平独立のガウス分布を適用して反射強度を計算
        const intensity = gaussianIntensity(hp.incidentAngle, vertDeg, hp.material, dist3D);
        row.push(intensity);
      }
      intensityMap.push(row);
    }

    return { intensityMap, vertAngles };
  }

  return {
    MATERIALS, LIDAR_MAX_RANGE, LIDAR_START_DEG, LIDAR_END_DEG, LIDAR_RAYS,
    LIDAR_HEIGHT, WALL_HEIGHT, VERT_START_DEG, VERT_END_DEG, VERT_RAYS, VERT_STEP,
    deg2rad, rad2deg, getWallSegments, buildAllSegments, scan, scanVertical
  };
})();
