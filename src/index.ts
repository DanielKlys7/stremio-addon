import app from "./app";

const port = Number(process.env.PORT) || 7000;
app.listen(port, () => {
  console.log(`Addon na porcie ${port}`);
  console.log(`Konfiguracja: http://127.0.0.1:${port}/configure`);
});
