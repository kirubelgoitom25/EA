import { useCallback, useState } from "react";

// Several forms on one page each report whether they hold unsaved text. The page is
// "dirty" while any of them does.
export default function useDirtyMap() {
  const [map, setMap] = useState({});
  const setDirty = useCallback((key, value) => {
    setMap((current) => {
      if (Boolean(current[key]) === value) return current;
      return { ...current, [key]: value };
    });
  }, []);
  return { dirty: Object.values(map).some(Boolean), setDirty };
}
