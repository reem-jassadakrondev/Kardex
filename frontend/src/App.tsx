import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { HomeLobby } from './views/HomeLobby';
import { BaccaratRoom } from './views/BaccaratRoom';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeLobby />} />
        <Route path="/baccarat" element={<BaccaratRoom />} />
      </Routes>
    </BrowserRouter>
  );
}
