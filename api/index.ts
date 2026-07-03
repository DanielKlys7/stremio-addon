// Punkt wejścia dla Vercel (serverless). Eksportuje aplikację Express jako
// handler funkcji — Vercel woła ją dla każdego requestu (patrz vercel.json).
import app from "../src/app";

export default app;
