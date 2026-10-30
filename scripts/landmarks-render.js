// Render de public/assets/runeterra/landmarks/models a sprites (ver README alli).
// Uso: bundlear con esbuild (requiere `npm i three`), servir una pagina con <pre id="out"> y abrir #<slug>,<shear>
// (shear 0 = silueta cenital para el ajuste, 0.75 = sprite). Deja en #out un JSON con el PNG (dataURL). /lm/ = models/.
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
// #slug,shear  -> proyeccion oblicua: x'=x, y'=y+shear*z (z = altura). shear=0 = cenital (silueta).
const [slug, shearStr] = location.hash.slice(1).split(',');
const SHEAR = +shearStr, PX = 16;
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
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const zBase = box.min.z;
  const shear = new THREE.Group();
  // y' = y + SHEAR*(z - zBase): la base queda en su sitio, lo alto sube en pantalla
  shear.matrixAutoUpdate = false;
  shear.matrix.set(1,0,0,0, 0,1,SHEAR,-SHEAR*zBase, 0,0,1,0, 0,0,0,1);
  shear.add(root);
  const scene = new THREE.Scene(); scene.add(shear); scene.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(shear);
  const pad = 1, minX = b2.min.x - pad, maxX = b2.max.x + pad, minY = b2.min.y - pad, maxY = b2.max.y + pad;
  const cam = new THREE.OrthographicCamera(minX, maxX, maxY, minY, 0.1, 1000);
  cam.position.set(0, 0, 500); cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  // camara en x=0,y=0 mirando -z: left/right son coords x absolutas
  const w = Math.round((maxX - minX) * PX), h = Math.round((maxY - minY) * PX);
  const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1); r.setSize(w, h); r.setClearColor(0, 0); r.outputColorSpace = THREE.SRGBColorSpace;
  r.render(scene, cam);
  // pixel(X,Y) del plano de la base: ((X-minX)*PX, (maxY-Y)*PX)
  out.textContent = JSON.stringify({ slug, shear: SHEAR, w, h, pxPerUnit: PX, minX, maxY, zBase,
    footprint: { minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y }, png: r.domElement.toDataURL('image/png') });
})().catch(e => { out.textContent = 'ERR ' + e.stack; });
