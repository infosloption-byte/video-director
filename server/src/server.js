import "dotenv/config";
import app from "./app.js";
import { startSignalScraper } from "./jobs/scrapeSignals.js";

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Helix server listening on http://localhost:${PORT}`);
  startSignalScraper();
});
