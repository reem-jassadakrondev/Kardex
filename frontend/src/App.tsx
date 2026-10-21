import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { HomeLobby } from './views/HomeLobby';
import { TableRoom } from './views/TableRoom';

/** Remounts the table page per table so no state leaks between tables. */
function TableRoute() {
  const { code = '' } = useParams();
  return <TableRoom key={code} code={code} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeLobby />} />
        <Route path="/t/:code" element={<TableRoute />} />
        {/* v1.0 link saved on the iPads' home screens */}
        <Route path="/dragon-tiger" element={<Navigate to="/t/dt-1" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
