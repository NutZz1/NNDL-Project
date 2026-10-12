import { useEffect, useState } from 'react';
import { api } from '../../services/api';

// Badge counts for the sidebar, refreshed every 30 s while the workspace is open
export default function useNotifications(refreshKey = 0) {
  const [counts, setCounts] = useState(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const c = await api.notifications();
        if (alive) setCounts(c);
      } catch {
        /* badges are best effort */
      }
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [refreshKey]);
  return counts;
}
