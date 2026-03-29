// ui.js — UI制御・壁エディタ・回転・ドラッグ配置

const UI = (() => {
  const walls = [];
  let wallIdCounter = 2; // デフォルト壁が id 0, 1

  function init() {
    // スライダー値表示の連動
    const sliders = [
      ['wall-length', 'val-length', v => parseFloat(v).toFixed(1)],
      ['wall-angle', 'val-angle', v => v],
      ['wall-bend', 'val-bend', v => v],
      ['wall-radius', 'val-radius', v => parseFloat(v).toFixed(1)],
      ['wall-arc', 'val-arc', v => v],
    ];
    for (const [id, labelId, fmt] of sliders) {
      const el = document.getElementById(id);
      const label = document.getElementById(labelId);
      el.addEventListener('input', () => { label.textContent = fmt(el.value); });
    }

    // 壁種類に応じたフィールド表示切替
    document.getElementById('wall-type').addEventListener('change', function() {
      document.getElementById('row-bend').classList.toggle('hidden', this.value !== 'bent');
      document.getElementById('row-radius').classList.toggle('hidden', this.value !== 'curved');
      document.getElementById('row-arc').classList.toggle('hidden', this.value !== 'curved');
    });

    document.getElementById('btn-add-wall').addEventListener('click', addWall);
    document.getElementById('btn-clear-walls').addEventListener('click', () => {
      walls.length = 0;
      renderWallList();
    });
  }

  function addWall() {
    const type = document.getElementById('wall-type').value;
    const material = document.getElementById('wall-material').value;
    const length = parseFloat(document.getElementById('wall-length').value);
    const angle = parseFloat(document.getElementById('wall-angle').value);
    const bendAngle = parseFloat(document.getElementById('wall-bend').value);
    const radius = parseFloat(document.getElementById('wall-radius').value);
    const arcAngle = parseFloat(document.getElementById('wall-arc').value);

    walls.push({
      id: wallIdCounter++, type, material, length, angle,
      bendAngle, radius, arcAngle, x: 3, y: 3
    });
    renderWallList();
  }

  function removeWall(id) {
    const idx = walls.findIndex(w => w.id === id);
    if (idx >= 0) walls.splice(idx, 1);
    renderWallList();
  }

  function rotateWall(id, delta) {
    const wall = walls.find(w => w.id === id);
    if (wall) {
      wall.angle = (wall.angle + delta + 360) % 360;
      renderWallList();
    }
  }

  function renderWallList() {
    const container = document.getElementById('wall-list');
    container.innerHTML = '';
    const typeNames = { flat: '平面', bent: '屈曲', curved: '曲面' };

    for (const w of walls) {
      const mat = Physics.MATERIALS[w.material];
      const div = document.createElement('div');
      div.className = 'wall-item';

      const info = document.createElement('span');
      info.textContent = `${typeNames[w.type]} / ${mat.name} / ${w.length}m`;

      // 角度表示 + 回転ボタン
      const angleGroup = document.createElement('span');
      angleGroup.className = 'angle-group';

      const btnLeft = document.createElement('button');
      btnLeft.textContent = '◀';
      btnLeft.title = '-5°';
      btnLeft.addEventListener('click', () => rotateWall(w.id, -5));

      const angleLabel = document.createElement('span');
      angleLabel.className = 'angle-label';
      angleLabel.textContent = `${w.angle}°`;

      const btnRight = document.createElement('button');
      btnRight.textContent = '▶';
      btnRight.title = '+5°';
      btnRight.addEventListener('click', () => rotateWall(w.id, 5));

      const btnDel = document.createElement('button');
      btnDel.textContent = '✕';
      btnDel.addEventListener('click', () => removeWall(w.id));

      angleGroup.appendChild(btnLeft);
      angleGroup.appendChild(angleLabel);
      angleGroup.appendChild(btnRight);
      angleGroup.appendChild(btnDel);

      div.appendChild(info);
      div.appendChild(angleGroup);
      container.appendChild(div);
    }
  }

  function getWalls() { return walls; }

  // Shift+ドラッグで壁の位置を移動
  function enableWallPlacement(canvas, getOffset) {
    let dragWall = null;
    canvas.addEventListener('mousedown', (e) => {
      if (e.shiftKey && walls.length > 0) {
        dragWall = walls[walls.length - 1];
      }
    });
    canvas.addEventListener('mousemove', (e) => {
      if (dragWall) {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const offset = getOffset();
        dragWall.x = (mx - offset.x) / Renderer.SCALE;
        dragWall.y = -(my - offset.y) / Renderer.SCALE;
      }
    });
    canvas.addEventListener('mouseup', () => { dragWall = null; });
  }

  return { init, getWalls, enableWallPlacement };
})();
