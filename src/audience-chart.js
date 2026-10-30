import { MeshCanvas } from './mesh-canvas.js';

const TAU = Math.PI * 2;
const clamp = value => Math.max(0, Math.min(1, value));
const mix = (a, b, amount) => a + (b - a) * amount;

function shade(color, amount = 1, highlight = 0) {
  return `rgb(${color.map(channel => Math.round(Math.min(255, channel * amount + (255 - channel) * highlight))).join(',')})`;
}

function contains(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function mountAudienceChart(figure, { reducedMotion, getProgress }) {
  const canvas = figure.querySelector('canvas');
  const mesh = new MeshCanvas(canvas);
  if (!mesh.gl) return;
  const section = figure.closest('.audience');
  const legend = section.querySelector('.audience-programs');
  const value = figure.querySelector('[data-chart-value]');
  const label = figure.querySelector('[data-chart-label]');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  let angle = -Math.PI / 2;
  const programs = [...legend.querySelectorAll('dl > div')].map((row, index) => {
    const term = row.querySelector('dt');
    const share = Number(row.querySelector('dd').textContent.replace('%', ''));
    const name = term.textContent;
    const hex = getComputedStyle(row).getPropertyValue('--program-color').trim().slice(1);
    const color = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
    const start = angle;
    angle += share / 100 * TAU;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'program-select';
    button.textContent = name;
    button.setAttribute('aria-pressed', 'false');
    row.querySelector('dd').id = `program-share-${index}`;
    button.setAttribute('aria-describedby', `program-share-${index}`);
    term.replaceChildren(button);
    return { row, button, share, name, color, start, end: angle };
  });
  const overview = label.textContent.replace(/\s+/g, ' ').trim();
  const lifts = programs.map(() => 0);
  let width = 1, height = 1, frame = 0, last = 0, visible = false;
  let hovered = -1, focused = -1, selected = -1, active = -1;
  let pointer = { x: 0, y: 0 }, target = { x: 0, y: 0 };
  let hitRegions = [];

  function syncSelection() {
    const next = hovered >= 0 ? hovered : focused >= 0 ? focused : selected;
    if (next !== active) {
      active = next;
      value.textContent = active < 0 ? '50' : String(programs[active].share);
      label.textContent = active < 0 ? overview : programs[active].name;
    }
    programs.forEach((program, index) => {
      program.row.classList.toggle('is-active', index === active);
      program.button.setAttribute('aria-pressed', String(index === selected));
    });
    wake();
  }

  function select(index) {
    selected = selected === index ? -1 : index;
    hovered = focused = -1;
    syncSelection();
  }

  programs.forEach((program, index) => {
    program.button.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'mouse' || !finePointer.matches) return;
      hovered = index;
      syncSelection();
    });
    program.button.addEventListener('pointerleave', () => { hovered = -1; syncSelection(); });
    program.button.addEventListener('focus', () => { focused = index; syncSelection(); });
    program.button.addEventListener('blur', () => { focused = -1; syncSelection(); });
    program.button.addEventListener('click', () => select(index));
  });
  section.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    selected = hovered = focused = -1;
    syncSelection();
  });

  function hit(event) {
    const bounds = canvas.getBoundingClientRect();
    const point = [event.clientX - bounds.left, event.clientY - bounds.top];
    // The resting footprint remains a target while a slice lifts away from the
    // pointer, preventing the highlight from flickering along its inner edge.
    return hitRegions.findLastIndex(region => contains(point, region.raised) || contains(point, region.resting));
  }
  canvas.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || !finePointer.matches) return;
    const bounds = canvas.getBoundingClientRect();
    target = { x: (event.clientX - bounds.left) / width * 2 - 1, y: (event.clientY - bounds.top) / height * 2 - 1 };
    hovered = hit(event);
    syncSelection();
  }, { passive: true });
  canvas.addEventListener('pointerleave', () => {
    hovered = -1;
    target = { x: 0, y: 0 };
    syncSelection();
  });
  canvas.addEventListener('click', event => select(hit(event)));

  function draw(progress) {
    const entrance = progress * progress * (3 - 2 * progress);
    const scale = width / 360;
    const yaw = -.12 * (1 - entrance) + pointer.x * .075;
    const elevation = .83 + entrance * .18 + pointer.y * .045;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), ce = Math.cos(elevation), se = Math.sin(elevation);
    const center = [width * .5, height * .45 + (1 - entrance) * 18 * scale];
    const project = ([x, y, z]) => {
      const depth = x * sy + y * cy;
      return [center[0] + (x * cy - y * sy) * scale, center[1] + (depth * se - z * ce) * scale, depth * ce + z * se];
    };
    const faces = [];
    hitRegions = [];
    function face(points, fill) {
      const projected = points.map(project);
      faces.push({ points: projected, fill: Array.isArray(fill) ? fill[0] : fill, colors: Array.isArray(fill) ? fill : undefined });
    }
    programs.forEach((program, index) => {
      const middle = (program.start + program.end) / 2;
      const spread = (1 - entrance) * 14;
      const lift = lifts[index];
      const offset = spread + lift * 9;
      const baseZ = (1 - entrance) * 8 + lift * 15;
      const point = (radius, theta, z, distance = offset, raised = baseZ) => [
        Math.cos(theta) * radius + Math.cos(middle) * distance,
        Math.sin(theta) * radius + Math.sin(middle) * distance,
        z + raised
      ];
      const start = program.start + .009, end = program.end - .009;
      const steps = Math.ceil((end - start) / TAU * 100);
      const focus = active < 0 || active === index ? 1 : .76;
      const outer = [], inner = [], restOuter = [], restInner = [];
      for (let step = 0; step <= steps; step++) {
        const theta = mix(start, end, step / steps);
        outer.push(project(point(140, theta, 28)));
        inner.push(project(point(96, theta, 28)));
        restOuter.push(project(point(142, theta, 28, spread, (1 - entrance) * 8)));
        restInner.push(project(point(94, theta, 28, spread, (1 - entrance) * 8)));
        if (step === steps) continue;
        const next = mix(start, end, (step + 1) / steps);
        const normal = Math.cos(theta) * -.5 + Math.sin(theta) * -.3;
        const top = [point(140, theta, 28), point(140, next, 28), point(96, next, 28), point(96, theta, 28)];
        face(top, top.map(([x, y]) => shade(program.color, focus * (.96 - x * .00055 - y * .00045), .04)));
        face([point(142, theta, 26), point(142, next, 26), point(140, next, 28), point(140, theta, 28)], shade(program.color, focus * (.92 + normal * .18), .12));
        face([point(142, theta, 0), point(142, next, 0), point(142, next, 26), point(142, theta, 26)], shade(program.color, focus * (.4 + normal * .15)));
        face([point(96, theta, 28), point(96, next, 28), point(94, next, 26), point(94, theta, 26)], shade(program.color, focus * .55));
        face([point(94, theta, 26), point(94, next, 26), point(94, next, 0), point(94, theta, 0)], shade(program.color, focus * (.28 - normal * .1)));
      }
      for (const theta of [start, end]) {
        face([point(142, theta, 0), point(94, theta, 0), point(94, theta, 26), point(96, theta, 28), point(140, theta, 28), point(142, theta, 26)], shade(program.color, focus * .4));
      }
      hitRegions.push({ raised: [...outer, ...inner.reverse()], resting: [...restOuter, ...restInner.reverse()] });
    });
    mesh.render(faces);
    figure.classList.add('is-interactive');
    legend.classList.add('is-interactive');
  }

  function render(now) {
    frame = 0;
    if (!visible || document.hidden || mesh.lost) return;
    const dt = Math.min((now - last) / 1000, .04) || .016;
    last = now;
    const amount = reducedMotion.matches ? 1 : 1 - Math.exp(-dt * 15);
    const aim = reducedMotion.matches ? { x: 0, y: 0 } : target;
    pointer.x = mix(pointer.x, aim.x, amount);
    pointer.y = mix(pointer.y, aim.y, amount);
    lifts.forEach((lift, index) => { lifts[index] = mix(lift, !reducedMotion.matches && active === index ? 1 : 0, amount); });
    draw(reducedMotion.matches ? 1 : clamp(getProgress()));
    const moving = Math.abs(pointer.x - aim.x) + Math.abs(pointer.y - aim.y) > .001 || lifts.some((lift, index) => Math.abs(lift - (active === index && !reducedMotion.matches ? 1 : 0)) > .001);
    if (moving && !reducedMotion.matches) frame = requestAnimationFrame(render);
  }
  function wake() { if (!frame && visible && !document.hidden) frame = requestAnimationFrame(render); }
  function stop() { cancelAnimationFrame(frame); frame = 0; last = 0; }
  mesh.onLost = () => { stop(); figure.classList.remove('is-interactive'); };
  mesh.onRestore = () => { mesh.resize(width, height); wake(); };
  const visibility = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) wake(); else stop();
  }, { rootMargin: '80px' });
  visibility.observe(figure);
  const resize = new ResizeObserver(() => {
    const bounds = canvas.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    mesh.resize(width, height);
    wake();
  });
  resize.observe(figure);
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : wake());
  reducedMotion.addEventListener('change', () => { stop(); wake(); });
  return { wake };
}
