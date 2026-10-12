// Launchpad's API on Vercel: the same Express app as `npm run dev`, compiled
// to backend/dist during the build, in public mode (see backend/src/app.ts).
import { createApp } from "../backend/dist/app.js";

const { app } = createApp();

export default app;
