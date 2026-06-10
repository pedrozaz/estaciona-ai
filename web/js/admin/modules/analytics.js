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
                @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');

                .ml-container {
                    display: grid;
                    grid-template-columns: repeat(12, 1fr);
                    gap: 16px;
                    padding: 24px;
                    height: 100%;
                    overflow-y: auto;
                    background-color: #050505;
                    background-image: radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px);
                    background-size: 24px 24px;
                    color: #fff;
                    font-family: 'Inter', sans-serif;
                }
                
                /* High-End Technical Card */
                .ml-card {
                    background: rgba(9, 9, 11, 0.85);
                    border: 1px solid #27272a;
                    border-radius: 4px;
                    padding: 20px;
                    backdrop-filter: blur(10px);
                    -webkit-backdrop-filter: blur(10px);
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
                    display: flex;
                    flex-direction: column;
                    position: relative;
                }

                .ml-card::before {
                    content: '';
                    position: absolute; top: 0; left: 0;
                    width: 100%; height: 1px;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
                }

                .ml-card.col-span-12 { grid-column: span 12; }
                .ml-card.col-span-8 { grid-column: span 8; }
                .ml-card.col-span-7 { grid-column: span 7; }
                .ml-card.col-span-5 { grid-column: span 5; }
                .ml-card.col-span-4 { grid-column: span 4; }
                
                /* Micro-typography */
                .ml-card-title {
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 10px;
                    font-weight: 700;
                    color: #71717a;
                    margin-bottom: 16px;
                    padding-bottom: 12px;
                    border-bottom: 1px dashed #27272a;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                
                .indicator-dot {
                    width: 6px; height: 6px; border-radius: 0;
                }
                
                /* Metrics Readout */
                .metric-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px 0;
                    border-bottom: 1px solid #18181b;
                    font-family: 'JetBrains Mono', monospace;
                }
                .metric-row:last-child { border-bottom: none; }
                .m-label { font-size: 11px; color: #71717a; text-transform: uppercase; letter-spacing: 1px; }
                .m-value { font-size: 13px; font-weight: 700; color: #e4e4e7; }
                
                
                /* Profit Calculator */
                .calc-input-group { margin-bottom: 0; flex: 1; }
                .calc-input-group label { display: block; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #71717a; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px;}
                .calc-input {
                    width: 100%; background: #000; border: 1px solid #27272a;
                    color: #fff; padding: 10px 14px; border-radius: 2px; font-family: 'JetBrains Mono', monospace; font-size: 14px;
                    transition: border-color 0.2s;
                }
                .calc-input:focus { outline: none; border-color: #10b981; }
                .calc-result {
                    padding: 16px; background: #000; border: 1px solid #27272a;
                    border-radius: 2px; display: flex; flex-direction: column; justify-content: center;
                }
                .calc-result-title { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #10b981; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px;}
                .calc-result-value { font-size: 24px; font-weight: 700; color: #fff; font-family: 'JetBrains Mono', monospace;}
                
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
                <!-- Row 1: Forecast & Health -->
                <div class="ml-card col-span-8">
                    <div class="ml-card-title">
                        <div class="indicator-dot" style="background:#38bdf8;"></div>
                        24H Occupancy Forecast
                    </div>
                    <div id="chart-occupancy" style="height: 250px; width: 100%; z-index: 1;"></div>
                </div>

                <div class="ml-card col-span-4">
                    <div class="ml-card-title">
                        <div class="indicator-dot" style="background:#a855f7;"></div>
                        Model Health
                    </div>
                    <div style="flex:1; display:flex; flex-direction:column; justify-content:center;">
                        <div class="metric-row">
                            <span class="m-label">R² Score (Accuracy)</span>
                            <span class="m-value" style="color: #a855f7;">0.942</span>
                        </div>
                        <div class="metric-row">
                            <span class="m-label">Mean Absolute Error</span>
                            <span class="m-value" style="color: #a855f7;">1.8%</span>
                        </div>
                        <div class="metric-row">
                            <span class="m-label">RMSE</span>
                            <span class="m-value" style="color: #a855f7;">2.4%</span>
                        </div>
                        <div class="metric-row">
                            <span class="m-label">Inference Time</span>
                            <span class="m-value" style="color:#fbbf24;">4.2ms</span>
                        </div>
                    </div>
                </div>

                <!-- Row 2: Heatmap & Duration -->
                <div class="ml-card col-span-5">
                    <div class="ml-card-title">
                        <div class="indicator-dot" style="background:#ef4444;"></div>
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
                        <div class="indicator-dot" style="background:#71717a;"></div>
                        Stay Duration Distribution
                    </div>
                    <div id="chart-duration" style="height: 180px; width: 100%; z-index: 1;"></div>
                </div>

                <!-- Row 3: Profit Calculator -->
                <div class="ml-card col-span-12" style="flex-direction: row; align-items: center; gap: 40px; padding: 20px 30px;">
                    <div style="flex: 1;">
                        <div class="ml-card-title" style="margin-bottom: 12px;">
                            <div class="indicator-dot" style="background:#10b981;"></div>
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
            this.loadOrthoHeatmap();
            this.initCalculator();
            this.initWebSocket();
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
            chart: { type: 'area', height: 250, toolbar: { show: false }, background: 'transparent', fontFamily: 'JetBrains Mono, monospace' },
            theme: { mode: 'dark' },
            colors: ['#38bdf8'],
            fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.2, opacityTo: 0.0, stops: [0, 100] } },
            dataLabels: { enabled: false },
            stroke: { curve: 'straight', width: 2 },
            xaxis: { categories: ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'], labels: { style: { colors: '#71717a', fontSize: '10px' } }, axisBorder: { show: false }, axisTicks: { show: false } },
            yaxis: { max: 100, labels: { style: { colors: '#71717a', fontSize: '10px' } } },
            grid: { borderColor: '#18181b', strokeDashArray: 2 },
            tooltip: { theme: 'dark' }
        };
        this.occChart = new ApexCharts(document.querySelector("#chart-occupancy"), occOptions);
        this.occChart.render();

        // 2. Stay Duration Histogram
        const durOptions = {
            series: [{ name: 'Vehicles', data: [145, 230, 85, 32] }],
            chart: { type: 'bar', height: 180, toolbar: { show: false }, background: 'transparent', fontFamily: 'JetBrains Mono, monospace' },
            theme: { mode: 'dark' },
            plotOptions: {
                bar: {
                    horizontal: false,
                    borderRadius: 2,
                    columnWidth: '40%',
                    distributed: true
                }
            },
            colors: ['#38bdf8', '#10b981', '#f59e0b', '#ef4444'],
            dataLabels: { enabled: false },
            xaxis: { 
                categories: ['< 1h', '1-2h', '2-4h', '4h+'],
                labels: { style: { colors: '#71717a', fontSize: '10px' } },
                axisBorder: { show: false },
                axisTicks: { show: false }
            },
            yaxis: {
                labels: { style: { colors: '#71717a', fontSize: '10px' } }
            },
            grid: { borderColor: '#18181b', strokeDashArray: 2, xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } } },
            legend: { show: false },
            tooltip: { theme: 'dark', y: { formatter: function (val) { return val + " vehicles" } } }
        };
        this.durChart = new ApexCharts(document.querySelector("#chart-duration"), durOptions);
        this.durChart.render();
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

    initWebSocket() {
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const wsUrl = isLocal ? 'ws://localhost:8000/ws/dashboard' : 'wss://api.estaciona.tech/ws/dashboard';
        this.ws = new WebSocket(wsUrl);

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'TREND_PREDICTION') {
                    this.updateAnalyticsUI(data);
                }
            } catch (err) {
                console.error("Error parsing WS message:", err);
            }
        };

        this.ws.onclose = () => {
            if (this.active) {
                setTimeout(() => this.initWebSocket(), 3000);
            }
        };
    }

    updateAnalyticsUI(data) {
        if (data.model_health) {
            const healthValues = document.querySelectorAll('.m-value');
            if (healthValues.length >= 4) {
                healthValues[0].textContent = data.model_health.r2_score.toFixed(3);
                healthValues[1].textContent = data.model_health.mae.toFixed(1) + '%';
                healthValues[2].textContent = data.model_health.rmse.toFixed(1) + '%';
                healthValues[3].textContent = data.model_health.inference_time_ms.toFixed(1) + 'ms';
            }
        }

        if (window.ApexCharts) {
            if (data.next_24h_occupancy && this.occChart) {
                const occData = data.next_24h_occupancy.map(o => o.occupancy);
                const occTimes = data.next_24h_occupancy.map(o => {
                    const d = new Date(o.timestamp);
                    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                });
                this.occChart.updateSeries([{ name: 'Predicted Occupancy', data: occData }]);
                this.occChart.updateOptions({ xaxis: { categories: occTimes } });
            }

            if (data.stay_duration_distribution && this.durChart) {
                this.durChart.updateSeries([{ name: 'Vehicles', data: data.stay_duration_distribution }]);
            }
        }
    }

    cleanup() {
        this.active = false;
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

new AnalyticsModule();
