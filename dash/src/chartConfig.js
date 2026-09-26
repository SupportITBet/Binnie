import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    ArcElement,
    BarElement,
    LineElement,
    PointElement,
    Filler,
    Title,
    Tooltip,
    Legend
  } from 'chart.js';

  // Enregistrement global de tous les composants nécessaires
  ChartJS.register(
    CategoryScale,
    LinearScale,
    ArcElement,
    BarElement,
    LineElement,
    PointElement,
    Filler,
    Title,
    Tooltip,
    Legend
  );