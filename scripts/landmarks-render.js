// Render de los .obj de public/assets/runeterra/landmarks/models a sprites (ver README alli).
// Uso: bundlear con esbuild (requiere `npm i three`), servir con una pagina <pre id="out"> y abrir #<slug>;
// la pagina deja en #out un JSON con el PNG (dataURL) y el ancla. Rutas /lm/ = carpeta models/.
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
const slug = location.hash.slice(1);
const PX_PER_UNIT = 16, TILT = 40 * Math.PI / 180;
const out = document.getElementById('out');
(async () => {
  const cfg = (await (await fetch('/lm/config.json')).json())[slug];
  const root = new THREE.Group();
  const tl = new THREE.TextureLoader(), ol = new OBJLoader();
  for (const c of cfg.filter(c => c.type === 'obj')) {
    const [obj, tex] = await Promise.all([ol.loadAsync('/lm/' + c.map), tl.loadAsync('/lm/' + c.texture)]);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = obj.children[0];
    mesh.material = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.02 });
    mesh.scale.setScalar(c.scale); mesh.rotation.x = Math.PI / 2; mesh.rotation.y = c.rotY;
    mesh.position.set(c.offsetX, c.offsetY, c.offsetZ);
    root.add(mesh);
  }
  const scene = new THREE.Scene(); scene.add(root);
  const dir = new THREE.Vector3(0, -Math.sin(TILT), Math.cos(TILT));
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 1000);
  cam.up.set(0, 1, 0); cam.position.copy(dir.clone().multiplyScalar(100)); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  // extents in camera space
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const inv = cam.matrixWorldInverse; let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const v = new THREE.Vector3(x, y, z).applyMatrix4(inv); minX=Math.min(minX,v.x); maxX=Math.max(maxX,v.x); minY=Math.min(minY,v.y); maxY=Math.max(maxY,v.y);
  }
  const pad = 1; minX-=pad; minY-=pad; maxX+=pad; maxY+=pad;
  Object.assign(cam, { left: minX, right: maxX, top: maxY, bottom: minY }); cam.updateProjectionMatrix();
  // ancla = centro de la base del modelo (centro XY de la caja, z minima), proyectado
  const base = new THREE.Vector3((box.min.x+box.max.x)/2, (box.min.y+box.max.y)/2, box.min.z).applyMatrix4(inv);
  const w = Math.round((maxX - minX) * PX_PER_UNIT), h = Math.round((maxY - minY) * PX_PER_UNIT);
  const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1); r.setSize(w, h); r.setClearColor(0x000000, 0); r.outputColorSpace = THREE.SRGBColorSpace;
  r.render(scene, cam);
  // anchor = pin (origin) projected; camera-space origin (0,0)
  out.textContent = JSON.stringify({ slug, w, h, pxPerUnit: PX_PER_UNIT, tiltDeg: 40, anchorX: (base.x - minX) * PX_PER_UNIT, anchorY: (maxY - base.y) * PX_PER_UNIT, pinX: (0 - minX) * PX_PER_UNIT, pinY: (maxY - 0) * PX_PER_UNIT, png: r.domElement.toDataURL('image/png') });
})().catch(e => { out.textContent = 'ERR ' + e.stack; });
