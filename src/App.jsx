import { Routes, Route } from "react-router-dom";
import SignalsPage from "./pages/SignalsPage";
import StoryboardPage from "./pages/StoryboardPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SignalsPage />} />
      <Route path="/storyboard/:id" element={<StoryboardPage />} />
    </Routes>
  );
}
