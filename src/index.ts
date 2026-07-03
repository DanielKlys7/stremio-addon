import app, { SECRET } from "./app";

const port = Number(process.env.PORT) || 7000;
app.listen(port, () => {
  console.log(`Addon na porcie ${port}`);
  console.log(`Instalka: http://127.0.0.1:${port}/${SECRET}/manifest.json`);
});
