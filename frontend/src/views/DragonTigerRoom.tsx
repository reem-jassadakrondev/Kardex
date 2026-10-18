import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/** Placeholder while the phase 1 color grid is built (see README → เฟส 1). */
export function DragonTigerRoom() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
      <div className="mx-auto max-w-xl rounded-xl border border-zinc-200 bg-white p-6 text-center">
        <p className="text-lg font-semibold">เสือมังกร</p>
        <p className="mt-2 text-sm text-zinc-500">กำลังพัฒนาตารางสถิติสีและอัตราการออก (เฟส 1)</p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-6 inline-flex items-center rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:border-zinc-400"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          กลับ Lobby
        </button>
      </div>
    </div>
  );
}
