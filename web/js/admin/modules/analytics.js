import { bus } from '../bus.js';

class AnalyticsModule {
    constructor() {
        this.id = 'analytics';
        this.active = false;
        
        bus.on(`app:launch:${this.id}`, (data) => this.launch(data));
        bus.on('app:close', (id) => {
            if (id === this.id) this.cleanup();
        });
    }

    async launch(data) {
        if (this.active) return;
        this.active = true;
        
        if (!window.ApexCharts) {
            await this.loadScript('https://cdn.jsdelivr.net/npm/apexcharts');
        }

        const content = `
            <style>
                .ml-container {
                    display: grid;
                    grid-template-columns: repeat(12, 1fr);
                    gap: 24px;
                    padding: 8px;
                    height: 100%;
                    overflow-y: auto;
                    color: #fff;
                    font-family: 'Inter', sans-serif;
                }
                
                /* Enhanced Premium Glassmorphism */
                .ml-card {
                    background: linear-gradient(145deg, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0.6) 100%);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 16px;
                    padding: 24px;
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    box-shadow: 0 16px 40px -8px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1);
                    display: flex;
                    flex-direction: column;
                    position: relative;
                    overflow: hidden;
                    transition: transform 0.3s ease, box-shadow 0.3s ease;
                }
                
                /* Subtle ambient glow behind cards */
                .ml-card::before {
                    content: '';
                    position: absolute;
                    top: -50%; left: -50%;
                    width: 200%; height: 200%;
                    background: radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 60%);
                    pointer-events: none;
                }

                .ml-card.col-span-12 { grid-column: span 12; }
                .ml-card.col-span-8 { grid-column: span 8; }
                .ml-card.col-span-7 { grid-column: span 7; }
                .ml-card.col-span-6 { grid-column: span 6; }
                .ml-card.col-span-5 { grid-column: span 5; }
                .ml-card.col-span-4 { grid-column: span 4; }
                
                .ml-card-title {
                    font-family: 'Space Grotesk', sans-serif;
                    font-size: 15px;
                    font-weight: 700;
                    color: #e2e8f0;
                    margin-bottom: 20px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    z-index: 1;
                }
                
                .indicator-dot {
                    width: 10px; height: 10px; border-radius: 50%;
                    box-shadow: 0 0 12px currentColor;
                }
                
                /* Metrics Highlight */
                .metric-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 16px;
                    padding-bottom: 16px;
                    border-bottom: 1px dashed rgba(255,255,255,0.1);
                    z-index: 1;
                }
                .metric-row:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
                .m-label { font-size: 14px; color: #94a3b8; font-weight: 500; }
                .m-value { font-size: 18px; font-weight: 700; font-family: 'Space Grotesk', monospace; color: #38bdf8; text-shadow: 0 0 10px rgba(56, 189, 248, 0.4); }
                
                /* Profit Calculator */
                .calc-input-group { margin-bottom: 20px; z-index: 1; }
                .calc-input-group label { display: block; font-size: 13px; color: #cbd5e1; margin-bottom: 8px; font-weight: 500;}
                .calc-input {
                    width: 100%; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(148, 163, 184, 0.3);
                    color: #fff; padding: 12px 16px; border-radius: 10px; font-family: 'Space Grotesk', monospace; font-size: 16px;
                    transition: all 0.3s;
                    box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
                }
                .calc-input:focus { outline: none; border-color: #10b981; box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2), inset 0 2px 4px rgba(0,0,0,0.2); }
                .calc-result {
                    margin-top: auto; padding: 20px; background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.2) 100%);
                    border-radius: 12px; border: 1px solid rgba(16, 185, 129, 0.4);
                    position: relative; overflow: hidden; z-index: 1;
                }
                .calc-result::after {
                    content: 'BRL'; position: absolute; right: 20px; bottom: 20px; font-size: 40px; font-family: 'Space Grotesk'; font-weight: 800; color: rgba(16, 185, 129, 0.1); pointer-events: none;
                }
                .calc-result-title { font-size: 13px; color: #34d399; margin-bottom: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;}
                .calc-result-value { font-size: 32px; font-weight: 800; color: #fff; font-family: 'Space Grotesk', sans-serif; text-shadow: 0 2px 10px rgba(0,0,0,0.3);}
                
                /* Ortho Heatmap */
                #ortho-heatmap-container {
                    position: relative; width: 100%; height: 250px; background: #000; border-radius: 8px; overflow: hidden; z-index: 1;
                }
                #ortho-map-wrapper {
                    position: absolute;
                    width: 1646px;
                    height: 1164px;
                    transform-origin: top left;
                    transform: scale(0.55);
                    top: -30px;
                    left: -120px;
                }
                #ortho-heatmap-img {
                    width: 100%; height: 100%; opacity: 0.5; filter: grayscale(100%) contrast(1.2); display: block;
                }
                #ortho-svg {
                    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                }
                .heatmap-poly {
                    transition: fill 0.5s ease;
                }
                .heatmap-legend-minimal {
                    position: absolute; bottom: 16px; left: 16px;
                    display: flex; align-items: center; gap: 10px;
                    z-index: 10;
                }
                .hl-text {
                    font-size: 10px; font-family: 'Inter', sans-serif; font-weight: 600; color: rgba(255,255,255,0.7);
                    text-transform: uppercase; letter-spacing: 0.5px;
                }
                .hl-gradient {
                    width: 100px; height: 6px; border-radius: 3px;
                    background: linear-gradient(to right, rgba(16, 185, 129, 0.8), rgba(245, 158, 11, 0.8), rgba(239, 68, 68, 0.8));
                    box-shadow: 0 2px 4px rgba(0,0,0,0.5);
                }
            </style>

            <div class="ml-container">
                <!-- Row 1: Main Forecast & Metrics -->
                <div class="ml-card col-span-8">
                    <div class="ml-card-title">
                        <div class="indicator-dot" style="color:#38bdf8; background:#38bdf8;"></div>
                        24H Occupancy Forecast (Attention Engine)
                    </div>
                    <div id="chart-occupancy" style="height: 250px; width: 100%; z-index: 1;"></div>
                </div>
                
                <div class="ml-card col-span-4">
                    <div class="ml-card-title">
                        <div class="indicator-dot" style="color:#a855f7; background:#a855f7;"></div>
                        Model Health (PyTorch)
                    </div>
                    <div style="flex:1; display:flex; flex-direction:column; justify-content:center;">
                        <div class="metric-row">
                            <span class="m-label">R² Score (Accuracy)</span>
                            <span class="m-value" style="color: #a855f7; text-shadow: 0 0 10px rgba(168, 85, 247, 0.4);">0.942</span>
                        </div>
                        <div class="metric-row">
                            <span class="m-label">Mean Absolute Error</span>
                            <span class="m-value" style="color: #a855f7; text-shadow: 0 0 10px rgba(168, 85, 247, 0.4);">1.8%</span>
                        </div>
                        <div class="metric-row">
                            <span class="m-label">RMSE</span>
                            <span class="m-value" style="color: #a855f7; text-shadow: 0 0 10px rgba(168, 85, 247, 0.4);">2.4%</span>
                        </div>
                        <div class="metric-row">
                            <span class="m-label">Inference Time</span>
                            <span class="m-value" style="color:#fbbf24; text-shadow: 0 0 10px rgba(251, 191, 36, 0.4);">4.2ms</span>
                        </div>
                    </div>
                </div>

                <!-- Row 2: Ortho Heatmap & Duration -->
                <div class="ml-card col-span-5">
                    <div class="ml-card-title">
                        <div class="indicator-dot" style="color:#ef4444; background:#ef4444;"></div>
                        Physical Spot Heatmap
                    </div>
                    <div id="ortho-heatmap-container">
                        <div class="heatmap-legend-minimal">
                            <span class="hl-text">Livre</span>
                            <div class="hl-gradient"></div>
                            <span class="hl-text">Lotado</span>
                        </div>
                        <div id="ortho-map-wrapper">
                            <img id="ortho-heatmap-img" src="/assets/images/uniube_ortho_projection.png" alt="Orthomosaic">
                            <svg id="ortho-svg" viewBox="0 0 1646 1164">
                                <defs>
                                    <radialGradient id="grad-low" cx="50%" cy="50%" r="50%">
                                        <stop offset="0%" stop-color="rgba(16, 185, 129, 0.95)" />
                                        <stop offset="40%" stop-color="rgba(16, 185, 129, 0.5)" />
                                        <stop offset="100%" stop-color="rgba(16, 185, 129, 0)" />
                                    </radialGradient>
                                    <radialGradient id="grad-med" cx="50%" cy="50%" r="50%">
                                        <stop offset="0%" stop-color="rgba(245, 158, 11, 0.95)" />
                                        <stop offset="40%" stop-color="rgba(245, 158, 11, 0.5)" />
                                        <stop offset="100%" stop-color="rgba(245, 158, 11, 0)" />
                                    </radialGradient>
                                    <radialGradient id="grad-high" cx="50%" cy="50%" r="50%">
                                        <stop offset="0%" stop-color="rgba(239, 68, 68, 0.95)" />
                                        <stop offset="40%" stop-color="rgba(239, 68, 68, 0.5)" />
                                        <stop offset="100%" stop-color="rgba(239, 68, 68, 0)" />
                                    </radialGradient>
                                </defs>
                                <g id="heat-layer"></g>
                                <g id="wireframe-layer"></g>
                            </svg>
                        </div>
                    </div>
                </div>

                <div class="ml-card col-span-7">
                    <div class="ml-card-title">
                        <div class="indicator-dot" style="color:#f59e0b; background:#f59e0b;"></div>
                        Stay Duration (LGBM)
                    </div>
                    <div id="chart-duration" style="height: 250px; width: 100%; z-index: 1;"></div>
                </div>

                <!-- Row 3: Profit Projection -->
                <div class="ml-card col-span-12" style="flex-direction: row; align-items: center; gap: 40px; padding: 20px 30px;">
                    <div style="flex: 1;">
                        <div class="ml-card-title" style="margin-bottom: 12px;">
                            <div class="indicator-dot" style="color:#10b981; background:#10b981;"></div>
                            Profit Projection
                        </div>
                        <div class="calc-input-group" style="margin-bottom: 0;">
                            <label>Hourly Rate (BRL)</label>
                            <input type="number" class="calc-input" id="profitHourlyRate" value="15.00" step="0.50">
                        </div>
                    </div>
                    <div class="calc-result" style="flex: 2; margin-top: 0;">
                        <div class="calc-result-title">Expected Daily Revenue</div>
                        <div class="calc-result-value" id="profitResult">R$ 2.450,00</div>
                    </div>
                </div>
            </div>
        `;

        bus.emit('app:open', { 
            id: this.id, 
            title: 'Predictive Engine & Admin Analytics', 
            content, 
            width: 1100, 
            height: 750,
            x: 50,
            y: 50
        });

        setTimeout(() => {
            this.initCharts();
            this.initCalculator();
            this.loadOrthoHeatmap();
        }, 100);
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    initCharts() {
        if (!window.ApexCharts) return;

        // 1. Occupancy Area Chart
        const occOptions = {
            series: [{ name: 'Predicted Occupancy %', data: [30, 40, 45, 50, 49, 60, 70, 91, 85, 60, 40, 30] }],
            chart: { type: 'area', height: 250, toolbar: { show: false }, background: 'transparent' },
            theme: { mode: 'dark' },
            colors: ['#38bdf8'],
            fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.6, opacityTo: 0.05, stops: [0, 100] } },
            dataLabels: { enabled: false },
            stroke: { curve: 'smooth', width: 3 },
            xaxis: { categories: ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'], labels: { style: { colors: '#94a3b8', fontFamily: 'Inter' } }, axisBorder: { show: false }, axisTicks: { show: false } },
            yaxis: { max: 100, labels: { style: { colors: '#94a3b8', fontFamily: 'Inter' } } },
            grid: { borderColor: 'rgba(255,255,255,0.08)', strokeDashArray: 4 },
            tooltip: { theme: 'dark' }
        };
        new ApexCharts(document.querySelector("#chart-occupancy"), occOptions).render();

        // 2. Stay Duration Bar Chart
        const durOptions = {
            series: [{ name: 'Avg Minutes', data: [120, 180, 150] }],
            chart: { type: 'bar', height: 250, toolbar: { show: false }, background: 'transparent' },
            theme: { mode: 'dark' },
            colors: ['#f59e0b', '#8b5cf6', '#10b981'],
            plotOptions: { bar: { borderRadius: 6, distributed: true, dataLabels: { position: 'top' }, columnWidth: '60%' } },
            dataLabels: { enabled: true, formatter: val => val + 'm', style: { colors: ['#fff'], fontFamily: 'Space Grotesk', fontSize: '14px' }, offsetY: -25 },
            xaxis: { categories: ['Normal', 'Elderly', 'PCD'], labels: { style: { colors: '#94a3b8', fontFamily: 'Inter', fontSize: '13px' } }, axisBorder: { show: false }, axisTicks: { show: false } },
            yaxis: { show: false },
            grid: { show: false },
            legend: { show: false },
            tooltip: { theme: 'dark' }
        };
        new ApexCharts(document.querySelector("#chart-duration"), durOptions).render();
    }

    async loadOrthoHeatmap() {
        try {
            const res = await fetch('/data/spots_3d.json');
            const data = await res.json();
            const heatLayer = document.getElementById('heat-layer');
            const wireframeLayer = document.getElementById('wireframe-layer');
            if (!heatLayer || !data) return;

            let heatHtml = '';
            let wireHtml = '';
            for (const spot of data) {
                if (!spot.polygonPixels || spot.polygonPixels.length < 3) continue;
                
                const prob = Math.random();
                let gradId = 'grad-low'; // Low (Green)
                if (prob > 0.6) gradId = 'grad-med'; // Medium (Orange)
                if (prob > 0.8) gradId = 'grad-high'; // High (Red)

                // Calculate the centroid (center of mass) of the spot
                let cx = 0;
                let cy = 0;
                for (const p of spot.polygonPixels) {
                    cx += p.x;
                    cy += p.y;
                }
                cx /= spot.polygonPixels.length;
                cy /= spot.polygonPixels.length;
                const pointsStr = spot.polygonPixels.map(p => `${p.x},${p.y}`).join(' ');

                // Draw organic circular heat point using true radial gradient
                heatHtml += `<circle cx="${cx}" cy="${cy}" r="45" fill="url(#${gradId})" stroke="none" class="heatmap-poly"></circle>`;
                
                // Draw subtle white wireframes on top without blur so the spots are still identifiable
                wireHtml += `<polygon points="${pointsStr}" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="2"></polygon>`;
            }
            heatLayer.innerHTML = heatHtml;
            wireframeLayer.innerHTML = wireHtml;
        } catch (e) {
            console.log('Ortho heatmap config not found:', e);
        }
    }

    initCalculator() {
        const input = document.getElementById('profitHourlyRate');
        const result = document.getElementById('profitResult');
        if (!input || !result) return;

        const updateResult = () => {
            const rate = parseFloat(input.value) || 0;
            const revenue = 150 * 2 * rate;
            result.textContent = 'R$ ' + revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        };
        input.addEventListener('input', updateResult);
    }

    cleanup() {
        this.active = false;
    }
}

new AnalyticsModule();
