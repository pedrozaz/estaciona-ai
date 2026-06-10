import { bus } from '../bus.js';

class OrthoModule {
    constructor() {
        this.id = 'ortho';
        this.scale = 1;
        this.panX = 0;
        this.panY = 0;
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        
        bus.on(`app:launch:${this.id}`, (data) => this.launch(data));
    }

    launch(data) {
        this.mode = data.mode || 'sandbox';
        const content = `
            <style> #win-${this.id} .fw-body { padding: 0 !important; } </style>
            <div class="ortho-container" id="orthoContainer" style="flex: 1; width: 100%; overflow: hidden; background: #08090a; position: relative; border-bottom-left-radius: 16px; border-bottom-right-radius: 16px;">
                <div class="ortho-controls" style="position: absolute; bottom: 16px; right: 16px; z-index: 10; display: flex; gap: 8px;">
                    <button id="orthoZoomIn" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); color: #fff; width: 32px; height: 32px; border-radius: 6px; cursor: pointer; transition: 0.2s; backdrop-filter: blur(8px);">+</button>
                    <button id="orthoZoomOut" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); color: #fff; width: 32px; height: 32px; border-radius: 6px; cursor: pointer; transition: 0.2s; backdrop-filter: blur(8px);">-</button>
                    <button id="orthoReset" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); color: #fff; padding: 0 12px; height: 32px; border-radius: 6px; cursor: pointer; font-family: 'Space Grotesk'; font-size: 10px; text-transform: uppercase; transition: 0.2s; backdrop-filter: blur(8px);">Reset</button>
                </div>
                <div id="orthoViewport" style="position: absolute; top: 0; left: 0; transform-origin: 0 0; transition: transform 0.1s ease-out; cursor: grab;">
                    <img id="orthoImage" src="/assets/images/uniube_ortho_projection.png" style="display: block; pointer-events: none; opacity: 0.95;" alt="Orthomosaic">
                </div>
            </div>
        `;

        bus.emit('app:open', { id: this.id, title: data.title, content });
        setTimeout(() => this.initInteractions(), 50);
    }

    initInteractions() {
        const container = document.getElementById('orthoContainer');
        const viewport = document.getElementById('orthoViewport');
        const img = document.getElementById('orthoImage');
        const btnIn = document.getElementById('orthoZoomIn');
        const btnOut = document.getElementById('orthoZoomOut');
        const btnReset = document.getElementById('orthoReset');

        const markersLayer = document.createElement('div');
        markersLayer.style.position = 'absolute';
        markersLayer.style.top = '0';
        markersLayer.style.left = '0';
        markersLayer.style.width = '100%';
        markersLayer.style.height = '100%';
        markersLayer.style.pointerEvents = 'none';
        container.appendChild(markersLayer);

        const markers = [];

        if (!container || !viewport || !img) return;

        const updateTransform = () => {
            viewport.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
            markers.forEach(m => {
                m.el.style.left = `${m.x * this.scale + this.panX}px`;
                m.el.style.top = `${m.y * this.scale + this.panY}px`;
            });
        };

        const fitImage = () => {
            const containerRect = container.getBoundingClientRect();
            const imgWidth = img.naturalWidth || img.clientWidth;
            const imgHeight = img.naturalHeight || img.clientHeight;
            
            if (imgWidth > 0 && imgHeight > 0) {
                requestAnimationFrame(() => {
                    const scaleX = containerRect.width / imgWidth;
                    const scaleY = containerRect.height / imgHeight;
                    this.scale = Math.min(scaleX, scaleY); 
                    this.panX = (containerRect.width - (imgWidth * this.scale)) / 2;
                    this.panY = (containerRect.height - (imgHeight * this.scale)) / 2;
                    updateTransform();
                });
            }
        };

        img.onload = fitImage;
        if (img.complete) fitImage();
        window.addEventListener('resize', fitImage);

        btnIn.addEventListener('click', () => { this.scale *= 1.2; updateTransform(); });
        btnOut.addEventListener('click', () => { this.scale /= 1.2; updateTransform(); });

        let isDragging = false;
        container.addEventListener('mousedown', () => isDragging = false);
        container.addEventListener('mousemove', () => isDragging = true);
        
        container.addEventListener('click', (event) => {
            if (this.mode === 'calibrate' && !isDragging) {
                const rect = container.getBoundingClientRect();
                const clickX = event.clientX - rect.left;
                const clickY = event.clientY - rect.top;
                
                const imgX = (clickX - this.panX) / this.scale;
                const imgY = (clickY - this.panY) / this.scale;
                
                const dot = document.createElement('div');
                dot.style.position = 'absolute';
                dot.style.width = '12px';
                dot.style.height = '12px';
                dot.style.background = '#ed6a5e';
                dot.style.borderRadius = '50%';
                dot.style.transform = 'translate(-50%, -50%)';
                dot.style.border = '2px solid #fff';
                dot.style.boxShadow = '0 0 8px rgba(0,0,0,0.5)';
                markersLayer.appendChild(dot);
                
                markers.push({ x: imgX, y: imgY, el: dot });
                updateTransform();

                bus.emit('calibrate:ortho-click', { x: imgX, y: imgY });
            }
        });

        bus.on('calibrate:ortho-load', (points) => {
            if (this.mode !== 'calibrate') return;
            points.forEach(pt => {
                const mapPt = {
                    offsetX: pt.x * this.scale + this.panX,
                    offsetY: pt.y * this.scale + this.panY
                };
                const dot = document.createElement('div');
                dot.style.position = 'absolute';
                dot.style.left = `${mapPt.offsetX - 4}px`;
                dot.style.top = `${mapPt.offsetY - 4}px`;
                dot.style.width = '8px';
                dot.style.height = '8px';
                dot.style.background = '#ed6a5e';
                dot.style.borderRadius = '50%';
                dot.style.border = '1px solid #fff';
                dot.style.pointerEvents = 'none';
                markersLayer.appendChild(dot);
                markers.push({ el: dot, origX: pt.x, origY: pt.y });
            });
        });

        bus.on('calibrate:undo:ortho', () => {
            if (markers.length > 0) {
                const last = markers.pop();
                last.el.remove();
            }
        });
        
        btnReset.addEventListener('click', fitImage);

        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomFactor = Math.exp(-e.deltaY * 0.001);
            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            this.panX = mouseX - (mouseX - this.panX) * zoomFactor;
            this.panY = mouseY - (mouseY - this.panY) * zoomFactor;
            this.scale *= zoomFactor;
            updateTransform();
        });

        viewport.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.startX = e.clientX - this.panX;
            this.startY = e.clientY - this.panY;
            viewport.style.cursor = 'grabbing';
            viewport.style.transition = 'none';
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            this.panX = e.clientX - this.startX;
            this.panY = e.clientY - this.startY;
            updateTransform();
        });

        window.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                viewport.style.cursor = 'grab';
                viewport.style.transition = 'transform 0.1s ease-out';
            }
        });
        
        container.addEventListener('mouseleave', () => {
            if (this.isDragging) {
                this.isDragging = false;
                viewport.style.cursor = 'grab';
                viewport.style.transition = 'transform 0.1s ease-out';
            }
        });
    }
}

new OrthoModule();
