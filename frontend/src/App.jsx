import { Routes, Route } from "react-router-dom";
import SignalsPage from "./pages/SignalsPage";
import ResearchPage from "./pages/ResearchPage";
import StoryboardPage from "./pages/StoryboardPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SignalsPage />} />
      <Route path="/research/:id" element={<ResearchPage />} />
      <Route path="/storyboard/:id" element={<StoryboardPage />} />
    </Routes>
  );
}
