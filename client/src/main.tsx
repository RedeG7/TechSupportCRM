import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { Chart as ChartJS, registerables } from 'chart.js';

// Register Chart.js components
ChartJS.register(...registerables);

createRoot(document.getElementById("root")!).render(<App />);
