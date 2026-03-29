// main.js — メインループ・車操作・Plotlyグラフ更新（垂直スキャン対応）

(function () {
  'use strict';

  const canvas = document.getElementById('canvas-map');
  Renderer.init(canvas);
  UI.init();

  const vehicle = { x: 0, y: 0, angle: 90, speed: 0.08, turnSpeed: 2 };

  const keys = {};
  window.addEventListener('keydown', e => {
    keys[e.key] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
  });
  window.addEventListener('keyup', e => { keys[e.key] = false; });

  UI.enableWallPlacement(canvas, () => ({ x: 300, y: 300 }));

  const plotlyLayout = {
    paper_bgcolor: '#1a1a1a',
    plot_bgcolor: '#1a1a1a',
    font: { color: '#888', size: 10 },
    margin: { l: 50, r: 20, t: 20, b: 40 },
  };

  // 水平角度の配列
  const horizAngles = [];
  for (let i = 0; i < Physics.LIDAR_RAYS; i++) {
    horizAngles.push(Physics.LIDAR_START_DEG + i * ((Physics.LIDAR_END_DEG - Physics.LIDAR_START_DEG) / (Physics.LIDAR_RAYS - 1)));
  }

  // 垂直角度の配列
  const vertAngles = [];
  for (let i = 0; i < Physics.VERT_RAYS; i++) {
    vertAngles.push(Physics.VERT_START_DEG + i * Physics.VERT_STEP);
  }

  // ヒートマップ初期化
  Plotly.newPlot('chart-heatmap', [{
    z: [], x: horizAngles, y: vertAngles,
    type: 'heatmap',
    colorscale: [[0, '#111'], [0.3, '#553300'], [0.6, '#aa6600'], [1, '#ffcc00']],
    zmin: 0, zmax: 255,
    colorbar: { title: '強度', titleside: 'right', tickfont: { size: 9 } }
  }], {
    ...plotlyLayout,
    xaxis: { title: '水平角度 (°)', color: '#666', range: [225, 45] },
    yaxis: { title: '垂直角度 (°)', color: '#666', range: [-35, 35] },
  }, { responsive: true, displayModeBar: false });

  // 3Dグラフ初期化: 軸の目盛り・レンジ・比率を完全固定
  Plotly.newPlot('chart-3d', [{
    x: [0], y: [0], z: [0],
    type: 'scatter3d', mode: 'markers',
    marker: {
      size: 2.5, color: [0],
      colorscale: [[0, '#222'], [0.3, '#553300'], [0.6, '#aa6600'], [1, '#ffcc00']],
      cmin: 0, cmax: 255,
      colorbar: { title: '強度', titleside: 'right', tickfont: { size: 9 } }
    }
  }], {
    ...plotlyLayout,
    scene: {
      xaxis: {
        title: '水平角度(°)', color: '#666', gridcolor: '#333',
        range: [45, 225], dtick: 30, autorange: false
      },
      yaxis: {
        title: '反射強度', color: '#666', gridcolor: '#333',
        range: [0, 260], dtick: 50, autorange: false
      },
      zaxis: {
        title: '垂直角度(°)', color: '#666', gridcolor: '#333',
        range: [-90, 90], dtick: 30, autorange: false
      },
      aspectmode: 'cube',
      bgcolor: '#1a1a1a',
      camera: { eye: { x: 1.8, y: -1.5, z: 0.8 } },
      dragmode: 'orbit'
    }
  }, { responsive: true, displayModeBar: false, scrollZoom: false });

  let frameCount = 0, lastFpsTime = performance.now();
  const fpsEl = document.getElementById('fps-counter');
  const vehicleInfoEl = document.getElementById('vehicle-info');
  let chartCounter = 0;
  const CHART_INTERVAL = 8;

  // ★ 3Dグラフのドラッグ中はデータ更新を一時停止
  let isDragging3D = false;
  const chart3dEl = document.getElementById('chart-3d');
  chart3dEl.addEventListener('mousedown', () => { isDragging3D = true; });
  window.addEventListener('mouseup', () => { isDragging3D = false; });

  // ★ 3Dグラフカメラ操作（手動での1度ごとの微調整）
  function rotateCamera(axis, sign) {
    if (!chart3dEl || !chart3dEl.layout || !chart3dEl.layout.scene || !chart3dEl.layout.scene.camera) return;

    // 現在のeyeベクトルを取得
    let eye = chart3dEl.layout.scene.camera.eye || { x: 1.8, y: -1.5, z: 0.8 };
    const angle = sign * Math.PI / 180; // 1度をラジアンに
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const newEye = { x: eye.x, y: eye.y, z: eye.z };

    if (axis === 'x') {
      newEye.y = eye.y * cosA - eye.z * sinA;
      newEye.z = eye.y * sinA + eye.z * cosA;
    } else if (axis === 'y') {
      newEye.x = eye.x * cosA + eye.z * sinA;
      newEye.z = -eye.x * sinA + eye.z * cosA;
    } else if (axis === 'z') {
      newEye.x = eye.x * cosA - eye.y * sinA;
      newEye.y = eye.x * sinA + eye.y * cosA;
    }

    Plotly.relayout('chart-3d', { 'scene.camera.eye': newEye });
  }

  ['x', 'y', 'z'].forEach(axis => {
    const btnM = document.getElementById(`cam-${axis}-m`);
    const btnP = document.getElementById(`cam-${axis}-p`);
    if (btnM) btnM.addEventListener('click', () => rotateCamera(axis, -1));
    if (btnP) btnP.addEventListener('click', () => rotateCamera(axis, 1));
  });

  function loop() {
    const now = performance.now();
    const aRad = Physics.deg2rad(vehicle.angle);

    if (keys['w'] || keys['ArrowUp']) {
      vehicle.x += Math.cos(aRad) * vehicle.speed;
      vehicle.y += Math.sin(aRad) * vehicle.speed;
    }
    if (keys['s'] || keys['ArrowDown']) {
      vehicle.x -= Math.cos(aRad) * vehicle.speed;
      vehicle.y -= Math.sin(aRad) * vehicle.speed;
    }
    if (keys['a'] || keys['ArrowLeft']) { vehicle.angle += vehicle.turnSpeed; }
    if (keys['d'] || keys['ArrowRight']) { vehicle.angle -= vehicle.turnSpeed; }
    if (keys['q']) { vehicle.angle += vehicle.turnSpeed * 0.5; }
    if (keys['e']) { vehicle.angle -= vehicle.turnSpeed * 0.5; }

    const walls = UI.getWalls();
    const segments = Physics.buildAllSegments(walls);
    const scanPoints = Physics.scan(vehicle, segments);

    Renderer.clear();
    Renderer.drawWalls(walls);
    Renderer.drawRays(vehicle, scanPoints);
    Renderer.drawVehicle(vehicle);

    vehicleInfoEl.textContent =
      `X: ${vehicle.x.toFixed(2)}  Y: ${vehicle.y.toFixed(2)}  θ: ${vehicle.angle.toFixed(0)}°  LiDAR高さ: ${Physics.LIDAR_HEIGHT}m`;

    chartCounter++;
    if (chartCounter >= CHART_INTERVAL) {
      chartCounter = 0;
      updateCharts(scanPoints);
    }

    frameCount++;
    if (now - lastFpsTime > 1000) {
      fpsEl.textContent = `${frameCount} FPS`;
      frameCount = 0;
      lastFpsTime = now;
    }

    requestAnimationFrame(loop);
  }

  function updateCharts(scanPoints) {
    const { intensityMap, vertAngles: vAngles } = Physics.scanVertical(scanPoints);

    // ヒートマップ: データのみ更新
    Plotly.restyle('chart-heatmap', {
      z: [intensityMap],
      x: [horizAngles],
      y: [vAngles],
    });

    // 3Dグラフ: データ点を展開
    const xArr = [], yArr = [], zArr = [], cArr = [];
    for (let vi = 0; vi < vAngles.length; vi++) {
      for (let hi = 0; hi < horizAngles.length; hi++) {
        const intensity = intensityMap[vi][hi];
        if (intensity > 1) {
          xArr.push(horizAngles[hi]);
          yArr.push(intensity);
          zArr.push(vAngles[vi]);
          cArr.push(intensity);
        }
      }
    }

    // ★ Plotly.restyle でデータだけ更新
    // ドラッグ中はスキップして回転操作を阻害しない
    if (!isDragging3D) {
      Plotly.restyle('chart-3d', {
        x: [xArr],
        y: [yArr],
        z: [zArr],
        'marker.color': [cArr],
      });
    }
  }

  // デフォルト壁を追加
  (function addDefaultWalls() {
    const w = UI.getWalls();
    w.push({
      id: 0, type: 'flat', material: 'glass', length: 6, angle: 90,
      x: -3, y: 0, bendAngle: 90, radius: 3, arcAngle: 90
    });
    w.push({
      id: 1, type: 'flat', material: 'concrete', length: 6, angle: 0,
      x: 0, y: 5, bendAngle: 90, radius: 3, arcAngle: 90
    });

    const container = document.getElementById('wall-list');
    if (container) {
      const typeNames = { flat: '平面', bent: '屈曲', curved: '曲面' };
      for (const wall of w) {
        const mat = Physics.MATERIALS[wall.material];
        const div = document.createElement('div');
        div.className = 'wall-item';
        const info = document.createElement('span');
        info.textContent = `${typeNames[wall.type]} / ${mat.name} / ${wall.length}m`;
        const angleGroup = document.createElement('span');
        angleGroup.className = 'angle-group';
        const btnL = document.createElement('button');
        btnL.textContent = '◀';
        btnL.addEventListener('click', () => {
          wall.angle = (wall.angle - 5 + 360) % 360;
          angleLabel.textContent = `${wall.angle}°`;
        });
        const angleLabel = document.createElement('span');
        angleLabel.className = 'angle-label';
        angleLabel.textContent = `${wall.angle}°`;
        const btnR = document.createElement('button');
        btnR.textContent = '▶';
        btnR.addEventListener('click', () => {
          wall.angle = (wall.angle + 5) % 360;
          angleLabel.textContent = `${wall.angle}°`;
        });
        const btnDel = document.createElement('button');
        btnDel.textContent = '✕';
        btnDel.addEventListener('click', () => {
          const idx = w.findIndex(x => x.id === wall.id);
          if (idx >= 0) w.splice(idx, 1);
          div.remove();
        });
        angleGroup.appendChild(btnL);
        angleGroup.appendChild(angleLabel);
        angleGroup.appendChild(btnR);
        angleGroup.appendChild(btnDel);
        div.appendChild(info);
        div.appendChild(angleGroup);
        container.appendChild(div);
      }
    }
  })();

  requestAnimationFrame(loop);
})();
