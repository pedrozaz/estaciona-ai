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
                <!-- Forecast Chart -->
                <div class="ml-card col-span-8" style="height: 100%;">
                    <div class="ml-card-title">
                        <div class="indicator-dot" style="background:#38bdf8;"></div>
                        24H Occupancy Forecast
                    </div>
                    <div id="chart-occupancy" style="height: 500px; width: 100%; z-index: 1;"></div>
                </div>

                <!-- Model Health -->
                <div class="ml-card col-span-4">
                    <div class="ml-card-title">
                        <div class="indicator-dot" style="background:#a855f7;"></div>
                        Model Health
                    </div>
                    <div style="flex:1; display:flex; flex-direction:column; justify-content:center;">
                        <div class="metric-row">
                            <span class="m-label">R² Score</span>
                            <span class="m-value" style="color: #a855f7;">-</span>
                        </div>
                        <div class="metric-row">
                            <span class="m-label">MAE</span>
                            <span class="m-value" style="color: #a855f7;">-</span>
                        </div>
                        <div class="metric-row">
                            <span class="m-label">RMSE</span>
                            <span class="m-value" style="color: #a855f7;">-</span>
                        </div>
                        <div class="metric-row">
                            <span class="m-label">Inference Time</span>
                            <span class="m-value" style="color:#fbbf24;">-</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        bus.emit('app:open', { 
            id: this.id, 
            title: 'Analytics', 
            content, 
            width: 1100, 
            height: 750,
            x: 50,
            y: 50
        });

        setTimeout(() => {
            this.initCharts();
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

        // 1. Premium 24H Occupancy Area Chart
        const occOptions = {
            series: [{ name: 'Predicted Occupancy', data: [] }],
            chart: { 
                type: 'area', 
                height: '100%', 
                toolbar: { show: false }, 
                background: 'transparent', 
                fontFamily: 'JetBrains Mono, monospace',
                animations: { enabled: true, easing: 'easeinout', speed: 800 }
            },
            theme: { mode: 'dark' },
            colors: ['#00f2fe'],
            fill: { 
                type: 'gradient', 
                gradient: { shadeIntensity: 1, opacityFrom: 0.6, opacityTo: 0.05, stops: [0, 90, 100] } 
            },
            dataLabels: { enabled: false },
            stroke: { curve: 'smooth', width: 3 },
            markers: {
                size: 5,
                colors: ['#09090b'],
                strokeColors: '#00f2fe',
                strokeWidth: 2,
                hover: { size: 8 }
            },
            xaxis: { 
                categories: [], 
                labels: { style: { colors: '#a1a1aa', fontSize: '11px' } }, 
                axisBorder: { show: false }, 
                axisTicks: { show: false },
                crosshairs: { show: true, stroke: { color: '#00f2fe', width: 1, dashArray: 4 } }
            },
            yaxis: { 
                min: 0,
                max: 44, 
                tickAmount: 4,
                labels: { style: { colors: '#a1a1aa', fontSize: '12px' }, formatter: (val) => Math.floor(val) } 
            },
            grid: { 
                borderColor: 'rgba(255, 255, 255, 0.05)', 
                strokeDashArray: 4,
                xaxis: { lines: { show: true } },
                yaxis: { lines: { show: true } },
                padding: { top: 20, right: 20, bottom: 0, left: 10 }
            },
            annotations: {
                yaxis: [{
                    y: 44,
                    borderColor: '#ef4444',
                    strokeDashArray: 5,
                    label: {
                        borderColor: '#ef4444',
                        style: { color: '#fff', background: '#ef4444', fontFamily: 'JetBrains Mono' },
                        text: 'MAX CAPACITY (44)'
                    }
                }]
            },
            tooltip: { theme: 'dark', marker: { show: true } }
        };
        this.occChart = new ApexCharts(document.querySelector("#chart-occupancy"), occOptions);
        this.occChart.render();
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
                healthValues[1].textContent = data.model_health.mae.toFixed(1);
                healthValues[2].textContent = data.model_health.rmse.toFixed(1);
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
