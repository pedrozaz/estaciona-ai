import * as THREE from '../lib/three/three.module.js';

// Small, procedural spatial study. No model, texture or third-party download.
export function createCampusScene(canvas, { ambient = false, toggle = null } = {}) {
  if (!canvas) return;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    return; // The HTML illustration remains available without WebGL.
  }
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-13, 13, 11, -11, .1, 100);
  camera.position.set(17, 22, 23);
  camera.lookAt(0, 0, 0);
  const group = new THREE.Group();
  scene.add(group);
  scene.add(new THREE.HemisphereLight(0xf0e8d7, 0x263e58, 2.1));
  const sunlight = new THREE.DirectionalLight(0xffebcf, 2.3);
  sunlight.position.set(-8, 16, 8);
  scene.add(sunlight);
  const fill = new THREE.DirectionalLight(0x9dbbd5, 1);
  fill.position.set(10, 8, -10);
  scene.add(fill);

  const materials = new Map();
  function material(color) {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: .92, metalness: 0 }));
    return materials.get(color);
  }
  function block(w, h, d, x, y, z, color) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }
  function line(points, color, opacity = 1) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const mesh = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    group.add(mesh);
    return mesh;
  }

  // Contours are drawn once. Slow group movement preserves their continuity.
  for (let ring = 0; ring < (ambient ? 26 : 15); ring++) {
    const points = [];
    const radius = (ambient ? 3 : 8.7) + ring * .47;
    for (let step = 0; step <= 180; step++) {
      const angle = step / 180 * Math.PI * 2;
      const contour = radius + Math.sin(angle * 3 + ring * .055) * .65 + Math.cos(angle * 5) * .17;
      points.push(new THREE.Vector3(Math.cos(angle) * contour * 1.18, -.5 - ring * .024, Math.sin(angle) * contour * .76));
    }
    line(points, ring % 5 === 0 ? 0xb8a388 : 0x7094b1, ambient ? .14 : .12 + (15 - ring) * .007);
  }

  let route, traveler;
  if (!ambient) {
    const shape = new THREE.Shape();
    const w = 8.2, d = 5.8, r = .75;
    shape.moveTo(-w+r,-d); shape.lineTo(w-r,-d); shape.quadraticCurveTo(w,-d,w,-d+r);
    shape.lineTo(w,d-r); shape.quadraticCurveTo(w,d,w-r,d); shape.lineTo(-w+r,d);
    shape.quadraticCurveTo(-w,d,-w,d-r); shape.lineTo(-w,-d+r); shape.quadraticCurveTo(-w,-d,-w+r,-d);
    const board = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .26, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .1, bevelThickness: .08 }), material(0x304961));
    board.rotation.x = -Math.PI / 2;
    board.position.y = -.26;
    group.add(board);
    // Buildings, recessed windows, planted boundaries and parking rows.
    block(7.3, 1.5, 3.4, -.8, .75, -2.1, 0xb7c0bd);
    block(7.6, .13, 3.6, -.8, 1.55, -2.1, 0xd7d4c7);
    block(2.1, 2.35, 3.9, -5.6, 1.175, -1.85, 0x8d9d9f);
    block(2.3, .13, 4.1, -5.6, 2.4, -1.85, 0xcdcbbf);
    block(2.8, .75, 2.1, 4.9, .375, -3.15, 0xa5b3b2);
    block(3, .1, 2.3, 4.9, .8, -3.15, 0xd2cdbf);
    for (let i = 0; i < 9; i++) block(.48, .45, .025, -3.8 + i * .76, .95, -.382, 0x35516a);
    for (let i = 0; i < 6; i++) block(.03, .12, 3.1, -3.5 + i * 1.07, 1.64, -2.1, 0xa3b1b5);
    const markings = [];
    const carGeometry = new THREE.BoxGeometry(.41,.22,.79);
    const cars = new THREE.InstancedMesh(carGeometry, material(0x829daf), 25);
    const dummy = new THREE.Object3D();
    let count = 0;
    for (let row=0; row<2; row++) {
      for (let col=0; col<22; col++) {
        const x=-6.75+col*.61, z=row ? 4.35 : 1.6;
        markings.push(new THREE.Vector3(x-.26,.075,z-.54),new THREE.Vector3(x-.26,.075,z+.54));
        markings.push(new THREE.Vector3(x-.26,.075,z+.54),new THREE.Vector3(x+.26,.075,z+.54));
        if ((col + row*3) % 3 !== 0 && count < 25) {
          dummy.position.set(x,.21,z); dummy.updateMatrix(); cars.setMatrixAt(count,dummy.matrix);
          cars.setColorAt(count,new THREE.Color(count%4===0 ? 0xd8c6ad : count%3===0 ? 0x536e83 : 0xaab9bb));
          count++;
        }
      }
    }
    cars.count=count; group.add(cars);
    group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(markings),new THREE.LineBasicMaterial({color:0xb9c9ce,transparent:true,opacity:.65})));
    const treeGeometry=new THREE.SphereGeometry(.54,12,10);
    const trees=new THREE.InstancedMesh(treeGeometry,material(0x617e75),18);
    for(let i=0;i<18;i++) {
      const left=i<9;
      dummy.position.set(left?-7.5:7.35,.65,-4.3+(i%9)*1.1);
      dummy.scale.set(.72+(i%3)*.1,1+(i%4)*.11,.8); dummy.updateMatrix(); trees.setMatrixAt(i,dummy.matrix);
    }
    group.add(trees);
    route = new THREE.CatmullRomCurve3([
      new THREE.Vector3(8.6,.13,3),new THREE.Vector3(6.4,.13,3),new THREE.Vector3(3,.13,3),new THREE.Vector3(-1,.13,3),new THREE.Vector3(-3.75,.13,3),new THREE.Vector3(-4.3,.13,2.7),new THREE.Vector3(-4.3,.13,1.65)
    ],false,'centripetal');
    group.add(new THREE.Mesh(new THREE.TubeGeometry(route,80,.035,6,false),material(0xe3b584)));
    traveler=new THREE.Mesh(new THREE.SphereGeometry(.115,10,8),new THREE.MeshBasicMaterial({color:0xffddb0,transparent:true}));
    group.add(traveler);
    const destination=new THREE.Mesh(new THREE.RingGeometry(.22,.26,32),new THREE.MeshBasicMaterial({color:0xe3b584,side:THREE.DoubleSide}));
    destination.rotation.x=-Math.PI/2; destination.position.set(-4.3,.12,1.65); group.add(destination);
  }

  let raf=0, previous=0, elapsed=0, inView=true, paused=false, lost=false;
  let targetX=0, targetY=0;
  const host=canvas.parentElement;
  const point=new THREE.Vector3();
  function paint(delta=0) {
    const blend=1-Math.exp(-3.5*delta);
    elapsed+=delta;
    const drift=motion.matches || paused ? 0 : Math.sin(elapsed*.13)*.028;
    group.rotation.y += (targetX*.085+drift-group.rotation.y)*blend;
    group.rotation.x += (targetY*.025-group.rotation.x)*blend;
    if(traveler) {
      const phase=(elapsed*.045)%1;
      traveler.position.copy(route.getPointAt(phase,point));
      traveler.material.opacity=Math.min(1,phase/.06,(1-phase)/.06);
    }
    renderer.render(scene,camera);
  }
  function canRun() { return inView && !document.hidden && !motion.matches && !paused && !lost; }
  function frame(now) {
    raf=0;
    if(!canRun()) return;
    const delta=previous?Math.min((now-previous)/1000,.05):0;
    previous=now; paint(delta); raf=requestAnimationFrame(frame);
  }
  function sync() {
    if(raf) cancelAnimationFrame(raf);
    raf=0; previous=0;
    if(lost) return;
    if(canRun()) raf=requestAnimationFrame(frame);
    else if(!document.hidden && inView) paint();
    if(toggle) toggle.hidden=motion.matches;
  }
  function resize() {
    const {width,height}=canvas.getBoundingClientRect();
    if(!width || !height || lost) return;
    const aspect=width/height;
    const span=ambient?16:Math.max(11.5,12/aspect);
    camera.left=-span*aspect; camera.right=span*aspect; camera.top=span; camera.bottom=-span;
    camera.updateProjectionMatrix(); renderer.setSize(width,height,false); paint();
  }
  const observer=new ResizeObserver(resize); observer.observe(canvas);
  const intersection=new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;sync();}); intersection.observe(canvas);
  const onPointer=event=>{
    if(motion.matches || paused || event.pointerType==='touch') return;
    const rect=host.getBoundingClientRect();
    targetX=(event.clientX-rect.left)/rect.width-.5;
    targetY=(event.clientY-rect.top)/rect.height-.5;
  };
  const onLeave=()=>{targetX=targetY=0;};
  host.addEventListener('pointermove',onPointer,{passive:true}); host.addEventListener('pointerleave',onLeave);
  document.addEventListener('visibilitychange',sync); motion.addEventListener('change',sync);
  if(toggle) {
    toggle.hidden=motion.matches;
    toggle.addEventListener('click',()=>{
      paused=!paused; toggle.setAttribute('aria-pressed',String(paused));
      toggle.setAttribute('aria-label',paused?'Reproduzir movimento da ilustração':'Pausar movimento da ilustração');
      toggle.innerHTML=paused?'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 2 10 6-10 6Z"/></svg>':'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 3h3v10H4zm5 0h3v10H9z"/></svg>';
      sync();
    });
  }
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;sync();host.classList.remove('webgl-ready');if(toggle)toggle.hidden=true;});
  canvas.addEventListener('webglcontextrestored',()=>{lost=false;resize();host.classList.add('webgl-ready');sync();});
  window.addEventListener('pagehide',()=>{if(raf)cancelAnimationFrame(raf);raf=0;previous=0;});
  window.addEventListener('pageshow',sync);
  resize(); host.classList.add('webgl-ready'); sync();
}
