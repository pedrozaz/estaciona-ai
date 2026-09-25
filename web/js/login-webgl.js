import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.module.js';

const canvas = document.getElementById('login-gl');
if (canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 2000);
    camera.position.z = 250;
    // slightly tilt down
    camera.position.y = 50;
    camera.lookAt(0, 0, 0);

    const color1 = new THREE.Color('#0a84ff'); // iOS Blue
    const color2 = new THREE.Color('#30b0c7'); // Apple Teal
    
    const nodeCount = 180;
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    
    for (let i = 0; i < nodeCount; i++) {
        // Distribute points in a wide disc/cylinder shape
        const radius = 220 * Math.sqrt(Math.random());
        const theta = Math.random() * 2 * Math.PI;
        
        const x = radius * Math.cos(theta);
        const y = (Math.random() - 0.5) * 80; // relatively flat
        const z = radius * Math.sin(theta);
        
        positions.push(x, y, z);
        
        const col = Math.random() > 0.5 ? color1 : color2;
        colors.push(col.r, col.g, col.b);
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    const material = new THREE.PointsMaterial({
        size: 2.5,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending
    });
    
    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    const lineGeo = new THREE.BufferGeometry();
    const linePositions = [];
    const lineColors = [];
    
    const colorLine = new THREE.Color('#64d2ff');
    
    for (let i = 0; i < nodeCount; i++) {
        const x1 = positions[i * 3];
        const y1 = positions[i * 3 + 1];
        const z1 = positions[i * 3 + 2];
        
        for (let j = i + 1; j < nodeCount; j++) {
            const x2 = positions[j * 3];
            const y2 = positions[j * 3 + 1];
            const z2 = positions[j * 3 + 2];
            
            const distSq = (x1 - x2)**2 + (y1 - y2)**2 + (z1 - z2)**2;
            
            if (distSq < 3000) { 
                linePositions.push(x1, y1, z1);
                linePositions.push(x2, y2, z2);
                lineColors.push(colorLine.r, colorLine.g, colorLine.b);
                lineColors.push(colorLine.r, colorLine.g, colorLine.b);
            }
        }
    }
    
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));
    
    const lineMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending
    });
    
    const lines = new THREE.LineSegments(lineGeo, lineMat);
    scene.add(lines);

    const resize = () => {
        renderer.setSize(window.innerWidth, window.innerHeight, false);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', resize);
    resize();
    
    let mouseX = 0;
    let mouseY = 0;
    document.addEventListener('mousemove', (e) => {
        mouseX = (e.clientX - window.innerWidth / 2) * 0.05;
        mouseY = (e.clientY - window.innerHeight / 2) * 0.05;
    });

    let time = 0;
    const animate = () => {
        requestAnimationFrame(animate);
        time += 0.0015;
        
        particles.rotation.y = time * 0.5 + (mouseX * 0.005);
        particles.rotation.z = time * 0.1;
        
        lines.rotation.y = particles.rotation.y;
        lines.rotation.z = particles.rotation.z;
        
        renderer.render(scene, camera);
    };
    
    animate();
}
