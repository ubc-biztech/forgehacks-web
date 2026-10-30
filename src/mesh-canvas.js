const COLORS = new Map();

function color(value, solid = false) {
  const key = value + (solid ? ':solid' : '');
  if (COLORS.has(key)) return COLORS.get(key);
  let rgba;
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    rgba = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
    rgba.push(1);
  } else {
    rgba = value.match(/[\d.]+/g).map(Number);
    rgba = [rgba[0] / 255, rgba[1] / 255, rgba[2] / 255, rgba[3] ?? 1];
  }
  if (solid) rgba = [...rgba.slice(0, 3).map(channel => channel * rgba[3] + 8 / 255 * (1 - rgba[3])), 1];
  if (COLORS.size > 4096) COLORS.clear();
  COLORS.set(key, rgba);
  return rgba;
}

// Depth-test each fragment instead of sorting whole faces. Crossing parts keep
// their correct occlusion; screen-space stroke coverage prevents thin-line shimmer.
export class MeshCanvas {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true });
    this.lost = false;
    this.storage = new Float32Array(65536);
    if (!this.gl) return;
    this.setup();
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      this.lost = true;
      this.onLost?.();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.setup();
      this.lost = false;
      this.onRestore?.();
    });
  }

  setup() {
    const gl = this.gl;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, `
      attribute vec3 position;
      attribute vec4 color;
      attribute vec2 coverage;
      varying vec4 tint;
      varying vec2 edge;
      void main() {
        gl_Position = vec4(position, 1.0);
        tint = color;
        edge = coverage;
      }
    `);
    const fragment = compile(gl.FRAGMENT_SHADER, `
      precision mediump float;
      varying vec4 tint;
      varying vec2 edge;
      void main() {
        float alpha = edge.y < 0.0 ? 1.0 : 1.0 - smoothstep(edge.y, edge.y + 0.7, abs(edge.x));
        float opacity = tint.a * alpha;
        gl_FragColor = vec4(tint.rgb * opacity, opacity);
      }
    `);
    this.program = gl.createProgram();
    gl.attachShader(this.program, vertex);
    gl.attachShader(this.program, fragment);
    gl.linkProgram(this.program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
    this.buffer = gl.createBuffer();
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    for (const [name, size, offset] of [['position', 3, 0], ['color', 4, 12], ['coverage', 2, 28]]) {
      const location = gl.getAttribLocation(this.program, name);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 36, offset);
    }
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    const density = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * density);
    this.canvas.height = Math.round(height * density);
    this.gl?.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  render(surfaces) {
    const gl = this.gl;
    if (!gl || this.lost || !this.width || !this.height) return;
    let cursor = 0;
    const vertex = (point, tint, edge = 0, halfWidth = -1, bias = 0) => {
      if (cursor + 9 > this.storage.length) {
        const grown = new Float32Array(this.storage.length * 2);
        grown.set(this.storage);
        this.storage = grown;
      }
      const data = this.storage;
      data[cursor++] = point[0] / this.width * 2 - 1;
      data[cursor++] = 1 - point[1] / this.height * 2;
      data[cursor++] = -point[2] / 600 - bias;
      data[cursor++] = tint[0];
      data[cursor++] = tint[1];
      data[cursor++] = tint[2];
      data[cursor++] = tint[3];
      data[cursor++] = edge;
      data[cursor++] = halfWidth;
    };
    for (const surface of surfaces) {
      if (!surface.fill) continue;
      const tint = color(surface.fill, true);
      const colors = surface.colors?.map(value => color(value, true));
      for (let i = 1; i < surface.points.length - 1; i++) {
        vertex(surface.points[0], colors?.[0] || tint);
        vertex(surface.points[i], colors?.[i] || tint);
        vertex(surface.points[i + 1], colors?.[i + 1] || tint);
      }
    }
    const filled = cursor / 9;
    for (const surface of surfaces) {
      if (!surface.stroke) continue;
      const tint = color(surface.stroke);
      const points = surface.points;
      const half = Math.max(surface.width || .8, .75) / 2, outer = half + .7;
      const segment = (a, b) => {
        const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
        if (length < .001) return;
        const nx = -dy / length * outer, ny = dx / length * outer;
        const corners = [[a[0]+nx,a[1]+ny,a[2]],[a[0]-nx,a[1]-ny,a[2]],[b[0]-nx,b[1]-ny,b[2]],[b[0]+nx,b[1]+ny,b[2]]];
        for (const index of [0, 1, 2, 0, 2, 3]) vertex(corners[index], tint, index === 0 || index === 3 ? outer : -outer, half, .0004);
      };
      const count = points.length - (surface.close ? 0 : 1);
      for (let i = 0; i < count; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        if (!surface.dash?.length) { segment(a, b); continue; }
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const [dash, gap] = surface.dash;
        for (let at = 0; at < length; at += dash + gap) {
          const start = at / length, end = Math.min(at + dash, length) / length;
          segment(a.map((value, index) => value + (b[index] - value) * start), a.map((value, index) => value + (b[index] - value) * end));
        }
      }
    }
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.bufferData(gl.ARRAY_BUFFER, this.storage.subarray(0, cursor), gl.DYNAMIC_DRAW);
    gl.disable(gl.BLEND);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1, 1);
    gl.drawArrays(gl.TRIANGLES, 0, filled);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, filled, cursor / 9 - filled);
  }
}
