import { mountHardware, mountFigure } from './hardware.js';
import { mountAudienceChart } from './audience-chart.js';

const header = document.querySelector('.site-header');
const menu = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#navigation');
const compact = matchMedia('(max-width: 640px)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const pinnedMobile = matchMedia('(max-width: 640px) and (min-height: 560px) and (prefers-reduced-motion: no-preference)');
const story = document.querySelector('.build-story');
const storyPin = document.querySelector('.story-pin');
const steps = [...document.querySelectorAll('.build-step')];
const progressBar = document.querySelector('.assembly-progress span');
const hardwareScenes = [];
const audienceFigure = document.querySelector('.audience-chart');
let storyProgress = 0;
let heroProgress = 0;
let audienceProgress = 0;
let previousScroll = scrollY;
let scrollFrame = 0;
story.classList.add('motion-ready');

function setMenu(open) {
  menu.setAttribute('aria-expanded', String(open));
  header.classList.toggle('menu-open', open);
  header.classList.remove('header-away');
}
menu.hidden = false;
header.classList.add('menu-ready');
menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
navigation.addEventListener('click', event => { if (event.target.closest('a')) setMenu(false); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
    setMenu(false);
    menu.focus();
  }
});
document.addEventListener('click', event => { if (!header.contains(event.target)) setMenu(false); });
compact.addEventListener('change', () => setMenu(false));
header.addEventListener('focusin', () => header.classList.remove('header-away'));

function updateScroll() {
  scrollFrame = 0;
  const current = scrollY;
  const delta = current - previousScroll;
  const storyBounds = story.getBoundingClientRect();
  const keepNavigation = pinnedMobile.matches && storyBounds.top < innerHeight && storyBounds.bottom > 0;
  if (keepNavigation) header.classList.remove('header-away');
  if (Math.abs(delta) > 6 || current < 100) {
    const canHide = current > 160 && delta > 0 && !keepNavigation && !header.contains(document.activeElement) && menu.getAttribute('aria-expanded') !== 'true';
    header.classList.toggle('header-away', canHide);
    previousScroll = current;
  }
  if (pinnedMobile.matches) {
    const pinHeight = storyPin.getBoundingClientRect().height;
    const travel = Math.max(1, storyBounds.height - pinHeight);
    const position = (78 - storyBounds.top) / travel;
    // Hold the opening and completed views before the pinned scene releases.
    storyProgress = Math.max(0, Math.min(1, (position - .1) / .8));
  } else {
    const first = steps[0].getBoundingClientRect();
    const last = steps[steps.length - 1].getBoundingClientRect();
    const focusLine = innerHeight * (compact.matches ? .7 : .55);
    const firstCenter = first.top + first.height / 2;
    const lastCenter = last.top + last.height / 2;
    storyProgress = Math.max(0, Math.min(1, (focusLine - firstCenter) / (lastCenter - firstCenter)));
  }
  heroProgress = Math.min(1, current / innerHeight);
  const chartBounds = audienceFigure.getBoundingClientRect();
  audienceProgress = Math.max(0, Math.min(1, (innerHeight * .92 - chartBounds.top) / Math.min(innerHeight * .64, chartBounds.height * 1.15)));
  progressBar.style.transform = 'scaleX(' + storyProgress + ')';
  const activeStep = Math.round(storyProgress * (steps.length - 1));
  steps.forEach((step, index) => step.classList.toggle('is-current', index === activeStep));
  hardwareScenes.forEach(scene => scene?.wake());
}
function scheduleScroll() { if (!scrollFrame) scrollFrame=requestAnimationFrame(updateScroll); }
addEventListener('scroll',scheduleScroll,{passive:true});
addEventListener('resize',scheduleScroll);
addEventListener('pageshow',scheduleScroll);
pinnedMobile.addEventListener('change',scheduleScroll);
document.fonts.ready.then(scheduleScroll);
updateScroll();

// Each scene owns its visibility, pixel density and reduced-motion fallback.
document.querySelectorAll('.hardware-canvas').forEach(canvas => {
  hardwareScenes.push(mountHardware(canvas, { reducedMotion, getProgress: () => canvas.dataset.scene === 'arm' ? heroProgress : storyProgress }));
});
document.querySelectorAll('.partner-figure').forEach(element=>mountFigure(element,reducedMotion));
hardwareScenes.push(mountAudienceChart(audienceFigure, { reducedMotion, getProgress: () => audienceProgress }));

const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('in-view');
    revealObserver.unobserve(entry.target);
  });
}, {threshold: .2});
document.querySelectorAll('.team-photo').forEach(element=>revealObserver.observe(element));

// Reveal each section once, without hiding its content before JavaScript runs.
const entrances = new Set();
const sectionObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    sectionObserver.unobserve(entry.target);
    if (reducedMotion.matches) continue;
    [...entry.target.children].forEach((element, index) => {
      const animation = element.animate(
        [{ opacity: .3, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }],
        { duration: 650, delay: index * 85, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }
      );
      entrances.add(animation);
      animation.onfinish = () => entrances.delete(animation);
    });
  }
}, { threshold: .2 });
document.querySelectorAll('.section-intro,.audience-heading,.organizer-copy,.contact-inner').forEach(element => sectionObserver.observe(element));
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) { entrances.forEach(animation => animation.cancel()); entrances.clear(); }
});

// Native details retain keyboard support and work with JavaScript disabled.
document.querySelectorAll('.faq details').forEach(details=>{
  details.addEventListener('toggle',()=>{
    if(details.open&&!reducedMotion.matches) details.querySelector('div').animate(
      [{opacity:.45,transform:'translateY(-5px)'},{opacity:1,transform:'translateY(0)'}],
      {duration:220,easing:'ease-out'}
    );
  });
});
