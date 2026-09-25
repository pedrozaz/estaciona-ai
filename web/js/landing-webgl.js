import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.module.js';

const canvas = document.getElementById('hero-gl');
if (canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, canvas.clientWidth / canvas.clientHeight, 1, 1000);
    camera.position.set(0, 16, 32);
    camera.lookAt(0, -2, 0);

    const gridSize = 45;
    const spacing = 1.1;
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    
    // Apple Blue-Green Analogous Scale
    const color1 = new THREE.Color('#0a84ff'); // iOS Blue
    const color2 = new THREE.Color('#30b0c7'); // Teal
    const color3 = new THREE.Color('#32d74b'); // Green

    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            const x = (i - gridSize / 2) * spacing;
            const z = (j - gridSize / 2) * spacing;
            positions.push(x, 0, z);
            
            // Smooth gradient mix across the grid
            const ratio1 = i / gridSize;
            const ratio2 = j / gridSize;
            const mixedColor = color1.clone().lerp(color2, ratio1).lerp(color3, ratio2);
            colors.push(mixedColor.r, mixedColor.g, mixedColor.b);
        }
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
        size: 0.12,
        vertexColors: true,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // Add a LiDAR scanner line (glowing plane)
    const scanGeo = new THREE.PlaneGeometry(gridSize * spacing, 0.5);
    const scanMat = new THREE.MeshBasicMaterial({
        color: 0x64d2ff,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
    });
    const scanner = new THREE.Mesh(scanGeo, scanMat);
    scanner.rotation.x = Math.PI / 2;
    scene.add(scanner);

    // Resize handler
    const resize = () => {
        if (!canvas.parentElement) return;
        const w = canvas.parentElement.clientWidth;
        const h = canvas.parentElement.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', resize);
    resize();

    // Mouse parallax
    let mouseX = 0;
    let mouseY = 0;
    let targetRotationX = 0;
    let targetRotationY = 0;

    const heroVisual = document.querySelector('.hero-visual');
    if (heroVisual) {
        heroVisual.addEventListener('pointermove', (e) => {
            const bounds = heroVisual.getBoundingClientRect();
            mouseX = (e.clientX - bounds.left) / bounds.width * 2 - 1;
            mouseY = -(e.clientY - bounds.top) / bounds.height * 2 + 1;
        });
        heroVisual.addEventListener('pointerleave', () => {
            mouseX = 0;
            mouseY = 0;
        });
    }

    // Animation loop
    let time = 0;
    let isIntersecting = true; // Assume visible at start

    const observer = new IntersectionObserver((entries) => {
        isIntersecting = entries[0].isIntersecting;
    });
    observer.observe(canvas);

    const animate = () => {
        requestAnimationFrame(animate);
        
        if (!isIntersecting) return; // Save resources

        time += 0.015;

        // Wave effect
        const positions = particles.geometry.attributes.position.array;
        let index = 0;
        for (let i = 0; i < gridSize; i++) {
            for (let j = 0; j < gridSize; j++) {
                const x = positions[index];
                const z = positions[index + 2];
                // Smooth terrain-like wave
                positions[index + 1] = Math.sin(x * 0.15 + time) * 1.2 + Math.cos(z * 0.1 + time * 0.7) * 1.0;
                index += 3;
            }
        }
        particles.geometry.attributes.position.needsUpdate = true;
        
        // Parallax easing
        targetRotationY = mouseX * 0.2;
        targetRotationX = mouseY * 0.15;
        
        particles.rotation.y += (targetRotationY - particles.rotation.y) * 0.05;
        particles.rotation.x += (targetRotationX - particles.rotation.x) * 0.05;
        
        // Animate scanner
        scanner.position.z = Math.sin(time * 0.5) * (gridSize * spacing / 2.5);
        scanner.position.y = Math.sin(scanner.position.z * 0.1 + time) * 1.2 + 0.5;

        renderer.render(scene, camera);
    };
    
    animate();
}
