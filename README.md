# ForgeHacks 2027

UBC BizTech's ForgeHacks website for February 26–28, 2027: 26 hours, 100 teams and 400 participants.

Plain HTML, CSS and JavaScript with native WebGL illustrations. No runtime dependencies or environment variables are required.

## Run locally

Requires Node.js 20 or newer. No dependency installation is needed.

```sh
npm run dev
```

Open `http://localhost:4173`. After editing files, run `npm run build` and refresh.

## Deploy

```sh
npm run check
npm run build
```

For Vercel, import `ubc-biztech/forgehacks-web` with the repository root as the project directory and `main` as the production branch. The included `vercel.json` selects the Other framework preset, runs the checks and build, and publishes `dist/`.

For other static hosts, use build command `npm run build` and publish `dist/`.

## Edit

- `src/index.html`: content and structure.
- `src/styles.css`: layout, typography and responsive styles.
- `src/main.js`: navigation, scroll coordination and accessible interactions.
- `src/hardware.js`: wireframe arm, prototype assembly and partnership illustrations.
- `src/audience-chart.js`: projected 3D participant chart and program selection.
- `src/mesh-canvas.js`: shared depth-tested surfaces and antialiased strokes.
- `public/assets/`: local Figma artwork and the Funnel Display font.

Artwork and event content come from the ForgeHacks Figma partnership package. The wordmark keeps the final S on the baseline. February 26–28, 2027 is the confirmed date; participant and team counts are projections. BizTech membership and reach figures describe the club, not prior ForgeHacks attendance. No unconfirmed sponsor logos, registration form or analytics are included.

The participant profile uses the October 30, 2026 planning estimate: Electrical & Computer Engineering 30%, Mechanical Engineering and related disciplines 20%, Computer Science 40%, Commerce and other programs 10%. Year-of-study estimates are 15%, 25%, 30%, 25% and 5% from first year through graduate students. The chart groups the two engineering categories as 50%; it does not count Computer Science as engineering. The partnership PDF is not hosted on the website.

## Motion and performance

The illustrations and chart share a native WebGL renderer with per-pixel depth testing and antialiased strokes. The arm uses connected joints to pick up, carry and place a component in a continuous 20-second round trip. The scroll assembly seats the board, chip and display in sequence, then powers its display. Section entrances run once.

Scenes pause outside the viewport and in hidden tabs. Stationary charts and illustrations rest between interactions. Animation follows the browser's frame timing; pixel density is capped at 2. Reduced-motion preferences disable movement and section entrances. No runtime library is required. All event information, links and native FAQ disclosures work without JavaScript. Original Figma artwork and the SVG chart remain as fallbacks if WebGL is unavailable.

The participant chart assembles on scroll. Hovering, tapping or keyboard-selecting a program highlights its slice; selecting it again or pressing Escape restores the overview. Pointer tilt and slice movement settle to a still frame, and reduced motion disables both. Program percentages remain available as text, with an SVG chart when JavaScript or canvas is unavailable.
