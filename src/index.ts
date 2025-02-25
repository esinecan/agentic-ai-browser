import dotenv from "dotenv";
import { browserGraph } from "./automation.js";

dotenv.config();

(async () => {
  try {
    await browserGraph.start("start");
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
})();