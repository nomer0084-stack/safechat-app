class LiquidGlassEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.gl = this.canvas.getContext('webgl', { alpha: true, antialias: true, depth: false });
        if (!this.gl) return;

        this.time = 0;
        this.gyro = { x: 0, y: 0 };
        this.touch = { x: 0.5, y: 0.5, active: 0 };

        this.initShaders();
        this.initBuffers();
        this.initSensors();
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.render = this.render.bind(this);
        requestAnimationFrame(this.render);
    }

    initSensors() {
        if (window.DeviceOrientationEvent) {
            window.addEventListener('deviceorientation', (e) => {
                this.gyro.x = (e.gamma || 0) / 45; // наклон влево-вправо
                this.gyro.y = (e.beta || 0) / 45;  // наклон вперед-назад
            }, { passive: true });
        }
        window.addEventListener('pointermove', (e) => {
            this.touch.x = e.clientX / window.innerWidth;
            this.touch.y = 1.0 - (e.clientY / window.innerHeight);
        }, { passive: true });
    }

    resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = window.innerWidth * dpr;
        this.canvas.height = window.innerHeight * dpr;
        if (this.gl) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    initShaders() {
        const vs = `
            attribute vec2 position;
            varying vec2 vUv;
            void main() {
                vUv = (position + 1.0) * 0.5;
                gl_Position = vec4(position, 0.0, 1.0);
            }
        `;

        const fs = `
            precision highp float;
            varying vec2 vUv;
            uniform vec2 u_resolution;
            uniform float u_time;
            uniform vec2 u_gyro;
            uniform vec3 u_touch;

            // Симплекс-шум для динамической каустики и преломлений
            vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
            float snoise(vec2 v) {
                const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
                vec2 i  = floor(v + dot(v, C.yy));
                vec2 x0 = v - i + dot(i, C.xx);
                vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
                vec4 x12 = x0.xyxy + C.xxzz;
                x12.xy -= i1;
                i = mod289(i);
                vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
                vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
                m = m*m; m = m*m;
                vec3 x = 2.0 * fract(p * C.www) - 1.0;
                vec3 h = abs(x) - 0.5;
                vec3 ox = floor(x + 0.5);
                vec3 a0 = x - ox;
                m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
                vec3 g;
                g.x  = a0.x  * x0.x  + h.x  * x0.y;
                g.yz = a0.yz * x12.xz + h.yz * x12.yw;
                return 130.0 * dot(m, g);
            }

            void main() {
                vec2 uv = gl_FragCoord.xy / u_resolution.xy;
                vec2 p = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);

                // Оптическое преломление с учетом наклона гироскопа
                vec2 tilt = u_gyro * 0.08;
                float wave = snoise(p * 2.2 + vec2(u_time * 0.12) + tilt);

                // Хроматическая аберрация (разделение каналов спектра R, G, B)
                float ior = 1.48; // Коэффициент преломления оптического стекла
                vec2 refrR = uv + (wave * 0.012) * (1.0 / ior);
                vec2 refrG = uv + (wave * 0.016) * (1.0 / ior);
                vec2 refrB = uv + (wave * 0.020) * (1.0 / ior);

                // Динамическая каустика жидкого света
                float caustics = pow(max(0.0, wave), 3.0) * 0.18;

                // Базовый глубокий цвет стекла Telegram Dark OLED
                vec3 baseColor = vec3(0.055, 0.086, 0.129); // #0e1621
                vec3 liquidLight = vec3(0.165, 0.670, 0.933); // #2aabee

                vec3 col;
                col.r = baseColor.r + caustics * liquidLight.r + refrR.x * 0.03;
                col.g = baseColor.g + caustics * liquidLight.g + refrG.y * 0.03;
                col.b = baseColor.b + caustics * liquidLight.b + refrB.x * 0.04;

                // Блик по закону Френеля на краях экрана
                float fresnel = pow(1.0 - max(0.0, dot(vec3(0,0,1), vec3(p, 1.0))), 2.5);
                col += vec3(0.2, 0.6, 1.0) * fresnel * 0.12;

                gl_FragColor = vec4(col, 1.0);
            }
        `;

        const p = this.gl.createProgram();
        const vShader = this.compileShader(this.gl.VERTEX_SHADER, vs);
        const fShader = this.compileShader(this.gl.FRAGMENT_SHADER, fs);
        this.gl.attachShader(p, vShader);
        this.gl.attachShader(p, fShader);
        this.gl.linkProgram(p);
        this.gl.useProgram(p);
        this.prog = p;

        this.uRes = this.gl.getUniformLocation(p, "u_resolution");
        this.uTime = this.gl.getUniformLocation(p, "u_time");
        this.uGyro = this.gl.getUniformLocation(p, "u_gyro");
        this.uTouch = this.gl.getUniformLocation(p, "u_touch");
    }

    compileShader(type, src) {
        const s = this.gl.createShader(type);
        this.gl.shaderSource(s, src);
        this.gl.compileShader(s);
        return s;
    }

    initBuffers() {
        const b = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, b);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,  1, -1, -1,  1,
            -1,  1,  1, -1,  1,  1
        ]), this.gl.STATIC_DRAW);

        const pos = this.gl.getAttribLocation(this.prog, "position");
        this.gl.enableVertexAttribArray(pos);
        this.gl.vertexAttribPointer(pos, 2, this.gl.FLOAT, false, 0, 0);
    }

    render(ts) {
        this.time = ts * 0.001;
        this.gl.uniform2f(this.uRes, this.canvas.width, this.canvas.height);
        this.gl.uniform1f(this.uTime, this.time);
        this.gl.uniform2f(this.uGyro, this.gyro.x, this.gyro.y);
        this.gl.uniform3f(this.uTouch, this.touch.x, this.touch.y, this.touch.active);
        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
        requestAnimationFrame(this.render);
    }
}
window.LiquidGlassEngine = LiquidGlassEngine;
