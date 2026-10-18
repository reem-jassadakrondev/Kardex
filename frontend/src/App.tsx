import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { HomeLobby } from './views/HomeLobby';
import { DragonTigerRoom } from './views/DragonTigerRoom';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeLobby />} />
        <Route path="/dragon-tiger" element={<DragonTigerRoom />} />
      </Routes>
    </BrowserRouter>
  );
}
